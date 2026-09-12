"""Content for "PY — Journey to the Kingdom of Python" — Worlds 3-8:
The Kingdom of Decisions, The Loop Dungeon, The Collection Valley, The
String Kingdom, The Function Village, and Python Power. See levels.py's
module docstring for the shared grading convention (every mission ends in
exactly one print — for a loop/comprehension level that means a multi-line
stdout block, which the stdout-diff grader compares as one exact-text
block, so no engine change was needed to support these). Every solution
below was verified locally against a real Python 3 interpreter before its
expected_output was hardcoded here, same convention sql_games/frog/levels.py
documents for its own expected_result values.
"""

WORLD_3_LEVELS = [
    {
        "id": "w3_l08", "order": 8, "world": 3,
        "title": "The If Gate",
        "story": (
            "The mountain path ends at a stone gate covered in moss. \"Only the well-provisioned "
            "may pass,\" it creaks. \"Prove you carry enough to continue.\""
        ),
        "concept_title": "if — Making a Decision",
        "concept_explanation": (
            "if condition: runs the indented code underneath only when that condition is True — "
            "skip it entirely otherwise. Indentation (4 spaces, consistently) is how Python knows "
            "what belongs inside the if."
        ),
        "example": {"code": "energy = 5\nif energy > 0:\n    print(\"Still moving!\")", "output": "Still moving!"},
        "mission": "Py has 12 coins. If Py has at least 10 coins, print: Gate Opens!",
        "starter_code": "coins = 12\n# if coins is at least 10, print the message\n",
        "stdin_lines": [],
        "expected_output": "Gate Opens!",
        "hints": [
            "You only need to print something when the condition is met — nothing otherwise.",
            "if coins >= 10: then, indented on the next line, print the message.",
            'if coins >= 10:\n    print("Gate Opens!")',
        ],
        "xp_reward": 150, "coin_reward": 30, "skill_unlocked": "if",
    },
    {
        "id": "w3_l09", "order": 9, "world": 3,
        "title": "The Else Bridge",
        "story": (
            "A rope bridge sags under Py's weight, creaking a warning. Whatever happens next, "
            "there needs to be a plan for BOTH outcomes — cross safely, or turn back."
        ),
        "concept_title": "if / else — Covering Both Paths",
        "concept_explanation": (
            "else: covers the case where the if's condition was False — together they guarantee "
            "exactly one of the two blocks always runs."
        ),
        "example": {"code": "score = 40\nif score >= 50:\n    print(\"Pass\")\nelse:\n    print(\"Fail\")", "output": "Fail"},
        "mission": "Py weighs 8kg. If weight is less than 10, print: Cross safely! Otherwise print: Too heavy!",
        "starter_code": "weight = 8\n# if weight < 10 print one message, otherwise the other\n",
        "stdin_lines": [],
        "expected_output": "Cross safely!",
        "hints": [
            "You need two possible outcomes, and exactly one of them should happen.",
            "if condition: ... else: ... — else covers everything the if didn't.",
            'if weight < 10:\n    print("Cross safely!")\nelse:\n    print("Too heavy!")',
        ],
        "xp_reward": 150, "coin_reward": 30, "skill_unlocked": "if / else",
    },
    {
        "id": "w3_l10", "order": 10, "world": 3,
        "title": "The Elif Castle",
        "story": (
            "A castle guard sizes Py up. \"We sort every traveler by condition,\" she says. "
            "\"Strong, Weak, or Danger. Let's see which you are.\""
        ),
        "concept_title": "elif — More Than Two Outcomes",
        "concept_explanation": (
            "elif (\"else if\") lets you check another condition only if the ones before it were "
            "False — chain as many as you need, with one final else as the catch-all."
        ),
        "example": {"code": "n = 5\nif n > 10:\n    print(\"big\")\nelif n > 0:\n    print(\"small\")\nelse:\n    print(\"zero or less\")", "output": "small"},
        "mission": (
            "Py's health is 50. Print Strong if health is above 80, Weak if health is above 30, "
            "otherwise print Danger."
        ),
        "starter_code": "health = 50\n# classify health as Strong / Weak / Danger\n",
        "stdin_lines": [],
        "expected_output": "Weak",
        "hints": [
            "You need to check more than two possibilities this time.",
            "if ... elif ... else: chains as many checks as you need, top to bottom.",
            'if health > 80:\n    print("Strong")\nelif health > 30:\n    print("Weak")\nelse:\n    print("Danger")',
        ],
        "xp_reward": 160, "coin_reward": 30, "skill_unlocked": "elif",
    },
    {
        "id": "w3_l11", "order": 11, "world": 3,
        "title": "Nested Decision Dungeon",
        "story": (
            "A dungeon door has two separate locks stacked one above the other. \"The key opens "
            "the first lock,\" reads a plaque. \"But only real strength turns the second.\""
        ),
        "concept_title": "Nested if — A Decision Inside a Decision",
        "concept_explanation": (
            "An if statement can contain another if inside it — the inner one only even gets "
            "checked when the outer condition was True. This lets you handle several dependent "
            "conditions cleanly, one layer at a time."
        ),
        "example": {"code": "raining = True\nhas_umbrella = False\nif raining:\n    if has_umbrella:\n        print(\"Stay dry\")\n    else:\n        print(\"Get wet\")\nelse:\n    print(\"Sunny\")", "output": "Get wet"},
        "mission": (
            "Py has the key (has_key = True) and 15 energy. If Py has the key: print Door Opens! "
            "when energy is at least 10, otherwise print Too Tired!. If Py doesn't have the key, "
            "print No Key! Use a nested if."
        ),
        "starter_code": "has_key = True\nenergy = 15\n# use a nested if/else as described\n",
        "stdin_lines": [],
        "expected_output": "Door Opens!",
        "hints": [
            "Check the key first — only bother checking energy if the key is there at all.",
            "Put a second if/else inside the first if's True branch.",
            'if has_key:\n    if energy >= 10:\n        print("Door Opens!")\n    else:\n        print("Too Tired!")\nelse:\n    print("No Key!")',
        ],
        "xp_reward": 200, "coin_reward": 40, "skill_unlocked": "Nested Conditions — World 3 Complete",
    },
]

WORLD_4_LEVELS = [
    {
        "id": "w4_l12", "order": 12, "world": 4,
        "title": "Understanding Repetition",
        "story": (
            "A long, featureless dungeon corridor stretches ahead. Taking a step is easy — "
            "typing the same instruction over and over to cross the whole thing is not."
        ),
        "concept_title": "Why Loops Exist",
        "concept_explanation": (
            "Repeating the same line of code by hand doesn't scale — for i in range(n): runs its "
            "indented block exactly n times, so \"do this 4 times\" becomes one short instruction "
            "instead of four copy-pasted ones."
        ),
        "example": {"code": "for i in range(3):\n    print(\"Hop!\")", "output": "Hop!\nHop!\nHop!"},
        "mission": "Print Step forward! exactly 4 times, using a loop instead of 4 separate print() calls.",
        "starter_code": "# print \"Step forward!\" four times, using a loop\n",
        "stdin_lines": [],
        "expected_output": "Step forward!\nStep forward!\nStep forward!\nStep forward!",
        "hints": [
            "Four repeats of the exact same line is exactly what a loop is for.",
            "for i in range(4): then, indented, the print() call.",
            'for i in range(4):\n    print("Step forward!")',
        ],
        "xp_reward": 160, "coin_reward": 30, "skill_unlocked": "Why Loops Exist",
    },
    {
        "id": "w4_l13", "order": 13, "world": 4,
        "title": "For Loop Forest",
        "story": (
            "The corridor opens into a mossy forest with five stepping stones in a row, each "
            "carved with a number. Step on them in order, calling each number out loud."
        ),
        "concept_title": "for and range()",
        "concept_explanation": (
            "range(start, stop) produces the whole numbers from start up to (but not including) "
            "stop. for value in range(1, 6): visits 1, 2, 3, 4, 5 — one at a time, in order."
        ),
        "example": {"code": "for n in range(2, 5):\n    print(n)", "output": "2\n3\n4"},
        "mission": "Print the numbers 1 through 5, each on its own line, using a for loop and range().",
        "starter_code": "# print 1 through 5 using a for loop\n",
        "stdin_lines": [],
        "expected_output": "1\n2\n3\n4\n5",
        "hints": [
            "range() can start somewhere other than 0 if you give it two numbers.",
            "range(1, 6) gives you 1 through 5 — remember, the stop number is never included.",
            "for n in range(1, 6):\n    print(n)",
        ],
        "xp_reward": 160, "coin_reward": 30, "skill_unlocked": "for & range()",
    },
    {
        "id": "w4_l14", "order": 14, "world": 4,
        "title": "The While Loop Dungeon",
        "story": (
            "A training dummy stands in the dungeon's center. \"Keep attacking until you're "
            "out of strength,\" a plaque instructs. Nobody knows exactly how many hits that'll take — "
            "it depends on how much strength you started with."
        ),
        "concept_title": "while — Repeat Until a Condition Fails",
        "concept_explanation": (
            "while condition: repeats its block for as long as the condition stays True — perfect "
            "when you don't know the exact number of repeats in advance, only when to stop. "
            "Remember to change something inside the loop that eventually makes the condition False, "
            "or it never ends!"
        ),
        "example": {"code": "n = 3\nwhile n > 0:\n    print(n)\n    n -= 1", "output": "3\n2\n1"},
        "mission": (
            "Py's health starts at 3. While health is greater than 0, print Attack! and reduce "
            "health by 1 each time through the loop."
        ),
        "starter_code": "health = 3\n# use a while loop as described\n",
        "stdin_lines": [],
        "expected_output": "Attack!\nAttack!\nAttack!",
        "hints": [
            "You don't know ahead of time how many times this needs to repeat — only when to stop.",
            "while health > 0: — and don't forget to reduce health inside the loop each time.",
            'while health > 0:\n    print("Attack!")\n    health -= 1',
        ],
        "xp_reward": 170, "coin_reward": 35, "skill_unlocked": "while",
    },
    {
        "id": "w4_l15", "order": 15, "world": 4,
        "title": "Break and Continue",
        "story": (
            "Deeper in the dungeon, numbered tiles line the floor. Some are cursed (skip them "
            "entirely) and one is a trap that ends the crossing the moment you reach it."
        ),
        "concept_title": "break and continue",
        "concept_explanation": (
            "continue skips the rest of the current loop pass and moves straight to the next one. "
            "break exits the loop immediately, completely — no more passes at all, even if there "
            "would have been more."
        ),
        "example": {"code": "for n in range(1, 6):\n    if n == 4:\n        break\n    if n == 2:\n        continue\n    print(n)", "output": "1\n3"},
        "mission": (
            "Loop through numbers 1 to 10. Skip odd numbers with continue. Stop the loop "
            "completely with break the moment you reach 7 (don't print 7 itself)."
        ),
        "starter_code": "# loop 1 to 10: skip odd numbers, stop completely at 7\n",
        "stdin_lines": [],
        "expected_output": "2\n4\n6",
        "hints": [
            "Two separate checks are needed each pass through the loop: skip, and stop.",
            "Check for the stopping number first (break), then check for odd numbers (continue).",
            'for n in range(1, 11):\n    if n == 7:\n        break\n    if n % 2 != 0:\n        continue\n    print(n)',
        ],
        "xp_reward": 180, "coin_reward": 35, "skill_unlocked": "break & continue",
    },
    {
        "id": "w4_l16", "order": 16, "world": 4,
        "title": "Nested Loops",
        "story": (
            "The dungeon's final chamber is a wide stone grid, 3 tiles by 3. A voice echoes: "
            "\"Announce every square you'd cross, row by row, before the door will open.\""
        ),
        "concept_title": "Nested Loops — A Loop Inside a Loop",
        "concept_explanation": (
            "Just like an if can contain another if, a for loop can contain another for loop. The "
            "inner loop runs all the way through, every single time the outer loop takes one step — "
            "perfect for grids, tables, and anything with two dimensions."
        ),
        "example": {"code": "for row in range(2):\n    for col in range(2):\n        print(row, col)", "output": "0 0\n0 1\n1 0\n1 1"},
        "mission": (
            "For each row from 0 to 2, and each column from 0 to 2, print the row and column "
            "(print(row, col)) — 9 lines total, using a loop inside a loop."
        ),
        "starter_code": "# print every row, col pair in a 3x3 grid using nested loops\n",
        "stdin_lines": [],
        "expected_output": "0 0\n0 1\n0 2\n1 0\n1 1\n1 2\n2 0\n2 1\n2 2",
        "hints": [
            "For every single row, you need to visit every column — that's a loop inside a loop.",
            "The inner for col in range(3) loop goes inside the outer for row in range(3) loop.",
            "for row in range(3):\n    for col in range(3):\n        print(row, col)",
        ],
        "xp_reward": 220, "coin_reward": 45, "skill_unlocked": "Nested Loops — World 4 Complete",
    },
]

WORLD_5_LEVELS = [
    {
        "id": "w5_l17", "order": 17, "world": 5,
        "title": "The Collection Valley",
        "story": (
            "A wide valley opens up, dotted with item caches. Py can't remember everything by "
            "giving each thing its own separate name — there needs to be one place to keep a "
            "whole collection of them."
        ),
        "concept_title": "Lists",
        "concept_explanation": (
            "A list holds several values in one ordered collection: items = [\"apple\", \"key\"]. "
            "You can add to it with .append(value), and see the whole thing with print(items)."
        ),
        "example": {"code": "loot = [\"coin\"]\nloot.append(\"gem\")\nprint(loot)", "output": "['coin', 'gem']"},
        "mission": 'Py\'s items list is ["apple", "key"]. Add "coin" to the end of it, then print the whole list.',
        "starter_code": 'items = ["apple", "key"]\n# add "coin" to the list, then print it\n',
        "stdin_lines": [],
        "expected_output": "['apple', 'key', 'coin']",
        "hints": [
            "Lists have a built-in way to add something new to the end.",
            "list_name.append(value) adds value to the end of the list.",
            'items.append("coin")\nprint(items)',
        ],
        "xp_reward": 170, "coin_reward": 35, "skill_unlocked": "Lists",
    },
    {
        "id": "w5_l18", "order": 18, "world": 5,
        "title": "The Inventory Sort",
        "story": (
            "Py's inventory has spilled out of order. A merchant offers a better trade price — "
            "but only for a properly sorted inventory."
        ),
        "concept_title": "List Methods",
        "concept_explanation": (
            "Lists have several built-in methods beyond append(): .sort() reorders a list in place "
            "from smallest to largest, .reverse() flips the order, .remove(value) deletes the first "
            "matching value, .pop() removes and returns the last item."
        ),
        "example": {"code": "nums = [3, 1, 2]\nnums.sort()\nprint(nums)", "output": "[1, 2, 3]"},
        "mission": "Py's inventory is [5, 3, 8, 1]. Sort it in place, then print it.",
        "starter_code": "inventory = [5, 3, 8, 1]\n# sort it in place, then print it\n",
        "stdin_lines": [],
        "expected_output": "[1, 3, 5, 8]",
        "hints": [
            "There's a list method that reorders a list from smallest to largest.",
            "list_name.sort() sorts the list in place — it doesn't return a new one.",
            "inventory.sort()\nprint(inventory)",
        ],
        "xp_reward": 170, "coin_reward": 35, "skill_unlocked": "List Methods",
    },
    {
        "id": "w5_l19", "order": 19, "world": 5,
        "title": "List Slicing",
        "story": (
            "An old map marks Py's planned route as a long list of waypoints — but only the "
            "middle stretch actually matters for today's leg of the journey."
        ),
        "concept_title": "List Slicing",
        "concept_explanation": (
            "items[start:stop] gives you a slice — a new list holding just that range, from start "
            "up to (not including) stop. Leave either side blank to mean \"from the beginning\" or "
            "\"to the end\": items[:3], items[2:], items[:] (the whole thing)."
        ),
        "example": {"code": "path = [1, 2, 3, 4, 5]\nprint(path[:2])", "output": "[1, 2]"},
        "mission": "Py's path is [10, 20, 30, 40, 50]. Print just the middle three steps — index 1 up to (not including) index 4.",
        "starter_code": "path = [10, 20, 30, 40, 50]\n# print just path[1:4]\n",
        "stdin_lines": [],
        "expected_output": "[20, 30, 40]",
        "hints": [
            "You need a slice, not a single index — a range of positions from the list.",
            "path[1:4] means \"from index 1 up to, but not including, index 4\".",
            "print(path[1:4])",
        ],
        "xp_reward": 170, "coin_reward": 35, "skill_unlocked": "List Slicing",
    },
    {
        "id": "w5_l20", "order": 20, "world": 5,
        "title": "The Tuple Marker",
        "story": (
            "A stone marker on the ground shows Py's exact coordinates, carved permanently into "
            "the rock — this position can never be changed once it's set."
        ),
        "concept_title": "Tuples — Fixed, Ordered Pairs",
        "concept_explanation": (
            "A tuple, written with parentheses like (10, 20), is an ordered collection just like a "
            "list — except it's immutable: once created, its contents can never change. Perfect "
            "for something like a coordinate that shouldn't accidentally get edited later."
        ),
        "example": {"code": "point = (0, 0)\nprint(point)", "output": "(0, 0)"},
        "mission": "Py's position is the tuple (3, 4). Print it.",
        "starter_code": "# create a tuple called position holding (3, 4), then print it\n",
        "stdin_lines": [],
        "expected_output": "(3, 4)",
        "hints": [
            "A tuple looks just like a list, but with round brackets instead of square ones.",
            "position = (3, 4) creates the tuple; print(position) shows it.",
            "position = (3, 4)\nprint(position)",
        ],
        "xp_reward": 170, "coin_reward": 35, "skill_unlocked": "Tuples",
    },
    {
        "id": "w5_l21", "order": 21, "world": 5,
        "title": "The Badge Counter",
        "story": (
            "Py has been collecting colored badges from every region — but several colors got "
            "picked up more than once. Only the unique colors actually count toward the collection."
        ),
        "concept_title": "Sets — Guaranteed Uniqueness",
        "concept_explanation": (
            "A set, written {1, 2, 3}, is an unordered collection that automatically removes "
            "duplicates. set(some_list) converts a list into a set, instantly collapsing any "
            "repeated values down to one."
        ),
        "example": {"code": "nums = [1, 1, 2, 2, 3]\nprint(len(set(nums)))", "output": "3"},
        "mission": (
            'Py\'s collected badge colors are ["red", "blue", "red", "green", "blue"]. Convert this '
            "to a set to find the unique colors, then print how many unique colors there are."
        ),
        "starter_code": 'colors = ["red", "blue", "red", "green", "blue"]\n# convert to a set, then print how many unique colors there are\n',
        "stdin_lines": [],
        "expected_output": "3",
        "hints": [
            "A set automatically throws away duplicate values, keeping only the unique ones.",
            "set(colors) makes a set from the list; len() counts how many items are in it.",
            "unique_colors = set(colors)\nprint(len(unique_colors))",
        ],
        "xp_reward": 180, "coin_reward": 35, "skill_unlocked": "Sets",
    },
    {
        "id": "w5_l22", "order": 22, "world": 5,
        "title": "The Player Record",
        "story": (
            "A village clerk keeps every traveler's details on one card, organized by label: "
            "name, health, coins — each with its own value, all in one place."
        ),
        "concept_title": "Dictionaries — Labeled Values",
        "concept_explanation": (
            "A dictionary stores key: value pairs — player = {\"name\": \"Py\", \"health\": 100} — "
            "and you look a value up by its key: player[\"health\"] gives you 100."
        ),
        "example": {"code": "item = {\"name\": \"Sword\", \"power\": 12}\nprint(item[\"power\"])", "output": "12"},
        "mission": 'Create a dictionary called player with "name" set to "Py" and "health" set to 100. Print player["health"].',
        "starter_code": "# create the player dictionary, then print player[\"health\"]\n",
        "stdin_lines": [],
        "expected_output": "100",
        "hints": [
            "A dictionary is written with curly braces and key: value pairs.",
            'player = {"name": "Py", "health": 100} creates it; player["health"] looks up a value by its key.',
            'player = {"name": "Py", "health": 100}\nprint(player["health"])',
        ],
        "xp_reward": 180, "coin_reward": 35, "skill_unlocked": "Dictionaries",
    },
    {
        "id": "w5_l23", "order": 23, "world": 5,
        "title": "The Stats Ledger",
        "story": (
            "The valley's final challenge: a ledger of Py's stats. Some entries don't exist yet — "
            "asking for one that isn't there shouldn't crash the whole journey."
        ),
        "concept_title": "Dictionary Methods",
        "concept_explanation": (
            "dict.get(key, default) safely looks up a key — if it's missing, it returns default "
            "instead of crashing the program. Other useful methods: .keys(), .values(), .items() "
            "(all three parts at once), and .update() (merge in new key/value pairs)."
        ),
        "example": {"code": "stats = {\"health\": 100}\nprint(stats.get(\"shield\", 0))", "output": "0"},
        "mission": (
            "Py's stats dictionary is {'health': 100, 'coins': 50}. Use .get() to safely print the "
            "value of 'mana' with a default of 0, since 'mana' isn't in the dictionary yet."
        ),
        "starter_code": "stats = {\"health\": 100, \"coins\": 50}\n# use .get() to safely print 'mana', defaulting to 0\n",
        "stdin_lines": [],
        "expected_output": "0",
        "hints": [
            "Looking up a missing key directly would crash — there's a safer way.",
            "dict_name.get(key, default) never crashes; it just returns default if the key is missing.",
            'print(stats.get("mana", 0))',
        ],
        "xp_reward": 230, "coin_reward": 45, "skill_unlocked": "Dictionary Methods — World 5 Complete",
    },
]

WORLD_6_LEVELS = [
    {
        "id": "w6_l24", "order": 24, "world": 6,
        "title": "The String Kingdom Gate",
        "story": (
            "A kingdom built entirely of words and letters rises ahead. Its gatekeeper only "
            "speaks in slices of names — show you can carve up text the same way."
        ),
        "concept_title": "Strings — Indexing & Slicing",
        "concept_explanation": (
            "A string is just text — and it works like a list of characters. name[0] gets the "
            "first character; name[:3] slices out the first three, exactly like list slicing."
        ),
        "example": {"code": "word = \"Kingdom\"\nprint(word[:4])", "output": "King"},
        "mission": "Py's name is 'Python'. Print just the first 3 letters using slicing.",
        "starter_code": "name = \"Python\"\n# print the first 3 letters\n",
        "stdin_lines": [],
        "expected_output": "Pyt",
        "hints": [
            "Strings can be sliced exactly the same way lists can.",
            "name[:3] takes everything from the start up to (not including) index 3.",
            "print(name[:3])",
        ],
        "xp_reward": 180, "coin_reward": 35, "skill_unlocked": "Strings",
    },
    {
        "id": "w6_l25", "order": 25, "world": 6,
        "title": "The Secret Message",
        "story": (
            "A crumpled note is jammed into a crack in the castle wall, its message padded with "
            "stray spaces and shouted in all capitals. Clean it up before reading it aloud."
        ),
        "concept_title": "String Methods",
        "concept_explanation": (
            "Strings have many built-in methods: .strip() removes leading/trailing whitespace, "
            ".lower()/.upper() change case, .replace(old, new) swaps text, .split() breaks text "
            "into a list of pieces, and \"sep\".join(list) does the reverse."
        ),
        "example": {"code": "s = \"  HELLO  \"\nprint(s.strip().lower())", "output": "hello"},
        "mission": "Py found the message '  OPEN SESAME  '. Strip the extra spaces and convert it to lowercase, then print the result.",
        "starter_code": 'message = "  OPEN SESAME  "\n# strip and lowercase it, then print it\n',
        "stdin_lines": [],
        "expected_output": "open sesame",
        "hints": [
            "Two cleanup steps are needed: remove the extra spaces, and fix the case.",
            "You can chain string methods together: message.strip().lower().",
            "print(message.strip().lower())",
        ],
        "xp_reward": 180, "coin_reward": 35, "skill_unlocked": "String Methods",
    },
    {
        "id": "w6_l26", "order": 26, "world": 6,
        "title": "The Royal Announcement",
        "story": (
            "The kingdom's town crier needs a proper announcement — with Py's own name and coin "
            "count woven directly into the sentence, not glued together awkwardly."
        ),
        "concept_title": "f-Strings",
        "concept_explanation": (
            'An f-string — f"text {variable} more text" — lets you drop a variable\'s value '
            "directly into a string, without clunky concatenation. Put an f right before the "
            "opening quote, and wrap any variable in curly braces."
        ),
        "example": {"code": "name = \"Fox\"\nprint(f\"Meet {name}!\")", "output": "Meet Fox!"},
        "mission": "Py has 100 coins. Using an f-string, print exactly: Py has 100 coins",
        "starter_code": "coins = 100\n# use an f-string to print the announcement\n",
        "stdin_lines": [],
        "expected_output": "Py has 100 coins",
        "hints": [
            "An f-string lets a variable's value appear right inside the text.",
            'f"Py has {coins} coins" — the f before the quote makes it an f-string.',
            'print(f"Py has {coins} coins")',
        ],
        "xp_reward": 220, "coin_reward": 45, "skill_unlocked": "f-Strings — World 6 Complete",
    },
]

WORLD_7_LEVELS = [
    {
        "id": "w7_l27", "order": 27, "world": 7,
        "title": "Why Functions?",
        "story": (
            "A village of builders has the same greeting ritual repeated at every single house — "
            "the exact same words, over and over. There has to be a better way than retyping it "
            "each time."
        ),
        "concept_title": "Why Functions Exist",
        "concept_explanation": (
            "A function packages up a piece of code under one name, so you can run it again "
            "any time just by calling that name — instead of retyping the whole thing everywhere "
            "you need it."
        ),
        "example": {"code": "def cheer():\n    print(\"Hooray!\")\n\ncheer()", "output": "Hooray!"},
        "mission": "Define a function called greet that prints: Hello, traveler! Then call it.",
        "starter_code": "# define greet(), then call it\n",
        "stdin_lines": [],
        "expected_output": "Hello, traveler!",
        "hints": [
            "A function is defined with def, a name, and parentheses, then an indented body.",
            "def greet():\n    print(...) — then call it afterward with greet().",
            'def greet():\n    print("Hello, traveler!")\n\ngreet()',
        ],
        "xp_reward": 190, "coin_reward": 35, "skill_unlocked": "Why Functions?",
    },
    {
        "id": "w7_l28", "order": 28, "world": 7,
        "title": "Creating Functions",
        "story": (
            "Py needs a proper battle cry — one that can be shouted again and again, exactly the "
            "same way, without ever being rewritten from scratch."
        ),
        "concept_title": "def — Defining a Function",
        "concept_explanation": (
            "def name(): starts a function definition; everything indented underneath is its "
            "body, which only runs when the function is actually called by name."
        ),
        "example": {"code": "def roar():\n    print(\"ROAR!\")\n\nroar()", "output": "ROAR!"},
        "mission": "Define a function called attack that prints: Py attacks! Then call it.",
        "starter_code": "# define attack(), then call it\n",
        "stdin_lines": [],
        "expected_output": "Py attacks!",
        "hints": [
            "Same shape as before: def, a name, parentheses, a colon, then an indented body.",
            "def attack():\n    print(...) — then call attack() afterward.",
            'def attack():\n    print("Py attacks!")\n\nattack()',
        ],
        "xp_reward": 190, "coin_reward": 35, "skill_unlocked": "def",
    },
    {
        "id": "w7_l29", "order": 29, "world": 7,
        "title": "Parameters",
        "story": (
            "Py's attack needs a target — the same move, but aimed at whichever enemy stands "
            "in front right now, not always the same hardcoded name."
        ),
        "concept_title": "Parameters — Values a Function Accepts",
        "concept_explanation": (
            "A parameter, written inside the parentheses of a def, lets a function accept a "
            "value each time it's called: def attack(enemy): — then enemy behaves like a normal "
            "variable inside the function body."
        ),
        "example": {"code": "def greet(name):\n    print(\"Hi,\", name)\n\ngreet(\"Fox\")", "output": "Hi, Fox"},
        "mission": (
            "Define attack(enemy) that prints the enemy's name followed by ' takes damage!' "
            "(e.g. print(enemy + \" takes damage!\")). Call it with 'Dragon'."
        ),
        "starter_code": "# define attack(enemy), then call it with \"Dragon\"\n",
        "stdin_lines": [],
        "expected_output": "Dragon takes damage!",
        "hints": [
            "The function needs a parameter to receive whichever enemy name it's given.",
            "def attack(enemy): print(enemy + \" takes damage!\") — then call attack(\"Dragon\").",
            'def attack(enemy):\n    print(enemy + " takes damage!")\n\nattack("Dragon")',
        ],
        "xp_reward": 200, "coin_reward": 40, "skill_unlocked": "Parameters",
    },
    {
        "id": "w7_l30", "order": 30, "world": 7,
        "title": "Multiple Parameters",
        "story": (
            "Py's attack move now needs two pieces of information at once — who's being hit, "
            "and exactly how hard."
        ),
        "concept_title": "Multiple Parameters",
        "concept_explanation": (
            "A function can accept more than one parameter, separated by commas: def attack(enemy, "
            "damage): — both values are available inside the function body."
        ),
        "example": {"code": "def combo(a, b):\n    print(a, b)\n\ncombo(\"punch\", \"kick\")", "output": "punch kick"},
        "mission": (
            "Define attack(enemy, damage) that prints the enemy and damage, space-separated "
            "(print(enemy, damage)). Call it with 'Dragon' and 25."
        ),
        "starter_code": "# define attack(enemy, damage), then call it with \"Dragon\" and 25\n",
        "stdin_lines": [],
        "expected_output": "Dragon 25",
        "hints": [
            "List both parameters in the parentheses, separated by a comma.",
            "def attack(enemy, damage): print(enemy, damage) — then attack(\"Dragon\", 25).",
            'def attack(enemy, damage):\n    print(enemy, damage)\n\nattack("Dragon", 25)',
        ],
        "xp_reward": 200, "coin_reward": 40, "skill_unlocked": "Multiple Parameters",
    },
    {
        "id": "w7_l31", "order": 31, "world": 7,
        "title": "Return Values",
        "story": (
            "A village mathematician refuses to shout answers out loud — she insists on handing "
            "the result back to whoever asked, to use however they like."
        ),
        "concept_title": "return — Handing Back a Value",
        "concept_explanation": (
            "return gives a value back to wherever the function was called from, instead of "
            "printing it directly — the caller decides what to do with it (print it, store it, "
            "use it in more math)."
        ),
        "example": {"code": "def double(n):\n    return n * 2\n\nprint(double(5))", "output": "10"},
        "mission": "Define add(a, b) that returns a + b (don't print inside the function). Call add(4, 5) and print the result.",
        "starter_code": "# define add(a, b) using return, then print add(4, 5)\n",
        "stdin_lines": [],
        "expected_output": "9",
        "hints": [
            "The function itself shouldn't print anything — it should hand the value back.",
            "def add(a, b): return a + b — then print(add(4, 5)) does the printing.",
            "def add(a, b):\n    return a + b\n\nprint(add(4, 5))",
        ],
        "xp_reward": 210, "coin_reward": 40, "skill_unlocked": "Return Values",
    },
    {
        "id": "w7_l32", "order": 32, "world": 7,
        "title": "Default Arguments",
        "story": (
            "Py's basic attack usually does the same amount of damage — it should be able to "
            "swing without specifying that number every single time, only when it's different."
        ),
        "concept_title": "Default Arguments",
        "concept_explanation": (
            "def attack(damage=10): gives a parameter a default value, used whenever the caller "
            "doesn't provide one. Call attack() to use the default, or attack(25) to override it."
        ),
        "example": {"code": "def greet(name=\"friend\"):\n    return \"Hi \" + name\n\nprint(greet())", "output": "Hi friend"},
        "mission": "Define attack(damage=10) that returns damage. Call attack() with no arguments and print what it returns.",
        "starter_code": "# define attack(damage=10), then print attack()\n",
        "stdin_lines": [],
        "expected_output": "10",
        "hints": [
            "Give the parameter a default value right in the function definition.",
            "def attack(damage=10): return damage — then print(attack()) uses that default.",
            "def attack(damage=10):\n    return damage\n\nprint(attack())",
        ],
        "xp_reward": 210, "coin_reward": 40, "skill_unlocked": "Default Arguments",
    },
    {
        "id": "w7_l33", "order": 33, "world": 7,
        "title": "Keyword Arguments",
        "story": (
            "A scribe is filling out an attack order form and insists on labeling every value "
            "she writes down — never trusting position alone to make the meaning clear."
        ),
        "concept_title": "Keyword Arguments",
        "concept_explanation": (
            "You can call a function naming each argument explicitly — attack(damage=20, "
            "enemy=\"Dragon\") — which works regardless of the order you list them in, since each "
            "value is matched to its parameter by name, not position."
        ),
        "example": {"code": "def greet(name, mood):\n    return name + \" is \" + mood\n\nprint(greet(mood=\"happy\", name=\"Fox\"))", "output": "Fox is happy"},
        "mission": (
            "Define attack(enemy, damage) that returns enemy + ' takes ' + str(damage). Call it "
            "using keyword arguments as attack(damage=20, enemy='Dragon') and print the result."
        ),
        "starter_code": "# define attack(enemy, damage), then print attack(damage=20, enemy=\"Dragon\")\n",
        "stdin_lines": [],
        "expected_output": "Dragon takes 20",
        "hints": [
            "You can pass arguments by name instead of by position — order stops mattering.",
            'attack(damage=20, enemy="Dragon") matches each value to its named parameter.',
            'def attack(enemy, damage):\n    return enemy + " takes " + str(damage)\n\nprint(attack(damage=20, enemy="Dragon"))',
        ],
        "xp_reward": 210, "coin_reward": 40, "skill_unlocked": "Keyword Arguments",
    },
    {
        "id": "w7_l34", "order": 34, "world": 7,
        "title": "The Scope Boundary",
        "story": (
            "At the village edge, a boundary stone marks what's shared with everyone versus "
            "what belongs only inside one house. Functions have the same kind of boundary."
        ),
        "concept_title": "Scope — Local vs. Global",
        "concept_explanation": (
            "A variable created outside any function is global — visible everywhere, including "
            "inside functions (for reading). A variable created inside a function is local — it "
            "only exists while that function is running, and disappears once it returns."
        ),
        "example": {"code": "total = 5\n\ndef show():\n    print(total)\n\nshow()", "output": "5"},
        "mission": (
            "A global variable coins = 100 already exists. Define show_coins() that prints coins "
            "(reading the global variable from inside the function). Call show_coins()."
        ),
        "starter_code": "coins = 100\n\n# define show_coins(), then call it\n",
        "stdin_lines": [],
        "expected_output": "100",
        "hints": [
            "A function can read a global variable without needing anything special.",
            "def show_coins(): print(coins) — coins is already visible since it's global.",
            "coins = 100\n\ndef show_coins():\n    print(coins)\n\nshow_coins()",
        ],
        "xp_reward": 250, "coin_reward": 50, "skill_unlocked": "Scope — World 7 Complete",
    },
]

WORLD_8_LEVELS = [
    {
        "id": "w8_l35", "order": 35, "world": 8,
        "title": "The Comprehension Spring",
        "story": (
            "A spring bubbles up rows of numbers that instantly transform into their squares "
            "the moment they touch the light — an entire new list, built in a single breath."
        ),
        "concept_title": "List Comprehensions",
        "concept_explanation": (
            "[expression for item in iterable] builds a whole new list in one line — "
            "[x * x for x in range(5)] means \"for every x from 0 to 4, put x*x in the new list\"."
        ),
        "example": {"code": "doubles = [x * 2 for x in range(4)]\nprint(doubles)", "output": "[0, 2, 4, 6]"},
        "mission": "Create a list of the squares of numbers 0 through 4 using a list comprehension, then print it.",
        "starter_code": "# build squares using a list comprehension, then print it\n",
        "stdin_lines": [],
        "expected_output": "[0, 1, 4, 9, 16]",
        "hints": [
            "A list comprehension builds the whole list in one line — no loop needed.",
            "[x * x for x in range(5)] squares every number from 0 to 4.",
            "squares = [x * x for x in range(5)]\nprint(squares)",
        ],
        "xp_reward": 220, "coin_reward": 45, "skill_unlocked": "List Comprehensions",
    },
    {
        "id": "w8_l36", "order": 36, "world": 8,
        "title": "The Dictionary Spring",
        "story": (
            "A second spring nearby does the same trick, but pairs each number with its square "
            "instead of just producing the square alone — a lookup table, built instantly."
        ),
        "concept_title": "Dictionary Comprehensions",
        "concept_explanation": (
            "{key_expr: value_expr for item in iterable} builds a dictionary the same way a list "
            "comprehension builds a list — {x: x*x for x in range(4)} maps each number to its square."
        ),
        "example": {"code": "d = {x: x + 1 for x in range(3)}\nprint(d)", "output": "{0: 1, 1: 2, 2: 3}"},
        "mission": "Create a dictionary mapping numbers 0 through 3 to their squares using a dictionary comprehension, then print it.",
        "starter_code": "# build a dict of number -> square using a dict comprehension, then print it\n",
        "stdin_lines": [],
        "expected_output": "{0: 0, 1: 1, 2: 4, 3: 9}",
        "hints": [
            "Same idea as a list comprehension, but with curly braces and a key: value pair.",
            "{x: x * x for x in range(4)} maps each number to its own square.",
            "squares = {x: x * x for x in range(4)}\nprint(squares)",
        ],
        "xp_reward": 220, "coin_reward": 45, "skill_unlocked": "Dict/Set Comprehensions",
    },
    {
        "id": "w8_l37", "order": 37, "world": 8,
        "title": "The Numbered Shelf",
        "story": (
            "A shopkeeper's shelf holds Py's gear in a specific order — but each item also "
            "needs its shelf number announced alongside its name."
        ),
        "concept_title": "enumerate()",
        "concept_explanation": (
            "enumerate(a_list) hands you both the index AND the value together as you loop — "
            "for index, value in enumerate(items): — instead of tracking a counter by hand."
        ),
        "example": {"code": "for i, name in enumerate([\"a\", \"b\"]):\n    print(i, name)", "output": "0 a\n1 b"},
        "mission": (
            "Py's items list is ['sword', 'shield', 'potion']. Use enumerate() to print each "
            "item's index and name on its own line (e.g. print(index, item))."
        ),
        "starter_code": 'items = ["sword", "shield", "potion"]\n# use enumerate() to print index and item on each line\n',
        "stdin_lines": [],
        "expected_output": "0 sword\n1 shield\n2 potion",
        "hints": [
            "You need both the position AND the value on each pass through the loop.",
            "for index, item in enumerate(items): gives you both at once.",
            "for index, item in enumerate(items):\n    print(index, item)",
        ],
        "xp_reward": 220, "coin_reward": 45, "skill_unlocked": "enumerate()",
    },
    {
        "id": "w8_l38", "order": 38, "world": 8,
        "title": "The Paired Scrolls",
        "story": (
            "The Power spring's final trick: two separate scrolls, one of names and one of "
            "scores, that need reading together, side by side, one pair per line."
        ),
        "concept_title": "zip()",
        "concept_explanation": (
            "zip(list_a, list_b) walks two (or more) lists together, pairing up their matching "
            "positions — for a, b in zip(list_a, list_b): gives you one item from each list per pass."
        ),
        "example": {"code": "for a, b in zip([1, 2], [\"x\", \"y\"]):\n    print(a, b)", "output": "1 x\n2 y"},
        "mission": (
            "Py has names = ['Fox', 'Owl'] and scores = [85, 92]. Use zip() to print each name "
            "and score paired together, one pair per line (e.g. print(name, score))."
        ),
        "starter_code": 'names = ["Fox", "Owl"]\nscores = [85, 92]\n# use zip() to print each name/score pair\n',
        "stdin_lines": [],
        "expected_output": "Fox 85\nOwl 92",
        "hints": [
            "You need to walk both lists at the same time, position by position.",
            "for name, score in zip(names, scores): pairs them up automatically.",
            "for name, score in zip(names, scores):\n    print(name, score)",
        ],
        "xp_reward": 260, "coin_reward": 55, "skill_unlocked": "zip() — World 8 Complete",
    },
]
