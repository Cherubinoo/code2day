FALLBACK_DASHBOARD = {
    "user": {
        "name": "Student One",
        "title": "Daily coding, one square at a time.",
        "streak": 21,
        "loginDays": 58,
        "rank": "Campus Rank #12",
    },
    "dailyProblem": {
        "title": "Two Sum Variants",
        "difficulty": "Easy",
        "description": "Pick the best approach for a target sum challenge and compare time complexity before you submit.",
        "tags": ["Array", "Hash Map", "Warm-up"],
    },
    "stats": {
        "easy": 84,
        "medium": 46,
        "hard": 12,
    },
    "weeklyActivity": [
        {"day": "Mon", "count": 2},
        {"day": "Tue", "count": 1},
        {"day": "Wed", "count": 3},
        {"day": "Thu", "count": 2},
        {"day": "Fri", "count": 4},
        {"day": "Sat", "count": 1},
        {"day": "Sun", "count": 2},
    ],
    "heatmap": [
        1, 2, 0, 3, 2, 1, 4,
        0, 1, 3, 2, 1, 0, 2,
        3, 2, 2, 4, 1, 0, 1,
        2, 4, 3, 2, 1, 1, 0,
        3, 1, 2, 4, 2, 3, 1,
    ],
    "tracks": [
        {"name": "Daily Program", "count": 7, "accent": "sage"},
        {"name": "Interview Sprint", "count": 12, "accent": "olive"},
        {"name": "Contest Prep", "count": 5, "accent": "clay"},
    ],
    "leaderboard": [
        {"name": "Arun", "solved": 146},
        {"name": "Meera", "solved": 132},
        {"name": "Kavin", "solved": 118},
    ],
    "editor": {
        "starter_code": "function solve(nums, target) {\n  const seen = new Map();\n\n  for (let index = 0; index < nums.length; index += 1) {\n    const complement = target - nums[index];\n\n    if (seen.has(complement)) {\n      return [seen.get(complement), index];\n    }\n\n    seen.set(nums[index], index);\n  }\n\n  return [];\n}\n",
    },
}

FALLBACK_PROBLEMS = [
    {
        "title": "Two Sum Variants",
        "slug": "two-sum-variants",
        "description": "Return the pair of indices whose values add up to a target.",
        "difficulty": "Easy",
        "tags": ["Array", "Hash Map"],
        "is_daily": True,
    },
    {
        "title": "Balanced Brackets",
        "slug": "balanced-brackets",
        "description": "Validate whether an input string of brackets is correctly nested.",
        "difficulty": "Medium",
        "tags": ["Stack", "String"],
        "is_daily": False,
    },
    {
        "title": "Merge K Lists",
        "slug": "merge-k-lists",
        "description": "Merge multiple sorted linked lists into one sorted list.",
        "difficulty": "Hard",
        "tags": ["Heap", "Linked List"],
        "is_daily": False,
    },
]