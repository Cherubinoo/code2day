"""
Load LeetCode problems from CSV file to MySQL database.
CSV: problem_dataset/leetcode_dataset - lc.csv
"""
import os
import sys
import csv
import re
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
django.setup()

from apps.learning.models import Problem
from apps.learning.services.problem_testcases import sync_problem_test_cases


def parse_examples_from_description(description):
    """Parse example blocks from description text."""
    examples = []
    
    # Find all Example sections
    example_pattern = r'Example \d+:\s*Input:\s*(.+?)\s*Output:\s*(.+?)(?:\s*Explanation:\s*(.+?))?(?=Example \d+:|Constraints:|$)'
    matches = re.findall(example_pattern, description, re.DOTALL)
    
    for match in matches:
        input_str = match[0].strip()
        output_str = match[1].strip()
        explanation = match[2].strip() if len(match) > 2 and match[2] else ""
        
        examples.append({
            "input": input_str,
            "output": output_str,
            "explanation": explanation
        })
    
    return examples


def clean_description(description):
    """Remove example blocks from description for cleaner text."""
    # Remove example sections
    cleaned = re.sub(r'Example \d+:.+?(?=Example \d+:|Constraints:|$)', '', description, flags=re.DOTALL)
    # Remove constraints section
    cleaned = re.sub(r'Constraints:.+?$', '', cleaned, flags=re.DOTALL)
    # Clean up extra whitespace
    cleaned = cleaned.strip()
    return cleaned


def create_slug(title):
    """Create URL-friendly slug from title."""
    slug = title.lower()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[-\s]+', '-', slug)
    return slug[:50]


def import_problems_from_csv(csv_path):
    """Import problems from CSV file."""
    imported = 0
    skipped = 0
    errors = []
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            try:
                problem_id = row.get('id', '').strip()
                title = row.get('title', '').strip()
                description = row.get('description', '').strip()
                difficulty = row.get('difficulty', 'Medium').strip()
                related_topics = row.get('related_topics', '').strip()
                solution_link = row.get('solution_link', '').strip()
                
                if not problem_id or not title:
                    continue
                
                # Check if already exists
                existing = Problem.objects.filter(source_dataset_id=problem_id).first()
                if existing:
                    skipped += 1
                    continue
                
                # Create slug
                slug = create_slug(title)
                
                # Parse tags from related_topics
                tags = [t.strip() for t in related_topics.split(',') if t.strip()]
                
                # Parse examples from description
                examples = parse_examples_from_description(description)
                
                # Clean description (remove examples/constraints)
                clean_desc = clean_description(description)
                
                # Create problem
                problem = Problem.objects.create(
                    slug=slug,
                    title=title,
                    description=clean_desc,
                    difficulty=difficulty,
                    tags=tags,
                    examples=examples,
                    hints=[],  # Not in CSV
                    editorial=solution_link,
                    source_dataset_id=problem_id,
                )
                sync_problem_test_cases(problem)
                imported += 1
                
                if imported % 100 == 0:
                    print(f"  Imported {imported} problems...")
                
            except Exception as e:
                errors.append(f"Row {row.get('id', 'unknown')}: {e}")
                continue
    
    return imported, skipped, errors


def main():
    print("=" * 60)
    print("LEETCODE CSV IMPORT")
    print("=" * 60)
    
    csv_path = os.path.join(
        os.path.dirname(__file__), 
        '..', '..', 
        'problem_dataset', 
        'leetcode_dataset - lc.csv'
    )
    
    if not os.path.exists(csv_path):
        print(f"CSV file not found: {csv_path}")
        sys.exit(1)
    
    print(f"\nCSV file: {csv_path}")
    print("\nImporting problems...")
    
    imported, skipped, errors = import_problems_from_csv(csv_path)
    
    print(f"\nImport completed!")
    print(f"   Imported: {imported}")
    print(f"   Skipped: {skipped}")
    
    if errors:
        print(f"   Errors: {len(errors)}")
        for err in errors[:5]:  # Show first 5 errors
            print(f"     - {err}")


if __name__ == "__main__":
    main()
