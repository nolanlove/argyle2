from allauth.account.adapter import DefaultAccountAdapter
from django.conf import settings


class CustomAccountAdapter(DefaultAccountAdapter):
    def get_signup_redirect_url(self, request):
        """
        Override to redirect to our custom pending page.
        """
        # Always redirect to our custom pending page for signups
        return '/accounts/signup/pending/'
    
    def get_login_redirect_url(self, request):
        """
        Override login redirect.
        """
        # Default behavior - redirect to home
        return super().get_login_redirect_url(request)

