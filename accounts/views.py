from django.shortcuts import render, redirect
from django.contrib import messages


def signup_pending(request):
    """Friendly landing page after signup, prompting email validation."""
    email_value = ""
    
    try:
        if request.user.is_authenticated:
            from allauth.account.models import EmailAddress
            primary = EmailAddress.objects.filter(user=request.user, primary=True).first()
            email_value = getattr(primary, "email", "") or getattr(request.user, "email", "")
        else:
            # User just signed up but isn't logged in yet
            # Get email from session data if available
            email_value = request.session.get('signup_email', '')
    except Exception:
        email_value = getattr(getattr(request, "user", None), "email", "") or ""

    context = {"email": email_value}
    return render(request, "accounts/signup_pending.html", context)


def resend_confirmation(request):
    """Send a new email confirmation for the logged-in user's primary email."""
    if not request.user.is_authenticated:
        return redirect('account_login')
    try:
        from allauth.account.models import EmailAddress
        email_address = (
            EmailAddress.objects.filter(user=request.user, primary=True).first()
            or EmailAddress.objects.filter(user=request.user, email=getattr(request.user, 'email', '')).first()
        )

        if not email_address:
            messages.error(request, "No email address found.")
            return redirect('account_signup_pending')

        if email_address.verified:
            messages.info(request, "Your email is already verified.")
        else:
            email_address.send_confirmation(request)
            messages.success(request, "Verification email sent.")
    except Exception:
        messages.error(request, "We couldn't send the verification email. Please try again.")
    return redirect('account_signup_pending')
