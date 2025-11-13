from django import forms
from django.contrib.auth import get_user_model
from allauth.account.forms import SignupForm as AllauthSignupForm

User = get_user_model()


class SignupForm(AllauthSignupForm):
    """Custom signup form with first and last name"""
    first_name = forms.CharField(max_length=150, label="First name", required=True)
    last_name = forms.CharField(max_length=150, label="Last name", required=True)

    def clean_email(self):
        """
        Override email validation to allow invited users (without passwords) 
        to complete their signup.
        """
        email = self.cleaned_data.get('email')
        if not email:
            return email
            
        try:
            existing_user = User.objects.get(email=email)
            
            # If user exists but has no password set, they're an invited user
            # Allow them to complete their signup
            if not existing_user.has_usable_password():
                return email
                
            # User exists and has a password - this is a legitimate duplicate
            # Raise validation error to show "Account Already Exists"
            raise forms.ValidationError(
                "A user with this email address already exists."
            )
            
        except User.DoesNotExist:
            # No user exists with this email, allow signup
            return email

    def save(self, request):
        user = super().save(request)
        user.first_name = self.cleaned_data.get("first_name", "").strip()
        user.last_name = self.cleaned_data.get("last_name", "").strip()
        # Store name as combination of first and last
        user.name = f"{user.first_name} {user.last_name}".strip()
        user.save(update_fields=["first_name", "last_name", "name"])
        return user

