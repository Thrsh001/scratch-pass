from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from .models import UserProfile


class UserProfileTests(TestCase):
    def test_visited_regions_defaults_to_empty_list_when_profile_created(self):
        user = User.objects.create_user(username="alice", password="pw")

        self.assertEqual(user.profile.visited_regions, [])

    def test_str_includes_user_id_when_profile_created(self):
        user = User.objects.create_user(username="bob", password="pw")

        self.assertEqual(str(user.profile), f"Profile<{user.id}>")

    def test_profile_auto_created_when_user_saved(self):
        user = User.objects.create_user(username="carol", password="pw")

        self.assertTrue(UserProfile.objects.filter(user=user).exists())

    def test_profile_not_duplicated_when_existing_user_saved_again(self):
        user = User.objects.create_user(username="dave", password="pw")

        user.first_name = "Dave"
        user.save()

        self.assertEqual(UserProfile.objects.filter(user=user).count(), 1)


class RegisterViewTests(TestCase):
    def test_creates_user_and_logs_in_when_valid_data_submitted(self):
        response = self.client.post(
            reverse("register"),
            {
                "username": "erin",
                "password1": "a-very-uncommon-pw-93",
                "password2": "a-very-uncommon-pw-93",
            },
        )

        self.assertRedirects(response, reverse("map"))
        user = User.objects.get(username="erin")
        self.assertTrue(user.profile)
        self.assertIn("_auth_user_id", self.client.session)

    def test_redisplays_form_when_passwords_mismatched(self):
        response = self.client.post(
            reverse("register"),
            {
                "username": "frank",
                "password1": "a-very-uncommon-pw-93",
                "password2": "does-not-match",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(User.objects.filter(username="frank").exists())


class AccountPageTests(TestCase):
    def test_login_url_renders_shared_template_with_login_tab_active(self):
        response = self.client.get(reverse("login"))

        self.assertTemplateUsed(response, "maps/account.html")
        self.assertEqual(response.context["active_tab"], "login")
        self.assertContains(response, 'id="tab-login" class="auth-tab-input" checked')
        self.assertContains(response, "Continue with Google")
        self.assertContains(response, "Continue with Facebook")

    def test_register_url_renders_shared_template_with_register_tab_active(self):
        response = self.client.get(reverse("register"))

        self.assertTemplateUsed(response, "maps/account.html")
        self.assertEqual(response.context["active_tab"], "register")
        self.assertContains(response, 'id="tab-register" class="auth-tab-input" checked')


class LoginLogoutViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="gina", password="pw12345")

    def test_authenticates_when_credentials_valid(self):
        response = self.client.post(
            reverse("login"), {"username": "gina", "password": "pw12345"}
        )

        self.assertRedirects(response, reverse("map"))
        self.assertIn("_auth_user_id", self.client.session)

    def test_rejects_when_credentials_invalid(self):
        response = self.client.post(
            reverse("login"), {"username": "gina", "password": "wrong"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_clears_session_when_authenticated_user_logs_out(self):
        self.client.login(username="gina", password="pw12345")

        response = self.client.post(reverse("logout"))

        self.assertRedirects(response, reverse("login"))
        self.assertNotIn("_auth_user_id", self.client.session)


class MapViewTests(TestCase):
    def test_redirects_to_login_when_logged_out(self):
        response = self.client.get(reverse("map"))

        self.assertRedirects(
            response, f"{reverse('login')}?next={reverse('map')}"
        )

    def test_renders_map_when_logged_in(self):
        User.objects.create_user(username="hank", password="pw12345")
        self.client.login(username="hank", password="pw12345")

        response = self.client.get(reverse("map"))

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "maps/map.html")
