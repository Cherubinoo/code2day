# MentorMind → Code2Day: Integration and Deployment Readiness

**What this is.** A working plan for merging `E:\GIT REPO MAIN\MentorMind_AI` into
`E:\GIT REPO MAIN\code2day` as a module, plus the fixes needed to get the combined
product close to deployable.

Everything below was read from the two repositories on **9 September 2026**. File and
line references are real — check them before you change anything, since they move.

Companion documents in this folder:

| Document | What it covers |
|---|---|
| `Code2Day_MentorMind_Rs4.16_Per_Student.pdf` | The costed AWS architecture, ₹4.16/student/month, 2 tiers |
| `MENTORMIND_MODULE_COST_BREAKDOWN.md` | Per-component cost reasoning for the MentorMind module |
| `PROJECT_DEPLOYMENT_PROFILE.md` | Code2Day's own deployment profile |
| `AWS_DEPLOYMENT_OPTIONS.md` | Earlier AWS option analysis |

---

## 0. If you are the agent performing this merge — read this first

§1–§9 explain *what* and *why*. **§10 is your runbook** with exact commands and
verification checks. Read §0 and §10 fully before running anything.

### 0.1 Stop and ask the human — do not guess

Five decisions are not yours to make. Each changes the work substantially and cannot be
inferred from the code. **Ask all five before you start**, so you are not blocked halfway.

| # | Question | Why it blocks you |
|---|---|---|
| 1 | **Does MentorMind have production data?** | If no, delete and regenerate migrations (easy). If yes, you need `db_table` overrides or `SeparateDatabaseAndState`. Getting this wrong destroys data. |
| 2 | **Are Code2Day and MentorMind students the same people?** | Determines whether §2.2's "Code2Day `StudentProfile` is canonical" is a simple repoint or a real identity design problem. |
| 3 | **Which Code2Day endpoints are genuinely public?** | Flipping the DRF default to `IsAuthenticated` (§2.3) breaks every view that relied on `AllowAny`. Only a human knows which should stay open. Do not guess per-view. |
| 4 | **Is the resume matcher's Jaccard fallback acceptable?** | Gates removing torch (§2.5), which gates Graviton. This is a product-quality judgement, not a technical one. |
| 5 | **Keep `code-executor/` or move to Lambda?** | §7. Roughly cost-equivalent; the trade is isolation vs. effort. |

If you cannot get answers, **do steps 1–4 of §10 anyway** — they are safe and
decision-independent — then stop at the gate and report.

### 0.2 Do not

- **Do not run `migrate` against any production or shared database.** Local/disposable only.
- **Do not delete, rename or relabel Code2Day's `apps.learning`.** It is the host product.
  Only the *incoming* MentorMind app gets relabelled.
- **Do not push to `main`.** Work on a branch. Do not open a PR until §10's gate passes.
- **Do not commit `.env`, secrets, or the `django-insecure-` fallback key.**
- **Do not bump dependency versions beyond the table in §2.4.** Resolving the conflict is
  in scope; a general upgrade is not.
- **Do not reformat, lint or restyle files you did not functionally change.** This diff
  will be reviewed by a human and needs to stay readable.
- **Do not attempt §6 (the cost levers) during the merge.** Those are a separate phase.
  The merge is done when the two products coexist and boot — not when they are optimised.
- **Do not "fix" failing Code2Day tests that were already failing before you started.**
  Record the pre-existing baseline first (§10 step 0) so you can tell your breakage from theirs.
- **Do not resolve §0.1's questions by picking whatever makes the build go green.**

### 0.3 Scope checksums

Counts read from the repositories on 9 September 2026. Assert against these — a mismatch
means the code moved and this guide needs re-reading, not that you should improvise.

| What | Expected | How to check |
|---|---|---|
| Directories under MentorMind `apps/` | **9** | `ls -d apps/*/ \| wc -l` |
| …of which registered in `INSTALLED_APPS` | **8** | see below — `apps/agents/` is **not** one |
| MentorMind migration files | **30** | `ls apps/*/migrations/0*.py \| wc -l` |
| MentorMind `urls.py` files | **8** | `ls apps/*/urls.py \| wc -l` |
| `core.` import statements | **12**, across **9** files | `grep -rn "from core\.\|import core\." apps/ core/` |
| Frontend `API_BASE` call sites | **128**, across **17** files | `grep -rn "API_BASE" frontend/src \| wc -l` |
| `response_format` sites (§6, later phase) | **23** | `grep -rn "response_format" apps/ core/ \| wc -l` |
| `InMemoryRateLimiter` usages (§5.7, later phase) | **21** | in Code2Day's `apps/learning/` |

> **`apps/agents/` is dead code — do not copy it.** It holds six files
> (`career_coach_agent.py`, `communication_agent.py`, `interview_agent.py`,
> `learning_agent.py`, `resume_agent.py`, `skill_gap_agent.py`) with no `__init__.py`,
> no `apps.py`, no entry in `INSTALLED_APPS`, and **no import from anywhere in the
> codebase**. They are stale duplicates of the agents that actually run, which live at
> `apps/<app>/services/<name>_agent.py`.
>
> This matters beyond tidiness: `apps/agents/communication_agent.py` and
> `apps/communication_hub/services/communication_agent.py` share a filename. Every
> `file:line` reference in this guide points at the one under `services/`. If you find
> yourself editing a file whose path lacks `services/`, you are in the dead copy.

### 0.4 Definition of done for the merge

The merge is complete when **all** of these hold — not before, and not more than these:

1. `python manage.py check` exits clean.
2. `python manage.py migrate --plan` shows no drop or rename of any Code2Day table.
3. Both products' pages load and their API calls return the same status codes they did
   before the merge.
4. Code2Day's test suite is no worse than the baseline recorded in §10 step 0.
5. The diff touches no Code2Day file except `settings.py`, `urls.py`, `requirements.txt`,
   and the frontend entry point.

Anything beyond that — security fixes (§5), cost levers (§6), Graviton (§2.5) — is a
later phase with its own gate. Report and stop.

---

## 1. The two codebases as they actually are

| | **Code2Day** (host) | **MentorMind_AI** (incoming module) |
|---|---|---|
| Django | 5.1.4 | 5.2.1 |
| DRF | 3.15.2 | 3.16.1 |
| Auth | Django session auth + custom `StudentAuthMixin` | `djangorestframework-simplejwt` 5.5.1 + token blacklist |
| `AUTH_USER_MODEL` | not set → `django.contrib.auth.User` | not set → `django.contrib.auth.User` |
| Django apps | **one**: `apps.learning` | **eight**: `accounts`, `resume_engine`, `admin`, `communication_hub`, `load_balancer`, `interview`, `knowledge_base_app`, `learning` |
| Models | ~37 in one `models.py` (1,550+ lines) | spread across apps; `accounts` has 4 |
| API mount | everything under `path("api/", ...)` | `api/auth/`, `api/communication/`, `api/resume/`, `api/interview/`, `api/learning/`, `api/knowledge-base/`, `api/load-balancer/`, `api/admin/` |
| Frontend | React **18.3.1**, Monaco editor, `xlsx` | React **19.2.6**, `recharts`, `react-calendar` |
| Routing | no `react-router` — state-driven view switching | no `react-router` — state-driven view switching |
| Code execution | `code-executor/` — FastAPI + Docker SDK, Judge0-compatible | n/a |
| Heavy deps | pandas, Pillow, openpyxl, reportlab, PyMySQL | **torch 2.10.0+cpu**, sentence-transformers, scikit-learn, numpy |
| External AI | none | Groq (`core/groq_client.py`), planned Bedrock Mantle |

The good news up front: **both projects use the stock `django.contrib.auth.User`.**
There is no custom user model on either side, so there is no user-table migration to
reconcile. That removes the single worst thing that could have been wrong here.

---

## 2. Blockers — fix these or the merged project will not boot

### 2.1 App label collision: both projects have `apps.learning`

This is a hard stop. Django requires unique app labels, and here even the directory
path is identical.

- Code2Day: `backend/apps/learning/` — the entire product (Problem, Submission, Contest, Lab, …)
- MentorMind: `apps/learning/` — two models only, `LearningPlan` and `LearningTask`
  (`apps/learning/models.py:4` and `:22`)

MentorMind's `learning` app is tiny. **Rename the incoming one**, not Code2Day's.

```python
# apps/mentormind/learning/apps.py
class LearningConfig(AppConfig):
    name = "apps.mentormind.learning"
    label = "mm_learning"        # <- was the default "learning"
```

There is precedent for this in MentorMind already: `apps/admin/apps.py` sets
`label = "mm_admin"` to avoid colliding with `django.contrib.admin`. Follow the same
`mm_` convention for every incoming app.

Renaming the label renames the DB tables (`learning_learningplan` → `mm_learning_learningplan`).
Since MentorMind is not yet deployed alongside Code2Day, take the free option: delete
MentorMind's migrations for that app and regenerate them. If MentorMind already has
production data you care about, you need `db_table` overrides or a `SeparateDatabaseAndState`
migration instead — decide this before step 3.

### 2.2 Duplicate identity models

Three model names exist on both sides, describing the same real-world things:

| Model | Code2Day | MentorMind |
|---|---|---|
| `StudentProfile` | `apps/learning/models.py:90` | `apps/accounts/models.py:5` |
| `StaffProfile` | `apps/learning/models.py:726` | `apps/accounts/models.py:72` |
| `Notification` | `apps/learning/models.py:387` | `apps/accounts/models.py:58` |

Different app labels mean no database table collision — but you would have two
competing profile rows per human, and Code2Day's `StudentAuthMixin` resolves
`request.user.student_profile` to *its* profile. Two sources of truth for "who is this
student" will produce bugs that are painful to trace.

**Recommendation: Code2Day's `StudentProfile` is canonical.** It is far richer and the
whole host application depends on it.

1. Do not migrate MentorMind's `accounts.StudentProfile` / `StaffProfile` / `Notification` in.
2. Repoint MentorMind code that reads its own profile at `user.student_profile`.
3. If MentorMind's profile has fields Code2Day's lacks, add them to Code2Day's model
   rather than keeping a second table.
4. Keep `accounts.OTPVerification` (`apps/accounts/models.py:102`) — Code2Day has no
   equivalent — under the label `mm_accounts`.

### 2.3 Two different authentication mechanisms

- Code2Day: `REST_FRAMEWORK = {"DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"]}`
  (`backend/code2day/settings.py`), with per-view `StudentAuthMixin` from
  `apps/learning/auth_utils.py` checking `is_authenticated` plus the presence of a profile.
- MentorMind: simplejwt with the blacklist app, and its frontend sends
  `Authorization: Bearer …` (`frontend/src/App.jsx:142`).

You cannot run both defaults sensibly. Pick **JWT** — it is the right fit for an SPA,
Code2Day's frontend can adopt it, and MentorMind's flows already depend on it.

```python
# backend/code2day/settings.py
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",   # note: not AllowAny
    ],
}
```

Flipping the default from `AllowAny` to `IsAuthenticated` is a **breaking change across
all ~37 Code2Day model endpoints**. That is deliberate — `AllowAny` as a project-wide
default is a security problem in its own right (§5.1) — but it means every genuinely
public endpoint must now be marked explicitly:

```python
from rest_framework.permissions import AllowAny

class PublicLeaderboardView(APIView):
    permission_classes = [AllowAny]
```

Budget real time for this. Sweep every view in `apps/learning/` and decide, one at a
time, whether it is public. Do it behind a feature branch with the test suite running.

### 2.4 Dependency version conflicts

| Package | Code2Day | MentorMind | Resolution |
|---|---|---|---|
| Django | 5.1.4 | 5.2.1 | Go to **5.2.1**; 5.1 → 5.2 is a minor upgrade, run the full test suite |
| djangorestframework | 3.15.2 | 3.16.1 | Go to **3.16.1** |
| django-cors-headers | 4.6.0 | 4.9.0 | Go to **4.9.0** |
| whitenoise | 6.8.2 | 6.12.0 | Go to **6.12.0** |
| psycopg2-binary | 2.9.9 | 2.9.11 | Go to **2.9.11** |
| openpyxl | 3.1.5 | 3.1.5 | already aligned |
| requests | 2.31.0 | 2.32.5 | Go to **2.32.5** |

### 2.5 `torch` blocks ARM, and it is not doing much

`requirements.txt` pins `torch==2.10.0+cpu` from the PyTorch CPU index, pulled in for
`sentence-transformers`. There is **no aarch64 wheel** on that index, so this single
line prevents the whole merged product from running on Graviton — which is where
roughly 10–20% of the compute saving in the cost model comes from.

What it actually powers: `apps/resume_engine/services/semantic_matcher.py:24` lazily
loads `all-MiniLM-L6-v2`, and line 26 already catches the failure. There is a working
non-torch fallback path.

Three options, in order of preference:

1. **Drop torch and sentence-transformers**, accept the existing fallback. Zero cost,
   immediate ARM unblock, some loss of matching quality. Validate the fallback against a
   sample of real resumes before committing.
2. Replace the embedding step with a hosted embedding call. Keeps quality, adds a small
   per-call cost and a network dependency.
3. Keep torch and stay on x86. Costs the Graviton discount.

It also drags ~800 MB into every image, which slows every deploy and every autoscale event.

---

## 3. Backend merge, step by step

Work on a branch. Do not merge into `main` until §8 passes.

### Step 1 — Vendor the code

```bash
ROOT="/e/GIT REPO MAIN/code2day-main"; C2="$ROOT/code2day"; MM="$ROOT/MentorMind_AI"

cd "$C2/backend"
mkdir -p apps/mentormind
# copy the eight REGISTERED app packages, plus the shared core/
# (apps/agents/ is dead code — see §0.3 — do not copy it)
for a in accounts admin communication_hub interview knowledge_base_app \
         learning load_balancer resume_engine; do
  cp -r "$MM/apps/$a" apps/mentormind/
done
cp -r "$MM/core" apps/mentormind/core
touch apps/mentormind/__init__.py
```

`core/` holds `groq_client.py`, `agents/`, `prompts/` and `rag/`. It is imported as a
top-level `core` package throughout MentorMind, so either keep it top-level in
`backend/` or update the imports. Nesting it under `apps/mentormind/core` and rewriting
imports is cleaner — Code2Day may want its own `core` later.

### Step 2 — Relabel every incoming app

For each of the eight, set an explicit `mm_`-prefixed label:

| Directory | `name` | `label` |
|---|---|---|
| `apps/mentormind/accounts` | `apps.mentormind.accounts` | `mm_accounts` |
| `apps/mentormind/learning` | `apps.mentormind.learning` | `mm_learning` |
| `apps/mentormind/communication_hub` | `apps.mentormind.communication_hub` | `mm_communication_hub` |
| `apps/mentormind/interview` | `apps.mentormind.interview` | `mm_interview` |
| `apps/mentormind/resume_engine` | `apps.mentormind.resume_engine` | `mm_resume_engine` |
| `apps/mentormind/load_balancer` | `apps.mentormind.load_balancer` | `mm_load_balancer` |
| `apps/mentormind/knowledge_base_app` | `apps.mentormind.knowledge_base_app` | `mm_knowledge_base` |
| `apps/mentormind/admin` | `apps.mentormind.admin` | `mm_admin` (already set) |

Then delete `apps/mentormind/*/migrations/0*.py` and regenerate — assuming §2.1's
"no production data yet" holds.

### Step 3 — Merge settings

Use **Code2Day's `settings.py` as the base.** It is the more careful of the two: it
warns when `DJANGO_SECRET_KEY` is unset in production and defaults `ALLOWED_HOSTS` to
localhost. MentorMind's falls back to `ALLOWED_HOSTS = ["*"]` (`main/settings.py:18`).

Add to `INSTALLED_APPS`:

```python
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "apps.mentormind.accounts",
    "apps.mentormind.resume_engine",
    "apps.mentormind.admin",
    "apps.mentormind.communication_hub",
    "apps.mentormind.load_balancer",
    "apps.mentormind.interview",
    "apps.mentormind.knowledge_base_app",
    "apps.mentormind.learning",
```

Carry across MentorMind's `LLM_CONFIG` (`main/settings.py:189`) and the Whisper model
settings (`:218`–`:219`). Do **not** carry across `CORS_ALLOW_ALL_ORIGINS = True`
(`:154`) — see §5.1.

### Step 4 — Mount the URLs

MentorMind's namespaces don't collide with Code2Day's `api/` mount, but nesting them
keeps the split obvious and leaves room for versioning:

```python
# backend/code2day/urls.py
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.learning.urls")),                 # Code2Day, unchanged
    path("api/mm/auth/",           include("apps.mentormind.accounts.urls")),
    path("api/mm/communication/",  include("apps.mentormind.communication_hub.urls")),
    path("api/mm/resume/",         include("apps.mentormind.resume_engine.urls")),
    path("api/mm/interview/",      include("apps.mentormind.interview.urls")),
    path("api/mm/learning/",       include("apps.mentormind.learning.urls")),
    path("api/mm/knowledge-base/", include("apps.mentormind.knowledge_base_app.urls")),
    path("api/mm/load-balancer/",  include("apps.mentormind.load_balancer.urls")),
    path("api/mm/admin/",          include("apps.mentormind.admin.urls")),
]
```

Every MentorMind frontend fetch path changes accordingly (`/api/auth/` → `/api/mm/auth/`).
There are enough of these that a scripted find-and-replace is safer than doing it by hand.

### Step 5 — Reconcile identity

Per §2.2: drop MentorMind's profile models, repoint its code at
`request.user.student_profile`, and keep `OTPVerification`.

### Step 6 — Migrate

```bash
python manage.py makemigrations
python manage.py migrate --plan     # read this before running it
python manage.py migrate
```

---

## 4. Frontend merge

This is the messier half, and it is worth planning before touching code.

**The core problem: neither app has a router.** Both switch views from component state
(`App.jsx` in each). There is no route tree to merge, so "just import the other app" is
not available.

Two viable approaches:

### Option A — Add a router, mount both apps as route subtrees *(recommended)*

```bash
cd "/e/GIT REPO MAIN/code2day-main/code2day/frontend"
npm install react-router-dom
```

```jsx
// src/App.jsx
<BrowserRouter>
  <Routes>
    <Route path="/*"           element={<Code2DayApp />} />
    <Route path="/mentormind/*" element={<MentorMindApp />} />
  </Routes>
</BrowserRouter>
```

Both existing `App.jsx` files become `Code2DayApp.jsx` and `MentorMindApp.jsx` with
their internal state-switching intact. Nothing internal has to change on day one, and
you get real URLs, deep links and browser back-button behaviour — which neither product
has today.

### Option B — Nest MentorMind as one more view in Code2Day's switch

Faster, no new dependency, but it inherits the no-URLs problem and gets steadily harder
to maintain. Reasonable only if you are demoing next week.

### Frontend items to settle either way

1. **React 18.3.1 → 19.2.6.** Code2Day must upgrade. Check `@monaco-editor/react` 4.7.0
   against React 19 first — it is the highest-risk dependency in the merge.
2. **One API base.** MentorMind reads `VITE_API_BASE` (`frontend/src/App.jsx:28`).
   Standardise on it and delete the other resolution path. A recent Code2Day commit
   ("Fix production API_BASE resolution") suggests this has already bitten once.
3. **One token store.** Two apps writing `localStorage` under different keys will
   silently log users out of one another. Pick one key, one refresh path.
4. **CSS collision.** Code2Day ships `styles.css`, `header-fix.css`, `layout-fix.css`;
   MentorMind ships `App.css`, `index.css`, `premium-theme.css` — all global. Expect
   visual breakage. Scope them with CSS Modules, or prefix MentorMind's selectors.
5. **Bundle size.** Monaco alone is large. Route-split so a student opening the speaking
   practice page does not download the code editor.

---

## 5. Security fixes to land before this is exposed

These are independent of the merge. Some are already true in production today.

### 5.1 CORS is fully open, with credentials

`MentorMind_AI/main/settings.py`:

```python
146  CORS_ALLOWED_ORIGINS = [ ... ]        # a real allowlist
154  CORS_ALLOW_ALL_ORIGINS = True         # ...which this overrides completely
155  CORS_ALLOW_CREDENTIALS = True
```

Line 154 makes lines 146–153 dead code. Combined with credentials, any origin can make
authenticated cross-origin calls. Git history shows this was added deliberately
(`dc02e39 Fix login connection error and enable CORS_ALLOW_ALL_ORIGINS`) — it fixed a
login bug by removing the protection. Delete line 154 and put the real origins in the
allowlist. Code2Day already handles this correctly with `CORS_ALLOWED_ORIGINS` plus
`CSRF_TRUSTED_ORIGINS`.

### 5.2 `ALLOWED_HOSTS = ["*"]` fallback

`main/settings.py:18` falls back to `["*"]` when the environment variable is unset,
which disables Django's Host header validation. Code2Day's equivalent defaults to
`127.0.0.1,localhost,testserver`. Use Code2Day's behaviour.

### 5.3 Hardcoded `SECRET_KEY` fallback

`main/settings.py:10-11` embeds a `django-insecure-` key as the default. Code2Day
already warns loudly when the env var is missing in production — adopt that, and fail
hard rather than warning.

### 5.4 `AllowAny` as the project-wide DRF default

Code2Day's `REST_FRAMEWORK` sets `DEFAULT_PERMISSION_CLASSES` to `AllowAny`, so every
view is public unless it individually opts in via `StudentAuthMixin`. One forgotten
mixin is a data leak. Covered by the §2.3 flip.

### 5.5 The fabricated transcript

`apps/communication_hub/services/communication_agent.py:377` —
`_fallback_transcript()` returns a fixed sentence when transcription fails, and the
pipeline then scores it as though the student had said it. A student gets a real grade
for words they never spoke.

**This must not ship at any budget.** Fail the request and tell the user to retry.

### 5.6 The graded endpoint is unthrottled

Nothing rate-limits speaking submissions, and each one costs money at Groq and Bedrock.
That makes the AI bill attacker-controlled. Two layers, both required:

- Cloudflare rate limiting per IP at the edge (free)
- A server-side per-student monthly quota — this is what the cost model in the PDF is
  built on, and without it the budget is an estimate rather than a ceiling

### 5.7 Rate limiting resets on restart and does not span nodes

`apps/learning/auth_utils.py` implements `InMemoryRateLimiter` — its own docstring says
"Resets on server restart (acceptable for single-process gunicorn / runserver
deployments on EC2)". It is used in **21 places** across `apps/learning/`.

The costed architecture runs 2–4 app nodes with multiple workers each. A per-process
in-memory limiter under N processes lets through N times the intended rate, and forgets
everything on every deploy. Move it to Valkey/Redis before scaling out.

### 5.8 Bedrock Mantle retains prompts for 30 days

Mantle defaults `store` to `true` with 30-day retention. That means student speech
transcripts sit in a third-party store by default. Set `store: false` explicitly, or
document the retention in your privacy policy.

---

## 6. Changes the cost model depends on

The ₹4.16/student/month figures in the PDF **assume these are done.** Deploying the
current code onto that infrastructure exceeds both budget ceilings.

| # | Change | Where |
|---|---|---|
| 1 | Collapse Committee-of-Experts from 3 LLM calls to 1 | `communication_agent.py:125` (`coe_evaluate_text`), `:297` (`chat_practice`) |
| 2 | Prompt-cache the rubric / system prompt | `core/groq_client.py` |
| 3 | Trim the response JSON schemas | 23 `response_format={"type": "json_object"}` sites across `apps/` and `core/` |
| 4 | Hard-disable DeepSeek reasoning mode | Bedrock request construction |
| 5 | Browser Web Speech API for practice; Groq Whisper only when graded | `ConversationPartner.jsx` already does browser ASR |
| 6 | Route non-graded work to `gpt-oss-20b`, DeepSeek only for grading | `groq_client.py:100` — the `provider=` branch already exists |
| 7 | Keyword task router instead of an LLM classifier | `load_balancer_agent.py:44` requests a `"classifier"` model key **that does not exist in `LLM_CONFIG`**; the keyword fallback at `:47` is what actually runs today |
| 8 | Server-side per-student quota on the graded endpoint | §5.6 |
| 9 | Valkey content-hash cache on judge submissions | ~25% of submits are re-runs of identical code |
| 10 | Remove torch → unblock Graviton | §2.5 |
| 11 | Sessions and hot reads into Valkey; set `CONN_MAX_AGE`; gunicorn → gevent | neither project sets `CONN_MAX_AGE`; neither configures `CACHES` for a shared backend |
| 12 | Delete `_fallback_transcript()` | §5.5 |

Together these take one graded evaluation from **$0.00903 → $0.00179**, a 5.1× reduction.

Two more, not on the critical path but worth knowing:

- **RAG does a full table scan.** `core/rag/vector_store.py` `search()` pulls every chunk
  for a source type into Python and scores it there. Fine now, a latency cliff as content
  grows. `pgvector` is the fix and costs nothing.
- **Speaking duration is estimated from file size.**
  `communication_agent.py:72` — `estimated_duration_secs = max(3.0, file_size / 4000.0)`,
  then line 73 derives words-per-minute from it. That is a guess about bitrate, and the
  WPM score inherits the error. Groq's `verbose_json` response format returns the real
  duration at no extra cost.

---

## 7. A note on the code executor

The PDF costs code execution as **Lambda arm64**. Code2Day already has a working
executor: `code-executor/main.py`, a FastAPI service using the Docker SDK to run
submissions in containers, Judge0-compatible.

Being straight about this: **the two are roughly cost-equivalent.**

- Lambda, as costed: $0.31/month (Tier A), $8.53/month (Tier B)
- Keeping the Docker executor: about 2 extra vCPU during the 176-hour peak window,
  ≈ $8.64/month on-demand at either tier

At Tier B it is a wash. At Tier A the existing executor costs roughly **$8.30/month
more** (≈₹790) — which is more than Tier A's ₹112 worst-case headroom, though
comfortably inside the ₹2,212 expected headroom once uneven student usage is accounted for.

So choose on **isolation and effort, not price**:

- **Keep `code-executor/`** if you want to ship sooner. It works today. It needs a
  dedicated node with a Docker daemon so it does not compete with the web tier for CPU,
  and it needs its container escape surface reviewed since it runs untrusted student code.
- **Move to Lambda** for a fresh microVM per submission and scale-to-zero. This is a
  rewrite — `docker.from_env()` spawning containers does not port to Lambda — so treat it
  as a later phase, not part of the merge.

If you keep the Docker executor, adjust the Tier A budget by ₹790/month.

---

## 8. Deployment readiness checklist

Ordered so each phase is verifiable and the irreversible money commitment comes last.

### Phase 1 — The merge compiles and runs
- [ ] Eight apps relabelled `mm_*`, no app-label collision
- [ ] `python manage.py check` clean
- [ ] `makemigrations` produces no unexpected table drops; read `migrate --plan`
- [ ] Identity reconciled: one `StudentProfile`, MentorMind repointed at `user.student_profile`
- [ ] Dependencies unified on the higher versions; both test suites green
- [ ] All MentorMind frontend paths updated to `/api/mm/…`

### Phase 2 — Security (do not expose before this passes)
- [ ] `CORS_ALLOW_ALL_ORIGINS` deleted; real allowlist in place
- [ ] `ALLOWED_HOSTS` has no `["*"]` fallback
- [ ] `SECRET_KEY` fails hard when unset in production
- [ ] DRF default flipped to `IsAuthenticated`; every public view marked `AllowAny` explicitly
- [ ] `_fallback_transcript()` deleted; failed transcription returns an error
- [ ] Per-student quota enforced server-side on the graded endpoint
- [ ] Rate limiting moved from `InMemoryRateLimiter` to Valkey/Redis
- [ ] Bedrock `store: false`, or retention documented

### Phase 3 — Make the AI spend bounded
- [ ] Input, output and cached token counts logged on every LLM call
- [ ] Reasoning mode explicitly off, asserted in a test
- [ ] Alarm on output-tokens-per-call > 700
- [ ] A synthetic abuse run cannot push spend past the quota

### Phase 4 — Cut cost per evaluation
- [ ] Levers 1–7 and 9 from §6 shipped
- [ ] Measured cost per graded evaluation ≤ **$0.00179**

### Phase 5 — Make it horizontally scalable
- [ ] Sessions and hot reads in Valkey
- [ ] `CONN_MAX_AGE` set
- [ ] gunicorn on gevent workers; Celery for the graded path so no HTTP worker blocks on inference
- [ ] Two app nodes serve traffic with sessions surviving a node kill

### Phase 6 — Port to Graviton
- [ ] torch and sentence-transformers removed, fallback quality validated on real resumes
- [ ] Full dependency tree audited for aarch64 wheels
- [ ] Test suite green on arm64

### Phase 7 — Load test before committing money
- [ ] k6 or Locust at 2,000 and 3,000 concurrent against the **reserved baseline alone**
- [ ] Confirm the 40 req/s per vCPU assumption the sizing rests on
- [ ] Baseline-only headroom ≥ 1.5×

### Phase 8 — Commit, then make it survivable
- [ ] **Only now** buy the 3-year No-Upfront Reserved Instances, sized by phase 7
- [ ] Scheduled scaling for the 8-hour window + target-tracking for fluctuation
- [ ] pgBackRest base backup + WAL archive to S3
- [ ] **A timed restore rehearsal actually performed, RTO written down**
- [ ] Alarms on replication lag, disk, and the AI spend counter

> Do not buy reservations before phase 7. A 3-year No-Upfront RI is a 36-month
> obligation. It is the largest saving in the design and the least reversible decision
> in it.

---

## 9. Open questions

Things I could not settle from the code alone:

1. **Does MentorMind have production data?** The whole "delete and regenerate
   migrations" shortcut in §2.1 and step 2 depends on the answer being no. If it is yes,
   you need `db_table` overrides or `SeparateDatabaseAndState` instead.
2. **Do the two products share a student population?** If a Code2Day student and a
   MentorMind student are the same person with the same login, §2.2 is straightforward.
   If they are separate cohorts, identity needs a real design.
3. **Is `@monaco-editor/react` 4.7.0 React 19-safe?** Highest-risk item in the frontend
   merge and worth checking on day one.
4. **Does the resume matcher's Jaccard fallback produce acceptable results?** This gates
   the torch removal, which gates Graviton, which is worth 10–20% of compute.
5. **Who operates PostgreSQL?** The budget assumes self-managed on EC2 rather than RDS —
   that is a 4.1× cost difference in Mumbai and it transfers patching, backup and failover
   to your team. If nobody owns that, use RDS and re-cost.
6. **What is the actual concurrency pattern?** `PROJECT_DEPLOYMENT_PROFILE.md` records
   DAU and concurrency as UNKNOWN. Everything in the cost model is sized against the
   figures you supplied (2,000 and 3,000 peak), not measured ones.

---

## 10. Mechanical runbook

For the agent doing the merge. Run in order. **Each step ends with a verification that
must pass before you continue.** If one fails, stop and report — do not work around it.

### Working layout

Both codebases sit side by side under one parent folder:

```
E:\GIT REPO MAIN\code2day-main\
├── code2day\          <- host product; the merge target
│   ├── backend\
│   └── frontend\
└── MentorMind_AI\     <- incoming module
    ├── apps\
    ├── core\
    ├── frontend\
    └── main\
```

Set these once and use them throughout:

```bash
ROOT="/e/GIT REPO MAIN/code2day-main"
C2="$ROOT/code2day"
MM="$ROOT/MentorMind_AI"
```

> **Neither folder is a git repository** — there is no `.git` in either, so `git switch`,
> `git status` and `git diff` are not available to you. Step 0 uses a filesystem snapshot
> instead. If the human has since initialised git, prefer a branch and say so in your
> handover.

### Step 0 — Snapshot and baseline

No version control means your only undo is a copy. **Take it before touching anything.**

```bash
cd "$ROOT/.."
cp -r "code2day-main" "code2day-main.BEFORE-MERGE"
ls -d "code2day-main.BEFORE-MERGE"    # must exist before you continue
```

Record what was already broken, so you can distinguish your breakage from theirs:

```bash
cd "$C2/backend"
python manage.py check  > /tmp/base_check.txt 2>&1 || true
python manage.py test   > /tmp/base_tests.txt 2>&1 || true
tail -5 /tmp/base_tests.txt          # <- the baseline you must not regress
```

Snapshot MentorMind's checksums (§0.3):

```bash
cd "$MM"
ls -d apps/*/ | wc -l                                        # expect 9 (incl. dead apps/agents)
ls apps/*/migrations/0*.py | wc -l                           # expect 30
ls apps/*/urls.py | wc -l                                    # expect 8
grep -rn "from core\.\|import core\." apps/ core/ | wc -l    # expect 12
grep -rn "API_BASE" frontend/src | wc -l                     # expect 128
grep -rn "/api/mm/" frontend/src | wc -l                     # expect 0
```

**Verify:** all six match §0.3. If not, stop — the code has moved since this guide was
written.

### Step 1 — Rewrite MentorMind's frontend API paths *(do this before copying)*

Rewrite in place in the MentorMind repo first. Doing it after the copy risks hitting
Code2Day's own `/api/` paths.

```bash
cd "$MM/frontend/src"

# idempotence guard — must print 0
grep -r "/api/mm/" . | wc -l

grep -rl "API_BASE" . | xargs sed -i \
  -e 's#/api/auth/#/api/mm/auth/#g' \
  -e 's#/api/communication/#/api/mm/communication/#g' \
  -e 's#/api/resume/#/api/mm/resume/#g' \
  -e 's#/api/interview/#/api/mm/interview/#g' \
  -e 's#/api/learning/#/api/mm/learning/#g' \
  -e 's#/api/knowledge-base/#/api/mm/knowledge-base/#g' \
  -e 's#/api/load-balancer/#/api/mm/load-balancer/#g' \
  -e 's#/api/admin/#/api/mm/admin/#g'
```

**Verify** — the rewritten counts must match the originals exactly:

```bash
grep -rhoE '/api/mm/[a-z0-9-]+/' . | sort | uniq -c | sort -rn
```

Expected, and these are the pre-merge counts:

| Path | Count |
|---|---|
| `/api/mm/admin/` | 33 |
| `/api/mm/auth/` | 23 |
| `/api/mm/communication/` | 12 |
| `/api/mm/resume/` | 9 |
| `/api/mm/learning/` | 5 |
| `/api/mm/interview/` | 4 |
| `/api/mm/load-balancer/` | 1 |
| **Total** | **87** |

```bash
grep -rhoE '/api/[a-z0-9-]+/' . | grep -v '/api/mm/' | sort | uniq -c   # expect empty
```

> `/api/knowledge-base/` has **zero** frontend references — that app has no UI consumer.
> Expected, not a bug. Still mount it (§3 step 4); flag it to the human as possibly dead code.

### Step 2 — Vendor the backend code

Copy the eight registered apps explicitly. **Do not use `cp -r "$MM/apps/"*`** — that
would drag in the dead `apps/agents/` (§0.3).

```bash
cd "$C2/backend"
mkdir -p apps/mentormind

for a in accounts admin communication_hub interview knowledge_base_app \
         learning load_balancer resume_engine; do
  cp -r "$MM/apps/$a" apps/mentormind/
done

cp -r "$MM/core" apps/mentormind/core
touch apps/mentormind/__init__.py
```

**Verify:**

```bash
ls apps/                                  # expect exactly: __init__.py  learning  mentormind
ls -d apps/mentormind/*/ | wc -l          # expect 9  (8 apps + core)
ls apps/mentormind/ | grep -c agents      # expect 0  — the dead app must NOT be here
ls apps/learning/ | wc -l                 # Code2Day's app must still be intact
```

Confirm you have not touched the host app (no git, so diff against the snapshot):

```bash
diff -rq --exclude=__pycache__ --exclude="*.pyc" \
  "$ROOT/../code2day-main.BEFORE-MERGE/code2day/backend/apps/learning" \
  "$C2/backend/apps/learning"                                    # expect no output
```

### Step 3 — Rewrite `core.` imports

```bash
cd "$C2/backend"
grep -rl "from core\.\|import core\." apps/mentormind/ | xargs sed -i \
  -e 's/\bfrom core\./from apps.mentormind.core./g' \
  -e 's/\bimport core\./import apps.mentormind.core./g'
```

**Verify:**

```bash
grep -rn "from apps\.mentormind\.core\.\|import apps\.mentormind\.core\." apps/mentormind/ | wc -l  # expect 12
grep -rn "^from core\.\|^import core\.\|[^.]\bfrom core\." apps/mentormind/ | wc -l                 # expect 0
```

The nine files that should have changed:

```
apps/mentormind/communication_hub/services/communication_agent.py
apps/mentormind/communication_hub/views.py
apps/mentormind/interview/services/interview_agent.py
apps/mentormind/learning/advisor_views.py
apps/mentormind/learning/services/learning_agent.py
apps/mentormind/load_balancer/services/load_balancer_agent.py
apps/mentormind/resume_engine/services/resume_agent.py
apps/mentormind/resume_engine/services/semantic_matcher.py
apps/mentormind/resume_engine/views.py
```

### Step 4 — Relabel all eight apps

Edit each `apps/mentormind/<app>/apps.py` to set both `name` and `label` per the table in
§3 step 2. `admin` already has `label = "mm_admin"` — only its `name` needs updating.

**Verify** — every incoming app has an `mm_` label and the right dotted name:

```bash
grep -h "name = \|label = " apps/mentormind/*/apps.py
```

Expect 8 `name = "apps.mentormind.…"` lines and 8 `label = "mm_…"` lines.

> **This is the gate.** Steps 0–4 are safe and reversible. Everything past here depends on
> §0.1 question 1 (production data). If you do not have that answer, stop and report now.

### Step 5 — Migrations

**Only if the human confirmed MentorMind has no production data:**

```bash
cd "$C2/backend"
find apps/mentormind -path "*/migrations/0*.py" -delete
find apps/mentormind -path "*/migrations/__init__.py" | wc -l   # expect 8 — keep these
```

If there *is* production data: stop. Do not delete migrations. Report back that
`db_table` overrides or `SeparateDatabaseAndState` are needed.

### Step 6 — Settings

Base is `$C2/backend/code2day/settings.py`, unchanged except for additions.

Add to `INSTALLED_APPS` (§3 step 3 has the exact block). Carry across MentorMind's
`LLM_CONFIG` (`main/settings.py:189`) and Whisper model settings (`:218`–`:219`).

**Do not carry across**, and confirm each is absent from the merged file:

```bash
grep -n "CORS_ALLOW_ALL_ORIGINS" code2day/settings.py     # expect empty  (§5.1)
grep -n 'ALLOWED_HOSTS = \["\*"\]'  code2day/settings.py  # expect empty  (§5.2)
grep -n "django-insecure-"          code2day/settings.py  # expect empty  (§5.3)
```

Merge `requirements.txt` per §2.4 — higher version wins on every conflict. Keep the
`--extra-index-url` line only if torch is being retained (§0.1 question 4).

### Step 7 — URLs

Apply the `urlpatterns` block from §3 step 4 to `$C2/backend/code2day/urls.py`.

**Verify** the mounted prefixes match exactly what step 1 rewrote:

```bash
python manage.py show_urls 2>/dev/null | grep "/api/mm/" | head
# no django-extensions? then just confirm 8 include() lines:
grep -c "apps.mentormind" code2day/urls.py     # expect 8
```

### Step 8 — Check and migrate

```bash
python manage.py check                       # must exit 0
python manage.py makemigrations
python manage.py migrate --plan | tee /tmp/plan.txt
grep -iE "DeleteModel|RemoveField|RenameModel|RenameField" /tmp/plan.txt
```

**That grep must return nothing for any Code2Day table.** If it names a `learning_*`
table, stop immediately — you are about to destroy host data.

```bash
python manage.py migrate
```

### Step 9 — Frontend merge

Per §4. Option A (add `react-router-dom`) is recommended. Also required:

- Upgrade Code2Day React 18.3.1 → 19.2.6. **Check `@monaco-editor/react` 4.7.0 against
  React 19 first** — highest-risk dependency in the merge (§9 question 3).
- One `VITE_API_BASE`; delete the other resolution path.
- One localStorage token key across both apps.
- Scope the six global CSS files (§4 item 4) or expect visual breakage.

### Step 10 — Final verification against §0.4

```bash
cd "$C2/backend"
python manage.py check                            # clean
python manage.py test  > /tmp/new_tests.txt 2>&1 || true
diff <(tail -5 /tmp/base_tests.txt) <(tail -5 /tmp/new_tests.txt)   # no regression
```

Diff the whole host product against the pre-merge snapshot. **Only the four expected
files may differ:**

```bash
BEFORE="$ROOT/../code2day-main.BEFORE-MERGE/code2day"
diff -rq --exclude=__pycache__ --exclude="*.pyc" --exclude=node_modules \
  "$BEFORE/backend" "$C2/backend" | grep -v "apps/mentormind"
```

Expected output names only:

- `backend/code2day/settings.py`
- `backend/code2day/urls.py`
- `backend/requirements.txt`
- plus `Only in …/apps: mentormind`

Anything else — especially any file under `backend/apps/learning/` — means you changed
the host product. Revert it.

### Step 11 — Report, do not proceed

Write a short handover covering:

- Which of §0.1's five questions were answered, and what was decided
- The four §0.3 checksums, before and after
- Test baseline vs. final
- Anything you had to deviate from in this guide, and why
- The §5 security fixes and §6 cost levers as **explicitly not done**, with a pointer to
  their phases in §8

Then stop. Do not start §5, §6 or §2.5 without a fresh instruction — each has its own
gate in §8, and the security phase in particular needs human sign-off on which Code2Day
endpoints stay public (§0.1 question 3).

---

*Prepared 9 September 2026 against the repositories as they stood that day.
Line references and the §0.3 checksums will drift — verify before editing.*
