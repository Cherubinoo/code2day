import os
from groq import Groq
from django.conf import settings
import requests
import json

def get_groq_client():
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            env_path = os.path.join(base_dir, ".env")
            if os.path.exists(env_path):
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#"):
                            parts = line.split("=", 1)
                            if len(parts) == 2 and parts[0].strip() == "GROQ_API_KEY":
                                api_key = parts[1].strip().strip("'\"")
                                os.environ["GROQ_API_KEY"] = api_key
                                break
        except Exception as e:
            print(f"[groq_client] Error parsing .env manually: {e}")

    if api_key:
        return Groq(api_key=api_key)
    return None

def get_model_for_task(task_type, provider="groq"):
    try:
        return settings.LLM_CONFIG[provider]["models"][task_type]
    except Exception:
        fallback_models = {
            "classifier": "llama-3.1-8b-instant",
            "chat_quality": "llama-3.3-70b-versatile",
            "reasoning_heavy": "llama-3.3-70b-versatile",
            "speech_fast": "whisper-large-v3-turbo",
            "speech_best": "whisper-large-v3-turbo",
            "multilingual": "qwen-2.5-32b",
            "reasoning_experimental": "deepseek-r1-distill-llama-70b"
        }
        return fallback_models.get(task_type, "llama-3.3-70b-versatile")

def generate_completion(prompt, system_prompt=None, response_format=None, model="llama-3.3-70b-versatile", provider="groq"):
    if provider == "groq":
        client = get_groq_client()
        if not client:
            print("[groq_client] Groq client is not initialized.")
            return None

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        kwargs = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
        }

        if response_format:
            kwargs["response_format"] = response_format

        try:
            chat_completion = client.chat.completions.create(**kwargs)
            return chat_completion.choices[0].message.content
        except Exception as e:
            print(f"[groq_client] Groq error generating completion: {e}")
            return None

    return None
