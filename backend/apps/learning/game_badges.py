"""Shared badge catalog for every learning game (SQL Frog, Py's Journey, and
any future game registered in games_registry.py) — hand-authored content,
same "code, not DB rows" convention as learn_sprint_badges.py: the badge's
label/icon/description is game design, not admin-editable data. Which
students actually earned which badge in which game is the only part that
lives in the database (GameBadgeAward).

Unlike Learn Sprint's badges (scored per-sprint), these three criteria are
identical across every game, so one catalog + one GameBadgeAward model
serves all of them rather than one model per game.

`icon` is a lucide-react icon name the frontend renders directly.
"""

BADGE_CATALOG = {
    "first_steps": {
        "label": "First Steps",
        "description": "Completed your very first level.",
        "icon": "Footprints",
    },
    "world_champion": {
        "label": "World Champion",
        "description": "Completed every level in a world.",
        "icon": "Trophy",
    },
    "game_master": {
        "label": "Game Master",
        "description": "Completed every level in the game.",
        "icon": "Crown",
    },
}
