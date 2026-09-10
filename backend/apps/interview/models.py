from django.db import models
from django.contrib.auth.models import User

class InterviewSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    interview_type = models.CharField(max_length=100)
    score = models.FloatField(blank=True, null=True)
    feedback = models.TextField(blank=True, null=True)
    reasoning = models.TextField(blank=True, default='')
    is_completed = models.BooleanField(default=False)
    current_question_index = models.IntegerField(default=1)
    max_questions = models.IntegerField(default=5)
    job_description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Session {self.id} — {self.interview_type} (User: {self.user.username})"

class InterviewHistory(models.Model):
    session = models.ForeignKey(InterviewSession, on_delete=models.CASCADE, related_name='history')
    question = models.TextField()
    answer = models.TextField(blank=True, default='')
    score = models.FloatField(blank=True, null=True)
    feedback = models.TextField(blank=True, null=True)
    model_answer = models.TextField(blank=True, default='')
    reasoning = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"History {self.id} — Session {self.session.id}"


class SessionDeletionRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    SESSION_TYPES = [
        ('interview', 'Interview Session'),
        ('conversation', 'Conversation Session'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='deletion_requests')
    session_type = models.CharField(max_length=20, choices=SESSION_TYPES)
    session_id = models.IntegerField()
    session_info = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_note = models.TextField(blank=True, default='')

    def __str__(self):
        return f"DeletionRequest #{self.id} — {self.session_type} session {self.session_id} ({self.status})"