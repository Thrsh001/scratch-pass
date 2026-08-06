from django.contrib.auth import login
from django.contrib.auth.forms import UserCreationForm
from django.shortcuts import redirect, render


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
    return render(request, "maps/register.html", {"form": form})
