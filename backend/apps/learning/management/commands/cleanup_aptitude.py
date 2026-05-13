
import os
from django.core.management.base import BaseCommand
from apps.learning.models import AptitudeTopic, AptitudeQuestion

class Command(BaseCommand):
    help = 'Cleanup duplicate topics and merge them into the correct numbered categories'

    def handle(self, *args, **options):
        # 1. Define the target (numbered) categories
        targets = {
            'logic': {
                'id': 414,
                'correct_title': '2. LOGICAL REASONING',
                'search_titles': ['LOGICAL REASONING', '2. LOGICAL REASONING']
            },
            'verbal': {
                'id': 415,
                'correct_title': '3. VERBAL ABILITY (ENGLISH)',
                'search_titles': ['VERBAL ABILITY (ENGLISH)', '3. VERBAL ABILITY (ENGLISH)']
            }
        }

        for key, info in targets.items():
            # Get the main target category
            try:
                main_cat = AptitudeTopic.objects.get(id=info['id'])
                # Ensure title is correct
                if main_cat.title != info['correct_title']:
                    self.stdout.write(f"Correcting title for ID {main_cat.id}: {main_cat.title} -> {info['correct_title']}")
                    main_cat.title = info['correct_title']
                    main_cat.save()
            except AptitudeTopic.DoesNotExist:
                # Fallback: Find by one of the search titles if ID doesn't match (unlikely in this env)
                main_cat = AptitudeTopic.objects.filter(title__in=info['search_titles'], parent=None).first()
                if not main_cat:
                    self.stdout.write(self.style.ERROR(f"Target category {info['correct_title']} not found!"))
                    continue
            
            # Find duplicates (same title or variant, parent=None, but NOT the main_cat)
            duplicates = AptitudeTopic.objects.filter(
                title__in=info['search_titles'], 
                parent=None
            ).exclude(id=main_cat.id)

            for dup in duplicates:
                self.stdout.write(f"Merging duplicate category {dup.id}: {dup.title} into {main_cat.title}")
                
                # Move all subtopics from duplicate to main
                subtopics = AptitudeTopic.objects.filter(parent=dup)
                for sub in subtopics:
                    self.stdout.write(f"  Moving subtopic: {sub.title}")
                    sub.parent = main_cat
                    sub.save()
                
                # Move any direct questions (though they should be in subtopics)
                questions = AptitudeQuestion.objects.filter(topic=dup)
                for q in questions:
                    q.topic = main_cat
                    q.save()
                
                # Delete the duplicate
                dup.delete()
                self.stdout.write(self.style.SUCCESS(f"Deleted duplicate {dup.id}"))

        self.stdout.write(self.style.SUCCESS("Cleanup complete!"))
