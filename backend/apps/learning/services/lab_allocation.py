"""
Lab Question Allocation Service.

Handles random difficulty-based exercise allocation for lab practicals.

Difficulty Allocation Rules:
1. Hard Question Rule: If a Hard question is assigned, allocate ONLY 1 Hard question (Total: 1 question).
2. Easy Question Rule: If an Easy question is assigned, pair it with 1 Medium question (Total: 2 questions: 1 Easy + 1 Medium).
3. Medium Question Rule: If Medium questions are assigned without Easy/Hard, pair with 2 Medium questions (Total: 2 questions: 2 Mediums).
4. Fallback: If the pool has an unconventional mix of difficulties, pick a valid distinct subset of exercises.
"""

import logging
import random
from apps.learning.models import LabStudentSession, StudentProfile

logger = logging.getLogger(__name__)


def allocate_lab_questions_for_students(lab):
    """
    Randomly allocates exercises from `lab.exercises` to all enrolled students
    in the lab's department, batch, and section, adhering strictly to difficulty
    pairing constraints.

    Returns dict with summary statistics.
    """
    exercises = list(lab.exercises.all().order_by("order", "created_at"))
    if not exercises and lab.linked_lab_id:
        exercises = list(lab.linked_lab.exercises.all().order_by("order", "created_at"))

    if not exercises:
        return {
            "allocated_count": 0,
            "total_students": 0,
            "total_exercises_pool": 0,
            "detail": "No exercises found in lab.",
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

    # Build valid combination sets according to difficulty rules
    valid_combos = []

    # Rule 1: Single Hard Question (ONLY 1 Hard question allocated)
    for h in hard_pool:
        valid_combos.append([h])

    # Rule 2: 1 Easy + 1 Medium
    for e in easy_pool:
        for m in medium_pool:
            valid_combos.append([e, m])

    # Rule 3: 2 Mediums
    for i in range(len(medium_pool)):
        for j in range(i + 1, len(medium_pool)):
            valid_combos.append([medium_pool[i], medium_pool[j]])

    # Fallbacks if valid_combos is empty due to non-standard difficulty mix
    if not valid_combos:
        # Fallback 1: Any 2 distinct exercises of different difficulty
        for i in range(len(exercises)):
            for j in range(i + 1, len(exercises)):
                if exercises[i].difficulty != exercises[j].difficulty:
                    valid_combos.append([exercises[i], exercises[j]])

        # Fallback 2: Any 2 distinct exercises
        if not valid_combos:
            for i in range(len(exercises)):
                for j in range(i + 1, len(exercises)):
                    valid_combos.append([exercises[i], exercises[j]])

        # Fallback 3: Single exercises
        if not valid_combos:
            valid_combos = [[ex] for ex in exercises]

    student_qs = StudentProfile.objects.filter(department=lab.department, batch=lab.batch)
    if lab.section:
        student_qs = student_qs.filter(section=lab.section)
    students = list(student_qs.order_by("register_number", "name"))

    allocated_count = 0
    combo_index = 0

    # Shuffle valid_combos to ensure random distribution
    random.shuffle(valid_combos)

    for student in students:
        session, _created = LabStudentSession.objects.get_or_create(lab=lab, student=student)
        chosen_combo = valid_combos[combo_index % len(valid_combos)]
        combo_index += 1
        session.allocated_exercises.set(chosen_combo)
        allocated_count += 1

    return {
        "allocated_count": allocated_count,
        "total_students": len(students),
        "total_exercises_pool": len(exercises),
        "combos_available": len(valid_combos),
        "easy_count": len(easy_pool),
        "medium_count": len(medium_pool),
        "hard_count": len(hard_pool),
    }
