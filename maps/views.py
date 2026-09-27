import json

from allauth.socialaccount.adapter import get_adapter as get_social_adapter
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.contrib.auth.views import LoginView as BaseLoginView
from django.http import HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_POST

from .regions import has_subdivisions, subdivision_svg_path, valid_region_ids


@login_required
def map_view(request):
    return render(request, "maps/map.html")


@require_GET
def get_visits(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "authentication required"}, status=401)

    return JsonResponse({"visited": request.user.profile.visited_regions})


@require_POST
def toggle_visit(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "authentication required"}, status=401)

    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "invalid JSON body"}, status=400)

    region = payload.get("region")
    if not isinstance(region, str) or region not in valid_region_ids():
        return JsonResponse({"error": "unknown region id"}, status=400)
    if has_subdivisions(region):
        return JsonResponse(
            {"error": "region has subdivisions and can't be toggled directly"},
            status=400,
        )

    visited = request.user.profile.toggle_region(region)
    return JsonResponse({"visited": visited})


@require_GET
def subdivision_svg(request, code):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "authentication required"}, status=401)

    path = subdivision_svg_path(code)
    if not path:
        return JsonResponse({"error": "no subdivisions for this region"}, status=404)

    return HttpResponse(path.read_text(), content_type="image/svg+xml")


_SOCIAL_PROVIDERS = [
    {"id": "google", "name": "Google", "badge": "G"},
    {"id": "facebook", "name": "Facebook", "badge": "f"},
]


def social_buttons(request):
    configured = {p.id for p in get_social_adapter().list_providers(request)}
    return [{**p, "enabled": p["id"] in configured} for p in _SOCIAL_PROVIDERS]


def register_view(request):
    if request.method == "POST":
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user, backend="django.contrib.auth.backends.ModelBackend")
            return redirect("map")
    else:
        form = UserCreationForm()
    return render(
        request,
        "maps/account.html",
        {
            "active_tab": "register",
            "register_form": form,
            "login_form": AuthenticationForm(),
            "social_buttons": social_buttons(request),
        },
    )


class LoginView(BaseLoginView):
    template_name = "maps/account.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["active_tab"] = "login"
        context["login_form"] = context.pop("form")
        context["register_form"] = UserCreationForm()
        context["social_buttons"] = social_buttons(self.request)
        return context
