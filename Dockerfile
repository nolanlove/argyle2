FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=argyle.settings \
    PORT=8080

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Build static assets at image build time so the running container is read-only safe.
# SECRET_KEY just needs to exist for collectstatic; it is not the runtime key.
RUN SECRET_KEY=build-only-key DEBUG=True python manage.py collectstatic --noinput

EXPOSE 8080

CMD ["gunicorn", "argyle.wsgi:application", "--bind", "0.0.0.0:8080", "--workers", "3", "--access-logfile", "-", "--error-logfile", "-"]
