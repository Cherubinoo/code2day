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
        "starter_code": "const fs = require(\"fs\");\n\nconst input = fs.readFileSync(0, \"utf8\").trim();\n\nfunction solve(rawInput) {\n  // Parse rawInput for this problem and return the answer.\n  return rawInput;\n}\n\nconst result = solve(input);\nif (result !== undefined) {\n  process.stdout.write(String(result));\n}\n",
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
        "examples": [
            {
                "input": "nums = [2,7,11,15], target = 9",
                "output": "[0,1]",
                "explanation": "The values at index 0 and 1 add up to 9.",
            },
            {
                "input": "nums = [3,2,4], target = 6",
                "output": "[1,2]",
                "explanation": "The values at index 1 and 2 add up to 6.",
            },
        ],
        "hints": [
            "Track visited values in a hash map.",
            "Look for target - current before inserting the current value.",
        ],
    },
    {
        "title": "Balanced Brackets",
        "slug": "balanced-brackets",
        "description": "Validate whether an input string of brackets is correctly nested.",
        "difficulty": "Medium",
        "tags": ["Stack", "String"],
        "is_daily": False,
        "examples": [
            {
                "input": "()[]{}",
                "output": "true",
                "explanation": "Each bracket closes in the correct order.",
            },
            {
                "input": "([)]",
                "output": "false",
                "explanation": "The closing order is invalid.",
            },
        ],
        "hints": [
            "Push opening brackets onto a stack.",
            "Each closing bracket must match the latest opening bracket.",
        ],
    },
    {
        "title": "Merge K Lists",
        "slug": "merge-k-lists",
        "description": "Merge multiple sorted linked lists into one sorted list.",
        "difficulty": "Hard",
        "tags": ["Heap", "Linked List"],
        "is_daily": False,
        "examples": [
            {
                "input": "lists = [[1,4,5],[1,3,4],[2,6]]",
                "output": "[1,1,2,3,4,4,5,6]",
                "explanation": "Merging the sorted lists keeps the final order sorted.",
            },
            {
                "input": "lists = []",
                "output": "[]",
                "explanation": "An empty input should return an empty list.",
            },
        ],
        "hints": [
            "A min-heap lets you pull the next smallest node efficiently.",
            "After taking the smallest node, push the next node from the same list.",
        ],
    },
]
