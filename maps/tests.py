import json

from django.contrib.auth.models import User
from django.test import Client, TestCase
from django.urls import reverse

from .models import UserProfile
from .regions import valid_region_ids


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

    def test_toggle_region_adds_when_absent(self):
        user = User.objects.create_user(username="ivan", password="pw")

        result = user.profile.toggle_region("US")

        self.assertEqual(result, ["US"])
        self.assertEqual(
            UserProfile.objects.get(pk=user.profile.pk).visited_regions, ["US"]
        )

    def test_toggle_region_removes_when_present(self):
        user = User.objects.create_user(username="julia", password="pw")
        user.profile.toggle_region("US")

        result = user.profile.toggle_region("US")

        self.assertEqual(result, [])
        self.assertEqual(
            UserProfile.objects.get(pk=user.profile.pk).visited_regions, []
        )


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


class ValidRegionIdsTests(TestCase):
    def test_contains_known_country_codes(self):
        ids = valid_region_ids()

        self.assertIn("US", ids)
        self.assertIn("IT", ids)
        self.assertEqual(len(ids), 175)

    def test_excludes_malformed_or_unknown_codes(self):
        ids = valid_region_ids()

        self.assertNotIn("ZZ", ids)
        self.assertNotIn("usa", ids)
        self.assertNotIn("", ids)


class ToggleVisitViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="karl", password="pw12345")
        self.client.login(username="karl", password="pw12345")

    def _post(self, region):
        return self.client.post(
            reverse("toggle_visit"),
            data=json.dumps({"region": region}),
            content_type="application/json",
        )

    def test_adds_region_when_valid_and_absent(self):
        response = self._post("US")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"visited": ["US"]})
        self.assertEqual(
            UserProfile.objects.get(user=self.user).visited_regions, ["US"]
        )

    def test_removes_region_when_valid_and_present(self):
        self._post("US")

        response = self._post("US")

        self.assertEqual(response.json(), {"visited": []})

    def test_rejects_unknown_region_id(self):
        response = self._post("ZZ")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(UserProfile.objects.get(user=self.user).visited_regions, [])

    def test_rejects_missing_region_key(self):
        response = self.client.post(
            reverse("toggle_visit"), data=json.dumps({}), content_type="application/json"
        )

        self.assertEqual(response.status_code, 400)

    def test_rejects_malformed_json_body(self):
        response = self.client.post(
            reverse("toggle_visit"), data="not json", content_type="application/json"
        )

        self.assertEqual(response.status_code, 400)

    def test_rejects_get_request(self):
        response = self.client.get(reverse("toggle_visit"))

        self.assertEqual(response.status_code, 405)

    def test_rejects_anonymous_request(self):
        self.client.logout()

        response = self._post("US")

        self.assertEqual(response.status_code, 401)

    def test_rejects_missing_csrf_token(self):
        strict_client = Client(enforce_csrf_checks=True)
        strict_client.login(username="karl", password="pw12345")

        response = strict_client.post(
            reverse("toggle_visit"),
            data=json.dumps({"region": "US"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)


class GetVisitsViewTests(TestCase):
    def test_returns_empty_list_when_nothing_visited(self):
        User.objects.create_user(username="liam", password="pw12345")
        self.client.login(username="liam", password="pw12345")

        response = self.client.get(reverse("get_visits"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"visited": []})

    def test_returns_only_the_requesting_users_visited_list(self):
        liam = User.objects.create_user(username="liam2", password="pw12345")
        liam.profile.toggle_region("US")
        mia = User.objects.create_user(username="mia", password="pw12345")
        mia.profile.toggle_region("IT")

        self.client.login(username="liam2", password="pw12345")
        response = self.client.get(reverse("get_visits"))

        self.assertEqual(response.json(), {"visited": ["US"]})

    def test_rejects_anonymous_request(self):
        response = self.client.get(reverse("get_visits"))

        self.assertEqual(response.status_code, 401)

    def test_rejects_post_request(self):
        User.objects.create_user(username="noah", password="pw12345")
        self.client.login(username="noah", password="pw12345")

        response = self.client.post(reverse("get_visits"))

        self.assertEqual(response.status_code, 405)
