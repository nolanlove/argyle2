from django.urls import path
from . import views

urlpatterns = [
    path("signup/pending/", views.signup_pending, name="account_signup_pending"),
    path("resend-confirmation/", views.resend_confirmation, name="account_resend_confirmation"),
]

