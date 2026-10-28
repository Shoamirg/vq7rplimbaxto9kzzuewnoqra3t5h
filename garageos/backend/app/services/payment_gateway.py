"""Provider-neutral preparation. No checkout or live-money route is enabled.

The immutable transition contract is tested locally. A future Payme adapter
must persist attempts and apply these transitions inside the same locked UoW as
the invoice payment; a mobile return URL can never confirm a payment.
"""
from dataclasses import dataclass, replace
from decimal import Decimal, InvalidOperation
from enum import IntEnum
from typing import Protocol


class PaymentState(IntEnum):
    CREATED = 1
    COMPLETED = 2
    CANCELLED_BEFORE_PAYMENT = -1
    CANCELLED_AFTER_PAYMENT = -2


class PaymentProtocolError(ValueError):
    def __init__(self, code: int, message: str):
        self.code = code
        super().__init__(message)


def uzs_to_minor(amount: Decimal) -> int:
    """Convert exact UZS to tiyin; never round away a money discrepancy."""
    try:
        scaled = Decimal(str(amount)) * 100
        if not scaled.is_finite() or scaled <= 0 or scaled != scaled.to_integral_value():
            raise InvalidOperation()
        return int(scaled)
    except (InvalidOperation, ValueError):
        raise PaymentProtocolError(-31001, 'Invalid amount') from None


@dataclass(frozen=True)
class PaymentAttempt:
    tenant_id: str
    invoice_id: str
    provider_id: str
    amount_minor: int
    created_ms: int
    state: PaymentState = PaymentState.CREATED
    completed_ms: int = 0
    cancelled_ms: int = 0
    reason: int | None = None

    def check_replay(self, *, tenant_id: str, invoice_id: str, amount_minor: int):
        if (tenant_id, invoice_id, amount_minor) != (self.tenant_id, self.invoice_id, self.amount_minor):
            raise PaymentProtocolError(-31001, 'Transaction details differ')
        if self.state.value < 0:
            raise PaymentProtocolError(-31008, 'Transaction was cancelled')
        return self

    def complete(self, now_ms: int):
        if self.state == PaymentState.COMPLETED:
            return self
        if self.state != PaymentState.CREATED:
            raise PaymentProtocolError(-31008, 'Cannot perform cancelled transaction')
        return replace(self, state=PaymentState.COMPLETED, completed_ms=now_ms)

    def cancel(self, now_ms: int, reason: int):
        if self.state.value < 0:
            return self
        return replace(self, state=(PaymentState.CANCELLED_AFTER_PAYMENT
            if self.state == PaymentState.COMPLETED else PaymentState.CANCELLED_BEFORE_PAYMENT),
            cancelled_ms=now_ms, reason=reason)


class PaymentGateway(Protocol):
    async def check(self, tenant_id: str, invoice_id: str, amount_minor: int) -> bool: ...
    async def create(self, tenant_id: str, invoice_id: str, provider_id: str,
                     amount_minor: int, created_ms: int) -> PaymentAttempt: ...
    async def perform(self, provider_id: str) -> PaymentAttempt: ...
    async def cancel(self, provider_id: str, reason: int) -> PaymentAttempt: ...
    async def get(self, provider_id: str) -> PaymentAttempt: ...
    async def statement(self, from_ms: int, to_ms: int) -> list[PaymentAttempt]: ...
