import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0005_executionrecord'),
    ]

    operations = [
        migrations.CreateModel(
            name='TestCase',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('stdin', models.TextField(blank=True, default='')),
                ('expected_output', models.TextField()),
                ('is_sample', models.BooleanField(default=False)),
                ('order', models.PositiveIntegerField(default=0)),
                ('problem', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='test_cases', to='learning.problem')),
            ],
            options={
                'ordering': ('order',),
            },
        ),
        migrations.CreateModel(
            name='ProblemSolution',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('language', models.CharField(max_length=40)),
                ('language_id', models.PositiveIntegerField()),
                ('source_code', models.TextField()),
                ('status', models.CharField(default='Attempted', max_length=40)),
                ('passed_cases', models.PositiveIntegerField(default=0)),
                ('total_cases', models.PositiveIntegerField(default=0)),
                ('execution_time', models.CharField(blank=True, default='', max_length=40)),
                ('memory', models.CharField(blank=True, default='', max_length=40)),
                ('submitted_at', models.DateTimeField(auto_now_add=True)),
                ('problem', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='solutions', to='learning.problem')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='solutions', to='learning.studentprofile')),
            ],
            options={
                'ordering': ('-submitted_at',),
            },
        ),
    ]
