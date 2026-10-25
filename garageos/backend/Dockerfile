# Railway service root: / (this repository). Migrations run as a pre-deploy command.
FROM python:3.12-slim

ARG BUILD_SHA=unknown

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    ENVIRONMENT=production \
    DEBUG=false \
    BUILD_SHA=${BUILD_SHA} \
    UPLOAD_DIR=/data/uploads

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN python -m pip install --upgrade pip==26.2.1 && pip install -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .
COPY data/brands.json data/models.json data/maintenance_rules.json ./data/
RUN useradd -m appuser && mkdir -p /data/uploads && chown -R appuser /app /data/uploads
# Uploaded photos: mount a persistent, backed-up volume here on the server.
VOLUME ["/data/uploads"]
USER appuser
EXPOSE 8000

# exec delivers termination signals to Uvicorn; PORT is injected by Railway.
# Public traffic must enter through Railway's edge, which supplies X-Real-IP.
# Uvicorn's proxy rewriting stays off: with --forwarded-allow-ips '*' it takes
# the LEFTMOST (client-controlled) X-Forwarded-For hop as request.client.
# Client IP is resolved by app.core.rate_limit.client_ip (TRUST_PROXY_HEADERS).
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8000}\" --workers \"${WEB_CONCURRENCY:-1}\" --no-proxy-headers"]
