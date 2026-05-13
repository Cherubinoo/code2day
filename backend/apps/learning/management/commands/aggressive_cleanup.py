
import os
from django.core.management.base import BaseCommand
from apps.learning.models import AptitudeTopic, AptitudeQuestion

class Command(BaseCommand):
    help = 'Aggressive cleanup of duplicate topics'

    def handle(self, *args, **options):
        # 1. Target parent IDs
        parents = {
            414: "LOGICAL REASONING",
            415: "VERBAL ABILITY"
        }

        for pid, name in parents.items():
            try:
                target = AptitudeTopic.objects.get(id=pid)
            except AptitudeTopic.DoesNotExist:
                continue

            # Find any OTHER parent topic that contains the name
            others = AptitudeTopic.objects.filter(
                parent=None,
                title__icontains=name
            ).exclude(id=pid)

            for other in others:
                self.stdout.write(f"Merging {other.title} (ID: {other.id}) into {target.title}")
                # Move children
                AptitudeTopic.objects.filter(parent=other).update(parent=target)
                # Move questions
                AptitudeQuestion.objects.filter(topic=other).update(topic=target)
                # Delete
                other.delete()

        self.stdout.write(self.style.SUCCESS("Aggressive cleanup complete!"))
