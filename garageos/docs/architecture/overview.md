# GarageOS Architecture Overview

## System Architecture

```
                    ┌──────────────────┐
                    │   Admin Dashboard │
                    │   (Next.js 15)    │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   Backend API    │
                    │   (FastAPI)      │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   PostgreSQL     │
                    │                  │
                    │  - Multi-tenant  │
                    │  - Event outbox  │
                    │  - Slots         │
                    └──────────────────┘
```

## Core Patterns

- **Multi-tenancy**: Every business table has `service_center_id`
- **Unit of Work**: Atomic transactions across repositories
- **Domain Events**: Loose coupling between services
- **Repository Pattern**: Data access abstraction
- **Service Layer**: Business logic isolated from HTTP

## Tech Stack

| Layer | Technology |
|-------|------------|
| API | FastAPI (Python 3.12) |
| ORM | SQLAlchemy 2.0 (async) |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | JWT (access + refresh tokens) |
| Background Jobs | APScheduler → Celery (future) |
| Admin UI | Next.js 15 + shadcn/ui |
| Customer UI | Telegram Bot (aiogram 3.x) |
| Container | Docker Compose |
