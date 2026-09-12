"""Content for "PY — Journey to the Kingdom of Python" — Worlds 13-16
(Python Engineering, Data & Real Programming, Debugging & Code Quality,
Data Structures & Algorithmic Thinking) plus the Final World capstone. See
levels.py's module docstring for the shared grading convention. Every
solution below was verified locally against a real Python 3 interpreter
(including every algorithm's exact traversal order) before its
expected_output was hardcoded here.

The Final World's "battle system" capstone deliberately keeps its single
mission end-to-end (one Character class, one exchange of attacks, one
print) rather than the full multi-class inventory/spell/save-load system
the design spec sketches — a genuine "build your own project" open-ended
capstone doesn't fit this game's fixed-expected-output grading model, so
this is the largest exercise the current engine can grade automatically;
a true open-ended final project would need a different (likely
staff-reviewed) grading mode, which is a bigger, separate piece of work.
"""

WORLD_13_LEVELS = [
    {
        "id": "w13_l64", "order": 64, "world": 13,
        "title": "The Iterator's Path",
        "story": (
            "A narrow mountain trail only reveals one marker at a time — Py has to ask for the "
            "next one, one at a time, rather than seeing the whole path at once."
        ),
        "concept_title": "iter() and next()",
        "concept_explanation": (
            "iter(a_list) turns a list into an iterator — something you can step through one item "
            "at a time with next(), which hands back the next value each time it's called."
        ),
        "example": {"code": "it = iter([\"a\", \"b\"])\nprint(next(it))", "output": "a"},
        "mission": "Create an iterator from [10, 20, 30] using iter(), then call next() on it twice, printing each result on its own line.",
        "starter_code": "items = [10, 20, 30]\n# create an iterator, then call next() twice, printing each result\n",
        "stdin_lines": [],
        "expected_output": "10\n20",
        "hints": [
            "iter() turns the list into something next() can be called on repeatedly.",
            "it = iter(items) — then print(next(it)) twice gives you the first two values in order.",
            "it = iter(items)\nprint(next(it))\nprint(next(it))",
        ],
        "xp_reward": 260, "coin_reward": 50, "skill_unlocked": "Iterators",
    },
    {
        "id": "w13_l65", "order": 65, "world": 13,
        "title": "The Treasure Generator",
        "story": (
            "A treasure chest doesn't hand over everything at once — it reveals one item, then "
            "waits, then reveals the next, only when asked."
        ),
        "concept_title": "yield — Generators",
        "concept_explanation": (
            "A function containing yield instead of return becomes a generator — calling it "
            "doesn't run the body immediately; looping over it runs the function up to each yield, "
            "pausing there until the next value is asked for."
        ),
        "example": {"code": "def countdown():\n    yield 2\n    yield 1\n\nfor n in countdown():\n    print(n)", "output": "2\n1"},
        "mission": "Define a generator treasure() that yields 'Gold' then yields 'Gem'. Loop through it with a for loop, printing each item.",
        "starter_code": "# define a generator treasure() yielding \"Gold\" then \"Gem\", then loop over it and print each\n",
        "stdin_lines": [],
        "expected_output": "Gold\nGem",
        "hints": [
            "yield works like return, but the function pauses instead of ending completely.",
            "def treasure():\n    yield \"Gold\"\n    yield \"Gem\" — then a normal for loop consumes it.",
            'def treasure():\n    yield "Gold"\n    yield "Gem"\n\nfor item in treasure():\n    print(item)',
        ],
        "xp_reward": 270, "coin_reward": 50, "skill_unlocked": "Generators",
    },
    {
        "id": "w13_l66", "order": 66, "world": 13,
        "title": "The One-Line Spell",
        "story": (
            "A hedge wizard scoffs at Py's long function definitions for such a tiny spell. "
            "\"Some spells,\" she says, \"only need one line.\""
        ),
        "concept_title": "lambda — Tiny Anonymous Functions",
        "concept_explanation": (
            "lambda arguments: expression creates a small, unnamed function in a single line — "
            "double = lambda x: x * 2 behaves exactly like a normal function, just without def or "
            "a return keyword (the expression's value is returned automatically)."
        ),
        "example": {"code": "square = lambda x: x * x\nprint(square(4))", "output": "16"},
        "mission": "Create a lambda called double that multiplies its input by 2. Print double(5).",
        "starter_code": "# create a lambda called double, then print double(5)\n",
        "stdin_lines": [],
        "expected_output": "10",
        "hints": [
            "Only worth using def for this once you already know the one-line lambda form.",
            "double = lambda x: x * 2 — then call it exactly like a normal function.",
            "double = lambda x: x * 2\nprint(double(5))",
        ],
        "xp_reward": 270, "coin_reward": 50, "skill_unlocked": "Lambda",
    },
    {
        "id": "w13_l67", "order": 67, "world": 13,
        "title": "The Enchantment Line",
        "story": (
            "An enchanter's line transforms every item passed through it, all at once, without "
            "a single explicit loop written by hand."
        ),
        "concept_title": "map()",
        "concept_explanation": (
            "map(function, iterable) applies function to every item and hands back an iterator "
            "of the results — wrap it in list(...) to see them all as a normal list."
        ),
        "example": {"code": "print(list(map(lambda x: x + 1, [1, 2, 3])))", "output": "[2, 3, 4]"},
        "mission": "Use map() with a lambda to double every number in [1, 2, 3], convert the result to a list, and print it.",
        "starter_code": "nums = [1, 2, 3]\n# use map() with a lambda to double each number, then print the list\n",
        "stdin_lines": [],
        "expected_output": "[2, 4, 6]",
        "hints": [
            "map() applies a function to every item in one go, without writing a loop yourself.",
            "list(map(lambda x: x * 2, nums)) doubles every number and gives you back a real list.",
            "doubled = list(map(lambda x: x * 2, nums))\nprint(doubled)",
        ],
        "xp_reward": 280, "coin_reward": 55, "skill_unlocked": "map()",
    },
    {
        "id": "w13_l68", "order": 68, "world": 13,
        "title": "The Sifting Gate",
        "story": (
            "A gate only lets through travelers who meet a certain condition — everyone else is "
            "quietly turned away, no exceptions checked by hand."
        ),
        "concept_title": "filter()",
        "concept_explanation": (
            "filter(function, iterable) keeps only the items where function returns True, "
            "dropping the rest — like map(), wrap it in list(...) to see the results."
        ),
        "example": {"code": "print(list(filter(lambda x: x > 2, [1, 2, 3, 4])))", "output": "[3, 4]"},
        "mission": "Use filter() with a lambda to keep only numbers greater than 5 from [3, 8, 1, 9, 4], convert to a list, and print it.",
        "starter_code": "nums = [3, 8, 1, 9, 4]\n# use filter() with a lambda to keep numbers greater than 5, then print the list\n",
        "stdin_lines": [],
        "expected_output": "[8, 9]",
        "hints": [
            "filter() keeps only the items where your lambda returns True.",
            "list(filter(lambda x: x > 5, nums)) keeps only the numbers above 5.",
            "big = list(filter(lambda x: x > 5, nums))\nprint(big)",
        ],
        "xp_reward": 280, "coin_reward": 55, "skill_unlocked": "filter()",
    },
    {
        "id": "w13_l69", "order": 69, "world": 13,
        "title": "The Sorting Trial",
        "story": (
            "The mountain's final trial: a line of names must be sorted, not alphabetically, "
            "but however the judge decides matters — this time, by how short each name is."
        ),
        "concept_title": "sorted() with a key",
        "concept_explanation": (
            "sorted(items, key=function) sorts using whatever function(item) returns, instead of "
            "the item's natural order — sorted(names, key=len) sorts by each name's length."
        ),
        "example": {"code": "print(sorted([\"bb\", \"a\", \"ccc\"], key=len))", "output": "['a', 'bb', 'ccc']"},
        "mission": "Sort ['Fox', 'A', 'Dragon'] by length (shortest first) using sorted() with a key, and print the result.",
        "starter_code": "names = [\"Fox\", \"A\", \"Dragon\"]\n# sort by length using sorted() with a key, then print it\n",
        "stdin_lines": [],
        "expected_output": "['A', 'Fox', 'Dragon']",
        "hints": [
            "You need to sort by each name's length, not the name itself.",
            "key=len tells sorted() to compare lengths instead of the values directly.",
            "print(sorted(names, key=len))",
        ],
        "xp_reward": 330, "coin_reward": 65, "skill_unlocked": "sorted() & key — World 13 Complete",
    },
]

WORLD_14_LEVELS = [
    {
        "id": "w14_l70", "order": 70, "world": 14,
        "title": "The Data Scrolls",
        "story": (
            "A realm built entirely on shared data comes into view — every kingdom here trades "
            "information using one universal format, readable by everyone."
        ),
        "concept_title": "JSON",
        "concept_explanation": (
            "JSON is a text format for structured data, and Python's json module converts "
            "between it and normal Python values: json.dumps(a_dict) turns a dict into a JSON "
            "string; json.loads(a_string) turns it back."
        ),
        "example": {"code": "import json\nprint(json.dumps({\"a\": 1}))", "output": "{\"a\": 1}"},
        "mission": "Import json. Convert {'name': 'Py', 'coins': 50} to a JSON string using json.dumps() and print it.",
        "starter_code": "# import json, then convert the player dict to a JSON string and print it\n",
        "stdin_lines": [],
        "expected_output": '{"name": "Py", "coins": 50}',
        "hints": [
            "json.dumps() converts a Python dict into a JSON-formatted string.",
            'player = {"name": "Py", "coins": 50} then print(json.dumps(player)).',
            'import json\nplayer = {"name": "Py", "coins": 50}\nprint(json.dumps(player))',
        ],
        "xp_reward": 290, "coin_reward": 55, "skill_unlocked": "JSON",
    },
    {
        "id": "w14_l71", "order": 71, "world": 14,
        "title": "The Simulated Oracle",
        "story": (
            "A traveling oracle answers questions by sending back data from afar — safely "
            "simulated here as a plain function, so no real network trip is ever needed."
        ),
        "concept_title": "APIs, Simulated",
        "concept_explanation": (
            "A real API sends a request over the network and gets back a response — often JSON "
            "text. get_weather() below simulates that: it just returns a JSON string directly, "
            "which you parse with json.loads() exactly like a real API response."
        ),
        "example": {"code": "import json\ndata = json.loads('{\"ok\": true}')\nprint(data[\"ok\"])", "output": "True"},
        "mission": (
            "get_weather() below returns a JSON string. Parse it with json.loads() and print "
            "just the 'temperature' value."
        ),
        "starter_code": (
            "import json\n\ndef get_weather():\n    return '{\"city\": \"Kingdom of Python\", \"temperature\": 72}'\n\n"
            "response = get_weather()\n# parse response with json.loads(), then print the temperature\n"
        ),
        "stdin_lines": [],
        "expected_output": "72",
        "hints": [
            "json.loads() turns a JSON string back into a normal Python dictionary.",
            'data = json.loads(response) then print(data["temperature"]).',
            'data = json.loads(response)\nprint(data["temperature"])',
        ],
        "xp_reward": 290, "coin_reward": 55, "skill_unlocked": "APIs (Simulated)",
    },
    {
        "id": "w14_l72", "order": 72, "world": 14,
        "title": "The Persistent Player",
        "story": (
            "For the first time, Py's progress needs to survive being closed and reopened — "
            "saved to a real file, in a format any program can read back later."
        ),
        "concept_title": "Classes + Files + JSON, Together",
        "concept_explanation": (
            "Combining what you've learned: build an object, turn its data into a dict, save "
            "that dict as JSON to a file, then read the file back and parse it — a real, simple "
            "save/load system."
        ),
        "example": {"code": "import json\ndata = {\"score\": 5}\nwith open(\"s.json\", \"w\") as f:\n    json.dump(data, f)\nwith open(\"s.json\") as f:\n    print(json.load(f)[\"score\"])", "output": "5"},
        "mission": (
            "Create a Player class with __init__(self, name, coins). Create player = "
            "Player('Py', 75). Save {'name': player.name, 'coins': player.coins} as JSON to "
            "save.json using json.dump(). Read it back with json.load() and print the loaded "
            "dictionary's 'coins' value."
        ),
        "starter_code": (
            "import json\n\n# define Player, create player = Player(\"Py\", 75),\n"
            "# save {\"name\": ..., \"coins\": ...} to save.json, read it back, and print the coins\n"
        ),
        "stdin_lines": [],
        "expected_output": "75",
        "hints": [
            "json.dump(data, file) writes directly to an open file; json.load(file) reads it back.",
            "Save the dict inside a with open(...,\"w\") block, then reopen and json.load() it.",
            (
                'class Player:\n    def __init__(self, name, coins):\n        self.name = name\n        self.coins = coins\n\n'
                'player = Player("Py", 75)\n\n'
                'with open("save.json", "w") as f:\n    json.dump({"name": player.name, "coins": player.coins}, f)\n\n'
                'with open("save.json") as f:\n    data = json.load(f)\n\nprint(data["coins"])'
            ),
        ],
        "xp_reward": 350, "coin_reward": 70, "skill_unlocked": "JSON & Persistence — World 14 Complete",
    },
]

WORLD_15_LEVELS = [
    {
        "id": "w15_l73", "order": 73, "world": 15,
        "title": "The Debugging Dungeon",
        "story": (
            "A cursed room refuses to open — somewhere in the ritual, a name was written "
            "wrong, and the whole spell breaks over one small typo."
        ),
        "concept_title": "Reading Errors",
        "concept_explanation": (
            "A traceback tells you exactly which line crashed and why — a NameError almost "
            "always means a variable was misspelled somewhere, either where it was created or "
            "where it was used."
        ),
        "example": {"code": "vaule = 5\nprint(vaule)", "output": "5"},
        "mission": "The code below has a typo — 'toatl' instead of 'total' — so printing total crashes. Fix the typo so it prints 30.",
        "starter_code": "a = 10\nb = 20\ntoatl = a + b  # there's a typo here\nprint(total)\n",
        "stdin_lines": [],
        "expected_output": "30",
        "hints": [
            "Read the traceback carefully — it names the exact variable Python couldn't find.",
            "The variable was created as toatl, but printed as total — make the spelling match.",
            "a = 10\nb = 20\ntotal = a + b\nprint(total)",
        ],
        "xp_reward": 300, "coin_reward": 55, "skill_unlocked": "Debugging",
    },
    {
        "id": "w15_l74", "order": 74, "world": 15,
        "title": "The Repetition Trap",
        "story": (
            "Three near-identical lines sit side by side, each just greeting a different name. "
            "A scribe frowns: \"You wrote that phrase three separate times?\""
        ),
        "concept_title": "Clean Code — Avoiding Repetition",
        "concept_explanation": (
            "Copy-pasted, nearly-identical lines are a sign a loop belongs there instead — "
            "looping over a list of values keeps the logic in exactly one place."
        ),
        "example": {"code": "for n in [\"a\", \"b\"]:\n    print(n.upper())", "output": "A\nB"},
        "mission": "Rewrite the three print lines below as a single for loop over names, producing the exact same three lines of output.",
        "starter_code": (
            'names = ["Py", "Fox", "Owl"]\nprint(names[0] + " says hello")\nprint(names[1] + " says hello")\nprint(names[2] + " says hello")\n'
            "# rewrite the three lines above as one for loop\n"
        ),
        "stdin_lines": [],
        "expected_output": "Py says hello\nFox says hello\nOwl says hello",
        "hints": [
            "All three lines do the exact same thing to a different item from the same list.",
            "for name in names: print(name + \" says hello\") replaces all three lines at once.",
            'names = ["Py", "Fox", "Owl"]\nfor name in names:\n    print(name + " says hello")',
        ],
        "xp_reward": 300, "coin_reward": 55, "skill_unlocked": "Clean Code",
    },
    {
        "id": "w15_l75", "order": 75, "world": 15,
        "title": "The Refactoring Trial",
        "story": (
            "The dungeon's final test: a working spell that's needlessly complicated. \"It gets "
            "the right answer,\" the sage admits, \"but there's a far simpler way to write it.\""
        ),
        "concept_title": "Refactoring",
        "concept_explanation": (
            "Refactoring means improving code's structure without changing what it does — "
            "Python's built-ins (like sum() and len()) often replace a hand-written loop "
            "entirely, with the exact same result."
        ),
        "example": {"code": "nums = [1, 2, 3]\nprint(sum(nums) / len(nums))", "output": "2.0"},
        "mission": (
            "calculate_average(numbers) below works but manually tracks a total and count. "
            "Refactor it to use sum() and len() instead, keeping the same result. Call it with "
            "[10, 20, 30] and print the result."
        ),
        "starter_code": (
            "def calculate_average(numbers):\n    total = 0\n    count = 0\n    for n in numbers:\n"
            "        total = total + n\n        count = count + 1\n    return total / count\n\n"
            "# refactor calculate_average to use sum() and len(), then print calculate_average([10, 20, 30])\n"
        ),
        "stdin_lines": [],
        "expected_output": "20.0",
        "hints": [
            "sum(numbers) replaces the manual total-tracking loop; len(numbers) replaces the counter.",
            "return sum(numbers) / len(numbers) is the whole refactored function body.",
            "def calculate_average(numbers):\n    return sum(numbers) / len(numbers)\n\nprint(calculate_average([10, 20, 30]))",
        ],
        "xp_reward": 360, "coin_reward": 70, "skill_unlocked": "Refactoring — World 15 Complete",
    },
]

WORLD_16_LEVELS = [
    {
        "id": "w16_l76", "order": 76, "world": 16,
        "title": "The Data Structures Frontier",
        "story": (
            "Beyond the dungeons lies a frontier of pure logic — every challenge here is about "
            "how information is organized and searched, not just written."
        ),
        "concept_title": "Arrays (Lists) & Traversal",
        "concept_explanation": (
            "Visiting every element of a list one at a time — traversal — is the foundation "
            "every algorithm ahead builds on, whether it's searching, sorting, or something more."
        ),
        "example": {"code": "for n in [1, 2, 3]:\n    print(n + 10)", "output": "11\n12\n13"},
        "mission": "Loop through [4, 8, 15, 16, 23] and print each number multiplied by 2, one per line.",
        "starter_code": "# loop through the list, printing each number doubled\n",
        "stdin_lines": [],
        "expected_output": "8\n16\n30\n32\n46",
        "hints": [
            "A plain for loop visits every item, one at a time, in order.",
            "for n in [4, 8, 15, 16, 23]: print(n * 2).",
            "for n in [4, 8, 15, 16, 23]:\n    print(n * 2)",
        ],
        "xp_reward": 320, "coin_reward": 60, "skill_unlocked": "Traversal",
    },
    {
        "id": "w16_l77", "order": 77, "world": 16,
        "title": "The Question of Searching",
        "story": (
            "A guard asks a simple question: is a particular number even in this list at all? "
            "Before building a real search algorithm, there's a shortcut worth knowing."
        ),
        "concept_title": "Searching — The in Keyword",
        "concept_explanation": (
            "Python's in keyword checks membership directly: value in a_list returns True or "
            "False. It's simple and readable — later levels build real search algorithms "
            "that work the same way under the hood."
        ),
        "example": {"code": "print(5 in [1, 2, 3])", "output": "False"},
        "mission": "Given [4, 8, 15, 16, 23], print whether 16 is in the list using the in keyword.",
        "starter_code": "nums = [4, 8, 15, 16, 23]\n# print whether 16 is in nums\n",
        "stdin_lines": [],
        "expected_output": "True",
        "hints": [
            "in checks whether a value exists anywhere in a list, returning True or False.",
            "16 in nums evaluates directly to a boolean you can print.",
            "print(16 in nums)",
        ],
        "xp_reward": 320, "coin_reward": 60, "skill_unlocked": "Searching",
    },
    {
        "id": "w16_l78", "order": 78, "world": 16,
        "title": "Linear Search",
        "story": (
            "A guard wants to know not just IF something's there, but exactly WHERE — checked "
            "one position at a time, from the very start."
        ),
        "concept_title": "Linear Search",
        "concept_explanation": (
            "Linear search checks every position in order until it finds the target (returning "
            "its index) or runs out of list (returning -1) — simple, and works on any list, "
            "sorted or not."
        ),
        "example": {"code": "def find(items, target):\n    for i in range(len(items)):\n        if items[i] == target:\n            return i\n    return -1\n\nprint(find([9, 7, 5], 7))", "output": "1"},
        "mission": (
            "Write linear_search(items, target) that returns the index where target is found, or "
            "-1. Call linear_search([4, 8, 15, 16, 23], 15) and print the result."
        ),
        "starter_code": "# define linear_search(items, target), then print linear_search([4, 8, 15, 16, 23], 15)\n",
        "stdin_lines": [],
        "expected_output": "2",
        "hints": [
            "Loop through every index, checking if that position holds the target.",
            "for i in range(len(items)): if items[i] == target: return i — then return -1 after the loop.",
            (
                "def linear_search(items, target):\n    for i in range(len(items)):\n        if items[i] == target:\n"
                "            return i\n    return -1\n\nprint(linear_search([4, 8, 15, 16, 23], 15))"
            ),
        ],
        "xp_reward": 330, "coin_reward": 65, "skill_unlocked": "Linear Search",
    },
    {
        "id": "w16_l79", "order": 79, "world": 16,
        "title": "Binary Search",
        "story": (
            "A librarian never checks a sorted shelf one book at a time — she opens to the "
            "middle, decides which half to keep, and repeats, cutting the search in half "
            "every time."
        ),
        "concept_title": "Binary Search",
        "concept_explanation": (
            "On a SORTED list, binary search checks the middle element, and depending on "
            "whether the target is smaller or larger, throws away half the remaining list each "
            "time — dramatically faster than checking one by one."
        ),
        "example": {"code": "def bs(items, target):\n    low, high = 0, len(items) - 1\n    while low <= high:\n        mid = (low + high) // 2\n        if items[mid] == target:\n            return mid\n        elif items[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1\n\nprint(bs([1, 2, 3, 4], 3))", "output": "2"},
        "mission": (
            "Write binary_search(items, target) for a SORTED list using low/high/mid. Call "
            "binary_search([1, 3, 5, 7, 9, 11], 9) and print the result."
        ),
        "starter_code": "# define binary_search(items, target) for a sorted list, then print binary_search([1, 3, 5, 7, 9, 11], 9)\n",
        "stdin_lines": [],
        "expected_output": "4",
        "hints": [
            "Track a low and high boundary, checking the middle each time and narrowing the range.",
            "If items[mid] is too small, move low up; if too big, move high down; if equal, you're done.",
            (
                "def binary_search(items, target):\n    low, high = 0, len(items) - 1\n    while low <= high:\n"
                "        mid = (low + high) // 2\n        if items[mid] == target:\n            return mid\n"
                "        elif items[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n"
                '    return -1\n\nprint(binary_search([1, 3, 5, 7, 9, 11], 9))'
            ),
        ],
        "xp_reward": 340, "coin_reward": 65, "skill_unlocked": "Binary Search",
    },
    {
        "id": "w16_l80", "order": 80, "world": 16,
        "title": "Two Pointers",
        "story": (
            "Two scouts start at opposite ends of a sorted line of numbers, walking toward each "
            "other, checking pairs as they close in — never needing to check every possible pair."
        ),
        "concept_title": "Two Pointers",
        "concept_explanation": (
            "On a sorted list, a left and right pointer starting at opposite ends can find a "
            "pair summing to a target in one pass — move left up if the sum's too small, right "
            "down if it's too big."
        ),
        "example": {"code": "nums = [1, 2, 3, 9]\nleft, right = 0, 3\nprint(nums[left] + nums[right])", "output": "10"},
        "mission": (
            "Write has_pair_with_sum(numbers, target) using two pointers on a sorted list, "
            "returning True if any two numbers sum to target. Call it with [1, 2, 4, 7, 11], "
            "target 15, and print the result."
        ),
        "starter_code": "# define has_pair_with_sum(numbers, target) using two pointers, then print it for [1, 2, 4, 7, 11], 15\n",
        "stdin_lines": [],
        "expected_output": "True",
        "hints": [
            "Start one pointer at each end; move whichever one gets you closer to the target.",
            "If the two pointers' sum is too small, move left forward; too big, move right backward.",
            (
                "def has_pair_with_sum(numbers, target):\n    left, right = 0, len(numbers) - 1\n"
                "    while left < right:\n        total = numbers[left] + numbers[right]\n"
                "        if total == target:\n            return True\n        elif total < target:\n"
                "            left += 1\n        else:\n            right -= 1\n    return False\n\n"
                "print(has_pair_with_sum([1, 2, 4, 7, 11], 15))"
            ),
        ],
        "xp_reward": 350, "coin_reward": 70, "skill_unlocked": "Two Pointers",
    },
    {
        "id": "w16_l81", "order": 81, "world": 16,
        "title": "The Sliding Window",
        "story": (
            "A caravan needs the best possible stretch of exactly 3 consecutive supply crates — "
            "checked by sliding one small window along the whole line, instead of re-adding "
            "everything from scratch each time."
        ),
        "concept_title": "Sliding Window",
        "concept_explanation": (
            "A sliding window keeps a running sum for a fixed-size chunk of a list, updating it "
            "by subtracting the item that just left the window and adding the one that just "
            "entered — avoiding recomputing the whole sum every step."
        ),
        "example": {"code": "nums = [1, 2, 3, 4]\nprint(sum(nums[0:2]))", "output": "3"},
        "mission": (
            "Write max_sum_subarray(numbers, k) that finds the maximum sum of any k consecutive "
            "numbers using a sliding window. Call it with [2, 1, 5, 1, 3, 2], k=3, and print the result."
        ),
        "starter_code": "# define max_sum_subarray(numbers, k) using a sliding window, then print it for [2, 1, 5, 1, 3, 2], 3\n",
        "stdin_lines": [],
        "expected_output": "9",
        "hints": [
            "Start with the sum of the first k numbers, then slide the window one step at a time.",
            "Each slide: add the new number entering, subtract the old one leaving the window.",
            (
                "def max_sum_subarray(numbers, k):\n    window_sum = sum(numbers[:k])\n    max_sum = window_sum\n"
                "    for i in range(k, len(numbers)):\n        window_sum += numbers[i] - numbers[i - k]\n"
                "        max_sum = max(max_sum, window_sum)\n    return max_sum\n\n"
                "print(max_sum_subarray([2, 1, 5, 1, 3, 2], 3))"
            ),
        ],
        "xp_reward": 350, "coin_reward": 70, "skill_unlocked": "Sliding Window",
    },
    {
        "id": "w16_l82", "order": 82, "world": 16,
        "title": "The Stack of Supplies",
        "story": (
            "Py's supplies get piled one on top of the other — and whatever was placed down "
            "most recently always has to come off first."
        ),
        "concept_title": "Stack — Last In, First Out",
        "concept_explanation": (
            "A plain list already works as a stack: .append(item) pushes onto the top, .pop() "
            "removes and returns the top item — always the most recently added one (LIFO: "
            "Last In, First Out)."
        ),
        "example": {"code": "stack = []\nstack.append(1)\nstack.append(2)\nprint(stack.pop())", "output": "2"},
        "mission": (
            "Push 'Sword', 'Shield', 'Potion' onto a stack (a list) using append(), in that "
            "order. Pop twice and print each removed item, one per line."
        ),
        "starter_code": "stack = []\n# push Sword, Shield, Potion, then pop twice, printing each result\n",
        "stdin_lines": [],
        "expected_output": "Potion\nShield",
        "hints": [
            "Whatever was pushed LAST comes off FIRST — that's what makes it a stack.",
            "Three .append() calls, then two .pop() calls, each printed as it happens.",
            (
                'stack.append("Sword")\nstack.append("Shield")\nstack.append("Potion")\n'
                "print(stack.pop())\nprint(stack.pop())"
            ),
        ],
        "xp_reward": 350, "coin_reward": 70, "skill_unlocked": "Stack",
    },
    {
        "id": "w16_l83", "order": 83, "world": 16,
        "title": "The Waiting Line",
        "story": (
            "A line of travelers forms at the village gate — first to arrive, first to be let "
            "through. No cutting in line, no matter how the pile of supplies worked."
        ),
        "concept_title": "Queue — First In, First Out",
        "concept_explanation": (
            "collections.deque works well as a queue: .append(item) adds to the back, "
            ".popleft() removes and returns from the front — always the earliest-added item "
            "(FIFO: First In, First Out)."
        ),
        "example": {"code": "from collections import deque\nq = deque()\nq.append(1)\nq.append(2)\nprint(q.popleft())", "output": "1"},
        "mission": (
            "Using collections.deque, enqueue 'Fox', 'Owl', 'Bear' with append(), in that "
            "order. Dequeue twice with popleft() and print each removed item."
        ),
        "starter_code": "from collections import deque\nqueue = deque()\n# enqueue Fox, Owl, Bear, then dequeue twice, printing each result\n",
        "stdin_lines": [],
        "expected_output": "Fox\nOwl",
        "hints": [
            "Whoever arrived FIRST leaves FIRST too — the opposite order from a stack.",
            "Three .append() calls, then two .popleft() calls, each printed as it happens.",
            (
                'queue.append("Fox")\nqueue.append("Owl")\nqueue.append("Bear")\n'
                "print(queue.popleft())\nprint(queue.popleft())"
            ),
        ],
        "xp_reward": 350, "coin_reward": 70, "skill_unlocked": "Queue",
    },
    {
        "id": "w16_l84", "order": 84, "world": 16,
        "title": "The Letter Counter",
        "story": (
            "A scroll needs every letter tallied at a glance — instantly looking up how many "
            "times any one letter shows up, without scanning the whole word again each time."
        ),
        "concept_title": "Hash Maps (Dictionaries) for Counting",
        "concept_explanation": (
            "A dictionary makes a natural counter: counts.get(ch, 0) + 1 reads the current tally "
            "for ch (or 0 if it's never been seen) and adds one — instant lookups either way, no "
            "matter how large the data gets."
        ),
        "example": {"code": "counts = {}\nfor ch in \"aab\":\n    counts[ch] = counts.get(ch, 0) + 1\nprint(counts[\"a\"])", "output": "2"},
        "mission": "Count how many times each letter appears in 'banana' using a dictionary, then print the count for 'a'.",
        "starter_code": "word = \"banana\"\ncounts = {}\n# count each letter's occurrences, then print counts[\"a\"]\n",
        "stdin_lines": [],
        "expected_output": "3",
        "hints": [
            "For every letter, look up its current count (or 0 if new) and add one to it.",
            'counts[ch] = counts.get(ch, 0) + 1 works for every letter as you loop through the word.',
            'for ch in word:\n    counts[ch] = counts.get(ch, 0) + 1\nprint(counts["a"])',
        ],
        "xp_reward": 350, "coin_reward": 70, "skill_unlocked": "Hash Maps",
    },
    {
        "id": "w16_l85", "order": 85, "world": 16,
        "title": "The Recursive Mirror",
        "story": (
            "An ancient mirror answers every question by asking a smaller version of the same "
            "question first, all the way down to the simplest case, then building the answer "
            "back up."
        ),
        "concept_title": "Recursion",
        "concept_explanation": (
            "A recursive function calls itself with a smaller version of the same problem, "
            "until it reaches a base case simple enough to answer directly — factorial(0) = 1 is "
            "the base case; every other call multiplies n by factorial(n - 1)."
        ),
        "example": {"code": "def countdown(n):\n    if n == 0:\n        return\n    print(n)\n    countdown(n - 1)\n\ncountdown(3)", "output": "3\n2\n1"},
        "mission": "Write a recursive factorial(n) that returns n! (factorial(0) = 1). Print factorial(5).",
        "starter_code": "# define a recursive factorial(n), then print factorial(5)\n",
        "stdin_lines": [],
        "expected_output": "120",
        "hints": [
            "The base case (n == 0) needs to return directly, with no further recursive call.",
            "Every other case returns n multiplied by factorial(n - 1).",
            "def factorial(n):\n    if n == 0:\n        return 1\n    return n * factorial(n - 1)\n\nprint(factorial(5))",
        ],
        "xp_reward": 380, "coin_reward": 75, "skill_unlocked": "Recursion",
    },
    {
        "id": "w16_l86", "order": 86, "world": 16,
        "title": "The Branching Tree",
        "story": (
            "A great tree stands at the frontier's heart — every branch connects to exactly one "
            "trunk above it, and splits into its own smaller branches below."
        ),
        "concept_title": "Trees",
        "concept_explanation": (
            "A tree is built from nodes, each holding a value and (optionally) references to a "
            "left and right child node — a Node class with value/left/right attributes is the "
            "simplest way to represent one directly."
        ),
        "example": {"code": "class Node:\n    def __init__(self, value, left=None, right=None):\n        self.value = value\n        self.left = left\n        self.right = right\n\nroot = Node(1, Node(2))\nprint(root.left.value)", "output": "2"},
        "mission": (
            "Define Node(value, left=None, right=None). Create root = Node(10, Node(5), "
            "Node(15)). Print root.left.value + root.right.value."
        ),
        "starter_code": "# define Node, create root = Node(10, Node(5), Node(15)), then print root.left.value + root.right.value\n",
        "stdin_lines": [],
        "expected_output": "20",
        "hints": [
            "Node(5) and Node(15) become root's left and right children directly.",
            "root.left.value reads the value stored in root's left child node.",
            (
                "class Node:\n    def __init__(self, value, left=None, right=None):\n        self.value = value\n"
                "        self.left = left\n        self.right = right\n\n"
                "root = Node(10, Node(5), Node(15))\nprint(root.left.value + root.right.value)"
            ),
        ],
        "xp_reward": 380, "coin_reward": 75, "skill_unlocked": "Trees",
    },
    {
        "id": "w16_l87", "order": 87, "world": 16,
        "title": "Walking the Branches",
        "story": (
            "To truly understand the great tree, Py must walk every branch in a specific "
            "order — left side first, then the trunk itself, then the right side."
        ),
        "concept_title": "Tree Traversal (In-Order)",
        "concept_explanation": (
            "In-order traversal visits a tree's left subtree first, then the node itself, then "
            "the right subtree — done recursively, since each subtree is really just a smaller "
            "tree with the exact same shape."
        ),
        "example": {"code": "class Node:\n    def __init__(self, v, l=None, r=None):\n        self.value, self.left, self.right = v, l, r\n\ndef inorder(n, res):\n    if n is None:\n        return\n    inorder(n.left, res)\n    res.append(n.value)\n    inorder(n.right, res)\n\nr = Node(2, Node(1))\nout = []\ninorder(r, out)\nprint(out)", "output": "[1, 2]"},
        "mission": (
            "Using the Node class, write inorder(node, result) that appends values in left, "
            "root, right order recursively. Build root = Node(10, Node(5), Node(15)), traverse "
            "it, and print the resulting list."
        ),
        "starter_code": (
            "class Node:\n    def __init__(self, value, left=None, right=None):\n        self.value = value\n"
            "        self.left = left\n        self.right = right\n\n"
            "# define inorder(node, result), build root = Node(10, Node(5), Node(15)), traverse, and print the list\n"
        ),
        "stdin_lines": [],
        "expected_output": "[5, 10, 15]",
        "hints": [
            "Visit the left child completely first, then this node, then the right child completely.",
            "If node is None, return immediately — that's the base case that stops the recursion.",
            (
                "def inorder(node, result):\n    if node is None:\n        return\n    inorder(node.left, result)\n"
                "    result.append(node.value)\n    inorder(node.right, result)\n\n"
                "root = Node(10, Node(5), Node(15))\nresult = []\ninorder(root, result)\nprint(result)"
            ),
        ],
        "xp_reward": 390, "coin_reward": 75, "skill_unlocked": "Tree Traversal",
    },
    {
        "id": "w16_l88", "order": 88, "world": 16,
        "title": "The Connected Realms",
        "story": (
            "Beyond the tree lies something less orderly — realms connected to each other in "
            "no fixed pattern, some linking to many others, some to none at all."
        ),
        "concept_title": "Graphs",
        "concept_explanation": (
            "A graph is a set of nodes connected by edges — no strict parent/child shape "
            "required. A simple way to represent one in Python: a dictionary mapping each node "
            "to a list of its neighbors."
        ),
        "example": {"code": "graph = {\"X\": [\"Y\"], \"Y\": []}\nprint(graph[\"X\"])", "output": "['Y']"},
        "mission": (
            "Represent a graph as {'A': ['B', 'C'], 'B': ['D'], 'C': [], 'D': []}. Print the "
            "neighbors of 'A'."
        ),
        "starter_code": "# create the graph dictionary, then print graph[\"A\"]\n",
        "stdin_lines": [],
        "expected_output": "['B', 'C']",
        "hints": [
            "Each key's value is simply the list of nodes it connects to.",
            'graph["A"] looks up the list of neighbors stored for "A".',
            'graph = {"A": ["B", "C"], "B": ["D"], "C": [], "D": []}\nprint(graph["A"])',
        ],
        "xp_reward": 390, "coin_reward": 75, "skill_unlocked": "Graphs",
    },
    {
        "id": "w16_l89", "order": 89, "world": 16,
        "title": "Breadth-First Scouting",
        "story": (
            "A scouting party explores the connected realms layer by layer — every neighboring "
            "realm gets visited before moving one step further out."
        ),
        "concept_title": "Breadth-First Search (BFS)",
        "concept_explanation": (
            "BFS explores a graph level by level using a queue: visit a node, add its "
            "unvisited neighbors to the queue, then move to the next node waiting in that "
            "queue — nearby nodes always get visited before farther ones."
        ),
        "example": {"code": "from collections import deque\ndef bfs(g, s):\n    v = [s]\n    q = deque([s])\n    while q:\n        n = q.popleft()\n        for nb in g[n]:\n            if nb not in v:\n                v.append(nb)\n                q.append(nb)\n    return v\n\nprint(bfs({\"X\": [\"Y\"], \"Y\": []}, \"X\"))", "output": "['X', 'Y']"},
        "mission": (
            "Write bfs(graph, start) that returns nodes in the order first visited, using a "
            "queue (collections.deque). Call bfs(graph, 'A') on {'A': ['B', 'C'], 'B': ['D'], "
            "'C': [], 'D': []} and print the result."
        ),
        "starter_code": (
            "from collections import deque\n\ngraph = {\"A\": [\"B\", \"C\"], \"B\": [\"D\"], \"C\": [], \"D\": []}\n"
            "# define bfs(graph, start) using a queue, then print bfs(graph, \"A\")\n"
        ),
        "stdin_lines": [],
        "expected_output": "['A', 'B', 'C', 'D']",
        "hints": [
            "Keep a queue of nodes to visit next, and a list of nodes already visited.",
            "Pop from the front of the queue, then add any unvisited neighbors to its back.",
            (
                "def bfs(graph, start):\n    visited = [start]\n    queue = deque([start])\n    while queue:\n"
                "        node = queue.popleft()\n        for neighbor in graph[node]:\n            if neighbor not in visited:\n"
                "                visited.append(neighbor)\n                queue.append(neighbor)\n    return visited\n\n"
                'print(bfs(graph, "A"))'
            ),
        ],
        "xp_reward": 420, "coin_reward": 80, "skill_unlocked": "BFS",
    },
    {
        "id": "w16_l90", "order": 90, "world": 16,
        "title": "Depth-First Descent",
        "story": (
            "The Algorithm Overlord blocks the frontier's final passage. \"Scouting layer by "
            "layer is one way,\" it booms. \"Show me you can also plunge as deep as possible "
            "down one path before ever backing up.\""
        ),
        "concept_title": "Depth-First Search (DFS)",
        "concept_explanation": (
            "DFS explores as far as possible down one path before backtracking — naturally "
            "written with recursion: visit a node, then fully explore each unvisited neighbor "
            "(and everything reachable from it) before moving to the next one."
        ),
        "example": {"code": "def dfs(g, s, v=None):\n    if v is None:\n        v = []\n    v.append(s)\n    for nb in g[s]:\n        if nb not in v:\n            dfs(g, nb, v)\n    return v\n\nprint(dfs({\"X\": [\"Y\"], \"Y\": []}, \"X\"))", "output": "['X', 'Y']"},
        "mission": (
            "Write dfs(graph, start) that returns nodes in visited order using recursion. Call "
            "dfs(graph, 'A') on {'A': ['B', 'C'], 'B': ['D'], 'C': [], 'D': []} and print the result."
        ),
        "starter_code": (
            "graph = {\"A\": [\"B\", \"C\"], \"B\": [\"D\"], \"C\": [], \"D\": []}\n"
            "# define dfs(graph, start, visited=None) using recursion, then print dfs(graph, \"A\")\n"
        ),
        "stdin_lines": [],
        "expected_output": "['A', 'B', 'D', 'C']",
        "hints": [
            "Visit the current node, then dive fully into its FIRST unvisited neighbor before the next.",
            "A default visited=None argument, turned into a fresh list on the first call, tracks progress across the recursion.",
            (
                "def dfs(graph, start, visited=None):\n    if visited is None:\n        visited = []\n"
                "    visited.append(start)\n    for neighbor in graph[start]:\n        if neighbor not in visited:\n"
                "            dfs(graph, neighbor, visited)\n    return visited\n\nprint(dfs(graph, \"A\"))"
            ),
        ],
        "xp_reward": 450, "coin_reward": 90, "skill_unlocked": "DFS — World 16 Complete",
    },
]

FINAL_WORLD_LEVELS = [
    {
        "id": "w17_l91", "order": 91, "world": 17,
        "title": "The Kingdom of Python",
        "story": (
            "Py stands before the final gate — the Kingdom of Python itself, ruled from a "
            "throne that only recognizes those who can bring their own creation to life and "
            "make it act. This is no more mission text to follow: build the battle yourself."
        ),
        "concept_title": "Bringing It All Together",
        "concept_explanation": (
            "Every world's lesson lives inside a single working system here: a class with a "
            "constructor and a method (Worlds 12), inheritance (World 12), and objects acting "
            "on each other in sequence — the same ingredients as everything already learned, "
            "combined into one small program instead of a dozen separate ones."
        ),
        "example": None,
        "mission": (
            "Define Character with __init__(self, name, health, power) and attack(self, other) "
            "that reduces other.health by self.power. Define Warrior(Character) that just "
            "inherits (pass). Create hero = Warrior('Py', 100, 30) and enemy = "
            "Warrior('Shadow Serpent', 100, 20). Have hero attack enemy, then enemy attack "
            "hero. Print hero.health, enemy.health."
        ),
        "starter_code": (
            "# define Character (with attack()), then Warrior(Character)\n"
            "# create hero and enemy, exchange one attack each, then print both healths\n"
        ),
        "stdin_lines": [],
        "expected_output": "80 70",
        "visual_effect": {"type": "counter", "icon": "⚔️", "label": "Battle Resolved", "before": 100, "after": 80},
        "hints": [
            "attack(self, other) changes the OTHER character's health, not its own.",
            "Warrior needs nothing beyond pass — it inherits attack() straight from Character.",
            (
                "class Character:\n    def __init__(self, name, health, power):\n        self.name = name\n"
                "        self.health = health\n        self.power = power\n\n    def attack(self, other):\n"
                "        other.health -= self.power\n\nclass Warrior(Character):\n    pass\n\n"
                'hero = Warrior("Py", 100, 30)\nenemy = Warrior("Shadow Serpent", 100, 20)\n'
                "hero.attack(enemy)\nenemy.attack(hero)\nprint(hero.health, enemy.health)"
            ),
        ],
        "xp_reward": 1000, "coin_reward": 200, "skill_unlocked": "👑 Kingdom of Python Conquered!",
    },
]
