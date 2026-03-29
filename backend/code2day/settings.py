import os
from pathlib import Path

from dotenv import load_dotenv

# Load variables from backend/.env (or project-root/.env) into the process
# environment before any os.getenv() call below reads them.
# On EC2 you can set real env vars instead — load_dotenv() is a no-op when
# the var is already present in the environment (override=False by default).
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_FILE)

BASE_DIR = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Core security
# ---------------------------------------------------------------------------

# Never hard-code the secret key.
# On EC2: set DJANGO_SECRET_KEY in /etc/environment or your systemd unit file.
# On local dev: if the env var is missing, a dev-only fallback is used and a
# warning will be logged when DEBUG is False.
_SECRET_KEY_ENV = os.getenv("DJANGO_SECRET_KEY", "")
_DEBUG_ENV = os.getenv("DJANGO_DEBUG", "true").lower() == "true"

SECRET_KEY = _SECRET_KEY_ENV or (
    "code2day-insecure-dev-key-do-not-use-in-production"
)

DEBUG = _DEBUG_ENV

# Warn loudly if running in production without a real secret key
if not DEBUG and not _SECRET_KEY_ENV:
    import warnings
    warnings.warn(
        "DJANGO_SECRET_KEY is not set. Using insecure fallback key. "
        "Set the env var before deploying to EC2.",
        RuntimeWarning,
        stacklevel=1,
    )

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv(
        "DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost,testserver"
    ).split(",")
    if host.strip()
]
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# ---------------------------------------------------------------------------
# Application definition
# ---------------------------------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "apps.learning",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "code2day.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "code2day.wsgi.application"
ASGI_APPLICATION = "code2day.asgi.application"

# ---------------------------------------------------------------------------
# Database — MySQL on EC2 (or local)
# ---------------------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.getenv("CODE2DAY_DB_NAME", "ramcoad"),
        "USER": os.getenv("CODE2DAY_DB_USER", "root"),
        "PASSWORD": os.getenv("CODE2DAY_DB_PASSWORD", ""),
        "HOST": os.getenv("CODE2DAY_DB_HOST", "127.0.0.1"),
        "PORT": os.getenv("CODE2DAY_DB_PORT", "3306"),
        "OPTIONS": {
            "charset": "utf8mb4",
        },
    }
}

# ---------------------------------------------------------------------------
# Password validation
# ---------------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# ---------------------------------------------------------------------------
# Internationalisation
# ---------------------------------------------------------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Session & CSRF security
# ---------------------------------------------------------------------------

SESSION_COOKIE_AGE = 60 * 60 * 24 * 30          # 30 days
SESSION_EXPIRE_AT_BROWSER_CLOSE = False
SESSION_SAVE_EVERY_REQUEST = True

# HttpOnly prevents JS from reading the session cookie (XSS protection)
SESSION_COOKIE_HTTPONLY = True

# SameSite=Lax blocks cross-site POST requests (CSRF mitigation layer 2)
SESSION_COOKIE_SAMESITE = "Lax"

# Secure flag: only send cookies over HTTPS — enable on EC2 with SSL
SESSION_COOKIE_SECURE = not DEBUG

# CSRF cookie — must NOT be HttpOnly because appUtils.js reads it to send
# the X-CSRFToken header. SameSite=Lax still gives cross-site protection.
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = not DEBUG

# ---------------------------------------------------------------------------
# CORS — allow the Vite dev server + production EC2 origin
# ---------------------------------------------------------------------------

_cors_raw = os.getenv(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_raw.split(",") if o.strip()]
CORS_ALLOW_CREDENTIALS = True

_csrf_raw = os.getenv(
    "CSRF_TRUSTED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
CSRF_TRUSTED_ORIGINS = [o.strip() for o in _csrf_raw.split(",") if o.strip()]

# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ]
}

# ---------------------------------------------------------------------------
# Judge0 — self-hosted on Amazon EC2 (no Docker on the app server)
# ---------------------------------------------------------------------------
# Set JUDGE0_BASE_URL to your EC2 instance's public IP or domain, e.g.:
#
#   Windows:  set JUDGE0_BASE_URL=http://<ec2-ip>:2358
#   Linux:    export JUDGE0_BASE_URL=http://<ec2-ip>:2358
#
JUDGE0_BASE_URL = os.getenv("JUDGE0_BASE_URL", "http://15.207.175.134:2358")
JUDGE0_TIMEOUT_SECONDS = int(os.getenv("JUDGE0_TIMEOUT_SECONDS", "300"))

# ---------------------------------------------------------------------------
# Auth rate limiting (InMemoryRateLimiter in auth_utils.py)
# ---------------------------------------------------------------------------

# Login / first-login endpoints: max attempts per window per IP
AUTH_RATE_LIMIT_MAX_ATTEMPTS = int(os.getenv("AUTH_RATE_LIMIT_MAX_ATTEMPTS", "5"))
AUTH_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("AUTH_RATE_LIMIT_WINDOW_SECONDS", "60"))

# Student-lookup (register-number search): slightly more lenient
LOOKUP_RATE_LIMIT_MAX_ATTEMPTS = int(os.getenv("LOOKUP_RATE_LIMIT_MAX_ATTEMPTS", "20"))
LOOKUP_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("LOOKUP_RATE_LIMIT_WINDOW_SECONDS", "60"))

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "DEBUG" if DEBUG else "INFO",
    },
    "loggers": {
        "apps.learning": {
            "handlers": ["console"],
            "level": "DEBUG" if DEBUG else "INFO",
            "propagate": False,
        },
    },
}
