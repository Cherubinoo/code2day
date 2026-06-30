from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("learning", "0051_section_and_chat_types"),
    ]

    operations = [
        migrations.AddField(
            model_name="batchadvisor",
            name="section",
            field=models.CharField(blank=True, default="", max_length=5, help_text="Section A/B/C etc."),
        ),
        migrations.RemoveConstraint(
            model_name="batchadvisor",
            name="unique_batch_department_advisor",
        ),
        migrations.AddConstraint(
            model_name="batchadvisor",
            constraint=models.UniqueConstraint(
                fields=["batch", "section", "department"],
                name="unique_batch_section_department_advisor",
            ),
        ),
    ]
