from decimal import Decimal
import pytest
from app.services.payment_gateway import PaymentAttempt, PaymentProtocolError, PaymentState, uzs_to_minor


def test_money_is_exact_tiyin():
    assert uzs_to_minor(Decimal('125000.50')) == 12500050
    for amount in ['0', '-1', 'NaN', 'Infinity', '0.001']:
        with pytest.raises(PaymentProtocolError):
            uzs_to_minor(Decimal(amount))


def test_duplicate_callbacks_have_one_result():
    attempt = PaymentAttempt('garage-a', 'invoice-a', 'provider-1', 10000, 100)
    completed = attempt.complete(200)
    assert completed.complete(300) == completed
    assert completed.completed_ms == 200
    assert completed.state == PaymentState.COMPLETED
    cancelled = completed.cancel(400, 5)
    assert cancelled.cancel(500, 9) == cancelled
    assert cancelled.state == PaymentState.CANCELLED_AFTER_PAYMENT
    with pytest.raises(PaymentProtocolError):
        cancelled.complete(600)


def test_created_cancel_and_cross_tenant_or_amount_replay_are_rejected():
    attempt = PaymentAttempt('garage-a', 'invoice-a', 'provider-1', 10000, 100)
    assert attempt.check_replay(tenant_id='garage-a', invoice_id='invoice-a', amount_minor=10000) == attempt
    for tenant, invoice, amount in [('garage-b', 'invoice-a', 10000),
                                    ('garage-a', 'invoice-b', 10000),
                                    ('garage-a', 'invoice-a', 10001)]:
        with pytest.raises(PaymentProtocolError):
            attempt.check_replay(tenant_id=tenant, invoice_id=invoice, amount_minor=amount)
    cancelled = attempt.cancel(200, 1)
    assert cancelled.state == PaymentState.CANCELLED_BEFORE_PAYMENT
    with pytest.raises(PaymentProtocolError):
        cancelled.check_replay(tenant_id='garage-a', invoice_id='invoice-a', amount_minor=10000)
