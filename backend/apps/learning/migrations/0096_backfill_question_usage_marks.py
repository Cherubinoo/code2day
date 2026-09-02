from django.db import migrations


def backfill_marks(apps, schema_editor):
    """One-time backfill: every existing Contest's problems/aptitude questions
    get a QuestionUsageMark for the contest creator, for every batch that
    contest is actually assigned to — so past contests (created before the
    "already used for this batch" tick auto-tagged on creation) show up as
    used too, not just ones built after this migration."""
    Contest = apps.get_model("learning", "Contest")
    QuestionUsageMark = apps.get_model("learning", "QuestionUsageMark")

    new_marks = []
    seen = set()
    for contest in Contest.objects.prefetch_related(
        "problems", "aptitude_questions", "assigned_students"
    ).all():
        if not contest.created_by_id:
            continue
        batches = {
            b for b in contest.assigned_students.values_list("batch", flat=True) if b
        }
        if not batches:
            continue

        if contest.contest_type in ("programming", "combined"):
            for problem in contest.problems.all():
                for batch in batches:
                    key = ("p", contest.created_by_id, batch, problem.id)
                    if key not in seen:
                        seen.add(key)
                        new_marks.append(QuestionUsageMark(
                            staff_id=contest.created_by_id, batch=batch, problem_id=problem.id
                        ))

        if contest.contest_type in ("aptitude", "combined"):
            for question in contest.aptitude_questions.all():
                for batch in batches:
                    key = ("a", contest.created_by_id, batch, question.id)
                    if key not in seen:
                        seen.add(key)
                        new_marks.append(QuestionUsageMark(
                            staff_id=contest.created_by_id, batch=batch, aptitude_question_id=question.id
                        ))

    if new_marks:
        QuestionUsageMark.objects.bulk_create(new_marks, ignore_conflicts=True)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0095_password_reset_otp'),
    ]

    operations = [
        migrations.RunPython(backfill_marks, noop_reverse),
    ]
