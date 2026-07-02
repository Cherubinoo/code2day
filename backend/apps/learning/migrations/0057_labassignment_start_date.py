from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0056_lab_assignments'),
    ]

    operations = [
        migrations.AddField(
            model_name='labassignment',
            name='start_date',
            field=models.DateTimeField(blank=True, null=True, help_text='When the lab opens for students'),
        ),
    ]
