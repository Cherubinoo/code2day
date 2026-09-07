"""Tests for SQL Frog: Journey to the SQL Kingdom (apps/learning/sql_games/frog/)
— previously had zero test coverage despite spanning 52 hand-authored levels
across 8 worlds. Two layers:

1. Content integrity (SqlFrogLevelContentTests, SimpleTestCase, no DB, no
   Judge0) — every level's schema/seed/hints/expected_result is verified
   directly against real sqlite3, the same rule the content modules'
   docstrings state but that was previously only checked by a one-off
   throwaway script during authoring, never re-checked automatically. This
   is what actually guards against a future content edit silently breaking
   a level's correctness.
2. View/endpoint behavior (TestCase, Judge0Service mocked) — auth, the
   locked/unlocked sequence (including across a world boundary, which is
   new behavior this session's multi-world rework introduced), idempotent
   XP/coin awarding, and that a level's solution is never leaked."""

import sqlite3
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase
from django.urls import reverse

from .models import SqlFrogProgress, StudentProfile
from .sql_games.frog import (
    ALL_COSMETICS,
    ALL_COSMETICS_BY_ID,
    ALL_LEVELS,
    ALL_LEVELS_BY_ID,
    DEFAULT_OWNED,
    PURCHASE_XP_BONUS,
    VILLAGE_LEVEL_IDS,
    WORLD_NAMES,
    slot_for,
)


class SqlFrogLevelContentTests(SimpleTestCase):
    """Every one of these is a real correctness guarantee about game
    content, not app behavior — pure Python + sqlite3, no Django test DB,
    no network, so this runs in milliseconds and can't flake."""

    def test_order_is_one_continuous_sequence_with_no_gaps_or_duplicates(self):
        orders = [lvl["order"] for lvl in ALL_LEVELS]
        self.assertEqual(orders, list(range(1, len(ALL_LEVELS) + 1)))

    def test_every_level_id_is_unique(self):
        ids = [lvl["id"] for lvl in ALL_LEVELS]
        self.assertEqual(len(ids), len(set(ids)))

    def test_all_levels_by_id_matches_all_levels(self):
        self.assertEqual(len(ALL_LEVELS_BY_ID), len(ALL_LEVELS))
        for lvl in ALL_LEVELS:
            self.assertIs(ALL_LEVELS_BY_ID[lvl["id"]], lvl)

    def test_every_level_has_required_fields_and_exactly_three_hints(self):
        required = [
            "id", "order", "world", "title", "story", "concept_title", "concept_explanation",
            "mission", "schema_sql", "seed_sql", "expected_result", "order_matters", "hints",
            "xp_reward", "coin_reward", "skill_unlocked",
        ]
        for lvl in ALL_LEVELS:
            for field in required:
                self.assertIn(field, lvl, f"{lvl.get('id')} missing {field!r}")
            self.assertEqual(len(lvl["hints"]), 3, f"{lvl['id']} doesn't have exactly 3 hints")

    def test_every_level_schema_and_seed_execute_cleanly(self):
        for lvl in ALL_LEVELS:
            conn = sqlite3.connect(":memory:")
            try:
                conn.executescript(lvl["schema_sql"])
                conn.executescript(lvl["seed_sql"])
            finally:
                conn.close()

    def test_no_expected_result_contains_a_null_cell(self):
        # The grader's stdout parser can't be verified against Judge0's
        # actual SQLite build from this environment (see
        # views/_shared.py's _parse_sql_frog_stdout docstring) — a NULL
        # cell's exact text rendering is the one thing that's genuinely
        # uncertain, so no graded level should ever depend on it.
        for lvl in ALL_LEVELS:
            for row in lvl["expected_result"]:
                self.assertNotIn(None, row, f"{lvl['id']} has a None cell: {row}")

    def test_every_level_hint_three_is_the_exact_answer_and_reproduces_expected_result(self):
        """hints[2] (the 3rd, most-specific hint) is documented as the exact
        answer query for every level — this actually runs it and confirms
        it produces exactly what expected_result says a correct submission
        should look like, closing the loop between "the hint teaches the
        right answer" and "the right answer actually passes grading"."""
        for lvl in ALL_LEVELS:
            conn = sqlite3.connect(":memory:")
            try:
                conn.executescript(lvl["schema_sql"])
                conn.executescript(lvl["seed_sql"])
                rows = [list(r) for r in conn.execute(lvl["hints"][2]).fetchall()]
            finally:
                conn.close()

            def norm(row):
                return tuple(round(c, 6) if isinstance(c, float) else c for c in row)

            actual = [norm(r) for r in rows]
            expected = [norm(r) for r in lvl["expected_result"]]
            if lvl["order_matters"]:
                self.assertEqual(actual, expected, f"{lvl['id']}: hint[2] answer doesn't match expected_result")
            else:
                self.assertEqual(sorted(actual), sorted(expected), f"{lvl['id']}: hint[2] answer doesn't match expected_result")

    def test_village_level_ids_are_a_subset_of_all_levels_and_use_two_tables(self):
        self.assertTrue(VILLAGE_LEVEL_IDS.issubset(ALL_LEVELS_BY_ID.keys()))
        for level_id in VILLAGE_LEVEL_IDS:
            lvl = ALL_LEVELS_BY_ID[level_id]
            self.assertIn("CREATE TABLE frogs", lvl["schema_sql"])
            self.assertIn("CREATE TABLE ponds", lvl["schema_sql"])

    def test_every_world_present_in_levels_has_a_name(self):
        worlds_in_use = {lvl["world"] for lvl in ALL_LEVELS}
        self.assertTrue(worlds_in_use.issubset(WORLD_NAMES.keys()))

    def test_world_1_and_2_do_not_use_the_village_schema(self):
        for lvl in ALL_LEVELS:
            if lvl["world"] in (1, 2):
                self.assertNotIn(lvl["id"], VILLAGE_LEVEL_IDS)
                self.assertNotIn("CREATE TABLE ponds", lvl["schema_sql"])


def _judge0_result(stdout="", stderr="", status_id=3, status="Accepted"):
    return {"status_id": status_id, "stderr": stderr, "compile_output": "", "message": "", "status": status, "stdout": stdout}


class SqlFrogProgressViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="sqlfrog_student_progress", password="secret123")
        self.profile = StudentProfile.objects.create(
            account=self.user, name="Frog Fan", register_number="SQLFROGP01",
            personal_email="frogfan@example.com", mobile_number="9999999998",
        )

    def test_requires_login(self):
        response = self.client.get(reverse("sql-frog-progress"))
        self.assertEqual(response.status_code, 401)

    def test_returns_every_world_with_first_level_unlocked(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse("sql-frog-progress"))
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["xp"], 0)
        self.assertEqual(data["coins"], 0)
        self.assertEqual(data["rank"], "Egg")
        self.assertEqual([w["world"] for w in data["worlds"]], list(range(1, 9)))

        world_1 = data["worlds"][0]
        self.assertEqual(world_1["name"], "Beginner Pond")
        self.assertTrue(world_1["levels"][0]["unlocked"])
        self.assertFalse(world_1["levels"][1]["unlocked"])

        # Every other world's every level should still be locked with nothing completed.
        for world in data["worlds"][1:]:
            self.assertTrue(all(not lvl["unlocked"] for lvl in world["levels"]))

    def test_completing_worlds_1_and_2_unlocks_world_3s_first_level(self):
        """Regression test for this session's multi-world rework: unlock is
        one continuous global sequence, so finishing a world's last level
        must unlock the NEXT world's first level exactly like finishing any
        other level does — not just within a single world."""
        progress, _ = SqlFrogProgress.objects.get_or_create(student=self.profile)
        progress.completed_level_ids = [lvl["id"] for lvl in ALL_LEVELS if lvl["world"] <= 2]
        progress.save()

        self.client.force_login(self.user)
        response = self.client.get(reverse("sql-frog-progress"))
        data = response.json()
        world_3 = next(w for w in data["worlds"] if w["world"] == 3)
        self.assertTrue(world_3["levels"][0]["unlocked"])
        self.assertFalse(world_3["levels"][0]["completed"])
        self.assertFalse(world_3["levels"][1]["unlocked"])


class SqlFrogLevelDetailViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="sqlfrog_student_detail", password="secret123")
        self.profile = StudentProfile.objects.create(
            account=self.user, name="Frog Fan", register_number="SQLFROGD01",
            personal_email="frogfand@example.com", mobile_number="9999999997",
        )
        self.client.force_login(self.user)

    def _url(self, level_id):
        return reverse("sql-frog-level-detail", args=[level_id])

    def test_unknown_level_404s(self):
        response = self.client.get(self._url("not_a_real_level"))
        self.assertEqual(response.status_code, 404)

    def test_locked_level_403s(self):
        response = self.client.get(self._url("w1_l02"))
        self.assertEqual(response.status_code, 403)

    def test_first_level_is_unlocked_and_never_leaks_the_answer(self):
        response = self.client.get(self._url("w1_l01"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertNotIn("expected_result", data)
        self.assertNotIn("hints", data)
        self.assertEqual(len(data["schemas"]), 1)
        self.assertEqual(data["schemas"][0]["table"], "frogs")

    def test_village_level_returns_both_tables_once_unlocked(self):
        progress, _ = SqlFrogProgress.objects.get_or_create(student=self.profile)
        progress.completed_level_ids = [lvl["id"] for lvl in ALL_LEVELS if lvl["world"] <= 2]
        progress.save()

        response = self.client.get(self._url("w3_l01"))
        self.assertEqual(response.status_code, 200)
        tables = {s["table"] for s in response.json()["schemas"]}
        self.assertEqual(tables, {"frogs", "ponds"})


class SqlFrogRunViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="sqlfrog_student_run", password="secret123")
        self.profile = StudentProfile.objects.create(
            account=self.user, name="Frog Fan", register_number="SQLFROGR01",
            personal_email="frogfanr@example.com", mobile_number="9999999996",
        )
        self.client.force_login(self.user)

    def _url(self, level_id):
        return reverse("sql-frog-run", args=[level_id])

    def test_empty_query_is_rejected(self):
        response = self.client.post(self._url("w1_l01"), {"query": "  "}, content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_locked_level_403s(self):
        response = self.client.post(self._url("w1_l02"), {"query": "SELECT * FROM frogs;"}, content_type="application/json")
        self.assertEqual(response.status_code, 403)

    @patch("apps.learning.services.judging.judge0_service.Judge0Service.execute_single")
    def test_correct_query_awards_xp_and_coins_exactly_once(self, mocked_execute):
        level = ALL_LEVELS_BY_ID["w1_l01"]
        stdout = "\n".join("|".join(str(c) for c in row) for row in level["expected_result"])
        mocked_execute.return_value = _judge0_result(stdout=stdout)

        response = self.client.post(self._url("w1_l01"), {"query": level["hints"][2]}, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertFalse(data["already_completed"])
        self.assertEqual(data["xp_awarded"], level["xp_reward"])
        self.assertEqual(data["coins_awarded"], level["coin_reward"])
        self.assertEqual(data["total_xp"], level["xp_reward"])

        progress = SqlFrogProgress.objects.get(student=self.profile)
        self.assertIn("w1_l01", progress.completed_level_ids)

        # Replaying an already-completed level must not double-award.
        response2 = self.client.post(self._url("w1_l01"), {"query": level["hints"][2]}, content_type="application/json")
        data2 = response2.json()
        self.assertTrue(data2["success"])
        self.assertTrue(data2["already_completed"])
        self.assertEqual(data2["xp_awarded"], 0)
        self.assertEqual(data2["coins_awarded"], 0)
        progress.refresh_from_db()
        self.assertEqual(progress.xp, level["xp_reward"])

    @patch("apps.learning.services.judging.judge0_service.Judge0Service.execute_single")
    def test_wrong_result_does_not_award_or_unlock_next_level(self, mocked_execute):
        mocked_execute.return_value = _judge0_result(stdout="totally|wrong|output")
        response = self.client.post(self._url("w1_l01"), {"query": "SELECT * FROM frogs;"}, content_type="application/json")
        data = response.json()
        self.assertFalse(data["success"])
        self.assertEqual(data["error_category"], "wrong_result")
        self.assertEqual(data["xp_awarded"], 0)
        progress = SqlFrogProgress.objects.get(student=self.profile)
        self.assertEqual(progress.completed_level_ids, [])

    @patch("apps.learning.services.judging.judge0_service.Judge0Service.execute_single")
    def test_sql_syntax_error_is_reported_as_syntax_error(self, mocked_execute):
        mocked_execute.return_value = _judge0_result(stderr="near \"SELCT\": syntax error", status_id=6, status="Compilation Error")
        response = self.client.post(self._url("w1_l01"), {"query": "SELCT * FROM frogs;"}, content_type="application/json")
        data = response.json()
        self.assertFalse(data["success"])
        self.assertEqual(data["error_category"], "syntax_error")


class SqlFrogHintViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="sqlfrog_student_hint", password="secret123")
        self.profile = StudentProfile.objects.create(
            account=self.user, name="Frog Fan", register_number="SQLFROGH01",
            personal_email="frogfanh@example.com", mobile_number="9999999995",
        )
        self.client.force_login(self.user)

    def _url(self, level_id):
        return reverse("sql-frog-hint", args=[level_id])

    def test_invalid_hint_level_is_rejected(self):
        response = self.client.post(self._url("w1_l01"), {"hint_level": 4}, content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_returns_the_requested_hint_and_records_usage(self):
        level = ALL_LEVELS_BY_ID["w1_l01"]
        response = self.client.post(self._url("w1_l01"), {"hint_level": 2}, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["hint"], level["hints"][1])

        progress = SqlFrogProgress.objects.get(student=self.profile)
        self.assertEqual(progress.hints_used.get("w1_l01"), 2)

    def test_hints_used_tracks_the_max_hint_level_seen(self):
        self.client.post(self._url("w1_l01"), {"hint_level": 1}, content_type="application/json")
        self.client.post(self._url("w1_l01"), {"hint_level": 3}, content_type="application/json")
        self.client.post(self._url("w1_l01"), {"hint_level": 2}, content_type="application/json")
        progress = SqlFrogProgress.objects.get(student=self.profile)
        self.assertEqual(progress.hints_used.get("w1_l01"), 3)


class SqlFrogCosmeticsCatalogTests(SimpleTestCase):
    """Structural checks on the shop catalog itself, mirroring
    SqlFrogLevelContentTests for levels."""

    def test_every_cosmetic_has_a_resolvable_slot(self):
        for item in ALL_COSMETICS:
            self.assertIn(slot_for(item["id"]), ("skin", "accessory"), f"{item['id']} has no resolvable slot")

    def test_default_owned_items_exist_and_are_free(self):
        for item_id in DEFAULT_OWNED:
            self.assertIn(item_id, ALL_COSMETICS_BY_ID)
            self.assertEqual(ALL_COSMETICS_BY_ID[item_id]["cost"], 0)

    def test_every_cosmetic_id_is_unique(self):
        ids = [item["id"] for item in ALL_COSMETICS]
        self.assertEqual(len(ids), len(set(ids)))


class SqlFrogShopViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="sqlfrog_student_shop", password="secret123")
        self.profile = StudentProfile.objects.create(
            account=self.user, name="Frog Fan", register_number="SQLFROGS01",
            personal_email="frogfans@example.com", mobile_number="9999999994",
        )
        self.client.force_login(self.user)

    def test_requires_login(self):
        self.client.logout()
        response = self.client.get(reverse("sql-frog-shop"))
        self.assertEqual(response.status_code, 401)

    def test_default_items_are_owned_from_the_start(self):
        response = self.client.get(reverse("sql-frog-shop"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        owned_ids = {item["id"] for item in data["items"] if item["owned"]}
        self.assertEqual(owned_ids, set(DEFAULT_OWNED))
        self.assertEqual(len(data["items"]), len(ALL_COSMETICS))

    def test_cannot_purchase_without_enough_coins(self):
        progress, _ = SqlFrogProgress.objects.get_or_create(student=self.profile)
        progress.coins = 5
        progress.save()
        response = self.client.post(reverse("sql-frog-shop-purchase"), {"item_id": "skin_gold"}, content_type="application/json")
        self.assertEqual(response.status_code, 400)
        progress.refresh_from_db()
        self.assertEqual(progress.coins, 5)
        self.assertNotIn("skin_gold", progress.owned_cosmetic_ids)

    def test_purchase_deducts_coins_and_grants_xp_bonus(self):
        progress, _ = SqlFrogProgress.objects.get_or_create(student=self.profile)
        progress.coins = 100
        progress.save()

        item = ALL_COSMETICS_BY_ID["skin_blue"]
        response = self.client.post(reverse("sql-frog-shop-purchase"), {"item_id": "skin_blue"}, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["xp_awarded"], PURCHASE_XP_BONUS)

        progress.refresh_from_db()
        self.assertEqual(progress.coins, 100 - item["cost"])
        self.assertEqual(progress.xp, PURCHASE_XP_BONUS)
        self.assertIn("skin_blue", progress.owned_cosmetic_ids)

    def test_cannot_purchase_the_same_item_twice(self):
        progress, _ = SqlFrogProgress.objects.get_or_create(student=self.profile)
        progress.coins = 1000
        progress.save()
        self.client.post(reverse("sql-frog-shop-purchase"), {"item_id": "skin_blue"}, content_type="application/json")
        response = self.client.post(reverse("sql-frog-shop-purchase"), {"item_id": "skin_blue"}, content_type="application/json")
        self.assertEqual(response.status_code, 400)

        progress.refresh_from_db()
        self.assertEqual(progress.xp, PURCHASE_XP_BONUS)  # only awarded once

    def test_cannot_equip_an_item_not_owned(self):
        response = self.client.post(reverse("sql-frog-shop-equip"), {"item_id": "acc_crown"}, content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_equip_after_purchase_updates_the_right_slot(self):
        progress, _ = SqlFrogProgress.objects.get_or_create(student=self.profile)
        progress.coins = 1000
        progress.save()
        self.client.post(reverse("sql-frog-shop-purchase"), {"item_id": "acc_crown"}, content_type="application/json")
        response = self.client.post(reverse("sql-frog-shop-equip"), {"item_id": "acc_crown"}, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["equipped"], {"accessory": "acc_crown"})

        progress.refresh_from_db()
        self.assertEqual(progress.equipped_cosmetics, {"accessory": "acc_crown"})

    def test_progress_endpoint_reports_equipped_cosmetics(self):
        progress, _ = SqlFrogProgress.objects.get_or_create(student=self.profile)
        progress.equipped_cosmetics = {"skin": "skin_red"}
        progress.save()
        response = self.client.get(reverse("sql-frog-progress"))
        self.assertEqual(response.json()["equipped_cosmetics"], {"skin": "skin_red"})
