"""
Lab Question Allocation Service.

Handles random difficulty-based exercise allocation for lab practicals.

Allocation Rules:
1. Hard Question Rule: If a Hard question is assigned, allocate ONLY 1 Hard question (Total: 1 question).
2. Easy Question Rule: If an Easy question is assigned, pair with 2 Easy questions OR 1 Easy + 1 Medium question (Total: 2 questions).
3. Medium Question Rule: If a Medium question is assigned, pair with 1 Medium + 1 Easy question OR 2 Medium questions (Total: 2 questions).
4. Re-allocation Support: Triggering allocation re-shuffles valid difficulty combinations and overwrites previous allocations.
"""

import logging
import random
from apps.learning.models import LabStudentSession, StudentProfile

logger = logging.getLogger(__name__)


def allocate_lab_questions_for_students(lab):
    """
    Randomly allocates exercises from `lab.exercises` (or `lab.linked_lab.exercises`)
    to each enrolled student in the lab's department, batch, and section, adhering
    strictly to difficulty pairing constraints.

    Re-running this service re-shuffles valid combinations and overwrites previous allocations.

    Returns dict with summary statistics.
    """
    exercises = list(lab.exercises.all())
    if not exercises and lab.linked_lab_id:
        exercises = list(lab.linked_lab.exercises.all())

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

    valid_combos = []

    # Rule 1: HARD -> ONLY 1 Hard question
    for h in hard_pool:
        valid_combos.append([h])

    # Rule 2: EASY -> 2 Easy OR 1 Easy + 1 Medium
    for i in range(len(easy_pool)):
        for j in range(i + 1, len(easy_pool)):
            valid_combos.append([easy_pool[i], easy_pool[j]])
    for e in easy_pool:
        for m in medium_pool:
            valid_combos.append([e, m])

    # Rule 3: MEDIUM -> 1 Medium + 1 Easy OR 2 Mediums
    for i in range(len(medium_pool)):
        for j in range(i + 1, len(medium_pool)):
            valid_combos.append([medium_pool[i], medium_pool[j]])

    # Fallbacks if valid_combos is empty due to non-standard exercise pool
    if not valid_combos:
        if len(exercises) >= 2:
            for i in range(len(exercises)):
                for j in range(i + 1, len(exercises)):
                    valid_combos.append([exercises[i], exercises[j]])
        else:
            valid_combos = [[ex] for ex in exercises]

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

    # Shuffle valid combinations to ensure random distribution across students
    random.shuffle(valid_combos)

    allocated_count = 0
    for idx, student in enumerate(students):
        session, _created = LabStudentSession.objects.get_or_create(lab=lab, student=student)
        chosen_combo = valid_combos[idx % len(valid_combos)]
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
