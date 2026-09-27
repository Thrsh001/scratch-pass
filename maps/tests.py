import json
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import requests
from allauth.socialaccount.models import SocialAccount
from django.contrib.auth.models import User
from django.test import Client, TestCase, override_settings
from django.urls import reverse

from .models import UserProfile
from .regions import has_subdivisions, subdivision_svg_path, valid_region_ids


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
        # 242 top-level (237 + 5 France overseas departments, SP-13.4) +
        # 20 Italy (SP-13.2) + 16 Germany + 32 Mexico + 19 Spain + 4 UK +
        # 51 US + 8 Australia + 27 Brazil + 13 Canada + 31 China + 13
        # France (metro) + 47 Japan + 36 India + 85 Russia subdivisions
        # (SP-13.4)
        self.assertEqual(len(ids), 644)
        self.assertEqual(sum(1 for i in ids if ":" not in i), 242)

    def test_contains_sp13_missing_entities(self):
        ids = valid_region_ids()

        self.assertIn("MC", ids)  # Monaco
        self.assertIn("SG", ids)  # Singapore
        self.assertIn("VA", ids)  # Vatican City

    def test_contains_italy_subdivisions(self):
        ids = valid_region_ids()

        self.assertIn("IT:52", ids)  # Toscana
        self.assertEqual(sum(1 for i in ids if i.startswith("IT:")), 20)

    def test_contains_germany_subdivisions(self):
        ids = valid_region_ids()

        self.assertIn("DE:BY", ids)  # Bavaria
        self.assertEqual(sum(1 for i in ids if i.startswith("DE:")), 16)

    def test_contains_mexico_subdivisions(self):
        ids = valid_region_ids()

        self.assertIn("MX:CMX", ids)  # Mexico City (current code, not stale MX-DIF)
        self.assertNotIn("MX:DIF", ids)
        self.assertEqual(sum(1 for i in ids if i.startswith("MX:")), 32)

    def test_contains_spain_subdivisions(self):
        ids = valid_region_ids()

        self.assertIn("ES:CT", ids)  # Catalonia
        self.assertEqual(sum(1 for i in ids if i.startswith("ES:")), 19)

    def test_contains_uk_subdivisions(self):
        ids = valid_region_ids()

        self.assertIn("GB:SCT", ids)  # Scotland
        self.assertEqual(sum(1 for i in ids if i.startswith("GB:")), 4)

    def test_contains_us_subdivisions(self):
        ids = valid_region_ids()

        self.assertIn("US:CA", ids)  # California
        self.assertIn("US:AK", ids)  # Alaska
        self.assertIn("US:HI", ids)  # Hawaii
        self.assertIn("US:DC", ids)  # District of Columbia
        self.assertEqual(sum(1 for i in ids if i.startswith("US:")), 51)

    def test_contains_australia_subdivisions(self):
        ids = valid_region_ids()

        self.assertIn("AU:NSW", ids)  # New South Wales
        self.assertNotIn("AU:X02", ids)  # Jervis Bay Territory, no real ISO code
        self.assertEqual(sum(1 for i in ids if i.startswith("AU:")), 8)

    def test_contains_brazil_subdivisions(self):
        ids = valid_region_ids()

        self.assertIn("BR:SP", ids)  # São Paulo
        self.assertEqual(sum(1 for i in ids if i.startswith("BR:")), 27)

    def test_contains_canada_subdivisions(self):
        ids = valid_region_ids()

        self.assertIn("CA:NU", ids)  # Nunavut
        self.assertEqual(sum(1 for i in ids if i.startswith("CA:")), 13)

    def test_contains_china_subdivisions(self):
        ids = valid_region_ids()

        self.assertIn("CN:BJ", ids)  # Beijing
        # Deliberately 31, not 34 -- Taiwan/Hong Kong/Macau are already
        # independent top-level countries (TW/HK/MO, added in SP-13.1).
        self.assertNotIn("CN:TW", ids)
        self.assertNotIn("CN:HK", ids)
        self.assertNotIn("CN:MO", ids)
        self.assertEqual(sum(1 for i in ids if i.startswith("CN:")), 31)

    def test_contains_france_metro_subdivisions(self):
        ids = valid_region_ids()

        self.assertIn("FR:IDF", ids)  # Île-de-France
        self.assertIn("FR:20R", ids)  # Corsica (non-obvious real ISO code)
        self.assertEqual(sum(1 for i in ids if i.startswith("FR:")), 13)

    def test_contains_france_overseas_departments_as_top_level(self):
        ids = valid_region_ids()

        for code in ("GP", "MQ", "GF", "RE", "YT"):
            self.assertIn(code, ids)
            self.assertNotIn(f"FR:{code}", ids)

    def test_contains_japan_subdivisions(self):
        ids = valid_region_ids()

        self.assertIn("JP:13", ids)  # Tokyo
        self.assertEqual(sum(1 for i in ids if i.startswith("JP:")), 47)

    def test_contains_india_subdivisions(self):
        ids = valid_region_ids()

        self.assertIn("IN:DL", ids)  # Delhi
        # ISO changed these 4 codes 2023-11-23; Natural Earth's source data
        # still had the old ones -- verified against Wikipedia and fixed.
        self.assertIn("IN:CG", ids)  # Chhattisgarh
        self.assertIn("IN:OD", ids)  # Odisha
        self.assertIn("IN:TS", ids)  # Telangana
        self.assertIn("IN:UK", ids)  # Uttarakhand
        self.assertNotIn("IN:CT", ids)
        self.assertNotIn("IN:OR", ids)
        self.assertNotIn("IN:TG", ids)
        self.assertNotIn("IN:UT", ids)
        self.assertEqual(sum(1 for i in ids if i.startswith("IN:")), 36)

    def test_contains_russia_subdivisions(self):
        ids = valid_region_ids()

        # Natural Earth has these two swapped -- verified against Wikipedia.
        self.assertIn("RU:MOW", ids)  # Moscow (city)
        self.assertIn("RU:MOS", ids)  # Moscow Oblast
        # Not ISO codes (ISO 3166-2:RU has none for these); deliberate
        # exception so the drill-down matches world.svg's RU polygon.
        self.assertIn("RU:CR", ids)  # Crimea
        self.assertIn("RU:SEV", ids)  # Sevastopol
        self.assertNotIn("RU:43", ids)
        self.assertNotIn("RU:40", ids)
        self.assertEqual(sum(1 for i in ids if i.startswith("RU:")), 85)

    def test_has_subdivisions_true_for_country_with_regions(self):
        self.assertTrue(has_subdivisions("IT"))
        self.assertTrue(has_subdivisions("DE"))
        self.assertTrue(has_subdivisions("MX"))
        self.assertTrue(has_subdivisions("ES"))
        self.assertTrue(has_subdivisions("GB"))
        self.assertTrue(has_subdivisions("US"))
        self.assertTrue(has_subdivisions("AU"))
        self.assertTrue(has_subdivisions("BR"))
        self.assertTrue(has_subdivisions("CA"))
        self.assertTrue(has_subdivisions("CN"))
        self.assertTrue(has_subdivisions("FR"))
        self.assertTrue(has_subdivisions("JP"))
        self.assertTrue(has_subdivisions("IN"))
        self.assertTrue(has_subdivisions("RU"))

    def test_has_subdivisions_false_for_plain_country(self):
        self.assertFalse(has_subdivisions("PT"))

    def test_has_subdivisions_false_for_countries_treated_as_top_level(self):
        # Taiwan/Hong Kong/Macau are independent top-level countries
        # (SP-13.1), not China subdivisions, despite ISO 3166-2:CN formally
        # listing them -- see China's implementation note under SP-13.4.
        self.assertFalse(has_subdivisions("TW"))
        self.assertFalse(has_subdivisions("HK"))
        self.assertFalse(has_subdivisions("MO"))
        # Same story for France's overseas departments (SP-13.4).
        self.assertFalse(has_subdivisions("GP"))
        self.assertFalse(has_subdivisions("MQ"))
        self.assertFalse(has_subdivisions("GF"))
        self.assertFalse(has_subdivisions("RE"))
        self.assertFalse(has_subdivisions("YT"))

    def test_has_subdivisions_false_for_subdivision_itself(self):
        self.assertFalse(has_subdivisions("IT:52"))

    def test_excludes_malformed_or_unknown_codes(self):
        ids = valid_region_ids()

        self.assertNotIn("ZZ", ids)
        self.assertNotIn("usa", ids)
        self.assertNotIn("", ids)


class SubdivisionSvgViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="oskar", password="pw12345")
        self.client.login(username="oskar", password="pw12345")

    def test_returns_svg_content_when_country_has_subdivisions(self):
        response = self.client.get(reverse("subdivision_svg", args=["IT"]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/svg+xml")
        self.assertIn(b'data-region="IT:52"', response.content)

    def test_returns_404_when_country_has_no_subdivisions(self):
        response = self.client.get(reverse("subdivision_svg", args=["ZZ"]))

        self.assertEqual(response.status_code, 404)

    def test_returns_svg_content_for_a_second_country(self):
        response = self.client.get(reverse("subdivision_svg", args=["DE"]))

        self.assertEqual(response.status_code, 200)
        self.assertIn(b'data-region="DE:BY"', response.content)

    def test_returns_svg_content_including_alaska_and_hawaii(self):
        response = self.client.get(reverse("subdivision_svg", args=["US"]))

        self.assertEqual(response.status_code, 200)
        self.assertIn(b'data-region="US:AK"', response.content)
        self.assertIn(b'data-region="US:HI"', response.content)

    def test_returns_svg_content_excluding_taiwan_hongkong_macau(self):
        response = self.client.get(reverse("subdivision_svg", args=["CN"]))

        self.assertEqual(response.status_code, 200)
        self.assertIn(b'data-region="CN:BJ"', response.content)
        self.assertNotIn(b'data-region="CN:TW"', response.content)

    def test_returns_404_for_france_since_overseas_split_left_it_generic(self):
        # FR still has subdivisions (13 metro regions) -- this just checks
        # a plain unrelated code has no file, using one of the new
        # top-level codes to confirm it's NOT treated as subdividable.
        response = self.client.get(reverse("subdivision_svg", args=["GP"]))

        self.assertEqual(response.status_code, 404)

    def test_returns_svg_content_for_france_metro_only(self):
        response = self.client.get(reverse("subdivision_svg", args=["FR"]))

        self.assertEqual(response.status_code, 200)
        self.assertIn(b'data-region="FR:IDF"', response.content)

    def test_returns_svg_content_for_russia(self):
        response = self.client.get(reverse("subdivision_svg", args=["RU"]))

        self.assertEqual(response.status_code, 200)
        self.assertIn(b'data-region="RU:MOW"', response.content)

    def test_rejects_anonymous_request(self):
        self.client.logout()

        response = self.client.get(reverse("subdivision_svg", args=["IT"]))

        self.assertEqual(response.status_code, 401)

    def test_rejects_post_request(self):
        response = self.client.post(reverse("subdivision_svg", args=["IT"]))

        self.assertEqual(response.status_code, 405)

    def test_subdivision_svg_path_returns_none_for_unknown_code(self):
        self.assertIsNone(subdivision_svg_path("ZZ"))

    def test_subdivision_svg_path_returns_path_for_known_code(self):
        self.assertIsNotNone(subdivision_svg_path("IT"))


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
        response = self._post("PT")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"visited": ["PT"]})
        self.assertEqual(
            UserProfile.objects.get(user=self.user).visited_regions, ["PT"]
        )

    def test_removes_region_when_valid_and_present(self):
        self._post("PT")

        response = self._post("PT")

        self.assertEqual(response.json(), {"visited": []})

    def test_rejects_unknown_region_id(self):
        response = self._post("ZZ")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(UserProfile.objects.get(user=self.user).visited_regions, [])

    def test_accepts_subdivision_region_id(self):
        response = self._post("IT:52")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"visited": ["IT:52"]})

    def test_rejects_toggling_a_region_that_has_subdivisions(self):
        response = self._post("IT")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(UserProfile.objects.get(user=self.user).visited_regions, [])

    def test_rejects_unknown_subdivision_id(self):
        response = self._post("IT:99")

        self.assertEqual(response.status_code, 400)

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

        response = self._post("PT")

        self.assertEqual(response.status_code, 401)

    def test_rejects_missing_csrf_token(self):
        strict_client = Client(enforce_csrf_checks=True)
        strict_client.login(username="karl", password="pw12345")

        response = strict_client.post(
            reverse("toggle_visit"),
            data=json.dumps({"region": "PT"}),
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


FACEBOOK_CONFIGURED = {
    "facebook": {
        "APPS": [{"client_id": "test-app-id", "secret": "test-app-secret"}],
        "SCOPE": ["email", "public_profile"],
    }
}
GOOGLE_CONFIGURED = {
    "google": {
        "APPS": [{"client_id": "test-client-id", "secret": "test-client-secret"}],
        "SCOPE": ["profile", "email"],
    }
}


def _json_response(payload):
    response = requests.Response()
    response.status_code = 200
    response.headers["Content-Type"] = "application/json"
    response._content = json.dumps(payload).encode()
    return response


def _fake_facebook_api(method, url, **kwargs):
    """Stands in for Facebook's Graph API (the true external system): the
    code-for-token exchange, then the /me profile lookup."""
    if url.endswith("/oauth/access_token"):
        return _json_response({"access_token": "test-token", "expires_in": 3600})
    if url.endswith("/me"):
        return _json_response(
            {"id": "fb-123", "email": "hana@example.com", "name": "Hana Test",
             "first_name": "Hana", "last_name": "Test"}
        )
    raise AssertionError(f"unexpected outbound request: {method} {url}")


class SocialButtonsTests(TestCase):
    @override_settings(SOCIALACCOUNT_PROVIDERS={})
    def test_buttons_disabled_when_no_provider_configured(self):
        response = self.client.get(reverse("login"))

        self.assertContains(response, 'disabled title="Not configured"', count=4)
        self.assertNotContains(response, reverse("google_login"))

    @override_settings(SOCIALACCOUNT_PROVIDERS={**GOOGLE_CONFIGURED, **FACEBOOK_CONFIGURED})
    def test_buttons_post_to_provider_login_when_configured(self):
        response = self.client.get(reverse("login"))

        self.assertNotContains(response, "Not configured")
        self.assertContains(response, f'<form method="post" action="{reverse("google_login")}">', count=2)
        self.assertContains(response, f'<form method="post" action="{reverse("facebook_login")}">', count=2)

    @override_settings(SOCIALACCOUNT_PROVIDERS=GOOGLE_CONFIGURED)
    def test_google_login_redirects_to_google_when_posted(self):
        response = self.client.post(reverse("google_login"))

        self.assertEqual(response.status_code, 302)
        self.assertTrue(response["Location"].startswith("https://accounts.google.com/"))


@override_settings(SOCIALACCOUNT_PROVIDERS=FACEBOOK_CONFIGURED)
class FacebookLoginFlowTests(TestCase):
    def _start_login(self):
        response = self.client.post(reverse("facebook_login"))
        return parse_qs(urlparse(response["Location"]).query)["state"][0]

    def _complete_login(self):
        state = self._start_login()
        with patch.object(requests.Session, "request", side_effect=_fake_facebook_api):
            return self.client.get(
                reverse("facebook_callback"), {"code": "test-code", "state": state}
            )

    def test_creates_user_with_profile_and_logs_in_when_first_login(self):
        response = self._complete_login()

        self.assertRedirects(response, reverse("map"))
        account = SocialAccount.objects.get(provider="facebook", uid="fb-123")
        self.assertEqual(account.user.profile.visited_regions, [])
        self.assertEqual(self.client.session["_auth_user_id"], str(account.user.pk))

    def test_reuses_same_user_when_logging_in_again(self):
        self._complete_login()
        self.client.logout()

        self._complete_login()

        self.assertEqual(SocialAccount.objects.filter(uid="fb-123").count(), 1)
        self.assertEqual(User.objects.count(), 1)

    def test_redirects_to_login_with_notice_when_user_cancels(self):
        state = self._start_login()

        response = self.client.get(
            reverse("facebook_callback"), {"error": "access_denied", "state": state},
            follow=True,
        )

        self.assertRedirects(response, reverse("login"))
        self.assertContains(response, "Facebook login was cancelled.")
        self.assertFalse(User.objects.exists())

    def test_redirects_to_login_with_error_when_state_invalid(self):
        self._start_login()

        response = self.client.get(
            reverse("facebook_callback"), {"code": "test-code", "state": "forged"},
            follow=True,
        )

        self.assertRedirects(response, reverse("login"))
        self.assertContains(response, "Facebook login failed.")
        self.assertFalse(User.objects.exists())
