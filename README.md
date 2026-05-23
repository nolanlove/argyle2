# Argyle (Django)

Django port of the Argyle musical grid app. Deployed on Fly.io with Fly Postgres.

---

## Local development

Requires Python 3.11+ and Docker (for Postgres).

```bash
# 1. Virtualenv + deps
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Local Postgres
docker compose up -d

# 3. Env
cp .env.example .env
# (edit OPENAI_API_KEY etc. as needed — defaults point at the docker-compose db)

# 4. Migrate + run
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

App at http://localhost:8000, admin at http://localhost:8000/admin/.

To reset the local DB: `docker compose down -v && docker compose up -d`.

---

## Production: Fly.io

App name: **argyletheory**, region: **iad**, DB: **Fly Postgres**.

### One-time setup

```bash
# Auth
fly auth login

# Launch from existing fly.toml (don't let the launcher overwrite it)
fly launch --no-deploy --copy-config --name argyletheory --region iad

# Postgres cluster
fly postgres create --name argyletheory-db --region iad
fly postgres attach argyletheory-db --app argyletheory
# ^ this sets DATABASE_URL on the app automatically.

# Secrets (never commit these)
fly secrets set \
  SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(64))')" \
  JWT_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(64))')" \
  OPENAI_API_KEY="sk-..." \
  BREVO_API_KEY="..."
```

### Deploy

```bash
fly deploy
```

The release command runs `python manage.py migrate --noinput` before new VMs take traffic. Static assets are baked into the image at build time via WhiteNoise.

### Operations

```bash
fly logs                              # tail
fly ssh console                       # shell into a VM
fly ssh console -C "python manage.py createsuperuser"
fly status
fly scale count 2                     # add machines
```

### Custom domain

```bash
fly ips allocate-v4 --shared
fly ips allocate-v6
fly certs add argyletheory.com
fly certs add www.argyletheory.com
```

Then point DNS at the Fly IPs (`fly ips list`).

---

## Migrating data from SQLite to Fly Postgres

Light dataset (a couple of users, no songs yet). Use Django's dump/load:

```bash
# 1. Dump from local SQLite (run with the OLD .env, no DATABASE_URL set)
python manage.py dumpdata \
  --natural-foreign --natural-primary \
  --exclude=contenttypes --exclude=auth.permission \
  --exclude=admin.logentry --exclude=sessions \
  --indent=2 > data_dump.json

# 2. Load into Fly Postgres via proxy
fly proxy 5433:5432 -a argyletheory-db &
DATABASE_URL=postgres://<user>:<pass>@localhost:5433/argyletheory \
  python manage.py loaddata data_dump.json
# (DATABASE_URL credentials come from `fly postgres attach` output, or
#  `fly secrets list` shows it's set; you can also fly ssh into the app
#  and run loaddata there with data_dump.json copied in.)
```

Alternative: `fly ssh sftp shell -a argyletheory` to ship the JSON, then
`fly ssh console -C "python manage.py loaddata data_dump.json"`.

---

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `SECRET_KEY` | yes (prod) | Hard-fails on startup if `DEBUG=False` and unset. |
| `JWT_SECRET` | recommended | Falls back to `SECRET_KEY`. Used for the auth-token cookie. |
| `DATABASE_URL` | yes (prod) | Set automatically by `fly postgres attach`. |
| `DEBUG` | no | Defaults `False`. |
| `ALLOWED_HOSTS` | yes (prod) | Comma-separated. |
| `CSRF_TRUSTED_ORIGINS` | yes (prod) | Comma-separated, full origins (with scheme). |
| `CORS_ALLOWED_ORIGINS` | no | Comma-separated. |
| `OPENAI_API_KEY` | for `/api/openai/chat` | |
| `BREVO_API_KEY` / `BREVO_SMTP_KEY` | for transactional email | Falls back to console backend. |
| `SECURE_SSL_REDIRECT` | no | Defaults `True` in prod. |

---

## API

- `GET  /api/health` — health check
- `POST /api/openai/chat` — OpenAI passthrough
- `POST /api/auth/login` / `signup` / `logout`
- `GET  /api/auth/me`
- `GET  /api/songs/` · `POST /api/songs/` · `GET /api/songs/{id}/`

Auth is a JWT in an `httpOnly` cookie (`auth-token`). `Secure` flag is set automatically when `DEBUG=False`.

---

## Project structure

```
argyle2/
├── api/              # models, views, serializers
├── accounts/         # allauth integration, custom adapter
├── argyle/           # project settings + URL conf
├── static/           # frontend assets
├── templates/        # HTML
├── Dockerfile        # Fly build
├── fly.toml          # Fly app config
├── docker-compose.yml# local Postgres
├── manage.py
└── requirements.txt
```
