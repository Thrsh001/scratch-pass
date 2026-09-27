from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.socialaccount.providers.base import AuthError
from django.contrib import messages
from django.shortcuts import redirect


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    def on_authentication_error(self, request, provider, error=None, exception=None, extra_context=None):
        # Send the user back to the app's own login page instead of
        # allauth's unstyled error/cancelled pages.
        name = provider.name if provider else "Social"
        if error == AuthError.CANCELLED:
            messages.info(request, f"{name} login was cancelled.")
        else:
            messages.error(request, f"{name} login failed. Please try again.")
        raise ImmediateHttpResponse(redirect("login"))
