# ADR 0001: Record Architecture Decisions

## Status
Accepted

## Context
We need to document the architectural decisions made for GarageOS to ensure consistency and provide context for future developers.

## Decision
We will use Architecture Decision Records (ADRs) to document significant decisions.

## Consequences
- All major architectural decisions will be documented
- New team members can understand why decisions were made
- Decisions can be revisited with full context

---

# ADR 0002: FastAPI + PostgreSQL Backend

## Status
Accepted

## Context
GarageOS needs a backend that can handle multi-tenant API requests, background jobs, and AI features in the future.

## Decision
Use FastAPI (Python) with async SQLAlchemy and PostgreSQL.
- FastAPI provides async support, automatic OpenAPI docs, and Pydantic validation
- PostgreSQL offers robust JSON support, indexing, and reliability
- Async SQLAlchemy allows non-blocking database access

## Consequences
- Python ecosystem makes AI/ML integration natural
- Mature ORM with Alembic for migrations
- Async may add complexity for simple operations
- Celery/APScheduler available for background jobs
