# MENTORMIND MODULE — FULL COST BREAKDOWN

Companion to `AWS_DEPLOYMENT_OPTIONS.md` and `PROJECT_DEPLOYMENT_PROFILE.md`.
Those two cost *Code2Day*. This one costs **MentorMind_AI (Learn2Lead) integrated into Code2Day as a module**.

**Research date:** 9 September 2026. Region **ap-south-1 (Mumbai)**, INR at **₹85/USD** — the same basis as
`AWS_DEPLOYMENT_OPTIONS.md`. Shared-infrastructure line items are carried over from §6 of that document.
AI/API rates are September 2026 list prices; sources in §8. **Re-check every figure in the AWS Pricing
Calculator before committing.**

**Decisions already taken:**
- **ASR:** **Groq `whisper-large-v3-turbo`** at $0.04/audio-hour. 6× cheaper than Deepgram, 13–36× cheaper than
  Amazon Transcribe, and accuracy is not the binding constraint when the transcript feeds a fluency score
  rather than a document anyone reads.
- **Text LLM:** **DeepSeek V3.2 on Amazon Bedrock**, $0.62/M input · $1.85/M output — replacing Groq
  `gpt-oss-20b/120b` for all five agents. See §2.2, including the two things that must be got right.

---

## 0. THE HEADLINE

| Build | ~300 concurrent | ~1,000 concurrent |
|---|---|---|
| Code2Day alone, no module | ₹3,825 | ₹20,570 |
| § 9 — minimum viable, ₹7,000 target *(HA and caps sacrificed)* | **₹6,120** ✅ | ₹6,970 *(credits only)* |
| **§10 — everything works well, still tight** ★ **recommended** | **₹12,798** | **₹35,513** |
| §6 — as-is, no optimisation | — | ₹50,006 |
| §6 — as-is, full voice adoption | — | ₹93,500 |

**Read §10 first if the question is "what should we actually budget."** §9 exists to answer "how cheap can this
go," and the answer costs high availability, the async path, or the product's daily limits. A ₹7,000 total is
reachable at ~300 concurrent; at 1,000 concurrent it needs AWS Educate/Academy credits, because infrastructure
alone at that concurrency is ₹12,750–20,570 before a single AI call.

**The concurrency target is still unmeasured** (§9.2). It is the difference between ₹12,798 and ₹35,513 —
₹273,000 over a year — and two SQL queries settle it.

Five findings matter more than any line item:

1. **The LLM is the largest single cost line in the whole estate — larger than all of Code2Day's
   infrastructure.** At target, DeepSeek V3.2 costs **$282/month** against **$242** for every AWS service
   combined. This reverses the earlier Groq-based conclusion that AI spend was a rounding error: it is
   **~6× Groq's $45** and **48% of the bill**. It buys real things (§2.2.3) — but it must be budgeted as the
   primary cost centre.
1b. **The speaking path makes 3 LLM calls per submission, not 1.** The Committee-of-Experts pattern in
   `communication_agent.py:125` triples both token sides and the latency. **Collapsing it to one call saves
   $81/month and is the single biggest lever available.** See §2.2.
2. **Use the serverless model ID, never a Marketplace endpoint.** DeepSeek V3.2 is fully managed and serverless
   on Bedrock in **ap-south-1**. A Bedrock *Marketplace* deployment bills per **instance-hour** like a SageMaker
   real-time endpoint — an `ml.g5.12xlarge` is ~$7.09/hr ≈ **$5,176/month whether it serves one request or ten
   million**, and it does not scale to zero. For this workload that is ~23× the serverless cost. See §2.2.1.
3. **`torch` blocks Graviton.** `requirements.txt` pins `torch==2.10.0+cpu` from the PyTorch CPU index, which
   publishes x86_64 wheels only. On the recommended `t4g` (arm64) instances this install fails. See §4.
4. **ElastiCache stops being optional.** `AWS_DEPLOYMENT_OPTIONS.md` §6 defers Redis to the 10,000-user tier.
   MentorMind's `FileBasedCache` breaks the moment there is more than one container, so Redis gets pulled
   forward to the 2,000-user tier. It is the only new *infrastructure* component the module forces.

---

## 1. LOAD MODEL

`PROJECT_DEPLOYMENT_PROFILE.md` §1530 lists DAU and peak concurrency as **UNKNOWN — requires measurement**.
Everything below therefore rests on stated assumptions. All costs scale linearly with them.

**Concurrency → DAU.** For a timetable-driven campus platform, peak concurrency runs ~25–35% of DAU during a
class hour. So the stated target of **500–1,000 concurrent** maps to **~2,000–4,000 DAU**, i.e. the top of
`AWS_DEPLOYMENT_OPTIONS.md`'s 10,000-user tier. This document anchors on **3,000 DAU**.

**Voice volume per user per day**, read from the code:

| Feature | Length | Source |
|---|---|---|
| Speak Analysis | 60 s | `SpeakAnalysis.jsx:140` — `setFinalDuration(60)` |
| Daily Challenge | 2 recordings, ~60 s each | `DailyChallenge.jsx` teleprompter + webcam |
| **Total** | **~3 audio-min/user/day** | |
| Conversation Partner | **excluded** — browser `SpeechRecognition`, $0 server cost | `ConversationPartner.jsx:160` |

**Adoption.** Not every daily active user records audio daily. Two cases:

| Case | Voice adoption | Monthly audio (3,000 DAU × 22 weekdays) |
|---|---|---|
| **Base** | 40% of DAU/day | 79,200 min = **1,320 audio-hours** |
| **High** | 100% of DAU/day | 198,000 min = **3,300 audio-hours** |

---

## 2. AI / API COSTS

### 2.1 Speech-to-text — Groq `whisper-large-v3-turbo` @ $0.04/audio-hour

| Tier | Audio-hours/mo | Cost |
|---|---|---|
| 2,000 registered, base | 264 | **$10.56** / ₹898 |
| 10,000 registered, base | 1,320 | **$52.80** / ₹4,488 |
| 10,000 registered, high | 3,300 | **$132.00** / ₹11,220 |

Groq bills a **10-second minimum per request**. All recordings here exceed that, so the headline rate holds.
(Amazon Transcribe's 15-second minimum *would* have rounded up the short Daily Challenge clips — one of several
reasons it lost.)

**Required change, no cost:** both call sites currently request the expensive model. `fast_mode` defaults to
`False` (`communication_agent.py:13`), nothing ever passes it, and `views.py:555` hardcodes `speech_best` —
so every request runs `large-v3` at ~$0.111/hr instead of turbo at $0.04/hr. **Flipping this is a ~3× saving
on the largest AI line item** and the `speech_fast` key is already configured.

**Second required change, no cost:** add `response_format="verbose_json"` with word-level timestamps. Pacing is
currently derived from `file_size / 4000.0` (`communication_agent.py:72`) — a byte-size guess that varies with
codec and bitrate, meaning every words-per-minute penalty is computed off noise. Word timestamps fix it for free.

**Known limitation, accepted:** Whisper normalises transcripts and strips "um"/"uh" at every model size, so the
filler-word counter (`communication_agent.py:76`) only ever matches "like/so/actually/basically". Real
disfluency detection requires Deepgram Nova-3 (`filler_words`) at **$284/mo** in place of $53 — a **+$231/mo**
feature. Deferred; revisit only if filler accuracy becomes a defended feature.

### 2.2 Text LLM — DeepSeek V3.2 on Amazon Bedrock

**Rate: $0.62/M input · $1.85/M output.** Serverless on-demand, available in **ap-south-1**.
Context window 163,840 tokens.

**Token volume at 3,000 DAU, base adoption:**

**⚠ The speaking path fires three LLM calls per submission, not one.** `coe_evaluate_text`
(`communication_agent.py:125`) implements a "Committee of Experts": Expert 1 critiques grammar/vocabulary
(line 139), Expert 2 critiques fluency/tone (line 152), and a Master call synthesises both into the scored
JSON (line 187). The two expert calls return **unstructured prose** and their output is then fed back as
*input* to the Master call, so both token sides inflate. `chat_practice` (line 297) repeats the identical
3-call pattern. They run **sequentially**, so latency is also 3×.

| Agent | Submissions/mo | LLM calls | ~in / ~out per submission | Input (M) | Output (M) |
|---|---|---|---|---|---|
| Speaking evaluation (CoE ×3) | 79,200 | **237,600** | 1,150 / 700 | 91.1 | 55.4 |
| Interview Q&A + eval | 26,400 | 26,400 | 1,500 / 800 | 39.6 | 21.1 |
| Load-balancer routing | 30,000 | 30,000 | 400 / 150 | 12.0 | 4.5 |
| Resume analysis | 6,600 | 6,600 | 3,000 / 1,500 | 19.8 | 9.9 |
| Roadmap generation | 2,000 | 2,000 | 2,000 / 3,000 | 4.0 | 6.0 |
| **Total** | | **302,600 calls** | | **166.5** | **96.9** |

| | Base (3,000 DAU) | High adoption | 2,000-user tier (600 DAU) |
|---|---|---|---|
| Input | 166.5M × $0.62 = **$103.23** | $258 | $20.65 |
| Output | 96.9M × $1.85 = **$179.27** | $448 | $35.85 |
| **Total** | **$282.50** / ₹24,013 | **$706** / ₹60,010 | **$56.50** / ₹4,803 |

**Note the output-heavy shape.** 63% of the bill is output tokens, because every agent returns structured JSON
scores and prose feedback rather than a short label. Output is 3× the input rate, so **shortening responses
saves more than anything that shortens prompts.**

**Collapsing the CoE to a single call is the largest single lever in this document.** One well-structured
rubric prompt covering all four dimensions costs ~400 in / 400 out per submission instead of 1,150 / 700:

| Speaking path | Input | Output | Cost |
|---|---|---|---|
| Current: CoE ×3 | 91.1M | 55.4M | **$159.00** |
| Consolidated ×1 | 31.7M | 31.7M | **$78.30** |
| **Saving** | | | **−$80.70/mo** *(and 3× lower latency)* |

A three-call committee in which two models write prose for a third to summarise is an elaborate way to score
student English on four dimensions. It also triples the failure surface and the worker-hold time (§5 item 4).
Worth an A/B on score quality, but the default should be one call.

#### 2.2.1 Serverless vs Marketplace — a ~23× decision

| Deployment | Billing | Cost at this workload |
|---|---|---|
| **Bedrock serverless on-demand** (`deepseek.v3.2`) | Per token | **$221/mo** ✅ |
| Bedrock **Marketplace** / SageMaker real-time endpoint | Per **instance-hour**, 24/7, no scale-to-zero | `ml.g5.12xlarge` ≈ $7.09/hr ≈ **$5,176/mo** |

Marketplace deployments price identically to the equivalent SageMaker real-time instance and bill whether the
endpoint serves one request or ten million. A campus platform with timetable-driven, bursty load is the worst
possible fit for that shape. **Use the serverless model ID.** A dedicated endpoint only becomes rational at
roughly 20× this token volume, or if a hard data-isolation requirement forbids the shared serverless pool.

#### 2.2.2 What must be got right

**(a) 23 call sites pass an OpenAI-only parameter.** `response_format={"type": "json_object"}` appears
**23 times** across `communication_agent.py`, `interview_agent.py`, `resume_agent.py`, `semantic_matcher.py`,
`learning_agent.py`, `load_balancer_agent.py`, `advisor_views.py` and `communication_hub/views.py`. Bedrock's
native `InvokeModel`/`Converse` API **does not accept it**. This is not a one-line provider swap.

Options, in order of preference:
1. **Bedrock Converse API with a tool-use schema** per call site — strongest guarantee, most work.
2. **Prompt-enforced JSON + strict parsing.** Cheapest path, and the codebase already degrades gracefully —
   every agent has a `_fallback_*` branch when parsing fails. Accept a small malformed-response rate.
3. Keep an OpenAI-compatible shim in `generate_completion` so the `provider="bedrock"` branch translates
   `response_format` into whichever of the above is chosen, leaving all 23 call sites untouched. **Recommended** —
   `core/groq_client.py:100` already has the right signature and a `provider` branch to extend.

**(b) Reasoning/thinking mode must stay OFF.** DeepSeek V3.2 is a reasoning-capable MoE model, and reasoning
tokens bill as **output at $1.85/M**. Every task here is structured scoring at `temperature=0.0` and needs no
chain-of-thought. If thinking is enabled by default or per-call, output tokens can rise 3–10×, taking the
output line from $135 to **$400–1,350/month**. Verify the default in the Bedrock model card and pin it
explicitly. **This is the single largest cost risk in this document.**

#### 2.2.3 What the 5× premium over Groq buys

The move from Groq (~$45) to DeepSeek on Bedrock (~$221) costs **+$176/month**. It is defensible, but on these
grounds rather than price:

| | Groq | DeepSeek V3.2 on Bedrock |
|---|---|---|
| Rate limits | Per-account, unpublished per tier — **the original reason to leave** | Bedrock account quotas, raisable via Service Quotas |
| Region | US-hosted; every call leaves India today | **ap-south-1** — data stays in Mumbai, ~200 ms RTT saved |
| Auth / billing | Separate vendor, separate API key, separate invoice | IAM roles, one AWS bill, CloudTrail, AWS Budgets |
| Capability | `gpt-oss-20b/120b` | Stronger reasoning, coding and instruction-following; 164k context |
| SLA | None you control | AWS service terms |

Data residency and the single-vendor/IAM story are the real justification. For a Tamil Nadu campus handling
student records, keeping inference in ap-south-1 is a substantive compliance improvement over shipping
transcripts to a US endpoint.

**Cost-control levers, in order of effect:**
1. Keep thinking mode off (up to **−$1,200/mo** avoided).
2. Shorten JSON responses — output is 61% of the bill and 3× the input rate.
3. **Bedrock prompt caching** on the large static system prompts (the interview and resume prompts are long and
   identical across calls) — can cut the $86 input line substantially.
4. **Bedrock Batch** for anything not user-blocking (nightly re-scoring, analytics) at ~50% off.
5. Route the trivial calls elsewhere. Load-balancer routing is 30,000 calls/mo classifying into four buckets —
   it does not need a 685B-parameter MoE model, and `load_balancer_agent.py:47` already has a keyword fallback.

### 2.3 Deliberately not adopted

**Speech-to-text:**

| Option | Cost at this tier | Why not |
|---|---|---|
| Amazon Transcribe | $1,584/mo | 30× Groq for strictly less capability than Deepgram |
| Deepgram Nova-3 | $284/mo | Only wins on filler words; hold until that matters |
| Self-hosted faster-whisper | $75–450/mo + GPU ops | 1,320 audio-hr ≈ 37 GPU-hours of real work. A GPU is 20× overprovisioned |
| **Bedrock Nova Sonic** | **up to $4,950/mo** | See §7 trap #1. Replaces something that is currently free |

**Text LLM**, same 138.8M in / 73.2M out workload:

| Option | Rate (per 1M) | Cost at this tier | Verdict |
|---|---|---|---|
| Groq `gpt-oss-20b/120b` | $0.075–0.15 / $0.30–0.60 | **$45** | Cheapest, but US-hosted with unpublished rate limits — the reason for the move |
| **DeepSeek V3.2 (Bedrock)** | **$0.62 / $1.85** | **$221** | ✅ **Chosen.** ap-south-1, IAM, strong capability |
| Claude Haiku 4.5 (Bedrock) | $1.00 / $5.00 | **$505** | 2.3× DeepSeek; worth revisiting only if instruction-following on the JSON contracts proves unreliable |
| Bedrock Marketplace endpoint | ~$7.09/instance-hr | **$5,176** | See §2.2.1 — wrong billing shape for bursty campus load |

---

## 3. INFRASTRUCTURE

### 3.1 Shared with Code2Day — carried from `AWS_DEPLOYMENT_OPTIONS.md` §6

The module rides the existing stack. These are **not** new costs; they are the base the module attaches to.

| Item | 2,000 tier | 10,000 tier |
|---|---|---|
| EC2 (`t4g.medium` → 2× `t4g.large`), 1-yr Savings Plan | $16 | $60 |
| ALB | — (CloudFront direct to origin) | $25 |
| RDS (`db.t4g.micro` → `db.t4g.medium`), single-AZ | $15 | $65 |
| ElastiCache | — | $25 |
| Lambda (Code2Day code execution) | $2 | $31 |
| EBS 30 GB + public IPv4 | $6.30 | $12 |
| S3 + CloudFront (SPA) | $0.50 | $1 |
| Route 53, CloudWatch, ECR, backups | $5 | $23 |
| **Subtotal** | **$45** / ₹3,825 | **$242** / ₹20,570 |

> The 10,000-tier subtotal of $242 exceeds the "~$190" headline in `AWS_DEPLOYMENT_OPTIONS.md` Option D.
> The itemised §6 list is the more defensible figure and is used here.

### 3.2 New infrastructure the module forces

| Item | 2,000 tier | 10,000 tier | Note |
|---|---|---|---|
| **ElastiCache `cache.t4g.micro`** | **+$12** | $0 | Already in the 10k tier; **pulled forward** to 2k by `FileBasedCache` |
| **S3 — audio storage** | +$2 | **+$8** | With lifecycle policy, §3.3 |
| **RDS storage** — 45 admin tables + RAG chunks, ~20 GB | +$2 | +$3 | |
| **EC2 upgrade** for `torch` RAM | **+$16** (medium→large) | $0 | **$0 if sentence-transformers is dropped — see §4** |
| Data transfer | $0 | $0 | Audio upload is inbound (free); egress via CloudFront free tier |
| **Subtotal** | **+$32** *(or +$16 without torch)* | **+$11** | |

### 3.3 Audio storage — a real decision

Base tier generates **79,200 min/mo** of webm at roughly 1 MB/min ≈ **79 GB/month**.

| Retention policy | Steady-state size | Monthly |
|---|---|---|
| S3 Standard, keep 12 months | 950 GB | **$24** |
| Standard 90 d → Glacier IR, delete at 12 mo | ~250 GB effective | **$8** ✅ |
| Delete after 90 days | 237 GB | $6 |

PUT requests are negligible ($0.40/mo). **Recommended: 90-day lifecycle to Glacier Instant Retrieval, hard
delete at 12 months.** Cost and student-privacy posture point the same way — `SpeakingSession.audio_file`
holds identifiable student voice recordings, and there is no reason to keep them indefinitely.

**Note:** `MEDIA_ROOT` today is `FileSystemStorage` (`main/settings.py`). On ECS/ASG those recordings are
destroyed on every redeploy. S3 via `django-storages` is mandatory, not an optimisation.

---

## 4. THE `torch` BLOCKER

`MentorMind_AI/requirements.txt` opens with:

```
--extra-index-url https://download.pytorch.org/whl/cpu
torch==2.10.0+cpu
sentence-transformers==5.6.0
```

The `+cpu` local-version wheels on that index are **linux_x86_64 only**; aarch64 CPU builds of PyTorch are
published to PyPI proper as plain `torch`. On the `t4g` Graviton instances that
`AWS_DEPLOYMENT_OPTIONS.md` §1 recommends everywhere, **this pin will not resolve.**

It is used in exactly one place — `resume_engine/services/semantic_matcher.py:24`, loading
`all-MiniLM-L6-v2` for resume skill matching — and that function **already has a Jaccard word-overlap
fallback** (`semantic_matcher.py:36`) for when the model fails to load.

| Path | Cost | Verdict |
|---|---|---|
| **Drop `sentence-transformers` + `torch`** | **$0** | ✅ **Recommended.** Removes the blocker, frees ~1 GB RAM/worker, cuts ~2.5 GB from the image, keeps Graviton, avoids the EC2 upgrade |
| Install plain `torch` from PyPI (aarch64 wheels exist) | +$16/mo | Works, but keeps ~1 GB/worker on a 4 GB `t4g.medium` already running nginx + Django + Redis |
| Move to x86 `t3.medium` | +10–20% across the fleet | Loses the Graviton discount on every instance to serve one function |

The quality question is real but small: MiniLM cosine similarity is better than Jaccard at matching
"JS" ↔ "JavaScript". If that matters, the right fix is **precomputing skill embeddings into Postgres**
(one-off, offline, any architecture) rather than loading a 90 MB model into every web worker.

**RAM arithmetic, for the record:** `t4g.medium` = 4 GB, already hosting nginx + Django (12 sync workers per
`PROJECT_DEPLOYMENT_PROFILE.md:286`) + Redis. MiniLM resident per worker is ~0.5–1 GB. Twelve workers would
need more RAM than the instance has. Even on `t4g.large` (8 GB) this only works because the model loads
lazily and most workers never touch it — which is luck, not design.

---

## 5. INTEGRATION FRICTION (engineering cost, not AWS cost)

| # | Issue | Effort |
|---|---|---|
| 1 | **Django 5.1.4 → 5.2.1.** Code2Day pins 5.1.4, MentorMind 5.2.1. Unify upward | Small + regression pass |
| 2 | **`FileBasedCache` → Redis.** `main/settings.py:110` writes to a local `cache/` dir; bulk-upload progress silently returns wrong data across containers | Small |
| 3 | **`FileSystemStorage` → S3** via `django-storages` | Small |
| 4 | **Async the ASR path.** `gunicorn --workers 3` (MentorMind `Procfile`) holds a worker for the entire Whisper + LLM round trip. Code2Day runs 12 sync workers and already collapses at ~20 concurrent submits (`PROJECT_DEPLOYMENT_PROFILE.md:1017`). Adding blocking multi-second AI calls to that same pool starves logins | **Largest item.** S3 → SQS → worker → poll/WebSocket |
| 5 | **RAG vector search.** `core/rag/vector_store.py:47` pulls *every* chunk for a source type out of Postgres and dot-products them in Python per query. Fine for 20 PDFs; wasteful under load, and it runs on the shared `db.t4g.micro` | Medium — move to `pgvector` with an index |
| 6 | **`CORS_ALLOW_ALL_ORIGINS = True`** (`main/settings.py:154`) overrides the allowlist directly above it, with `CORS_ALLOW_CREDENTIALS = True`. Any origin can make credentialed requests | Trivial — must fix before exposure |
| 7 | **Two `Notification` models** — `accounts/models.py:58` and `admin/models.py:557`. Reconcile before merging into a schema that already has its own | Small design call |
| 8 | **`HashingVectorizer` embeddings** (`core/rag/embeddings.py`) are bag-of-words with no semantics. Retrieval quality is poor regardless of scale | Medium, quality not cost |
| 9 | **Bedrock provider branch + `response_format` shim.** Add `provider="bedrock"` to `core/groq_client.py:100` alongside the existing `groq`/`openrouter` branches, translating the OpenAI-style `response_format` used at 23 call sites (§2.2.2). Needs `boto3`, an IAM task role with `bedrock:InvokeModel`, and the thinking-mode default pinned | **Medium.** Blocks the LLM migration; touches one file if the shim approach is taken |
| 10 | **Retire the Groq LLM path, keep the Groq ASR path.** Both currently run through the same `generate_completion`/`get_groq_client` module. ASR stays on Groq, so the Groq dependency and API key remain — only the text-completion calls move | Small, but easy to get half-done |

Items 2, 3 and 4 are one coherent piece of work — "survive more than one container" — and none of the cost
figures in this document hold without them. Item 9 is the gate on every LLM figure in §2.2.

---

## 6. TOTALS

### ~2,000 registered / ~600 DAU / ~200 concurrent

| Line | USD | INR |
|---|---|---|
| Code2Day shared infrastructure | $45.00 | ₹3,825 |
| ElastiCache `cache.t4g.micro` (pulled forward) | $12.00 | ₹1,020 |
| **DeepSeek V3.2 on Bedrock — all agents** | **$56.50** | **₹4,803** |
| Groq Whisper turbo (264 audio-hr) | $10.56 | ₹898 |
| S3 audio + RDS storage | $4.00 | ₹340 |
| **TOTAL** | **$128.06** | **₹10,885** |

*Add $16/mo if `sentence-transformers` is retained (EC2 `t4g.medium` → `t4g.large`).*

### ~10,000 registered / ~3,000 DAU / ~1,000 concurrent ★ the stated target

| Line | USD | INR |
|---|---|---|
| Code2Day shared infrastructure | $242.00 | ₹20,570 |
| **DeepSeek V3.2 on Bedrock — all agents** | **$282.50** | **₹24,013** |
| Groq Whisper turbo (1,320 audio-hr) | $52.80 | ₹4,488 |
| S3 audio (lifecycle) + RDS storage | $11.00 | ₹935 |
| **TOTAL** | **$588.30** | **₹50,006** |

**Full voice adoption:** infra $242 + DeepSeek $706 + Whisper $132 + storage $20 → **$1,100/mo · ₹93,500**.

**Cost per user per month at target: ~$0.059 (₹5.00).** AI (LLM + ASR) is **$0.034/user/month (₹2.85)**.

### Where the money goes at target

```
DeepSeek V3.2 LLM (5 agents)                        $283   48%  ███████████████
Shared infra (EC2/RDS/ALB/Redis/Lambda/CloudWatch)  $242   41%  █████████████
Groq Whisper ASR                                     $53    9%  ███
S3 + RDS storage                                     $11    2%  █
```

**This is the structural change from the Groq baseline.** On Groq the intelligence layer was 28% of a $351
bill and optimisation belonged entirely in the serving path. On DeepSeek/Bedrock it is **57% of a $588 bill**,
and the LLM alone exceeds all of Code2Day's infrastructure. Two consequences:

- **Token discipline is now the primary cost activity**, not a micro-optimisation. The §2.2 CoE consolidation
  and the §2.2.3 levers are collectively worth more than every instance-sizing decision in this document
  combined.
- **Per-user cost has moved from ₹3.00 to ₹5.00/month.** Still low in absolute terms, but it now scales
  linearly with engagement in a way infrastructure does not. AI calls per student is the number to watch on
  the dashboard, because it is the number that sets the bill.

---

## 9. FITTING A ₹7,000/MONTH BUDGET

**₹7,000 ≈ $82/month for everything — Code2Day and the MentorMind module combined.**

### 9.1 The verdict

| At this concurrency | Paying list price | With AWS Educate/Academy credits |
|---|---|---|
| **~250–300 concurrent** | ✅ **₹6,120** — fits with room | ✅ trivially |
| **~1,000 concurrent** | ❌ **₹24,225** — 3.5× over | ✅ **₹6,970** — just fits |

**Why 1,000 concurrent cannot fit at list price:** serving 1,000 concurrent Django users needs, at minimum, two
application instances behind a load balancer and a database above `db.t4g.micro`. That is **₹12,750–20,570 of
infrastructure before a single AI call**. No configuration of AWS serves that concurrency with a managed
Postgres for ₹7,000 while also paying for inference. The constraint is arithmetic, not optimisation.

### 9.2 First: measure, because the target may be wrong

`PROJECT_DEPLOYMENT_PROFILE.md:1530` lists **DAU and peak concurrent users as UNKNOWN — requires measurement**,
and §1017 estimates the current stack handles **~150–300 concurrent** browsing users. If real peak concurrency
is 200–300, **Plan A fits comfortably and this problem dissolves.** Designing for 1,000 concurrent that does not
exist is the most expensive mistake available here — roughly ₹18,000/month of it.

```sql
-- DAU
SELECT count(*) FROM student_profiles WHERE last_login_on = CURRENT_DATE;
-- peak concurrency, from nginx logs
awk '{print $4}' code2day.access.log | uniq -c | sort -rn | head
```

**Run these before committing to either plan.**

### 9.3 Plan A — ₹6,120/month at ~250–300 concurrent ✅ recommended

Code2Day's own 2,000-user tier, plus the module with token discipline. No credits required.

| Line | Action | USD | INR |
|---|---|---|---|
| Infrastructure | Code2Day 2k tier unchanged: `t4g.medium` + `db.t4g.micro` + CloudFront direct to origin, no ALB | $45.00 | ₹3,825 |
| Redis | **On-instance Redis, not ElastiCache.** Valid at single-instance; revisit the moment you add a second | $0.00 | ₹0 |
| DeepSeek V3.2 | 600 DAU, **CoE collapsed to 1 call**, keyword router, prompt caching, trimmed JSON | $18.00 | ₹1,530 |
| Groq Whisper turbo | Capped at 2 graded exercises/user/day | $7.00 | ₹595 |
| S3 + RDS storage | 30-day audio retention | $2.00 | ₹170 |
| **TOTAL** | | **$72.00** | **₹6,120** |

Leaves ~₹880/month of headroom for CloudWatch overruns and a Bedrock spend spike.
**Requires dropping `sentence-transformers`** (§4) — otherwise add ₹1,360 for the instance upgrade and the
plan no longer fits.

### 9.4 Plan B — ₹6,970/month at ~1,000 concurrent, credits covering infrastructure

`AWS_DEPLOYMENT_OPTIONS.md` §8 #2 already recommends this: *"Apply for AWS Educate / AWS Academy credits. You
are an educational institution; institutional credits could plausibly cover a year of either build outright."*

| Line | Action | USD | INR |
|---|---|---|---|
| Infrastructure | 10,000-user tier, **covered by credits** | $0.00 | ₹0 |
| DeepSeek V3.2 | 3,000 DAU with every §9.5 lever applied | $54.00 | ₹4,590 |
| Groq Whisper turbo | Capped at 2 exercises/user/day (880 audio-hr) | $26.00 | ₹2,210 |
| S3 + RDS storage | 30-day retention | $2.00 | ₹170 |
| **TOTAL out-of-pocket** | | **$82.00** | **₹6,970** |

Two caveats worth stating plainly. Credits are **time-boxed** — when they expire the bill jumps to ₹24,225/month,
so treat this as a funded pilot with a known cliff, not a steady state. And the AWS Free Tier trap
(`AWS_DEPLOYMENT_OPTIONS.md` §8 #1) is a different thing entirely: **open a Paid plan account**, then apply
credits to it.

### 9.5 The levers, in order of effect

Applied to the 3,000 DAU case. Each is independent.

| # | Lever | Saving/mo | Cost to implement |
|---|---|---|---|
| 1 | **Collapse CoE 3 calls → 1** (`communication_agent.py:125`, and `chat_practice:297`) | **−$81** | Half a day + score A/B |
| 2 | **Cap graded exercises at 2/user/day** (from 3) | −$113 | Small; product decision |
| 3 | **Bedrock prompt caching** on the long static system prompts | −$40 | Small |
| 4 | **Trim JSON output** — drop or shorten the `reasoning` field and cap `recommendations` at 2 items | −$45 | Small |
| 5 | **Keyword router for the load balancer.** 30,000 calls/month classifying into four buckets does not need a frontier MoE model, and `load_balancer_agent.py:47` already has the fallback | −$16 | Trivial — delete a call |
| 6 | **Drop ElastiCache**, run Redis on-instance (single-instance only) | −$25 | Config |
| 7 | **Drop the ALB**, CloudFront direct to origin (single-instance only) | −$25 | Config |
| 8 | **30-day audio retention** instead of 12 months | −$9 | Lifecycle policy; also better privacy |
| 9 | **CloudWatch**: 7-day retention, drop custom metrics | −$15 | Config |
| 10 | **3-year Savings Plan** instead of 1-year | −$20 | Commitment |
| 11 | **Bedrock Batch (50% off)** for anything not user-blocking | varies | Medium |

Levers 1, 3, 4 and 5 are pure token discipline: **−$182/month with no reduction in what students can do.**
Do those four first regardless of which plan you pick — they are the difference between ₹50,006 and ₹34,510
even with no other change.

Lever 2 is the only one that reduces the product. Levers 6 and 7 are safe at 300 concurrent and unsafe at 1,000.

### 9.6 What ₹7,000 cannot buy

State these as accepted risks, not oversights:

- **No ALB / single application instance** — the instance dying is a total outage. Snapshots, no HA.
- **`db.t4g.micro` single-AZ** — no read replica, no Multi-AZ failover. Restore from PITR is minutes to hours.
- **No CoE quality margin** — scores come from one model call with no committee cross-check.
- **Capped daily exercises** — a motivated student hits a wall the product does not currently explain.
- **30-day audio retention** — session replay older than a month is gone.
- **No Bedrock failover** — if DeepSeek in ap-south-1 throttles, AI features degrade to the `_fallback_*`
  branches, which for speech means the hardcoded canned transcript in §7 trap #3. **Fix that first.**

---

## 10. THE "EVERYTHING WORKS WELL, STILL TIGHT" BUILD

§9 answers *how cheap can this go*. This section answers the more useful question: **what does it cost to have
nothing broken, while still refusing to waste money?**

### 10.1 What "works well" means here — the spec

Everything in §9.6 that ₹7,000 buys you *out* of, bought back:

| Requirement | Why it is not optional |
|---|---|
| **No single point of failure** | ALB + 2 application instances. One instance dying must not be an outage |
| **Async ASR** | The speaking path must not hold a web worker for 5–15 s. This is what actually delivers the concurrency (§5 item 4) |
| **Managed Postgres with PITR** | Student placement records. Self-hosted Postgres on the app instance is not acceptable for this data |
| **Shared Redis** | Required the moment there are 2 instances — cache, rate limits, bulk-upload progress |
| **Full product, no caps** | 3 graded exercises/day, no artificial daily wall |
| **Graceful AI degradation** | Bedrock overflow budget, and the fabricated-score bug (§7 trap #3) fixed |
| **Real observability** | 14-day logs plus alarms. Debugging a 1,000-user platform blind is a false economy |
| **90-day audio retention** | Session replay actually works for a term |

What stays cut, because it costs money without improving what students experience: the Committee-of-Experts
triple call, the frontier-model load-balancer router, verbose JSON, 12-month audio hoarding, 30-day CloudWatch
retention, and 1-year Savings Plans where 3-year is available.

### 10.2 The numbers

| Line | Detail | ~300 concurrent | ~1,000 concurrent |
|---|---|---|---|
| ALB | Required for HA | $25 | $25 |
| EC2 | 2× `t4g.medium` / 2× `t4g.large`, **3-yr Savings Plan** | $20 | $40 |
| RDS | `db.t4g.micro` / `db.t4g.medium`, single-AZ + PITR, **1-yr Reserved** | $11 | $48 |
| ElastiCache | `cache.t4g.micro` | $12 | $12 |
| Lambda — Code2Day execution | From `AWS_DEPLOYMENT_OPTIONS.md` §5 | $2 | $31 |
| **Lambda — async ASR worker** | **New.** ~10 s I/O-bound wait per job at 512 MB. Reuses the pattern Code2Day already adopted | $2 | $6 |
| EBS + public IPv4 | | $12 | $12 |
| S3 + CloudFront | SPA + media | $1 | $1 |
| Route 53, ECR, AWS Backup | | $8 | $10 |
| CloudWatch | 14-day retention + alarms | $8 | $10 |
| **Infrastructure subtotal** | | **$101** | **$195** |
| **DeepSeek V3.2** | Full product, levers 1/4/5 applied (§9.5) | $30 | $149 |
| **Groq Whisper turbo** | Full product, **no exercise cap** | $10.56 | $52.80 |
| S3 audio (90-day → Glacier IR) + RDS storage | | $4 | $11 |
| Bedrock overflow allowance | Throttle months | $5 | $10 |
| **TOTAL** | | **$150.56** | **$417.80** |
| | | **₹12,798** | **₹35,513** |

**Per user per month: ₹6.40 at 300 concurrent · ₹3.55 at 1,000 concurrent.** The larger build is cheaper per
student — the infrastructure amortises while AI scales linearly.

### 10.3 How this compares

| Build | ~300 concurrent | ~1,000 concurrent |
|---|---|---|
| §9 minimum viable (compromised) | ₹6,120 | ₹6,970 *(credits only)* |
| **§10 works well, tight** | **₹12,798** | **₹35,513** |
| §6 as-is, no optimisation | — | ₹50,006 |
| As-is, full voice adoption | — | ₹93,500 |

The §10 build at 1,000 concurrent is **29% cheaper than the unoptimised §6 figure while simultaneously adding
HA, async ASR, and observability that §6 does not have.** That is the whole argument for token discipline:
the four free levers (§9.5 #1, #3, #4, #5) pay for the entire high-availability tier and then some.

### 10.4 Where the remaining money is, and whether to spend it

| Optional | Cost | Verdict |
|---|---|---|
| RDS Multi-AZ | +$64/mo | Cuts failover from hours to ~1 minute. **Defer** — single-AZ + PITR is defensible for a campus platform; revisit when placement season makes an outage unacceptable |
| Deepgram Nova-3 for real filler words | +$231/mo | The one genuine capability gap (§2.1). Only if filler accuracy becomes a defended feature |
| Bedrock prompt caching | **−$32/mo** | **Try it** — but Bedrock has a minimum cacheable prefix length and these system prompts are short (~200–500 tokens). May not qualify. Not counted in §10.2, deliberately |
| Claude Haiku 4.5 instead of DeepSeek | +$130/mo | Only if DeepSeek's instruction-following on the 23 JSON contracts proves unreliable in the §2.2.2 prototype |
| ElastiCache `cache.t4g.small` | +$13/mo | If `micro`'s 0.5 GB proves tight under session + rate-limit + progress load |

### 10.5 The honest bottom line

- **₹12,800/month** gets a fully working, highly available, uncrippled platform at the concurrency Code2Day's
  stack plausibly serves today (~300).
- **₹35,500/month** gets the same at the stated 1,000-concurrent target.
- **₹7,000/month** is reachable, but only by giving up high availability, the async path, or the product's
  daily limits — and at 1,000 concurrent, only on borrowed credits with a cliff.

**And the target is still unmeasured.** §9.2's two queries decide whether the answer is ₹12,800 or ₹35,500 —
a ₹273,000 difference over a year. That measurement is the highest-value hour of work available anywhere in
this document.

---

## 7. TRAPS

1. **Nova Sonic would dominate everything.** Conversation Partner's UI sets a **`'15/20 min'` target**
   (`ConversationPartner.jsx:23`). At Nova 2 Sonic's ~$0.015/min estimate, all 3,000 DAU hitting a 15-minute
   daily target is **330,000 min/mo ≈ $4,950/mo** — 14× the entire rest of this budget. It currently costs **$0**
   because it uses free browser `SpeechRecognition`. If Nova Sonic is ever adopted: pilot it, measure real
   token consumption (AWS publishes no tokens-per-second conversion), and hard-cap session length **before**
   it is user-facing.
2. **The unauthenticated executor makes the AWS bill attacker-controlled.** `AWS_DEPLOYMENT_OPTIONS.md` §7
   Phase 0 already flags this. MentorMind adds a second attacker-controlled cost surface: an unthrottled
   `/api/communication/speaking/` endpoint bills Groq per upload. **Rate-limit it per user before exposure.**
3. **`_fallback_transcript()` returns a hardcoded sentence.** `communication_agent.py:377` returns a fixed
   string when Groq is unreachable, which is then *scored as real speech*. Under rate-limiting — exactly what
   happens at 1,000 concurrent — this fires often and silently issues fabricated fluency scores. It should
   fail loudly. This is a correctness bug that scale converts into a systemic one.
4. **DeepSeek thinking mode is the largest cost risk here.** Reasoning tokens bill as output at $1.85/M. Left
   on by default across 144,200 calls/month it can take the output line from $135 to **$400–1,350/month** —
   silently, with no error and no behaviour change visible in the UI. Pin it off explicitly and assert it in a
   test. See §2.2.2(b).
5. **A Bedrock Marketplace endpoint costs ~$5,176/month at zero traffic.** If "deploy DeepSeek on Bedrock" is
   ever implemented as a Marketplace/SageMaker endpoint rather than the serverless model ID, the bill arrives
   whether or not a single student logs in, and no usage optimisation will touch it. §2.2.1.
6. **Groq remains a dependency after the LLM migration** — ASR still runs there. The single-vendor exposure
   shrinks but does not disappear, and the Groq API key still ships to production.
7. **The AWS Free Tier auto-closes accounts** (`AWS_DEPLOYMENT_OPTIONS.md` §8 #1). Unchanged and still the
   biggest operational trap for a college account.
8. **Set AWS Budgets on day one**, plus a Groq spend cap. Neither AWS nor Groq offers a true hard ceiling —
   and Bedrock token spend is now large enough that a runaway loop is expensive within hours.
9. **12-month audio retention is a privacy decision, not just a storage one.** Identifiable student voice
   recordings. Have an answer before an audit asks.

---

## 8. SOURCES

- [Groq pricing — every model and tier (2026)](https://www.cloudzero.com/blog/groq-pricing/) — Whisper turbo $0.04/audio-hr
- [Groq `gpt-oss-20b` pricing](https://www.requesty.ai/models/groq/openai-gpt-oss-20b) — $0.075/$0.30 per 1M
- [DeepSeek V3.2 — Amazon Bedrock model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-deepseek-deepseek-v3-2.html)
- [DeepSeek V3.2 on Bedrock — pricing and specs](https://www.llmreference.com/model/deepseek-v3.2/aws-bedrock) — $0.62/$1.85 per 1M, 163,840-token context
- [DeepSeek, OpenAI and Qwen models in Amazon Bedrock in additional Regions](https://aws.amazon.com/about-aws/whats-new/2025/10/deepseek-openai-qwen-models-amazon-bedrock-additional-regions) — ap-south-1 availability
- [Bedrock vs SageMaker billing shapes](https://www.cloudzero.com/blog/amazon-bedrock-pricing/) — Marketplace endpoints bill per instance-hour
- [Amazon Transcribe pricing 2026](https://costbench.com/software/ai-transcription-apis/aws-transcribe/) — $0.024/min Tier 1
- [Deepgram Nova-3 pricing 2026](https://convertaudiototext.com/blog/deepgram-nova-3-explained) — $0.0043/min batch
- [AssemblyAI billing and pricing](https://www.assemblyai.com/docs/billing-and-pricing)
- [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)
- [Claude Haiku 4.5 pricing](https://platform.claude.com/docs/en/about-claude/pricing) — $1/$5 per 1M
- [Nova 2 Sonic pricing](https://rywalker.com/research/aws-nova-2-sonic) — $3/$12 per 1M speech tokens
- [EC2 `g5.xlarge` pricing](https://instances.vantage.sh/aws/ec2/g5.xlarge)
- [Amazon SageMaker AI pricing](https://aws.amazon.com/sagemaker/ai/pricing/)
- Shared infrastructure: `AWS_DEPLOYMENT_OPTIONS.md` §6 (this repo)

### Unverified — confirm before committing

| Item | Status |
|---|---|
| **DAU and peak concurrency** | **UNKNOWN.** `PROJECT_DEPLOYMENT_PROFILE.md:1530` gives the SQL. Every figure here scales linearly off the 3,000 DAU assumption — measure first |
| **Voice adoption rate** | Assumed 40%. No usage data exists yet. Swing between base and high cases is **$79/mo** |
| **Audio bitrate** | Assumed ~1 MB/min webm. Measure actual `SpeakingSession.audio_file` sizes — S3 scales directly off it |
| **`torch==2.10.0+cpu` on aarch64** | Stated as failing to resolve; the PyTorch CPU index publishes x86_64 wheels only. **Confirm with an actual `pip install` on a `t4g` instance** |
| **Groq `whisper-large-v3` rate** | ~$0.111/audio-hr used for the 3× turbo comparison; less well sourced than the turbo figure |
| **ap-south-1 prices** | Anchored to us-east-1 published rates. `AWS_DEPLOYMENT_OPTIONS.md` §9 already warns that aggregators disagree materially on Mumbai. **Use the AWS Pricing Calculator** |
| **DeepSeek V3.2 price in ap-south-1** | $0.62/$1.85 is the published **US East / US West** rate. Mumbai may carry an uplift. **Confirm in the Bedrock console for ap-south-1 before budgeting** — a 20% uplift is +$44/mo at target |
| **DeepSeek V3.2 thinking-mode default on Bedrock** | Whether reasoning is on by default, and how it is disabled, is **unconfirmed**. This determines a $135 vs $400–1,350 output line. **Verify first, then pin and test** |
| **Token-per-call estimates** | The 138.8M in / 73.2M out figures rest on assumed prompt and response sizes per agent. Instrument `generate_completion` to log actual token counts for one week before finalising the budget — this is the single highest-leverage measurement available |
| **Bedrock structured-output path for DeepSeek** | Whether DeepSeek V3.2 on Bedrock supports Converse tool-use well enough to replace `response_format` is untested. Prototype one agent before committing to the approach in §2.2.2 |
| **Groq rate limits at 1,000 concurrent** | Still relevant for **ASR only** after the LLM migration. Per-account audio limits are not published per tier — contact Groq before launch |
| **Nova Sonic tokens per second of audio** | **AWS publishes no conversion.** The ~$0.015/min figure is third-party; treat as ±2× |
