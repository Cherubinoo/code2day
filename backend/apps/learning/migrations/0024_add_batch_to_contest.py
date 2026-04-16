# Generated migration for adding batch assignment to contests

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0023_add_staff_is_active_field'),
    ]

    operations = [
        migrations.AddField(
            model_name='contest',
            name='assigned_batches',
            field=models.JSONField(default=list, blank=True, help_text="List of batch codes assigned to this contest"),
        ),
        migrations.AddField(
            model_name='contest',
            name='assigned_students',
            field=models.ManyToManyField(
                to='learning.StudentProfile',
                related_name='assigned_contests',
                blank=True,
                help_text="Specific students assigned to this contest"
            ),
        ),
    ]
