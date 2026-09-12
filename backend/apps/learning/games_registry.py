"""The one place every learning game (SQL Frog, Py's Journey, and any future
game) registers itself for cross-game features: the XP leaderboard
(views/student/problems.py::StudentLeaderboardView), completion badges
(views/_shared.py::award_game_badges), and the student report's "Languages
& Games" mastery table (views/staff/reports.py::StudentReportPDFView).

Adding a third game later means adding one entry here — none of those three
call sites need new bespoke code, they all loop this list.

`total_levels_fn` is a zero-arg callable, not a plain int, so importing
this module never forces-imports every game's content package (and so a
game's own level count — which can grow as more worlds are authored —
never needs syncing here by hand).
"""


def _sql_frog_total_levels():
    from .sql_games.frog import ALL_LEVELS
    return len(ALL_LEVELS)


def _py_journey_total_levels():
    from .python_journey import ALL_LEVELS
    return len(ALL_LEVELS)


def _sql_frog_progress_model():
    from .models import SqlFrogProgress
    return SqlFrogProgress


def _py_journey_progress_model():
    from .models import PyJourneyProgress
    return PyJourneyProgress


GAMES_REGISTRY = [
    {
        "key": "sql_frog",
        "label": "SQL",
        "progress_related_name": "sql_frog_progress",
        "total_levels_fn": _sql_frog_total_levels,
        "progress_model_fn": _sql_frog_progress_model,
    },
    {
        "key": "py_journey",
        "label": "Python",
        "progress_related_name": "py_journey_progress",
        "total_levels_fn": _py_journey_total_levels,
        "progress_model_fn": _py_journey_progress_model,
    },
]

GAMES_BY_KEY = {g["key"]: g for g in GAMES_REGISTRY}
