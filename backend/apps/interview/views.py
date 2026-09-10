import json
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


from .models import InterviewSession, InterviewHistory, SessionDeletionRequest
from .serializers import InterviewSessionSerializer
from .services.interview_agent import (
    generate_next_question,
    evaluate_question_response,
    evaluate_overall_session
)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sessions_list(request):
    """
    GET /api/interview/sessions/
    List all interview sessions for the authenticated user, ordered by newest first.
    """
    sessions = InterviewSession.objects.filter(user=request.user).order_by("-created_at")
    serializer = InterviewSessionSerializer(sessions, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def session_detail(request, pk):
    """
    GET /api/interview/sessions/<pk>/
    Retrieve detail of a specific interview session.
    """
    try:
        session = InterviewSession.objects.get(pk=pk, user=request.user)
    except InterviewSession.DoesNotExist:
        return Response(
            {"detail": "Session not found."},
            status=status.HTTP_404_NOT_FOUND
        )
    
    serializer = InterviewSessionSerializer(session)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_session(request):
    """
    POST /api/interview/start/
    Body: { interview_type, job_description (optional) }
    Starts a new interview session and returns the session details along with the first question.
    """
    interview_type = request.data.get("interview_type")
    job_description = request.data.get("job_description", "")
    max_questions = int(request.data.get("max_questions", 5))

    if not interview_type:
        return Response(
            {"detail": "Parameter 'interview_type' is required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Create the session
    session = InterviewSession.objects.create(
        user=request.user,
        interview_type=interview_type,
        job_description=job_description,
        is_completed=False,
        current_question_index=1,
        max_questions=max_questions
    )
    
    student_profile = getattr(request.user, 'student_profile', None)
        
    try:
        # Generate the first question
        first_question_text = generate_next_question(
            session=session,
            history_list=[],
            student_profile=student_profile,
            difficulty="medium"
        )
        
        # Save first question into InterviewHistory
        InterviewHistory.objects.create(
            session=session,
            question=first_question_text,
            answer="",
            score=None,
            feedback=None
        )
        
        serializer = InterviewSessionSerializer(session)
        return Response({
            "session": serializer.data,
            "next_question": first_question_text,
            "current_question_index": 1
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        # Rollback session if prompt fails
        session.delete()
        return Response(
            {"detail": f"Failed to start interview: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_answer(request):
    """
    POST /api/interview/submit_answer/
    Body: { session_id, answer }
    Evaluates the response to the current question. If there are more questions,
    generates and returns the next question. Otherwise, evaluates the overall session
    and completes it.
    """
    session_id = request.data.get("session_id")
    answer = request.data.get("answer", "")
    requested_difficulty = request.data.get("difficulty", "medium")
    
    if not session_id:
        return Response(
            {"detail": "Parameter 'session_id' is required."},
            status=status.HTTP_400_BAD_REQUEST
        )
        
    try:
        session = InterviewSession.objects.get(pk=session_id, user=request.user)
    except InterviewSession.DoesNotExist:
        return Response(
            {"detail": "Session not found."},
            status=status.HTTP_404_NOT_FOUND
        )
        
    if session.is_completed:
        return Response(
            {"detail": "Interview session is already completed."},
            status=status.HTTP_400_BAD_REQUEST
        )
        
    # Get history for this session
    history_list = list(session.history.all().order_by("created_at"))
    if not history_list:
        return Response(
            {"detail": "No active question found for this session."},
            status=status.HTTP_400_BAD_REQUEST
        )
        
    # Get the active Q&A record (the latest one, which should have no answer)
    active_history = history_list[-1]
    active_history.answer = answer
    
    # Derive target role from job description for richer feedback
    target_role = session.job_description.split("-")[0].strip() if session.job_description else "Software Engineer"

    # Grade the active answer using LLM (returns structured scores)
    grade_results = {
        "score": 70.0, "grammar": 70, "fluency": 70, "vocabulary": 70, "confidence": 68,
        "feedback": "Your answer was saved. Evaluation service encountered a minor issue.",
        "model_answer": "", "difficulty_for_next": requested_difficulty,
    }
    try:
        grade_results = evaluate_question_response(
            question=active_history.question,
            answer=answer,
            interview_type=session.interview_type,
            target_role=target_role,
        )
        active_history.score = float(grade_results.get("score", 70.0))
        active_history.feedback = grade_results.get("feedback", "")
        active_history.model_answer = grade_results.get("model_answer", "")
        active_history.reasoning = grade_results.get("reasoning", "")
        active_history.save()
    except Exception as e:
        logger.error(f"[InterviewAgent] Grading error: {e}")
        active_history.score = 70.0
        active_history.feedback = grade_results["feedback"]
        active_history.save()

    next_difficulty = grade_results.get("difficulty_for_next", requested_difficulty)
        
    # Re-fetch history including the graded item
    history_list = list(session.history.all().order_by("created_at"))
    
    # Check if we have completed all questions
    if session.current_question_index >= session.max_questions:
        # Finalize interview session
        try:
            overall_results = evaluate_overall_session(session, history_list)
            session.score = float(overall_results.get("score", 70.0))
            session.feedback = json.dumps({
                "feedback": overall_results.get("feedback", ""),
                "strengths": overall_results.get("strengths", []),
                "weaknesses": overall_results.get("weaknesses", []),
                "recommendations": overall_results.get("recommendations", [])
            })
            session.reasoning = overall_results.get("reasoning", "")
            session.is_completed = True
            session.save()
            
            structured_scores = {
                "grammar": grade_results.get("grammar", 70),
                "fluency": grade_results.get("fluency", 70),
                "vocabulary": grade_results.get("vocabulary", 70),
                "confidence": grade_results.get("confidence", 68),
            }
            serializer = InterviewSessionSerializer(session)
            return Response({
                "is_completed": True,
                "session": serializer.data,
                "evaluation": {
                    "score": active_history.score,
                    "feedback": active_history.feedback,
                    "model_answer": active_history.model_answer,
                    **structured_scores,
                },
            }, status=status.HTTP_200_OK)

        except Exception as e:
            session.score = sum(h.score or 70.0 for h in history_list) / len(history_list)
            session.feedback = json.dumps({
                "feedback": "You have completed the mock interview. Good effort!",
                "strengths": ["Completed all questions"],
                "weaknesses": ["Minor evaluation failures"],
                "recommendations": ["Review individual questions"]
            })
            session.is_completed = True
            session.save()
            serializer = InterviewSessionSerializer(session)
            return Response({
                "is_completed": True,
                "session": serializer.data,
                "evaluation": {"score": session.score, "feedback": "Session completed."},
            }, status=status.HTTP_200_OK)

    else:
        # Proceed to next question
        session.current_question_index += 1
        session.save()

        student_profile = None
        try:
            student_profile = request.user.student_profile
        except StudentProfile.DoesNotExist:
            pass

        try:
            next_question_text = generate_next_question(
                session=session,
                history_list=history_list,
                student_profile=student_profile,
                difficulty=next_difficulty,
            )

            InterviewHistory.objects.create(
                session=session,
                question=next_question_text,
                answer="",
                score=None,
                feedback=None
            )

            structured_scores = {
                "grammar": grade_results.get("grammar", 70),
                "fluency": grade_results.get("fluency", 70),
                "vocabulary": grade_results.get("vocabulary", 70),
                "confidence": grade_results.get("confidence", 68),
            }
            return Response({
                "is_completed": False,
                "next_question": next_question_text,
                "current_question_index": session.current_question_index,
                "difficulty": next_difficulty,
                "evaluation": {
                    "score": active_history.score,
                    "feedback": active_history.feedback,
                    "model_answer": active_history.model_answer,
                    **structured_scores,
                },
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {"detail": f"Failed to generate next question: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_session_deletion(request, pk):
    """
    POST /api/interview/sessions/<pk>/request-deletion/
    User requests deletion of an interview session. Goes to admin for approval.
    """
    try:
        session = InterviewSession.objects.get(pk=pk, user=request.user)
    except InterviewSession.DoesNotExist:
        return Response({"detail": "Session not found."}, status=status.HTTP_404_NOT_FOUND)

    if SessionDeletionRequest.objects.filter(
        user=request.user, session_type='interview', session_id=pk, status='pending'
    ).exists():
        return Response({"detail": "A deletion request for this session is already pending."}, status=status.HTTP_400_BAD_REQUEST)

    SessionDeletionRequest.objects.create(
        user=request.user,
        session_type='interview',
        session_id=pk,
        session_info=f"{session.interview_type} session attempted on {session.created_at.strftime('%Y-%m-%d')}",
    )
    
    # Create notification for admin
    from apps.accounts.models import Notification
    from django.contrib.auth.models import User
    admins = User.objects.filter(is_staff=True)
    for admin in admins:
        Notification.objects.create(
            user=admin,
            title="New Deletion Request",
            message=f"Student {request.user.first_name or request.user.username} requested deletion of interview session #{pk}."
        )

    return Response({"detail": "Deletion request submitted. Awaiting admin approval."}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_conversation_deletion(request, pk):
    """
    POST /api/interview/conversation-sessions/<pk>/request-deletion/
    User requests deletion of a conversation/speaking session. Goes to admin for approval.
    """
    from apps.communication_hub.models import SpeakingSession
    try:
        session = SpeakingSession.objects.get(pk=pk, user=request.user)
    except SpeakingSession.DoesNotExist:
        return Response({"detail": "Session not found."}, status=status.HTTP_404_NOT_FOUND)

    if SessionDeletionRequest.objects.filter(
        user=request.user, session_type='conversation', session_id=pk, status='pending'
    ).exists():
        return Response({"detail": "A deletion request for this session is already pending."}, status=status.HTTP_400_BAD_REQUEST)

    SessionDeletionRequest.objects.create(
        user=request.user,
        session_type='conversation',
        session_id=pk,
        session_info=f"Conversation session on {session.created_at.strftime('%Y-%m-%d')}",
    )

    # Create notification for admin
    from apps.accounts.models import Notification
    from django.contrib.auth.models import User
    admins = User.objects.filter(is_staff=True)
    for admin in admins:
        Notification.objects.create(
            user=admin,
            title="New Deletion Request",
            message=f"Student {request.user.first_name or request.user.username} requested deletion of conversation session #{pk}."
        )

    return Response({"detail": "Deletion request submitted. Awaiting admin approval."}, status=status.HTTP_201_CREATED)
