from django.conf import settings
from django.db import migrations


def seed_provider(apps, schema_editor):
    LLMProvider = apps.get_model("learning", "LLMProvider")

    seed_3 = getattr(settings, "LLM_PROVIDER_SEED_3", {})

    if seed_3.get("api_key"):
        LLMProvider.objects.get_or_create(
            name="DeepSeek V3.2 (Bedrock Mantle)",
            defaults=dict(
                base_url=seed_3["base_url"],
                api_key=seed_3["api_key"],
                model_name=seed_3["model_name"],
                priority=20,
                is_active=True,
                use_streaming=False,
                temperature=0.4,
                top_p=0.95,
                max_tokens=6000,
                timeout_seconds=seed_3["timeout_seconds"],
                extra_body={},
            ),
        )


def unseed_provider(apps, schema_editor):
    LLMProvider = apps.get_model("learning", "LLMProvider")
    LLMProvider.objects.filter(name="DeepSeek V3.2 (Bedrock Mantle)").delete()


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0076_systemupdate'),
    ]

    operations = [
        migrations.RunPython(seed_provider, unseed_provider),
    ]
