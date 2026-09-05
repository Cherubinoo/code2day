"""Version tags for the judging framework's own moving parts.

Bump whichever constant changes whenever a change to that piece could
affect how an *already-submitted* solution would be judged if re-run —
e.g. a new adapter changing the wire format for an existing type kind, a
different bracket-token normalization, a comparator becoming stricter/
looser. Recorded on every generic-judge execution (see integration.py) so
a historical submission's result can be explained ("this was judged under
wrapper_version 1.0.0, before X changed") even after the framework moves
on — a real reproducibility need for a platform whose judging logic keeps
evolving, not just a formality.

Not yet persisted as its own column on a model (Problem/TestCase execution
history) — today it's carried on every response and structured log line,
which is enough for debugging a live discrepancy; wiring it into permanent
storage per-submission is a natural follow-up once "replay this exact
submission under its original wrapper" becomes a real product need.
"""

WRAPPER_VERSION = "1.0.0"
TYPE_SYSTEM_VERSION = "1.0.0"
SERIALIZER_VERSION = "1.0.0"

__all__ = ["WRAPPER_VERSION", "TYPE_SYSTEM_VERSION", "SERIALIZER_VERSION"]
