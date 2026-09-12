"""Content for "PY — Journey to the Kingdom of Python" — Worlds 9-12: The
Error Dungeon, File Village, Module Mountains, and The OOP Kingdom. See
levels.py's module docstring for the shared grading convention. Every
solution below was verified locally against a real Python 3 interpreter
(file I/O and the write-then-import trick in World 11 included) before its
expected_output was hardcoded here.
"""

WORLD_9_LEVELS = [
    {
        "id": "w9_l39", "order": 39, "world": 9,
        "title": "Understanding Errors",
        "story": (
            "A dungeon door slams shut every time Py's spellbook is read wrong. Not every "
            "mistake is the same kind, though — some crash the ritual instantly, some only fail "
            "partway through, and some just give the wrong result quietly."
        ),
        "concept_title": "Syntax, Runtime, and Logical Errors",
        "concept_explanation": (
            "A syntax error means Python couldn't even understand the code (a typo in the "
            "structure itself). A runtime error happens while the program is running — like "
            "dividing by zero. A logical error is worse: the code runs fine, but produces the "
            "wrong answer because the logic itself was flawed."
        ),
        "example": {"code": "print(10 / 2)", "output": "5.0"},
        "mission": (
            "The line below crashes with a runtime error (division by zero). Fix denominator's "
            "value so 10 divided by it prints exactly 5.0."
        ),
        "starter_code": "numerator = 10\ndenominator = 0  # fix this value\nprint(numerator / denominator)\n",
        "stdin_lines": [],
        "expected_output": "5.0",
        "hints": [
            "Dividing by zero always crashes the program at runtime — pick a real number instead.",
            "10 divided by what number gives exactly 5?",
            "denominator = 2",
        ],
        "xp_reward": 220, "coin_reward": 40, "skill_unlocked": "Understanding Errors",
    },
    {
        "id": "w9_l40", "order": 40, "world": 9,
        "title": "Exception Handling",
        "story": (
            "A ritual circle keeps collapsing whenever the spell misfires. A dungeon sage "
            "explains: \"Don't prevent every mistake — catch it gracefully instead, and keep going.\""
        ),
        "concept_title": "try / except",
        "concept_explanation": (
            "try: wraps code that might fail. except: runs only if something inside the try block "
            "raised an error — the program keeps running afterward instead of crashing."
        ),
        "example": {"code": "try:\n    print(1 / 0)\nexcept:\n    print(\"Oops!\")", "output": "Oops!"},
        "mission": (
            "The code below crashes dividing by zero. Wrap it in try/except so it prints "
            "'Cannot divide by zero!' instead of crashing."
        ),
        "starter_code": "numerator = 10\ndenominator = 0\n# wrap this in try/except\nprint(numerator / denominator)\n",
        "stdin_lines": [],
        "expected_output": "Cannot divide by zero!",
        "hints": [
            "Put the risky line inside a try block, then handle the failure in an except block.",
            "try:\n    print(numerator / denominator)\nexcept:\n    print(the message)",
            'try:\n    print(numerator / denominator)\nexcept:\n    print("Cannot divide by zero!")',
        ],
        "xp_reward": 230, "coin_reward": 45, "skill_unlocked": "try / except",
    },
    {
        "id": "w9_l41", "order": 41, "world": 9,
        "title": "Multiple Exceptions",
        "story": (
            "The dungeon sage warns of two very different curses — one from bad numbers, one "
            "from dividing by nothing. \"You'll need a different counter-spell for each.\""
        ),
        "concept_title": "Catching Specific Exceptions",
        "concept_explanation": (
            "You can catch different error types separately — except ValueError: handles one "
            "kind of mistake, except ZeroDivisionError: handles another — so each gets its own, "
            "more specific response."
        ),
        "example": {"code": "try:\n    int(\"x\")\nexcept ValueError:\n    print(\"bad number\")", "output": "bad number"},
        "mission": (
            "int('abc') below raises a ValueError. Add an except ValueError that prints "
            "'Not a number!', and a separate except ZeroDivisionError that prints "
            "'Cannot divide by zero!' underneath it."
        ),
        "starter_code": (
            "text = \"abc\"\ntry:\n    number = int(text)\n    print(number)\n"
            "# add except ValueError and except ZeroDivisionError clauses below\n"
        ),
        "stdin_lines": [],
        "expected_output": "Not a number!",
        "hints": [
            "You can stack more than one except clause after a single try, each for a different error type.",
            "except ValueError: ... comes first, then except ZeroDivisionError: ... underneath.",
            (
                'text = "abc"\ntry:\n    number = int(text)\n    print(number)\n'
                'except ValueError:\n    print("Not a number!")\nexcept ZeroDivisionError:\n    print("Cannot divide by zero!")'
            ),
        ],
        "xp_reward": 230, "coin_reward": 45, "skill_unlocked": "Multiple Exceptions",
    },
    {
        "id": "w9_l42", "order": 42, "world": 9,
        "title": "The Final Ward",
        "story": (
            "One rule guards every ritual in this dungeon: no matter what happens — success, "
            "failure, anything — the closing chant must always be spoken."
        ),
        "concept_title": "finally",
        "concept_explanation": (
            "finally: attaches to a try/except and always runs afterward, no matter whether an "
            "error happened or not — perfect for cleanup that must never be skipped."
        ),
        "example": {"code": "try:\n    print(\"try\")\nfinally:\n    print(\"always\")", "output": "try\nalways"},
        "mission": (
            "Add a finally block after the try/except below that always prints "
            "'Attempt finished.', whether or not an error happened."
        ),
        "starter_code": (
            "try:\n    print(10 / 0)\nexcept ZeroDivisionError:\n    print(\"Cannot divide by zero!\")\n"
            "# add a finally block that always prints \"Attempt finished.\"\n"
        ),
        "stdin_lines": [],
        "expected_output": "Cannot divide by zero!\nAttempt finished.",
        "hints": [
            "finally goes after every except clause, at the same indentation as try.",
            "finally:\n    print(\"Attempt finished.\")",
            (
                'try:\n    print(10 / 0)\nexcept ZeroDivisionError:\n    print("Cannot divide by zero!")\n'
                'finally:\n    print("Attempt finished.")'
            ),
        ],
        "xp_reward": 280, "coin_reward": 55, "skill_unlocked": "finally — World 9 Complete",
    },
]

WORLD_10_LEVELS = [
    {
        "id": "w10_l43", "order": 43, "world": 10,
        "title": "File Village",
        "story": (
            "A village of scribes keeps every record on paper that outlives the moment it was "
            "written — Py needs to learn to write something down, and read it back later."
        ),
        "concept_title": "open() — Reading and Writing Files",
        "concept_explanation": (
            'open(path, "w") opens a file for writing (creating it if needed); .write(text) puts '
            'text in it; .close() finishes and saves it. open(path, "r") (or just open(path)) '
            "reopens it for reading; .read() gets the whole contents back as one string."
        ),
        "example": {"code": "f = open(\"note.txt\", \"w\")\nf.write(\"Hi\")\nf.close()\nf = open(\"note.txt\")\nprint(f.read())\nf.close()", "output": "Hi"},
        "mission": (
            "Open 'log.txt' in write mode, write 'Py was here', close it. Then open it again in "
            "read mode and print its contents."
        ),
        "starter_code": "# write \"Py was here\" to log.txt, then open it again and print its contents\n",
        "stdin_lines": [],
        "expected_output": "Py was here",
        "hints": [
            "You need to open the file twice — once to write, once to read it back.",
            'open("log.txt", "w") for writing, then open("log.txt", "r") for reading — .close() each time.',
            (
                'file = open("log.txt", "w")\nfile.write("Py was here")\nfile.close()\n\n'
                'file = open("log.txt", "r")\nprint(file.read())\nfile.close()'
            ),
        ],
        "xp_reward": 230, "coin_reward": 45, "skill_unlocked": "open()",
    },
    {
        "id": "w10_l44", "order": 44, "world": 10,
        "title": "Reading Files Safely",
        "story": (
            "A scribe scolds Py for forgetting to close a scroll properly last time. \"Use the "
            "'with' ritual,\" she says. \"It closes itself automatically, even if something goes wrong.\""
        ),
        "concept_title": "with open(...) as file:",
        "concept_explanation": (
            "with open(path) as file: opens the file, gives it the name file for the indented "
            "block, and automatically closes it afterward — no need to call .close() yourself."
        ),
        "example": {"code": "with open(\"note.txt\") as f:\n    print(f.read())", "output": "Hi"},
        "mission": (
            "notes.txt already contains 'Kingdom of Python' (see the setup code). Read it using "
            "with open(...) as file: and print its contents."
        ),
        "starter_code": (
            "with open(\"notes.txt\", \"w\") as f:\n    f.write(\"Kingdom of Python\")\n\n"
            "# now read notes.txt using \"with open(...) as file:\" and print its contents\n"
        ),
        "stdin_lines": [],
        "expected_output": "Kingdom of Python",
        "hints": [
            "with open(path) as file: automatically closes the file for you afterward.",
            "Inside the with block, file.read() gets the whole contents as a string.",
            'with open("notes.txt") as file:\n    data = file.read()\nprint(data)',
        ],
        "xp_reward": 230, "coin_reward": 45, "skill_unlocked": "Reading Files",
    },
    {
        "id": "w10_l45", "order": 45, "world": 10,
        "title": "Writing the Victory Scroll",
        "story": (
            "At the village edge, a blank scroll waits — the last record before Py leaves for "
            "the mountains beyond. Write the victory message, using the same safe 'with' ritual."
        ),
        "concept_title": "Writing Files with with",
        "concept_explanation": (
            'with open(path, "w") as file: works the same way for writing — the file closes '
            "itself automatically once the indented block finishes."
        ),
        "example": {"code": "with open(\"a.txt\", \"w\") as f:\n    f.write(\"done\")\nwith open(\"a.txt\") as f:\n    print(f.read())", "output": "done"},
        "mission": (
            "Use with open(...) as file: to write 'Journey Complete' to victory.txt, then use "
            "with open(...) as file: again to read it back and print it."
        ),
        "starter_code": "# write \"Journey Complete\" to victory.txt, then read and print it, using with each time\n",
        "stdin_lines": [],
        "expected_output": "Journey Complete",
        "hints": [
            "Two separate with blocks — one for writing, one for reading afterward.",
            'with open("victory.txt", "w") as file: file.write(...) — then with open("victory.txt") as file: print(file.read()).',
            (
                'with open("victory.txt", "w") as file:\n    file.write("Journey Complete")\n\n'
                'with open("victory.txt") as file:\n    print(file.read())'
            ),
        ],
        "xp_reward": 280, "coin_reward": 55, "skill_unlocked": "Writing Files — World 10 Complete",
    },
]

WORLD_11_LEVELS = [
    {
        "id": "w11_l46", "order": 46, "world": 11,
        "title": "Module Mountains",
        "story": (
            "A wide mountain range is stocked with tool-sheds built by travelers long before "
            "Py arrived — each one full of ready-made code, free for anyone to borrow."
        ),
        "concept_title": "import",
        "concept_explanation": (
            "import module_name brings in a whole library of pre-written code — import math "
            "gives you math.sqrt(), math.pi, and much more, all ready to use."
        ),
        "example": {"code": "import math\nprint(math.floor(4.9))", "output": "4"},
        "mission": "Import the math module and print the square root of 16 using math.sqrt().",
        "starter_code": "# import math, then print the square root of 16\n",
        "stdin_lines": [],
        "expected_output": "4.0",
        "hints": [
            "The math module has a function specifically for square roots.",
            "math.sqrt(16) computes the square root of 16.",
            "import math\nprint(math.sqrt(16))",
        ],
        "xp_reward": 230, "coin_reward": 45, "skill_unlocked": "import",
    },
    {
        "id": "w11_l47", "order": 47, "world": 11,
        "title": "The Standard Library Shed",
        "story": (
            "One shed is stacked floor to ceiling with utilities for everyday tasks — working "
            "with file paths among them. A sign carved into a beam reads os."
        ),
        "concept_title": "The Standard Library",
        "concept_explanation": (
            "Python ships with a huge standard library included for free — math and os are two "
            "examples. os.path has tools for working with file paths, like pulling just the "
            "filename out of a full path."
        ),
        "example": {"code": "import os\nprint(os.path.basename(\"/a/b/c.txt\"))", "output": "c.txt"},
        "mission": "Import the os module and print just the filename part of '/kingdom/python/scroll.txt' using os.path.basename().",
        "starter_code": "# import os, then print the filename part of \"/kingdom/python/scroll.txt\"\n",
        "stdin_lines": [],
        "expected_output": "scroll.txt",
        "hints": [
            "os.path has a function specifically for pulling the filename off the end of a path.",
            'os.path.basename("/a/b/c.txt") gives you just "c.txt".',
            'import os\nprint(os.path.basename("/kingdom/python/scroll.txt"))',
        ],
        "xp_reward": 230, "coin_reward": 45, "skill_unlocked": "Standard Library",
    },
    {
        "id": "w11_l48", "order": 48, "world": 11,
        "title": "Forging Your Own Module",
        "story": (
            "At the mountain's peak, an empty tool-shed waits — Py's very own. Fill it with "
            "code, and it becomes just as importable as any other module."
        ),
        "concept_title": "Creating Your Own Module",
        "concept_explanation": (
            "A module is really just a .py file. Once weapons.py exists (with a function inside "
            "it), import weapons brings that whole file in — and weapons.attack() calls the "
            "function it defines, exactly like any built-in module."
        ),
        "example": {"code": "with open(\"greetings.py\", \"w\") as f:\n    f.write(\"def hi():\\n    print('hi!')\")\nimport greetings\ngreetings.hi()", "output": "hi!"},
        "mission": (
            "Write a file called weapons.py containing a function attack() that prints "
            "'Sword Slash!'. Then import weapons and call weapons.attack()."
        ),
        "starter_code": "# write weapons.py with an attack() function, then import and call it\n",
        "stdin_lines": [],
        "expected_output": "Sword Slash!",
        "hints": [
            "First write the module's code to a file, then import that file by name (no .py).",
            'open("weapons.py", "w").write(...) creates the module; import weapons brings it in.',
            (
                'with open("weapons.py", "w") as f:\n    f.write("def attack():\\n    print(\'Sword Slash!\')")\n\n'
                "import weapons\nweapons.attack()"
            ),
        ],
        "xp_reward": 300, "coin_reward": 60, "skill_unlocked": "Modules — World 11 Complete",
    },
]

WORLD_12_LEVELS = [
    {
        "id": "w12_l49", "order": 49, "world": 12,
        "title": "The OOP Kingdom Gate",
        "story": (
            "A vast kingdom of blueprints and castles rises ahead. Right now, Py is tracking "
            "everything as loose, separate variables — a name here, a health number there. "
            "It's already getting hard to keep straight."
        ),
        "concept_title": "The Problem Objects Solve",
        "concept_explanation": (
            "Tracking player_name and player_health as two totally separate variables works for "
            "one player — but gets messy fast with many. An object bundles related data (and "
            "behavior) together under one name, which is exactly what classes are for."
        ),
        "example": {"code": "enemy_name = \"Goblin\"\nenemy_hp = 30\nprint(enemy_name, enemy_hp)", "output": "Goblin 30"},
        "mission": "Print Py's name and health together as 'Py 100' using print(player_name, player_health).",
        "starter_code": 'player_name = "Py"\nplayer_health = 100\n# print them together\n',
        "stdin_lines": [],
        "expected_output": "Py 100",
        "hints": [
            "print() can take more than one value, separated by commas.",
            "print(player_name, player_health) prints both, space-separated.",
            "print(player_name, player_health)",
        ],
        "xp_reward": 240, "coin_reward": 45, "skill_unlocked": "Understanding Objects",
    },
    {
        "id": "w12_l50", "order": 50, "world": 12,
        "title": "Your First Blueprint",
        "story": (
            "A castle architect hands Py a completely blank blueprint. \"A class is just a "
            "blueprint,\" she explains. \"Nothing exists yet until you actually build something "
            "from it.\""
        ),
        "concept_title": "class — A Blueprint for Objects",
        "concept_explanation": (
            "class Player: pass defines an empty blueprint named Player. Player() then builds — "
            "\"instantiates\" — an actual object from that blueprint. The class is the plan; the "
            "object is the real thing made from it."
        ),
        "example": {"code": "class Enemy:\n    pass\n\ne = Enemy()\nprint(type(e))", "output": "<class '__main__.Enemy'>"},
        "mission": "Define an empty class called Player (using pass). Create an object called player from it. Print type(player).",
        "starter_code": "# define an empty Player class, create player = Player(), then print its type\n",
        "stdin_lines": [],
        "expected_output": "<class '__main__.Player'>",
        "hints": [
            "An empty class body still needs something in it — pass means \"do nothing\".",
            "class Player:\n    pass — then player = Player() builds an object from it.",
            "class Player:\n    pass\n\nplayer = Player()\nprint(type(player))",
        ],
        "xp_reward": 240, "coin_reward": 45, "skill_unlocked": "Classes",
    },
    {
        "id": "w12_l51", "order": 51, "world": 12,
        "title": "Giving the Blueprint Attributes",
        "story": (
            "An empty object isn't much use yet. The architect shows Py how to attach real "
            "details onto it, one at a time, after it's already been built."
        ),
        "concept_title": "Attributes",
        "concept_explanation": (
            "Once you have an object, you can attach values to it directly: player.name = \"Py\" "
            "creates a name attribute on that specific object, which you can read back the same way."
        ),
        "example": {"code": "class Item:\n    pass\n\nsword = Item()\nsword.power = 12\nprint(sword.power)", "output": "12"},
        "mission": (
            "Using the empty Player class, create player = Player(), set player.name = 'Py' and "
            "player.health = 100, then print player.name."
        ),
        "starter_code": "class Player:\n    pass\n\n# create player, set its name and health, then print player.name\n",
        "stdin_lines": [],
        "expected_output": "Py",
        "hints": [
            "You can attach a new attribute to an object just by assigning to it directly.",
            "player.name = \"Py\" creates the name attribute; player.name reads it back.",
            'player = Player()\nplayer.name = "Py"\nplayer.health = 100\nprint(player.name)',
        ],
        "xp_reward": 250, "coin_reward": 45, "skill_unlocked": "Attributes",
    },
    {
        "id": "w12_l52", "order": 52, "world": 12,
        "title": "The Constructor Forge",
        "story": (
            "Deep in the kingdom, a forge builds every object the moment it's created — no more "
            "attaching attributes one at a time afterward. Hand it the raw materials, and it "
            "assembles the whole thing at once."
        ),
        "concept_title": "__init__ — The Constructor",
        "concept_explanation": (
            "def __init__(self, name, health): runs automatically the instant Player(...) is "
            "called — self refers to the object being built, and self.name = name stores the "
            "given value onto it. Player(\"Py\", 100) -> __init__ runs -> self.name=\"Py\", "
            "self.health=100 -> a fully-built object comes out the other end."
        ),
        "example": {"code": "class Item:\n    def __init__(self, name):\n        self.name = name\n\ni = Item(\"Sword\")\nprint(i.name)", "output": "Sword"},
        "mission": (
            "Define class Player with __init__(self, name, health) that sets self.name and "
            "self.health. Create player = Player('Py', 100) and print player.name, player.health."
        ),
        "starter_code": "# define Player with a constructor, create player = Player(\"Py\", 100), then print its name and health\n",
        "stdin_lines": [],
        "expected_output": "Py 100",
        "hints": [
            "__init__ is a special method that runs automatically when you call Player(...).",
            "def __init__(self, name, health): self.name = name; self.health = health.",
            (
                'class Player:\n    def __init__(self, name, health):\n        self.name = name\n        self.health = health\n\n'
                'player = Player("Py", 100)\nprint(player.name, player.health)'
            ),
        ],
        "xp_reward": 280, "coin_reward": 55, "skill_unlocked": "__init__ (Constructors)",
    },
    {
        "id": "w12_l53", "order": 53, "world": 12,
        "title": "Teaching the Blueprint to Act",
        "story": (
            "A blueprint that only stores facts is only half finished — the forge shows Py how "
            "to give an object real behavior, not just data."
        ),
        "concept_title": "Methods",
        "concept_explanation": (
            "A method is a function defined inside a class — def attack(self): — that any object "
            "built from that class can call: player.attack(). self inside it refers back to "
            "whichever object made the call, so it can use that object's own attributes."
        ),
        "example": {"code": "class Item:\n    def __init__(self, name):\n        self.name = name\n    def describe(self):\n        print(self.name, \"glows softly\")\n\nItem(\"Gem\").describe()", "output": "Gem glows softly"},
        "mission": (
            "Add a method attack(self) to Player that prints self.name + ' attacks!'. Create "
            "player = Player('Py', 100) and call player.attack()."
        ),
        "starter_code": (
            "class Player:\n    def __init__(self, name, health):\n        self.name = name\n        self.health = health\n"
            "    # add an attack(self) method here that prints self.name + \" attacks!\"\n\n"
            "# create player, then call player.attack()\n"
        ),
        "stdin_lines": [],
        "expected_output": "Py attacks!",
        "hints": [
            "A method looks just like a regular function, but defined inside the class, with self first.",
            "def attack(self): print(self.name + \" attacks!\") — then player.attack() calls it.",
            (
                'class Player:\n    def __init__(self, name, health):\n        self.name = name\n        self.health = health\n\n'
                '    def attack(self):\n        print(self.name + " attacks!")\n\n'
                'player = Player("Py", 100)\nplayer.attack()'
            ),
        ],
        "xp_reward": 280, "coin_reward": 55, "skill_unlocked": "Methods",
    },
    {
        "id": "w12_l54", "order": 54, "world": 12,
        "title": "A Kingdom of Many Players",
        "story": (
            "The same blueprint builds every player in the kingdom — each one separate, each "
            "one remembering only its own details, never mixing up with anyone else's."
        ),
        "concept_title": "Multiple Objects, Independent State",
        "concept_explanation": (
            "Every object built from a class has its own completely separate copy of its "
            "attributes — changing player1.health never touches player2.health, even though "
            "they came from the exact same blueprint."
        ),
        "example": {"code": "class Item:\n    def __init__(self, name):\n        self.name = name\n\na = Item(\"Shield\")\nb = Item(\"Bow\")\nprint(a.name, b.name)", "output": "Shield Bow"},
        "mission": (
            "Using the Player class (constructor given), create player1 = Player('Py', 100) and "
            "player2 = Player('Fox', 80). Print each one's name and health, one per line."
        ),
        "starter_code": (
            "class Player:\n    def __init__(self, name, health):\n        self.name = name\n        self.health = health\n\n"
            "# create player1 and player2, then print each one's name and health on its own line\n"
        ),
        "stdin_lines": [],
        "expected_output": "Py 100\nFox 80",
        "hints": [
            "Two separate objects, built from the same class — each keeps its own values.",
            "Create both, then print(player1.name, player1.health) and the same for player2.",
            (
                'player1 = Player("Py", 100)\nplayer2 = Player("Fox", 80)\n'
                "print(player1.name, player1.health)\nprint(player2.name, player2.health)"
            ),
        ],
        "xp_reward": 280, "coin_reward": 55, "skill_unlocked": "Multiple Objects",
    },
    {
        "id": "w12_l55", "order": 55, "world": 12,
        "title": "Taking a Hit",
        "story": (
            "A training bout begins. Py's health lives right on the object itself — landing a "
            "hit means changing that value directly."
        ),
        "concept_title": "Instance Variables",
        "concept_explanation": (
            "self.health inside a class body is called an instance variable — a value that "
            "belongs to one specific object. You can read and change it from outside the class "
            "too, the same way you would any attribute: player.health -= 20."
        ),
        "example": {"code": "class Item:\n    def __init__(self, uses):\n        self.uses = uses\n\ni = Item(3)\ni.uses -= 1\nprint(i.uses)", "output": "2"},
        "mission": "Using player (already Player('Py', 100)), reduce player.health by 20 to simulate taking damage, then print the new health.",
        "starter_code": (
            "class Player:\n    def __init__(self, name, health):\n        self.name = name\n        self.health = health\n\n"
            "player = Player(\"Py\", 100)\n# reduce player.health by 20, then print it\n"
        ),
        "stdin_lines": [],
        "expected_output": "80",
        "hints": [
            "You can change an instance variable from outside the class, just like reading it.",
            "player.health -= 20 subtracts 20 from the current value and stores it back.",
            "player.health -= 20\nprint(player.health)",
        ],
        "xp_reward": 280, "coin_reward": 55, "skill_unlocked": "Instance Variables",
    },
    {
        "id": "w12_l56", "order": 56, "world": 12,
        "title": "A Fact True for Every Player",
        "story": (
            "Every player, no matter their name or health, belongs to the same kingdom. That "
            "fact doesn't need to be repeated on every single object — it can live on the "
            "blueprint itself."
        ),
        "concept_title": "Class Variables",
        "concept_explanation": (
            "A class variable is defined directly inside the class body, outside any method — "
            "it's shared by every object of that class (and accessible straight off the class "
            "itself, like Player.game_name, not just through an instance)."
        ),
        "example": {"code": "class Item:\n    category = \"Loot\"\n\nprint(Item.category)", "output": "Loot"},
        "mission": "Add a class variable game_name = 'Kingdom of Python' to Player. Print Player.game_name directly (not through an instance).",
        "starter_code": (
            "class Player:\n    # add a class variable game_name here\n"
            "    def __init__(self, name, health):\n        self.name = name\n        self.health = health\n\n"
            "# print Player.game_name\n"
        ),
        "stdin_lines": [],
        "expected_output": "Kingdom of Python",
        "hints": [
            "A class variable is written directly in the class body, not inside __init__.",
            'game_name = "Kingdom of Python" as the very first line inside the class.',
            (
                'class Player:\n    game_name = "Kingdom of Python"\n\n    def __init__(self, name, health):\n'
                "        self.name = name\n        self.health = health\n\nprint(Player.game_name)"
            ),
        ],
        "xp_reward": 290, "coin_reward": 55, "skill_unlocked": "Class Variables",
    },
    {
        "id": "w12_l57", "order": 57, "world": 12,
        "title": "Guarding the Inner State",
        "story": (
            "A castle steward insists some details shouldn't be poked at carelessly from "
            "outside — a quiet naming convention marks them as \"handle with care.\""
        ),
        "concept_title": "Encapsulation",
        "concept_explanation": (
            "Prefixing an attribute with an underscore, self._health, is Python's convention for "
            "\"this is internal — treat it as protected, even though nothing technically stops "
            "you.\" It's still readable and settable the same way as any attribute."
        ),
        "example": {"code": "class Item:\n    def __init__(self, uses):\n        self._uses = uses\n\ni = Item(3)\nprint(i._uses)", "output": "3"},
        "mission": "Change health to a protected attribute self._health inside __init__. Create player = Player('Py', 100) and print player._health.",
        "starter_code": (
            "class Player:\n    def __init__(self, name, health):\n        self.name = name\n        self.health = health  # rename to self._health\n\n"
            "# create player, then print player._health\n"
        ),
        "stdin_lines": [],
        "expected_output": "100",
        "hints": [
            "An underscore prefix is just a naming convention — it still works like a normal attribute.",
            "self._health = health, then player._health reads it the same way.",
            (
                'class Player:\n    def __init__(self, name, health):\n        self.name = name\n        self._health = health\n\n'
                'player = Player("Py", 100)\nprint(player._health)'
            ),
        ],
        "xp_reward": 290, "coin_reward": 55, "skill_unlocked": "Encapsulation",
    },
    {
        "id": "w12_l58", "order": 58, "world": 12,
        "title": "The Family Line",
        "story": (
            "A scaled creature slithers into view — clearly related to every other animal in "
            "the kingdom, sharing their most basic behavior without needing to relearn it."
        ),
        "concept_title": "Inheritance",
        "concept_explanation": (
            "class Snake(Animal): makes Snake a child of Animal — it automatically gets every "
            "method Animal has, without rewriting any of them, unless it chooses to override one."
        ),
        "example": {"code": "class Animal:\n    def sound(self):\n        print(\"...\")\n\nclass Dog(Animal):\n    pass\n\nDog().sound()", "output": "..."},
        "mission": "Define class Animal with move(self) printing 'Moving'. Define class Snake(Animal) (using pass). Create snake = Snake() and call snake.move().",
        "starter_code": "# define Animal with a move() method, then Snake(Animal), then call snake.move()\n",
        "stdin_lines": [],
        "expected_output": "Moving",
        "hints": [
            "class Snake(Animal): inherits every method Animal has, with no extra code needed.",
            "Snake doesn't need its own move() — it already has Animal's.",
            'class Animal:\n    def move(self):\n        print("Moving")\n\nclass Snake(Animal):\n    pass\n\nsnake = Snake()\nsnake.move()',
        ],
        "xp_reward": 300, "coin_reward": 60, "skill_unlocked": "Inheritance",
    },
    {
        "id": "w12_l59", "order": 59, "world": 12,
        "title": "Building on the Parent",
        "story": (
            "A warrior wants everything a regular player has, plus a weapon of their own. "
            "Rather than rebuild the player's setup from scratch, they'll borrow it directly."
        ),
        "concept_title": "super()",
        "concept_explanation": (
            "super().__init__(...) calls the parent class's constructor from inside a child "
            "class's own __init__ — so you can reuse the parent's setup instead of duplicating "
            "it, then add whatever's new for the child."
        ),
        "example": {"code": "class Item:\n    def __init__(self, name):\n        self.name = name\n\nclass Weapon(Item):\n    def __init__(self, name, power):\n        super().__init__(name)\n        self.power = power\n\nw = Weapon(\"Axe\", 9)\nprint(w.name, w.power)", "output": "Axe 9"},
        "mission": (
            "Define class Player with __init__(self, name) setting self.name. Define class "
            "Warrior(Player) with __init__(self, name, weapon) that calls super().__init__(name) "
            "then sets self.weapon. Create w = Warrior('Py', 'Sword') and print w.name, w.weapon."
        ),
        "starter_code": "# define Player, then Warrior(Player) using super().__init__(), then print w.name, w.weapon\n",
        "stdin_lines": [],
        "expected_output": "Py Sword",
        "hints": [
            "The child's __init__ can call the parent's __init__ directly, then add its own part.",
            "super().__init__(name) runs Player's constructor; then set self.weapon = weapon.",
            (
                "class Player:\n    def __init__(self, name):\n        self.name = name\n\n"
                "class Warrior(Player):\n    def __init__(self, name, weapon):\n        super().__init__(name)\n        self.weapon = weapon\n\n"
                'w = Warrior("Py", "Sword")\nprint(w.name, w.weapon)'
            ),
        ],
        "xp_reward": 310, "coin_reward": 60, "skill_unlocked": "super()",
    },
    {
        "id": "w12_l60", "order": 60, "world": 12,
        "title": "A Different Kind of Strike",
        "story": (
            "The snake doesn't attack the way a generic animal does — its own version of the "
            "move should replace the inherited one, not just add to it."
        ),
        "concept_title": "Method Overriding",
        "concept_explanation": (
            "When a child class defines a method with the exact same name as one in its parent, "
            "the child's version replaces — \"overrides\" — the parent's for objects of that "
            "child class."
        ),
        "example": {"code": "class Animal:\n    def sound(self):\n        print(\"...\")\n\nclass Cat(Animal):\n    def sound(self):\n        print(\"Meow\")\n\nCat().sound()", "output": "Meow"},
        "mission": (
            "Define class Animal with attack(self) printing 'Animal attack'. Define class "
            "Snake(Animal) that overrides attack(self) to print 'Snake attack'. Create "
            "snake = Snake() and call snake.attack()."
        ),
        "starter_code": "# define Animal.attack(), then Snake(Animal) overriding attack(), then call it\n",
        "stdin_lines": [],
        "expected_output": "Snake attack",
        "hints": [
            "Give Snake its own attack() method with exactly the same name as Animal's.",
            "Snake's version of attack() is the one that actually runs for a Snake object.",
            'class Animal:\n    def attack(self):\n        print("Animal attack")\n\nclass Snake(Animal):\n    def attack(self):\n        print("Snake attack")\n\nsnake = Snake()\nsnake.attack()',
        ],
        "xp_reward": 310, "coin_reward": 60, "skill_unlocked": "Method Overriding",
    },
    {
        "id": "w12_l61", "order": 61, "world": 12,
        "title": "One Command, Many Reactions",
        "story": (
            "A whole line of different creatures stands ready — snake, bird, and more. Give "
            "them all the exact same command, and each one responds in its own way."
        ),
        "concept_title": "Polymorphism",
        "concept_explanation": (
            "Polymorphism means different objects can respond to the exact same method call in "
            "their own way. Looping over a list of different Animal subclasses and calling "
            ".attack() on each runs whichever version that specific object actually has."
        ),
        "example": {"code": "class Cat:\n    def sound(self):\n        print(\"Meow\")\nclass Dog:\n    def sound(self):\n        print(\"Woof\")\nfor a in [Cat(), Dog()]:\n    a.sound()", "output": "Meow\nWoof"},
        "mission": (
            "Animal, Snake(Animal, attack->'Snake attack'), and Bird(Animal, attack->'Bird "
            "attack') are already defined. Put a Snake and a Bird in a list and call .attack() "
            "on each in a loop."
        ),
        "starter_code": (
            "class Animal:\n    def attack(self):\n        print(\"Animal attack\")\n\n"
            "class Snake(Animal):\n    def attack(self):\n        print(\"Snake attack\")\n\n"
            "class Bird(Animal):\n    def attack(self):\n        print(\"Bird attack\")\n\n"
            "# put a Snake and a Bird in a list, then call .attack() on each in a loop\n"
        ),
        "stdin_lines": [],
        "expected_output": "Snake attack\nBird attack",
        "hints": [
            "Put both objects in one list, then loop over it calling the same method name on each.",
            "for animal in [Snake(), Bird()]: animal.attack() — each runs its own version.",
            "animals = [Snake(), Bird()]\nfor animal in animals:\n    animal.attack()",
        ],
        "xp_reward": 320, "coin_reward": 65, "skill_unlocked": "Polymorphism",
    },
    {
        "id": "w12_l62", "order": 62, "world": 12,
        "title": "The Unbuildable Blueprint",
        "story": (
            "An ancient tome describes \"Enemy\" only in the abstract — no one is meant to build "
            "a plain, generic Enemy directly. Every real enemy must be its own specific kind."
        ),
        "concept_title": "Abstraction",
        "concept_explanation": (
            "from abc import ABC, abstractmethod lets you define a class that can never be "
            "instantiated directly — only subclassed. @abstractmethod marks a method every "
            "subclass MUST implement itself, with no default behavior provided."
        ),
        "example": {"code": "from abc import ABC, abstractmethod\nclass Shape(ABC):\n    @abstractmethod\n    def area(self):\n        pass\nclass Square(Shape):\n    def area(self):\n        return 4\nprint(Square().area())", "output": "4"},
        "mission": (
            "Define abstract class Enemy(ABC) with an abstractmethod attack(self) (pass). "
            "Define Goblin(Enemy) implementing attack(self) to print 'Goblin attacks!'. Create "
            "g = Goblin() and call g.attack()."
        ),
        "starter_code": "from abc import ABC, abstractmethod\n\n# define Enemy(ABC) with an abstract attack(), then Goblin(Enemy)\n",
        "stdin_lines": [],
        "expected_output": "Goblin attacks!",
        "hints": [
            "@abstractmethod goes right above a method that has no body of its own — just pass.",
            "Goblin must actually implement attack() itself, since Enemy only declared it.",
            (
                "class Enemy(ABC):\n    @abstractmethod\n    def attack(self):\n        pass\n\n"
                'class Goblin(Enemy):\n    def attack(self):\n        print("Goblin attacks!")\n\n'
                "g = Goblin()\ng.attack()"
            ),
        ],
        "xp_reward": 320, "coin_reward": 65, "skill_unlocked": "Abstraction",
    },
    {
        "id": "w12_l63", "order": 63, "world": 12,
        "title": "The King's Final Word",
        "story": (
            "The kingdom's king refuses to be described by anything other than his own name — "
            "printed directly, with no extra ceremony, whenever anyone tries to display him."
        ),
        "concept_title": "Dunder Methods — __str__",
        "concept_explanation": (
            "__str__(self) is a \"dunder\" (double-underscore) method Python calls automatically "
            "whenever an object is printed. Defining it lets print(some_object) show something "
            "meaningful instead of a generic <Player object at 0x...> address."
        ),
        "example": {"code": "class Item:\n    def __init__(self, name):\n        self.name = name\n    def __str__(self):\n        return self.name\n\nprint(Item(\"Gem\"))", "output": "Gem"},
        "mission": (
            "Add a __str__(self) method to Player that returns self.name. Create "
            "player = Player('Py', 100) and print(player) directly."
        ),
        "starter_code": (
            "class Player:\n    def __init__(self, name, health):\n        self.name = name\n        self.health = health\n"
            "    # add a __str__(self) method here that returns self.name\n\n"
            "# create player, then print(player) directly\n"
        ),
        "stdin_lines": [],
        "expected_output": "Py",
        "hints": [
            "print() calls __str__ automatically on whatever you give it, if it's defined.",
            "def __str__(self): return self.name — return, not print, inside this method.",
            (
                'class Player:\n    def __init__(self, name, health):\n        self.name = name\n        self.health = health\n\n'
                "    def __str__(self):\n        return self.name\n\n"
                'player = Player("Py", 100)\nprint(player)'
            ),
        ],
        "xp_reward": 380, "coin_reward": 75, "skill_unlocked": "Dunder Methods — World 12 Complete",
    },
]
