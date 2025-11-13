"""
URL configuration for argyle project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from rest_framework.routers import DefaultRouter
from api import views

router = DefaultRouter()
router.register(r'songs', views.SongViewSet, basename='song')

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # Django-allauth URLs (must come before accounts URLs)
    path('accounts/', include('allauth.urls')),
    
    # Custom accounts URLs
    path('accounts/', include('accounts.urls')),
    
    # API endpoints (keep for backward compatibility with frontend)
    path('api/health', views.health_check, name='health'),
    path('api/openai/chat', views.openai_chat, name='openai-chat'),
    path('api/auth/login', views.login, name='api-login'),
    path('api/auth/signup', views.signup, name='api-signup'),
    path('api/auth/logout', views.logout, name='api-logout'),
    path('api/auth/me', views.get_current_user, name='api-me'),
    path('api/', include(router.urls)),
    
    # Serve frontend
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
]

# Serve static files in development
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
