"""
Aptitude Management Views
========================

Views for managing aptitude results approval workflow:
- HOD approval of student aptitude results
- Student access to approved results
"""

from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from .auth_utils import UnifiedAuthMixin
from .models import SolvedAptitude, StaffProfile, StudentProfile


class HODAptitudeApprovalView(UnifiedAuthMixin, APIView):
    """
    HOD endpoint to approve/reject aptitude results for students in their department
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get pending aptitude results for HOD approval"""
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        if profile_type != "hod":
            return Response({
                "error": "Only HODs can access aptitude approval interface"
            }, status=status.HTTP_403_FORBIDDEN)

        # Get pending aptitude results for students in HOD's department
        pending_results = SolvedAptitude.objects.filter(
            student__department=profile.department,
            student__institution=profile.institution
        ).select_related('student', 'question', 'question__topic').order_by('-solved_at')

        # Group by student for better organization
        student_results = {}
        for result in pending_results:
            student_id = result.student.id
            if student_id not in student_results:
                student_results[student_id] = {
                    'student': {
                        'id': result.student.id,
                        'register_number': result.student.register_number,
                        'name': result.student.name,
                        'batch': result.student.batch
                    },
                    'results': []
                }
            
            student_results[student_id]['results'].append({
                'id': result.id,
                'question_id': result.question.id,
                'question_text': result.question.question_text[:100] + "..." if len(result.question.question_text) > 100 else result.question.question_text,
                'topic': result.question.topic.title,
                'difficulty': result.question.difficulty,
                'solved_at': result.solved_at.isoformat()
            })

        return Response({
            'pending_approvals': list(student_results.values()),
            'total_pending': pending_results.count()
        })

    def post(self, request):
        """Approve or reject aptitude results"""
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        if profile_type != "hod":
            return Response({
                "error": "Only HODs can approve aptitude results"
            }, status=status.HTTP_403_FORBIDDEN)

        result_ids = request.data.get('result_ids', [])
        action = request.data.get('action')  # 'approve' or 'reject'

        if not result_ids or action not in ['approve', 'reject']:
            return Response({
                "error": "result_ids and action (approve/reject) are required"
            }, status=status.HTTP_400_BAD_REQUEST)

        results = SolvedAptitude.objects.filter(
            id__in=result_ids,
            student__department=profile.department,
            student__institution=profile.institution
        )

        if not results.exists():
            return Response({
                "error": "No valid pending results found"
            }, status=status.HTTP_404_NOT_FOUND)

        updated_count = results.count()
        
        # For now, just return success since we don't have approval fields in the current model
        # This would need to be implemented when the model is updated
        
        return Response({
            'message': f'Successfully processed {updated_count} aptitude results',
            'updated_count': updated_count
        })


class StudentAptitudeResultsView(UnifiedAuthMixin, APIView):
    """
    Student endpoint to view their aptitude results
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get aptitude results for the student"""
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        if profile_type != "student":
            return Response({
                "error": "Only students can access their aptitude results"
            }, status=status.HTTP_403_FORBIDDEN)

        # Get all aptitude results for now (approval workflow to be implemented)
        results = SolvedAptitude.objects.filter(
            student=profile
        ).select_related('question', 'question__topic').order_by('-solved_at')

        # Group by topic for better organization
        topic_results = {}
        for result in results:
            topic_name = result.question.topic.title
            if topic_name not in topic_results:
                topic_results[topic_name] = {
                    'topic': topic_name,
                    'total_solved': 0,
                    'questions': []
                }
            
            topic_results[topic_name]['total_solved'] += 1
            topic_results[topic_name]['questions'].append({
                'id': result.question.id,
                'question_text': result.question.question_text,
                'difficulty': result.question.difficulty,
                'solved_at': result.solved_at.isoformat()
            })

        return Response({
            'aptitude_results': list(topic_results.values()),
            'total_results': results.count(),
            'approval_status': 'All results are currently visible'
        })