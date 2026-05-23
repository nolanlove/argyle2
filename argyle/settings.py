"""
Django settings for argyle project.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


def _env_list(name, default=""):
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'

SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'django-insecure-dev-only-do-not-use-in-prod'
    else:
        raise RuntimeError("SECRET_KEY environment variable is required when DEBUG=False")

# JWT signing key — separate from SECRET_KEY so rotating one doesn't invalidate the other.
JWT_SECRET = os.environ.get('JWT_SECRET') or os.environ.get('NEXTAUTH_SECRET') or SECRET_KEY

ALLOWED_HOSTS = _env_list('ALLOWED_HOSTS') or (['localhost', '127.0.0.1'] if DEBUG else [])

# Fly's Consul health checker hits the app via the machine's private IPv4 with
# that IP as the Host header. Allow it explicitly so we don't have to set "*".
if os.environ.get('FLY_APP_NAME'):
    try:
        import socket
        ALLOWED_HOSTS.append(socket.gethostbyname(socket.gethostname()))
    except Exception:
        pass

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.sites',
    'rest_framework',
    'corsheaders',

    # django-allauth (load before accounts so we can override/unregister its admin)
    'allauth',
    'allauth.account',

    # our apps
    'accounts',
    'api',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'api.middleware.DisableCSRFForAPI',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'allauth.account.middleware.AccountMiddleware',
]

ROOT_URLCONF = 'argyle.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'argyle.context_processors.release_id',
            ],
        },
    },
]

WSGI_APPLICATION = 'argyle.wsgi.application'

# Database
# Priority: DATABASE_URL (Fly's standard) -> STORAGE_URL (legacy) -> DB_* parts -> SQLite (dev only)
_db_url = os.environ.get('DATABASE_URL') or os.environ.get('STORAGE_URL')
if _db_url:
    import dj_database_url
    DATABASES = {
        'default': dj_database_url.parse(
            _db_url,
            conn_max_age=600,
            conn_health_checks=True,
        )
    }
elif os.environ.get('DB_NAME'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME', ''),
            'USER': os.environ.get('DB_USER', ''),
            'PASSWORD': os.environ.get('DB_PASSWORD', ''),
            'HOST': os.environ.get('DB_HOST', ''),
            'PORT': os.environ.get('DB_PORT', '5432'),
            'OPTIONS': {
                'sslmode': os.environ.get('DB_SSLMODE', 'require'),
            },
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_USER_MODEL = 'api.User'

SITE_ID = int(os.environ.get('SITE_ID', '1'))

AUTHENTICATION_BACKENDS = [
    'accounts.backends.EmailBackend',
    'django.contrib.auth.backends.ModelBackend',
    'allauth.account.auth_backends.AuthenticationBackend',
]

ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = [
    "first_name*",
    "last_name*",
    "email*",
    "password1*",
    "password2*",
]

ACCOUNT_FORMS = {
    'signup': 'accounts.forms.SignupForm',
}

ACCOUNT_ADAPTER = 'accounts.adapters.CustomAccountAdapter'
ACCOUNT_UNIQUE_EMAIL = True
ACCOUNT_USER_MODEL_USERNAME_FIELD = None
ACCOUNT_EMAIL_VERIFICATION = "mandatory"

ACCOUNT_CONFIRM_EMAIL_ON_GET = True
ACCOUNT_EMAIL_CONFIRMATION_AUTHENTICATED_REDIRECT_URL = "/"
ACCOUNT_EMAIL_CONFIRMATION_ANONYMOUS_REDIRECT_URL = "/accounts/login/"

LOGIN_REDIRECT_URL = "/"
ACCOUNT_SIGNUP_REDIRECT_URL = "/accounts/signup/pending/"
ACCOUNT_LOGOUT_REDIRECT_URL = "/accounts/login/"

# Email
_brevo_smtp_key = os.environ.get('BREVO_SMTP_KEY')
_brevo_smtp_login = os.environ.get('BREVO_SMTP_LOGIN')
_brevo_api_key = os.environ.get('BREVO_API_KEY')
_force_console = os.environ.get('FORCE_CONSOLE_EMAIL', 'False').lower() == 'true'

if _brevo_api_key and not _force_console:
    try:
        import anymail  # noqa: F401
        INSTALLED_APPS.append('anymail')
        EMAIL_BACKEND = 'anymail.backends.brevo.EmailBackend'
        ANYMAIL = {
            'BREVO_API_KEY': _brevo_api_key,
        }
        DEFAULT_FROM_EMAIL = "Argyle <no-reply@argyletheory.com>"
    except ImportError:
        EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
        DEFAULT_FROM_EMAIL = "Argyle <noreply@localhost>"
elif _brevo_smtp_key and not _force_console:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = 'smtp-relay.brevo.com'
    EMAIL_PORT = 587
    EMAIL_USE_TLS = True
    EMAIL_HOST_USER = _brevo_smtp_login or os.environ.get('BREVO_SMTP_USER', '')
    EMAIL_HOST_PASSWORD = _brevo_smtp_key
    DEFAULT_FROM_EMAIL = "Argyle <no-reply@argyletheory.com>"
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
    DEFAULT_FROM_EMAIL = "Argyle <noreply@localhost>"

SERVER_EMAIL = DEFAULT_FROM_EMAIL
EMAIL_SUBJECT_PREFIX = os.environ.get('EMAIL_SUBJECT_PREFIX', '[Argyle] ')

# Password hashers. BCrypt comes first so users imported from the v1 (Neon)
# database -- whose passwords are stored as bcrypt -- can log in without a reset.
# Django will rehash to its default on next successful login.
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',
    'django.contrib.auth.hashers.BCryptPasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher',
    'django.contrib.auth.hashers.Argon2PasswordHasher',
    'django.contrib.auth.hashers.ScryptPasswordHasher',
]

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'static']

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        'accounts.backends': {
            'handlers': ['console'],
            'level': 'INFO',
        },
        'django': {
            'handlers': ['console'],
            'level': os.environ.get('DJANGO_LOG_LEVEL', 'INFO'),
        },
    },
}

REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
}

# CORS / CSRF — env-driven so prod hosts don't need code edits.
_default_cors = "http://localhost:3000,http://localhost:8000,http://127.0.0.1:8000"
CORS_ALLOWED_ORIGINS = _env_list('CORS_ALLOWED_ORIGINS', _default_cors)
CORS_ALLOW_CREDENTIALS = True

_default_csrf = "http://localhost:8000,http://127.0.0.1:8000"
CSRF_TRUSTED_ORIGINS = _env_list('CSRF_TRUSTED_ORIGINS', _default_csrf)

# Production hardening
if not DEBUG:
    # Fly terminates TLS at the edge and forwards X-Forwarded-Proto.
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'True').lower() == 'true'
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_HSTS_SECONDS = int(os.environ.get('SECURE_HSTS_SECONDS', '31536000'))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
else:
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False

# Convenience flag for views deciding whether to set Secure on auth cookies.
AUTH_COOKIE_SECURE = SESSION_COOKIE_SECURE
AUTH_COOKIE_SAMESITE = os.environ.get('AUTH_COOKIE_SAMESITE', 'Lax')
