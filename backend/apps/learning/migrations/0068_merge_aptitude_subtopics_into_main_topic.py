from django.db import migrations


def merge_subtopics_into_parent(apps, schema_editor):
    """Aptitude topics were a 3-level tree (Category > Main Topic > Sub-topic),
    but every admin workflow (bulk upload, add/edit question, the topic
    manager UI) only ever files questions on the Main Topic node — the
    Sub-topic level was a dead end nothing wrote to. Any student who
    drilled into one saw "No Questions Found" even though the parent main
    topic had plenty. Collapse to Category > Main Topic: move every
    question on a Sub-topic up to its parent, then remove the Sub-topic."""
    AptitudeTopic = apps.get_model('learning', 'AptitudeTopic')
    AptitudeQuestion = apps.get_model('learning', 'AptitudeQuestion')

    level3_ids = list(
        AptitudeTopic.objects.filter(parent__isnull=False, parent__parent__isnull=False)
        .values_list('id', 'parent_id')
    )
    for topic_id, parent_id in level3_ids:
        AptitudeQuestion.objects.filter(topic_id=topic_id).update(topic_id=parent_id)
    AptitudeTopic.objects.filter(id__in=[tid for tid, _ in level3_ids]).delete()


def noop_reverse(apps, schema_editor):
    # Not reversible — once merged, which questions originally came from
    # which sub-topic is no longer recorded anywhere.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0067_aptitudeattempt'),
    ]

    operations = [
        migrations.RunPython(merge_subtopics_into_parent, noop_reverse),
    ]
