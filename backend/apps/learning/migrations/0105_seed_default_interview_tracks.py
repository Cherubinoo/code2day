# Seeds the 5 Interview Practice tracks that Department.default_interview_track()
# already assumes exist (civil/mech/eee/ece/cs_common) — without these rows,
# every department resolves to a track with no content until an admin
# happens to notice and hand-create it.

from django.db import migrations

DEFAULT_TRACKS = [
    ("civil", "Civil Engineering"),
    ("mech", "Mechanical Engineering"),
    ("eee", "Electrical & Electronics Engineering (EEE)"),
    ("ece", "Electronics & Communication Engineering (ECE)"),
    ("cs_common", "Computer Science / Common"),
]


def seed_default_tracks(apps, schema_editor):
    InterviewTrack = apps.get_model('learning', 'InterviewTrack')
    for key, name in DEFAULT_TRACKS:
        InterviewTrack.objects.get_or_create(key=key, defaults={"name": name})


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0104_interviewfoldermedia'),
    ]

    operations = [
        migrations.RunPython(seed_default_tracks, migrations.RunPython.noop),
    ]
