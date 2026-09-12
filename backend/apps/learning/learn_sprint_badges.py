"""Learn Sprint's badge catalog — hand-authored content, same "code, not DB
rows" convention as SQL Frog's cosmetic shop (sql_games/frog/cosmetics.py):
the badge's label/icon/description is game design, not admin-editable data.
Which students actually earned which badge for which sprint is the only
part that lives in the database (LearnSprintBadgeAward).

`icon` is a lucide-react icon name the frontend renders directly.
"""

BADGE_CATALOG = {
    "champion": {
        "label": "Sprint Champion",
        "description": "Finished rank #1 overall across the whole sprint.",
        "icon": "Crown",
    },
    "podium": {
        "label": "Podium Finish",
        "description": "Finished in the top 3 overall across the whole sprint.",
        "icon": "Medal",
    },
    "perfect_attendance": {
        "label": "Perfect Attendance",
        "description": "Participated in every single day of the sprint.",
        "icon": "CalendarCheck",
    },
    "day_champion": {
        "label": "Day Champion",
        "description": "Finished rank #1 on at least one day of the sprint.",
        "icon": "Star",
    },
}
