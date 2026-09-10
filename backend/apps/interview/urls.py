from django.urls import path
from . import views

urlpatterns = [
    path("sessions/", views.sessions_list, name="sessions_list"),
    path("sessions/<int:pk>/", views.session_detail, name="session_detail"),
    path("sessions/<int:pk>/request-deletion/", views.request_session_deletion, name="request_session_deletion"),
    path("conversation-sessions/<int:pk>/request-deletion/", views.request_conversation_deletion, name="request_conversation_deletion"),
    path("start/", views.start_session, name="start_session"),
    path("submit_answer/", views.submit_answer, name="submit_answer"),
]
