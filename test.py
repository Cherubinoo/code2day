import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

API_KEY = os.getenv("LLM_API_2_MANTLE_KEY")

if not API_KEY:
    raise ValueError("LLM_API_2_MANTLE_KEY not found in .env")

# Change this if your Mantle endpoint differs
BASE_URL = "https://mantle.us-east-1.api.aws/v1"

client = OpenAI(
    api_key=os.getenv("LLM_API_2_MANTLE_KEY"),
    base_url="https://bedrock-mantle.us-east-1.api.aws/v1",
)

print("=" * 80)
print("Fetching models...")
print("=" * 80)

try:
    models = client.models.list()
except Exception as e:
    print(f"Failed to list models:\n{e}")
    raise SystemExit(1)

if not models.data:
    print("No models returned.")
    raise SystemExit(0)

valid = []
invalid = []

for model in sorted(models.data, key=lambda m: m.id):
    model_id = model.id

    print(f"\nTesting: {model_id}")

    try:
        response = client.chat.completions.create(
            model=model_id,
            messages=[
                {
                    "role": "user",
                    "content": "Reply with exactly the word OK."
                }
            ],
            max_tokens=10,
            temperature=0,
        )

        text = response.choices[0].message.content

        print(f"✅ VALID")
        print(f"Response: {text!r}")

        valid.append(model_id)

    except Exception as e:
        print(f"❌ INVALID")
        print(f"Reason: {e}")

        invalid.append((model_id, str(e)))

print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)

print(f"\nValid Models ({len(valid)}):")
for m in valid:
    print(f"  ✅ {m}")

print(f"\nInvalid Models ({len(invalid)}):")
for m, err in invalid:
    print(f"  ❌ {m}")
    print(f"     {err}")