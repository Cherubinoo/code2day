from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0050_add_mentor_class_advisor'),
    ]

    operations = [
        # Add section to StudentProfile
        migrations.AddField(
            model_name='studentprofile',
            name='section',
            field=models.CharField(blank=True, default='', max_length=5),
        ),
        # Add section to DiscussionMessage
        migrations.AddField(
            model_name='discussionmessage',
            name='section',
            field=models.CharField(blank=True, default='', max_length=5),
        ),
        # Update thread_type choices to include section and mentor_group
        migrations.AlterField(
            model_name='discussionmessage',
            name='thread_type',
            field=models.CharField(
                choices=[
                    ('general', 'General Discussion'),
                    ('individual', 'Direct Message'),
                    ('batch', 'Batch Discussion'),
                    ('section', 'Section Discussion'),
                    ('mentor_group', 'Mentor Group Chat'),
                    ('staff', 'Staff Room'),
                    ('hod_tp_ja', 'HOD / TPU / JA / TPO Panel'),
                    ('problem', 'Problem Specific'),
                ],
                default='general',
                max_length=20,
            ),
        ),
    ]
