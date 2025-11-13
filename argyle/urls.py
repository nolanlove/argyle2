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
    
    # API endpoints
    path('api/health', views.health_check, name='health'),
    path('api/openai/chat', views.openai_chat, name='openai-chat'),
    path('api/auth/login', views.login, name='login'),
    path('api/auth/signup', views.signup, name='signup'),
    path('api/auth/logout', views.logout, name='logout'),
    path('api/auth/me', views.get_current_user, name='me'),
    path('api/', include(router.urls)),
    
    # Serve frontend
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
]

# Serve static files in development
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
