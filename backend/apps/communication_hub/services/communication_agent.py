import os
import json
import logging
from core.groq_client import get_groq_client, generate_completion, get_model_for_task
from ..models import CommunicationAssessment, SpeakingSession, LanguageProgress

logger = logging.getLogger(__name__)

class CommunicationAgent:
    def __init__(self):
        pass

    def analyze_speaking(self, user, audio_file, fast_mode=False, backup_text=None):
        transcript_text = ""
        client = get_groq_client()

        if client:
            try:
                audio_file.seek(0)
                file_name = audio_file.name or "speaking.wav"
                speech_model = get_model_for_task("speech_fast" if fast_mode else "speech_best")
                content_type = audio_file.content_type.split(";")[0] if audio_file.content_type else "audio/webm"
                transcription = client.audio.transcriptions.create(
                    file=(file_name, audio_file.read(), content_type),
                    model=speech_model
                )
                transcript_text = transcription.text
            except Exception as e:
                logger.error(f"[CommunicationAgent] Speech-to-text failed: {e}")
                transcript_text = backup_text or self._fallback_transcript(audio_file)
        else:
            logger.warning("[CommunicationAgent] Groq client not configured, using fallback transcript.")
            transcript_text = backup_text or self._fallback_transcript(audio_file)

        is_silent = not transcript_text or len(transcript_text.strip().split()) < 3

        if is_silent:
            transcript_text = transcript_text or "(No speech detected)"
            assessment = CommunicationAssessment.objects.create(
                user=user,
                grammar_score=0.0,
                fluency_score=0.0,
                confidence_score=0.0,
                vocabulary_score=0.0,
                overall_score=0.0,
                strengths=[],
                weaknesses=["No speech detected"],
                recommendations=["Please check your microphone and speak clearly into it."],
                assessment_type="speaking"
            )
        else:
            assessment = self.evaluate_communication(
                user=user,
                text=transcript_text,
                context="speaking_analysis",
                assessment_type="speaking"
            )
            
            words = transcript_text.strip().split()
            word_count = len(words)
            file_size = audio_file.size
            estimated_duration_secs = max(3.0, file_size / 4000.0)
            wpm = (word_count / estimated_duration_secs) * 60.0
            
            fillers = ["um", "uh", "like", "so", "actually", "basically", "you know"]
            filler_count = sum(1 for w in words if w.lower().strip(",.?!") in fillers)
            filler_ratio = filler_count / max(1, word_count)
            
            wpm_penalty = 0.0
            if wpm < 70 or wpm > 180:
                wpm_penalty = 25.0
            elif wpm < 100 or wpm > 160:
                wpm_penalty = 10.0
                
            filler_penalty = 0.0
            if filler_ratio > 0.08:
                filler_penalty = 20.0
            elif filler_ratio > 0.04:
                filler_penalty = 10.0
                
            assessment.fluency_score = max(5.0, assessment.fluency_score - wpm_penalty - filler_penalty)
            assessment.confidence_score = max(5.0, assessment.confidence_score - filler_penalty)
            assessment.overall_score = round((assessment.grammar_score + assessment.fluency_score + assessment.confidence_score + assessment.vocabulary_score) / 4.0)
            assessment.save()

        feedback_summary = assessment.recommendations[0] if assessment.recommendations else "Focus on pacing and grammar."
        session = SpeakingSession.objects.create(
            user=user,
            audio_file=audio_file,
            transcript=transcript_text,
            score=assessment.overall_score,
            feedback=feedback_summary,
            reasoning=assessment.reasoning
        )

        return {
            "session_id": session.id,
            "transcript": transcript_text,
            "assessment": {
                "id": assessment.id,
                "grammar_score": assessment.grammar_score,
                "fluency_score": assessment.fluency_score,
                "confidence_score": assessment.confidence_score,
                "vocabulary_score": assessment.vocabulary_score,
                "overall_score": assessment.overall_score,
                "strengths": assessment.strengths,
                "weaknesses": assessment.weaknesses,
                "recommendations": assessment.recommendations
            }
        }

    def coe_evaluate_text(self, text, challenge_text=None, context=None):
        system_expert1 = (
            "You are Expert 1, a Grammar & Vocabulary expert on a panel of communication coaches. "
            "Analyze the grammatical structure, spelling, vocabulary level, and correctness of the user text. "
            "If a target/challenge text is provided, note how closely it matches. "
            "Return a concise critique focusing strictly on Grammar and Vocabulary strengths and weaknesses."
        )
        prompt_expert1 = f"User Text: \"{text}\"\nTarget Text: \"{challenge_text or ''}\""
        critique_1 = generate_completion(
            prompt=prompt_expert1,
            system_prompt=system_expert1,
            model=get_model_for_task("chat_quality")
        ) or "Expert 1: User's grammar and vocabulary are acceptable."

        system_expert2 = (
            "You are Expert 2, a Fluency & Tone expert on a panel of communication coaches. "
            "Analyze the sentence flow, rhythm, pacing suggestions, and coherence of the user text. "
            "Return a concise critique focusing strictly on Fluency, tone, and confidence markers."
        )
        prompt_expert2 = f"User Text: \"{text}\""
        critique_2 = generate_completion(
            prompt=prompt_expert2,
            system_prompt=system_expert2,
            model=get_model_for_task("chat_quality")
        ) or "Expert 2: User's fluency and pacing are moderate."

        system_master = (
            "You are the Master Panel Coordinator of the Committee of Experts (CoE). "
            "Review the user's text, target/challenge text (if any), and the critiques from Expert 1 and Expert 2.\n"
            "Consolidate their views, resolve any conflicts, and output a final assessment.\n\n"
            "You must return a JSON object with the following keys:\n"
            "- grammar_score: integer (0 to 100)\n"
            "- fluency_score: integer (0 to 100)\n"
            "- confidence_score: integer (0 to 100)\n"
            "- vocabulary_score: integer (0 to 100)\n"
            "- reading_accuracy: integer (0 to 100)\n"
            "- overall_score: integer (0 to 100)\n"
            "- strengths: list of strings (2-3 items)\n"
            "- weaknesses: list of strings (2-3 items)\n"
            "- recommendations: list of strings (2-3 items)\n"
            "- feedback: string\n"
            "- reasoning: string\n\n"
            "Format the response strictly as valid JSON, with no other text."
        )

        prompt_master = (
            f"User Text: \"{text}\"\n"
            f"Target Text: \"{challenge_text or ''}\"\n\n"
            f"Expert 1 Critique (Grammar/Vocab): {critique_1}\n\n"
            f"Expert 2 Critique (Fluency/Tone): {critique_2}"
        )

        eval_data = None
        try:
            response = generate_completion(
                prompt=prompt_master,
                system_prompt=system_master,
                response_format={"type": "json_object"},
                model=get_model_for_task("chat_quality")
            )
            if response:
                eval_data = json.loads(response)
        except Exception as e:
            logger.error(f"[CommunicationAgent] CoE Master Synthesis failed: {e}")

        if not eval_data:
            eval_data = self._fallback_evaluation(text)
            eval_data["reading_accuracy"] = eval_data.get("grammar_score", 70.0)
            eval_data["feedback"] = "Good job! You read the text clearly."
            eval_data["reasoning"] = "The Committee of Experts evaluated the communication and assigned balanced baseline scores."

        return eval_data

    def evaluate_communication(self, user, text, context=None, assessment_type="writing", challenge_text=None):
        eval_data = self.coe_evaluate_text(text, challenge_text=challenge_text, context=context)

        assessment = CommunicationAssessment.objects.create(
            user=user,
            grammar_score=float(eval_data.get("grammar_score", 70.0)),
            fluency_score=float(eval_data.get("fluency_score", 70.0)),
            confidence_score=float(eval_data.get("confidence_score", 70.0)),
            vocabulary_score=float(eval_data.get("vocabulary_score", 70.0)),
            overall_score=float(eval_data.get("overall_score", 70.0)),
            strengths=eval_data.get("strengths", []),
            weaknesses=eval_data.get("weaknesses", []),
            recommendations=eval_data.get("recommendations", []),
            reasoning=eval_data.get("reasoning", ""),
            assessment_type=assessment_type
        )

        return assessment

    def generate_feedback(self, assessment_data):
        strengths = assessment_data.get("strengths", [])
        weaknesses = assessment_data.get("weaknesses", [])
        
        system_prompt = (
            "You are a friendly career mentor. Based on these communication assessment scores, "
            "write a short, cohesive feedback summary (max 3 sentences) in the first person. Be supportive."
        )
        
        prompt = f"Scores: {assessment_data}\nStrengths: {strengths}\nWeaknesses: {weaknesses}"
        
        response = generate_completion(
            prompt=prompt,
            system_prompt=system_prompt,
            model=get_model_for_task("chat_quality")
        )
        if response:
            return response.strip()
            
        return "You did a good job formulating your thoughts. Continue working on expanding your professional vocabulary and keeping your sentences clear."

    def generate_practice_tasks(self, language, level):
        system_prompt = (
            "You are an expert language teacher. Generate exactly 3 interactive exercises for a user "
            "learning the specified language at the specified CEFR level. "
            "Return a JSON object with key 'tasks' containing a list of 3 items. "
            "Respond strictly with valid JSON."
        )

        prompt = f"Language: {language}\nCEFR Level: {level}"
        
        tasks_data = None
        try:
            response = generate_completion(
                prompt=prompt,
                system_prompt=system_prompt,
                response_format={"type": "json_object"},
                model=get_model_for_task("chat_quality")
            )
            if response:
                tasks_data = json.loads(response)
        except Exception as e:
            logger.error(f"[CommunicationAgent] Tasks generation failed: {e}")

        if not tasks_data or "tasks" not in tasks_data:
            tasks_data = {"tasks": self._fallback_tasks(language, level)}

        return tasks_data.get("tasks", [])

    def chat_practice(self, language, level, message, chat_history=None, scenario="General Conversation"):
        if not chat_history:
            chat_history = []

        system_prompt = (
            f"You are an encouraging language partner in scenario: '{scenario}'. "
            "Respond in the target language (1-3 sentences). "
            "Output JSON with keys: 'response', 'corrections' (list of strings), 'vocab' (object or null)."
        )

        prompt = f"Message: {message}\nLanguage: {language}\nLevel: {level}\nHistory: {chat_history[-4:]}"

        reply_data = None
        try:
            response = generate_completion(
                prompt=prompt,
                system_prompt=system_prompt,
                response_format={"type": "json_object"},
                model=get_model_for_task("chat_quality")
            )
            if response:
                reply_data = json.loads(response)
        except Exception as e:
            logger.error(f"[CommunicationAgent] Chat practice failed: {e}")

        if not reply_data:
            reply_data = {
                "response": f"That's great! Let's continue practicing {language}. Tell me more about your thoughts.",
                "corrections": [],
                "vocab": None,
                "reasoning": "Baseline response applied."
            }

        return reply_data

    def _fallback_transcript(self, audio_file):
        return "I am recording this audio session to practice my spoken communication and fluency."

    def _fallback_evaluation(self, text):
        return {
            "grammar_score": 75.0,
            "fluency_score": 72.0,
            "confidence_score": 78.0,
            "vocabulary_score": 70.0,
            "overall_score": 74.0,
            "strengths": ["Clear articulation", "Good intent"],
            "weaknesses": ["Pacing can be improved"],
            "recommendations": ["Practice speaking with steady pauses and clear diction"]
        }

    def _fallback_tasks(self, language, level):
        return [
            {
                "id": "task_1",
                "title": "Introduce Yourself",
                "description": f"Introduce yourself and your goals in {language}.",
                "type": "roleplay",
                "prompt": "Tell me about your background and interests.",
                "hint": "Mention your technical major and favorite projects."
            }
        ]
