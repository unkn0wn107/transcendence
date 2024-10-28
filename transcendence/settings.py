"""
Django settings for transcendence project.

Generated by 'django-admin startproject' using Django 5.0.6.

For more information on this file, see
https://docs.djangoproject.com/en/5.0/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/5.0/ref/settings/
"""

from pathlib import Path
from django.contrib import messages
import environ
from datetime import timedelta
import os
from .logger import get_logging_config
# Load environment variables from .env file
env = environ.Env()
environ.Env.read_env()

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = 'django-insecure-zw-ma$(zm6#8=njdjxk+@gd32fa&fd$-&tjxv-m#upwl(gt&ay'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env.bool('DEBUG')

LOG_LEVEL = env('LOG_LEVEL', default='DEBUG')

LOGGING = get_logging_config(LOG_LEVEL)

# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django_truncate',
    'channels',
    'authentication',
    'chat',
    'corsheaders',
    'rest_framework_simplejwt',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'django_htmx.middleware.HtmxMiddleware',
    'authentication.middleware.RedirectOn401Middleware',
    'authentication.middleware.HtmxUserMiddleware',
]

ROOT_URLCONF = 'transcendence.urls'

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
                'transcendence.context.global_context',
            ],
        },
    },
]

WSGI_APPLICATION = 'transcendence.wsgi.application'
ASGI_APPLICATION = "transcendence.asgi.application"

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'authentication.decorators.IsAuthenticatedWithCookie',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=5),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
}

# Database
# https://docs.djangoproject.com/en/5.0/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql_psycopg2',
        'NAME': env('DB_NAME'),
        'USER': env('DB_USER'),
        'PASSWORD': env('DB_PASSWORD'),
        'HOST': env('DB_HOST'),
        'PORT': env('DB_PORT'),
    }
}


CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    },
}


# Password validation
# https://docs.djangoproject.com/en/5.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {
            'min_length': 8,  # Set your minimum password length here
        }
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

MESSAGE_TAGS = {
    messages.DEBUG: 'info',
    messages.ERROR: 'danger',
}


# Internationalization
# https://docs.djangoproject.com/en/5.0/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True

if env('BUGSNAG_KEY', default=None) is not None:
    BUGSNAG = {
        'api_key': env('BUGSNAG_KEY', default=None),
        'project_root': BASE_DIR,
    }

    INSTALLED_APPS.append('bugsnag.django')
    MIDDLEWARE.insert(0, 'bugsnag.django.middleware.BugsnagMiddleware')
    LOGGING['handlers']['bugsnag'] = {
        'level': 'ERROR',
        'class': 'bugsnag.handlers.BugsnagHandler',
    }
    LOGGING['root']['handlers'].append('bugsnag')

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.0/howto/static-files/

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'static'
STATICFILES_DIRS = [
    BASE_DIR / 'transcendence' / 'static',
]

# esbuild configuration
ESBUILD_BIN_PATH = os.path.join(BASE_DIR, 'node_modules', '.bin', 'esbuild')
ESBUILD_CONFIG_PATH = os.path.join(BASE_DIR, 'esbuild.config.js')

# Default primary key field type
# https://docs.djangoproject.com/en/5.0/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Custom User Model
AUTH_USER_MODEL = 'authentication.User'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'  # For testing purposes

# For production, you might use something like this:
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = env('EMAIL_HOST')
EMAIL_PORT = env('EMAIL_PORT')
EMAIL_USE_TLS = env.bool('EMAIL_USE_TLS')
EMAIL_HOST_USER = env('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = env('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL')

LOGIN_URL = '/login'

ALLOWED_HOSTS = ['localhost', '127.0.0.1', env('DOMAIN')]
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:8000',
    'http://127.0.0.1:8000',
]
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    'http://localhost:8000',
    'http://127.0.0.1:8000',
]

if env('PROD', default='False') == 'True':
    CSRF_TRUSTED_ORIGINS.append(f'https://{env("DOMAIN")}')
    CSRF_TRUSTED_ORIGINS.append(f'ws://{env("DOMAIN")}')
    CSRF_TRUSTED_ORIGINS.append(f'wss://{env("DOMAIN")}')
    CORS_ALLOWED_ORIGINS.append(f'https://{env("DOMAIN")}')
    CORS_ALLOWED_ORIGINS.append(f'ws://{env("DOMAIN")}')
    CORS_ALLOWED_ORIGINS.append(f'wss://{env("DOMAIN")}')

CSRF_COOKIE_DOMAIN = env('DOMAIN')
CORS_ALLOW_CREDENTIALS = True
FT_CLIENT_ID = env('FT_CLIENT_ID')
FT_CLIENT_SECRET = env('FT_CLIENT_SECRET')
FT_REDIRECT_URI = env('FT_REDIRECT_URI')

