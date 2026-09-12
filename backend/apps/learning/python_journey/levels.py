
"""Content for "PY — Journey to the Kingdom of Python" — World 1 (The
Beginning) and World 2 (The Operator Mountains). Levels are hand-authored
game design content, not admin-editable DB rows — same convention as
sql_games/frog/levels.py.

Every level's mission ends in exactly one `print()` statement — the grader
(`_py_journey_grade` in views/_shared.py) diffs Judge0's captured stdout
against `expected_output`. This keeps grading as simple and robust as SQL
Frog's row-diff while still covering print/variables/types/input/operators.
Later, harder levels (loops, functions, classes) will need a richer harness
that calls a student-defined function and prints its return value — same
stdout-diff mechanism, just a different harness per level; no engine change.
"""

WORLD_1_LEVELS = [
    {
        "id": "w1_l01", "order": 1, "world": 1,
        "title": "Meet Py",
        "story": (
            "A small egg rests in a sunlit clearing at the edge of the Whispering Woods. "
            "It cracks — and a tiny snake blinks awake. \"Every creature in this world speaks "
            "through code,\" says a voice from the trees. \"Wake yourself properly, little one — "
            "say hello to the world.\""
        ),
        "concept_title": "print() — Speaking to the World",
        "concept_explanation": (
            "A computer program is just a list of instructions, written in a language it "
            "understands — for us, that's Python. The print() function is how a Python program "
            "shows text on the screen: print(\"anything you want\") displays exactly what's "
            "between the quotes. Anything after a # is a comment — Python ignores it; it's a note "
            "for humans reading the code."
        ),
        "example": {"code": "print(\"I am waking up.\")", "output": "I am waking up."},
        "mission": "Wake Py up properly — print the message: Hello, Python!",
        "starter_code": "# Write your code below\n",
        "stdin_lines": [],
        "expected_output": "Hello, Python!",
        "hints": [
            "You need to make Py speak out loud — there's a function for exactly that.",
            "print() displays whatever text you put between quotes inside its parentheses.",
            'print("Hello, Python!")',
        ],
        "xp_reward": 100, "coin_reward": 20, "skill_unlocked": "print()",
    },
    {
        "id": "w1_l02", "order": 2, "world": 1,
        "title": "The Variable Forest",
        "story": (
            "Deeper in the woods, a forest spirit made of vines and fireflies blocks the path. "
            "\"A nameless traveler may not pass,\" it says. \"Give yourself a name — one you can "
            "remember and use again.\""
        ),
        "concept_title": "Variables — Labeled Boxes",
        "concept_explanation": (
            "A variable is a name that stores a value, so you can use it again later without "
            "retyping it. name = \"Py\" creates a variable called name holding the text \"Py\" — "
            "later, print(name) shows whatever is currently stored in it. You can change what's "
            "stored any time by assigning it again."
        ),
        "example": {"code": "coins = 10\nprint(coins)", "output": "10"},
        "mission": "Give Py a name — create a variable called name holding \"Py\", then print it.",
        "starter_code": "# Create a variable called name, then print it\n",
        "stdin_lines": [],
        "expected_output": "Py",
        "hints": [
            "A variable is a labeled box you can store a value in and use again later.",
            'Use name = "Py" to create the variable, then print(name) to show what it holds.',
            'name = "Py"\nprint(name)',
        ],
        "xp_reward": 100, "coin_reward": 20, "skill_unlocked": "Variables",
    },
    {
        "id": "w1_l03", "order": 3, "world": 1,
        "title": "The Data Type Desert",
        "story": (
            "The forest gives way to shifting sand. A desert spirit shimmers into view, holding "
            "up a number. \"Not every value is the same kind of thing,\" it rasps. \"Prove you can "
            "tell them apart, and the dunes will let you cross.\""
        ),
        "concept_title": "Data Types — int, float, str, bool, None",
        "concept_explanation": (
            "Every value in Python has a type: whole numbers are int, decimals are float, text is "
            "str, True/False values are bool, and None means \"nothing at all.\" type(value) tells "
            "you exactly which kind of value something is — handy when you're not sure."
        ),
        "example": {"code": "price = 99.5\nprint(type(price))", "output": "<class 'float'>"},
        "mission": "Py's age is stored as a whole number. Create age = 20, then print its type.",
        "starter_code": "age = 20\n# print the type of age below\n",
        "stdin_lines": [],
        "expected_output": "<class 'int'>",
        "hints": [
            "Every value in Python — numbers, text, true/false — has a type.",
            "type(value) tells you what kind of value something is.",
            "print(type(age))",
        ],
        "xp_reward": 120, "coin_reward": 25, "skill_unlocked": "Data Types & type()",
    },
    {
        "id": "w1_l04", "order": 4, "world": 1,
        "title": "The Input Village",
        "story": (
            "Past the dunes, a small village comes into view. A village elder squints at Py. "
            "\"How old are you, traveler? Tell me, and tell me your age next year, or the gate "
            "stays shut.\""
        ),
        "concept_title": "input() and Type Conversion",
        "concept_explanation": (
            "input() reads text the user types in — but it always comes back as a str, even if it "
            "looks like a number. int(some_text) converts that text into a whole number so you can "
            "do math with it (there's also float() and str() for other conversions)."
        ),
        "example": {"code": "raw = input()\nage = int(raw)\nprint(age + 5)", "output": "25 (if 20 was typed in)"},
        "mission": (
            "Read the elder's age from input(), convert it to a whole number, add 1 for next "
            "year, and print the result."
        ),
        "starter_code": "age_text = input()\n# convert to a number, add 1, and print the result\n",
        "stdin_lines": ["20"],
        "expected_output": "21",
        "visual_effect": {"type": "counter", "icon": "🎂", "label": "Py's Age", "before": 20, "after": 21},
        "hints": [
            "input() always hands you back text (a str), even when it looks like a number.",
            "Use int() to convert that text into a whole number before doing math with it.",
            "age = int(age_text)\nprint(age + 1)",
        ],
        "xp_reward": 130, "coin_reward": 25, "skill_unlocked": "input() & Type Conversion",
    },
]

WORLD_2_LEVELS = [
    {
        "id": "w2_l05", "order": 5, "world": 2,
        "title": "Arithmetic Mountain",
        "story": (
            "The path climbs into rocky peaks. A stone gate blocks the way, etched with two empty "
            "treasure chests. \"Only the traveler who knows their true wealth may pass,\" it reads."
        ),
        "concept_title": "Arithmetic Operators",
        "concept_explanation": (
            "Python does math with + (add), - (subtract), * (multiply), / (divide), // (whole-"
            "number division), % (remainder), and ** (power) — exactly like a calculator, just "
            "written out."
        ),
        "example": {"code": "damage = 8\nhits = 3\nprint(damage * hits)", "output": "24"},
        "mission": "Py found 45 coins in one chest and 30 in another. Print the total.",
        "starter_code": "chest_one = 45\nchest_two = 30\n# print the combined total\n",
        "stdin_lines": [],
        "expected_output": "75",
        "visual_effect": {"type": "counter", "icon": "💰", "label": "Coins Found", "before": 45, "after": 75},
        "hints": [
            "You need to combine two separate amounts into one total.",
            "The + operator adds two numbers together.",
            "print(chest_one + chest_two)",
        ],
        "xp_reward": 140, "coin_reward": 30, "skill_unlocked": "Arithmetic Operators",
    },
    {
        "id": "w2_l06", "order": 6, "world": 2,
        "title": "Comparison Caverns",
        "story": (
            "A cave mouth opens into darkness. A guardian's voice echoes: \"Only the healthy may "
            "enter these caverns. Prove your strength is enough — with a true or false answer.\""
        ),
        "concept_title": "Comparison Operators",
        "concept_explanation": (
            "Comparisons ask a yes/no question about two values and give back True or False: > "
            "(greater than), < (less than), >= / <= (at least / at most), == (equal), != (not "
            "equal). Note == checks equality — a single = only assigns a value."
        ),
        "example": {"code": "coins = 12\nprint(coins >= 10)", "output": "True"},
        "mission": "Py's health is 65. Print whether health is greater than 50.",
        "starter_code": "health = 65\n# print whether health is greater than 50\n",
        "stdin_lines": [],
        "expected_output": "True",
        "hints": [
            "A comparison doesn't give you a number back — it gives you True or False.",
            "Use the > operator between health and 50.",
            "print(health > 50)",
        ],
        "xp_reward": 140, "coin_reward": 30, "skill_unlocked": "Comparison Operators",
    },
    {
        "id": "w2_l07", "order": 7, "world": 2,
        "title": "The Logic Temple",
        "story": (
            "At the mountain's peak stands an ancient temple door with two locks. \"This door "
            "opens for those who hold both the key and the strength to turn it,\" a carving reads. "
            "\"Neither alone is enough.\""
        ),
        "concept_title": "Logical Operators — and, or, not",
        "concept_explanation": (
            "and combines two conditions — both must be True for the result to be True. or needs "
            "only one of them to be True. not flips a condition — True becomes False and back "
            "again."
        ),
        "example": {"code": "has_map = True\nhas_torch = False\nprint(has_map or has_torch)", "output": "True"},
        "mission": (
            "Py has the temple key (has_key = True) and enough energy left (has_energy = True). "
            "Print whether Py can open the door — both conditions must be true."
        ),
        "starter_code": "has_key = True\nhas_energy = True\n# print whether py can open the door\n",
        "stdin_lines": [],
        "expected_output": "True",
        "visual_effect": {"type": "lock"},
        "hints": [
            "The door needs BOTH conditions to be true at once — not just one.",
            "Combine the two conditions with and.",
            "print(has_key and has_energy)",
        ],
        "xp_reward": 150, "coin_reward": 35, "skill_unlocked": "Logical Operators — World 2 Complete",
    },
]

WORLD_1_LEVELS_BY_ID = {lvl["id"]: lvl for lvl in WORLD_1_LEVELS}
WORLD_2_LEVELS_BY_ID = {lvl["id"]: lvl for lvl in WORLD_2_LEVELS}

# Placeholder metadata for the map/skill-tree view — no content yet, just
# enough to show "locked, coming soon" tiles beyond World 2, mirroring the
# full 16-world curriculum from the design spec.
FUTURE_WORLDS = [
    {"world": 3, "name": "The Kingdom of Decisions", "skills": ["if", "else", "elif", "Nested Conditions"]},
    {"world": 4, "name": "The Loop Dungeon", "skills": ["for", "range()", "while", "break", "continue", "Nested Loops"]},
    {"world": 5, "name": "The Collection Valley", "skills": ["Lists", "Tuples", "Sets", "Dictionaries"]},
    {"world": 6, "name": "The String Kingdom", "skills": ["String Methods", "Slicing", "f-Strings"]},
    {"world": 7, "name": "The Function Village", "skills": ["def", "Parameters", "Return Values", "Scope"]},
    {"world": 8, "name": "Python Power", "skills": ["List Comprehensions", "enumerate()", "zip()"]},
    {"world": 9, "name": "The Error Dungeon", "skills": ["try / except", "finally"]},
    {"world": 10, "name": "File Village", "skills": ["open()", "Reading & Writing Files"]},
    {"world": 11, "name": "Module Mountains", "skills": ["import", "Standard Library", "Your Own Modules"]},
    {"world": 12, "name": "The OOP Kingdom", "skills": ["Classes", "__init__", "Inheritance", "Polymorphism"]},
    {"world": 13, "name": "Python Engineering", "skills": ["Generators", "Lambda", "map()", "filter()"]},
    {"world": 14, "name": "Data & Real Programming", "skills": ["JSON", "APIs"]},
    {"world": 15, "name": "Debugging & Code Quality", "skills": ["Debugging", "Clean Code", "Refactoring"]},
    {"world": 16, "name": "Data Structures & Algorithms", "skills": ["Searching", "Recursion", "Trees", "Graphs"]},
]
