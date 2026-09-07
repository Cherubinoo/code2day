"""Views extracted from the original monolithic apps/learning/views.py
(module: admin/llm). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class AdminLLMProvidersView(APIView):
    """System Admin: list/add the LLM providers used for the test-case and
    lab-report generation fallback chain — a React-page equivalent of the
    Django admin LLMProvider CRUD, so providers can be managed without
    leaving the admin dashboard."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        providers = LLMProvider.objects.all().order_by("priority", "id")
        data = [{
            "id": p.id,
            "name": p.name,
            "base_url": p.base_url,
            "api_key_masked": _mask_api_key(p.api_key),
            "model_name": p.model_name,
            "priority": p.priority,
            "is_active": p.is_active,
            "use_streaming": p.use_streaming,
            "temperature": p.temperature,
            "top_p": p.top_p,
            "max_tokens": p.max_tokens,
            "timeout_seconds": p.timeout_seconds,
            "extra_body": p.extra_body,
            "input_cost_per_million": float(p.input_cost_per_million),
            "output_cost_per_million": float(p.output_cost_per_million),
            "updated_at": p.updated_at.isoformat(),
        } for p in providers]
        return Response({"providers": data})

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        data = request.data
        name = (data.get("name") or "").strip()
        base_url = (data.get("base_url") or "").strip()
        api_key = (data.get("api_key") or "").strip()
        model_name = (data.get("model_name") or "").strip()
        if not (name and base_url and api_key and model_name):
            return Response({"error": "name, base_url, api_key, and model_name are required."}, status=400)
        if LLMProvider.objects.filter(name=name).exists():
            return Response({"error": "A provider with this name already exists."}, status=400)

        try:
            provider = LLMProvider.objects.create(
                name=name, base_url=base_url, api_key=api_key, model_name=model_name,
                priority=int(data.get("priority", 0)),
                is_active=bool(data.get("is_active", True)),
                use_streaming=bool(data.get("use_streaming", False)),
                temperature=float(data.get("temperature", 0.4)),
                top_p=float(data.get("top_p", 0.95)),
                max_tokens=int(data.get("max_tokens", 6000)),
                timeout_seconds=int(data.get("timeout_seconds", 30)),
                extra_body=data.get("extra_body") or {},
                input_cost_per_million=float(data.get("input_cost_per_million", 0) or 0),
                output_cost_per_million=float(data.get("output_cost_per_million", 0) or 0),
            )
        except (TypeError, ValueError) as exc:
            return Response({"error": f"Invalid field value: {exc}"}, status=400)

        return Response({"id": provider.id, "detail": "Provider created."}, status=201)

class AdminLLMProviderDetailView(APIView):
    """System Admin: update (including reordering priority / toggling
    active) or delete one LLM provider."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, provider_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        provider = LLMProvider.objects.filter(id=provider_id).first()
        if not provider:
            return Response({"error": "Not found"}, status=404)

        data = request.data
        for field in ("name", "base_url", "model_name"):
            if field in data and str(data[field]).strip():
                setattr(provider, field, str(data[field]).strip())
        # Only overwrite api_key if a real value was sent — the frontend
        # only ever shows the masked form, so never let a masked string
        # (or a blank field left untouched) accidentally wipe the real key.
        incoming_key = (data.get("api_key") or "").strip()
        if incoming_key and "..." not in incoming_key:
            provider.api_key = incoming_key
        if "priority" in data:
            provider.priority = int(data["priority"])
        if "is_active" in data:
            provider.is_active = bool(data["is_active"])
        if "use_streaming" in data:
            provider.use_streaming = bool(data["use_streaming"])
        if "temperature" in data:
            provider.temperature = float(data["temperature"])
        if "top_p" in data:
            provider.top_p = float(data["top_p"])
        if "max_tokens" in data:
            provider.max_tokens = int(data["max_tokens"])
        if "timeout_seconds" in data:
            provider.timeout_seconds = int(data["timeout_seconds"])
        if "extra_body" in data:
            provider.extra_body = data["extra_body"] or {}
        if "input_cost_per_million" in data:
            provider.input_cost_per_million = float(data["input_cost_per_million"] or 0)
        if "output_cost_per_million" in data:
            provider.output_cost_per_million = float(data["output_cost_per_million"] or 0)

        try:
            provider.save()
        except (TypeError, ValueError) as exc:
            return Response({"error": f"Invalid field value: {exc}"}, status=400)

        return Response({"detail": "Provider updated."})

    def delete(self, request, provider_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        provider = LLMProvider.objects.filter(id=provider_id).first()
        if not provider:
            return Response({"error": "Not found"}, status=404)
        provider.delete()
        return Response(status=204)

class AdminLLMUsageSummaryView(APIView):
    """System Admin: the LLM API cost/usage dashboard — aggregates
    LLMUsageLog (written by every generation call, see
    services/testcase_generator.py's _log_llm_usage) into totals, a
    per-provider breakdown, a per-feature breakdown (schema generation,
    explanation, test cases, hints, ...), a daily trend, and a recent-
    activity table. `estimated_cost` on each row was computed at log time
    from whatever cost-per-million rates the provider had THEN, so this
    reflects real historical cost even after a provider's pricing is
    edited later.

    ?days=N (default 30, 0/"all" for no cutoff) bounds every aggregate
    below by created_at."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        from django.db.models import Sum, Count, Q as _Q
        from django.db.models.functions import TruncDate

        days_param = (request.query_params.get("days") or "30").strip().lower()
        qs = LLMUsageLog.objects.all()
        since = None
        if days_param not in ("0", "all"):
            try:
                days = int(days_param)
            except ValueError:
                days = 30
            since = timezone.now() - timezone.timedelta(days=days)
            qs = qs.filter(created_at__gte=since)

        totals = qs.aggregate(
            requests=Count("id"),
            successes=Count("id", filter=_Q(success=True)),
            failures=Count("id", filter=_Q(success=False)),
            prompt_tokens=Sum("prompt_tokens"),
            completion_tokens=Sum("completion_tokens"),
            total_tokens=Sum("total_tokens"),
            cost=Sum("estimated_cost"),
        )

        by_provider = list(
            qs.values("provider_name")
            .annotate(
                requests=Count("id"), successes=Count("id", filter=_Q(success=True)),
                failures=Count("id", filter=_Q(success=False)),
                total_tokens=Sum("total_tokens"), cost=Sum("estimated_cost"),
            )
            .order_by("-cost")
        )
        by_feature = list(
            qs.values("feature")
            .annotate(requests=Count("id"), total_tokens=Sum("total_tokens"), cost=Sum("estimated_cost"))
            .order_by("-requests")
        )
        by_day = list(
            qs.annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(requests=Count("id"), cost=Sum("estimated_cost"))
            .order_by("day")
        )
        recent = list(
            qs.order_by("-created_at")[:100]
            .values("id", "provider_name", "model_name", "feature", "label", "success",
                    "prompt_tokens", "completion_tokens", "total_tokens", "estimated_cost",
                    "error_message", "created_at")
        )

        def _num(x):
            return float(x) if x is not None else 0

        return Response({
            "since": since.isoformat() if since else None,
            "totals": {
                "requests": totals["requests"] or 0,
                "successes": totals["successes"] or 0,
                "failures": totals["failures"] or 0,
                "prompt_tokens": totals["prompt_tokens"] or 0,
                "completion_tokens": totals["completion_tokens"] or 0,
                "total_tokens": totals["total_tokens"] or 0,
                "cost": _num(totals["cost"]),
            },
            "by_provider": [
                {**row, "cost": _num(row["cost"]), "total_tokens": row["total_tokens"] or 0}
                for row in by_provider
            ],
            "by_feature": [
                {**row, "feature": row["feature"] or "(uncategorized)", "cost": _num(row["cost"]), "total_tokens": row["total_tokens"] or 0}
                for row in by_feature
            ],
            "by_day": [
                {"day": row["day"].isoformat(), "requests": row["requests"], "cost": _num(row["cost"])}
                for row in by_day
            ],
            "recent": [
                {
                    "id": row["id"], "provider_name": row["provider_name"], "model_name": row["model_name"],
                    "feature": row["feature"] or "(uncategorized)", "label": row["label"], "success": row["success"],
                    "prompt_tokens": row["prompt_tokens"], "completion_tokens": row["completion_tokens"],
                    "total_tokens": row["total_tokens"], "cost": _num(row["estimated_cost"]),
                    "error_message": row["error_message"][:300], "created_at": row["created_at"].isoformat(),
                }
                for row in recent
            ],
        })

class AdminLLMProviderParseSnippetView(APIView):
    """System Admin: parse a pasted OpenAI-SDK-style code snippet into
    provider config fields, for review before creating the provider —
    matches the exact snippet shape NVIDIA's API docs hand out."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        snippet = request.data.get("snippet") or ""
        if not snippet.strip():
            return Response({"error": "Paste a code snippet first."}, status=400)

        parsed = _parse_openai_snippet(snippet)
        missing = [f for f in ("base_url", "api_key", "model_name") if not parsed.get(f)]
        if missing:
            return Response({
                "error": f"Could not find {', '.join(missing)} in the snippet — "
                         f"check it includes OpenAI(base_url=..., api_key=...) and "
                         f".chat.completions.create(model=..., ...).",
                "parsed": parsed,
            }, status=400)

        return Response({"parsed": parsed})

