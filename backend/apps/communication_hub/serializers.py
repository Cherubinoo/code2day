from rest_framework import serializers
from .models import CommunicationAssessment, SpeakingSession, LanguageProgress

class CommunicationAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommunicationAssessment
        fields = '__all__'
        read_only_fields = ('user', 'assessment_date')

class SpeakingSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpeakingSession
        fields = '__all__'
        read_only_fields = ('user', 'created_at')

class LanguageProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = LanguageProgress
        fields = '__all__'
        read_only_fields = ('user',)
