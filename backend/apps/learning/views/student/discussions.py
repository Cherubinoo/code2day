"""Views extracted from the original monolithic apps/learning/views.py
(module: student/discussions). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class DiscussionMessageListCreateView(UnifiedAuthMixin, APIView):
    def get(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        thread_type = request.query_params.get("thread_type", "general")
        other_user_reg = request.query_params.get("other_user_reg")
        batch_name = request.query_params.get("batch_name")
        problem_slug = request.query_params.get("problem_slug")
        section = (request.query_params.get("section") or "").strip().upper()
        mentor_id_str = request.query_params.get("mentor_id")
        mentor_id = int(mentor_id_str) if mentor_id_str and mentor_id_str.isdigit() else None

        # Security check for staff/hod rooms
        if thread_type in ["staff", "hod_tp_ja"] and profile_type == "student":
            return Response({"detail": "Access denied to this channel."}, status=403)

        # Section chat access: student must be in that batch+section
        if thread_type == "section" and profile_type == "student":
            if not section or profile.section != section:
                return Response({"detail": "Access denied to this section."}, status=403)
            batch_name = profile.batch

        # Mentor group access: student must have that mentor
        if thread_type == "mentor_group" and profile_type == "student":
            if not mentor_id or not profile.mentor or profile.mentor.id != mentor_id:
                return Response({"detail": "Access denied to this mentor group."}, status=403)

        messages_qs = get_discussion_messages(
            request.user,
            profile,
            profile_type,
            thread_type=thread_type,
            other_user_reg=other_user_reg,
            batch_name=batch_name,
            problem_slug=problem_slug,
            section=section,
            mentor_id=mentor_id,
        ).order_by("created_at")

        # Mark messages sent TO the current user as read when they view the thread
        if thread_type == "individual":
            messages_qs.filter(recipient=request.user, is_read=False).update(is_read=True)
            # Also clear notifications for this direct message thread
            Notification.objects.filter(
                recipient=request.user,
                is_read=False,
                link__icontains=f"other_user_reg={other_user_reg}"
            ).update(is_read=True)
        elif thread_type in ["general", "staff", "hod_tp_ja", "section", "mentor_group"]:
            # For group channels, just clear all notifications for that channel
            Notification.objects.filter(
                recipient=request.user,
                is_read=False,
                link=f"/discuss?thread_type={thread_type}"
            ).update(is_read=True)

        messages = messages_qs[:200]

        return Response(DiscussionMessageSerializer(messages, many=True, context={"request": request}).data)

    def post(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        serializer = DiscussionMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        thread_type = data.get("thread_type", "general")
        recipient_reg = data.get("recipient_reg")
        batch_name = data.get("batch_name")
        problem_slug = data.get("problem_slug")
        section = (data.get("section") or "").strip().upper()
        mentor_id_str = str(data.get("mentor_id") or "")
        mentor_id = int(mentor_id_str) if mentor_id_str.isdigit() else None
        body = data["body"]

        # 1. Validation and Security
        if thread_type == "general" and profile_type == "student":
            batch_name = profile.batch

        if thread_type == "section":
            # Section chat — auto-fill batch+section from student profile
            if profile_type == "student":
                if not profile.section:
                    return Response({"detail": "You are not assigned to a section."}, status=403)
                batch_name = profile.batch
                section = profile.section
            elif not batch_name or not section:
                return Response({"detail": "batch_name and section are required."}, status=400)

        if thread_type == "mentor_group":
            if profile_type == "student":
                if not profile.mentor:
                    return Response({"detail": "You do not have an assigned mentor."}, status=403)
                mentor_id = profile.mentor.id
                batch_name = str(mentor_id)
            elif profile_type in ["staff", "hod", "tpu"]:
                # Staff posting to their own group
                mentor_id = profile.id
                batch_name = str(mentor_id)
            else:
                return Response({"detail": "Access denied."}, status=403)

        if thread_type == "individual":
            if not recipient_reg:
                return Response({"detail": "Recipient required for individual message."}, status=400)

            # Students can only message staff from their department
            if profile_type == "student":
                recipient_staff = StaffProfile.objects.filter(
                    faculty_id__iexact=recipient_reg,
                    department=profile.department
                ).first()
                if not recipient_staff:
                    recipient_staff = StaffProfile.objects.filter(faculty_id__iexact=recipient_reg, institution=profile.institution).first()
                    if not recipient_staff:
                        return Response({"detail": "Staff member not found in your institution."}, status=403)

                recipient = recipient_staff.account
            else:
                recipient = User.objects.filter(
                    Q(student_profile__register_number__iexact=recipient_reg) |
                    Q(staff_profile__faculty_id__iexact=recipient_reg) |
                    Q(username=recipient_reg)
                ).first()

            if not recipient:
                return Response({"detail": "Recipient not found."}, status=404)

            # Students cannot DM other students
            if profile_type == "student" and hasattr(recipient, "student_profile"):
                return Response({"detail": "Students can only message Staff or HOD."}, status=403)
        else:
            recipient = None

        if thread_type in ["staff", "hod_tp_ja"] and profile_type == "student":
            return Response({"detail": "Students cannot post to this channel."}, status=403)

        # 2. Find problem if applicable
        problem = None
        if problem_slug:
            problem = Problem.objects.filter(slug=problem_slug).first()

        is_poll = data.get("is_poll", False)
        poll_options = data.get("poll_options", [])

        if is_poll and profile_type == "student":
            return Response({"detail": "Only Staff/HOD/Admin can create polls."}, status=403)

        # 3. Create message
        message = DiscussionMessage.objects.create(
            sender=request.user,
            recipient=recipient,
            student=profile if profile_type == "student" else None,
            problem=problem,
            thread_type=thread_type,
            batch_name=batch_name,
            section=section,
            institution=getattr(profile, 'institution', None),
            department=getattr(profile, 'department', None),
            body=body,
            is_poll=is_poll,
            poll_options=poll_options
        )

        # 4. Notifications
        if recipient:
            # For individual messages, include the sender's reg in the link to allow auto-clearing
            sender_reg = profile.register_number if profile_type == "student" else (profile.faculty_id if profile else request.user.username)
            Notification.objects.create(
                recipient=recipient,
                title=f"New Message from {profile.name if profile else request.user.username}",
                message=body[:60] + "..." if len(body) > 60 else body,
                link=f"/discuss?thread_type=individual&other_user_reg={sender_reg}"
            )
        elif thread_type in ["staff", "hod_tp_ja", "general", "section", "mentor_group"]:
            # For group channels, we notify relevant people
            recipients_qs = User.objects.none()
            room_name = "General Chat"

            if thread_type == "staff" and profile and profile.department:
                recipients_qs = User.objects.filter(
                    staff_profile__department=profile.department
                )
                room_name = "Staff Room"
            elif thread_type == "hod_tp_ja" and profile:
                recipients_qs = User.objects.filter(
                    staff_profile__institution=profile.institution,
                    staff_profile__role__in=["hod", "admin", "ja", "tpu", "director"]
                )
                room_name = "HOD & Admin Panel"
            elif thread_type == "general" and profile:
                recipients_qs = User.objects.filter(
                    student_profile__batch=batch_name,
                    student_profile__institution=profile.institution
                )
                if batch_name:
                    room_name = f"Batch {batch_name} Chat"
            elif thread_type == "section" and batch_name and section:
                recipients_qs = User.objects.filter(
                    student_profile__batch=batch_name,
                    student_profile__section=section,
                    student_profile__institution=getattr(profile, 'institution', None),
                )
                room_name = f"Section {section} Chat"
            elif thread_type == "mentor_group" and mentor_id:
                # Notify all mentees + the mentor
                try:
                    mentor_staff = StaffProfile.objects.get(id=mentor_id)
                    recipients_qs = User.objects.filter(
                        Q(student_profile__mentor_id=mentor_id) |
                        Q(staff_profile__id=mentor_id)
                    )
                    room_name = f"Mentor Group ({mentor_staff.name})"
                except StaffProfile.DoesNotExist:
                    pass

            # Filter out the sender
            recipients = recipients_qs.exclude(id=request.user.id).distinct()

            # Create notifications in bulk
            notif_link = f"/discuss?thread_type={thread_type}"
            if thread_type == "general" and batch_name:
                notif_link += f"&batch_name={batch_name}"
            elif thread_type == "section" and batch_name and section:
                notif_link += f"&batch_name={batch_name}&section={section}"
            elif thread_type == "mentor_group" and mentor_id:
                notif_link += f"&mentor_id={mentor_id}"

            notifications = [
                Notification(
                    recipient=r,
                    title=f"New Message in {room_name}",
                    message=f"{profile.name}: {body[:50]}..." if len(body) > 50 else f"{profile.name}: {body}",
                    link=notif_link
                )
                for r in recipients
            ]
            Notification.objects.bulk_create(notifications)

        return Response(
            DiscussionMessageSerializer(message, context={"request": request}).data,
            status=status.HTTP_201_CREATED
        )

class DiscussionPollVoteView(UnifiedAuthMixin, APIView):
    def post(self, request, pk):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        message = get_object_or_404(DiscussionMessage, pk=pk)
        if not message.is_poll:
            return Response({"detail": "This message is not a poll."}, status=400)

        option_index = request.data.get("option_index")
        if option_index is None or not (0 <= option_index < len(message.poll_options)):
            return Response({"detail": "Invalid option index."}, status=400)

        # Record or update vote
        user_id = str(request.user.id)
        message.poll_votes[user_id] = option_index
        message.save(update_fields=["poll_votes"])

        return Response(DiscussionMessageSerializer(message, context={"request": request}).data)

class DiscussionThreadListView(UnifiedAuthMixin, APIView):
    def get(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        # Cleanup handled in global messages fetcher usually, but we filter here too
        cutoff = timezone.now() - timedelta(hours=24)
        messages = DiscussionMessage.objects.filter(
            thread_type="individual",
            created_at__gte=cutoff
        ).filter(
            Q(sender=request.user) | Q(recipient=request.user)
        ).order_by("-created_at")

        threads = {}
        for msg in messages:
            other_user = msg.recipient if msg.sender == request.user else msg.sender
            if not other_user:
                continue
            
            other_id = other_user.id
            if other_id not in threads:
                name = "Unknown"
                identifier = ""
                if hasattr(other_user, "student_profile"):
                    name = other_user.student_profile.name
                    identifier = other_user.student_profile.register_number
                elif hasattr(other_user, "staff_profile"):
                    name = other_user.staff_profile.name
                    identifier = other_user.staff_profile.faculty_id
                
                threads[other_id] = {
                    "other_user_id": other_id,
                    "other_user_name": name,
                    "other_user_reg": identifier,
                    "latest_message": msg.body[:50],
                    "timestamp": msg.created_at,
                    "unread_count": 0,
                    "is_self_latest": msg.sender == request.user
                }
            
            if msg.recipient == request.user and not msg.is_read:
                threads[other_id]["unread_count"] += 1

        thread_list = list(threads.values())
        thread_list.sort(key=lambda x: x["timestamp"], reverse=True)
        return Response(thread_list)

