"""
Load LeetCode problems from HuggingFace dataset and push to Convex database.
Dataset: newfacade/LeetCodeDataset
"""
import os
import sys
import json
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Convex Configuration
CONVEX_HTTP_URL = os.getenv("CONVEX_HTTP_URL", "https://rare-pig-419.convex.site")

# HuggingFace Dataset API
HF_DATASET_API = "https://datasets-server.huggingface.co/rows"
DATASET_NAME = "newfacade/LeetCodeDataset"


def fetch_leetcode_dataset(limit=1000):
    """Fetch LeetCode problems from HuggingFace dataset."""
    print(f"Fetching up to {limit} problems from HuggingFace dataset...")
    
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
            
            print(f"Fetched {len(all_problems)} problems so far...")
            offset += len(rows)
            
            # If we got less than requested, we've reached the end
            if len(rows) < batch_size:
                break
                
        except Exception as e:
            print(f"Error fetching from HuggingFace: {e}")
            break
    
    return all_problems[:limit]


def transform_problem_data(problem):
    """Transform HuggingFace problem to Convex format."""
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
                "input": ex.get("input", ""),
                "output": ex.get("output", ""),
                "explanation": ex.get("explanation", ""),
            })
        elif isinstance(ex, str):
            # Try to parse from text
            examples.append({
                "input": ex[:100] + "..." if len(ex) > 100 else ex,
                "output": "",
                "explanation": "",
            })
    
    # Extract hints
    hints = []
    if problem.get("hints"):
        if isinstance(problem["hints"], list):
            hints = problem["hints"]
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
        "testCases": [],  # Will be populated separately
        "isDaily": False,
        "createdAt": None,  # Will be set by Convex
    }


def push_problems_to_convex(problems):
    """Push problems to Convex database."""
    endpoint = f"{CONVEX_HTTP_URL}/problems/bulk"
    
    # Process in batches to avoid timeout
    batch_size = 50
    total_success = 0
    
    for i in range(0, len(problems), batch_size):
        batch = problems[i:i + batch_size]
        
        try:
            response = requests.post(
                endpoint,
                json={"problems": batch},
                headers={"Content-Type": "application/json"},
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                count = result.get("count", 0)
                total_success += count
                print(f"Batch {i//batch_size + 1}: Pushed {count} problems (Total: {total_success})")
            else:
                print(f"Batch {i//batch_size + 1} failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            print(f"Error pushing batch {i//batch_size + 1}: {e}")
    
    return total_success


def save_problems_locally(problems):
    """Save problems to local JSON file as backup."""
    output_file = "leetcode_problems.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(problems, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(problems)} problems to {output_file}")


def main():
    print("=" * 60)
    print("LEETCODE DATASET: HuggingFace → Convex")
    print("=" * 60)
    
    # Step 1: Fetch from HuggingFace
    print("\n1. Fetching LeetCode problems from HuggingFace...")
    problems_raw = fetch_leetcode_dataset(limit=500)  # Start with 500 problems
    
    if not problems_raw:
        print("No problems found or error occurred.")
        sys.exit(1)
    
    print(f"Fetched {len(problems_raw)} raw problems")
    
    # Step 2: Transform data
    print("\n2. Transforming problems for Convex...")
    transformed_problems = [transform_problem_data(p) for p in problems_raw]
    
    # Step 3: Save locally as backup
    print("\n3. Saving to local backup...")
    save_problems_locally(transformed_problems)
    
    # Step 4: Push to Convex
    print("\n4. Pushing to Convex database...")
    total_pushed = push_problems_to_convex(transformed_problems)
    
    if total_pushed > 0:
        print("\n✅ Dataset loading completed!")
        print(f"Total problems loaded: {total_pushed}")
    else:
        print("\n⚠️ No problems were pushed to Convex.")
        print("The local backup file (leetcode_problems.json) was created.")
        print("You may need to manually import or retry.")


if __name__ == "__main__":
    main()
