#!/usr/bin/env python3
"""
Test script to verify the winners endpoint fix
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
sys.path.append('backend')
django.setup()

from apps.learning.models import StudentProfile, Contest, ContestParticipation

def test_model_relationships():
    """Test the model relationships to ensure our fix is correct"""
    print("🧪 Testing Model Relationships")
    print("=" * 40)
    
    # Test StudentProfile structure
    print("StudentProfile fields:")
    for field in StudentProfile._meta.fields:
        print(f"  • {field.name}: {field.__class__.__name__}")
        if hasattr(field, 'related_model') and field.related_model:
            print(f"    → Related to: {field.related_model.__name__}")
    
    print("\nStudentProfile relationships:")
    for rel in StudentProfile._meta.related_objects:
        print(f"  • {rel.name}: {rel.related_model.__name__}")
    
    # Test if we can access student profiles
    student_count = StudentProfile.objects.count()
    print(f"\nTotal students in database: {student_count}")
    
    # Test contest relationships
    contest_count = Contest.objects.count()
    print(f"Total contests in database: {contest_count}")
    
    # Test participation relationships
    participation_count = ContestParticipation.objects.count()
    print(f"Total participations in database: {participation_count}")
    
    # Test a sample query similar to what the winners endpoint does
    if contest_count > 0:
        sample_contest = Contest.objects.first()
        print(f"\nTesting with sample contest: {sample_contest.title}")
        
        participations = ContestParticipation.objects.filter(
            contest=sample_contest,
            has_started=True
        ).select_related('student')
        
        print(f"Participations for this contest: {participations.count()}")
        
        for participation in participations[:3]:
            print(f"  • Student: {participation.student.name} ({participation.student.register_number})")
            print(f"    Problems solved: {participation.problems_solved}")
            print(f"    Total score: {participation.total_score}")
    
    print("\n✅ Model relationship test completed!")

if __name__ == "__main__":
    test_model_relationships()