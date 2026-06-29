from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0049_add_logo_file_field'),
    ]

    operations = [
        # Add mentor FK on StudentProfile → StaffProfile
        migrations.AddField(
            model_name='studentprofile',
            name='mentor',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='mentees',
                to='learning.staffprofile',
                help_text='Staff assigned as mentor for this student',
            ),
        ),
        # New model: BatchAdvisor — assigns a class advisor (staff) to a batch in a department
        migrations.CreateModel(
            name='BatchAdvisor',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('batch', models.CharField(max_length=20, help_text='Batch name e.g. 23-27')),
                ('department', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='batch_advisors',
                    to='learning.department',
                )),
                ('advisor', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='advised_batches',
                    to='learning.staffprofile',
                    help_text='Staff member who is the class advisor for this batch',
                )),
                ('assigned_at', models.DateTimeField(auto_now_add=True)),
                ('assigned_by', models.ForeignKey(
                    null=True,
                    blank=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='batch_advisor_assignments',
                    to='learning.staffprofile',
                )),
            ],
            options={
                'db_table': 'batch_advisors',
                'constraints': [
                    models.UniqueConstraint(
                        fields=['batch', 'department'],
                        name='unique_batch_department_advisor',
                    ),
                ],
            },
        ),
    ]
