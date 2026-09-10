import os
import json
import datetime
import logging
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import CommunicationAssessment, SpeakingSession, LanguageProgress, CommunicationDailyActivity
from .serializers import (
    CommunicationAssessmentSerializer,
    SpeakingSessionSerializer,
    LanguageProgressSerializer
)
from .services.communication_agent import CommunicationAgent
from core.groq_client import get_groq_client, generate_completion, get_model_for_task

logger = logging.getLogger(__name__)

# Instantiate the service agent
agent = CommunicationAgent()

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def analyze_speaking(request):
    if "audio_file" not in request.FILES:
        return Response(
            {"detail": "No audio file uploaded. Use 'audio_file' as the parameter key."},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    audio_file = request.FILES["audio_file"]
    if audio_file.size == 0:
        return Response(
            {"detail": "Uploaded audio file is empty (0 bytes)."},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    name = audio_file.name.lower()
    if not (name.endswith(".wav") or name.endswith(".mp3") or name.endswith(".m4a") or name.endswith(".webm") or name.endswith(".ogg") or name.endswith(".bin")):
        return Response(
            {"detail": "Unsupported audio format. Please upload WAV, MP3, M4A, WEBM, or OGG."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        result = agent.analyze_speaking(request.user, audio_file)
        return Response(result, status=status.HTTP_201_CREATED)
    except Exception as e:
        return Response(
            {"detail": f"Error analyzing speaking audio: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def analyze_communication(request):
    text = request.data.get("text")
    context = request.data.get("context", "general")
    
    if not text:
        return Response(
            {"detail": "Parameter 'text' is required in request body."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        assessment = agent.evaluate_communication(
            user=request.user,
            text=text,
            context=context,
            assessment_type="writing"
        )
        
        narrative_feedback = agent.generate_feedback({
            "grammar_score": assessment.grammar_score,
            "fluency_score": assessment.fluency_score,
            "confidence_score": assessment.confidence_score,
            "vocabulary_score": assessment.vocabulary_score,
            "overall_score": assessment.overall_score,
            "strengths": assessment.strengths,
            "weaknesses": assessment.weaknesses,
            "recommendations": assessment.recommendations
        })

        serializer = CommunicationAssessmentSerializer(assessment)
        data = serializer.data
        data["feedback_narrative"] = narrative_feedback

        return Response(data, status=status.HTTP_200_OK)
    except Exception as e:
        return Response(
            {"detail": f"Error evaluating communication text: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def language_practice(request):
    action = request.data.get("action", "generate_tasks")
    language = request.data.get("language")
    level = request.data.get("level", "Beginner")
    
    if not language:
        return Response(
            {"detail": "Parameter 'language' is required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if action == "generate_tasks":
        try:
            tasks = agent.generate_practice_tasks(language, level)
            return Response({"tasks": tasks}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {"detail": f"Error generating tasks: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
            
    elif action == "chat":
        message = request.data.get("message")
        chat_history = request.data.get("chat_history", [])
        scenario = request.data.get("scenario", "General Conversation")
        
        if not message:
            return Response(
                {"detail": "Parameter 'message' is required for chat action."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        try:
            reply = agent.chat_practice(language, level, message, chat_history, scenario=scenario)
            
            progress, created = LanguageProgress.objects.get_or_create(
                user=request.user,
                language=language,
                level=level,
                defaults={"score": 70.0, "lessons_completed": 0}
            )
            progress.lessons_completed += 1
            corrections = reply.get("corrections", [])
            if corrections:
                progress.score = max(50.0, progress.score - 1.5)
            else:
                progress.score = min(100.0, progress.score + 1.0)
            progress.save()

            reply["language_progress"] = LanguageProgressSerializer(progress).data
            return Response(reply, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {"detail": f"Error in chat practice partner session: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    else:
        return Response(
            {"detail": f"Unsupported action '{action}'. Use 'generate_tasks' or 'chat'."},
            status=status.HTTP_400_BAD_REQUEST
        )

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_analytics(request):
    try:
        user = request.user
        
        latest_assessment = CommunicationAssessment.objects.filter(user=user).order_by("-assessment_date").first()
        latest_data = None
        if latest_assessment:
            latest_data = CommunicationAssessmentSerializer(latest_assessment).data
            latest_data["feedback_narrative"] = agent.generate_feedback(latest_data)

        history = []
        assessments = CommunicationAssessment.objects.filter(user=user).order_by("assessment_date")
        for item in assessments:
            history.append({
                "id": item.id,
                "date": item.assessment_date.strftime("%Y-%m-%d"),
                "grammar_score": item.grammar_score,
                "fluency_score": item.fluency_score,
                "confidence_score": item.confidence_score,
                "vocabulary_score": item.vocabulary_score,
                "overall_score": item.overall_score,
                "type": item.assessment_type
            })

        sessions = SpeakingSession.objects.filter(user=user).order_by("-created_at")
        sessions_data = SpeakingSessionSerializer(sessions, many=True).data

        progress = LanguageProgress.objects.filter(user=user).order_by("language")
        progress_data = LanguageProgressSerializer(progress, many=True).data

        return Response({
            "latest_assessment": latest_data,
            "history": history,
            "speaking_sessions": sessions_data,
            "language_progress": progress_data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response(
            {"detail": f"Error fetching analytics data: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

DAILY_CHALLENGES = [
    {
        "id": 1,
        "day_number": "Day 1",
        "title": "Believe in Yourself",
        "text": "Believe in yourself and all that you are. Know that there is something inside you that is greater than any obstacle. Stand tall, speak clearly, and trust your journey.",
        "difficulty": "Medium",
        "tips": "Focus on speaking slowly and breathing at punctuation marks.",
    },
    {
        "id": 2,
        "day_number": "Day 2",
        "title": "Speak with Confidence",
        "text": "Confidence comes from preparation and practice. Speak with conviction, let your voice carry your value, and express your thoughts with clarity.",
        "difficulty": "Easy",
        "tips": "Project your voice slightly louder than usual.",
    },
    {
        "id": 3,
        "day_number": "Day 3",
        "title": "The Power of Pausing",
        "text": "The right word may be effective, but a rightly-timed pause creates impact. Control your tempo; rushing is the enemy of clear speech.",
        "difficulty": "Medium",
        "tips": "Add a clear 1-second pause after punctuation.",
    }
]

import zoneinfo
from django.utils import timezone

def get_user_local_date(request):
    user_tz_str = request.META.get('HTTP_X_USER_TIMEZONE', 'UTC')
    try:
        user_tz = zoneinfo.ZoneInfo(user_tz_str)
    except Exception:
        user_tz = zoneinfo.ZoneInfo('UTC')
    return timezone.now().astimezone(user_tz).date()

def get_daily_challenge_for_date(date_obj, user=None):
    days_since_epoch = date_obj.toordinal()
    idx = days_since_epoch % len(DAILY_CHALLENGES)
    challenge = DAILY_CHALLENGES[idx].copy()
    challenge["id"] = days_since_epoch
    challenge["day_number"] = f"Day {days_since_epoch - 739000}"
    return challenge

def calculate_streak(user, today):
    activities = set(
        CommunicationDailyActivity.objects.filter(
            user=user,
            has_visited=True
        ).values_list("date", flat=True)
    )
    if not activities:
        return 0
    streak = 0
    current_date = today
    if current_date not in activities:
        current_date = today - datetime.timedelta(days=1)
        if current_date not in activities:
            return 0
    while current_date in activities:
        streak += 1
        current_date -= datetime.timedelta(days=1)
    return streak

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def log_visit(request):
    try:
        user = request.user
        today = get_user_local_date(request)
        activity, created = CommunicationDailyActivity.objects.get_or_create(
            user=user,
            date=today,
            defaults={"has_visited": True, "has_completed_challenge": False}
        )
        if not created and not activity.has_visited:
            activity.has_visited = True
            activity.save()
        start_date = today - datetime.timedelta(days=90)
        activities = CommunicationDailyActivity.objects.filter(
            user=user,
            date__gte=start_date
        ).order_by("date")
        history = [{"date": act.date.strftime("%Y-%m-%d"), "has_visited": act.has_visited, "has_completed_challenge": act.has_completed_challenge} for act in activities]
        streak = calculate_streak(user, today)
        return Response({"success": True, "today": today.strftime("%Y-%m-%d"), "streak": streak, "activity_history": history}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"detail": f"Error logging visit: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_daily_challenge(request):
    try:
        user = request.user
        today = get_user_local_date(request)
        challenge = get_daily_challenge_for_date(today, user=request.user)
        activity = CommunicationDailyActivity.objects.filter(user=user, date=today).first()
        completed = activity.has_completed_challenge if activity else False
        streak = calculate_streak(user, today)
        return Response({"challenge": challenge, "completed": completed, "xp": 100, "streak": streak}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"detail": f"Error fetching daily challenge: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_daily_challenge(request):
    if "audio_file" not in request.FILES:
        return Response({"detail": "No audio file uploaded."}, status=status.HTTP_400_BAD_REQUEST)
    audio_file = request.FILES["audio_file"]
    if audio_file.size == 0:
        return Response({"detail": "Uploaded audio file is empty (0 bytes)."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        user = request.user
        today = get_user_local_date(request)
        challenge = get_daily_challenge_for_date(today, user=request.user)
        backup_text = request.data.get("backup_text") or request.POST.get("backup_text")
        
        transcript_text = ""
        client = get_groq_client()
        if client:
            try:
                audio_file.seek(0)
                file_name = audio_file.name or "speaking.wav"
                content_type = audio_file.content_type.split(";")[0] if audio_file.content_type else "audio/webm"
                transcription = client.audio.transcriptions.create(
                    file=(file_name, audio_file.read(), content_type),
                    model=get_model_for_task("speech_best")
                )
                transcript_text = transcription.text
            except Exception as e:
                logger.error(f"[CommunicationAgent] Speech-to-text failed: {e}")
                transcript_text = backup_text or agent._fallback_transcript(audio_file)
        else:
            transcript_text = backup_text or agent._fallback_transcript(audio_file)
            
        eval_data = agent.coe_evaluate_text(transcript_text, challenge_text=challenge['text'])
        session = SpeakingSession.objects.create(
            user=user,
            audio_file=audio_file,
            transcript=transcript_text,
            score=float(eval_data.get("overall_score", 70.0)),
            feedback=eval_data.get("feedback", ""),
            reasoning=eval_data.get("reasoning", "")
        )
        activity, created = CommunicationDailyActivity.objects.get_or_create(
            user=user,
            date=today,
            defaults={"has_visited": True, "has_completed_challenge": True}
        )
        if not activity.has_completed_challenge:
            activity.has_completed_challenge = True
            activity.save()
        streak = calculate_streak(user, today)
        return Response({
            "success": True,
            "session_id": session.id,
            "transcript": transcript_text,
            "evaluation": eval_data,
            "streak": streak,
            "xp_earned": 100
        }, status=status.HTTP_201_CREATED)
    except Exception as e:
        return Response({"detail": f"Error submitting daily challenge: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_activity_log(request):
    try:
        user = request.user
        today = get_user_local_date(request)
        start_date = today - datetime.timedelta(days=90)
        activities = CommunicationDailyActivity.objects.filter(user=user, date__gte=start_date).order_by("date")
        history = [{"date": act.date.strftime("%Y-%m-%d"), "has_visited": act.has_visited, "has_completed_challenge": act.has_completed_challenge} for act in activities]
        streak = calculate_streak(user, today)
        return Response({"streak": streak, "activity_history": history}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"detail": f"Error fetching activity log: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_speaking_topic(request):
    topic_data = {
        "title": "Explain your final year project",
        "prompt": "Describe the core problem, your tech stack, and the most challenging technical roadblock you resolved in your project."
    }
    return Response(topic_data, status=status.HTTP_200_OK)
