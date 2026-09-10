from rest_framework import serializers
from .models import InterviewSession, InterviewHistory

class InterviewHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewHistory
        fields = ['id', 'question', 'answer', 'score', 'feedback', 'model_answer', 'reasoning', 'created_at']

class InterviewSessionSerializer(serializers.ModelSerializer):
    history = InterviewHistorySerializer(many=True, read_only=True)
    
    class Meta:
        model = InterviewSession
        fields = [
            'id', 'interview_type', 'score', 'feedback', 'reasoning',
            'is_completed', 'current_question_index', 
            'max_questions', 'job_description', 'created_at', 'history'
        ]
