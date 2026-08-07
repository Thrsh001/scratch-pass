import json

from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.contrib.auth.views import LoginView as BaseLoginView
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_POST

from .regions import valid_region_ids


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

    visited = request.user.profile.toggle_region(region)
    return JsonResponse({"visited": visited})


def register_view(request):
    if request.method == "POST":
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect("map")
    else:
        form = UserCreationForm()
    return render(
        request,
        "maps/account.html",
        {"active_tab": "register", "register_form": form, "login_form": AuthenticationForm()},
    )


class LoginView(BaseLoginView):
    template_name = "maps/account.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["active_tab"] = "login"
        context["login_form"] = context.pop("form")
        context["register_form"] = UserCreationForm()
        return context
