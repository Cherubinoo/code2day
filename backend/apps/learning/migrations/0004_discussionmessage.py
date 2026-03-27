from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("learning", "0003_studentactivity"),
    ]

    operations = [
        migrations.CreateModel(
            name="DiscussionMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("body", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("problem", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="discussion_messages", to="learning.problem")),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="discussion_messages", to="learning.studentprofile")),
            ],
            options={
                "ordering": ("-created_at",),
            },
        ),
    ]
