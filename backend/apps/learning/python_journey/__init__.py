"""PY — Journey to the Kingdom of Python: the second learning game, built
the same data-driven way as sql_games/frog/ (see that package's docstring
for the pattern this mirrors). A future third game gets its own sibling
package at apps/learning/<name>/, registered in games_registry.py —
nothing about this package or that registry assumes there are only two.

Levels are split across files purely for readability (levels.py: Worlds
1-2, worlds_3_to_8.py: Worlds 3-8, worlds_9_to_12.py: Worlds 9-12,
worlds_13_to_final.py: Worlds 13-16 + the Final World) but form one
continuous, globally-ordered journey — 91 levels across all 17 worlds,
matching the full design curriculum. ALL_LEVELS is that combined,
order-sorted list; every view keys off ALL_LEVELS / ALL_LEVELS_BY_ID,
never the per-world lists directly.
"""

from .levels import (
    WORLD_1_LEVELS,
    WORLD_2_LEVELS,
)
from .worlds_3_to_8 import (
    WORLD_3_LEVELS,
    WORLD_4_LEVELS,
    WORLD_5_LEVELS,
    WORLD_6_LEVELS,
    WORLD_7_LEVELS,
    WORLD_8_LEVELS,
)
from .worlds_9_to_12 import (
    WORLD_9_LEVELS,
    WORLD_10_LEVELS,
    WORLD_11_LEVELS,
    WORLD_12_LEVELS,
)
from .worlds_13_to_final import (
    WORLD_13_LEVELS,
    WORLD_14_LEVELS,
    WORLD_15_LEVELS,
    WORLD_16_LEVELS,
    FINAL_WORLD_LEVELS,
)
from .cosmetics import (
    ACCESSORIES,
    ALL_COSMETICS,
    ALL_COSMETICS_BY_ID,
    DEFAULT_OWNED,
    PURCHASE_XP_BONUS,
    SKINS,
    slot_for,
)

ALL_LEVELS = sorted(
    WORLD_1_LEVELS + WORLD_2_LEVELS + WORLD_3_LEVELS + WORLD_4_LEVELS + WORLD_5_LEVELS
    + WORLD_6_LEVELS + WORLD_7_LEVELS + WORLD_8_LEVELS + WORLD_9_LEVELS + WORLD_10_LEVELS
    + WORLD_11_LEVELS + WORLD_12_LEVELS + WORLD_13_LEVELS + WORLD_14_LEVELS + WORLD_15_LEVELS
    + WORLD_16_LEVELS + FINAL_WORLD_LEVELS,
    key=lambda lvl: lvl["order"],
)
ALL_LEVELS_BY_ID = {lvl["id"]: lvl for lvl in ALL_LEVELS}

WORLD_NAMES = {
    1: "The Beginning",
    2: "The Operator Mountains",
    3: "The Kingdom of Decisions",
    4: "The Loop Dungeon",
    5: "The Collection Valley",
    6: "The String Kingdom",
    7: "The Function Village",
    8: "Python Power",
    9: "The Error Dungeon",
    10: "File Village",
    11: "Module Mountains",
    12: "The OOP Kingdom",
    13: "Python Engineering",
    14: "Data & Real Programming",
    15: "Debugging & Code Quality",
    16: "Data Structures & Algorithmic Thinking",
    17: "The Kingdom of Python",
}

# Every world (1-17) is now fully built — nothing left to show as a locked
# "coming soon" placeholder. Kept as an empty list (not removed) since the
# map view still reads this key; a genuinely future World 18+ would go here.
FUTURE_WORLDS = []

__all__ = [
    "WORLD_1_LEVELS", "WORLD_2_LEVELS", "WORLD_3_LEVELS", "WORLD_4_LEVELS", "WORLD_5_LEVELS",
    "WORLD_6_LEVELS", "WORLD_7_LEVELS", "WORLD_8_LEVELS", "WORLD_9_LEVELS", "WORLD_10_LEVELS",
    "WORLD_11_LEVELS", "WORLD_12_LEVELS", "WORLD_13_LEVELS", "WORLD_14_LEVELS", "WORLD_15_LEVELS",
    "WORLD_16_LEVELS", "FINAL_WORLD_LEVELS",
    "ALL_LEVELS",
    "ALL_LEVELS_BY_ID",
    "WORLD_NAMES",
    "FUTURE_WORLDS",
    "SKINS",
    "ACCESSORIES",
    "ALL_COSMETICS",
    "ALL_COSMETICS_BY_ID",
    "DEFAULT_OWNED",
    "PURCHASE_XP_BONUS",
    "slot_for",
]
