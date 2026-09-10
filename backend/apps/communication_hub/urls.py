from django.urls import path
from . import views

urlpatterns = [
    path("speaking/", views.analyze_speaking, name="analyze-speaking"),
    path("speaking/topic/", views.get_speaking_topic, name="speaking-topic"),
    path("analyze/", views.analyze_communication, name="analyze-communication"),
    path("language-practice/", views.language_practice, name="language-practice"),
    path("analytics/", views.get_analytics, name="get-analytics"),
    path("visit/", views.log_visit, name="log-visit"),
    path("daily-challenge/", views.get_daily_challenge, name="daily-challenge"),
    path("daily-challenge/submit/", views.submit_daily_challenge, name="submit-daily-challenge"),
    path("activity/", views.get_activity_log, name="activity-log"),
]
