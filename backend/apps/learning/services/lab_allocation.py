"""
Lab Question Allocation Service.

Handles difficulty-balanced exercise allocation for lab practicals.

Allocation Rules:
1. Hard Allocation Rule: 1 Hard question alone (Total: 1 question).
2. Mixed Allocation Rule: 1 Easy + 1 Medium question (Total: 2 questions).
3. Easy Allocation Rule: 2 Easy questions (Total: 2 questions).
4. Category Interleaving: Hard, Mixed (Easy+Medium), and Easy combinations are interleaved round-robin so every lab allocation features a balanced mix of Hard, Medium, and Easy questions across enrolled students.
5. Single-Difficulty / Fallback Randomization: If the lab pool has only Medium (or non-standard) exercises, questions are randomly paired and shuffled so no single question dominates the roster.
6. Re-allocation Support: Re-running this service re-shuffles all pools and overwrites previous student allocations.
"""

import logging
import random
from apps.learning.models import LabStudentSession, StudentProfile

logger = logging.getLogger(__name__)


def allocate_lab_questions_for_students(lab):
    """
    Allocates exercises from `lab.exercises` (or `lab.linked_lab.exercises`)
    to each enrolled student in the lab's department, batch, and section.

    Difficulty categories (Hard, Mixed Easy+Medium, 2-Easy) are shuffled independently
    and interleaved round-robin so that every class allocation features a balanced,
    fair distribution of Hard, Medium, and Easy questions across students.

    Returns dict with summary statistics.
    """
    # Use ONLY the exercises that were explicitly added or selected for this lab
    exercises = list(lab.exercises.all())

    # Fallback to linked_lab ONLY if not a university lab and lab.exercises is empty
    if not exercises and lab.linked_lab_id and getattr(lab, "lab_type", "") != "university":
        exercises = list(lab.linked_lab.exercises.all())

    if not exercises:
        return {
            "allocated_count": 0,
            "total_students": 0,
            "total_exercises_pool": 0,
            "detail": "No selected exercises found in lab. Please select exercises before allocating.",
        }

    # Group exercises by difficulty (case-insensitive)
    easy_pool = []
    medium_pool = []
    hard_pool = []
    other_pool = []

    for ex in exercises:
        diff = (ex.difficulty or "").strip().lower()
        if diff == "easy":
            easy_pool.append(ex)
        elif diff == "medium":
            medium_pool.append(ex)
        elif diff == "hard":
            hard_pool.append(ex)
        else:
            other_pool.append(ex)

    # If exercise pool lacks explicit Easy or Hard tags (e.g., all exercises are tagged Medium),
    # auto-stratify the pool into 3 tiers (Easy, Medium, Hard) so every lab allocation is guaranteed
    # to feature Hard (1 question), Mixed (1 Easy + 1 Medium), and Easy (2 Easy) combos!
    if (not easy_pool or not hard_pool or not medium_pool) and len(exercises) >= 2:
        sorted_all = list(exercises)
        sorted_all.sort(key=lambda x: (x.order if x.order is not None else 999, x.id))
        total = len(sorted_all)
        if total >= 3:
            chunk = max(1, total // 3)
            easy_pool = sorted_all[:chunk]
            hard_pool = sorted_all[-chunk:]
            medium_pool = sorted_all[chunk:-chunk]
            if not medium_pool:
                medium_pool = sorted_all
        elif total == 2:
            easy_pool = [sorted_all[0]]
            hard_pool = [sorted_all[1]]
            medium_pool = [sorted_all[0]]

        # Persist updated difficulty level choices (Easy, Medium, Hard) on exercises
        for ex in easy_pool:
            if ex.difficulty != "Easy":
                ex.difficulty = "Easy"
                ex.save(update_fields=["difficulty"])
        for ex in medium_pool:
            if ex.difficulty != "Medium":
                ex.difficulty = "Medium"
                ex.save(update_fields=["difficulty"])
        for ex in hard_pool:
            if ex.difficulty != "Hard":
                ex.difficulty = "Hard"
                ex.save(update_fields=["difficulty"])

    # Shuffle each difficulty pool independently
    random.shuffle(easy_pool)
    random.shuffle(medium_pool)
    random.shuffle(hard_pool)
    random.shuffle(other_pool)

    # 1. HARD COMBOS: 1 Hard question alone
    hard_combos = [[h] for h in hard_pool]
    random.shuffle(hard_combos)

    # 2. MIXED COMBOS: 1 Easy + 1 Medium
    mixed_combos = []
    for e in easy_pool:
        for m in medium_pool:
            mixed_combos.append([e, m])
    random.shuffle(mixed_combos)

    # 3. EASY COMBOS: 2 Easy questions
    easy_combos = []
    for i in range(len(easy_pool)):
        for j in range(i + 1, len(easy_pool)):
            easy_combos.append([easy_pool[i], easy_pool[j]])
    random.shuffle(easy_combos)

    # Collect available non-empty difficulty category lists
    category_lists = [c for c in [hard_combos, mixed_combos, easy_combos] if c]

    master_combos = []
    if category_lists:
        max_cat_len = max(len(c) for c in category_lists)
        for i in range(max_cat_len):
            for c in category_lists:
                master_combos.append(c[i % len(c)])

    # Fallbacks if master_combos is empty (e.g. exercise pool contains only Medium questions)
    if not master_combos:
        shuffled_all = list(exercises)
        random.shuffle(shuffled_all)
        if len(shuffled_all) >= 2:
            # Create distinct pairs randomly without duplicating Q1 across all students
            for i in range(len(shuffled_all)):
                j = (i + 1) % len(shuffled_all)
                master_combos.append([shuffled_all[i], shuffled_all[j]])
        else:
            master_combos = [[ex] for ex in exercises]

    # Always shuffle master_combos for maximum randomness before assigning to students
    random.shuffle(master_combos)

    student_qs = StudentProfile.objects.filter(department=lab.department, batch=lab.batch)
    if lab.section:
        student_qs = student_qs.filter(section=lab.section)
    students = list(student_qs.order_by("register_number", "name"))

    if not students:
        return {
            "allocated_count": 0,
            "total_students": 0,
            "total_exercises_pool": len(exercises),
            "detail": "No enrolled students found in lab section.",
        }

    allocated_count = 0
    for idx, student in enumerate(students):
        session, _created = LabStudentSession.objects.get_or_create(lab=lab, student=student)
        chosen_combo = master_combos[idx % len(master_combos)]
        session.allocated_exercises.set(chosen_combo)
        allocated_count += 1

    # Ensure lab is published so students can see it in their student lab list
    if not lab.is_published:
        lab.is_published = True
        lab.save(update_fields=["is_published"])

    return {
        "allocated_count": allocated_count,
        "total_students": len(students),
        "total_exercises_pool": len(exercises),
        "combos_available": len(master_combos),
        "easy_count": len(easy_pool),
        "medium_count": len(medium_pool),
        "hard_count": len(hard_pool),
    }
