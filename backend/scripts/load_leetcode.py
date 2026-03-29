"""
Load LeetCode problems from HuggingFace dataset and import to MySQL.
Dataset: newfacade/LeetCodeDataset
"""
import os
import sys
import json
import requests
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
django.setup()

from apps.learning.models import Problem
from apps.learning.services.problem_testcases import sync_problem_test_cases

# HuggingFace Dataset API
HF_DATASET_API = "https://datasets-server.huggingface.co/rows"
DATASET_NAME = "newfacade/LeetCodeDataset"


def fetch_leetcode_dataset(limit=500):
    """Fetch LeetCode problems from HuggingFace dataset."""
    print(f"Fetching up to {limit} problems from HuggingFace...")
    
    all_problems = []
    offset = 0
    batch_size = 100
    
    while len(all_problems) < limit:
        params = {
            "dataset": DATASET_NAME,
            "config": "default",
            "split": "train",
            "offset": offset,
            "length": min(batch_size, limit - len(all_problems)),
        }
        
        try:
            response = requests.get(HF_DATASET_API, params=params, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            rows = data.get("rows", [])
            
            if not rows:
                break
            
            for row in rows:
                problem = row.get("row", {})
                if problem:
                    all_problems.append(problem)
            
            print(f"  Fetched {len(all_problems)} so far...")
            offset += len(rows)
            
            if len(rows) < batch_size:
                break
                
        except Exception as e:
            print(f"Error fetching: {e}")
            break
    
    return all_problems[:limit]


def transform_problem(problem):
    """Transform HuggingFace problem to Django format."""
    # Extract difficulty
    difficulty = problem.get("difficulty", "Medium")
    if isinstance(difficulty, str):
        difficulty = difficulty.capitalize()
    else:
        difficulty = "Medium"
    
    # Extract tags/topics
    tags = []
    if problem.get("topics"):
        if isinstance(problem["topics"], list):
            tags = problem["topics"]
        elif isinstance(problem["topics"], str):
            tags = [t.strip() for t in problem["topics"].split(",")]
    
    # Extract examples
    examples = []
    if problem.get("example"):
        ex = problem["example"]
        if isinstance(ex, dict):
            examples.append({
                "input": str(ex.get("input", "")),
                "output": str(ex.get("output", "")),
                "explanation": str(ex.get("explanation", "")),
            })
    
    # Extract hints
    hints = []
    if problem.get("hints"):
        if isinstance(problem["hints"], list):
            hints = [str(h) for h in problem["hints"]]
        elif isinstance(problem["hints"], str):
            hints = [problem["hints"]]
    
    # Create slug from title
    title = problem.get("title", "Untitled")
    slug = title.lower().replace(" ", "-").replace(".", "").replace("?", "").replace("!", "")[:50]
    
    return {
        "slug": slug,
        "title": title,
        "description": problem.get("description", problem.get("question", "")),
        "difficulty": difficulty,
        "tags": tags,
        "examples": examples,
        "hints": hints,
        "editorial": problem.get("solution", problem.get("editorial", "")),
        "source_dataset_id": str(problem.get("id", "")),
    }


def import_problems_to_mysql(problems_data):
    """Import problems to MySQL via Django ORM."""
    imported = 0
    skipped = 0
    
    for data in problems_data:
        # Check if already exists by source_dataset_id
        existing = Problem.objects.filter(source_dataset_id=data["source_dataset_id"]).first()
        
        if not existing:
            # Check by slug
            existing = Problem.objects.filter(slug=data["slug"]).first()
        
        if existing:
            skipped += 1
            continue
        
        try:
            problem = Problem.objects.create(**data)
            sync_problem_test_cases(problem)
            imported += 1
        except Exception as e:
            print(f"Error importing {data['title']}: {e}")
    
    return imported, skipped


def save_problems_backup(problems):
    """Save problems to JSON backup file."""
    output_file = os.path.join(os.path.dirname(__file__), "leetcode_problems_backup.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(problems, f, indent=2, ensure_ascii=False)
    print(f"Saved backup to {output_file}")


def main():
    print("=" * 60)
    print("LEETCODE DATASET: HuggingFace → MySQL")
    print("=" * 60)
    
    # Step 1: Fetch from HuggingFace
    print("\n1. Fetching LeetCode problems...")
    problems_raw = fetch_leetcode_dataset(limit=300)
    
    if not problems_raw:
        print("No problems found!")
        sys.exit(1)
    
    print(f"Fetched {len(problems_raw)} raw problems")
    
    # Step 2: Transform
    print("\n2. Transforming problems...")
    transformed = [transform_problem(p) for p in problems_raw]
    
    # Step 3: Save backup
    print("\n3. Saving backup...")
    save_problems_backup(transformed)
    
    # Step 4: Import to MySQL
    print("\n4. Importing to MySQL...")
    imported, skipped = import_problems_to_mysql(transformed)
    
    print(f"\n✅ Import completed!")
    print(f"   Imported: {imported}")
    print(f"   Skipped (already exist): {skipped}")
    print(f"   Total: {len(transformed)}")


if __name__ == "__main__":
    main()
