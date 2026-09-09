# AWS DEPLOYMENT OPTIONS — Code2Day / RAMCOAD

Companion to `PROJECT_DEPLOYMENT_PROFILE.md`. That document says *what the system is*; this one says
*how it can be deployed on AWS*, with the trade-offs of each path.

**Research date:** 9 September 2026. Prices are anchored to **us-east-1** published rates (verified) with a
Mumbai uplift noted where it applies — third-party price aggregators disagreed materially on ap-south-1
figures, so **every number here must be re-checked in the AWS Pricing Calculator before you commit**.
Sources are listed in §9.

---

## 0. WHAT THE RESEARCH CHANGED

Four findings materially alter the recommendation in `PROJECT_DEPLOYMENT_PROFILE.md`:

| # | Finding | Impact |
|---|---|---|
| 1 | **AWS Lambda's free tier is 1M requests + 400,000 GB-seconds per month, perpetually** | Grading for 2,000 users costs **~$2/month**. This is the single biggest cost finding in the whole study |
| 2 | **AWS Lambda MicroVMs launched 22 June 2026** — a dedicated Firecracker VM per session, purpose-built for running untrusted/AI-generated code | A managed answer to the sandboxing problem that did not exist when the codebase was written. Mumbai availability is **unconfirmed** — see §4 |
| 3 | **API Gateway's 29-second integration timeout can now be raised to 300 seconds** (since June 2024, Service Quotas, Regional/private REST APIs only) | **Corrects §16 of the profile**, which said the 29 s cap ruled API Gateway out. It no longer does |
| 4 | **The AWS Free Tier changed on 15 July 2025** to a credit model — $100 on signup, up to $200 total, and the Free plan **auto-closes the account** after 6 months or when credits run out | A serious operational trap for a college opening a fresh account. See §8 |

The headline consequence: **move code execution to Lambda.** It is cheaper than every alternative by an order
of magnitude, has stronger isolation than what runs today, scales to zero between contests, and eliminates the
Docker socket entirely.

---

## 1. THE CONSTRAINTS THAT ELIMINATE OPTIONS

Verified from the codebase (see the profile for line references):

| Constraint | Consequence |
|---|---|
| No architecture assumptions; all 5 base images have arm64 variants | **Graviton is viable everywhere** — build and test, don't assume |
| Only runtime disk writes go through `default_storage`; only process-local state is `_rate_limiter` | The API is **genuinely stateless** once media→S3 and rate limits→Redis. Fargate / App Runner / Lambda all become real options |
| `prepare_execution_payload` builds the driver from `source_code` only — **not** from `stdin` | The identical wrapper is regenerated and re-sent N times per submit today. **Per-submission batching is a small, safe change** and it makes every option below 5–20× cheaper |
| Frontend hard-codes `BASE_URL = '/api'` (relative) | Frontend and API must share an origin, or CloudFront must route `/api/*` to the backend. Rules out naive split-domain hosting |
| A submit can legitimately take 15–90 s today | Any front door needs a long timeout. Constrains API Gateway (fixable, §3) and rules out defaults everywhere |
| Executor contract is a 6-field JSON response on `POST /submissions?wait=true` | **Trivially replaceable.** Any of the execution backends below can implement it behind the same interface, so the Django side barely changes |

---

## 2. THE SEVEN OPTIONS

### Option A — Single EC2 (lift-and-shift)

```
CloudFront (free tier) → EC2 t4g.large: nginx + Django + Redis + Postgres + executor + sandboxes
```

| | |
|---|---|
| **Monthly** | ~$44 (**≈ ₹3,750**) |
| **Isolation** | Unchanged from today — shared kernel, host Docker socket, root sandboxes |
| **Code changes** | None strictly required |
| **Scales to** | ~2,000 users, browsing-heavy |
| **Failure mode** | Instance dies = total outage. Runaway submission degrades the API |
| **Choose when** | You need to be on AWS this week and will fix the code afterwards |

Cheapest possible AWS footprint, and honestly evaluated: it reproduces every architectural defect in the
profile. It buys you managed TLS, a CDN, and snapshots — nothing else.

### Option B — EC2 baseline + Spot execution ASG

```
CloudFront + S3 → EC2 t4g.medium (Django + Redis + Celery) → ASG 0→N Spot t4g.medium (sandboxes, baked AMI)
                                                            → RDS db.t4g.micro
```

| | |
|---|---|
| **Monthly** | ~$47 (**≈ ₹4,050**) at 2k · ~$235–340 (**₹20,000–29,000**) at 10k |
| **Isolation** | Better — execution on separate, network-less, internet-less instances. Still shared-kernel unless you add gVisor |
| **Code changes** | Batching, Celery/Redis queue, container hardening, kill-on-timeout |
| **Scales to** | 2,000 comfortably; 10,000 with an ALB and a bigger DB |
| **Choose when** | You want full control of the sandbox and are comfortable owning AMIs |

This was the recommendation before the Lambda research. It is still the best option **if** you need
cgroup-level control (`--pids-limit`, custom seccomp, gVisor) that Lambda does not expose.

### Option C — ECS Fargate (API) + Fargate Spot (execution)

```
CloudFront + S3 → ALB → ECS Fargate (Django) → SQS → Fargate Spot task per submission → RDS + ElastiCache
```

| | |
|---|---|
| **Monthly** | ~$120–180 (**₹10,000–15,000**) at 2k |
| **Isolation** | **Strong** — each Fargate task is its own Firecracker microVM. No Docker socket anywhere |
| **Startup** | **20–60 s** for the large C/C++ image. This is the problem |
| **Cost trap** | **1-minute minimum billing.** A 2-second Python grading bills a full minute of vCPU + memory |
| **Choose when** | You want managed microVM isolation, can tolerate slow grading, and prefer no EC2 at all |

Fargate Spot (up to 70% off) helps the rate but not the minimum-billing problem. Per-submission batching is
what makes this option survivable — it amortises both the startup and the 1-minute floor over all test cases.

### Option D — Lambda for execution + EC2 or Fargate for the API ★ RECOMMENDED

```
CloudFront + S3 → EC2 t4g.medium or Fargate (Django + Redis)
                     → invoke Lambda (container image, arm64, VPC with no NAT) per submission
                     → RDS db.t4g.micro
```

| | |
|---|---|
| **Execution cost** | **~$2/month at 2,000 users · ~$31/month at 10,000 users** (calculation in §5) |
| **Total monthly** | ~$40 (**≈ ₹3,400**) at 2k · ~$190 (**≈ ₹16,000**) at 10k |
| **Isolation** | Firecracker microVM — the same technology as MicroVMs and Fargate. **No Docker socket** |
| **Startup** | Sub-second warm; a few seconds cold for a large container image |
| **Scales to zero** | Yes — you pay nothing between contests, which matches the timetable-driven load exactly |
| **Max timeout** | 15 minutes, versus the 15 seconds needed |
| **Network** | Attach to a VPC subnet with no NAT and no IGW → **zero egress**, matching today's `--network none` |
| **Choose when** | Almost always, at both scales |

**The one real caveat — warm-start reuse.** Consecutive invocations of the same Lambda function can reuse the
same execution environment. Student A's leftovers in `/tmp` or in process memory could in principle be visible
to student B. On a coding-practice platform that is primarily a **cheating vector**, not a data-breach vector,
and it is manageable: wipe `/tmp` at handler entry, run the user program in a fresh subprocess, and cap
`/tmp` size. If you need a guaranteed-fresh VM per submission, that is exactly what Option E provides.

**Other caveats:** you must build container images with gcc/JDK (up to 10 GB allowed — the current
Boost + CGAL image should be slimmed first), and you lose `--pids-limit` and custom seccomp, relying instead
on Lambda's own memory and time caps.

### Option E — Lambda MicroVMs for execution

Launched 22 June 2026: a dedicated Firecracker VM per user or session, no shared kernel, no shared resources,
snapshot-based near-instant resume, up to **8 hours** runtime, **32 GB** RAM, **16 vCPU**, **32 GB** disk,
container-based (`public.ecr.aws/lambda/microvms:al2023-minimal`), driven by `create-microvm-image` and
`run-microvm`.

| | |
|---|---|
| **Isolation** | **Strongest managed option.** Purpose-built by AWS for user- and AI-generated code |
| **Pricing model** | Per-second vCPU + RAM, **plus snapshot read on every launch** ($0.00155/GB), write ($0.0038/GB) and storage ($0.08/GB-month) |
| **The catch** | The snapshot-read charge is **per launch**. For short stateless gradings it dominates — a 1 GB snapshot costs ~$0.00155 *per execution*, roughly **20× the entire Lambda cost** of Option D |
| **Where it fits** | One MicroVM per **contest session** (which `ContestParticipation.session_duration_minutes` already models), not per submission |
| **Mumbai availability** | **UNCONFIRMED.** The launch blog lists us-east-1, us-east-2, us-west-2, eu-west-1, ap-northeast-1 — Mumbai is *not* among them. One secondary source claims expansion to 9 regions including ap-south-1. **Verify before designing around it** |

**Verdict:** the right tool for a persistent per-student coding *workspace* — a product this platform does not
currently have (profile §11). For stateless grading it is the wrong billing shape. Revisit if you ever add
in-browser persistent environments.

### Option F — App Runner (API) + Lambda (execution)

App Runner has been available in ap-south-1 since November 2023. Fully managed containers: no ALB, no ECS
cluster, no task definitions, automatic TLS and scaling.

| | |
|---|---|
| **Monthly** | ~$50–70 (**₹4,300–6,000**) at 2k |
| **Isolation** | Same as Option D — Lambda does the execution |
| **Ops burden** | **Lowest of any option.** Push an image; App Runner runs it |
| **Limits** | No host Docker access (irrelevant here), fewer networking knobs, VPC connector costs extra |
| **Choose when** | The team is small and operational simplicity is worth ~₹1,500/month |

A genuinely good fit for a college with no dedicated platform engineer. The premium over Option D buys you
never touching an ALB, an ASG, or a task definition.

### Option G — EKS / EKS Auto Mode

| | |
|---|---|
| **Monthly** | ~$73 control plane **before any workload**, plus nodes, plus Auto Mode surcharge |
| **Isolation** | Strong if configured — gVisor/Kata RuntimeClass, `restricted` Pod Security, deny-all NetworkPolicy |
| **Ops burden** | **Highest.** There is no other Kubernetes in this estate |
| **Choose when** | Genuine multi-institution SaaS with a platform team |

Not justified for a single college. Listed for completeness and for the 10,000+ multi-tenant future.

---

## 3. FRONT DOOR: THREE WAYS IN

| Option | Cost | Max timeout | Verdict |
|---|---|---|---|
| **ALB** | ~$16/mo + LCUs | Configurable, minutes | Safe default. Required if you run >1 API instance |
| **API Gateway (Regional REST)** | Per-request | **300 s** via Service Quotas — the old 29 s cap is liftable since June 2024 | **Now viable** (corrects profile §16). Raising it may require reducing your Region-level throttle quota. HTTP APIs are still capped |
| **CloudFront → EC2 origin directly** | **$0** extra | No practical limit | Cheapest. No health checks, no multi-instance. Fine at 2,000 users |

At 2,000 users, skip the ALB entirely and let CloudFront hit the instance. At 10,000 you need the ALB.

**In all three cases, route `/api/*` through CloudFront** — the frontend's hard-coded relative `/api` base URL
then works unchanged, and all egress bills against CloudFront's free tier instead of EC2 data-transfer rates.

---

## 4. UNTRUSTED-CODE ISOLATION, RANKED

| Rank | Approach | Boundary | Startup | Cost shape | Verdict |
|---|---|---|---|---|---|
| 1 | **Lambda MicroVMs** | Dedicated Firecracker VM per session | Near-instant (snapshot) | Per-second + **per-launch snapshot read** | Best isolation; wrong billing shape for stateless grading; Mumbai unconfirmed |
| 2 | **Lambda (standard)** | Firecracker microVM, **reused across warm invocations** | Sub-second warm | Per-ms, huge free tier | **Best overall fit.** Mitigate warm reuse |
| 3 | **Fargate task per submission** | Firecracker microVM, fresh per task | 20–60 s | 1-minute minimum billing | Strong isolation, poor latency and granularity |
| 4 | **ECS on EC2 + gVisor** | Second kernel via `runsc`, ~10–15% CPU overhead | 0.3–2 s (warm images) | Cheapest per CPU-second | Best latency+cost if you own the fleet |
| 5 | **ECS on EC2, plain runc** | Shared kernel | 0.3–2 s | Cheapest | Roughly today's posture, hardened |
| 6 | **Today's setup** | Shared kernel **+ host Docker socket** | 0.3–2 s | — | **Root-equivalent exposure. Replace** |

Whatever you choose, these carry over from the profile and are not optional: `--network none` (or a
NAT-less VPC subnet), non-root, `--cap-drop=ALL`, read-only rootfs, a real CPU quota (the `--cpus 10` bug),
hard kill on timeout, and **IMDSv2 with hop limit 1** so no sandbox can reach instance credentials.

---

## 5. WHY LAMBDA EXECUTION IS SO CHEAP

Verified inputs: Lambda's perpetual free tier is **1M requests + 400,000 GB-seconds per month**. Assume
per-submission batching (one invocation grades all test cases), arm64, 1 GB memory.

**2,000 users** — ~600 DAU × 5 submits/day = 90,000 submits/month, ~6 s average:
```
90,000 × 6 s × 1 GB          =   540,000 GB-s
less free tier                =  -400,000 GB-s
billable                      =   140,000 GB-s × ~$0.0000133  ≈  $1.86
requests: 90,000              →  free (under 1M)
                                                        TOTAL ≈ $2/month
```

**10,000 users** — ~3,000 DAU × 5 submits/day = 450,000 submits/month:
```
450,000 × 6 s × 1 GB          = 2,700,000 GB-s
less free tier                =  -400,000 GB-s
billable                      = 2,300,000 GB-s × ~$0.0000133 ≈  $31
requests: 450,000             →  free (under 1M)
                                                        TOTAL ≈ $31/month
```

Compare: a Spot EC2 execution fleet is ~$5/month at 2k and ~$50/month at 10k, **and** you own the AMI, the
patching, the reaper, and the isolation. Lambda is cheaper *and* less work *and* better isolated.

**Sensitivity — the two unknowns from profile §18 still dominate.** Average test cases per problem and
language mix (Java/C++ cost 3–8× Python) can move the 6-second assumption by 3×, which at 10,000 users is the
difference between $31 and ~$100/month. Both resolve with one SQL query each.

---

## 6. RECOMMENDED STACKS

### At 2,000 users — ~₹3,400/month

```
Route 53 → CloudFront (free tier) ─ /*      → S3 (React SPA)
                                   ─ /api/* → EC2 t4g.medium (Elastic IP, Let's Encrypt)
                                                nginx + Django (gthread) + Redis + Celery
                                                    │
                                    invoke ─────────┼──→ Lambda (arm64 container, VPC no-NAT)
                                                    │      one invocation per submission
                                                    └──→ RDS db.t4g.micro, single-AZ, PITR
```

| Item | ~USD | ~INR |
|---|---|---|
| EC2 `t4g.medium`, 1-yr Savings Plan | $16 | ₹1,360 |
| EBS 30 GB + 1 public IPv4 | $6.30 | ₹536 |
| RDS `db.t4g.micro` single-AZ, 20 GB | $15 | ₹1,275 |
| **Lambda execution** | **$2** | **₹170** |
| S3 + CloudFront (free tier) | $0.50 | ₹43 |
| Route 53, CloudWatch (7-day), ECR, backups | $5 | ₹425 |
| **Total** | **~$45** | **~₹3,825** |

Cheaper *and* better isolated than the ₹4,050 Spot-fleet build, with less to operate.

### At 10,000 users — ~₹16,000/month

Same shape, plus: ALB (~$25), 2× `t4g.large` (~$60), `db.t4g.medium` (single-AZ ~$65 / Multi-AZ ~$129),
ElastiCache `t4g.small` (~$25), Lambda execution (~$31), larger CloudWatch (~$18).

**The binding constraint at 10,000 is the database, not compute.** There is no `DATABASE_ROUTERS` and no
`.using()` anywhere, so read replicas are impossible without a code change and you can only scale vertically.
Two things decide this tier:
1. **Materialise campus rank** (profile §19 #6) — at 10k it is 10,000 rows × 3 distinct-count joins, in Python, per dashboard load.
2. **Add read routing** before you exceed 10k, or budget vertical DB scaling as your dominant line item.

---

## 7. MIGRATION PATH

Each phase is independently shippable and each one reduces cost or risk.

| Phase | Do | Why |
|---|---|---|
| **0** | Fix the S1 security findings (profile §20): unauthenticated `DROP DATABASE`, unauthenticated code execution, forgeable password-reset token, committed diagnostic token | Free. **Blocks internet exposure.** The unauthenticated executor also makes any AWS bill attacker-controlled |
| **1** | Per-submission batching + `--cpus 1` + kill-on-timeout + `gthread` | Free. 5–20× capacity. Makes every option below cheaper |
| **2** | Lift to one EC2 + CloudFront + S3 + RDS (Option A/B shape) | Managed TLS, CDN, backups, snapshots |
| **3** | Move execution to Lambda (Option D) | Removes the Docker socket; execution cost → ~$2/month |
| **4** | Sessions → Redis, media → S3, indexes, pagination | Right-sizes RDS; makes the API horizontally scalable |
| **5** | Add ALB + a second API instance when you cross ~2,000 concurrent | Removes the SPOF |
| **6** | Materialise campus rank; add read routing | The 10,000-user gate |

Phases 0 and 1 are pure code and cost nothing. They deliver more capacity than any instance upgrade in either
budget.

---

## 8. TRAPS

1. **The AWS Free Tier now auto-closes your account.** Since 15 July 2025, new accounts get $100 on signup
   (+$100 from five onboarding tasks, $20 each). The **Free plan lasts 6 months or until credits run out,
   then the account closes automatically.** For a college this is a data-loss event waiting to happen.
   **Open a Paid plan account for anything real.** Accounts created before 15 July 2025 are unaffected.
2. **Apply for AWS Educate / AWS Academy credits.** You are an educational institution; institutional credits
   could plausibly cover a year of either build outright.
3. **NAT Gateway is ~$41/month before data.** Nothing in this design needs it. Sandboxes need no egress at
   all; keep them in isolated subnets and use gateway endpoints (S3/DynamoDB are free) plus a public-subnet
   app instance.
4. **Fargate's 1-minute minimum billing** makes per-test-case Fargate tasks absurd. Batch, or don't use it.
5. **Lambda MicroVM snapshot-read charges are per launch** — cheap for long sessions, ruinous for short
   stateless gradings.
6. **RDS Extended Support** bills extra for end-of-life PostgreSQL majors. The current PG version is
   **unknown** (profile §18) — run `SELECT version();` before choosing an RDS engine version.
7. **Set AWS Budgets on day one**, with a budget action that stops the execution path at 100%, and a hard
   `MaxSize` on any ASG. There is no true hard spending cap on AWS.

---

## 9. SOURCES

- [Run isolated sandboxes with full lifecycle control: AWS Lambda introduces MicroVMs](https://aws.amazon.com/blogs/aws/run-isolated-sandboxes-with-full-lifecycle-control-aws-lambda-introduces-microvms/)
- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [Amazon API Gateway integration timeout limit increase beyond 29 seconds](https://aws.amazon.com/about-aws/whats-new/2024/06/amazon-api-gateway-integration-timeout-limit-29-seconds/)
- [Quotas for configuring and running a REST API in API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html)
- [Increase the API Gateway integration timeout limit — AWS re:Post](https://repost.aws/knowledge-center/api-gateway-timeout-limit)
- [AWS Free Tier now offers $200 in credits and 6-month free plan](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/)
- [AWS App Runner is now available in London, Mumbai, and Paris](https://aws.amazon.com/about-aws/whats-new/2023/11/aws-app-runner-london-mumbai-paris-regions)
- [Amazon Aurora Serverless v2 supports scaling to zero capacity](https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-aurora-serverless-v2-scaling-zero-capacity)
- [AWS Fargate Pricing](https://aws.amazon.com/fargate/pricing/)
- [Amazon ECS Pricing](https://aws.amazon.com/ecs/pricing/)
- [AWS Lambda MicroVMs — The Register coverage](https://www.theregister.com/devops/2026/06/23/aws-debuts-lambda-microvms-with-up-to-8-hours-runtime/5260035)

### Unverified — confirm before committing

| Item | Status |
|---|---|
| Lambda MicroVM availability in ap-south-1 | Launch blog lists 5 regions, **Mumbai not among them**; one secondary source claims 9. Confirm in the console |
| Exact ap-south-1 prices for EC2, RDS, Fargate, ALB | Aggregators disagreed (one claimed `db.t4g.micro` at $28/mo vs ~$14 expected). **Use the AWS Pricing Calculator** |
| arm64 build of the C/C++ sandbox image (Boost, CGAL, TBB, LEMON) | All exist on Debian bookworm arm64, but **build and test before committing to Graviton** |
| Lambda cold-start latency for a slimmed C/C++ image | Measure directly |
