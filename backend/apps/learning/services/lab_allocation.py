"""
Lab Question Allocation Service.

Handles single-question allocation for lab practicals.

Allocation Rules:
1. Exactly 1 Question Rule: Every enrolled student gets allocated EXACTLY 1 question from the lab's exercise pool.
2. Re-allocation Support: Triggering allocation re-shuffles the exercise pool and re-assigns 1 question per student, replacing previous allocations.
3. Even Distribution: Exercises are distributed evenly round-robin across enrolled students.
"""

import logging
import random
from apps.learning.models import LabStudentSession, StudentProfile

logger = logging.getLogger(__name__)


def allocate_lab_questions_for_students(lab):
    """
    Randomly allocates EXACTLY 1 exercise from `lab.exercises` (or `lab.linked_lab.exercises`)
    to each enrolled student in the lab's department, batch, and section.

    Re-running this service re-shuffles the exercise pool and overwrites previous allocations
    so that every student receives a fresh 1-question allocation.

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
            "questions_per_student": 1,
            "detail": "No exercises found in lab.",
        }

    student_qs = StudentProfile.objects.filter(department=lab.department, batch=lab.batch)
    if lab.section:
        student_qs = student_qs.filter(section=lab.section)
    students = list(student_qs.order_by("register_number", "name"))

    if not students:
        return {
            "allocated_count": 0,
            "total_students": 0,
            "total_exercises_pool": len(exercises),
            "questions_per_student": 1,
            "detail": "No enrolled students found in lab section.",
        }

    # Shuffle exercise pool to ensure random & even distribution across students
    shuffled_exercises = list(exercises)
    random.shuffle(shuffled_exercises)

    allocated_count = 0
    for idx, student in enumerate(students):
        session, _created = LabStudentSession.objects.get_or_create(lab=lab, student=student)
        # Allocate exactly 1 question for this student using round-robin over shuffled exercise pool
        chosen_exercise = shuffled_exercises[idx % len(shuffled_exercises)]
        session.allocated_exercises.set([chosen_exercise])
        allocated_count += 1

    return {
        "allocated_count": allocated_count,
        "total_students": len(students),
        "total_exercises_pool": len(exercises),
        "questions_per_student": 1,
    }
