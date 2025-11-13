"""
Custom middleware to exempt API endpoints from CSRF protection
"""
from django.utils.deprecation import MiddlewareMixin
from django.views.decorators.csrf import csrf_exempt


class DisableCSRFForAPI(MiddlewareMixin):
    """
    Middleware to disable CSRF for API endpoints.
    This allows API endpoints to work without CSRF tokens while keeping
    CSRF protection for admin and django-allauth forms.
    """
    def process_view(self, request, view_func, view_args, view_kwargs):
        # Check if this is an API endpoint
        if request.path.startswith('/api/'):
            # Exempt API endpoints from CSRF
            return csrf_exempt(view_func)(request, *view_args, **view_kwargs)
        return None

