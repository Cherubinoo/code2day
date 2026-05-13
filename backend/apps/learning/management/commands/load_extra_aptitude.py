
import os
import pandas as pd
from django.core.management.base import BaseCommand
from apps.learning.models import AptitudeTopic, AptitudeQuestion

class Command(BaseCommand):
    help = 'Load aptitude questions from Logical Reasoning and Verbal Ability folders'

    def handle(self, *args, **options):
        # Base path - relative to the repo root
        from django.conf import settings
        # On server, dataset is at root of repo. In Docker, we'll mount it to /app/dataset
        base_path = os.path.join(settings.BASE_DIR.parent, "dataset")
        
        if not os.path.exists(base_path):
            # Fallback for Docker if mounted inside /app
            base_path = os.path.join(settings.BASE_DIR, "dataset")
        
        # User folders (swapped according to content)
        # dataset/LOGICAL REASONING -> actually VERBAL ABILITY
        # dataset/VERBAL ABILITY (ENGLISH) -> actually LOGICAL REASONING
        
        categories = [
            {
                "folder": "LOGICAL REASONING", 
                "parent_id": 415,  # VERBAL ABILITY
                "title": "3. VERBAL ABILITY (ENGLISH)"
            },
            {
                "folder": "VERBAL ABILITY (ENGLISH)", 
                "parent_id": 414,  # LOGICAL REASONING
                "title": "2. LOGICAL REASONING"
            }
        ]
        
        for cat_info in categories:
            folder_path = os.path.join(base_path, cat_info["folder"])
            if not os.path.exists(folder_path):
                self.stdout.write(self.style.WARNING(f"Folder not found: {folder_path}"))
                continue
                
            # 1. Get existing top-level category (Try ID first, then Title)
            parent_cat = None
            try:
                parent_cat = AptitudeTopic.objects.get(id=cat_info["parent_id"])
            except AptitudeTopic.DoesNotExist:
                parent_cat = AptitudeTopic.objects.filter(title__iexact=cat_info["title"], parent=None).first()
            
            if not parent_cat:
                self.stdout.write(self.style.ERROR(f"Parent category '{cat_info['title']}' (ID: {cat_info['parent_id']}) not found!"))
                continue
            
            files = [f for f in os.listdir(folder_path) if f.endswith('.xlsx')]
            
            for filename in files:
                file_path = os.path.join(folder_path, filename)
                # Topic name from filename
                topic_name = filename.replace('.xlsx', '').replace('_', ' ').strip()
                
                self.stdout.write(f"Processing category {cat_info['title']} -> topic: {topic_name}")
                
                # Create Main Topic under parent
                main_topic, _ = AptitudeTopic.objects.get_or_create(
                    title=topic_name,
                    parent=parent_cat
                )
                
                try:
                    df = pd.read_excel(file_path)
                    
                    # Columns in these files: ['Q.No', 'Level', 'Topic', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Answer', 'Explanation']
                    required_cols = ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Answer']
                    if not all(col in df.columns for col in required_cols):
                        self.stdout.write(self.style.ERROR(f"Skipping {filename}: Missing columns. Found: {df.columns.tolist()}"))
                        continue
                    
                    count = 0
                    for _, row in df.iterrows():
                        question_text = str(row['Question']).strip()
                        if not question_text or question_text == 'nan':
                            continue
                            
                        # Answer can be a single char or "Option A"
                        ans = str(row['Answer']).strip().upper()
                        if 'OPTION' in ans:
                            ans = ans.replace('OPTION', '').strip()
                        if len(ans) > 1:
                            ans = ans[-1]
                            
                        # Validate ans is A, B, C, or D
                        if ans not in ['A', 'B', 'C', 'D']:
                            # Fallback or log error
                            pass

                        AptitudeQuestion.objects.get_or_create(
                            topic=main_topic,
                            question_text=question_text,
                            defaults={
                                'option_a': str(row['Option A']),
                                'option_b': str(row['Option B']),
                                'option_c': str(row['Option C']),
                                'option_d': str(row['Option D']),
                                'correct_option': ans,
                                'explanation': str(row.get('Explanation', '')),
                                'difficulty': str(row.get('Level', 'Medium'))
                            }
                        )
                        count += 1
                    
                    self.stdout.write(self.style.SUCCESS(f"Loaded {count} questions for {topic_name}"))
                    
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"Error processing {filename}: {e}"))

        self.stdout.write(self.style.SUCCESS("Extra aptitude data loading complete!"))
