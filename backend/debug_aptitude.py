#!/usr/bin/env python3
"""
Debug script for aptitude questions
"""
import os
import sys
import django

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from apps.learning.models import AptitudeQuestion, AptitudeTopic

def debug_aptitude():
    print("🔍 Debugging Aptitude Questions")
    print("=" * 50)
    
    # Check total questions
    total_questions = AptitudeQuestion.objects.count()
    print(f"📊 Total aptitude questions: {total_questions}")
    
    # Check topics
    total_topics = AptitudeTopic.objects.count()
    print(f"📚 Total aptitude topics: {total_topics}")
    
    # Sample questions
    print(f"\n📝 Sample questions:")
    for q in AptitudeQuestion.objects.select_related('topic')[:5]:
        print(f"  ID: {q.id}, Topic: {q.topic.title if q.topic else 'None'}, Topic ID: {q.topic_id}, Difficulty: {q.difficulty}")
    
    # Check topic distribution
    print(f"\n📈 Questions per topic:")
    from django.db.models import Count
    topic_counts = AptitudeTopic.objects.annotate(
        question_count=Count('questions')
    ).order_by('-question_count')[:10]
    
    for topic in topic_counts:
        print(f"  {topic.title}: {topic.question_count} questions (ID: {topic.id})")
    
    # Test API call
    print(f"\n🌐 Testing API call:")
    try:
        from django.test import Client
        client = Client()
        
        # Test without filters
        response = client.get('/api/aptitude/questions/')
        print(f"  No filters: Status {response.status_code}, Questions: {len(response.json()) if response.status_code == 200 else 'Error'}")
        
        # Test with topic filter
        if topic_counts:
            topic_id = topic_counts[0].id
            response = client.get(f'/api/aptitude/questions/?topic_id={topic_id}')
            print(f"  Topic {topic_id}: Status {response.status_code}, Questions: {len(response.json()) if response.status_code == 200 else 'Error'}")
            
    except Exception as e:
        print(f"  API test failed: {e}")

if __name__ == "__main__":
    debug_aptitude()