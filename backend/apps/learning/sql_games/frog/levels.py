"""Content for "SQL Frog: Journey to the SQL Kingdom" — World 1 (Beginner
Pond). Levels are hand-authored game design content, not admin-editable DB
rows (same reasoning as everything else in this file's sibling modules that
ships as code rather than through a CRUD UI) — see sql_frog_views.py for how
these get executed and graded.

Every level shares one `frogs` table so the pond's story stays continuous
instead of a new unrelated table appearing every level. `expected_result`
for every level below was verified locally against Python's stdlib sqlite3
(not Judge0 — see the plan/PR notes) before being hardcoded here, so grading
never depends on re-deriving the "correct" answer at request time.
"""

FROGS_SCHEMA = """
CREATE TABLE frogs (
  id INTEGER PRIMARY KEY,
  name TEXT,
  color TEXT,
  weight_kg REAL,
  score INTEGER,
  team TEXT
);
"""

FROGS_SEED = """
INSERT INTO frogs (name, color, weight_kg, score, team) VALUES
('Kermit', 'green', 8.5, 92, 'Leap'),
('Pepe', 'green', 6.0, 75, 'Splash'),
('Rana', 'green', 9.9, 60, 'Croak'),
('Michigan', 'brown', 12.0, 55, 'Croak'),
('Toady', 'brown', 15.5, 40, 'Hop'),
('Ribbit', 'blue', 7.2, 88, 'Leap'),
('Splash', 'blue', 5.5, 95, 'Splash'),
('Hoppy', 'red', 11.0, 70, 'Hop'),
('Bullfrog', 'red', 20.0, 30, 'Croak'),
('Lily', 'yellow', 4.5, 82, 'Splash'),
('Krok', 'green', 13.3, 65, 'Hop'),
('Marsh', 'blue', 9.0, 78, 'Leap');
"""

# A tiny, separate demo table used only in "TRY IT" / concept examples so
# early examples never leak the exact filter/value the mission is asking
# for — the player sees the *pattern*, not the answer.
DEMO_SCHEMA = """
CREATE TABLE pond_visitors (
  id INTEGER PRIMARY KEY,
  visitor TEXT,
  day TEXT
);
"""
DEMO_SEED = """
INSERT INTO pond_visitors (visitor, day) VALUES
('Duck', 'Monday'),
('Turtle', 'Tuesday');
"""

WORLD_1_LEVELS = [
    {
        "id": "w1_l01", "order": 1, "world": 1,
        "title": "Welcome to the Pond",
        "story": (
            "A tiny frog egg hatches at the edge of a quiet pond. "
            "\"Ribbit! Welcome, little one,\" says an old bullfrog. "
            "\"Everything you see here — every frog, every lily pad — lives inside a database. "
            "If you want this world to respond to you, you'll have to speak its language: SQL.\""
        ),
        "concept_title": "What's a Database? — SELECT *",
        "concept_explanation": (
            "A database stores information in tables, like a spreadsheet. "
            "A table has rows (one per thing — here, one row per frog) and columns (one per piece of information — name, color, weight...). "
            "SELECT * FROM tablename; asks the database to show every column of every row in that table — the simplest question you can ask."
        ),
        "example": {
            "query": "SELECT * FROM pond_visitors;",
            "columns": ["id", "visitor", "day"],
            "result": [[1, "Duck", "Monday"], [2, "Turtle", "Tuesday"]],
        },
        "mission": "The Pond Council wants to see every frog living here — every column, every frog. Show them all.",
        "schema_sql": FROGS_SCHEMA, "seed_sql": FROGS_SEED,
        "expected_result": [
            [1, "Kermit", "green", 8.5, 92, "Leap"], [2, "Pepe", "green", 6.0, 75, "Splash"],
            [3, "Rana", "green", 9.9, 60, "Croak"], [4, "Michigan", "brown", 12.0, 55, "Croak"],
            [5, "Toady", "brown", 15.5, 40, "Hop"], [6, "Ribbit", "blue", 7.2, 88, "Leap"],
            [7, "Splash", "blue", 5.5, 95, "Splash"], [8, "Hoppy", "red", 11.0, 70, "Hop"],
            [9, "Bullfrog", "red", 20.0, 30, "Croak"], [10, "Lily", "yellow", 4.5, 82, "Splash"],
            [11, "Krok", "green", 13.3, 65, "Hop"], [12, "Marsh", "blue", 9.0, 78, "Leap"],
        ],
        "order_matters": False,
        "hints": [
            "You want to see every column, for every frog.",
            "SELECT tells the database what to show; * means \"all columns\"; FROM says which table.",
            "SELECT * FROM frogs;",
        ],
        "xp_reward": 100, "coin_reward": 20, "skill_unlocked": "SELECT",
    },
    {
        "id": "w1_l02", "order": 2, "world": 1,
        "title": "The Pond Council",
        "story": "The council frogs are busy — they don't need every detail, just the essentials.",
        "concept_title": "Choosing Columns",
        "concept_explanation": (
            "You don't have to select every column. List just the ones you want, separated by commas: "
            "SELECT column_a, column_b FROM tablename; shows only those columns, for every row."
        ),
        "example": {
            "query": "SELECT visitor FROM pond_visitors;",
            "columns": ["visitor"],
            "result": [["Duck"], ["Turtle"]],
        },
        "mission": "The Pond Council only wants each frog's name and color — nothing else.",
        "schema_sql": FROGS_SCHEMA, "seed_sql": FROGS_SEED,
        "expected_result": [
            ["Kermit", "green"], ["Pepe", "green"], ["Rana", "green"], ["Michigan", "brown"],
            ["Toady", "brown"], ["Ribbit", "blue"], ["Splash", "blue"], ["Hoppy", "red"],
            ["Bullfrog", "red"], ["Lily", "yellow"], ["Krok", "green"], ["Marsh", "blue"],
        ],
        "order_matters": False,
        "hints": [
            "List just the two columns the council asked for.",
            "SELECT name, color FROM frogs; — pick the columns, separated by a comma.",
            "SELECT name, color FROM frogs;",
        ],
        "xp_reward": 100, "coin_reward": 20, "skill_unlocked": "SELECT columns",
    },
    {
        "id": "w1_l03", "order": 3, "world": 1,
        "title": "The First Lily Pad",
        "story": "A narrow lily pad only holds frogs of one color — it's coated in green pollen and only green frogs won't slip.",
        "concept_title": "WHERE — Filter Power",
        "concept_explanation": (
            "WHERE lets you choose only the rows that match a condition. "
            "SELECT name FROM tablename WHERE column = 'value'; keeps only rows where that column equals that value."
        ),
        "example": {
            "query": "SELECT name FROM frogs WHERE color = 'blue';",
            "columns": ["name"],
            "result": [["Ribbit"], ["Splash"], ["Marsh"]],
        },
        "mission": "Only green frogs may cross the first lily pad. Find them.",
        "schema_sql": FROGS_SCHEMA, "seed_sql": FROGS_SEED,
        "expected_result": [["Kermit"], ["Pepe"], ["Rana"], ["Krok"]],
        "order_matters": False,
        "hints": [
            "Try filtering the frogs based on their color.",
            "You need SELECT to choose the name and WHERE to filter by color.",
            "SELECT name FROM frogs WHERE color = 'green';",
        ],
        "xp_reward": 120, "coin_reward": 25, "skill_unlocked": "WHERE",
    },
    {
        "id": "w1_l04", "order": 4, "world": 1,
        "title": "The Weighing Bridge",
        "story": "An old wooden bridge groans under too much weight. A sign warns: light frogs only.",
        "concept_title": "Comparison Operators",
        "concept_explanation": (
            "WHERE also works with <, >, <=, >=, and != — not just equals. "
            "WHERE weight_kg < 10 keeps only rows where that number is less than 10."
        ),
        "example": {
            "query": "SELECT name FROM frogs WHERE score > 80;",
            "columns": ["name"],
            "result": [["Kermit"], ["Ribbit"], ["Splash"], ["Lily"]],
        },
        "mission": "The bridge only allows frogs weighing less than 10kg. Find who can cross.",
        "schema_sql": FROGS_SCHEMA, "seed_sql": FROGS_SEED,
        "expected_result": [["Kermit"], ["Pepe"], ["Rana"], ["Ribbit"], ["Splash"], ["Lily"], ["Marsh"]],
        "order_matters": False,
        "hints": [
            "Try filtering the frogs based on their weight.",
            "You need SELECT to choose the name and WHERE to filter by weight_kg.",
            "SELECT name FROM frogs WHERE weight_kg < 10;",
        ],
        "xp_reward": 120, "coin_reward": 25, "skill_unlocked": "Comparisons",
    },
    {
        "id": "w1_l05", "order": 5, "world": 1,
        "title": "The Double Gate",
        "story": "Past the bridge stands a gate with two locks. Both conditions must be true to pass.",
        "concept_title": "AND — Both Must Be True",
        "concept_explanation": "AND combines two conditions — a row only counts if BOTH are true.",
        "example": {
            "query": "SELECT name FROM frogs WHERE color = 'blue' AND score > 80;",
            "columns": ["name"],
            "result": [["Ribbit"], ["Splash"]],
        },
        "mission": "The double gate only opens for frogs that are green AND weigh less than 10kg.",
        "schema_sql": FROGS_SCHEMA, "seed_sql": FROGS_SEED,
        "expected_result": [["Kermit"], ["Pepe"], ["Rana"]],
        "order_matters": False,
        "hints": [
            "You need two conditions this time — color and weight.",
            "Combine them with AND: WHERE condition_1 AND condition_2.",
            "SELECT name FROM frogs WHERE color = 'green' AND weight_kg < 10;",
        ],
        "xp_reward": 130, "coin_reward": 25, "skill_unlocked": "AND",
    },
    {
        "id": "w1_l06", "order": 6, "world": 1,
        "title": "The Festival Invitation",
        "story": "The Lily Festival sends out invitations — but only to two colors of frog this year.",
        "concept_title": "OR — Either Can Be True",
        "concept_explanation": "OR combines two conditions — a row counts if EITHER one is true.",
        "example": {
            "query": "SELECT name FROM frogs WHERE color = 'yellow' OR color = 'brown';",
            "columns": ["name"],
            "result": [["Michigan"], ["Toady"], ["Lily"]],
        },
        "mission": "The festival invites red frogs OR blue frogs. Find every guest.",
        "schema_sql": FROGS_SCHEMA, "seed_sql": FROGS_SEED,
        "expected_result": [["Ribbit"], ["Splash"], ["Hoppy"], ["Bullfrog"], ["Marsh"]],
        "order_matters": False,
        "hints": [
            "Two colors are invited — either one qualifies a frog.",
            "Combine two conditions with OR instead of AND.",
            "SELECT name FROM frogs WHERE color = 'red' OR color = 'blue';",
        ],
        "xp_reward": 130, "coin_reward": 25, "skill_unlocked": "OR",
    },
    {
        "id": "w1_l07", "order": 7, "world": 1,
        "title": "The Muddy Bank Party",
        "story": "Everyone's invited to the party on the muddy bank — except the brown frogs, who'd blend in too well and ruin hide-and-seek.",
        "concept_title": "NOT — Flip a Condition",
        "concept_explanation": "NOT flips a condition — WHERE NOT color = 'brown' keeps every row where that's false.",
        "example": {
            "query": "SELECT name FROM frogs WHERE NOT color = 'green';",
            "columns": ["name"],
            "result": [["Michigan"], ["Toady"], ["Ribbit"], ["Splash"], ["Hoppy"], ["Bullfrog"], ["Lily"], ["Marsh"]],
        },
        "mission": "Everyone except brown frogs may join the party. Find the guest list.",
        "schema_sql": FROGS_SCHEMA, "seed_sql": FROGS_SEED,
        "expected_result": [["Kermit"], ["Pepe"], ["Rana"], ["Ribbit"], ["Splash"], ["Hoppy"], ["Bullfrog"], ["Lily"], ["Krok"], ["Marsh"]],
        "order_matters": False,
        "hints": [
            "Think about the opposite of \"is brown\".",
            "Use NOT in front of the condition you want to exclude.",
            "SELECT name FROM frogs WHERE NOT color = 'brown';",
        ],
        "xp_reward": 130, "coin_reward": 25, "skill_unlocked": "NOT",
    },
    {
        "id": "w1_l08", "order": 8, "world": 1,
        "title": "Race Day Sign-Ups",
        "story": "Only two teams are racing this year — everyone else has to wait for next season.",
        "concept_title": "IN — Match Any of a List",
        "concept_explanation": "IN checks a column against a whole list at once, instead of writing OR again and again.",
        "example": {
            "query": "SELECT name FROM frogs WHERE team IN ('Croak', 'Hop');",
            "columns": ["name"],
            "result": [["Rana"], ["Michigan"], ["Toady"], ["Hoppy"], ["Bullfrog"], ["Krok"]],
        },
        "mission": "Only frogs on the Leap or Splash team may race today. Find the racers.",
        "schema_sql": FROGS_SCHEMA, "seed_sql": FROGS_SEED,
        "expected_result": [["Kermit"], ["Pepe"], ["Ribbit"], ["Splash"], ["Lily"], ["Marsh"]],
        "order_matters": False,
        "hints": [
            "Two teams qualify — is there a shortcut instead of writing OR twice?",
            "IN lets you list several allowed values at once: WHERE team IN ('a', 'b').",
            "SELECT name FROM frogs WHERE team IN ('Leap', 'Splash');",
        ],
        "xp_reward": 140, "coin_reward": 30, "skill_unlocked": "IN",
    },
    {
        "id": "w1_l09", "order": 9, "world": 1,
        "title": "The Fussy Scale",
        "story": "The old pond scale is fussy — it only weighs frogs within a certain range, or it just beeps angrily.",
        "concept_title": "BETWEEN — A Range",
        "concept_explanation": "BETWEEN a AND b keeps rows where a number falls in that range, inclusive on both ends.",
        "example": {
            "query": "SELECT name FROM frogs WHERE score BETWEEN 60 AND 80;",
            "columns": ["name"],
            "result": [["Rana"], ["Michigan"], ["Hoppy"], ["Krok"], ["Marsh"]],
        },
        "mission": "The scale only accepts frogs weighing between 5 and 15 kg. Find who can use it.",
        "schema_sql": FROGS_SCHEMA, "seed_sql": FROGS_SEED,
        "expected_result": [["Kermit"], ["Pepe"], ["Rana"], ["Michigan"], ["Ribbit"], ["Splash"], ["Hoppy"], ["Krok"], ["Marsh"]],
        "order_matters": False,
        "hints": [
            "This is a range question, not a single value.",
            "BETWEEN low AND high checks a range in one go.",
            "SELECT name FROM frogs WHERE weight_kg BETWEEN 5 AND 15;",
        ],
        "xp_reward": 140, "coin_reward": 30, "skill_unlocked": "BETWEEN",
    },
    {
        "id": "w1_l10", "order": 10, "world": 1,
        "title": "The Name Stone",
        "story": "An old stone at the pond's edge only lights up for frogs whose name starts a certain way.",
        "concept_title": "LIKE — Pattern Matching",
        "concept_explanation": "LIKE matches text patterns. % means \"anything (or nothing) here\" — 'K%' means \"starts with K\".",
        "example": {
            "query": "SELECT name FROM frogs WHERE name LIKE 'M%';",
            "columns": ["name"],
            "result": [["Michigan"], ["Marsh"]],
        },
        "mission": "The stone lights up for every frog whose name starts with \"K\". Find them.",
        "schema_sql": FROGS_SCHEMA, "seed_sql": FROGS_SEED,
        "expected_result": [["Kermit"], ["Krok"]],
        "order_matters": False,
        "hints": [
            "This is about matching the start of a name, not the whole thing.",
            "LIKE 'K%' means \"starts with K, then anything\".",
            "SELECT name FROM frogs WHERE name LIKE 'K%';",
        ],
        "xp_reward": 140, "coin_reward": 30, "skill_unlocked": "LIKE",
    },
    {
        "id": "w1_l11", "order": 11, "world": 1,
        "title": "The Weightlifting Contest",
        "story": "The pond's strongest frogs line up for the weightlifting contest — heaviest goes first.",
        "concept_title": "ORDER BY — Sorting Results",
        "concept_explanation": "ORDER BY column DESC sorts rows highest-to-lowest; ASC sorts lowest-to-highest (the default).",
        "example": {
            "query": "SELECT name, score FROM frogs ORDER BY score ASC;",
            "columns": ["name", "score"],
            "result": [["Bullfrog", 30], ["Toady", 40], ["Michigan", 55], ["Rana", 60], ["Krok", 65], ["Hoppy", 70], ["Pepe", 75], ["Marsh", 78], ["Lily", 82], ["Ribbit", 88], ["Kermit", 92], ["Splash", 95]],
        },
        "mission": "Rank every frog from heaviest to lightest for the weightlifting contest.",
        "schema_sql": FROGS_SCHEMA, "seed_sql": FROGS_SEED,
        "expected_result": [
            ["Bullfrog", 20.0], ["Toady", 15.5], ["Krok", 13.3], ["Michigan", 12.0], ["Hoppy", 11.0],
            ["Rana", 9.9], ["Marsh", 9.0], ["Kermit", 8.5], ["Ribbit", 7.2], ["Pepe", 6.0], ["Splash", 5.5], ["Lily", 4.5],
        ],
        "order_matters": True,
        "hints": [
            "You need every frog, sorted by weight, heaviest first.",
            "ORDER BY weight_kg sorts by weight; DESC means highest first.",
            "SELECT name, weight_kg FROM frogs ORDER BY weight_kg DESC;",
        ],
        "xp_reward": 150, "coin_reward": 35, "skill_unlocked": "ORDER BY",
    },
    {
        "id": "w1_l12", "order": 12, "world": 1,
        "title": "The Medal Podium",
        "story": "Only three medals exist this year — gold, silver, bronze. Everyone else gets a well-earned ribbon.",
        "concept_title": "LIMIT — Just the Top Few",
        "concept_explanation": "LIMIT n keeps only the first n rows of the result — perfect paired with ORDER BY for \"top N\".",
        "example": {
            "query": "SELECT name FROM frogs ORDER BY weight_kg ASC LIMIT 2;",
            "columns": ["name"],
            "result": [["Lily"], ["Splash"]],
        },
        "mission": "Only the top 3 highest-scoring frogs get medals. Find them, in order.",
        "schema_sql": FROGS_SCHEMA, "seed_sql": FROGS_SEED,
        "expected_result": [["Splash"], ["Kermit"], ["Ribbit"]],
        "order_matters": True,
        "hints": [
            "Sort by score first, then keep only the top few.",
            "ORDER BY score DESC gets the highest first; LIMIT 3 keeps just three rows.",
            "SELECT name FROM frogs ORDER BY score DESC LIMIT 3;",
        ],
        "xp_reward": 150, "coin_reward": 35, "skill_unlocked": "LIMIT",
    },
    {
        "id": "w1_l13", "order": 13, "world": 1,
        "title": "The Team Roster Board",
        "story": "A board at the village gate should list every team that exists — but not the same team twice.",
        "concept_title": "DISTINCT — Remove Duplicates",
        "concept_explanation": "DISTINCT removes duplicate rows from the result, keeping each unique value only once.",
        "example": {
            "query": "SELECT DISTINCT color FROM frogs;",
            "columns": ["color"],
            "result": [["green"], ["brown"], ["blue"], ["red"], ["yellow"]],
        },
        "mission": "List each team name exactly once for the roster board.",
        "schema_sql": FROGS_SCHEMA, "seed_sql": FROGS_SEED,
        "expected_result": [["Leap"], ["Splash"], ["Croak"], ["Hop"]],
        "order_matters": False,
        "hints": [
            "Twelve frogs, but only a handful of actual teams — remove the repeats.",
            "DISTINCT goes right after SELECT: SELECT DISTINCT column FROM table.",
            "SELECT DISTINCT team FROM frogs;",
        ],
        "xp_reward": 150, "coin_reward": 35, "skill_unlocked": "DISTINCT",
    },
    {
        "id": "w1_l14", "order": 14, "world": 1,
        "title": "The Bridge Guardian",
        "story": (
            "A stone guardian blocks the path to Frog Village. \"Only the mightiest green frogs may pass,\" it rumbles. "
            "\"Show me the top two, heaviest first, or turn back.\""
        ),
        "concept_title": "Mini-Boss: Everything Together",
        "concept_explanation": "No new skill this time — combine WHERE, ORDER BY, and LIMIT, exactly like you've done separately in this world.",
        "example": None,
        "mission": "Find the top 2 heaviest green frogs, heaviest first, to satisfy the Bridge Guardian.",
        "schema_sql": FROGS_SCHEMA, "seed_sql": FROGS_SEED,
        "expected_result": [["Krok"], ["Rana"]],
        "order_matters": True,
        "hints": [
            "You'll need to filter by color, then sort, then keep only a couple.",
            "WHERE picks the green frogs; ORDER BY ... DESC sorts by weight; LIMIT keeps the top 2.",
            "SELECT name FROM frogs WHERE color = 'green' ORDER BY weight_kg DESC LIMIT 2;",
        ],
        "xp_reward": 250, "coin_reward": 60, "skill_unlocked": "World 1 Complete",
    },
]

WORLD_1_LEVELS_BY_ID = {lvl["id"]: lvl for lvl in WORLD_1_LEVELS}

# Placeholder metadata for the map/skill-tree view — no content yet, just
# enough to show "locked, coming soon" tiles beyond World 1.
FUTURE_WORLDS = [
    {"world": 2, "name": "Frog Village", "skills": ["COUNT", "SUM", "AVG", "MIN", "MAX", "GROUP BY", "HAVING"]},
    {"world": 3, "name": "Connected Islands", "skills": ["INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "Aliases"]},
    {"world": 4, "name": "Mystery Forest", "skills": ["Subqueries", "CASE", "COALESCE", "EXISTS", "UNION"]},
    {"world": 5, "name": "Wizard Forest", "skills": ["WITH / CTEs", "Recursive CTEs"]},
    {"world": 6, "name": "Volcano Valley", "skills": ["ROW_NUMBER", "RANK", "PARTITION BY", "LAG/LEAD"]},
    {"world": 7, "name": "SQL Kingdom", "skills": ["Final Boss: everything combined"]},
]
