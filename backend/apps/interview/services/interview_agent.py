import os
import json
import logging
import PyPDF2
from django.conf import settings
from core.groq_client import generate_completion, get_model_for_task
from core.rag.retriever import RAGRetriever

logger = logging.getLogger(__name__)

def get_kb_context(interview_type):
    """
    Extracts text from relevant PDF files in Postgres RAG db based on interview type.
    """
    try:
        retriever = RAGRetriever()
        context = retriever.retrieve_context(query=interview_type, source_type="interview", k=3)
        if context:
            return context
    except Exception as e:
        logger.error(f"[InterviewAgent] RAG retrieval failed: {e}")

    # Fallback to local files
    mapping = {
        'Behavioral / HR': ['behavioral_questions.pdf', 'hr_interview_questions.pdf'],
        'Python Developer': ['python_interview_questions.pdf'],
        'SQL Developer': ['sql_interview_questions.pdf'],
        'Machine Learning': ['ml_interview_questions.pdf'],
        'General Software Engineering': ['python_interview_questions.pdf', 'sql_interview_questions.pdf']
    }
    
    pdf_names = mapping.get(interview_type, ['hr_interview_questions.pdf'])
    kb_dir = os.path.join(settings.BASE_DIR, 'knowledge_base', 'interview')
    
    texts = []
    for name in pdf_names:
        path = os.path.join(kb_dir, name)
        if os.path.exists(path):
            try:
                with open(path, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    for page in reader.pages:
                        page_text = page.extract_text()
                        if page_text:
                            texts.append(page_text)
            except Exception as e:
                logger.error(f"[InterviewAgent] Error reading PDF {path}: {e}")
        else:
            logger.warning(f"[InterviewAgent] PDF path does not exist: {path}")
            
    return "\n".join(texts)



DIFFICULTY_PROMPTS = {
    "easy": (
        "The question must be at EASY difficulty: test basic definitions, simple concepts, "
        "or straightforward factual recall. Assume the candidate is a beginner or is struggling."
    ),
    "medium": (
        "The question must be at MEDIUM difficulty: require application of concepts, "
        "multi-step reasoning, or real-world scenario thinking. Appropriate for a competent candidate."
    ),
    "hard": (
        "The question must be at HARD difficulty: demand deep technical insight, "
        "system-design trade-offs, advanced domain knowledge, or complex situational judgment. "
        "Challenge a highly fluent and knowledgeable candidate."
    ),
}


def generate_next_question(session, history_list, student_profile=None, difficulty="medium"):
    """
    Generates a personalized, context-aware interview question at the specified difficulty level.
    difficulty: 'easy' | 'medium' | 'hard'
    """
    kb_content = get_kb_context(session.interview_type)

    profile_info = ""
    if student_profile:
        profile_info = (
            f"Candidate Name: {student_profile.full_name}\n"
            f"Department: {student_profile.department or 'General'}\n"
            f"Target Role: {student_profile.target_role}\n"
            f"Current Skills: {student_profile.current_skills}\n"
            f"Career Goal: {student_profile.career_goal}\n"
        )

    history_context = ""
    for i, h in enumerate(history_list):
        history_context += f"Q{i+1}: {h.question}\nAnswer: {h.answer}\n"

    diff_instruction = DIFFICULTY_PROMPTS.get(difficulty, DIFFICULTY_PROMPTS["medium"])

    system_prompt = (
        "You are an expert technical and behavioral recruiter conducting a mock job interview. "
        "Your task is to generate the next interview question. "
        "Keep the question professional, concise (1-2 sentences), and conversational. "
        f"{diff_instruction}\n"
        "You must align the question with:\n"
        f"1. The interview type: {session.interview_type}\n"
        f"2. The Knowledge Base topics/concepts: {kb_content}\n"
        f"3. The candidate's academic background and skills:\n{profile_info}\n"
        f"4. The target job description if provided: {session.job_description}\n\n"
        "Avoid repeating questions already asked in the history. "
        "Respond with ONLY the question text, no surrounding tags, quotes, or preambles."
    )

    prompt = (
        f"Difficulty requested: {difficulty.upper()}\n"
        f"Previous conversation history:\n{history_context}\n"
        f"Generate Question #{session.current_question_index}."
    )

    question = generate_completion(
        prompt=prompt,
        system_prompt=system_prompt,
        model=get_model_for_task("chat_quality")
    )
    if not question:
        question = f"Can you explain your experience and understanding of key concepts in {session.interview_type}?"
    return question.strip().strip('"\'')


def evaluate_question_response(question, answer, interview_type, target_role="Software Engineer"):
    """
    Evaluates a candidate's answer and returns structured linguistic + technical scores using the CoE method.
    Returns: score, grammar, fluency, vocabulary, confidence, feedback, model_answer, difficulty_for_next, reasoning
    """
    # Expert 1: Technical & Behavioral Content Accuracy
    expert1_sys = (
        f"You are Expert 1, a Technical & Behavioral Recruiter for a {target_role} role. "
        f"Analyze the candidate's answer for technical accuracy, conceptual correctness, depth, and structural relevance."
        "Provide a clear, brief critique of the candidate's core content strengths and weaknesses."
    )
    expert1_prompt = f"Question: {question}\nCandidate's Answer: {answer}\nInterview Type: {interview_type}"
    critique_1 = generate_completion(
        prompt=expert1_prompt,
        system_prompt=expert1_sys,
        model=get_model_for_task("chat_quality")
    ) or "Expert 1: Technical content is basic."

    # Expert 2: Speech Flow, Grammar & Professional Delivery
    expert2_sys = (
        "You are Expert 2, a Communication and Speech Coach. "
        "Analyze the candidate's answer strictly for grammatical correctness, sentence structure, flow, coherence, "
        "professional vocabulary usage, and delivery confidence."
        "Provide a clear, brief critique focusing on language improvement areas."
    )
    expert2_prompt = f"Candidate's Answer: {answer}"
    critique_2 = generate_completion(
        prompt=expert2_prompt,
        system_prompt=expert2_sys,
        model=get_model_for_task("chat_quality")
    ) or "Expert 2: Communication flow is acceptable."

    # Master Synthesizer
    system_prompt = (
        "You are the Master Recruiter and Coordinator of the Committee of Experts (CoE). "
        "Review the question, candidate's answer, Expert 1's technical critique, and Expert 2's delivery critique. "
        "Consolidate their views, resolve any conflicts, and output a final evaluation scorecard.\n\n"
        "You must return a JSON object with EXACTLY these keys:\n"
        "- score: float 0–100 (overall performance)\n"
        "- grammar: int 0–100\n"
        "- fluency: int 0–100\n"
        "- vocabulary: int 0–100\n"
        "- confidence: int 0–100\n"
        "- feedback: string — 2-3 sentence encouraging coaching feedback\n"
        "- model_answer: string — a high-quality 3-4 sentence reference answer\n"
        "- difficulty_for_next: string — one of 'easy', 'medium', or 'hard' (easy if score<60 or fluency<55; hard if score>=80 and vocabulary>=75 and fluency>=78; else medium)\n"
        "- reasoning: string — a detailed paragraph describing the CoE discussion, expert consensus, and explanation of why these scores were assigned.\n\n"
        "Format the response strictly as valid JSON, with no other text."
    )

    prompt = (
        f"Question: {question}\n"
        f"Candidate's Answer: {answer}\n\n"
        f"Expert 1 (Technical) Critique: {critique_1}\n\n"
        f"Expert 2 (Delivery) Critique: {critique_2}"
    )

    result = None
    try:
        response = generate_completion(
            prompt=prompt,
            system_prompt=system_prompt,
            response_format={"type": "json_object"},
            model=get_model_for_task("chat_quality")
        )
        if response:
            result = json.loads(response)
    except Exception as e:
        logger.error(f"[InterviewAgent] Error in CoE question evaluation: {e}")

    if not result:
        result = {
            "score": 70.0,
            "grammar": 70,
            "fluency": 70,
            "vocabulary": 70,
            "confidence": 68,
            "feedback": "Your answer covers the basics but could benefit from more specific examples or technical terminology.",
            "model_answer": "A perfect response would clearly detail the concept with a real-world project example, discussing the trade-offs and steps taken.",
            "difficulty_for_next": "medium",
            "reasoning": "Fallback evaluation applied due to panel timeout."
        }
    return result


def evaluate_overall_session(session, history_list):
    """
    Aggregates session history and generates a comprehensive scorecard using the CoE method.
    Returns overall score, mentor-style feedback narrative, strengths list, weaknesses list, recommendations list, and reasoning.
    """
    qas = ""
    total_score = 0.0
    for h in history_list:
        qas += f"Question: {h.question}\nAnswer: {h.answer}\nScore: {h.score}\nFeedback: {h.feedback}\n\n"
        total_score += h.score or 0.0
        
    calculated_avg = total_score / len(history_list) if history_list else 70.0

    # Expert 1: Technical Mastery & Concept Coverage
    expert1_sys = (
        f"You are Expert 1, a Senior Engineer and Technical Lead. "
        "Analyze the aggregate Q&A history of this candidate's interview session. "
        "Review the technical depth, concept coverage, accuracy, and engineering strengths/weaknesses. "
        "Provide a concise summary critique of their technical and job-readiness profile."
    )
    expert1_prompt = f"Interview History:\n{qas}"
    critique_1 = generate_completion(
        prompt=expert1_prompt,
        system_prompt=expert1_sys,
        model=get_model_for_task("chat_quality")
    ) or "Expert 1: Technical knowledge is basic but acceptable."

    # Expert 2: Soft Skills & Professional Communication Coach
    expert2_sys = (
        "You are Expert 2, a Professional Interview Coach. "
        "Analyze the aggregate Q&A history strictly for soft skills, communication clarity, structuring (like STAR method), "
        "fluency progression, confidence levels, and delivery pacing."
        "Provide a concise summary critique of their soft skills and presentation style."
    )
    expert2_prompt = f"Interview History:\n{qas}"
    critique_2 = generate_completion(
        prompt=expert2_prompt,
        system_prompt=expert2_sys,
        model=get_model_for_task("chat_quality")
    ) or "Expert 2: Delivery was clean, with normal pacing."

    # Master Coordinator
    system_prompt = (
        "You are the Master Interview Panel Coordinator of the Committee of Experts (CoE). "
        "Review the candidate's baseline performance, Expert 1's technical summary, and Expert 2's delivery summary. "
        "Produce a final overall scorecard and actionable learning roadmap.\n\n"
        "You must return a JSON object with EXACTLY these keys:\n"
        "- score: float (0.0 to 100.0, overall performance, using the calculated baseline as guide)\n"
        "- feedback: string (encouraging mentor-style summary narrative of 3-4 sentences in the first person)\n"
        "- strengths: a list of 2-3 specific strengths (strings)\n"
        "- weaknesses: a list of 2-3 specific weaknesses or gaps (strings)\n"
        "- recommendations: a list of 2-3 actionable advice items (strings)\n"
        "- reasoning: string (a detailed explanation of the expert discussion consensus and why these scores were assigned)\n\n"
        "Format the response strictly as valid JSON, with no other text."
    )
    
    prompt = (
        f"Calculated baseline average: {calculated_avg:.1f}\n"
        f"Expert 1 Critique: {critique_1}\n\n"
        f"Expert 2 Critique: {critique_2}"
    )
    
    result = None
    try:
        response = generate_completion(
            prompt=prompt,
            system_prompt=system_prompt,
            response_format={"type": "json_object"},
            model=get_model_for_task("chat_quality")
        )
        if response:
            result = json.loads(response)
    except Exception as e:
        logger.error(f"[InterviewAgent] Error in CoE overall session evaluation: {e}")
        
    if not result:
        result = {
            "score": round(calculated_avg, 1),
            "feedback": "Overall, you did a solid job in this mock interview. You demonstrated familiarity with key topics. Continue practicing structured communication.",
            "strengths": ["Clear communication", "Understand basic concepts"],
            "weaknesses": ["Could provide deeper technical explanations", "Lacked structured examples in some answers"],
            "recommendations": ["Practice the STAR method for behavioral questions", "Brush up on advanced technical definitions"],
            "reasoning": "Fallback overall evaluation applied due to panel timeout."
        }
    return result
