from django.contrib.auth.models import User
from django.test import TestCase

from .models import UserProfile


class UserProfileTests(TestCase):
    def test_visited_regions_defaults_to_empty_list_when_profile_created(self):
        user = User.objects.create_user(username="alice", password="pw")

        profile = UserProfile.objects.create(user=user)

        self.assertEqual(profile.visited_regions, [])

    def test_str_includes_user_id_when_profile_created(self):
        user = User.objects.create_user(username="bob", password="pw")
        profile = UserProfile.objects.create(user=user)

        self.assertEqual(str(profile), f"Profile<{user.id}>")
