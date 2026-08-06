from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.contrib.auth.views import LoginView as BaseLoginView
from django.shortcuts import redirect, render


@login_required
def map_view(request):
    return render(request, "maps/map.html")


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
