
import os
import pandas as pd
from django.core.management.base import BaseCommand
from apps.learning.models import AptitudeTopic, AptitudeQuestion

class Command(BaseCommand):
    help = 'Load aptitude questions from Excel files'

    def handle(self, *args, **options):
        dataset_path = r"c:\projects\ramcoad.com\problem_dataset\apptitude"
        
        # 1. Ensure a top-level category exists
        quant_cat, _ = AptitudeTopic.objects.get_or_create(
            title="QUANTITATIVE APTITUDE",
            parent=None,
            defaults={'description': 'Quantitative reasoning and mathematical aptitude', 'icon_name': 'Calculator'}
        )
        
        files = [f for f in os.listdir(dataset_path) if f.endswith('.xlsx')]
        
        for filename in files:
            file_path = os.path.join(dataset_path, filename)
            # Derive topic name from filename (e.g., "AVERAGES" from "AVERAGES_Questions.xlsx")
            topic_name = filename.split('_')[0].replace('.xlsx', '').replace('_', ' ').strip()
            
            self.stdout.write(f"Processing: {topic_name} ({filename})")
            
            # Create/Get Main Topic under Quantitative Aptitude
            main_topic, _ = AptitudeTopic.objects.get_or_create(
                title=topic_name,
                parent=quant_cat
            )
            
            try:
                df = pd.read_excel(file_path)
                
                # Check required columns
                required_cols = ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Answer']
                if not all(col in df.columns for col in required_cols):
                    self.stdout.write(self.style.ERROR(f"Skipping {filename}: Missing columns"))
                    continue
                
                for _, row in df.iterrows():
                    # Get or create sub-topic
                    sub_topic_name = str(row.get('Sub-Topic', topic_name)).strip()
                    sub_topic, _ = AptitudeTopic.objects.get_or_create(
                        title=sub_topic_name,
                        parent=main_topic
                    )
                    
                    # Create question
                    # We use get_or_create or just create? To avoid duplicates, let's use question_text
                    question_text = str(row['Question']).strip()
                    
                    # Some files might have different case for answer column
                    ans = str(row['Answer']).strip().upper()
                    if len(ans) > 1: # Sometimes it might be "Option A"
                        ans = ans[-1]
                    
                    AptitudeQuestion.objects.get_or_create(
                        topic=sub_topic,
                        question_text=question_text,
                        defaults={
                            'option_a': str(row['Option A']),
                            'option_b': str(row['Option B']),
                            'option_c': str(row['Option C']),
                            'option_d': str(row['Option D']),
                            'correct_option': ans,
                            'explanation': str(row.get('Explanation', '')),
                            'difficulty': str(row.get('Level', 'Easy'))
                        }
                    )
                
                self.stdout.write(self.style.SUCCESS(f"Loaded {len(df)} questions for {topic_name}"))
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error processing {filename}: {e}"))

        self.stdout.write(self.style.SUCCESS("Aptitude data loading complete!"))
