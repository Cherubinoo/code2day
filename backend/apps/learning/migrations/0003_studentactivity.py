from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("learning", "0002_studentprofile_account_studentprofile_date_of_birth_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="StudentActivity",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("activity_date", models.DateField()),
                ("activity_type", models.CharField(choices=[("login", "Login"), ("solve", "Solve"), ("practice", "Practice")], default="practice", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="activity_logs", to="learning.studentprofile")),
            ],
            options={
                "ordering": ("activity_date", "created_at"),
            },
        ),
        migrations.AddConstraint(
            model_name="studentactivity",
            constraint=models.UniqueConstraint(fields=("student", "activity_date", "activity_type"), name="unique_student_daily_activity_type"),
        ),
    ]
