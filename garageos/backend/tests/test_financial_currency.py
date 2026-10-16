"""Money projections keep UZS and legacy USD separate without an exchange rate."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models import Brand, Customer, ServiceCenter, Vehicle, VehicleModel
from app.models.appointment import Appointment
from app.models.invoice import Invoice, Payment
from app.models.ledger import LedgerEntry
from app.models.service_record import ServiceRecord
from app.repositories.unit_of_work import UnitOfWork
from app.services.analytics import AnalyticsService
from app.services.customer_portal_service import CustomerPortalService
from app.services.customer_service import CustomerService
from app.services.financial_service import FinancialService
from app.services.invoice_service import InvoiceService
from app.services.vehicle_health_service import VehicleHealthService
from app.services.vehicle_intelligence_service import VehicleIntelligenceService


async def _tenant(session):
    center = ServiceCenter(name="Currency test", email=f"{uuid.uuid4().hex}@test.local")
    session.add(center)
    await session.flush()
    customer = Customer(service_center_id=center.id, full_name="Currency customer")
    brand = Brand(name=f"Currency {uuid.uuid4().hex[:8]}")
    session.add_all([customer, brand])
    await session.flush()
    model = VehicleModel(brand_id=brand.id, name="Currency car", year_start=2015)
    session.add(model)
    await session.flush()
    vehicle = Vehicle(service_center_id=center.id, customer_id=customer.id,
                      vehicle_model_id=model.id, year=2020, current_km=10000)
    session.add(vehicle)
    await session.flush()
    uow = UnitOfWork(service_center_id=center.id)
    uow.session = session
    return uow, customer, vehicle


async def _invoice(uow, customer, vehicle, amount, currency, appointment_id=None):
    doc = await InvoiceService(uow).create(
        kind="invoice", customer_id=customer.id, vehicle_id=vehicle.id,
        appointment_id=appointment_id, tax_rate=0,
        line_items=[{"kind": "labor", "description": "Diagnostics", "quantity": 1,
                     "unit_price": amount}],
    )
    # New documents are UZS. Model an existing USD document without changing it
    # to UZS or applying an invented exchange rate.
    invoice = await uow.session.get(Invoice, uuid.UUID(doc["id"]))
    invoice.currency = currency
    await uow.session.flush()
    return doc


async def test_customer_and_portal_totals_preserve_each_currency(session):
    uow, customer, vehicle = await _tenant(session)
    usd = await _invoice(uow, customer, vehicle, 100, "USD")
    uzs = await _invoice(uow, customer, vehicle, 250000, "UZS")
    await InvoiceService(uow).record_payment(uuid.UUID(usd["id"]), amount=25, method="card")
    await InvoiceService(uow).record_payment(uuid.UUID(uzs["id"]), amount=50000, method="cash")
    # Windows' clock can give two sequential requests the same timestamp.
    # Set a known ordering to verify the latest payment's currency reliably.
    for payment in (await session.execute(select(Payment).where(
            Payment.service_center_id == uow.service_center_id))).scalars().all():
        if payment.invoice_id == uuid.UUID(usd["id"]):
            payment.received_at -= timedelta(minutes=1)
    await session.flush()

    summary = await FinancialService(uow).customer_summary(customer.id)
    assert summary["by_currency"]["USD"]["outstanding"] == 75
    assert summary["by_currency"]["UZS"]["outstanding"] == 200000
    assert summary["by_currency"]["USD"]["lifetime_spend"] == 25
    assert summary["by_currency"]["UZS"]["lifetime_spend"] == 50000
    assert summary["last_payment"]["currency"] == "UZS"
    assert {p["currency"] for p in summary["payments"]} == {"USD", "UZS"}

    portal = CustomerPortalService(uow, customer)
    billing = await portal.billing()
    assert billing.has_balance
    assert billing.balances_by_currency == {"USD": 75, "UZS": 200000}
    assert {d.currency for d in billing.invoices} == {"USD", "UZS"}
    assert {r.currency for r in billing.receipts} == {"USD", "UZS"}
    card = await portal._outstanding_card()
    assert card["balances_by_currency"] == billing.balances_by_currency


async def test_reports_filter_currency_and_keep_legacy_ledger_links(session):
    uow, customer, vehicle = await _tenant(session)
    usd = await _invoice(uow, customer, vehicle, 100, "USD")
    uzs = await _invoice(uow, customer, vehicle, 250000, "UZS")
    await InvoiceService(uow).record_payment(uuid.UUID(usd["id"]), amount=25, method="card")
    await InvoiceService(uow).record_payment(uuid.UUID(uzs["id"]), amount=50000, method="cash")
    # Old linked ledger rows defaulted to USD even for a UZS invoice. Its invoice
    # currency is authoritative, so an existing local DB needs no relabeling.
    entries = (await session.execute(select(LedgerEntry).where(
        LedgerEntry.service_center_id == uow.service_center_id))).scalars().all()
    for entry in entries:
        entry.currency = "USD"
    await session.flush()

    foreign_uow, foreign_customer, foreign_vehicle = await _tenant(session)
    await _invoice(foreign_uow, foreign_customer, foreign_vehicle, 999999, "UZS")

    for currency, expected in [("UZS", (250000, 50000, 200000)), ("USD", (100, 25, 75))]:
        report = await AnalyticsService(uow).report("commercial", currency=currency)
        values = {k["key"]: k["value"] for group in report["groups"] for k in group["kpis"]}
        assert report["currency"] == currency
        assert report["available_currencies"] == ["USD", "UZS"]
        assert (values["revenue"], values["cash"], values["outstanding"]) == expected
        assert report["reconciliation"]["outstanding"] == expected[2]
        assert all(check["ok"] for check in report["reconciliation"]["checks"])
        assert values["refunds"] == 0


async def test_customer_history_infers_linked_invoice_currency(session):
    uow, customer, vehicle = await _tenant(session)
    now = datetime.now(timezone.utc)
    appointment = Appointment(service_center_id=uow.service_center_id,
        customer_id=customer.id, vehicle_id=vehicle.id, status="completed",
        appointment_date=now, appointment_time="10:00", mechanic_name="Mechanic")
    session.add(appointment)
    await session.flush()
    session.add_all([
        ServiceRecord(service_center_id=uow.service_center_id, vehicle_id=vehicle.id,
            appointment_id=appointment.id, service_type="Diagnostics", performed_km=10000,
            performed_date=now, cost=250),  # historic bare amount must not become 250 UZS
        ServiceRecord(service_center_id=uow.service_center_id, vehicle_id=vehicle.id,
            service_type="Legacy service", performed_km=9000, performed_date=now, cost=50),
    ])
    await session.flush()
    await _invoice(uow, customer, vehicle, 250000, "UZS", appointment.id)
    profile = await CustomerService(uow).get_360(customer.id)
    assert profile["stats"]["lifetime_value_by_currency"] == {"USD": 50, "UZS": 250000}
    assert profile["stats"]["outstanding_by_currency"] == {"UZS": 250000}
    assert {e["currency"] for e in profile["timeline"] if e["type"] == "service"} == {"USD", "UZS"}
    assert profile["appointments"][0]["currency"] == "UZS"
    assert profile["appointments"][0]["total_cost"] == 250000
    listing = await CustomerService(uow).list_360()
    assert listing["items"][0]["lifetime_value_by_currency"] == {"USD": 50, "UZS": 250000}
    passport = await VehicleHealthService(uow).get_passport(vehicle.id)
    assert passport["vitals"]["total_spent_by_currency"] == {"USD": 50, "UZS": 250000}
    assert {h["currency"] for h in passport["history"]} == {"USD", "UZS"}
    timeline = await VehicleHealthService(uow).get_timeline(vehicle.id)
    assert {e["currency"] for e in timeline["events"] if e["type"] == "service"} == {"USD", "UZS"}


async def test_fresh_service_with_no_recorded_cost_uses_its_final_invoice(session):
    uow, customer, vehicle = await _tenant(session)
    now = datetime.now(timezone.utc)
    appointment = Appointment(service_center_id=uow.service_center_id,
        customer_id=customer.id, vehicle_id=vehicle.id, status="completed",
        appointment_date=now, appointment_time="11:00", mechanic_name="Mechanic")
    session.add(appointment)
    await session.flush()
    session.add(ServiceRecord(service_center_id=uow.service_center_id,
        vehicle_id=vehicle.id, appointment_id=appointment.id, service_type="Diagnostics",
        performed_km=10000, performed_date=now, cost=None))
    await session.flush()
    await _invoice(uow, customer, vehicle, 250000, "UZS", appointment.id)
    profile = await CustomerService(uow).get_360(customer.id)
    assert profile["stats"]["lifetime_value_by_currency"] == {"UZS": 250000}
    event = next(e for e in profile["timeline"] if e["type"] == "service")
    assert (event["cost"], event["currency"]) == (250000, "UZS")
    passport = await VehicleHealthService(uow).get_passport(vehicle.id)
    assert passport["vitals"]["total_spent_by_currency"] == {"UZS": 250000}
    assert (passport["history"][0]["cost"], passport["history"][0]["currency"]) == (250000, "UZS")


async def test_void_documents_are_not_customer_or_report_debts(session):
    uow, customer, vehicle = await _tenant(session)
    doc = await _invoice(uow, customer, vehicle, 250000, "UZS")
    invoice = await session.get(Invoice, uuid.UUID(doc["id"]))
    invoice.status = "void"
    invoice.due_date = datetime.now(timezone.utc).date() - timedelta(days=1)
    await session.flush()
    summary = await FinancialService(uow).customer_summary(customer.id)
    assert summary["by_currency"]["UZS"]["outstanding"] == 0
    assert summary["by_currency"]["UZS"]["overdue_amount"] == 0
    assert summary["overdue_count"] == 0
    report = await AnalyticsService(uow).report("commercial", currency="UZS")
    values = {k["key"]: k["value"] for group in report["groups"] for k in group["kpis"]}
    assert values["outstanding"] == values["overdue"] == values["overdue_cnt"] == 0
    assert report["reconciliation"]["debit"] == report["reconciliation"]["credit"] == 0
    assert all(check["ok"] for check in report["reconciliation"]["checks"])
    aging = next(s for s in report["sections"] if s["title"] == "A/R aging")
    assert sum(row["value"] for row in aging["data"]["rows"]) == 0


async def test_archived_invoice_payment_keeps_its_original_currency(session):
    uow, customer, vehicle = await _tenant(session)
    doc = await _invoice(uow, customer, vehicle, 250000, "UZS")
    await InvoiceService(uow).record_payment(uuid.UUID(doc["id"]), amount=50000, method="cash")
    # Old backups may contain archived documents with historical receipts.
    invoice = await session.get(Invoice, uuid.UUID(doc["id"]))
    invoice.is_active = False
    await session.flush()
    summary = await FinancialService(uow).customer_summary(customer.id)
    assert summary["by_currency"]["UZS"]["lifetime_spend"] == 50000
    assert summary["by_currency"]["UZS"]["outstanding"] == 0
    assert summary["payments"][0]["currency"] == "UZS"
    assert summary["last_payment"]["currency"] == "UZS"


async def test_archived_unpaid_document_does_not_break_active_reconciliation(session):
    uow, customer, vehicle = await _tenant(session)
    doc = await _invoice(uow, customer, vehicle, 250000, "UZS")
    await InvoiceService(uow).delete(uuid.UUID(doc["id"]))
    report = await AnalyticsService(uow).report("commercial", currency="UZS")
    reconciliation = report["reconciliation"]
    assert reconciliation["outstanding"] == reconciliation["debit"] == reconciliation["credit"] == 0
    assert all(check["ok"] for check in reconciliation["checks"])
    # Issuance history remains in the append-only ledger.
    assert await session.scalar(select(LedgerEntry.amount).where(
        LedgerEntry.invoice_id == uuid.UUID(doc["id"]))) == 250000


async def test_usd_spend_tiers_are_not_applied_to_uzs_units(session):
    uow, customer, vehicle = await _tenant(session)
    doc = await _invoice(uow, customer, vehicle, 250000, "UZS")
    await InvoiceService(uow).record_payment(uuid.UUID(doc["id"]), amount=250000, method="cash")
    commercial = await VehicleIntelligenceService(uow)._commercial(customer)
    assert commercial["lifetime_value_by_currency"] == {"UZS": 250000}
    assert commercial["spend_tier"] is None
