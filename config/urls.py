"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('maps.urls')),
    # Only the slice of django-allauth that social login needs; its own
    # login/signup/password pages would duplicate maps/account.html.
    path('accounts/', include('allauth.socialaccount.providers.google.urls')),
    path('accounts/', include('allauth.socialaccount.providers.facebook.urls')),
    path('accounts/3rdparty/', include('allauth.socialaccount.urls')),
    # allauth reverses these names internally (e.g. after a failed or
    # cancelled social login); point them at the app's own pages.
    path('accounts/login/', RedirectView.as_view(pattern_name='login', query_string=True), name='account_login'),
    path('accounts/signup/', RedirectView.as_view(pattern_name='register', query_string=True), name='account_signup'),
]
