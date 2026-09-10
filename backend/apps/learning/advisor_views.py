import hashlib
import json
import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

try:
    from apps.accounts.models import StudentProfile
except Exception:
    StudentProfile = None

try:
    from apps.resume_engine.models import Resume, ResumeAnalysis
except Exception:
    Resume = None
    ResumeAnalysis = None

from apps.interview.models import InterviewSession
from apps.communication_hub.models import SpeakingSession, CommunicationAssessment
from .models import LearningPlan, LearningTask
from core.groq_client import generate_completion, get_model_for_task
from django.core.cache import cache

logger = logging.getLogger(__name__)


def compute_profile_fingerprint(student_profile, resume_analysis, latest_interview, latest_speaking, latest_comm, target_company, learn_skill=None):
    data = {
        "skills": sorted(student_profile.current_skills if student_profile else []),
        "target_role": (student_profile.target_role if student_profile else ""),
        "target_company": target_company,
        "learn_skill": learn_skill or "",
        "resume_id": resume_analysis.id if resume_analysis else None,
        "interview_score": float(latest_interview.score) if latest_interview and latest_interview.score else None,
        "speaking_score": float(latest_speaking.score) if latest_speaking and latest_speaking.score else None,
        "comm_score": float(latest_comm.overall_score) if latest_comm and latest_comm.overall_score else None,
    }
    return hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest()


def calculate_readiness_scores(student_profile, resume_analysis, latest_interview, latest_speaking, latest_comm):
    skills_count = len(student_profile.current_skills) if student_profile else 0
    tech_base = min(100, 50 + skills_count * 6)
    if latest_interview and latest_interview.interview_type == "Technical":
        tech_score = latest_interview.score or tech_base
    else:
        tech_score = tech_base

    projects_score = 75
    if resume_analysis:
        projects_score = 70 + min(25, len(resume_analysis.strengths) * 6)

    resume_score = resume_analysis.resume_score if resume_analysis else 50

    comm_score = 70
    if latest_speaking:
        comm_score = latest_speaking.score
    elif latest_comm:
        comm_score = latest_comm.overall_score

    interview_score = latest_interview.score if latest_interview else 60

    cgpa_val = student_profile.cgpa if (student_profile and student_profile.cgpa) else 7.5
    industry_score = min(100, int(cgpa_val * 10) + 10)

    overall_score = int((tech_score + projects_score + resume_score + comm_score + interview_score + industry_score) / 6)

    return {
        "overall": overall_score,
        "technical": int(tech_score),
        "projects": int(projects_score),
        "resume": int(resume_score),
        "communication": int(comm_score),
        "interview": int(interview_score),
        "industry": int(industry_score),
    }


MILESTONE_SCHEMA_KEYS = {"milestone_name", "description", "difficulty", "duration", "category", "details", "resources"}


def _strip_code_fence(text):
    text = (text or "").strip()
    if text.startswith("```"):
        first_nl = text.find("\n")
        if first_nl != -1:
            text = text[first_nl:].strip()
        if text.endswith("```"):
            text = text[:-3].strip()
    return text


def _validate_milestones(milestones, expected_count):
    if not isinstance(milestones, list) or len(milestones) != expected_count:
        return False
    for m in milestones:
        if not isinstance(m, dict) or not MILESTONE_SCHEMA_KEYS.issubset(m.keys()):
            return False
        if not isinstance(m.get("details"), list) or not isinstance(m.get("resources"), dict):
            return False
    return True


def generate_validated_milestones(system_prompt, prompt, model, expected_count, max_repairs=1):
    """
    Generate -> validate against schema -> self-repair loop.
    Added Cache: Checks if this exact prompt was already generated and validated.
    """
    cache_key = "milestones_" + hashlib.md5((system_prompt + prompt).encode()).hexdigest()
    cached_milestones = cache.get(cache_key)
    if cached_milestones:
        return cached_milestones, True

    response = generate_completion(
        prompt=prompt, system_prompt=system_prompt,
        response_format={"type": "json_object"}, model=model,
    )
    attempts = 0
    while True:
        if response:
            try:
                data = json.loads(_strip_code_fence(response))
                milestones = data.get("milestones")
                if _validate_milestones(milestones, expected_count):
                    cache.set(cache_key, milestones, timeout=604800)  # Cache for 7 days
                    return milestones, True
                logger.warning(f"[Advisor] Milestone schema validation failed on attempt {attempts}")
            except Exception as e:
                logger.warning(f"[Advisor] Milestone JSON parse failed on attempt {attempts}: {e}")

        if attempts >= max_repairs:
            return None, False
        attempts += 1

        repair_prompt = (
            f"Your previous response was invalid or did not match the required schema.\n"
            f"Return ONLY a valid JSON object with a single key 'milestones' containing exactly "
            f"{expected_count} milestone objects, each with keys: milestone_name, description, "
            f"difficulty, duration, category, details (list of 4 strings), resources (object with "
            f"official_doc, youtube_resource, practice_platform, recommended_courses, coding_problems). "
            f"No markdown, no extra text.\n\nOriginal request:\n{prompt}"
        )
        response = generate_completion(
            prompt=repair_prompt, system_prompt=system_prompt,
            response_format={"type": "json_object"}, model=model,
        )


def llm_analyse_profile(student_profile, resume_analysis, scores, target_role, target_company=None):
    """
    Ask the LLM to identify strengths, weaknesses, priority skills, and learning order
    based on the full student profile and computed numeric scores. When target_company
    is None, the analysis is framed generically around the student's skill growth rather
    than a specific placement target (used for standalone "learn a skill" journeys).
    """
    skills = student_profile.current_skills if student_profile else []
    cgpa = student_profile.cgpa if student_profile else None
    strengths_from_resume = resume_analysis.strengths if resume_analysis else []
    improvements_from_resume = resume_analysis.weaknesses if resume_analysis else []

    system_prompt = (
        "You are an expert career advisor AI. Analyse the student's profile data and return a JSON object with these keys:\n"
        "- strengths: list of 3 specific skill/area strengths (strings)\n"
        "- weaknesses: list of 3 specific skill/area weaknesses (strings)\n"
        "- priority_skills: list of 3 skills they should focus on next (strings)\n"
        "- learning_order: list of 3-5 topics in the recommended study sequence (strings)\n"
        "- readiness_explanation: a 2-sentence plain English explanation of their overall readiness\n"
        "- priority_ranking: a 1-sentence statement of their single highest-impact improvement area\n"
        "Return only valid JSON with no markdown or extra text."
    )

    target_line = f"- Target Company: {target_company}\n" if target_company else ""
    framing = (
        "Based on the above, identify their strengths, weaknesses, priority skills, and learning order "
        f"relative to placement readiness for {target_company}."
        if target_company else
        "This student is not targeting a specific company right now — they simply want to grow their "
        "skills. Based on the above, identify their general strengths, weaknesses, priority skills, and "
        "learning order for well-rounded skill growth, without referencing any specific company."
    )

    prompt = (
        f"Student Profile:\n"
        f"- Target Role: {target_role}\n"
        f"{target_line}"
        f"- Current Skills: {', '.join(skills) if skills else 'Not specified'}\n"
        f"- CGPA: {cgpa if cgpa else 'Not specified'}\n"
        f"- Resume Strengths: {', '.join(strengths_from_resume) if strengths_from_resume else 'None identified'}\n"
        f"- Resume Improvement Areas: {', '.join(improvements_from_resume) if improvements_from_resume else 'None identified'}\n"
        f"- Readiness Scores (0-100): Technical={scores['technical']}, Communication={scores['communication']}, "
        f"Resume={scores['resume']}, Interview={scores['interview']}, Projects={scores['projects']}, Industry={scores['industry']}\n\n"
        f"{framing}"
    )

    cache_key = "profile_analysis_" + hashlib.md5(prompt.encode()).hexdigest()
    cached_analysis = cache.get(cache_key)
    if cached_analysis:
        return cached_analysis

    response = generate_completion(
        prompt=prompt,
        system_prompt=system_prompt,
        response_format={"type": "json_object"},
        model=get_model_for_task("reasoning_heavy"),
    )

    fallback = {
        "strengths": skills[:3] if skills else ["Python", "Problem Solving", "Communication"],
        "weaknesses": ["Advanced DSA", "System Design", "Interview Communication"],
        "priority_skills": ["DSA", "System Design", "Resume Optimization"],
        "learning_order": ["Data Structures", "Algorithms", "System Design", "Mock Interviews"],
        "readiness_explanation": "The student has foundational skills but needs to strengthen DSA and system design for placement readiness.",
        "priority_ranking": "Improving DSA proficiency will have the highest impact on placement success.",
    }

    if not response:
        return fallback

    try:
        data = json.loads(response)
        for key in fallback:
            if key not in data:
                data[key] = fallback[key]
        cache.set(cache_key, data, timeout=604800)  # Cache for 7 days
        return data
    except Exception as e:
        logger.error(f"[Advisor] Failed parsing LLM profile analysis: {e}")
        return fallback


def llm_generate_company_checklist(company_name, target_role, user_skills):
    """
    Ask the LLM for the real required skills for a given company and role,
    then cross-check against the student's skills.
    """
    system_prompt = (
        "You are a technical recruiter AI with deep knowledge of Indian IT company hiring requirements. "
        "Return a JSON object with a single key 'required_skills' containing a list of exactly 6 skills "
        "that are essential for the given company and role. Each skill must be a plain string. "
        "Return only valid JSON with no markdown or extra text."
    )

    prompt = (
        f"What are the 6 most important technical and soft skills required to get hired at {company_name} "
        f"for a {target_role} position? Focus on skills that appear in their actual job descriptions."
    )

    cache_key = "company_skills_" + hashlib.md5((company_name + target_role).encode()).hexdigest()
    cached_skills = cache.get(cache_key)

    if cached_skills:
        required_skills = cached_skills
    else:
        response = generate_completion(
            prompt=prompt,
            system_prompt=system_prompt,
            response_format={"type": "json_object"},
            model=get_model_for_task("fast"),
        )
    
        default_skills = ["Python", "SQL", "OOP", "DSA Foundations", "Problem Solving", "Communication"]
        required_skills = default_skills
        if response:
            try:
                data = json.loads(response)
                if "required_skills" in data and isinstance(data["required_skills"], list):
                    required_skills = data["required_skills"][:6]
                    cache.set(cache_key, required_skills, timeout=604800)  # Cache for 7 days
            except Exception as e:
                logger.error(f"[Advisor] Failed parsing company skills from LLM: {e}")

    user_skills_lower = [s.lower() for s in user_skills]
    checklist = []
    for skill in required_skills:
        has_skill = any(skill.lower() in us or us in skill.lower() for us in user_skills_lower)
        checklist.append({"skill_name": skill, "status": has_skill})

    return checklist


def generate_custom_skill_plan(user, student_profile, learn_skill, readiness_score, weaknesses, fingerprint):
    """
    Calls the LLM to generate a 5-step roadmap for learning a custom skill (e.g. Rust)
    based on the student's readiness score.
    """
    difficulty_level = "Easy"
    if readiness_score >= 75:
        difficulty_level = "Hard"
    elif readiness_score >= 50:
        difficulty_level = "Medium"

    system_prompt = (
        "You are MentorMind AI, an expert technical learning mentor. "
        "Generate a highly customised 5-step study roadmap to master a specific skill/technology (e.g. Rust, Go, Kubernetes).\n"
        "Crucial: Customize the difficulty and milestones based on the student's current readiness level (Easy, Medium, Hard).\n\n"
        "Return a JSON object with a single key 'milestones' containing exactly 5 milestone objects, each with:\n"
        "- milestone_name: concise name (string)\n"
        "- description: 1-2 sentences on what to study (string)\n"
        "- difficulty: 'Easy', 'Medium', or 'Hard' (string)\n"
        "- duration: e.g. '1 Week', '2 Weeks' (string)\n"
        "- category: e.g. 'DSA', 'Syntax Basics', 'Concurrency', 'Advanced Optimization' (string)\n"
        "- details: list of 4 subtopics to study (list of strings)\n"
        "- resources: object with keys: official_doc, youtube_resource, practice_platform, recommended_courses, coding_problems (all strings)\n\n"
        "Sequence the milestones in the recommended learning order (prerequisites first). Return only valid JSON, no markdown."
    )

    prompt = (
        f"Skill to Learn: {learn_skill}\n"
        f"Student Readiness Level: {difficulty_level} (Ready Score: {readiness_score}/100)\n"
        f"Current Skills: {', '.join(student_profile.current_skills if student_profile else [])}\n"
        f"Key Weaknesses: {', '.join(weaknesses)}\n\n"
        f"Generate the custom 5-step study plan for {learn_skill} at the {difficulty_level} level."
    )

    milestones, ai_generated = generate_validated_milestones(
        system_prompt, prompt, get_model_for_task("reasoning_heavy"), expected_count=5
    )

    if not milestones:
        milestones = [
            {
                "milestone_name": f"{learn_skill} Fundamentals",
                "description": f"Master basic syntax, data types, control flow, and toolchains of {learn_skill}.",
                "difficulty": "Easy",
                "duration": "1 Week",
                "category": "Fundamentals",
                "details": ["Setup & Toolchain", "Variables & Types", "Control Structures", "Writing First CLI"],
                "resources": {
                    "official_doc": f"{learn_skill} Getting Started Guide",
                    "youtube_resource": f"{learn_skill} Complete Course",
                    "practice_platform": "LeetCode/HackerRank syntax challenges",
                    "recommended_courses": f"Learn {learn_skill} on Coursera",
                    "coding_problems": "FizzBuzz, Array Reverse",
                },
            },
            {
                "milestone_name": f"{learn_skill} Structures & Concepts",
                "description": f"Understand structural programming, memory/resource allocation, and modules in {learn_skill}.",
                "difficulty": "Medium",
                "duration": "2 Weeks",
                "category": "Core Programming",
                "details": ["Structs & Enums", "Memory Allocation Models", "Collections & Maps", "Packages & Modules"],
                "resources": {
                    "official_doc": f"{learn_skill} Book / Intermediate Docs",
                    "youtube_resource": f"{learn_skill} Intermediate walkthroughs",
                    "practice_platform": "Exercism.org practice tracks",
                    "recommended_courses": f"Building Systems in {learn_skill}",
                    "coding_problems": "Design a basic library tracker, Simple CLI file editor",
                },
            },
            {
                "milestone_name": f"{learn_skill} Concurrency & Async",
                "description": f"Explore asynchronous execution, thread handling, and safe sharing of resources.",
                "difficulty": "Hard",
                "duration": "1 Week",
                "category": "Concurrency",
                "details": ["Asynchronous Runtime", "Threads & Mutexes", "Channels & Message Passing", "Task Scheduling"],
                "resources": {
                    "official_doc": f"{learn_skill} Concurrency Handbook",
                    "youtube_resource": "Advanced Async Tutorials",
                    "practice_platform": "GitHub concurrency exercises",
                    "recommended_courses": "Parallel Programming",
                    "coding_problems": "Web Crawler scraper, Threaded Ping Server",
                },
            },
            {
                "milestone_name": f"{learn_skill} Web Frameworks & APIs",
                "description": f"Build robust RESTful services, database connections, and route handling in {learn_skill}.",
                "difficulty": "Medium",
                "duration": "1 Week",
                "category": "Backend Development",
                "details": ["RESTful Routing", "Database ORM integrations", "Middleware handlers", "Unit testing API routes"],
                "resources": {
                    "official_doc": f"Popular Web framework docs for {learn_skill}",
                    "youtube_resource": "REST API crash courses",
                    "practice_platform": "Postman API testing",
                    "recommended_courses": f"Modern Backend Architecture with {learn_skill}",
                    "coding_problems": "Create a CRUD Task Tracker, User authentication system",
                },
            },
            {
                "milestone_name": f"{learn_skill} System Optimization & Deployment",
                "description": f"Perform profiling, benchmarking, memory optimization, and compile release builds for production.",
                "difficulty": "Hard",
                "duration": "1 Week",
                "category": "Optimization",
                "details": ["Performance Benchmarking", "Memory profiling", "Docker containerization", "CI/CD action runners"],
                "resources": {
                    "official_doc": f"{learn_skill} Performance Book",
                    "youtube_resource": "Profiling memory issues",
                    "practice_platform": "Docker hub deployment",
                    "recommended_courses": "Systems Performance Engineering",
                    "coding_problems": "Optimize data parser execution speed, Benchmark custom JSON validator",
                },
            }
        ]

    plan = LearningPlan.objects.create(
        user=user,
        title=f"{learn_skill} Custom Study Roadmap",
        target_role=f"Learn {learn_skill}",
        status="active",
        profile_fingerprint=fingerprint,
        ai_generated=ai_generated,
        company_checklist=[
            {"skill_name": f"{learn_skill} Basics", "status": True if readiness_score >= 50 else False},
            {"skill_name": f"{learn_skill} Concurrency", "status": True if readiness_score >= 75 else False},
            {"skill_name": f"{learn_skill} Web APIs", "status": False},
            {"skill_name": f"{learn_skill} Optimization", "status": False},
            {"skill_name": "Project Portfolio Build", "status": False},
            {"skill_name": "Interview Code Simulation", "status": False}
        ],
    )

    tasks_to_create = [
        LearningTask(
            plan=plan,
            task_name=m["milestone_name"],
            description=m["description"],
            duration=m["duration"],
            category=m["category"],
            resource_link="",
            completed=False,
            extended_metadata={
                "difficulty": m["difficulty"],
                "progress_percentage": 0,
                "details": m["details"],
                "resources": m["resources"],
            },
        )
        for m in milestones
    ]
    LearningTask.objects.bulk_create(tasks_to_create)
    return plan


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_advisor_data(request):
    """
    GET /api/learning/advisor/
    Returns dynamically generated placement scores, LLM-driven strengths/weaknesses,
    milestones, target company prep, and weekly review feedback.
    Regenerates the roadmap whenever the student's profile changes meaningfully.
    """
    user = request.user
    target_company = request.query_params.get("target_company", "Zoho")
    learn_skill = (request.query_params.get("learn_skill") or "").strip()[:80] or None

    student_profile = None
    try:
        student_profile = user.student_profile
    except StudentProfile.DoesNotExist:
        pass

    resume_analysis = None
    try:
        latest_resume = Resume.objects.filter(user=user).latest("uploaded_at")
        resume_analysis = latest_resume.analysis
    except (Resume.DoesNotExist, ResumeAnalysis.DoesNotExist):
        pass

    latest_interview = InterviewSession.objects.filter(user=user, is_completed=True).order_by("-created_at").first()
    latest_speaking = SpeakingSession.objects.filter(user=user).order_by("-created_at").first()
    latest_comm = CommunicationAssessment.objects.filter(user=user).order_by("-assessment_date").first()

    scores = calculate_readiness_scores(student_profile, resume_analysis, latest_interview, latest_speaking, latest_comm)

    # Standalone skill-learning journeys are intentionally decoupled from any placement target company.
    llm_analysis = llm_analyse_profile(
        student_profile, resume_analysis, scores,
        f"Learn {learn_skill}" if learn_skill else (student_profile.target_role if student_profile else "Software Developer"),
        target_company=None if learn_skill else target_company,
    )

    strengths = llm_analysis["strengths"]
    weaknesses = llm_analysis["weaknesses"]

    current_role = student_profile.target_role if (student_profile and student_profile.target_role) else "Software Developer"
    target_role = f"Learn {learn_skill}" if learn_skill else current_role
    
    current_fingerprint = compute_profile_fingerprint(
        student_profile, resume_analysis, latest_interview, latest_speaking, latest_comm,
        None if learn_skill else target_company, learn_skill
    )

    plan = LearningPlan.objects.filter(user=user, status="active").order_by("-id").first()

    force_regen = request.query_params.get("force_regen") == "true"
    needs_regen = (
        force_regen
        or not plan
        or plan.target_role != target_role
        or plan.profile_fingerprint != current_fingerprint
    )

    if needs_regen:
        if plan:
            plan.delete()
        
        if learn_skill:
            plan = generate_custom_skill_plan(
                user, student_profile, learn_skill, scores["overall"],
                weaknesses, current_fingerprint
            )
        else:
            plan = generate_dynamic_plan(
                user, student_profile, target_role, target_company,
                weaknesses, llm_analysis, current_fingerprint
            )

    company_checklist = plan.company_checklist or []

    tasks = plan.tasks.all().order_by("id")
    milestones_data = []
    completed_count = 0

    for t in tasks:
        if t.completed:
            completed_count += 1
        meta = t.extended_metadata or {}
        milestones_data.append({
            "id": t.id,
            "milestone_name": t.task_name,
            "description": t.description,
            "duration": t.duration,
            "category": t.category,
            "completed": t.completed,
            "completed_at": t.completed_at.strftime("%Y-%m-%d %H:%M:%S") if t.completed_at else None,
            "difficulty": meta.get("difficulty", "Medium"),
            "progress_percentage": 100 if t.completed else meta.get("progress_percentage", 0),
            "details": meta.get("details", []),
            "resources": meta.get("resources", {
                "official_doc": "Official Documentation",
                "youtube_resource": "Free Learning Playlists",
                "practice_platform": "Practice Challenges",
                "recommended_courses": "Recommended Standard Course",
                "coding_problems": "Sample Algorithm Problems",
            }),
        })

    total_tasks = len(tasks)
    progress_percentage = round((completed_count / total_tasks * 100) if total_tasks > 0 else 0, 1)

    first_uncompleted = next((m for m in milestones_data if not m["completed"]), None)
    if first_uncompleted:
        current_focus = first_uncompleted["milestone_name"]
        focus_reason = f"You completed {completed_count} milestones. {current_focus} is your next target."
        priority = "High"
        est_completion = first_uncompleted["duration"]
    elif learn_skill:
        current_focus = f"{learn_skill} Mastered!"
        focus_reason = f"You have completed every milestone for {learn_skill}. Try another skill or apply it in a project."
        priority = "Low"
        est_completion = "Completed"
    else:
        current_focus = "Placement Ready!"
        focus_reason = "You have completed all roadmap milestones! Attempt company mock interview simulations."
        priority = "Low"
        est_completion = "Completed"

    xp_val = student_profile.xp if student_profile else 0
    streak_val = student_profile.streak if student_profile else 0

    return Response({
        "readiness_scores": scores,
        "readiness_explanation": llm_analysis["readiness_explanation"],
        "priority_ranking": llm_analysis["priority_ranking"],
        "strengths": strengths,
        "weaknesses": weaknesses,
        "priority_skills": llm_analysis["priority_skills"],
        "learning_order": llm_analysis["learning_order"],
        "target_company": None if learn_skill else target_company,
        "company_checklist": company_checklist,
        "current_focus": {
            "topic": current_focus,
            "reason": focus_reason,
            "priority": priority,
            "estimated_completion": est_completion,
        },
        "weekly_review": {
            "tasks_completed": completed_count,
            "progress_percentage": progress_percentage,
            "strongest_area": strengths[0] if strengths else "Technical Skills",
            "weakest_area": weaknesses[0] if weaknesses else "Communication",
            "recommendations": llm_analysis["priority_ranking"],
        },
        "milestones": milestones_data,
        "xp": xp_val,
        "streak": streak_val,
        "ai_generated": plan.ai_generated,
    }, status=status.HTTP_200_OK)


def generate_dynamic_plan(user, student_profile, target_role, target_company, weaknesses, llm_analysis, fingerprint):
    """
    Calls the LLM to generate a 5-step roadmap and company checklist,
    saves and returns the new LearningPlan.
    """
    skills_info = student_profile.current_skills if student_profile else []
    cgpa_info = student_profile.cgpa if student_profile else 7.5
    priority_skills = llm_analysis.get("priority_skills", weaknesses)
    learning_order = llm_analysis.get("learning_order", weaknesses)

    system_prompt = (
        "You are MentorMind AI, an expert career placement advisor. "
        "Generate a highly customised 5-step preparation roadmap for a student targeting a specific company and role.\n\n"
        "Return a JSON object with a single key 'milestones' containing exactly 5 milestone objects, each with:\n"
        "- milestone_name: concise name (string)\n"
        "- description: 1-2 sentences on what to study (string)\n"
        "- difficulty: 'Easy', 'Medium', or 'Hard' (string)\n"
        "- duration: e.g. '1 Week', '2 Weeks' (string)\n"
        "- category: e.g. 'DSA', 'System Design', 'Communication', 'Resume Optimization' (string)\n"
        "- details: list of 4 subtopics to study (list of strings)\n"
        "- resources: object with keys: official_doc, youtube_resource, practice_platform, recommended_courses, coding_problems (all strings)\n\n"
        "Sequence the milestones in the recommended learning order. Return only valid JSON, no markdown."
    )

    prompt = (
        f"Candidate Profile:\n"
        f"- Target Role: {target_role}\n"
        f"- Target Company: {target_company}\n"
        f"- Current Skills: {', '.join(skills_info) if skills_info else 'None listed'}\n"
        f"- CGPA: {cgpa_info}\n"
        f"- Key Weaknesses: {', '.join(weaknesses)}\n"
        f"- Priority Skills to Build: {', '.join(priority_skills)}\n"
        f"- Recommended Learning Order: {', '.join(learning_order)}\n\n"
        "Generate the custom 5-step placement roadmap in the recommended learning order."
    )

    milestones, ai_generated = generate_validated_milestones(
        system_prompt, prompt, get_model_for_task("reasoning_heavy"), expected_count=5
    )

    if not milestones:
        milestones = [
            {
                "milestone_name": "DSA Foundations",
                "description": "Master core arrays, strings, hashing, and sliding window concepts.",
                "difficulty": "Medium",
                "duration": "2 Weeks",
                "category": "DSA",
                "details": ["Arrays & Strings", "Hashing Maps", "Two Pointers", "Sliding Window"],
                "resources": {
                    "official_doc": "Python Data Structures Docs",
                    "youtube_resource": "Neetcode Roadmap DSA playlist",
                    "practice_platform": "LeetCode top 150 study pack",
                    "recommended_courses": "DSA on Coursera",
                    "coding_problems": "Two Sum, Longest Substring Without Repeating Characters",
                },
            },
            {
                "milestone_name": "Advanced DSA & Graphs",
                "description": "Understand complex tree hierarchies, depth-first traversals, and dynamic programming.",
                "difficulty": "Hard",
                "duration": "2 Weeks",
                "category": "DSA",
                "details": ["Binary Trees", "Graphs & BFS/DFS", "Recursion & Backtracking", "Dynamic Programming"],
                "resources": {
                    "official_doc": "GeeksforGeeks Advanced Algorithms Guide",
                    "youtube_resource": "Abdul Bari Algorithms playlist",
                    "practice_platform": "LeetCode trees tags",
                    "recommended_courses": "MIT 6.006 Intro to Algorithms",
                    "coding_problems": "Maximum Depth of Binary Tree, Course Schedule",
                },
            },
            {
                "milestone_name": "System Design Basics",
                "description": "Learn vertical/horizontal scaling, client-server models, and caching layers.",
                "difficulty": "Medium",
                "duration": "1 Week",
                "category": "System Design",
                "details": ["Vertical vs Horizontal Scaling", "Caching (Redis/Memcached)", "Database Indexing", "Load Balancers"],
                "resources": {
                    "official_doc": "System Design Primer by Donne Martin",
                    "youtube_resource": "ByteByteGo YouTube Channel",
                    "practice_platform": "Grokking the System Design Interview",
                    "recommended_courses": "System Design Fundamentals on YouTube",
                    "coding_problems": "Design a URL shortener, Design a Rate Limiter",
                },
            },
            {
                "milestone_name": "Interview Readiness",
                "description": "Simulate technical questions and formulate soft-skills using the STAR framework.",
                "difficulty": "Easy",
                "duration": "1 Week",
                "category": "Mock Interviews",
                "details": ["STAR Method behavioral templates", "Technical OOP interview questions", "HR behavioral prep", "Salary negotiating tactics"],
                "resources": {
                    "official_doc": "Indeed Career STAR Framework Guide",
                    "youtube_resource": "Clément Mihailescu mock interviews",
                    "practice_platform": "MentorMind AI Mock Interview sessions",
                    "recommended_courses": "LinkedIn Learning Interview Prep course",
                    "coding_problems": "Explain project bottlenecks under 2 minutes",
                },
            },
            {
                "milestone_name": "Resume Optimization",
                "description": "Tailor resume summaries and keyword structures to match target company hiring requirements.",
                "difficulty": "Medium",
                "duration": "1 Week",
                "category": "Resume Optimization",
                "details": ["ATS Keyword integration", "Action verb introductions", "Metrics quantification", "Section hierarchy adjustments"],
                "resources": {
                    "official_doc": "Harvard Resume Writing Guide",
                    "youtube_resource": "Professor Heather Austin resume templates",
                    "practice_platform": "MentorMind AI Resume Analyzer",
                    "recommended_courses": "Resume Writing Masterclass on Udemy",
                    "coding_problems": "Format 3 project details using action-metric-impact structure",
                },
            },
        ]

    # Generate company checklist via LLM
    user_skills = student_profile.current_skills if student_profile else []
    company_checklist = llm_generate_company_checklist(target_company, target_role, user_skills)

    plan = LearningPlan.objects.create(
        user=user,
        title=f"{target_role} Placement Roadmap",
        target_role=target_role,
        status="active",
        profile_fingerprint=fingerprint,
        ai_generated=ai_generated,
        company_checklist=company_checklist,
    )

    tasks_to_create = [
        LearningTask(
            plan=plan,
            task_name=m["milestone_name"],
            description=m["description"],
            duration=m["duration"],
            category=m["category"],
            resource_link="",
            completed=False,
            extended_metadata={
                "difficulty": m["difficulty"],
                "progress_percentage": 0,
                "details": m["details"],
                "resources": m["resources"],
            },
        )
        for m in milestones
    ]
    LearningTask.objects.bulk_create(tasks_to_create)
    return plan


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def complete_advisor_task(request, pk):
    """
    POST /api/learning/tasks/<pk>/complete/
    Marks a roadmap task as completed, awards XP, and returns updated status.
    """
    user = request.user
    try:
        task = LearningTask.objects.get(pk=pk, plan__user=user)
    except LearningTask.DoesNotExist:
        return Response({"detail": "Roadmap task not found."}, status=status.HTTP_404_NOT_FOUND)

    task.completed = not task.completed
    task.completed_at = timezone.now() if task.completed else None
    task.save()

    replanned = False
    if task.completed:
        try:
            profile = user.student_profile
            profile.xp += 50
            profile.save()
        except StudentProfile.DoesNotExist:
            pass

        replanned = adapt_remaining_milestones(task.plan, user)

    return Response(
        {"detail": "Task completion toggled successfully.", "completed": task.completed, "replanned": replanned},
        status=status.HTTP_200_OK,
    )


def adapt_remaining_milestones(plan, user):
    """
    Agentic re-planning step: whenever a milestone is completed, re-generate the
    still-incomplete milestones in light of what the student has actually finished,
    instead of leaving a static roadmap generated once at the start. Runs a single
    LLM call scoped only to the remaining tasks; on any failure it leaves the
    existing remaining tasks untouched.
    """
    remaining_tasks = list(plan.tasks.filter(completed=False).order_by("id"))
    if not remaining_tasks:
        return False

    completed_names = list(plan.tasks.filter(completed=True).order_by("id").values_list("task_name", flat=True))
    remaining_names = [t.task_name for t in remaining_tasks]

    system_prompt = (
        "You are MentorMind AI, an expert learning mentor performing an adaptive roadmap update. "
        "A student has just completed part of their roadmap. Re-generate ONLY the remaining "
        f"milestones, adjusting depth/difficulty/sequencing based on demonstrated progress.\n\n"
        f"Return a JSON object with a single key 'milestones' containing exactly {len(remaining_tasks)} "
        "milestone objects, each with:\n"
        "- milestone_name: concise name (string)\n"
        "- description: 1-2 sentences on what to study (string)\n"
        "- difficulty: 'Easy', 'Medium', or 'Hard' (string)\n"
        "- duration: e.g. '1 Week', '2 Weeks' (string)\n"
        "- category: e.g. 'DSA', 'System Design', 'Communication' (string)\n"
        "- details: list of 4 subtopics to study (list of strings)\n"
        "- resources: object with keys: official_doc, youtube_resource, practice_platform, recommended_courses, coding_problems (all strings)\n\n"
        "Keep the same logical progression as before, but refine content given what's already mastered. Return only valid JSON, no markdown."
    )
    prompt = (
        f"Roadmap title: {plan.title}\n"
        f"Milestones already completed: {', '.join(completed_names) if completed_names else 'None'}\n"
        f"Remaining milestones (in order) to refine: {', '.join(remaining_names)}\n\n"
        f"Regenerate the {len(remaining_tasks)} remaining milestones, adapting them to the student's demonstrated progress."
    )

    milestones, ai_generated = generate_validated_milestones(
        system_prompt, prompt, get_model_for_task("reasoning_heavy"),
        expected_count=len(remaining_tasks), max_repairs=1,
    )
    if not milestones or not ai_generated:
        return False

    for task_obj, m in zip(remaining_tasks, milestones):
        task_obj.task_name = m["milestone_name"]
        task_obj.description = m["description"]
        task_obj.duration = m["duration"]
        task_obj.category = m["category"]
        task_obj.extended_metadata = {
            "difficulty": m["difficulty"],
            "progress_percentage": 0,
            "details": m["details"],
            "resources": m["resources"],
        }
        task_obj.save()

    return True


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def select_target_company(request):
    """
    POST /api/learning/company/
    Set selected target company in profile career goal.
    """
    company = request.data.get("target_company")
    if not company:
        return Response({"detail": "target_company is required."}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    try:
        profile = user.student_profile
        profile.career_goal = f"Aiming to secure a role at {company}"
        profile.save()
    except StudentProfile.DoesNotExist:
        pass

    return Response({"detail": f"Target company set to {company}."}, status=status.HTTP_200_OK)
