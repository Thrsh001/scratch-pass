from django.conf import settings
from django.db import models, transaction


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    visited_regions = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile<{self.user_id}>"

    def toggle_region(self, region_id):
        """Add region_id if absent, remove if present. Row-locked
        read-modify-write so concurrent toggles (double-click, multi-tab)
        can't clobber each other's result."""
        with transaction.atomic():
            profile = UserProfile.objects.select_for_update().get(pk=self.pk)
            if region_id in profile.visited_regions:
                profile.visited_regions = [
                    r for r in profile.visited_regions if r != region_id
                ]
            else:
                profile.visited_regions = [*profile.visited_regions, region_id]
            profile.save(update_fields=["visited_regions", "updated_at"])
        self.visited_regions = profile.visited_regions
        return profile.visited_regions
