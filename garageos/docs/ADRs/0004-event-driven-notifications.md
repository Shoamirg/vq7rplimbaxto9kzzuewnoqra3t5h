# ADR 0004: Event-Driven Notification Pattern

## Status
Accepted

## Context
Multiple services need to trigger notifications (appointment reminders, maintenance alerts, etc.). Notifications should be decoupled from business logic.

## Decision
Use a domain event bus with an outbox-inspired pattern:

### Flow
1. Service publishes domain event via Unit of Work
2. Events are collected in-memory during the transaction
3. After successful commit, events are dispatched to registered handlers
4. Each handler calls the appropriate notification provider

### Provider Interface
```python
class NotificationProvider(ABC):
    async def send_message(recipient: str, message: str) -> bool
    async def send_template(recipient: str, template: str, data: dict) -> bool
```

### Implementations
- TelegramProvider (via aiogram API)
- EmailProvider (SMTP stub initially)
- SMSProvider (future)

## Consequences
- Business logic doesn't depend on notification channels
- Adding new channels doesn't require service changes
- Events are lost if process crashes after commit but before dispatch (acceptable for MVP; outbox table can be added later)
