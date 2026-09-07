"""SQL Frog's cosmetic shop catalog — hand-authored content, same "code, not
DB rows" convention as levels.py/worlds_2_to_8.py, since a shop item is game
design (cost, slot, visual) rather than admin-editable data.

Two slots: "skin" (recolors the frog emoji via a CSS filter on the frontend
— there's no colored-frog emoji variant, so this is the only way to offer
frog "colors" without shipping image assets) and "accessory" (an emoji
overlaid on top of the frog). At most one equipped item per slot.

`css_filter` is a CSS filter() value the frontend applies directly — kept
here rather than re-derived client-side so a new skin is a one-line add in
exactly one place.
"""

SKINS = [
    {"id": "skin_default", "name": "Classic Green", "cost": 0, "css_filter": "none",
     "swatch": "#16a34a"},
    {"id": "skin_blue", "name": "Blueberry", "cost": 80, "css_filter": "hue-rotate(150deg) saturate(1.4)",
     "swatch": "#2563eb"},
    {"id": "skin_purple", "name": "Grape", "cost": 80, "css_filter": "hue-rotate(230deg) saturate(1.6)",
     "swatch": "#7c3aed"},
    {"id": "skin_red", "name": "Tomato", "cost": 100, "css_filter": "hue-rotate(-100deg) saturate(2)",
     "swatch": "#dc2626"},
    {"id": "skin_gold", "name": "Golden", "cost": 150, "css_filter": "sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.1)",
     "swatch": "#d97706"},
    {"id": "skin_shadow", "name": "Shadow", "cost": 200, "css_filter": "grayscale(1) brightness(0.55)",
     "swatch": "#334155"},
]

ACCESSORIES = [
    {"id": "acc_none", "name": "None", "cost": 0, "emoji": None},
    {"id": "acc_hat", "name": "Top Hat", "cost": 60, "emoji": "🎩"},
    {"id": "acc_glasses", "name": "Cool Shades", "cost": 60, "emoji": "🕶️"},
    {"id": "acc_bow", "name": "Bow Tie", "cost": 50, "emoji": "🎀"},
    {"id": "acc_crown", "name": "Royal Crown", "cost": 250, "emoji": "👑"},
    {"id": "acc_wizard", "name": "Wizard Hat", "cost": 220, "emoji": "🧙"},
]

ALL_COSMETICS = SKINS + ACCESSORIES
ALL_COSMETICS_BY_ID = {item["id"]: item for item in ALL_COSMETICS}

# Free/default items every student owns from the start — no purchase needed
# to have *something* equipped in each slot.
DEFAULT_OWNED = ["skin_default", "acc_none"]

# Buying ANY cosmetic (not just owning it) grants a small XP bonus — this is
# on top of the coins spent, so a purchase is never "pure cost", per the
# explicit design: "that purchase will add experience".
PURCHASE_XP_BONUS = 20


def slot_for(item_id):
    """'skin' or 'accessory' for a known cosmetic id, else None."""
    if item_id in {s["id"] for s in SKINS}:
        return "skin"
    if item_id in {a["id"] for a in ACCESSORIES}:
        return "accessory"
    return None
