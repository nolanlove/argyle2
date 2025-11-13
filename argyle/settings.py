"""
Django settings for argyle project.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-change-me-in-production')

# SECURITY WARNING: don't run with debug turned on in production!
# Default to True for local development, False for production
DEBUG = os.environ.get('DEBUG', 'True').lower() == 'true'

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '').split(',') if os.environ.get('ALLOWED_HOSTS') else ['localhost', '127.0.0.1']

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.sites',  # Required for django-allauth
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
    'django.middleware.csrf.CsrfViewMiddleware',  # Required for admin and django-allauth
    'api.middleware.DisableCSRFForAPI',  # Exempt API endpoints from CSRF
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'allauth.account.middleware.AccountMiddleware',  # Required for django-allauth
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
            ],
        },
    },
]

WSGI_APPLICATION = 'argyle.wsgi.application'

# Database
# Use STORAGE_URL if provided (for Neon/Heroku Postgres connection strings)
if os.environ.get('STORAGE_URL'):
    import dj_database_url
    DATABASES = {
        'default': dj_database_url.config(
            default=os.environ.get('STORAGE_URL'),
            conn_max_age=600,
            conn_health_checks=True,
        )
    }
elif os.environ.get('DB_NAME'):
    # Use individual database settings if provided
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME', ''),
            'USER': os.environ.get('DB_USER', ''),
            'PASSWORD': os.environ.get('DB_PASSWORD', ''),
            'HOST': os.environ.get('DB_HOST', ''),
            'PORT': os.environ.get('DB_PORT', '5432'),
            'OPTIONS': {
                'sslmode': 'require',
            },
        }
    }
else:
    # Default to SQLite for local development
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# Custom User Model
AUTH_USER_MODEL = 'api.User'

# django-allauth Configuration
SITE_ID = int(os.environ.get('SITE_ID', '1'))

# Authentication backends
AUTHENTICATION_BACKENDS = [
    'accounts.backends.EmailBackend',  # Custom email-based authentication (for admin)
    'django.contrib.auth.backends.ModelBackend',  # Django model perms (fallback)
    'allauth.account.auth_backends.AuthenticationBackend',  # allauth login (for regular login)
]

# Allauth settings
ACCOUNT_LOGIN_METHODS = {"email"}  # Email-only login
ACCOUNT_SIGNUP_FIELDS = [
    "first_name*",
    "last_name*",
    "email*",
    "password1*",
    "password2*",
]  # Require first and last name at signup

# Tell allauth to use our custom signup form
ACCOUNT_FORMS = {
    'signup': 'accounts.forms.SignupForm',
}

# Use our custom account adapter
ACCOUNT_ADAPTER = 'accounts.adapters.CustomAccountAdapter'
ACCOUNT_UNIQUE_EMAIL = True
ACCOUNT_USER_MODEL_USERNAME_FIELD = None  # Custom User has no username field
ACCOUNT_EMAIL_VERIFICATION = "mandatory"  # Require email confirmation before login

# Email confirmation UX
ACCOUNT_CONFIRM_EMAIL_ON_GET = True
ACCOUNT_EMAIL_CONFIRMATION_AUTHENTICATED_REDIRECT_URL = "/"
ACCOUNT_EMAIL_CONFIRMATION_ANONYMOUS_REDIRECT_URL = "/accounts/login/"

# Redirect URLs
LOGIN_REDIRECT_URL = "/"
ACCOUNT_SIGNUP_REDIRECT_URL = "/accounts/signup/pending/"
ACCOUNT_LOGOUT_REDIRECT_URL = "/accounts/login/"

# Email settings (for password reset, email confirmation)
# Console by default; can switch to SMTP or other backends
_brevo_smtp_key = os.environ.get('BREVO_SMTP_KEY')
_brevo_smtp_login = os.environ.get('BREVO_SMTP_LOGIN')
_brevo_api_key = os.environ.get('BREVO_API_KEY')
_force_console = os.environ.get('FORCE_CONSOLE_EMAIL', 'False').lower() == 'true'

if _brevo_api_key and not _force_console:
    try:
        import anymail
        INSTALLED_APPS.append('anymail')
        EMAIL_BACKEND = 'anymail.backends.brevo.EmailBackend'
        ANYMAIL = {
            'BREVO_API_KEY': _brevo_api_key,
        }
        DEFAULT_FROM_EMAIL = "Argyle <no-reply@argyletheory.com>"
    except ImportError:
        # anymail not installed, fall back to console
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

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'static']

# Media files (user uploads)
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# WhiteNoise for static files
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Logging configuration
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
    },
}

# REST Framework settings
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    # Don't use SessionAuthentication for API - it requires CSRF
    'DEFAULT_AUTHENTICATION_CLASSES': [],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
}

# CORS settings
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:8000",
    "https://argyletheory.com",
]

CORS_ALLOW_CREDENTIALS = True

# CSRF settings - exempt API endpoints
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

# Security settings for production
if not DEBUG:
    SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'False') == 'True'
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
else:
    # In development, allow HTTP cookies
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False
