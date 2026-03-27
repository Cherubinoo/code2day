from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="StudentProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("title", models.CharField(max_length=180)),
                ("current_streak", models.PositiveIntegerField(default=0)),
                ("login_days", models.PositiveIntegerField(default=0)),
                ("campus_rank", models.CharField(default="Campus Rank #1", max_length=60)),
            ],
        ),
        migrations.CreateModel(
            name="Problem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=160)),
                ("slug", models.SlugField(unique=True)),
                ("description", models.TextField()),
                ("difficulty", models.CharField(choices=[("Easy", "Easy"), ("Medium", "Medium"), ("Hard", "Hard")], max_length=10)),
                ("tags", models.JSONField(blank=True, default=list)),
                ("is_daily", models.BooleanField(default=False)),
            ],
        ),
        migrations.CreateModel(
            name="Submission",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("language", models.CharField(default="javascript", max_length=40)),
                ("status", models.CharField(default="Accepted", max_length=20)),
                ("submitted_at", models.DateTimeField(auto_now_add=True)),
                ("problem", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="submissions", to="learning.problem")),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="submissions", to="learning.studentprofile")),
            ],
        ),
    ]