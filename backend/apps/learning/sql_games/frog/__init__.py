"""SQL Frog: Journey to the SQL Kingdom — the first game under sql_games/.
A future second game gets its own sibling package here (e.g. sql_games/heist/)
with its own levels module and, if its content needs more than one file,
its own internal layout — nothing about this package assumes there's only
ever one game.

Levels are split across two files purely because of when they were
written — levels.py (World 1) and worlds_2_to_8.py (Worlds 2-7 + the Grand
Trial) — but form one continuous, globally-ordered journey. ALL_LEVELS is
that combined, order-sorted list; every view keys off ALL_LEVELS /
ALL_LEVELS_BY_ID, never the per-world lists directly, so the sequential
unlock logic (`ALL_LEVELS[order - 2]` completed unlocks the next one) works
across a world boundary exactly the same as within one world.
"""

from .levels import (
    DEMO_SCHEMA,
    DEMO_SEED,
    FROGS_SCHEMA,
    FROGS_SEED,
    WORLD_1_LEVELS,
)
from .worlds_2_to_8 import (
    ALL_NEW_LEVELS,
    GRAND_TRIAL_LEVEL,
    VILLAGE_LEVEL_IDS,
    VILLAGE_SCHEMA,
    VILLAGE_SEED,
    WORLD_2_LEVELS,
    WORLD_3_LEVELS,
    WORLD_4_LEVELS,
    WORLD_5_LEVELS,
    WORLD_6_LEVELS,
    WORLD_7_LEVELS,
    WORLD_NAMES,
    _village_schema_view,
)

ALL_LEVELS = sorted(WORLD_1_LEVELS + ALL_NEW_LEVELS, key=lambda lvl: lvl["order"])
ALL_LEVELS_BY_ID = {lvl["id"]: lvl for lvl in ALL_LEVELS}

# Every world (1-8, where 8 is the single-level Grand Trial) is fully built
# now — nothing left to show as a locked "coming soon" placeholder on the
# map. Kept as an empty list (not removed) since the map view still reads
# this key; a genuinely future World 9+ would go here.
FUTURE_WORLDS = []

__all__ = [
    "DEMO_SCHEMA",
    "DEMO_SEED",
    "FROGS_SCHEMA",
    "FROGS_SEED",
    "VILLAGE_SCHEMA",
    "VILLAGE_SEED",
    "WORLD_1_LEVELS",
    "WORLD_2_LEVELS",
    "WORLD_3_LEVELS",
    "WORLD_4_LEVELS",
    "WORLD_5_LEVELS",
    "WORLD_6_LEVELS",
    "WORLD_7_LEVELS",
    "GRAND_TRIAL_LEVEL",
    "ALL_LEVELS",
    "ALL_LEVELS_BY_ID",
    "VILLAGE_LEVEL_IDS",
    "WORLD_NAMES",
    "FUTURE_WORLDS",
    "_village_schema_view",
]
