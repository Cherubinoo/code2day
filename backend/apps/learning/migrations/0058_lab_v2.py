from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("learning", "0057_labassignment_start_date"),
    ]

    operations = [
        migrations.CreateModel(
            name="Lab",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=200)),
                ("batch", models.CharField(max_length=20)),
                ("section", models.CharField(blank=True, default="", max_length=10)),
                ("start_date", models.DateTimeField()),
                ("end_date", models.DateTimeField()),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("department", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="labs", to="learning.department")),
                ("staff_in_charge", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="managed_labs", to="learning.staffprofile")),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_labs", to="learning.staffprofile")),
            ],
            options={"db_table": "labs", "ordering": ("-created_at",)},
        ),
        migrations.CreateModel(
            name="LabExercise",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200)),
                ("description", models.TextField(blank=True, default="")),
                ("order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("lab", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="exercises", to="learning.lab")),
                ("added_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="added_exercises", to="learning.staffprofile")),
            ],
            options={"db_table": "lab_exercises", "ordering": ("order", "created_at")},
        ),
        migrations.CreateModel(
            name="LabExerciseSubmission",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.TextField(blank=True, default="")),
                ("language", models.CharField(blank=True, default="", max_length=50)),
                ("submitted_at", models.DateTimeField(auto_now=True)),
                ("exercise", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="submissions", to="learning.labexercise")),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="exercise_submissions", to="learning.studentprofile")),
            ],
            options={"db_table": "lab_exercise_submissions", "ordering": ("-submitted_at",)},
        ),
        migrations.AddConstraint(
            model_name="labexercisesubmission",
            constraint=models.UniqueConstraint(fields=["exercise", "student"], name="unique_exercise_student"),
        ),
    ]
