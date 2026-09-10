from django.db import models
from django.contrib.auth.models import User

class CommunicationAssessment(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE
    )
    grammar_score = models.FloatField()
    fluency_score = models.FloatField()
    confidence_score = models.FloatField()
    vocabulary_score = models.FloatField()
    overall_score = models.FloatField()
    strengths = models.JSONField(default=list)
    weaknesses = models.JSONField(default=list)
    recommendations = models.JSONField(default=list)
    reasoning = models.TextField(blank=True, default='')
    assessment_type = models.CharField(default='general', max_length=50)
    assessment_date = models.DateTimeField(
        auto_now_add=True
    )

class CommunicationDailyActivity(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE
    )
    date = models.DateField()
    has_visited = models.BooleanField(default=True)
    has_completed_challenge = models.BooleanField(default=False)

    class Meta:
        unique_together = ('user', 'date')

class SpeakingSession(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE
    )
    audio_file = models.FileField(
        upload_to="speaking/"
    )
    transcript = models.TextField()
    score = models.FloatField()
    feedback = models.TextField()
    reasoning = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(
        auto_now_add=True
    )

class LanguageProgress(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE
    )
    language = models.CharField(
        max_length=50
    )
    level = models.CharField(
        max_length=50
    )
    score = models.FloatField(
        default=0
    )
    lessons_completed = models.IntegerField(
        default=0
    )

from django.db.models.signals import post_delete, pre_save
from django.dispatch import receiver
import os

@receiver(post_delete, sender=SpeakingSession)
def auto_delete_speaking_file_on_delete(sender, instance, **kwargs):
    if instance.audio_file:
        try:
            if os.path.isfile(instance.audio_file.path):
                os.remove(instance.audio_file.path)
        except Exception:
            pass

@receiver(pre_save, sender=SpeakingSession)
def auto_delete_speaking_file_on_change(sender, instance, **kwargs):
    if not instance.pk:
        return False
    try:
        old_file = SpeakingSession.objects.get(pk=instance.pk).audio_file
    except SpeakingSession.DoesNotExist:
        return False
    new_file = instance.audio_file
    if not old_file == new_file:
        try:
            if old_file and os.path.isfile(old_file.path):
                os.remove(old_file.path)
        except Exception:
            pass
