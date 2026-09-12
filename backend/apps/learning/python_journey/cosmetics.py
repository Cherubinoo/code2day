"""Py's Journey's cosmetic shop catalog — hand-authored content, same
"code, not DB rows" convention as sql_games/frog/cosmetics.py.

Two slots: "skin" (recolors the snake emoji via a CSS filter on the
frontend) and "accessory" (an emoji overlaid on top of the snake). At most
one equipped item per slot.
"""

SKINS = [
    {"id": "skin_default", "name": "Garden Green", "cost": 0, "css_filter": "none",
     "swatch": "#16a34a"},
    {"id": "skin_sunset", "name": "Sunset Orange", "cost": 80, "css_filter": "hue-rotate(60deg) saturate(1.6)",
     "swatch": "#ea580c"},
    {"id": "skin_ocean", "name": "Ocean Blue", "cost": 80, "css_filter": "hue-rotate(150deg) saturate(1.4)",
     "swatch": "#2563eb"},
    {"id": "skin_royal", "name": "Royal Purple", "cost": 100, "css_filter": "hue-rotate(230deg) saturate(1.6)",
     "swatch": "#7c3aed"},
    {"id": "skin_golden", "name": "Golden Python", "cost": 150, "css_filter": "sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.1)",
     "swatch": "#d97706"},
    {"id": "skin_shadow", "name": "Shadow Serpent", "cost": 200, "css_filter": "grayscale(1) brightness(0.55)",
     "swatch": "#334155"},
]

ACCESSORIES = [
    {"id": "acc_none", "name": "None", "cost": 0, "emoji": None},
    {"id": "acc_hat", "name": "Explorer Hat", "cost": 60, "emoji": "🎩"},
    {"id": "acc_glasses", "name": "Coder Shades", "cost": 60, "emoji": "🕶️"},
    {"id": "acc_scarf", "name": "Adventurer Scarf", "cost": 50, "emoji": "🧣"},
    {"id": "acc_crown", "name": "Kingdom Crown", "cost": 250, "emoji": "👑"},
    {"id": "acc_wizard", "name": "Wizard Hat", "cost": 220, "emoji": "🧙"},
]

ALL_COSMETICS = SKINS + ACCESSORIES
ALL_COSMETICS_BY_ID = {item["id"]: item for item in ALL_COSMETICS}

# Free/default items every student owns from the start.
DEFAULT_OWNED = ["skin_default", "acc_none"]

# Buying ANY cosmetic grants a small XP bonus on top of the coins spent —
# same explicit design choice as SQL Frog's shop.
PURCHASE_XP_BONUS = 20


def slot_for(item_id):
    """'skin' or 'accessory' for a known cosmetic id, else None."""
    if item_id in {s["id"] for s in SKINS}:
        return "skin"
    if item_id in {a["id"] for a in ACCESSORIES}:
        return "accessory"
    return None
