"""Py's Journey — 7 views, structural copies of SQL Frog's own 7 views
(views/student/practice.py) against PyJourneyProgress + python_journey's
level/cosmetics content. See _shared.py's _py_journey_grade and
award_game_badges for the execution/grading and badge pieces this reuses."""
from .._imports import *
from .._shared import *


class PyJourneyProgressView(StudentAuthMixin, APIView):
    """Py's Journey: the player's overall progress — XP/coins/rank, and
    every world's level list with locked/unlocked/completed state. Unlock
    is a single global sequence across ALL_LEVELS, same as SQL Frog."""

    def get(self, request):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        progress, _ = PyJourneyProgress.objects.get_or_create(student=profile)
        completed = set(progress.completed_level_ids)

        worlds_by_number = {}
        unlocked_so_far = True  # level 1 (globally) always unlocked
        for lvl in PY_JOURNEY_ALL_LEVELS:
            worlds_by_number.setdefault(lvl["world"], []).append({
                "id": lvl["id"], "order": lvl["order"], "title": lvl["title"],
                "skill_unlocked": lvl["skill_unlocked"],
                "completed": lvl["id"] in completed,
                "unlocked": unlocked_so_far,
            })
            unlocked_so_far = lvl["id"] in completed

        worlds = [
            {"world": w, "name": PY_JOURNEY_WORLD_NAMES.get(w, f"World {w}"), "levels": levels}
            for w, levels in worlds_by_number.items()
        ]

        return Response({
            "xp": progress.xp, "coins": progress.coins,
            "completed_level_ids": list(completed),
            "worlds": worlds,
            "future_worlds": PY_JOURNEY_FUTURE_WORLDS,
            "equipped_cosmetics": progress.equipped_cosmetics,
        })


class PyJourneyLevelDetailView(StudentAuthMixin, APIView):
    """One level's teaching content — story/concept/example/mission/starter
    code. Never includes expected_output or the reference solution."""

    def get(self, request, level_id):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        level = PY_JOURNEY_ALL_LEVELS_BY_ID.get(level_id)
        if not level:
            return Response({"detail": "Level not found."}, status=404)

        progress, _ = PyJourneyProgress.objects.get_or_create(student=profile)
        completed = set(progress.completed_level_ids)
        idx = level["order"] - 1
        unlocked = idx == 0 or PY_JOURNEY_ALL_LEVELS[idx - 1]["id"] in completed
        if not unlocked:
            return Response({"detail": "This level isn't unlocked yet."}, status=403)

        return Response({
            "id": level["id"], "order": level["order"], "world": level["world"], "title": level["title"],
            "story": level["story"], "concept_title": level["concept_title"],
            "concept_explanation": level["concept_explanation"], "example": level["example"],
            "mission": level["mission"], "starter_code": level["starter_code"],
            "visual_effect": level.get("visual_effect"),
            "completed": level["id"] in completed,
            "xp_reward": level["xp_reward"], "coin_reward": level["coin_reward"],
            "skill_unlocked": level["skill_unlocked"],
        })


class PyJourneyRunView(StudentAuthMixin, APIView):
    """Executes the player's Python code for one level via the existing
    Judge0 pipeline and grades it. Awards XP/coins/badges only the first
    time a level is completed — replaying an already-completed level for
    practice doesn't double-award."""

    def post(self, request, level_id):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        level = PY_JOURNEY_ALL_LEVELS_BY_ID.get(level_id)
        if not level:
            return Response({"detail": "Level not found."}, status=404)

        code = (request.data.get("code") or "").strip()
        if not code:
            return Response({"error": "Write some code first."}, status=400)

        progress, _ = PyJourneyProgress.objects.get_or_create(student=profile)
        completed = set(progress.completed_level_ids)
        idx = level["order"] - 1
        unlocked = idx == 0 or PY_JOURNEY_ALL_LEVELS[idx - 1]["id"] in completed
        if not unlocked:
            return Response({"detail": "This level isn't unlocked yet."}, status=403)

        success, error_category, message, output = _py_journey_grade(code, level)

        already_completed = level["id"] in completed
        xp_awarded = coins_awarded = 0
        if success and not already_completed:
            xp_awarded, coins_awarded = level["xp_reward"], level["coin_reward"]
            progress.xp += xp_awarded
            progress.coins += coins_awarded
            progress.completed_level_ids = list(completed | {level["id"]})
            progress.save(update_fields=["xp", "coins", "completed_level_ids", "updated_at"])
            award_game_badges(progress, "py_journey", level, PY_JOURNEY_ALL_LEVELS)

        return Response({
            "success": success,
            "error_category": error_category,
            "message": message,
            "output": output,
            "xp_awarded": xp_awarded,
            "coins_awarded": coins_awarded,
            "already_completed": already_completed,
            "skill_unlocked": level["skill_unlocked"] if success else None,
            "total_xp": progress.xp, "total_coins": progress.coins,
        })


class PyJourneyHintView(StudentAuthMixin, APIView):
    """Returns one of a level's 3 hints — progressively more specific.
    Tracked for stats only; never reduces XP/coin rewards."""

    def post(self, request, level_id):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        level = PY_JOURNEY_ALL_LEVELS_BY_ID.get(level_id)
        if not level:
            return Response({"detail": "Level not found."}, status=404)

        try:
            hint_level = int(request.data.get("hint_level"))
        except (TypeError, ValueError):
            return Response({"error": "hint_level must be 1, 2, or 3."}, status=400)
        if hint_level not in (1, 2, 3):
            return Response({"error": "hint_level must be 1, 2, or 3."}, status=400)

        progress, _ = PyJourneyProgress.objects.get_or_create(student=profile)
        hints_used = dict(progress.hints_used)
        hints_used[level["id"]] = max(hints_used.get(level["id"], 0), hint_level)
        progress.hints_used = hints_used
        progress.save(update_fields=["hints_used", "updated_at"])

        return Response({"hint_level": hint_level, "hint": level["hints"][hint_level - 1]})


def _py_journey_owned_ids(progress):
    """A student's owned cosmetic ids always includes the free defaults —
    computed rather than stored redundantly, mirrors _sql_frog_owned_ids."""
    return set(progress.owned_cosmetic_ids) | set(PY_JOURNEY_DEFAULT_OWNED_COSMETICS)


def _py_journey_cosmetics_payload(progress):
    owned = _py_journey_owned_ids(progress)
    equipped = dict(progress.equipped_cosmetics)
    return {
        "coins": progress.coins,
        "xp": progress.xp,
        "equipped": equipped,
        "items": [
            {**item, "slot": py_journey_cosmetic_slot_for(item["id"]), "owned": item["id"] in owned}
            for item in PY_JOURNEY_ALL_COSMETICS
        ],
    }


class PyJourneyShopView(StudentAuthMixin, APIView):
    """Py's Journey: the cosmetic shop's catalog plus this student's owned/
    equipped state and coin balance."""

    def get(self, request):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error
        progress, _ = PyJourneyProgress.objects.get_or_create(student=profile)
        return Response(_py_journey_cosmetics_payload(progress))


class PyJourneyPurchaseCosmeticView(StudentAuthMixin, APIView):
    """Py's Journey: buy one cosmetic with coins. Purchasing grants a small
    XP bonus on top of the coin cost, same design as SQL Frog's shop."""

    def post(self, request):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        item_id = request.data.get("item_id")
        item = PY_JOURNEY_ALL_COSMETICS_BY_ID.get(item_id)
        if not item:
            return Response({"detail": "Unknown item."}, status=404)

        progress, _ = PyJourneyProgress.objects.get_or_create(student=profile)
        if item_id in _py_journey_owned_ids(progress):
            return Response({"error": "You already own this item."}, status=400)
        if progress.coins < item["cost"]:
            return Response({"error": "Not enough coins for this item."}, status=400)

        progress.coins -= item["cost"]
        progress.xp += PY_JOURNEY_PURCHASE_XP_BONUS
        progress.owned_cosmetic_ids = list(set(progress.owned_cosmetic_ids) | {item_id})
        progress.save(update_fields=["coins", "xp", "owned_cosmetic_ids", "updated_at"])

        payload = _py_journey_cosmetics_payload(progress)
        payload["xp_awarded"] = PY_JOURNEY_PURCHASE_XP_BONUS
        payload["purchased_item_id"] = item_id
        return Response(payload)


class PyJourneyEquipCosmeticView(StudentAuthMixin, APIView):
    """Py's Journey: equip an owned cosmetic into its slot."""

    def post(self, request):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        item_id = request.data.get("item_id")
        item = PY_JOURNEY_ALL_COSMETICS_BY_ID.get(item_id)
        if not item:
            return Response({"detail": "Unknown item."}, status=404)

        progress, _ = PyJourneyProgress.objects.get_or_create(student=profile)
        if item_id not in _py_journey_owned_ids(progress):
            return Response({"error": "You don't own this item yet."}, status=400)

        slot = py_journey_cosmetic_slot_for(item_id)
        equipped = dict(progress.equipped_cosmetics)
        equipped[slot] = item_id
        progress.equipped_cosmetics = equipped
        progress.save(update_fields=["equipped_cosmetics", "updated_at"])

        return Response(_py_journey_cosmetics_payload(progress))
