from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("learning", "0052_batchadvisor_section"),
    ]

    operations = [
        migrations.AddField(
            model_name="problem",
            name="execution_type",
            field=models.CharField(
                choices=[
                    ("auto", "Auto-detect from code"),
                    ("stdin", "Standard Input / Output"),
                    ("function", "Function-Based"),
                    ("class", "Class / Object-Based"),
                    ("interactive", "Interactive"),
                ],
                default="auto",
                help_text="How test-case input is passed to the solution.",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="problem",
            name="function_name",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Explicit function/method name to call.",
                max_length=100,
            ),
        ),
    ]
