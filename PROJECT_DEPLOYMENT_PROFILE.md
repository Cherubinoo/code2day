# PROJECT DEPLOYMENT PROFILE — Code2Day / RAMCOAD

> **Purpose.** This document is an evidence-based audit of the `code2day` repository, written so that another
> architect (human or AI) can design an AWS production architecture and build a realistic cost model.
>
> **Evidence discipline.** Every claim is tagged:
> - **[VERIFIED]** — read directly from a file in this repository (path + line given where useful).
> - **[INFERRED]** — a reasonable deduction from repository evidence, stated with the reasoning.
> - **[UNKNOWN — requires measurement]** — not determinable from the repository; a measurement method is given.
>
> **Audit basis:** git HEAD `26fbc88` ("Switch execution flow to Judge0 and LeetCode-style input handling"),
> committed 2026-08-02. Working tree clean. No application source was modified by this audit.

---

## 0. EXECUTIVE ORIENTATION (read this first)

Code2Day is a **single-tenant-per-deployment campus placement-readiness platform** for an engineering college
(RIT / Ramco, domain `code2day.ramcoad.com`). It is a LeetCode-style coding practice + contest + aptitude +
lab-assignment system with 7 role-based dashboards.

Four facts dominate the AWS design and cost model:

1. **There is no queue, no cache, no WebSocket, and no async worker in the running system.** Celery/Redis appear
   in the README and in dead code, but **`celery` is not in `requirements.txt`** — the async path cannot run.
   All code execution happens **synchronously inside the HTTP request**.
2. **A single "submit" fans out to N sequential container executions**, one per test case, each a blocking HTTP
   call with up to 3 retries. A 10-test-case Java submit can hold a Gunicorn worker for 30–90 seconds.
3. **User code runs via Docker-out-of-Docker** — the executor container shells out to `docker run` on the host
   daemon. This requires the host Docker socket, which is **root-equivalent on the host**.
4. **Multiple critical endpoints are unauthenticated**, including one that creates and **drops PostgreSQL
   databases**, and one that **executes arbitrary code**. These must be fixed before any internet exposure,
   AWS or otherwise.

---

## 1. REPOSITORY STRUCTURE

### 1.1 Root layout **[VERIFIED]**

```text
code2day/
├── .github/workflows/deploy.yml      CI/CD — GitHub Actions, self-hosted runner
├── backend/                          Django 5.1 REST API (the entire server-side application)
├── frontend/                         React 18 + Vite SPA (Monaco-based browser IDE)
├── code-executor/                    Custom FastAPI code-execution service + language images
├── dataset/                          Seed data: 24 aptitude .xlsx workbooks + 1 lab CSV template
├── sample_reports/                   Two example generated PDFs (artifacts, not code)
├── scratch/                          One-off developer script (fix_auth_screen.py)
├── docker-compose.yml                Frontend service ONLY (see §9.1 — this is not the full stack)
├── Dockerfile.custom                 Legacy: custom image FROM judge0/judge0:latest
├── nginx.conf / code2day_nginx_block.txt   Host reverse-proxy config (TLS termination)
├── README.md (1263 lines)            Documentation — partly aspirational, see §1.4
├── ERRORS.md (315 lines)             Error-contract reference for frontend/backend
└── *.sh  (18 shell scripts)          Server-side deploy / repair / install scripts
```

### 1.2 Backend tree **[VERIFIED]**

```text
backend/
├── code2day/                         Django project package
│   ├── settings.py                   Single settings module, env-driven (271 lines)
│   ├── urls.py                       Mounts /admin/ and /api/ only
│   ├── wsgi.py, asgi.py              Both present; only WSGI is used in deployment
│   └── celery.py                     DEAD CODE — celery not installed (see §2.3)
├── apps/learning/                    The one and only Django app — the entire domain
│   ├── models.py         (1,565 ln)  38 models
│   ├── views.py         (11,092 ln)  137 APIView classes — monolithic
│   ├── urls.py            (357 ln)   138 URL routes
│   ├── serializers.py     (320 ln)   DRF serializers
│   ├── auth_utils.py      (207 ln)   Auth mixins + in-process rate limiter
│   ├── middleware.py       (66 ln)   MaintenanceMiddleware (DB hit per request)
│   ├── file_views.py      (329 ln)   Institution file/branding upload+download
│   ├── pdf_reports.py   (1,636 ln)   ReportLab PDF generation (CPU-heavy)
│   ├── advanced_filters.py (597 ln)  NOT WIRED INTO urls.py — dead (see §1.4)
│   ├── tasks.py           (181 ln)   Celery tasks — DEAD CODE
│   ├── data.py            (124 ln)   Hard-coded fallback dashboard/problem payloads
│   ├── db_manager.py       (93 ln)   CREATE DATABASE / DROP DATABASE DDL helpers
│   ├── services/
│   │   ├── judge0.py         (385 ln) Judge0 REST client (retry/backoff)
│   │   ├── executor.py       (109 ln) Thin alias layer over judge0.py
│   │   ├── execution_adapter.py (2,416 ln) LeetCode-style driver/wrapper codegen, 16 languages
│   │   ├── problem_testcases.py (79 ln) Test-case resolution (stored → examples fallback)
│   │   ├── code_validator.py (235 ln) Regex denylist pre-execution filter
│   │   └── complexity_analyzer.py (349 ln) AST/regex Big-O estimator
│   ├── migrations/                   61 migration files
│   ├── management/commands/          32 management commands (seed, import, cleanup, contest ops)
│   ├── tests.py (589 ln), tests_execution_flow.py (81 ln)
│   └── static/                       college_logo.png, logo.jpeg
├── scripts/                          8 ad-hoc import scripts (MySQL→PG, LeetCode CSV/HuggingFace)
├── requirements.txt                  33 lines, pinned
├── requirements_pdf.txt              PDF extras
├── Dockerfile.backend                python:3.11-slim + gunicorn
├── docker-compose.yml                Backend service only (git-tracked, added commit 85566db)
└── *.py at root                      9 debug/one-off scripts (check_*, debug_*, test_*, reset_*)
```

**Purpose:** monolithic Django REST API. One app (`apps.learning`) owns identity, problems, contests,
aptitude, labs, discussions, analytics, PDF reporting, and code-execution orchestration.

### 1.3 Frontend tree **[VERIFIED]**

```text
frontend/
├── src/
│   ├── App.jsx            (1,574 ln)  Root SPA shell, routing, auth state, code editor state
│   ├── main.jsx                       React entry
│   ├── styles.css         (9,576 ln)  All styling, plain CSS (+ header-fix.css, layout-fix.css)
│   ├── lib/
│   │   ├── api.js                     fetch wrapper, 60 s timeout, CSRF header, credentials:include
│   │   ├── codeExecution.js           POST /api/run/, language→Judge0 ID map
│   │   ├── appUtils.js, appData.js, achievementData.js, languageDetector.js, useHistoryNav.js
│   └── components/  (46 .jsx files)
│       ├── common/     (16)  AuthScreen, TopBar, Footer, charts, modals, maintenance screen
│       ├── student/    (16)  Problems, Contest workspaces, Aptitude, Labs, Discuss, Progress
│       ├── staff/       (5)  StaffDashboard, ContestCreator, EnhancedContestCreator, LabPanel
│       ├── hod/         (4)  HODDashboard (2,521 ln), Lab/Company centres, contest approval
│       ├── admin/       (2)  AdminDashboard, InstitutionDetail
│       └── ja/          (1)  JADashboard (2,335 ln) — Junior Admin student management
├── index.html, vite.config.js, package.json, package-lock.json
├── Dockerfile.frontend                node:20 build → nginx:alpine static serve
├── nginx-frontend.conf                SPA fallback + 1-year asset cache
└── public/logo/logo.jpeg
```

**Purpose:** browser IDE (Monaco) + role dashboards. Static SPA; no SSR.

### 1.4 Documentation vs. reality — CRITICAL DISCREPANCIES **[VERIFIED]**

The AWS architect must **not** design from `README.md`. Verified mismatches:

| README claim | Repository reality | Impact |
|---|---|---|
| "Task Queue: Celery + Redis" (README:129) | `celery` absent from `requirements.txt`; `tasks.py`/`celery.py` cannot import | No async processing exists |
| "Cache / Broker: Redis" (README:155) | No `CACHES` setting, no redis client dependency | No cache tier to size |
| `docker-compose.yml` has 8 services incl. `nginx`, `redis`, `celery`, `db` (README:1017-1028) | Root compose has **1 service** (frontend); `backend/docker-compose.yml` has 1 (backend) | The real production compose file is **not in the repo** |
| "SQLite (development)" (README:126) | `settings.py` hard-codes the PostgreSQL engine | PostgreSQL only |
| `DATABASE_URL`, `REDIS_URL`, `JUDGE0_TOKEN`, `MAX_CPU_TIME`, `RATE_LIMIT_MAX` documented (README:1071-1099) | None of these names are read anywhere in the code | Env contract in README is wrong; see §14 for the real list |
| "Django sends a job to Judge0 and **polls** for a verdict" (README:199) | `judge0.py:159` uses `?wait=true` — fully synchronous, no polling | Long-held request threads |

Additional dead/broken code found:

- **`advanced_filters.py`** defines `AdvancedStudentFilterView`, `StudentDataExportView`,
  `StudentPerformancePDFReport` but is **never imported by `urls.py`**. The frontend calls
  `/api/students/advanced-filter/`, `/api/students/export/`, `/api/students/export-pdf/`,
  `/api/students/performance-stats/` — all of which **404**. **[VERIFIED]**
- **`LabSubmitView`** (`views.py:9776`) calls
  `prepare_execution_payload(source_code=…, language_id=…, stdin=…, problem_slug=…, execution_type=…, function_name=…)`
  but the real signature is `prepare_execution_payload(*, problem, source_code, language, stdin)`
  (`execution_adapter.py:2356`). Every call raises `TypeError`, which is **not** caught (only `ExecutorError` is)
  → `POST /api/lab/problems/<slug>/submit/` always returns **500**. **[VERIFIED]**
- **`tasks.py` / `celery.py`** — unreachable. **[VERIFIED]**
- **`Dockerfile.custom`**, `judge0_install.sh`, `deploy-judge0.sh`, `build-custom-judge0.sh` — a previous
  Judge0-CE generation, superseded. Most are in `.gitignore` yet still tracked. **[VERIFIED]**

---

## 2. TECHNOLOGY STACK

### 2.1 Master table **[VERIFIED unless noted]**

| Component | Technology | Version | Purpose |
|---|---|---|---|
| Frontend framework | React | 18.3.1 | SPA, role dashboards |
| Frontend build | Vite | 5.4.11 | Bundling; `npm run build` → `dist/` |
| Code editor | monaco-editor + @monaco-editor/react | 0.44.0 / 4.7.0 | Browser IDE — the largest JS asset |
| Icons | lucide-react | 1.7.0 | UI icons |
| Spreadsheet (browser) | xlsx (SheetJS) | 0.20.3 **from `cdn.sheetjs.com` tarball, not npm** | Client-side Excel export/parse |
| Charts | none (hand-rolled SVG) | — | `PerformanceCharts.jsx` |
| Backend framework | Django | 5.1.4 | Web framework |
| API layer | djangorestframework | 3.15.2 | 137 APIView classes |
| CORS | django-cors-headers | 4.6.0 | Cross-origin for Vite dev + prod domain |
| Config | python-dotenv | 1.0.1 | Loads `backend/.env` |
| Database driver | psycopg2-binary | 2.9.9 | PostgreSQL |
| Secondary DB driver | PyMySQL | 1.1.1 | Reads the **external college MySQL** (student master data) |
| HTTP client | requests 2.31.0 / urllib3 2.2.3 / stdlib urllib | — | Logo fetch (requests), executor calls (urllib) |
| WSGI server | gunicorn | 23.0.0 | 12 sync workers in prod compose |
| Static files | whitenoise | 6.8.2 | **Installed but NOT in MIDDLEWARE — inactive** (see §20) |
| PDF | reportlab | 4.0.7 | Student/staff/contest reports, watermarking |
| Excel ingest | openpyxl 3.1.5 / pandas 2.2.3 | — | JA bulk student import, aptitude seeding |
| Images | Pillow | 10.4.0 | Logo upload/resize for PDFs |
| SQL formatting | sqlparse | 0.5.3 | Django dependency |
| Executor service | FastAPI + uvicorn[standard] | 0.115.0 / 0.30.6 | Judge0-compatible execution API |
| Executor Docker client | docker (SDK) | 7.1.0 | Imported; actual runs use `subprocess` + `docker` CLI |
| Executor validation | pydantic | 2.9.2 | Request/response models |
| Containers | Docker + Docker Compose | — | All services |
| Reverse proxy | nginx | (host-installed) | TLS, `/api`→8000, `/`→8001 |
| CI/CD | GitHub Actions | — | CI on ubuntu-latest, CD on self-hosted runner |
| Cache | **NONE** | — | No `CACHES`; no Redis client |
| Queue | **NONE** | — | Celery declared but not installed |
| WebSocket | **NONE** | — | Zero matches for WebSocket/SSE/channels repo-wide |
| Object storage | **NONE** | — | Local filesystem via `MEDIA_ROOT` |

### 2.2 Why each critical dependency exists **[VERIFIED / INFERRED]**

- **`psycopg2-binary` + `PyMySQL` together** — the platform's own data is PostgreSQL; **student master records
  are pulled from a separate college MySQL database** (`collegeadmissiondb.personaldetails`) by
  `manage.py import_students`, which the CD pipeline runs on **every deploy**
  (`.github/workflows/deploy.yml:167`). This is a hard external dependency for AWS network design.
- **`reportlab` + `Pillow` + `requests`** — synchronous, in-request PDF report generation with an institution
  logo fetched over HTTP at render time (`pdf_reports.py:93,157,1528`). CPU- and latency-heavy.
- **`openpyxl` + `pandas`** — Junior Admin uploads `.xlsx` rosters; `JABulkImportView` materialises **all rows
  into a Python list in one request** (`views.py:8701`).
- **`monaco-editor`** — the browser IDE. Dominates frontend bundle size and CDN egress.
- **`gunicorn` (sync workers)** — no async worker class is configured, so **one worker = one in-flight request**.
  This is the single most important capacity constant in the system.

### 2.3 Notable absences that change the AWS design **[VERIFIED]**

| Missing | Consequence |
|---|---|
| No `celery`, no broker | Every long operation (execution, PDF, bulk import) runs in the request → no SQS/worker tier exists *yet*, but one is required |
| No `CACHES` / Redis | Sessions, rate limits and dashboards hit PostgreSQL directly → ElastiCache is a *new* component, not a lift-and-shift |
| No `CONN_MAX_AGE` | Django default `0` → **a new PostgreSQL connection per request** |
| No `django-storages` / `boto3` | Uploads go to a local volume → S3 migration requires a code change |
| No structured logging / APM | Only console `StreamHandler` → CloudWatch will receive unstructured stdout |
| No pagination classes in DRF settings | List endpoints return full tables (see §19) |

---

## 3. APPLICATION ARCHITECTURE

### 3.1 Actual request flow **[VERIFIED]**

```text
                         Browser (React 18 SPA, Monaco editor)
                                        │  HTTPS, cookie session + X-CSRFToken
                                        ▼
                    Host nginx  (systemd, TLS via Let's Encrypt)
                    code2day.ramcoad.com  :443
                    ├── /api/     → 127.0.0.1:8000   (proxy_read_timeout 120s, body 20M)
                    ├── /admin/   → 127.0.0.1:8000
                    ├── /static/  → 127.0.0.1:8000   (⚠ nothing serves it — see §20)
                    └── /         → 127.0.0.1:8001   (frontend nginx container)
                                        │
        ┌───────────────────────────────┴──────────────────────────────┐
        ▼                                                              ▼
  code2day-frontend  (nginx:alpine)                        code2day-backend (gunicorn)
  serves dist/ static SPA, :80→8001                        Django 5.1 + DRF, :8000
  no API logic, no SSR                                     12 sync workers, timeout 120s
                                                                       │
                          ┌────────────────────────────────────────────┼───────────────────────────┐
                          ▼                                            ▼                           ▼
        PostgreSQL (host, host.docker.internal:5432)   code2day-executor :2358      External MySQL
        DB "code2day", user postgres                   Judge0-compatible REST        collegeadmissiondb:3306
        django_session written on EVERY request        POST /submissions?wait=true   (deploy-time roster sync)
        new connection per request                                 │
                                                                   ▼
                                              subprocess → `docker run --rm --network none …`
                                              on the HOST Docker daemon (DooD)
                                                                   │
                                       ┌───────────┬───────────┬───────────┬───────────┐
                                       ▼           ▼           ▼           ▼           ▼
                              code2day-python  -node      -java       -c          -cpp
                              (one throwaway container per test case)
```

**There is no queue, no cache, no pub/sub, no WebSocket in this graph.** **[VERIFIED]**

### 3.2 Interface inventory **[VERIFIED]**

| Interface | Present? | Evidence |
|---|---|---|
| REST / HTTP JSON | **Yes** — 138 routes under `/api/` | `backend/apps/learning/urls.py` |
| Django Admin (HTML) | **Yes** — `/admin/` | `code2day/urls.py:7` |
| GraphQL | No | no library, no schema |
| WebSocket | **No** | zero repo-wide matches; `asgi.py` is plain `get_asgi_application()` |
| Server-Sent Events | **No** | no `EventSource`, no streaming responses |
| gRPC | No | — |
| Internal service API | **Yes, one** — Django → executor `POST /submissions?wait=true&base64_encoded=true` | `services/judge0.py:159` |
| Background jobs | **No runtime jobs.** Celery code exists but cannot run | `requirements.txt` |
| Scheduled jobs | **No cron/beat in repo.** 32 management commands are *invoked by the deploy pipeline*, not scheduled | `.github/workflows/deploy.yml:167-176` |
| Event-driven | No | — |
| Real-time UX | **Simulated by client polling** — see §4.6 | `setInterval` in 21 places |

### 3.3 Service-by-service characteristics **[VERIFIED]**

#### Service A — `code2day-backend` (Django + Gunicorn)

| Property | Value |
|---|---|
| Start command | `python manage.py migrate --noinput && gunicorn code2day.wsgi:application --bind 0.0.0.0:8000 --workers 12 --timeout 120 --max-requests 1000 --max-requests-jitter 100` (`backend/docker-compose.yml:15`) |
| Image default (if compose command not used) | `gunicorn … --workers 4` (`Dockerfile.backend:17`) |
| Port | 8000 (host-published) |
| Worker class | **sync** (not specified → Gunicorn default) → 12 concurrent requests maximum |
| Depends on | PostgreSQL (`host.docker.internal:5432`), executor (`http://code2day-executor:2358`), external MySQL (deploy only) |
| Stateful? | **Partially.** Process-local state: `InMemoryRateLimiter` dict (`auth_utils.py:195`) and Django's default LocMemCache. Sessions are in PostgreSQL, so login survives restarts; **rate limits do not and are not shared across workers or tasks** |
| Horizontally scalable? | **Yes, with caveats** — rate limiting becomes per-instance and weaker; requires sticky-free session (already DB-backed) |
| Persistent storage | **Yes** — named volume `code2day-backend-media:/app/media` for institution logos/files (`backend/docker-compose.yml:12`) |
| In-memory state | Rate-limit buckets only |
| Migrations | Run automatically on container start **and** again in CI — concurrent-start hazard if replicas > 1 |

#### Service B — `code2day-frontend` (nginx serving the Vite build)

| Property | Value |
|---|---|
| Start | `nginx -g 'daemon off;'` (`Dockerfile.frontend:23`) |
| Port | container 80 → host 8001 |
| Depends on | nothing at runtime (pure static) |
| Stateful? | No |
| Horizontally scalable? | Yes, trivially |
| Persistent storage | No |
| Note | Compose injects `DB_NAME/DB_USER/DB_PASSWORD/DB_HOST/DB_PORT` into this container (`docker-compose.yml:14-18`) — **unnecessary and a secret-exposure smell**; a static nginx container has no use for DB credentials |

#### Service C — `code2day-executor` (FastAPI, Judge0-compatible)

| Property | Value |
|---|---|
| Start | `uvicorn main:app --host 0.0.0.0 --port 2358 --workers 4` (`code-executor/Dockerfile:23`) |
| Port | 2358 |
| Depends on | **the host Docker daemon** (shells out to `docker run`) and 5 prebuilt language images |
| Stateful? | No durable state; `token` is a throwaway UUID, `GET /submissions/{token}` always returns "Accepted" (`main.py:302-305`) — **it is not a real job store** |
| Horizontally scalable? | Yes *if* each instance has its own container runtime; **not** if instances share one Docker daemon (they would contend for host CPU/PIDs) |
| Persistent storage | No — uses `tempfile.TemporaryDirectory()` per execution (`main.py:124`) |
| In-memory state | `ThreadPoolExecutor(max_workers=MAX_WORKERS)`, default 40 — **per uvicorn worker**, so 4 × 40 = **up to 160 concurrent `docker run` processes** |

#### Service D — PostgreSQL (host-installed, not containerised in any tracked compose)

| Property | Value |
|---|---|
| Reached as | `host.docker.internal:5432`, DB `code2day`, user `postgres` (`backend/docker-compose.yml:20-24`) |
| Non-DEBUG default in code | user `judge0`, host `172.18.0.1` (`settings.py:102-104`) — a leftover from the Judge0 era |
| Stateful | **Yes — the only durable datastore** |
| Pooling | **None.** `CONN_MAX_AGE` unset → 0 → connect/disconnect per request |

---

## 4. FRONTEND ANALYSIS

### 4.1 Framework & build **[VERIFIED]**

- React 18.3.1, function components + hooks. No Redux/Zustand/React Query — plain `useState`/`useEffect`
  in `App.jsx` (1,574 lines) with prop drilling into page components.
- Vite 5.4.11. `npm run build` → `dist/`. `commonjsOptions.transformMixedEsModules: true` and Monaco
  `optimizeDeps` tuning (`vite.config.js:39-50`).
- **Fully static, client-rendered. No SSR, no Next.js, no server runtime.** **[VERIFIED]**

### 4.2 API base URL & routing **[VERIFIED]**

- `BASE_URL = '/api'` — a **relative path**, hard-coded (`src/lib/api.js:3`). There is **no** `VITE_API_URL`
  build-time variable.
- Consequence: **the frontend must be served from the same origin as the API**, or a proxy must rewrite `/api`.
  Today the host nginx does this. On AWS this forces either (a) CloudFront with an `/api/*` origin behaviour
  pointing at the ALB, or (b) a code change to introduce an absolute API base URL.
- Dev only: Vite proxies `/api` to `VITE_API_TARGET || http://127.0.0.1:8000` (`vite.config.js:29-33`).
- Client-side routing is custom (`useHistoryNav.js`) with `try_files $uri /index.html` SPA fallback
  (`nginx-frontend.conf:22`).

### 4.3 Authentication flow **[VERIFIED]**

1. `GET /api/csrf-token/` → sets the CSRF cookie (`CSRF_COOKIE_HTTPONLY = True`, so the SPA reads the token
   from the response body/header, not the cookie).
2. `POST /api/auth/lookup/` → identifies whether the identifier is student / staff / admin, and whether a
   password has been set.
3. First-time users → `POST /api/auth/first-login/` (or the staff/admin variant) to set a password.
4. `POST /api/auth/login/` → Django session cookie (`HttpOnly`, `Secure`, `SameSite=Lax` in prod;
   **30-day lifetime**, `SESSION_SAVE_EVERY_REQUEST = True`) (`settings.py:142-165`).
5. Every subsequent call uses `credentials: 'include'` + `X-CSRFToken` (`api.js:35,61`).
6. Identity/institution mirrored into `localStorage` for UI bootstrapping.

**Implication for AWS:** cookie-based sessions stored in the PostgreSQL `django_session` table, rewritten on
**every authenticated request**. This is a per-request write amplifier and the strongest argument for an
ElastiCache-backed session store.

### 4.4 File upload / download **[VERIFIED]**

- Uploads: institution logo + institution files, `multipart/form-data` via `api.post`/`api.patch` with
  `FormData` (`api.js:58,92`); JA roster `.xlsx` upload to `/api/ja/import/`.
- Downloads: PDFs via `api.getBlob()` (`api.js:157`) — student report, staff report, contest report,
  JA Excel template, institution file download.
- Max body size: **20 MB** at the host nginx (`code2day_nginx_block.txt:19`); 10 MB in the alternate
  `nginx.conf:45`. No Django-level `DATA_UPLOAD_MAX_MEMORY_SIZE` override → Django default 2.5 MB in-memory
  threshold applies.

### 4.5 Large assets & CDN suitability **[VERIFIED / INFERRED]**

- Monaco Editor is the dominant asset. **[UNKNOWN — requires measurement]** exact built bundle size; measure
  with `cd frontend && npm ci && npm run build && du -sh dist && ls -lS dist/assets | head`.
  **[INFERRED]** typical Monaco-bearing Vite bundles land at 3–6 MB uncompressed / 1–2 MB gzipped.
- `styles.css` is 9,576 lines (single stylesheet).
- Static assets already carry `expires 1y; Cache-Control: public, immutable` (`nginx-frontend.conf:15-19`)
  and gzip (`nginx-frontend.conf:9-13`) — **CDN-ready as-is**.
- Repo-tracked media is small: `frontend/public` 12 KB, `backend/static` 300 KB, `dataset/` 1.1 MB.

### 4.6 Browser storage & polling **[VERIFIED]**

`localStorage` keys: `code2day-code`, `code2day-language`, `code2day-problem-slug`, `code2day-problem-start`,
`code2day-user-type`, `code2day-institution-id`, `code2day-register-number`, `code2day-selected-institution`,
`code2day-expanded-sections`. **In-progress code is persisted only in the browser** — it is never
auto-saved server-side (`App.jsx:627-631`).

Polling — the substitute for WebSockets, and a direct driver of API request volume:

| Screen | Endpoint | Interval | Source |
|---|---|---|---|
| DiscussPage | `/api/discussions/` | **5 s** | `DiscussPage.jsx:76` |
| DiscussPage | `/api/notifications/` | **10 s** | `DiscussPage.jsx:77` |
| TopBar (global, all roles) | `/api/notifications/` | 60 s | `TopBar.jsx:190` |
| HODDashboard | unread count | 30 s | `HODDashboard.jsx:104` |
| LabsPage / StaffLabPanel | deadline recompute | 30 s | `LabsPage.jsx:40`, `StaffLabPanel.jsx:41` |
| Contest/aptitude timers | local countdown only | 1 s | multiple (no network) |

### 4.7 Deployment options for the frontend

| Option | Verdict |
|---|---|
| **S3 + CloudFront** | **Recommended.** Pure static build, immutable-hashed assets, SPA fallback via CloudFront custom error response 403/404 → `/index.html`. Requires a CloudFront behaviour `/api/*` → ALB origin so the relative `/api` base URL keeps working with no code change. |
| Containerised nginx (ECS Fargate) | Works and matches today exactly, but pays for compute to serve static bytes and loses edge caching. Only justified if you refuse any routing change. |
| Next.js / SSR | **Not applicable** — there is no server-rendered code. |
| Amplify Hosting | Viable, but adds a second CDN/routing system alongside the ALB. |

---

## 5. BACKEND ANALYSIS

### 5.1 Service: Django REST API (`code2day-backend`)

| Attribute | Finding |
|---|---|
| Technology | Django 5.1.4 + DRF 3.15.2, Python 3.11-slim |
| Entry point | `code2day.wsgi:application`; `manage.py` for CLI |
| Port | 8000 |
| Concurrency model | **Gunicorn sync workers = 12** (prod compose). One request per worker. No threads flag, no gevent, no ASGI |
| Worker recycling | `--max-requests 1000 --max-requests-jitter 100` |
| Request timeout | Gunicorn **120 s**; nginx `proxy_read_timeout` **120 s**; browser `fetch` **60 s** |
| CPU profile | Mostly I/O-wait (blocked on executor + PostgreSQL). CPU spikes from: ReportLab PDF rendering, `execution_adapter` regex/codegen (2,416 lines, per test case), `complexity_analyzer` AST parsing, openpyxl imports |
| Memory profile | Baseline Django + pandas/Pillow/ReportLab imported at module load in `views.py:91-101` → **every worker carries the full scientific stack**. **[INFERRED]** ~250–400 MB RSS per worker; 12 workers ⇒ **3–5 GB just for the API**. **[UNKNOWN — requires measurement]**: `docker stats code2day-backend` under load |
| Stateless? | Effectively yes for scaling; process-local rate-limit state is lost/duplicated |
| External deps | executor (HTTP), PostgreSQL, external MySQL (deploy-time), arbitrary HTTP for institution logo fetch |
| Filesystem deps | `MEDIA_ROOT=/app/media` (Docker volume), `STATIC_ROOT=/app/staticfiles` |
| WebSockets | none |
| Background processing | none at runtime |

### 5.2 Bottlenecks found in code **[VERIFIED]**

**B1 — Synchronous, sequential, per-test-case execution.**
`execute_problem_test_case_batch` (`views.py:483-572`) loops over test cases and, for each,
calls `prepare_execution_payload` then a **blocking** `execute_judge0_submission`. No batching, no
concurrency, no early exit on first failure.

**B2 — Retry storm inside a single request.**
`execute_judge0_submission` defaults to `max_retries=3`, `retry_delay=1.0`, exponential backoff
(`judge0.py:168,291-294`), with a per-attempt socket timeout of `JUDGE0_TIMEOUT_SECONDS = 30`
(`settings.py:224`). Worst case **per test case**: 30 + 1 + 30 + 2 + 30 ≈ **93 s**. Gunicorn kills the worker
at 120 s. With 10 test cases the request cannot possibly complete under partial-failure conditions.

**B3 — Session write on every request.**
`SESSION_SAVE_EVERY_REQUEST = True` (`settings.py:144`) with the default **database** session backend ⇒ one
`UPDATE django_session` per authenticated request, including every 5-second discussion poll.

**B4 — Destructive read on a hot polling path.**
`get_discussion_messages` executes
`DiscussionMessage.objects.filter(created_at__lt=cutoff).delete()` **on every call** (`views.py:384-385`),
and DiscussPage polls that endpoint every 5 s.

**B5 — Whole-cohort ranking computed per dashboard load.**
`DashboardView` annotates **every student in the institution** with three `Count(distinct=True)` aggregates,
then walks the result **in Python** to find the caller's rank, then calls `.count()` on the same queryset
(re-running it) (`views.py:815-833,883`). `calculate_campus_rank_helper` (`views.py:352-373`) does the
equivalent for analytics and PDF endpoints.

**B6 — `ORDER BY RANDOM()` on the problems table.**
`Problem.objects.order_by('?').first()` on the first dashboard load each day (`views.py:911`).

**B7 — Unpaginated list endpoints.**
`ProblemListView` returns **all** problems with full `description`/`editorial`/`examples`
(`views.py:1029-1053`); `AdminUserListView`, `RegisterNumberListView`, JA student lists behave similarly.
DRF has **no default pagination class** configured (`settings.py:202-206`).

**B8 — No connection pooling.** `CONN_MAX_AGE` unset ⇒ TCP connect + auth per request.

**B9 — No database indexes beyond FKs/uniques.** Zero `db_index=True` and zero `Meta.indexes` across all
38 models. Hot filters such as `ExecutionRecord(-created_at)`, `SolvedProblem(solved_at)`,
`DiscussionMessage(created_at)`, `StudentProfile(last_login_on)` are unindexed.

**B10 — CPU-bound work in-request.** PDF generation (`pdf_reports.py`, 1,636 lines) including a **remote HTTP
logo fetch with a 10 s timeout** (`pdf_reports.py:93`), plus `calculate_complexity` AST parsing on every submit.

**B11 — No rate limit on execution.** `check_rate_limit` is applied only to auth/lookup endpoints. `/api/run/`,
`/api/executor/submit/`, and all contest/lab submit endpoints are **unthrottled** (`auth_utils.py:198`).

**B12 — Executor timeout does not kill the container.** On `subprocess.TimeoutExpired` the handler runs
`docker ps -q --filter ancestor=…` and **discards the output without killing anything** (`main.py:171-186`).
The runaway container keeps consuming CPU/RAM until the host reaps it — which nothing does.

**B13 — CPU-time limit is passed as CPU *count*.** `CPU_TIME_LIMIT` defaults to `10` (`main.py:54`) and is
passed straight to `--cpus` (`main.py:144`). Each user container is therefore permitted **10 CPUs**, not a
10-second CPU budget. On a host with fewer cores this over-subscribes; on a large host a single submission can
saturate 10 vCPUs.

---

## 6. DATABASE

### 6.1 Engine and topology **[VERIFIED]**

- **PostgreSQL**, `django.db.backends.postgresql` (`settings.py:100`). Version not pinned anywhere in tracked
  files (the legacy Judge0 script used `postgres:13`). **[UNKNOWN — requires measurement]**: `SELECT version();`
- Runs **on the host VM**, reached from the backend container via `host.docker.internal` — not containerised in
  any tracked compose file.
- **38 models / ~40 tables** + Django's `auth_*`, `django_session`, `django_admin_log`, `django_content_type`,
  plus 3 M2M join tables (`contests.problems`, `contests.aptitude_questions`, `contests.assigned_students`).
- **61 migrations**, evolving from a single-tenant schema to institution-scoped multi-tenancy.

### 6.2 Multi-tenancy — important nuance **[VERIFIED]**

`db_manager.create_institution_db()` issues a real `CREATE DATABASE "code2day_inst_<id>"` and migrates it
(`db_manager.py:37-61`); `delete_institution_db()` issues `pg_terminate_backend` + `DROP DATABASE`
(`db_manager.py:64-92`). **However:**

- There is **no `DATABASE_ROUTERS`** setting and **no `.using(...)`** call anywhere in the codebase.
- Therefore all reads/writes go to the single `default` database, scoped by an `institution` foreign key.
- The per-institution databases are **created, migrated, and then never used** — empty schemas that
  nonetheless consume storage and connection slots.

**AWS impact:** model the platform as **one logical database with row-level tenant scoping**, plus N orphaned
empty databases that should be cleaned up. Do not size for per-tenant RDS instances.

### 6.3 Model groups and largest tables **[VERIFIED]**

| Group | Models | Growth driver |
|---|---|---|
| Identity / org | `Institution`, `Department`, `StudentProfile`, `StaffProfile`, `BatchAdvisor`, `SystemConfiguration`, Django `auth_user` | Fixed by enrolment |
| Content | `Problem`, `TestCase`, `DailyProblem`, `AptitudeTopic`, `AptitudeQuestion`, `Company` | Fixed by curation |
| **Execution history (hot)** | **`ExecutionRecord`**, `ProblemSolution`, `Submission`, `SolvedProblem`, `SolvedAptitude`, `ProblemSession`, `StudentActivity` | **Every run and submit** |
| Contests | `Contest`, `ContestSubmission`, `AptitudeContestSubmission`, `ContestParticipation` | Contest events |
| Labs | `LabTopic`, `LabProblem`, `LabTestCase`, `LabSubmission`, `LabAssignment`, `LabAssignmentSubmission`, `Lab`, `LabExercise`, `LabExerciseTestCase`, `LabExerciseSubmission` | Lab sessions |
| Engagement | `DiscussionMessage`, `Announcement`, `Notification`, `Achievement`, `UserAchievement` | Chat + notifications |

**The three big tables, and why:**

1. **`ExecutionRecord`** — written on **every** `/api/run/` call, `Run` *and* `Submit`
   (`views.py:1313-1327`). It stores `source_code`, `stdin`, `stdout`, `stderr`, `compile_output` as
   unbounded `TextField`s. `source_code` is capped at 20,000 chars by the serializer
   (`serializers.py:146`) — so a single row can approach **~25 KB**, and there is **no retention policy**.
2. **`ProblemSolution`** — one row per *submit*, also storing full `source_code` (`models.py:521`).
3. **`ContestSubmission`** — one row per contest submit, storing full `code` (`models.py:1079+`).

`DiscussionMessage` is self-limiting: rows older than 24 h are deleted on read (`views.py:384`).

### 6.4 Indexes, transactions, pooling **[VERIFIED]**

- **Indexes:** zero explicit indexes. Only Django's automatic FK indexes and these uniques/constraints:
  `Institution.institution_id`, `Department.code`, `StudentProfile.register_number`,
  `StudentProfile.source_personal_details_id`, `StaffProfile.faculty_id`, `Problem.slug`,
  `DailyProblem.date`, `unique_student_problem_solved`, `unique_contest_student_participation`,
  `SolvedAptitude(student,question)`, `AptitudeContestSubmission(contest,student,question)`,
  `LabExerciseSubmission(exercise,student)`, `UserAchievement(user,achievement)`.
- **Transactions:** `ATOMIC_REQUESTS` is **not** set. Explicit `transaction.atomic()` is used in bulk imports
  and a few writes only. Multi-row updates in submit paths are **not** atomic.
- **Pooling:** none (§B8). No PgBouncer, no RDS Proxy, no `django-db-connection-pool`.
- **Sessions:** stored in `django_session` (default DB backend), 30-day TTL, rewritten every request.

### 6.5 Per-user data volume

```text
Known from code:
  • ExecutionRecord: 1 row per Run AND per Submit, containing source_code (≤20 KB) +
    stdin (≤10 KB) + stdout/stderr/compile_output. Realistic row ≈ 2–25 KB.   [VERIFIED]
  • ProblemSolution: 1 row per Submit, containing full source_code (≤20 KB).  [VERIFIED]
  • SolvedProblem / SolvedAptitude: 1 row per unique problem/question solved
    (unique-constrained → bounded by catalogue size).                          [VERIFIED]
  • StudentActivity: at most 1 row per (student, day, activity_type),
    activity_type ∈ {solve, practice, login}.                                  [VERIFIED]
  • ProblemSession: 1 row per problem-open event.                              [VERIFIED]
  • ContestSubmission: 1 row per contest submit, full code stored.             [VERIFIED]
  • StudentProfile: exactly 1 row per student, ~1 KB.                          [VERIFIED]
  • No TTL, archival, or partitioning on ANY of the above.                     [VERIFIED]

Unknown:
  • Runs per student per session, submits per student per day
  • Average source_code length actually submitted
  • Average number of test cases per problem (drives execution count, not rows)
  • Catalogue size actually loaded (Problem / AptitudeQuestion row counts)
  • Current on-disk database size

How to measure (run against the live DB — all read-only):
  SELECT pg_size_pretty(pg_database_size(current_database()));
  SELECT relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid))
    FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 20;
  SELECT count(*) FROM execution_records;               -- rows
  SELECT avg(length(source_code)), max(length(source_code)) FROM execution_records;
  SELECT count(*)::float / NULLIF(count(DISTINCT student_id),0) FROM execution_records;  -- rows/student
  SELECT date_trunc('day',created_at) d, count(*) FROM execution_records
    GROUP BY 1 ORDER BY 1 DESC LIMIT 30;                -- daily execution rate
  SELECT count(*) FROM "Problem"; SELECT avg(c) FROM
    (SELECT count(*) c FROM learning_testcase GROUP BY problem_id) t;  -- test cases per problem
  -- The repo also ships a live counter endpoint: GET /api/_diag/db/<token>/  (views.py:11013)
  --   ⚠ delete that endpoint before production; see §20.
```

### 6.6 Read/write pattern and replica suitability **[INFERRED from code]**

- **Read-dominant** overall: dashboards, problem lists, contest lists, notification polls.
- **Write hot spots:** `django_session` (every request), `ExecutionRecord` (every run), `StudentActivity`
  `get_or_create` (every submit), `DiscussionMessage` DELETE (every discussion poll).
- **Would read replicas help?** Only after code changes — Django needs a `DATABASE_ROUTERS` entry to route
  reads, and the session backend must move off the DB first (otherwise every request writes to the primary
  anyway). **Recommendation: fix sessions → ElastiCache, add indexes, add caching *before* buying replicas.**

---

## 7. FILE STORAGE

### 7.1 What is stored where **[VERIFIED]**

| Artifact | Location | Persistence | Notes |
|---|---|---|---|
| Institution logo (`Institution.logo_file`, `ImageField(upload_to='college_logos/')`) | `MEDIA_ROOT = /app/media` | Docker named volume `code2day-backend-media` | `models.py:34`, `settings.py:217` |
| Institution files (`institutions/<id>/files/`) | same volume, via `default_storage` | volume | `file_views.py:37,77` |
| Institution branding assets (`institutions/<id>/branding/`) | same volume | volume | `file_views.py:223,250` |
| Collected static (`/app/staticfiles`) | container filesystem | **ephemeral** — rebuilt each image build | `settings.py:213` |
| Generated PDFs | **not stored** — streamed to the client from `BytesIO` | none | `views.py:5` |
| Uploaded `.xlsx` rosters | **not stored** — parsed from the in-memory upload | none | `views.py:8696` |
| User source code | **PostgreSQL TEXT columns**, not files | DB | `models.py:336,521` |
| Executor scratch (source + stdin) | `tempfile.TemporaryDirectory()` inside the executor container, bind-mounted into the sandbox as `/code:rw` | **deleted per execution** | `main.py:124,147` |
| Logs | Docker `json-file`, `max-size: 100M` per container, **no `max-file`** | host disk | `docker-compose.yml:20-23` |
| Seed datasets | `dataset/` in the git image (1.1 MB) | image | — |

### 7.2 Critical storage findings

- **Uploaded media is unreachable in production.** `MEDIA_URL` is only routed by
  `static(settings.MEDIA_URL, …)` **inside an `if settings.DEBUG:` block** (`code2day/urls.py:12-13`), and
  neither nginx config has a `/media/` location. With `DJANGO_DEBUG=false`, **every uploaded logo and file
  returns 404**. **[VERIFIED]**
- **Collected static is also unserved.** `whitenoise` is installed but **absent from `MIDDLEWARE`**
  (`settings.py:61-71`), and with `DEBUG=false` Django's staticfiles app does not serve. nginx proxies
  `/static/` to Django, which will 404 — so Django Admin renders unstyled. **[VERIFIED]**
- **Files must survive container restart** — they do today only because of the named volume; the volume is
  **host-local**, so the backend cannot be scaled beyond one host without shared storage or S3. **[VERIFIED]**
- **Files are not shared between services** — only the backend reads/writes them. **[VERIFIED]**
- **No POSIX semantics are required.** All access is via Django's `default_storage` API
  (`save/open/exists/listdir/delete/size/url`). `listdir` is the only operation needing care, and
  `django-storages` S3 backend supports it. **Object storage is a clean fit — EFS is not needed for media.**
  **[VERIFIED]**
- **File identity is positional and fragile.** `InstitutionFileDetailAPIView` uses
  `filenames[file_id - 1]` from a `listdir` — IDs shift when any file is added or removed
  (`file_views.py:119-121`). There is no `File` model. **[VERIFIED]**
- **Max file size:** 20 MB at nginx; no application-level cap; no MIME validation on the generic file
  upload path. **[VERIFIED]**

### 7.3 Storage per user

```text
Known from code:
  • Students upload NOTHING. There is no per-student file storage anywhere in the codebase.  [VERIFIED]
  • All user-generated content (code) lives in PostgreSQL, not object storage.               [VERIFIED]
  • File storage scales with INSTITUTIONS and ADMIN UPLOADS, not with user count.            [VERIFIED]

Inferred:
  • Media footprint for a single institution ≈ a handful of logos/documents → single-digit MB.
  • Dominant "storage" cost is therefore the DATABASE and the LOGS, not S3.

Unknown:
  • Current size of the media volume; number/size of institution files uploaded to date.

How to measure:
  docker system df -v | grep code2day-backend-media
  docker run --rm -v code2day-backend-media:/m alpine du -sh /m
  du -sh /var/lib/docker/containers/*/*-json.log     # actual log volume on the host
```

---

## 8. CODE EXECUTION / CODE RUNNER  ⚠ MOST IMPORTANT SECTION

### 8.1 Which executor is actually deployed — an unresolved conflict **[VERIFIED conflict]**

The repository contains **three generations** of execution backend, and the tracked files disagree:

| Generation | Evidence | Status |
|---|---|---|
| **(1) Judge0-CE** (official, `privileged: true`) | `Dockerfile.custom` (`FROM judge0/judge0:latest`), `judge0_install.sh`, `deploy-judge0.sh`, `build-custom-judge0.sh`, `rebuild-judge0.sh` | Superseded; files still tracked despite being in `.gitignore` |
| **(2) Piston** | CI/CD deploy step installs Piston packages via `POST /api/v2/packages` and probes `/api/v2/runtimes` (`.github/workflows/deploy.yml:99-150`); commits `f154d3c` "replace custom executor with Piston", `0ca33a7` "run Piston on same port 2358" | Referenced by the **current** deploy pipeline |
| **(3) Custom FastAPI DooD executor** | `code-executor/main.py`, Judge0-API-compatible (`POST /submissions`), 5 language images; commit `2cc321c` | The service name `code2day-executor:2358` matches `settings.py:223` |

**The application code at HEAD speaks Judge0's protocol**, not Piston's:
`judge0.py:159` → `POST {base}/submissions?wait=true&base64_encoded=true`. Piston has no such endpoint.
HEAD commit `26fbc88` explicitly rewrote `executor.py` to delegate to `judge0.py`.

Meanwhile `ExecutorSystemInfoView` (`views.py:4185`) still calls the **Piston** path `/api/v2/runtimes`,
and the CI still runs Piston package installation.

> **[INFERRED]** The live `code2day-executor` container is the custom FastAPI service in `code-executor/`
> (it is the only tracked implementation that answers `POST /submissions`), and the Piston steps in CI are
> now no-ops that log warnings.
>
> **[UNKNOWN — requires measurement]** Confirm on the server:
> ```bash
> docker ps --format '{{.Names}}\t{{.Image}}' | grep executor
> curl -s http://localhost:2358/system_info      # custom executor answers with {"version":"code2day-executor-1.0"}
> curl -s http://localhost:2358/api/v2/runtimes  # Piston answers with a runtime list
> cat /home/administrator/Desktop/doc_judge/judge0/docker-compose.yml   # the real, untracked compose file
> ```
> **This must be resolved before any AWS design work.** The isolation properties of the three options are
> materially different.

The rest of §8 analyses **generation (3)**, the tracked implementation.

### 8.2 Execution mechanism **[VERIFIED — `code-executor/main.py`]**

```text
Django  ──HTTP──►  FastAPI /submissions (uvicorn, 4 workers)
                        │  asyncio.run_in_executor → ThreadPoolExecutor(max_workers=40)
                        ▼
                   run_in_docker():
                     tempfile.TemporaryDirectory()
                       write solution.<ext> (0644) and _stdin.txt (0644); chmod dir 0755
                     subprocess.run([
                       "docker","run","--rm",
                       "--network","none",
                       "--memory","256m", "--memory-swap","256m",
                       "--cpus", str(cpu_limit),          # ⚠ see §8.6 — this is 10, not a time limit
                       "--pids-limit","64",
                       "--security-opt","no-new-privileges",
                       "-v", f"{tmpdir}:/code:rw",
                       "-i", <language image>, <language command>
                     ], input=stdin_bytes, capture_output=True, timeout=wall_limit)
```

Key mechanics:

- **Docker-out-of-Docker.** The executor container invokes the **host** Docker CLI
  (`code-executor/Dockerfile:5-14` installs `docker-ce-cli`). This requires
  `/var/run/docker.sock` to be bind-mounted. **That mount is not in any tracked compose file** — it lives
  in the untracked server compose. **[INFERRED, high confidence]**
- **One throwaway container per test case.** No warm pool, no reuse.
- **Synchronous end-to-end.** `wait=true`; `GET /submissions/{token}` is a stub that always reports
  "Accepted" (`main.py:302-305`) — there is no job store or async result path.
- **CORS `allow_origins=["*"]`** on the executor (`main.py:26-31`).

### 8.3 Supported languages **[VERIFIED]**

| ID | Language | Image | Base | Command |
|---|---|---|---|---|
| 71 | Python 3.11 | `code2day-python:latest` | `python:3.11-slim` + gcc/g++ | `python3 /code/solution.py` |
| 63 | JavaScript (Node 20) | `code2day-node:latest` | `node:20-alpine` | `node /code/solution.js` |
| 62 | Java 17 | `code2day-java:latest` | `eclipse-temurin:17-jdk-alpine` | `javac -cp ".:$CP" Solution.java && java -cp ".:$CP" Solution` |
| 50 | C (GCC 12) | `code2day-c:latest` | `gcc:12-bookworm` | `gcc /code/solution.c -o /code/solution -lm && /code/solution` |
| 54 | C++17 (GCC 12) | `code2day-cpp:latest` (tag of the C image) | `gcc:12-bookworm` | `g++ … -std=c++17 && /code/solution` |

**Frontend offers `C, C++, Java, Python, SQL`** (`codeExecution.js:4-10`) — **`SQL` maps to language ID 82,
which the executor does not implement** → `status_id 14, "Exec Format Error"` (`main.py:103-109`). There is a
`SqlResultTable.jsx` component and a `Problem.tags` "SQL" counter, so SQL is a **planned-but-unimplemented**
capability. **[VERIFIED]**

`judge0.py:346-370` maps 22 language names to Judge0 IDs (Go, Rust, TypeScript, Ruby, PHP, Swift, Kotlin,
Scala, R, Perl, Lua, Bash, Haskell, C#), and `execution_adapter.py` ships **driver generators for 16
languages** — but only the 5 above can actually execute. Sizing must use **5**. **[VERIFIED]**

Pre-installed libraries inside the sandbox images make them large and slow to pull:
Python (numpy, scipy, pandas, sympy, networkx, sortedcontainers, more-itertools, bitarray, regex, pygtrie,
intervaltree, python-Levenshtein, tqdm…), C/C++ (**full Boost**, GMP, BLAS/LAPACK, Eigen, LEMON, **CGAL**, TBB,
cmake), Java (commons-lang3/math3/collections4, Guava, Eclipse Collections, JGraphT), Node (lodash, mathjs,
graphlib, heap, denque, …). **[INFERRED]** the C/C++ image is likely **2–4 GB** and Python **1–2 GB**.
**[UNKNOWN — requires measurement]**: `docker images | grep code2day-`.

### 8.4 Resource limits **[VERIFIED — `code-executor/main.py:54-56, 139-150`]**

| Control | Configured | Enforced how | Assessment |
|---|---|---|---|
| Memory | `MEMORY_LIMIT_MB=256`, `--memory 256m --memory-swap 256m` | cgroup | **Effective** — OOM-kill, no swap escape |
| PIDs | `--pids-limit 64` | cgroup | **Effective** — mitigates fork bombs |
| Network | `--network none` | netns | **Effective** — no egress, no metadata service, no scanning |
| Privilege escalation | `--security-opt no-new-privileges` | kernel | Blocks setuid escalation |
| Wall clock | `WALL_TIME_LIMIT=15` → `subprocess.run(timeout=…)` | host-side | **Leaks** — see below |
| CPU | `--cpus <cpu_limit>` where `cpu_limit = CPU_TIME_LIMIT = 10` | cgroup quota | **Misconfigured** — grants **10 CPUs**, not a CPU-time budget |
| Filesystem | `-v tmpdir:/code:rw` | bind mount | Writable; no `--read-only`, no `--tmpfs`, no size quota on `/code` |
| User | not set | — | Container runs as **root inside the sandbox** (all base images default to root; the Python image creates a `nobody` user but `--user` is never passed) |
| Output size | not capped | — | `capture_output=True` buffers **unbounded** stdout/stderr into executor RAM |
| Package installation | not possible at runtime (`--network none`) | — | Good |
| Concurrency | `MAX_WORKERS=40` per uvicorn worker × 4 workers | ThreadPoolExecutor | Up to **160 simultaneous `docker run`** |

**Timeout leak (B12).** On `TimeoutExpired` the code runs `docker ps -q --filter ancestor=<image>` and throws
the result away (`main.py:171-186`). Because `docker run` was launched as a child process, killing the CLI does
not stop the container. **A timed-out submission leaves a live container consuming up to 10 CPUs and 256 MB
indefinitely.** At scale this is a self-inflicted denial of service.

### 8.5 Pre-execution validation **[VERIFIED — `services/code_validator.py`]**

A regex denylist runs before execution: blocks `open(`, `exec(`/`eval(`, `__import__`, `os.*`, `subprocess.*`,
`socket.*`, `requests.*`/`urllib.*` for Python; `new File`, `Runtime.getRuntime().exec`, `System.exit`,
sockets, `URL(` for Java; `fopen`/`system`/`exec*`/`socket` for C/C++; `fs`/`child_process` for JS.
Also caps code size (300–1000 KB by language) and compiles Python to check syntax.

**Assessment:** this is a **usability filter, not a security boundary.** It is a regex denylist on source text
and is trivially bypassed by ordinary language features. It also produces **false positives** that break
legitimate solutions (any Python solution containing `open(`, any C solution with a local variable named
`connect`). It should be retained as UX guidance and **never** relied upon for isolation.
Infinite-loop patterns are detected but explicitly **not blocked** (`code_validator.py:129`).

### 8.6 Hostile-code posture — class-by-class **[VERIFIED analysis]**

| Attack class | Current posture |
|---|---|
| Fork bomb | **Mitigated** — `--pids-limit 64` |
| Infinite loop | **Partially mitigated** — 15 s wall timeout fires, **but the container is never killed** (B12) → the loop continues forever |
| Memory exhaustion | **Mitigated** in the sandbox (256 MB, no swap). **Not mitigated in the executor**: unbounded `capture_output` buffering means a program that floods stdout can exhaust the *executor's* memory |
| CPU exhaustion | **Not mitigated** — `--cpus 10` per container × up to 160 concurrent = a request for **1,600 vCPUs** on one host |
| Filesystem traversal | **Mitigated** — only `/code` is bind-mounted; the rest is the image's own layer |
| Privilege escalation | **Partially** — `no-new-privileges` is set, but the process runs as **root** in the container with the default capability set (no `--cap-drop=ALL`) |
| Container escape | **Not mitigated at the executor layer.** Default `runc`, no seccomp/AppArmor profile beyond Docker's default, no user-namespace remap, no gVisor/Kata. A kernel or runc CVE is a full host compromise |
| Network scanning | **Mitigated** — `--network none` |
| Metadata service (IMDS) access | **Mitigated from inside the sandbox** by `--network none`. **Not mitigated for the executor container itself**, which has normal network access |
| Malicious package install | **Mitigated** — no network in the sandbox |
| Crypto mining | **Not mitigated** — a 15 s window at 10 CPUs, repeatable without any rate limit (B11) |
| Reverse shell | **Mitigated from the sandbox** (`--network none`) |
| DoS of the platform | **Not mitigated** — `/api/executor/submit/` is **unauthenticated** (§20-S2) and unthrottled; each call spawns a container |

**Structural verdict.** The container flags chosen are sensible, and `--network none` plus `--pids-limit`
plus the memory cap remove the noisiest attack classes. But three properties make the current design
**unsafe for hostile, internet-reachable users**:

1. **Docker-out-of-Docker** — the executor holds a handle to the host Docker daemon. Any RCE in the executor
   process (a FastAPI/uvicorn/pydantic bug, or the unauthenticated Django proxy in front of it) becomes
   **root on the host**, and there is no VM boundary between tenants.
2. **Shared kernel with no second layer** — one `runc`/kernel escape crosses from a student's submission to
   every other tenant's data and to the Docker socket.
3. **No admission control** — unauthenticated, unthrottled, 10-CPU containers that are never reaped.

For a **trusted campus cohort behind SSO**, the current model is defensible once the auth holes are closed.
For **untrusted internet users**, it is not. §17 designs the replacement.

### 8.7 Execution cost per submission **[VERIFIED mechanics, INFERRED timings]**

```text
One "Submit" =
  for each test case:                                   # sequential, no concurrency
     prepare_execution_payload()                        # regex + codegen, backend CPU
     POST /submissions?wait=true                        # blocking, 30 s timeout, up to 3 attempts
        → docker run <image>                            # cold container start
        → compile (C/C++/Java only)                     # gcc/g++/javac inside the container
        → execute user program                          # ≤15 s wall
        → container teardown
     normalize + compare output                         # backend CPU

Known:  the loop is sequential and unbounded by test-case count.        [VERIFIED views.py:496]
        wall timeout 15 s, HTTP timeout 30 s, 3 retries.                [VERIFIED]

Inferred (typical Docker cold-start + toolchain figures — MUST be replaced by measurement):
        Python  ≈ 0.4–1.5 s   |  Node ≈ 0.4–1.5 s
        C/C++   ≈ 1.5–5 s     (gcc/g++ start-up dominates; Boost/CGAL image is large)
        Java    ≈ 3–8 s       (javac + JVM start, classpath scan over /usr/local/lib/java)

Unknown — requires measurement:
        • Real p50/p95/p99 per-language execution latency
        • Average test-case count per problem
        • Image pull/warm state on the host

How to measure:
        for L in 71 63 62 50 54; do
          time curl -s -X POST localhost:2358/submissions?wait=true \
            -H 'Content-Type: application/json' \
            -d "{\"language_id\":$L,\"source_code\":\"<hello world>\",\"stdin\":\"\"}" >/dev/null
        done
        # and, from the app side, time a real submit:
        #   POST /api/run/ with is_submit=true on a known problem, measure end-to-end
```

---

## 9. DOCKER ANALYSIS

### 9.1 Tracked compose files are incomplete **[VERIFIED]**

There is **no single compose file that describes the running system.**

- `./docker-compose.yml` — **frontend only**; declares external networks `code2day-shared` and
  `dokploy-network` (a Dokploy PaaS artifact).
- `./backend/docker-compose.yml` — **backend only**; declares external network `code2day-shared`.
- The CD job runs `docker compose build backend frontend` and
  `docker compose up -d --no-deps backend frontend code2day-executor` from
  **`/home/administrator/Desktop/doc_judge/judge0`** (`.github/workflows/deploy.yml:72,89,94`) — a directory
  **outside this repository**. That file defines `code2day-executor` (and historically Judge0's `db`/`redis`),
  and it is the file that contains the **Docker socket mount**.

> **[UNKNOWN — requires measurement]** Retrieve the authoritative file:
> `cat /home/administrator/Desktop/doc_judge/judge0/docker-compose.yml` and
> `docker inspect code2day-executor --format '{{json .HostConfig.Binds}}{{json .HostConfig.Privileged}}'`.

### 9.2 Container inventory **[VERIFIED from tracked files]**

**Container: `code2day-frontend`**
```text
Purpose        Serve the built React SPA
Base image     node:20-alpine (build stage) → nginx:alpine (runtime)
Build          npm ci && npm run build → /usr/share/nginx/html
CPU            Negligible (static file serving)
Memory         [INFERRED] ~20–50 MB
Ports          80 → host 8001
Volumes        none
Env            DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, VITE_API_TARGET
               ⚠ DB credentials injected into a static web server — remove
Depends on     nothing at runtime
Restart        unless-stopped   |   Logging json-file max-size 100M
```

**Container: `code2day-backend`**
```text
Purpose        Django REST API + Django Admin
Base image     python:3.11-slim
Build          pip install -r requirements.txt; collectstatic (|| true)
Command        migrate --noinput && gunicorn --workers 12 --timeout 120
                                    --max-requests 1000 --max-requests-jitter 100
CPU            [INFERRED] 2–4 vCPU for 12 sync workers under load
Memory         [INFERRED] 3–5 GB (12 × ~300 MB with pandas/Pillow/ReportLab loaded)
Ports          8000 → host 8000
Volumes        code2day-backend-media:/app/media          (uploads — must persist)
Extra hosts    host.docker.internal:host-gateway          (to reach host PostgreSQL)
Env            DJANGO_SECRET_KEY, DJANGO_DEBUG=false, DJANGO_ALLOWED_HOSTS,
               DB_*, JUDGE0_BASE_URL, JUDGE0_TIMEOUT_SECONDS,
               CORS_ALLOWED_ORIGINS, CSRF_TRUSTED_ORIGINS,
               SESSION_COOKIE_SECURE, CSRF_COOKIE_SECURE  (last two are NOT read by settings.py)
Depends on     PostgreSQL (host), code2day-executor
Restart        unless-stopped   |   Logging json-file max-size 100M
```

**Container: `code2day-executor`** (definition inferred; Dockerfile verified)
```text
Purpose        Judge0-compatible execution API; orchestrates sandbox containers
Base image     python:3.11-slim + docker-ce-cli
Command        uvicorn main:app --host 0.0.0.0 --port 2358 --workers 4
CPU            High and bursty — it is the parent of every sandbox container
Memory         Base small, but capture_output buffers are unbounded
Ports          2358
Volumes        /var/run/docker.sock  [INFERRED — REQUIRED for `docker run` to work]
Env            MAX_WORKERS=40, CPU_TIME_LIMIT=10, WALL_TIME_LIMIT=15, MEMORY_LIMIT_MB=256
Depends on     host Docker daemon; images code2day-{python,node,java,c,cpp}:latest
```

**Sandbox images** (built by `code-executor/rebuild-images.sh`, `--no-cache`, verified by `verify-images.sh`)
```text
code2day-python:latest   python:3.11-slim + gcc/g++ + 14 scientific/DS packages
code2day-node:latest     node:20-alpine + 14 global npm packages
code2day-java:latest     eclipse-temurin:17-jdk-alpine + maven + 7 jars in /usr/local/lib/java
code2day-c:latest        gcc:12-bookworm + Boost/GMP/BLAS/LAPACK/Eigen/LEMON/CGAL/TBB/cmake
code2day-cpp:latest      docker tag of code2day-c:latest
Lifecycle:  created per test case with `docker run --rm`; lifetime ≤15 s (except leaked timeouts)
```

**Legacy (do not deploy):** `Dockerfile.custom` (`FROM judge0/judge0:latest`, installs numpy/scipy/pandas/
sklearn + npm packages) and the `judge0_install.sh` compose, which sets `privileged: true` on both the
Judge0 server and workers and `ENABLE_NETWORK=true` / `ALLOW_ENABLE_NETWORK=true` — i.e. **privileged
containers running untrusted code with internet access**. **[VERIFIED — `judge0_install.sh:138,150,212,220`]**

### 9.3 Container → AWS placement recommendation

| Container | AWS target | Why |
|---|---|---|
| `code2day-frontend` | **S3 + CloudFront** (drop the container) | Static assets; edge caching; no compute cost |
| `code2day-backend` | **ECS Fargate service behind an ALB** | Stateless once media→S3 and sessions→ElastiCache; easy horizontal scaling; no host to patch |
| `code2day-executor` (control plane) | **ECS Fargate service** (or Lambda) that *dispatches* jobs — it must stop being a Docker client | Removes the Docker socket entirely |
| Sandbox execution | **Dedicated isolated compute** — see §17 | The whole point of the redesign |
| PostgreSQL | **RDS for PostgreSQL** (Multi-AZ) | Managed backups, failover, parameter tuning |
| Media volume | **S3** via `django-storages` | Removes host affinity |
| Sessions / rate limits / cache | **ElastiCache for Redis (Valkey)** | Removes the per-request `django_session` write |
| Async work (execution, PDF, imports) | **SQS + a worker ECS service** | Does not exist today; must be built |

---

## 10. CONCURRENCY MODEL

### 10.1 Definitions (these are not interchangeable)

| Term | Meaning here |
|---|---|
| **Registered users** | Rows in `StudentProfile` + `StaffProfile` — the roster. Set by the college's enrolment, synced from external MySQL |
| **Daily active users (DAU)** | Distinct users who log in on a given day. `StudentProfile.last_login_on` and `StudentActivity(activity_type='login')` make this directly measurable |
| **Concurrent users** | Users with an in-flight or recent request. Drives ALB connections and Gunicorn worker demand |
| **Active coding sessions** | Users with the Monaco editor open. **Costs nothing server-side** — editor state is client-side in `localStorage` (§11) |
| **Concurrent code executions** | Sandbox containers running at one instant. **This is the real cost driver** |
| **Peak concurrent executions** | The contest-start spike. Sizing must be done against this, not the average |

### 10.2 Capacity assumptions derived from code

```text
════════════════════ KNOWN (verified in the repository) ════════════════════
Gunicorn workers                12 sync workers, timeout 120 s
                                → HARD CEILING of 12 simultaneous in-flight HTTP requests
                                  backend/docker-compose.yml:15
Gunicorn image default          4 workers (if the compose command is ever bypassed)
                                  backend/Dockerfile.backend:17
Executor thread pool            MAX_WORKERS = 40 per uvicorn worker
                                  code-executor/main.py:37
Executor processes              uvicorn --workers 4
                                → up to 160 concurrent `docker run`
                                  code-executor/Dockerfile:23
Sandbox memory                  256 MB each  → 160 × 256 MB = 40 GB RAM at full fan-out
Sandbox CPU grant               --cpus 10 each → 160 × 10 = 1,600 vCPU requested (§8.6)
Sandbox wall limit              15 s (leaked on timeout — container not killed)
Backend→executor HTTP timeout   30 s, max_retries=3, exponential backoff (worst case ~93 s/test case)
                                  services/judge0.py:161,168,291
Browser fetch timeout           60 s      frontend/src/lib/api.js:4
nginx proxy_read_timeout        120 s     code2day_nginx_block.txt:16
DB connections                  CONN_MAX_AGE unset → 1 new connection per request;
                                concurrent connections bounded by 12 workers
Auth rate limit                 5 attempts / 60 s / IP      settings.py:234
Lookup rate limit               20 attempts / 60 s / IP     settings.py:238
Execution rate limit            NONE                        auth_utils.py:198 (never called from run/submit)
Rate-limiter scope              in-process dict, per worker → effective limit is 12 × configured value,
                                and resets on every deploy   auth_utils.py:128-195
Queue                           NONE — no admission control between HTTP and container spawn
Test-case execution             sequential, one container per test case   views.py:496
Client polling load per user    Discuss open: 12 req/min + 6 req/min; everyone: 1 req/min (TopBar)
Session writes                  1 UPDATE django_session per authenticated request

════════════════════ ESTIMATED (derived from the above) ════════════════════
Sustained submit throughput     12 workers ÷ (T_submit seconds)
                                e.g. Python, 5 test cases × 1 s ⇒ ~5 s ⇒ ≈ 2.4 submits/s ≈ 144/min
                                e.g. Java,   10 test cases × 5 s ⇒ ~50 s ⇒ ≈ 0.24 submits/s ≈ 14/min
                                ⚠ and while submitting, those workers serve NO other traffic
Polling-only capacity           If 300 users have Discuss open: 300 × 18 req/min = 90 req/s of polling
                                alone. At ~20 ms/request that is ~1.8 workers of pure poll load —
                                tolerable; but every one of those requests also writes django_session
Realistic concurrent users      [INFERRED] the current single-host stack comfortably serves
   on today's stack             ~150–300 concurrent browsing users, and collapses at
                                ~15–25 simultaneous SUBMITS (workers exhausted → 502/504)
Contest start spike             A 60-student contest where everyone submits within 2 minutes generates
                                60 × N_testcases container starts against a 12-worker front door.
                                This is the failure mode to design for.

════════════════════ UNKNOWN — requires measurement ════════════════════
• Registered / DAU / peak-concurrent counts
• Submits per active student per day; run:submit ratio
• Average test-case count per problem
• Real per-language execution latency
• Host vCPU/RAM of the current production machine

How to measure:
  SELECT count(*) FROM student_profiles;                          -- registered
  SELECT count(*) FROM student_profiles WHERE last_login_on = CURRENT_DATE;   -- DAU
  SELECT activity_date, count(*) FROM learning_studentactivity
    WHERE activity_type='login' GROUP BY 1 ORDER BY 1 DESC LIMIT 30;
  SELECT date_trunc('hour',created_at) h, count(*) FROM execution_records
    GROUP BY 1 ORDER BY 2 DESC LIMIT 20;                          -- peak execution hour
  awk '{print $4}' /var/log/nginx/code2day.access.log | uniq -c   -- req/s profile
  nproc && free -g && docker stats --no-stream                    -- host capacity
```

---

## 11. USER SESSION / WORKSPACE MODEL

**This is the single best piece of news in the cost model.**

### 11.1 There are no per-user workspaces **[VERIFIED]**

| Question | Answer |
|---|---|
| Does each user get a persistent workspace? | **No** |
| A container? | **No** — containers exist only for the duration of one test case (`--rm`, ≤15 s) |
| A VM? | **No** |
| A long-lived process? | **No** |
| A database-backed project? | **Partially** — `ProblemSolution` / `ContestSubmission` / `LabExerciseSubmission` store submitted code as TEXT rows |
| A shared environment? | **Yes** — all users share one stateless API and one stateless executor |

### 11.2 Where in-progress work actually lives **[VERIFIED]**

- **The browser.** `code2day-code`, `code2day-language`, `code2day-problem-slug` in `localStorage`
  (`App.jsx:627-643`). Clearing site data loses in-progress code. There is no server-side draft autosave.
- Server-side persistence happens only **at submit time**.

### 11.3 Session lifecycle **[VERIFIED]**

| Event | Behaviour |
|---|---|
| Workspace created | Never — no provisioning step exists |
| Started | A container starts **per test case**, on demand |
| Stopped | Immediately after the process exits (`--rm`); **except on timeout, where it leaks (B12)** |
| Idle cost | **Zero.** An idle student costs one 60-second notification poll and a `django_session` row |
| Files persisted | None — `TemporaryDirectory` is destroyed |
| Reconnect | Not applicable; each execution is independent and stateless |
| Deletion | Not applicable |

### 11.4 The two *tracked* session concepts (database rows, not compute) **[VERIFIED]**

- **`ProblemSession`** (`models.py:685`) — created by `POST /api/problems/<slug>/session/start/`, ended on
  submit (`views.py:1342-1348`). Purely a timing record for analytics.
- **`ContestParticipation`** (`models.py:1149`) — per-student contest session with
  `session_end_time = started_at + session_duration_minutes`, `is_active`, `auto_submitted`,
  `manually_stopped`. Expiry is evaluated **lazily, on the next request** (`is_session_expired`,
  `views.py:6046`) — there is no scheduler closing expired sessions, so a student who closes the tab leaves
  an `is_active=True` row until someone touches it. A management command
  (`cleanup_expired_participations`) exists but nothing schedules it.

### 11.5 Cost-model consequence

> **Do not price idle workspaces.** Unlike a Codespaces/Replit-style product, this platform has **no
> per-user standing compute**. AWS cost is driven by: (a) a small always-on API tier, (b) the database,
> and (c) **bursty, short-lived execution compute proportional to submissions — not to logged-in users**.
> `Idle workspace percentage` in a generic cost template should be entered as **0% / not applicable**.

---

## 12. NETWORKING

### 12.1 Logical graph **[VERIFIED]**

```text
                              Internet
                                 │  TCP 443 (TCP 80 → 301 redirect)
                                 ▼
                    Host nginx (systemd) — TLS termination
                    Let's Encrypt certs at /etc/letsencrypt/live/code2day.ramcoad.com/
                    HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options
                    client_max_body_size 20M, proxy_read_timeout 120s
                                 │
              ┌──────────────────┼─────────────────────────────┐
              ▼ /                ▼ /api/  /admin/  /static/     
      127.0.0.1:8001        127.0.0.1:8000
      frontend nginx        Django gunicorn
                                 │
                                 │ docker network "code2day-shared" (bridge, external)
                    ┌────────────┴─────────────┐
                    ▼                          ▼
        http://code2day-executor:2358    host.docker.internal:5432
        (service-name DNS, no TLS,       (PostgreSQL on the host,
         no auth, no mTLS)                via host-gateway)
                    │
                    ▼  unix:///var/run/docker.sock  [INFERRED]
             Host Docker daemon
                    │
                    ▼  `docker run --network none`
             Sandbox containers  ──✗── no network at all
```

### 12.2 Endpoint classification **[VERIFIED]**

| Endpoint | Exposure | Auth |
|---|---|---|
| `https://code2day.ramcoad.com/` | **Public** | none (static SPA) |
| `https://code2day.ramcoad.com/api/*` | **Public** | session cookie — **except 38 views that are AllowAny**, see §20 |
| `https://code2day.ramcoad.com/admin/` | **Public** | Django admin login |
| `127.0.0.1:8000` | Host-local (published port) | — |
| `127.0.0.1:8001` | Host-local (published port) | — |
| `code2day-executor:2358` | **Docker-network internal** | **NONE** — any container on `code2day-shared` can execute arbitrary code |
| `localhost:2358` | Host-local (published in the untracked compose — CI curls it) | **NONE** |
| PostgreSQL `:5432` | Host interface, reachable from containers via host-gateway | password |
| External MySQL `:3306` | Remote college network | password |

`DJANGO_ALLOWED_HOSTS` includes `172.16.9.197` and `210.212.255.194` (`backend/docker-compose.yml:19`) —
a private campus IP and a public IP, implying **direct-IP access paths exist alongside the domain**.
**[VERIFIED]**

### 12.3 Outbound internet requirements **[VERIFIED]**

| Consumer | Destination | When | Required? |
|---|---|---|---|
| Backend | `Institution.logo_url` (arbitrary HTTP/HTTPS) | Every PDF render / branding preview | Optional but currently on the critical path (10 s timeout) |
| Backend (deploy) | External college MySQL `collegeadmissiondb:3306` | Every deploy (`import_students`) | **Yes** |
| Build/CI | PyPI, npm registry, `cdn.sheetjs.com`, Docker Hub, `download.docker.com`, Maven Central, Alpine/Debian mirrors | Image builds only | **Yes, at build time** |
| Executor | none at runtime | — | **No** |
| Sandboxes | none — `--network none` | — | **No** |
| Certbot | Let's Encrypt | Renewal | Yes (replaced by ACM on AWS) |

**Services that MUST have internet/VPC egress on AWS:** the CI/CD build path (or ECR + VPC endpoints),
the backend (for the logo fetch and the MySQL sync — the latter needs VPN/Direct Connect or a public path to
the campus network), and image pulls. **The execution sandboxes must have NO egress — this is already true
and must be preserved.**

---

## 13. THIRD-PARTY SERVICES

### 13.1 Runtime and build-time externals **[VERIFIED]**

| Service | Purpose | Required? | Traffic pattern | Credentials (names only) |
|---|---|---|---|---|
| **College MySQL** (`collegeadmissiondb`, table `personaldetails`) | Authoritative student roster; synced into `StudentProfile` | **Yes** — CD fails soft but data goes stale | One bulk read per deploy (`SELECT … FROM personaldetails`) | `CODE2DAY_SOURCE_DB_HOST`, `_PORT`, `_NAME`, `_USER`, `_PASSWORD` |
| **Faculty MySQL** (`faculty_management_general_information`) | Staff import (`scripts/import_faculty.py`) | Ad-hoc / manual | One bulk read when run | same family |
| **Let's Encrypt** | TLS certificates | Yes today | Renewal every ~60 days | none (ACME) |
| **Institution logo host** (`Institution.logo_url`, admin-supplied URL) | Logo embedded in PDFs and branding preview | Optional | 1 GET per PDF render, 10 s timeout | none |
| **HuggingFace `datasets-server.huggingface.co`** | Optional LeetCode problem seeding (`scripts/load_leetcode.py`) | No — one-off seeding | Batch fetch | none |
| **Docker Hub / GHCR** | Base images (`python:3.11-slim`, `node:20-alpine`, `nginx:alpine`, `gcc:12-bookworm`, `eclipse-temurin:17-jdk-alpine`) | Build-time | Per image build | none |
| **`download.docker.com`** | `docker-ce-cli` inside the executor image | Build-time | Per build | none |
| **PyPI / npm / Maven Central / Alpine+Debian mirrors** | Dependency installation | Build-time | Per build | none |
| **`cdn.sheetjs.com`** | `xlsx` tarball dependency (not from the npm registry) | Build-time | Per `npm ci` | none |
| **GitHub Actions + self-hosted runner** | CI/CD | Yes | Per push to `main` | GitHub runner token (outside repo) |
| **Dokploy** (PaaS) | Referenced via the external `dokploy-network` and commit `21c0d85` ("source frontend DB env values from Dokploy's Environment store") | Partially in use | — | Managed outside the repo |

### 13.2 Services that are **absent** (and therefore must be designed if wanted) **[VERIFIED]**

No OpenAI/Anthropic/LLM integration. No OAuth/SSO/SAML/OIDC provider. No email service (SMTP is never
configured — **password reset returns a token in the HTTP response instead of emailing it**, see §20-S3).
No SMS. No payment provider. No analytics/telemetry. No error tracking (Sentry). No APM. No S3 or any
object-storage client. No feature-flag service.

### 13.3 Secrets referenced **[VERIFIED — names only; no values are reproduced here]**

```text
DJANGO_SECRET_KEY
DB_PASSWORD
CODE2DAY_SOURCE_DB_PASSWORD
(GitHub Actions self-hosted runner registration token — managed in GitHub, not in this repo)
```

**One hard-coded credential does exist in tracked source:** the diagnostic bearer token in
`views.py:11025`. It is a real, live, publicly-committed shared secret gating
`GET /api/_diag/db/<token>/`, which returns database host/name/user, per-table row counts, and the
**names and sizes of every database on the PostgreSQL server**. Treat it as **compromised** and remove the
view. **[VERIFIED]** — see §20-S4.

Test fixtures contain throwaway passwords (`tests.py`, `test_api.py`); these are not production secrets.

---

## 14. ENVIRONMENT VARIABLES

### 14.1 Actually read by the code **[VERIFIED — every entry traced to a source line]**

| Variable | Purpose | Required | Secret? | Default in code | AWS replacement |
|---|---|---|---|---|---|
| `DJANGO_SECRET_KEY` | Django signing key (sessions, CSRF) | **Yes in prod** | **YES** | falls back to a hard-coded dev key with only a `warnings.warn` (`settings.py:19-35`) | **Secrets Manager** (rotatable) |
| `DJANGO_DEBUG` | Debug mode | Yes | No | `"true"` — **insecure default** | ECS task env, `false` |
| `DJANGO_ALLOWED_HOSTS` | Host header allowlist (CSV) | Yes | No | `127.0.0.1,localhost,testserver` | ECS task env (ALB DNS + domain) |
| `DB_NAME` | PostgreSQL database | Yes | No | `code2day` | ECS task env |
| `DB_USER` | PostgreSQL user | Yes | No | `postgres` if DEBUG else `judge0` | Secrets Manager (RDS-managed secret) |
| `DB_PASSWORD` | PostgreSQL password | Yes | **YES** | `""` | **Secrets Manager**, injected via task `secrets` |
| `DB_HOST` | PostgreSQL host | Yes | No | `localhost` if DEBUG else `172.18.0.1` | RDS endpoint |
| `DB_PORT` | PostgreSQL port | Yes | No | `5432` | 5432 |
| `JUDGE0_BASE_URL` | Executor base URL (aliased to `EXECUTOR_BASE_URL`) | Yes | No | `http://code2day-executor:2358` | ECS Service Connect / internal ALB DNS |
| `JUDGE0_TIMEOUT_SECONDS` | Per-attempt HTTP timeout to the executor | No | No | `30` | ECS task env |
| `CORS_ALLOWED_ORIGINS` | CSV of allowed origins | Yes in prod | No | four localhost dev origins | ECS task env |
| `CSRF_TRUSTED_ORIGINS` | CSV of trusted origins | Yes in prod | No | four localhost dev origins; **`code2day.ramcoad.com` is appended unconditionally** (`settings.py:185-188`) | ECS task env |
| `AUTH_RATE_LIMIT_MAX_ATTEMPTS` | Login throttle | No | No | `5` | ECS task env (move to Redis-backed throttling) |
| `AUTH_RATE_LIMIT_WINDOW_SECONDS` | Login throttle window | No | No | `60` | ECS task env |
| `LOOKUP_RATE_LIMIT_MAX_ATTEMPTS` | Lookup throttle | No | No | `20` | ECS task env |
| `LOOKUP_RATE_LIMIT_WINDOW_SECONDS` | Lookup throttle window | No | No | `60` | ECS task env |
| `CODE2DAY_SOURCE_DB_HOST` | External college MySQL host | Deploy only | No | `127.0.0.1` | ECS task env / Parameter Store |
| `CODE2DAY_SOURCE_DB_PORT` | ↑ port | Deploy only | No | `3306` | — |
| `CODE2DAY_SOURCE_DB_NAME` | ↑ database | Deploy only | No | `collegeadmissiondb` | — |
| `CODE2DAY_SOURCE_DB_USER` | ↑ user | Deploy only | No | `root` | Secrets Manager |
| `CODE2DAY_SOURCE_DB_PASSWORD` | ↑ password | Deploy only | **YES** | `""` | **Secrets Manager** |
| `MAX_WORKERS` | Executor thread-pool size **per uvicorn worker** | No | No | `40` | ECS task env on the dispatcher |
| `CPU_TIME_LIMIT` | ⚠ passed to `--cpus` (CPU **count**, not time) | No | No | `10` | Task/job CPU units |
| `WALL_TIME_LIMIT` | Sandbox wall-clock seconds | No | No | `15` | Job timeout |
| `MEMORY_LIMIT_MB` | Sandbox memory cap | No | No | `256` | Task/job memory |
| `VITE_API_TARGET` | Vite **dev-server** proxy target only | Dev only | No | `http://127.0.0.1:8000` | n/a (build-time dev) |

### 14.2 Set in deployment but **NOT read by any code** **[VERIFIED]**

`SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE` (`backend/docker-compose.yml:29-30`) — `settings.py` derives
both from `DEBUG`, so these two env vars are inert. `DB_NAME`/`DB_USER`/`DB_PASSWORD`/`DB_HOST`/`DB_PORT`
are injected into the **frontend** container (`docker-compose.yml:14-18`) where nothing reads them —
remove them; they are pure secret-exposure surface.

### 14.3 Documented in README but non-existent in code **[VERIFIED]**

`SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` (unprefixed), `DATABASE_URL`, `REDIS_URL`, `CELERY_BROKER_URL`,
`JUDGE0_TOKEN`, `MAX_CPU_TIME`, `MAX_MEMORY`, `MAX_FILE_SIZE`, `RATE_LIMIT_WINDOW`, `RATE_LIMIT_MAX`.
Do not provision these.

### 14.4 Missing configuration that AWS will require **[INFERRED]**

`AWS_STORAGE_BUCKET_NAME` / `AWS_S3_REGION_NAME` (needs `django-storages`), `SESSION_ENGINE` +
`CACHES.default.LOCATION` (needs Redis), `SECURE_PROXY_SSL_HEADER` (**absent today** — behind an ALB,
Django will mis-detect the scheme, can build `http://` absolute URLs, and can mishandle secure cookies),
`CONN_MAX_AGE`, `DATA_UPLOAD_MAX_MEMORY_SIZE`, and a structured JSON `LOGGING` formatter for CloudWatch.

---

## 15. CURRENT DEPLOYMENT

### 15.1 What the application expects today **[VERIFIED]**

A **single Ubuntu VM** running Docker, with:

- **Host-installed PostgreSQL** on `:5432`, reached via `host.docker.internal` (`host-gateway`).
- **Host-installed nginx** as the TLS-terminating reverse proxy (systemd, not a container), with
  Let's Encrypt certificates.
- **Host Docker daemon** doubling as the sandbox runtime for user code.
- An **external Docker bridge network** `code2day-shared` that must pre-exist (`external: true`).
- A **GitHub Actions self-hosted runner** on the same VM, deploying from
  `/home/administrator/Desktop/doc_judge/judge0`.
- Partial **Dokploy** involvement for frontend env injection.
- Network reachability to the **college MySQL** server.

Not Kubernetes. Not serverless. Not a managed database. Single host, no redundancy.

### 15.2 The deployment process, step by step **[VERIFIED — `.github/workflows/deploy.yml`]**

```text
TRIGGER: push to main

── JOB 1: ci  (ubuntu-latest, GitHub-hosted) ───────────────────────────────
 1. actions/checkout@v4.2.2
 2. setup-node@v4.4.0 (Node 22, npm cache keyed on frontend/package-lock.json)
 3. cd frontend && npm ci
 4. cd frontend && npm run build                    <- the only real build gate
 5. setup-python@v5.6.0 (3.11)
 6. cd backend && pip install -r requirements.txt
 7. python manage.py check --deploy | grep -v "^System check" || true
       WARNING: `|| true` means this step CANNOT fail the build. It is decorative.
       WARNING: it sets REDIS_HOST / REDIS_PASSWORD, which nothing reads.
       WARNING: no unit tests run, despite tests.py (589 ln) + tests_execution_flow.py.

── JOB 2: deploy  (self-hosted runner ON the production VM, needs: ci) ─────
 workdir: /home/administrator/Desktop/doc_judge/judge0     <- NOT this repository
 1. git fetch origin main; git checkout main; git reset --hard origin/main
 2. docker compose build backend frontend
 3. docker compose up -d --no-deps backend frontend code2day-executor
 4. Wait up to 60 s for Piston /api/v2/runtimes; install python/java/gcc packages
       WARNING: legacy Piston step - see section 8.1
 5. sed -i 's|JUDGE0_BASE_URL=.*|JUDGE0_BASE_URL=http://code2day-executor:2358|' .env
 6. docker compose up -d --no-deps backend ; sleep 5
 7. docker exec code2day-backend python manage.py migrate --noinput
       WARNING: migrations ALSO run in the container's own start command - executed twice
 8. timeout 60 docker exec ... manage.py import_students   (soft-fails if MySQL unreachable)
 9. manage.py setup_ramco_institution
    manage.py setup_departments_and_map --institution-id 9536
    manage.py seed_missing_students
    manage.py seed_lab_data
10. manage.py collectstatic --noinput
11. Health checks: /admin/ (expect 200/302), :8001/ (expect 200), :2358/api/v2/runtimes (logged only)
```

**Deployment characteristics:**

| Property | Assessment |
|---|---|
| Zero-downtime? | **No** — `docker compose up -d` recreates containers in place |
| Rollback? | **None** — no image tagging, no previous-version retention; recovery = `git revert` + redeploy |
| Blue/green or canary? | No |
| Migration safety | **No backup step before `migrate`**; migrations run twice per deploy; no `--plan` review |
| Idempotency | Seeding commands run on every deploy; `git reset --hard` discards any server-side drift |
| Secrets | A `.env` file on the VM, edited in place by `sed` |
| Build location | Images are built **on the production host** — build CPU competes with live traffic |
| Artifact registry | **None** — no ECR/GHCR; images exist only on that one host |
| Observability | `echo` statements in the job log |

### 15.3 Supporting scripts **[VERIFIED]** — 18 shell scripts

`deploy.sh`, `deploy-update.sh`, `full-deploy.sh` (interactive, requires root, stops nginx),
`quick-redeploy.sh`, `redeploy-app.sh`, `fix-deployment.sh`, `fix-db-connection.sh`, `fix_nginx.sh`,
`apply_nginx_fix.sh`, `inject_code2day.sh`, `ssl_fix_commands.sh`, `setup-dns.sh`,
`setup-auto-restart.sh`, `verify-packages.sh`, plus the four Judge0-era scripts and
`code-executor/{rebuild-images.sh,verify-images.sh}`.

The existence of `fix-*.sh`, `apply_nginx_fix.sh`, and `ssl_fix_commands.sh` is itself evidence of
**manual, repeated remediation on a pet server** — a strong argument for IaC on AWS.

---

## 16. AWS MAPPING

| Current component | AWS service candidate | Alternative | Reason / trade-off |
|---|---|---|---|
| DNS `code2day.ramcoad.com` | **Route 53** (or delegate from the current registrar) | Keep external DNS + CNAME to CloudFront | Route 53 gives health checks and free alias records to CloudFront/ALB. If the campus manages `ramcoad.com` elsewhere, a CNAME is fine and cheaper to organise |
| Host nginx TLS + Let's Encrypt | **ACM + CloudFront + ALB** | ACM + ALB only | ACM certificates are free and auto-renew; removes the certbot failure mode entirely |
| Static SPA (`code2day-frontend`) | **S3 + CloudFront (OAC)** | ECS Fargate nginx | Near-free at this scale, caches Monaco at the edge, removes a container. Requires a CloudFront `/api/*` behaviour → ALB so the relative `/api` base URL keeps working with **no code change** |
| Edge security | **AWS WAF on CloudFront** (managed rules + rate-based rule) | Security groups only | A rate-based WAF rule is the **cheapest immediate mitigation** for the unthrottled `/api/run/` and `/api/executor/submit/` endpoints |
| Django API (`code2day-backend`) | **ECS Fargate service behind an ALB** | EC2 + ECS; EKS; Elastic Beanstalk | Fargate removes host patching and matches the container-first codebase. **Not Lambda** — 120 s timeouts, ~300–400 MB imports, and long synchronous submits fit poorly |
| API routing | **ALB** (path rules `/api/*`, `/admin/*`) | API Gateway HTTP API | ALB is cheaper for steady traffic and supports long idle timeouts. API Gateway's hard **29 s integration timeout would break submits** |
| PostgreSQL (host) | **RDS for PostgreSQL, Multi-AZ** | Aurora PostgreSQL; self-managed on EC2 | RDS gives automated backups, PITR, failover, Performance Insights. **Aurora** only pays off once read replicas are genuinely used — which needs code changes first (§6.6). Start on `db.t4g`/`db.m7g` |
| Connection churn (`CONN_MAX_AGE=0`) | **RDS Proxy** | Set `CONN_MAX_AGE` + PgBouncer sidecar | RDS Proxy bills per vCPU-hour; setting `CONN_MAX_AGE=60` is free and fixes most of it. **Do the free fix first** |
| Sessions (`django_session` table) | **ElastiCache for Redis/Valkey** (`sessions.backends.cache`) | DynamoDB session backend; keep in RDS | Removes one DB write per request — the single highest-leverage change. `cache_db` retains durability if wanted |
| Cache (none today) | **ElastiCache for Redis/Valkey** | none | Needed for dashboards, campus rank, the problem catalogue, and a shared rate limiter |
| Rate limiter (in-process dict) | **Redis-backed DRF throttling** + **WAF rate rules** | API Gateway usage plans | The current limiter is per-worker and resets on deploy — it is not a control |
| Async work (does not exist) | **SQS (standard) + ECS Fargate worker service** | Step Functions; EventBridge Pipes | Required to move execution/PDF/import off the request path. SQS gives visibility timeout, DLQ, and a natural autoscaling signal |
| Code execution sandbox | **See §17 — its own decision** | — | The most consequential choice in the design |
| Container images | **ECR** (immutable tags, scan-on-push, lifecycle policy) | Docker Hub | Removes the "images exist only on one host" failure and enables rollback by tag |
| Media uploads (`/app/media` volume) | **S3** + `django-storages` + CloudFront | EFS | Access is pure object semantics (§7.2). S3 is cheaper, durable, removes host affinity. **EFS is not warranted** |
| Collected static (`/app/staticfiles`) | **S3 + CloudFront**, or enable WhiteNoise | — | Currently broken (§7.2); either fixes it, S3 is cleaner |
| Secrets (`.env` on the VM) | **Secrets Manager** (DB, Django key) + **Parameter Store** (plain config) | — | Secrets Manager for anything rotatable; Parameter Store is free for non-secret config |
| Encryption | **KMS** (RDS, S3, EBS, Secrets Manager) | AWS-managed keys | Customer-managed keys only if key-policy control is required |
| Logs (`json-file`, 100 MB, no rotation cap) | **CloudWatch Logs** with explicit retention (14–30 days) | OpenSearch; S3 export | Set retention — indefinite retention is a classic surprise cost |
| Metrics/alarms (none) | **CloudWatch Container Insights + alarms** | Managed Prometheus/Grafana | Start with Container Insights; add AMP only if PromQL is needed |
| Audit (none) | **CloudTrail** | — | Mandatory baseline |
| Network | **VPC**, 2–3 AZs: public (ALB/NAT) + private-app (ECS/RDS/ElastiCache) + private-isolated (execution) | — | The execution subnets get **no route to the internet at all** |
| Egress for private subnets | **NAT Gateway** (1 per AZ for HA, or 1 to save cost) | VPC endpoints only | NAT Gateway is a **fixed hourly + per-GB** cost that surprises people — minimise it with endpoints |
| AWS API access from private subnets | **VPC endpoints**: S3 + DynamoDB (gateway, free); ECR api/dkr, CloudWatch Logs, Secrets Manager, SSM, SQS (interface, hourly + per-GB) | Route via NAT | For ECR image pulls, interface endpoints usually beat NAT data charges |
| College MySQL connectivity | **Site-to-Site VPN** or **Direct Connect** to the campus network | Public MySQL exposure (do not) | Deploy-time only, but it must work or rosters go stale |
| Backups | **AWS Backup** (RDS snapshots + S3 versioning) | RDS automated backups only | One policy plane, plus cross-region copy |
| CI/CD (self-hosted runner on prod) | **GitHub Actions → OIDC role → ECR push → ECS deploy** | CodePipeline + CodeBuild | Keep GitHub Actions (the team knows it), but remove the runner from the production host and build in CI |
| Cognito? | **Not recommended initially** | — | Auth is deeply custom: 7 roles, register-number/faculty-ID lookup, first-login password set, Django sessions, a separate `StaffProfile.password`. Migrating is a rewrite, not a mapping. Revisit when SSO with the college IdP is required |

**Trade-offs the cost modeller must carry forward:**

- **Fargate vs EC2 for the API:** at low steady load Fargate is simpler and usually cheaper once patching
  effort is counted; at sustained high CPU, EC2 with Savings Plans wins. This API tier is small — prefer
  Fargate, revisit at scale.
- **ALB vs API Gateway:** API Gateway's 29-second maximum integration timeout is **shorter than a single Java
  submit**. That alone rules it out for `/api/run/` and the contest/lab submit paths.
- **NAT Gateway is frequently the third-largest line item** in architectures like this. Because the sandboxes
  need no egress at all, keep them in fully isolated subnets and put VPC endpoints in front of everything else.

---

## 17. CODE EXECUTION AWS ARCHITECTURE

### 17.1 Requirements derived from the code **[VERIFIED]**

| Requirement | Value | Source |
|---|---|---|
| Languages | 5 (Python 3.11, Node 20, Java 17, C, C++17) | `main.py:41-52` |
| Image sizes | Large — C/C++ carries Boost + CGAL; Python carries scipy/pandas | image Dockerfiles |
| Wall-clock budget | ≤15 s per execution | `main.py:55` |
| Memory | 256 MB per execution | `main.py:56` |
| Network | **Must be none** | `main.py:141` |
| Filesystem | One writable scratch dir; no persistence | `main.py:124,147` |
| Invocation shape | Synchronous; **N sequential executions per submit** | `views.py:496` |
| Latency budget | Interactive — the browser aborts the **whole** submit at 60 s | `api.js:4` |
| Untrusted input? | Yes — arbitrary student-authored code | by definition |

**The critical latency constraint:** because test cases run sequentially, per-execution startup is multiplied
by N. At 10 s startup and N=10, a submit takes 100 s — past the browser timeout. **Any option with
double-digit-second cold start is viable only if execution is batched and/or moved behind async polling.**
That is an application change and must be scoped alongside the infrastructure choice.

### 17.2 Option comparison

#### Option A — ECS/Fargate task per execution

| Dimension | Assessment |
|---|---|
| Isolation | **Strong** — each Fargate task is a Firecracker microVM with its own kernel; AWS-managed tenant isolation |
| Startup latency | **Poor here: 20–60 s** (task provisioning + ECR pull + container start) for these large images. Fatal for per-test-case invocation |
| Scaling | Excellent, API-driven, no capacity management |
| Concurrency | Very high; bounded by account task limits |
| Cost | Per-second billing with a **1-minute minimum** — a 1-second Python run bills a full minute of vCPU+memory. Very wasteful at this granularity |
| Ops complexity | Low |
| Suitability | **Poor as-is.** Viable only if reshaped to "one task per *submission*" running all N test cases internally, which amortises startup and cuts task count N× |

#### Option B — ECS on EC2, pre-warmed isolated worker fleet

| Dimension | Assessment |
|---|---|
| Isolation | **Moderate by default** — shared kernel between containers, the same class as today. Becomes **strong** with gVisor (`--runtime=runsc`) or one-cohort-per-host scheduling |
| Startup latency | **Excellent: 0.3–2 s** — images pre-pulled on the host, containers start locally. This is exactly today's behaviour |
| Scaling | Good — ASG + ECS capacity providers, scaling on SQS depth. Node scale-out takes minutes, so keep warm headroom |
| Concurrency | Very high per host (today's config targets 160) |
| Cost | **Best cost-efficiency** — Graviton (`c7g`/`m7g`) plus Spot for execution workers is far cheaper than per-invocation pricing. Spot interruption is acceptable: just re-run the test case |
| Ops complexity | Moderate — you own the AMI, patching, the container runtime, and a reaper for leaked containers |
| Suitability | **Strong.** Closest to the existing code (least application change), best latency, best cost. Requires hardening: no Docker socket, non-root, `--cap-drop=ALL`, seccomp, read-only rootfs, and gVisor or single-tenant hosts |

#### Option C — AWS Batch

| Dimension | Assessment |
|---|---|
| Isolation | Inherits its compute environment (Fargate → strong; EC2 → moderate) |
| Startup latency | **Poor: tens of seconds** — queue scheduling plus container start |
| Scaling | Excellent for throughput; designed for batch, not interactivity |
| Concurrency | Very high |
| Cost | Good (Spot-friendly) |
| Ops complexity | Moderate — job definitions, queues, compute environments |
| Suitability | **Poor for interactive submits.** Genuinely good as a **secondary** path: bulk re-grading, contest-wide re-evaluation, nightly complexity/plagiarism passes |

#### Option D — EKS with isolated workloads

| Dimension | Assessment |
|---|---|
| Isolation | **Strong if configured** — gVisor/Kata RuntimeClass, Pod Security `restricted`, deny-all NetworkPolicy, dedicated node pools, seccomp |
| Startup latency | Good on warm nodes (1–3 s) |
| Scaling | Excellent (Karpenter) |
| Concurrency | Excellent |
| Cost | Compute similar to Option B, **plus ~$73/month per control plane**, plus substantial engineering time |
| Ops complexity | **High** — this is a single-app platform maintained by a small team, with no other Kubernetes in the estate |
| Suitability | **Overkill now.** The right answer if this becomes genuinely multi-institution SaaS with a platform team |

#### Option E — Firecracker / microVM per execution (self-managed)

| Dimension | Assessment |
|---|---|
| Isolation | **Strongest available** — a separate guest kernel per execution; the industry standard for hostile code |
| Startup latency | ~125 ms for a bare microVM, **plus** rootfs preparation and language-runtime start → realistically 0.5–3 s with a good snapshot pipeline |
| Scaling | Good, but you build the orchestration |
| Concurrency | High |
| Cost | Efficient at scale on bare-metal (`c7g.metal`), but **engineering cost dominates** |
| Ops complexity | **Very high** — snapshotting, jailer, networking, image pipeline, lifecycle |
| Suitability | **Not justified.** You get the same isolation class for free by using Fargate or Lambda, both already Firecracker-based |

#### Option F — WASM (Wasmtime / WasmEdge / Spin)

| Dimension | Assessment |
|---|---|
| Isolation | Strong sandbox, tiny attack surface, capability-based |
| Startup latency | **Outstanding — single-digit milliseconds** |
| Scaling / concurrency | Outstanding; thousands per host |
| Cost | Lowest of all options |
| Ops complexity | Moderate runtime, **very high porting cost** |
| Suitability | **Not technically applicable to this codebase.** Python (Pyodide) and C/C++ (WASI) are feasible with effort, but **Java 17 and Node 20 have no production WASM story**, and the platform's value rests on pre-installed native libraries — **Boost, CGAL, BLAS/LAPACK, scipy, pandas, Guava, JGraphT** — most of which do not exist under WASI. Rejected on capability grounds, not cost |

### 17.3 Recommendation

> **Recommended: Option B — a dedicated, isolated ECS-on-EC2 execution fleet, combined with an SQS admission
> queue and a re-shaped execution API.**

Concretely:

1. **Isolate the fleet.** A dedicated ECS cluster on Graviton EC2 (`c7g`, Spot with an on-demand baseline) in
   **private subnets with no NAT and no internet route**, in its own security group that accepts traffic only
   from the dispatcher. A separate IAM instance profile with **no permissions beyond ECR pull and CloudWatch
   Logs**, and **IMDSv2 with `HttpPutResponseHopLimit=1`** so no container can reach instance credentials.
2. **Delete the Docker socket.** The dispatcher becomes an ECS/SQS client, never a Docker client. This one
   change removes the "RCE in the executor = root on the host" path (§8.6).
3. **Harden every sandbox container:** `--user 65534`, `--cap-drop=ALL`, `--read-only` rootfs with a
   size-capped `--tmpfs /code`, `--network none`, `--pids-limit 64`, 256 MB memory, **CPU as a real quota
   (`--cpus 1`, fixing the `--cpus 10` bug)**, a seccomp profile, and — strongly recommended — the **gVisor
   (`runsc`) runtime** for a second kernel boundary at roughly 10–15% CPU overhead.
4. **Fix the reaper.** Use `docker run --cidfile` and `docker kill` on timeout, plus a periodic sweep for
   containers older than the wall limit. Today's leak (§B12) is a standing availability and cost risk.
5. **Batch per submission, not per test case.** Send the whole test-case set to **one** sandbox invocation and
   loop inside it. This is the highest-leverage change available: it cuts container starts by roughly N×
   (typically 5–20×), cuts latency proportionally, and makes **every** option above cheaper.
6. **Put SQS in front.** The API enqueues a submission and returns `202` with a job id; the worker fleet
   consumes; the browser polls a lightweight status endpoint. This gives real admission control, protects the
   API tier from the contest-start spike, and makes autoscaling a function of queue depth. It is the change
   that turns "collapses at ~20 concurrent submits" into "queues gracefully".
7. **Keep AWS Batch in reserve** for bulk re-grading, and **run the dispatcher itself on Fargate**.

**Minimum viable interim** (if the async rework cannot be taken on immediately): the Option B fleet,
per-submission batching (step 5), the container hardening (steps 1–4), plus a WAF rate-based rule and DRF
throttling on `/api/run/`. All of that is achievable without changing the request/response contract.

---

## 18. AWS COST INPUTS

> Fill the measured values before pricing. Every unknown below has a measurement recipe.
> Nothing here is a guess presented as a fact.

### 18.1 Users

| Metric | Status | How to obtain |
|---|---|---|
| Registered students | **UNKNOWN — requires measurement** | `SELECT count(*) FROM student_profiles;` |
| Registered staff (by role) | **UNKNOWN — requires measurement** | `SELECT role, count(*) FROM staff_profiles GROUP BY role;` |
| Business target | **1,000** (from the audit brief, not from the repository) | — |
| DAU | **UNKNOWN — requires measurement** | `SELECT count(*) FROM student_profiles WHERE last_login_on = CURRENT_DATE;` plus the 30-day series from `learning_studentactivity WHERE activity_type='login'` |
| Peak concurrent users | **UNKNOWN — requires measurement** | nginx access log: `awk '{print $4}' code2day.access.log \| uniq -c \| sort -rn \| head` |
| Session length | **UNKNOWN — requires measurement** | `ProblemSession.time_spent_seconds` distribution |
| Usage shape | **INFERRED: extremely bursty.** An academic platform where contests and lab sessions are timetabled, so load concentrates into class hours rather than spreading over 24 h | Confirm from the hourly `execution_records` histogram |

### 18.2 API traffic

| Metric | Status | Notes / how to obtain |
|---|---|---|
| Requests/sec average | **UNKNOWN — requires measurement** | nginx logs |
| Requests/sec peak | **UNKNOWN — requires measurement** | nginx logs |
| **Polling baseline** | **KNOWN formula [VERIFIED]** | `TopBar` 1/min × every logged-in user; **+18/min** per user with Discuss open (5 s + 10 s pollers); +2/min per HOD |
| Average response size | **UNKNOWN — requires measurement** | `ProblemListView` is unpaginated with full descriptions — likely the largest response |
| Requests that trigger execution | **UNKNOWN — requires measurement** | `SELECT count(*) FROM execution_records WHERE created_at > now()-interval '30 days';` |
| p50 / p95 / p99 latency | **UNKNOWN — requires measurement** | Add `$request_time` to the nginx log format, or use ALB access logs after migration |

### 18.3 WebSockets

| Metric | Value |
|---|---|
| Concurrent WebSocket connections | **0 — the feature does not exist [VERIFIED]** |
| Note | If the 5-second Discuss polling is ever replaced by WebSockets, this becomes a new sizing input |

### 18.4 Code execution — the primary cost driver

| Metric | Status | How to obtain |
|---|---|---|
| Executions/day (API calls) | **UNKNOWN — requires measurement** | `SELECT date_trunc('day',created_at), count(*) FROM execution_records GROUP BY 1 ORDER BY 1 DESC LIMIT 30;` — note this counts API calls, **not containers** |
| **Containers per API call** | **KNOWN: equals the test-case count** (one `docker run` each) **[VERIFIED]** | `SELECT avg(c) FROM (SELECT count(*) c FROM learning_testcase GROUP BY problem_id) t;` |
| Actual container starts/day | **Derived** = executions/day × avg test cases | — |
| Peak executions/minute | **UNKNOWN — requires measurement** | Hourly histogram, then a contest-day drill-down |
| Average execution duration | **UNKNOWN — requires measurement** | `SELECT avg(nullif(execution_time,'')::float) FROM execution_records;` (stored as text) |
| Max execution duration | **KNOWN: 15 s wall [VERIFIED]** | `WALL_TIME_LIMIT` |
| Average CPU per execution | **UNKNOWN** — currently *granted* 10 vCPU (bug §8.6) | Measure with `docker stats` under load; **plan for 1 vCPU** after the fix |
| Memory per execution | **KNOWN: 256 MB cap [VERIFIED]** | `MEMORY_LIMIT_MB` |
| Language mix | **UNKNOWN — requires measurement** | `SELECT language, count(*) FROM execution_records GROUP BY 1 ORDER BY 2 DESC;` — **critical**, since Java/C++ cost 3–8× Python per execution |
| Run vs Submit ratio | **UNKNOWN — requires measurement** | Compare `execution_records` count against `problem_solutions` + `contest_submissions` |
| Sandbox image sizes | **UNKNOWN — requires measurement** | `docker images \| grep code2day-` (drives ECR storage and pull time) |

### 18.5 Storage

| Metric | Status | Notes |
|---|---|---|
| S3 GB per user | **≈ 0 — no per-user files exist [VERIFIED]** | Students upload nothing (§7.3) |
| S3 total (media) | **UNKNOWN, expected single-digit MB** | `docker run --rm -v code2day-backend-media:/m alpine du -sh /m` |
| S3 total (static site) | **UNKNOWN, expected 5–20 MB** | `du -sh frontend/dist` after a build |
| Monthly S3 growth | Negligible | — |
| **Database size** | **UNKNOWN — this is the real storage cost** | `SELECT pg_size_pretty(pg_database_size(current_database()));` |
| DB growth per month | **UNKNOWN — requires measurement** | Derive from executions/month × average row size (§6.5). **No retention policy exists**, so it grows monotonically |
| Orphan per-institution DBs | **UNKNOWN — requires measurement** | `SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database WHERE datname LIKE 'code2day_inst_%';` |

### 18.6 Database

| Metric | Status | How to obtain |
|---|---|---|
| Estimated size | **UNKNOWN — requires measurement** | above |
| Reads/sec | **UNKNOWN — requires measurement** | `pg_stat_database` `tup_returned`/`tup_fetched` deltas, or Performance Insights after migration |
| Writes/sec | **UNKNOWN — requires measurement** | `pg_stat_database` `tup_inserted/updated/deleted` deltas |
| **Known write amplifier** | **1 `django_session` UPDATE per authenticated request [VERIFIED]** | Removing this is the top DB optimisation |
| Connections | **≤12 concurrent** (one per Gunicorn worker), **but a fresh connect per request [VERIFIED]** | `SELECT count(*) FROM pg_stat_activity;` |
| Slow queries | **UNKNOWN — requires measurement** | Enable `pg_stat_statements`; expect the campus-rank aggregate (§B5) and `ORDER BY RANDOM()` (§B6) to top the list |
| IOPS profile | **UNKNOWN — requires measurement** | `iostat -x` on the host, or RDS metrics post-migration |

### 18.7 Network

| Metric | Status | Notes |
|---|---|---|
| Ingress/month | **UNKNOWN — requires measurement** | Free on AWS, but useful for ALB LCU sizing |
| **Egress/month** | **UNKNOWN — measure this carefully** | Dominated by the Monaco bundle on first load and PDF downloads: `awk '{s+=$10} END {print s/1024/1024/1024" GB"}' code2day.access.log` |
| CDN cache-hit ratio | n/a today | Assets already carry immutable 1-year headers, so expect a high hit ratio → egress bills at CloudFront rates rather than ALB rates |
| Cross-AZ traffic | **New cost on AWS** | ECS↔RDS↔ElastiCache across AZs is chargeable; co-locate where HA permits |
| NAT Gateway GB | **UNKNOWN — requires measurement** | Minimise: sandboxes need none; use VPC endpoints for ECR/S3/Logs/Secrets/SQS |

### 18.8 Logs

| Metric | Status | Notes |
|---|---|---|
| GB/day | **UNKNOWN — requires measurement** | Docker is set to `max-size: 100M` per container with **no `max-file`**: `du -sh /var/lib/docker/containers/*/*-json.log` |
| Log level | `INFO` in prod, `DEBUG` if `DJANGO_DEBUG=true` **[VERIFIED `settings.py:262`]** | A `DEBUG` misconfiguration would multiply CloudWatch cost |
| Retention today | Effectively unbounded | Set CloudWatch retention explicitly (14–30 days) |

### 18.9 Container workloads

| Metric | Value |
|---|---|
| API vCPU / RAM | **UNKNOWN — measure.** **[INFERRED]** 2–4 vCPU and 3–5 GB for the current 12-worker configuration (`docker stats code2day-backend`) |
| Dispatcher vCPU / RAM | Small — it becomes an SQS/ECS client |
| Execution vCPU per job | **1 vCPU after fixing the `--cpus 10` bug**; 256 MB **[VERIFIED cap]** |
| **CPU per idle user** | **≈ 0 — there is no per-user standing compute [VERIFIED §11]** |
| **RAM per idle user** | **≈ 0** — one `django_session` row **[VERIFIED]** |
| **Idle workspace percentage** | **Not applicable — no workspaces exist [VERIFIED]** |

### 18.10 One-command measurement bundle

```bash
# ---- Database (read-only) ----
psql -d code2day -c "SELECT pg_size_pretty(pg_database_size(current_database()));"
psql -d code2day -c "SELECT relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid)) \
  FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 20;"
psql -d code2day -c "SELECT count(*) AS registered FROM student_profiles;"
psql -d code2day -c "SELECT count(*) AS dau FROM student_profiles WHERE last_login_on=CURRENT_DATE;"
psql -d code2day -c "SELECT date_trunc('day',created_at) d, count(*) FROM execution_records \
  GROUP BY 1 ORDER BY 1 DESC LIMIT 30;"
psql -d code2day -c "SELECT language, count(*) FROM execution_records GROUP BY 1 ORDER BY 2 DESC;"
psql -d code2day -c "SELECT avg(nullif(execution_time,'')::float) FROM execution_records;"
psql -d code2day -c "SELECT avg(length(source_code)) FROM execution_records;"
psql -d code2day -c "SELECT avg(c) AS test_cases_per_problem FROM \
  (SELECT count(*) c FROM learning_testcase GROUP BY problem_id) t;"
psql -d code2day -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database \
  WHERE datname LIKE 'code2day_inst_%';"

# ---- Host & containers ----
nproc; free -g; df -h
docker stats --no-stream
docker images | grep code2day-
docker run --rm -v code2day-backend-media:/m alpine du -sh /m
du -sh /var/lib/docker/containers/*/*-json.log | tail -1

# ---- Traffic ----
awk '{print $4}' /var/log/nginx/code2day.access.log | uniq -c | sort -rn | head -20
awk '{s+=$10} END {print s/1024/1024/1024 " GB egress"}' /var/log/nginx/code2day.access.log

# ---- Frontend bundle ----
cd frontend && npm ci && npm run build && du -sh dist && ls -lS dist/assets | head

# ---- Executor identity + per-language latency ----
curl -s localhost:2358/system_info ; curl -s localhost:2358/api/v2/runtimes
for L in 71 63 62 50 54; do echo "lang $L"; time curl -s -X POST \
  "localhost:2358/submissions?wait=true" -H 'Content-Type: application/json' \
  -d "{\"language_id\":$L,\"source_code\":\"print(1)\",\"stdin\":\"\"}" >/dev/null; done
```

---

## 19. PERFORMANCE BOTTLENECKS — TOP 10

*Rank 1 = Critical … 5 = Minor.*

### #1 — Rank 1 — Synchronous per-test-case execution inside the HTTP request

- **Problem:** a submit runs N sequential blocking container executions on the request thread.
- **Evidence:** `views.py:483-572` (the loop); `judge0.py:159` (`?wait=true`); `backend/docker-compose.yml:15`
  (12 sync workers).
- **Why it matters at 1,000 users:** with only **12 concurrent request slots**, roughly 15–25 simultaneous
  submits saturate the entire API. Every other user — dashboards, polling, login — receives 502/504. One
  contest start with 60 students takes the platform down.
- **Fix:** (a) batch all test cases into **one** sandbox invocation; (b) move submission to **SQS + a worker
  fleet**, return `202` + job id and poll for the result; (c) as immediate relief, switch Gunicorn to
  `--worker-class gthread --threads 8`.
- **AWS impact:** introduces SQS and a worker ECS service; lets the API tier stay small and cheap; makes
  autoscaling a function of queue depth rather than CPU.

### #2 — Rank 1 — Retry storm can exceed the request timeout

- **Problem:** 3 attempts × 30 s timeout + backoff ≈ **93 s per test case**, inside a 120 s Gunicorn limit.
- **Evidence:** `judge0.py:161,168,291-294`; `settings.py:224`; `backend/docker-compose.yml:15`.
- **Why it matters at 1,000 users:** when the executor degrades, each failing request **holds a worker for the
  full 120 s and is then killed**. Twelve such requests is a total outage. Retries amplify the very overload
  that caused them.
- **Fix:** `max_retries=1` on interactive paths; add a circuit breaker; make the timeout a per-*submission*
  budget rather than per-test-case; add jitter.
- **AWS impact:** determines ALB idle timeout and target-group health-check settings; without it, autoscaling
  chases a stampede it cannot outrun.

### #3 — Rank 1 — Unauthenticated, unthrottled code execution

- **Problem:** `POST /api/executor/submit/` is `AllowAny`, and **no** execution endpoint has a rate limit.
- **Evidence:** `views.py:4207`; `auth_utils.py:198` (the limiter exists but is wired only to auth/lookup).
- **Why it matters at 1,000 users:** it is both a security hole (§20-S2) **and** the cheapest possible DoS —
  every unauthenticated request spawns a container currently granted 10 vCPUs.
- **Fix:** require authentication; add Redis-backed DRF throttling; add a WAF rate-based rule; put SQS in front
  so admission is bounded.
- **AWS impact:** left unfixed, execution cost is **unbounded and attacker-controlled** — the cost model is
  meaningless until this is closed.

### #4 — Rank 1 — Timed-out sandbox containers are never killed

- **Problem:** the timeout handler runs `docker ps` and discards the output; the container keeps running.
- **Evidence:** `code-executor/main.py:171-186`.
- **Why it matters at 1,000 users:** every infinite-loop submission permanently consumes CPU and 256 MB.
  Students submit infinite loops constantly, and `code_validator` explicitly **does not block** them
  (`code_validator.py:129`). The host degrades monotonically until someone intervenes by hand.
- **Fix:** `docker run --cidfile` then `docker kill $(cat cidfile)` on timeout, plus a periodic sweeper for
  containers older than `WALL_TIME_LIMIT`.
- **AWS impact:** without this, an ASG scales out forever chasing a leak — one of the most expensive possible
  failure modes.

### #5 — Rank 1 — `django_session` written on every request

- **Problem:** `SESSION_SAVE_EVERY_REQUEST = True` with the database session backend.
- **Evidence:** `settings.py:144`; no `SESSION_ENGINE` override; no `CACHES`.
- **Why it matters at 1,000 users:** combined with 5-second Discuss polling, 300 active users generate roughly
  90 writes/sec against one table — pure write amplification, plus autovacuum pressure and bloat on a table
  with a 30-day TTL.
- **Fix:** `SESSION_ENGINE = 'django.contrib.sessions.backends.cache'` (or `cache_db`) on ElastiCache; set
  `SESSION_SAVE_EVERY_REQUEST = False` unless rolling expiry is genuinely needed.
- **AWS impact:** directly determines the RDS instance class and IOPS. This change alone may halve the
  database tier.

### #6 — Rank 2 — Whole-cohort ranking computed on every dashboard load

- **Problem:** three `Count(distinct=True)` aggregates across **every** student in the institution, then a
  Python loop to find the caller's position, then `.count()` which re-runs the same query.
- **Evidence:** `views.py:815-833, 883`; `calculate_campus_rank_helper` at `views.py:352-373`.
- **Why it matters at 1,000 users:** the dashboard is the first screen after login. During a class-wide login
  spike this is 1,000 rows × 3 distinct-count joins, repeated per user, with **no indexes** to help.
- **Fix:** materialise ranks in a nightly job (or a `RANK() OVER (…)` window query), cache in Redis with a
  short TTL, and stop calling `.count()` on the annotated queryset.
- **AWS impact:** removes the dominant read load; the strongest single argument for ElastiCache.

### #7 — Rank 2 — DELETE executed on every discussion poll

- **Problem:** `DiscussionMessage.objects.filter(created_at__lt=cutoff).delete()` runs on **every** call to an
  endpoint that is polled every 5 seconds.
- **Evidence:** `views.py:384-385`; `DiscussPage.jsx:76`.
- **Why it matters at 1,000 users:** concurrent DELETEs on the same unindexed table cause lock contention and
  dead-tuple churn — a read path behaving as a write path.
- **Fix:** move cleanup to a scheduled job (EventBridge → the worker service); index `created_at`; make the
  read path read-only.
- **AWS impact:** reduces RDS write IOPS and removes a contention source that worsens exactly when the
  platform is busiest.

### #8 — Rank 2 — No database indexes beyond FKs and uniques

- **Problem:** zero `db_index=True` and zero `Meta.indexes` across all 38 models.
- **Evidence:** `models.py` — a repo-wide grep returns nothing.
- **Why it matters at 1,000 users:** sequential scans on `ExecutionRecord` (the fastest-growing table, ordered
  by `-created_at`), `SolvedProblem.solved_at`, `DiscussionMessage.created_at`, `StudentProfile.last_login_on`,
  and `ContestSubmission(contest, student, status)`.
- **Fix:** add composite indexes matching the real filters — `(student, -created_at)` on `ExecutionRecord`,
  `(student, solved_at)` on `SolvedProblem`, `(contest, student, status)` on `ContestSubmission`,
  `created_at` on `DiscussionMessage`, `last_login_on` on `StudentProfile`. Verify with
  `EXPLAIN (ANALYZE, BUFFERS)`.
- **AWS impact:** the cheapest available performance win; may drop the RDS instance a full size class.

### #9 — Rank 2 — Unpaginated list endpoints

- **Problem:** `ProblemListView` returns every problem with full `description`, `editorial`, `examples`, and
  `hints`. Admin/JA/register-number lists behave the same. No DRF pagination class is configured.
- **Evidence:** `views.py:1029-1053`; `settings.py:202-206`.
- **Why it matters at 1,000 users:** a LeetCode-scale catalogue makes this a multi-megabyte JSON response,
  serialised in Python on every problems-page load (`App.jsx:316`) — CPU, memory, and egress at once.
- **Fix:** add `PageNumberPagination`, a slim list serializer (title/slug/difficulty/tags/progress only), and
  cache the catalogue in Redis.
- **AWS impact:** reduces ALB LCUs, CloudFront egress, and API memory.

### #10 — Rank 3 — Per-request PostgreSQL connections and a per-worker rate limiter

- **Problem:** `CONN_MAX_AGE` unset ⇒ connect + authenticate per request. Separately, `InMemoryRateLimiter` is
  a process-local dict, so the effective login limit is `12 × 5` per minute per IP and it resets on every
  deploy.
- **Evidence:** no `CONN_MAX_AGE` anywhere; `auth_utils.py:128-195`.
- **Why it matters at 1,000 users:** connection setup adds latency to every request and multiplies as the API
  scales out; brute-force protection is materially weaker than the settings imply, and gets weaker with each
  replica added.
- **Fix:** `CONN_MAX_AGE = 60` (RDS Proxy only if genuinely needed); move throttling to a Redis-backed DRF
  throttle class; add WAF rate rules.
- **AWS impact:** fewer RDS connection slots; horizontal scaling stops degrading security.

### Honourable mentions

`ORDER BY RANDOM()` on the problems table (`views.py:911`); synchronous PDF generation with a remote logo
fetch on the request path (`pdf_reports.py:93`, 10 s timeout); `MaintenanceMiddleware` issuing a
`SystemConfiguration.objects.get_or_create` **on every request** (`middleware.py:23`); the full scientific
stack (`pandas`, `Pillow`, `ReportLab`) imported at module scope in `views.py:91-101` so all 12 workers carry
it; `JABulkImportView` materialising an entire spreadsheet in memory (`views.py:8701`); and migrations running
twice per deploy with no pre-migration backup.

---

## 20. SECURITY REVIEW

> Defensive review only. Findings are documented, not exploited. No proof-of-concept requests were issued
> against any running system, and no secret values are reproduced.
>
> Severity: **S1 = critical** (fix before any internet exposure), **S2 = high**, **S3 = medium**, **S4 = low**.

### S1-A — Unauthenticated institution creation **and database deletion**

- **Finding:** `InstitutionManagementView` sets `permission_classes = [AllowAny]` and exposes `POST` (create
  institution + `CREATE DATABASE`) and `DELETE` (`DROP DATABASE` + delete the institution row).
- **Evidence:** `views.py:7430-7483`; routes `admin/v2/institutions/` and `admin/v2/institutions/<int:pk>/`
  (`urls.py:213-214`); DDL in `db_manager.py:37-92`, which also runs `pg_terminate_backend` against the target.
- **Impact:** anyone who can reach `/api/` can destroy tenant databases and terminate live connections. Because
  the view is `AllowAny`, DRF's `SessionAuthentication` never engages, so **CSRF enforcement does not apply**
  to unauthenticated callers.
- **Remediation:** require an authenticated system-admin role; remove `DROP DATABASE` from any HTTP path
  entirely (make it an operator-run management command with confirmation); add `IsAdminUser`-equivalent
  permission classes; audit-log all tenant lifecycle operations.

### S1-B — Unauthenticated arbitrary code execution

- **Finding:** `ExecutorSubmitView` is `AllowAny` and forwards caller-supplied `source_code` + `language_id`
  straight to the executor.
- **Evidence:** `views.py:4205-4289`; route `executor/submit/` (`urls.py:315`).
- **Impact:** unauthenticated compute-on-demand. Combined with the missing rate limit (S2-D) and the
  `--cpus 10` grant (S2-F), this is a trivially exploitable resource-exhaustion vector and an unmetered
  compute giveaway.
- **Remediation:** require authentication; apply throttling; ideally delete the endpoint — the authenticated
  `/api/run/` already covers the product need.

### S1-C — Forgeable password-reset token → account takeover

- **Finding:** the reset token is `f"reset_{user.id}_{timezone.now().timestamp()}"` — unsigned, unhashed, not
  stored, and not bound to the verified identity. `PUT /api/auth/password-reset/` accepts **any** string of
  that shape, parses `user_id` from it, and calls `user.set_password(new_password)`.
- **Evidence:** token minted at `views.py:7993` and `views.py:8030`; verification at `views.py:8064-8086`.
- **Impact:** the identity checks in `POST` (register number + email + phone) are bypassed entirely, because
  `PUT` never re-verifies them. Any user ID can have its password set. The only constraint is a 24-hour
  timestamp window, which the caller supplies.
- **Remediation:** use `django.contrib.auth.tokens.PasswordResetTokenGenerator` (or a signed, single-use,
  server-stored token), deliver it **out of band by email** rather than returning it in the HTTP response,
  bind it to the user's current password hash so it invalidates on use, and rate-limit both steps.

### S1-D — Docker socket exposure (execution plane)

- **Finding:** the executor shells out to the host Docker CLI, which requires `/var/run/docker.sock` to be
  bind-mounted into the container.
- **Evidence:** `code-executor/Dockerfile:5-14` installs `docker-ce-cli`; `code-executor/main.py:139-165`
  invokes `docker run`. The mount itself is in the untracked server compose — **[INFERRED, high confidence]**.
- **Impact:** access to the Docker socket is equivalent to root on the host. Any RCE in the FastAPI process —
  or any attacker who can reach port 2358, which has **no authentication** — can start a privileged container
  and take the host, including the database credentials and every tenant's data.
- **Remediation:** remove the socket. The dispatcher should enqueue jobs (SQS) and let a separate, isolated
  worker fleet execute them; on AWS the worker's IAM role should grant nothing beyond ECR pull and log write.
  See §17.3.

### S1-E — Legacy Judge0 deployment runs privileged containers with network access

- **Finding:** the Judge0 installer generates a compose file with `privileged: true` on both `server` and
  `workers`, plus `ENABLE_NETWORK=true`, `ALLOW_ENABLE_NETWORK=true`, and `ALLOW_ORIGIN=*`.
- **Evidence:** `judge0_install.sh:138,150,212,220,255`.
- **Impact:** privileged containers executing untrusted code with outbound internet access — container escape
  and egress (including to the instance metadata service) are effectively unmitigated.
- **Remediation:** confirm this generation is not running (§8.1) and delete these scripts from the repository
  so they cannot be re-run by mistake.

### S2-A — Unauthenticated system-admin surface (information disclosure + control)

- **Finding:** `SystemAdminDashboardView`, `InstitutionDetailManagementView`, `GlobalMaintenanceControlView`,
  `DepartmentManagementView`, and `InstitutionBrandingPreviewView` are all `AllowAny`. The comment
  `# In production, restrict to system admins` at `views.py:7394` acknowledges this.
- **Evidence:** `views.py:7393,7430,7485,7658,7674,7815`.
- **Impact:** unauthenticated disclosure of total user counts, the full institution list, staff rosters
  (faculty IDs, names, roles, departments), and department structure — plus the ability to toggle
  **global maintenance mode**, i.e. a one-request denial of service against every student, staff member,
  and HOD on the platform.
- **Remediation:** add role-checked permission classes to each; treat `AllowAny` as requiring written
  justification in review.

### S2-B — Hard-coded diagnostic token exposing database topology

- **Finding:** `TempDataDiagnosticsView` is `AllowAny` and gated only by a literal token compared in source.
- **Evidence:** `views.py:11013-11092`, token literal at `views.py:11025`; route
  `_diag/db/<str:token>/` (`urls.py:356`). The view's own docstring says "Delete this view + its URL once the
  data-loss investigation is closed."
- **Impact:** the token is committed to git and therefore **public to anyone with repository access, and
  permanently present in git history**. It returns the database name, host, user and port; row counts for
  seven tables; the `DB_*` environment values seen by the backend; and — via a second psycopg2 connection to
  the `postgres` database — **the name and size of every database on the server**.
- **Remediation:** delete the view and its route now; treat the token as compromised; rotate any credential
  that shares the same secret material; consider a history rewrite or, at minimum, note it in an incident log.

### S2-C — Broad `AllowAny` / missing permission classes across the API

- **Finding:** DRF's project default is `AllowAny` (`settings.py:202-206`). **38 of 137 APIView classes**
  neither use an auth mixin nor set a restrictive `permission_classes`.
- **Evidence:** `settings.py:202`; enumerated across `views.py` (auth/lookup views legitimately public; the
  admin, executor, diagnostic and several lab-assignment views are not).
- **Impact:** each unguarded view is an independent authorisation gap. The lab-assignment group
  (`HODDeptStaffView`, `HODLabAssignmentView`, `StaffLabSubmissionsView`, `LabAssignmentSubmitView`, …) relies
  on `_staff_from_request` / `_student_from_request` helpers that **return `None` rather than rejecting**, so
  behaviour depends on each view remembering to check.
- **Remediation:** flip the project default to `IsAuthenticated` and mark the genuinely public endpoints
  (`health`, `csrf-token`, `institutions`, the auth/lookup/login family) with an explicit `AllowAny`. Then
  re-test — this is the single highest-value security change and it is a small diff.

### S2-D — No rate limiting on expensive endpoints

- **Finding:** `check_rate_limit` is invoked only on auth and lookup paths. `/api/run/`,
  `/api/executor/submit/`, all contest/lab submit endpoints, and all PDF report endpoints are unthrottled.
- **Evidence:** `auth_utils.py:198`; absent from `CodeRunView` (`views.py:1209`), `ExecutorSubmitView`
  (`views.py:4205`), `StudentContestSubmitView` (`views.py:5996`), `StudentReportPDFView` (`views.py:6564`).
- **Impact:** an authenticated student (or, for the executor endpoint, anyone) can exhaust execution capacity
  or CPU-bound PDF rendering. On AWS this is directly an unbounded bill.
- **Remediation:** Redis-backed DRF throttle classes with per-user scopes, plus WAF rate-based rules, plus SQS
  admission control.

### S2-E — Rate limiter is per-process and non-durable

- **Finding:** `InMemoryRateLimiter` is a module-level dict inside each Gunicorn worker.
- **Evidence:** `auth_utils.py:128-195` (the docstring concedes it is "acceptable for single-process
  gunicorn").
- **Impact:** with 12 workers the effective login limit is **60 attempts/minute/IP**, not 5, and it resets on
  every deploy. It degrades further with every horizontal replica.
- **Remediation:** move to a shared Redis store.

### S2-F — Sandbox CPU limit is misconfigured as a CPU *count*

- **Finding:** `CPU_TIME_LIMIT` (default `10`, semantically seconds) is passed to Docker's `--cpus`.
- **Evidence:** `code-executor/main.py:54,144`.
- **Impact:** every sandbox is entitled to **10 vCPUs**. With the thread pool sized at up to 160 concurrent
  executions, the executor can request 1,600 vCPUs from one host. This is the largest single
  cost-and-availability defect in the execution plane.
- **Remediation:** pass `--cpus 1` (or a tuned quota) and enforce CPU *time* separately via `ulimit -t` or
  cgroup accounting.

### S2-G — Sandbox containers run as root with the default capability set

- **Finding:** no `--user`, no `--cap-drop`, no `--read-only`, no seccomp profile beyond Docker's default.
- **Evidence:** `code-executor/main.py:139-150`. (`--security-opt no-new-privileges`, `--network none` and
  `--pids-limit 64` *are* present — the good half of the configuration.)
- **Impact:** root inside a shared-kernel container narrows the distance to a runc/kernel escape.
- **Remediation:** `--user 65534:65534`, `--cap-drop=ALL`, `--read-only` with a size-capped `--tmpfs /code`,
  a seccomp profile, and gVisor as the runtime.

### S2-H — Executor has no authentication and permissive CORS

- **Finding:** port 2358 accepts unauthenticated `POST /submissions` from anything on the
  `code2day-shared` Docker network (and from localhost, which CI curls), with
  `CORSMiddleware(allow_origins=["*"])`.
- **Evidence:** `code-executor/main.py:26-31`; no auth dependency on any route.
- **Remediation:** on AWS, place it in a private subnet with a security group restricted to the dispatcher,
  and add a shared-secret header or SigV4 between tiers. Do not publish port 2358 on any host.

### S3-A — SSRF via institution `logo_url`

- **Finding:** an admin-supplied URL is fetched server-side with `requests.get(...)` and no scheme, host, or
  IP-range validation.
- **Evidence:** `pdf_reports.py:93` (10 s timeout), `pdf_reports.py:157` (5 s), `pdf_reports.py:1528`,
  `views.py:139`.
- **Impact:** the backend can be induced to request internal addresses, including `169.254.169.254`. On EC2
  with IMDSv1 that is credential theft; with IMDSv2 the risk is reduced but internal-service probing remains.
- **Remediation:** allowlist schemes and hosts, resolve and reject private/link-local ranges, cap response
  size, and prefer serving logos from S3/CloudFront rather than fetching arbitrary URLs at render time.
  **Enforce IMDSv2 with a hop limit of 1** on every instance.

### S3-B — Insecure defaults if environment variables are missing

- **Finding:** `DJANGO_DEBUG` defaults to `"true"`; `DJANGO_SECRET_KEY` falls back to a hard-coded
  `code2day-insecure-dev-key-do-not-use-in-production` with only a `warnings.warn`.
- **Evidence:** `settings.py:19-35`.
- **Impact:** a missing or mistyped env var yields `DEBUG=True` in production — full tracebacks with settings
  and SQL — and a publicly known signing key, which makes session and CSRF tokens forgeable.
- **Remediation:** `raise ImproperlyConfigured` when `DEBUG` is false and the key is unset; default `DEBUG` to
  `False`.

### S3-C — Upload handling weaknesses

- **Finding:** the generic institution file upload accepts any filename and any content type, saving it under
  `institutions/<id>/files/` with `default_storage.save()`. File identity is the **positional index** of a
  `listdir` result.
- **Evidence:** `file_views.py:76-91`; positional lookup at `file_views.py:119-121,147-150,181-184`.
- **Impact:** no MIME validation, no size limit beyond nginx's 20 MB, no malware scanning; positional IDs mean
  a delete or download can silently target the wrong file after any concurrent change. Django's storage layer
  does sanitise the name, so path traversal is mitigated, but stored-XSS is possible if these files are ever
  served inline from the app origin.
- **Remediation:** introduce a real `File` model with UUID keys; validate content type and size; serve from S3
  with `Content-Disposition: attachment` on a separate origin.

### S3-D — Tenant isolation depends on per-view discipline

- **Finding:** isolation is enforced by adding `institution=` / `department=` filters in each view; there is no
  middleware or manager-level scoping, and the per-tenant databases that `db_manager` creates are never used
  (§6.2).
- **Evidence:** absence of `DATABASE_ROUTERS`; ad-hoc `.filter(institution=…)` throughout `views.py`.
- **Impact:** any view that forgets the filter leaks cross-tenant data. Several object lookups are by primary
  key with no ownership check.
- **Remediation:** add a tenant-scoped default manager or a queryset mixin; add automated tests that assert
  cross-tenant access returns 403/404.

### S3-E — Missing proxy/TLS configuration for a load-balanced deployment

- **Finding:** `SECURE_PROXY_SSL_HEADER` is not set, and `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS`,
  `SECURE_CONTENT_TYPE_NOSNIFF`, and `SECURE_REFERRER_POLICY` are all absent from settings (HSTS and the
  header policies are currently applied by nginx instead).
- **Evidence:** `settings.py` (whole file); `code2day_nginx_block.txt:12-14`.
- **Impact:** behind an ALB that terminates TLS, `request.is_secure()` returns `False`, so Django may emit
  `http://` absolute URLs and mis-evaluate secure-cookie logic. Moving off nginx also silently drops HSTS.
- **Remediation:** set `SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')` and move the security
  headers into Django (or into CloudFront's response-headers policy).

### S3-F — Uncontrolled error detail in responses

- **Finding:** numerous handlers return `str(e)` directly to the client.
- **Evidence:** `views.py:7467,7483,8045,8102`; `file_views.py:61,95,136,163,197,239,286,328`.
- **Impact:** leaks internal paths, table names, and driver messages.
- **Remediation:** log the detail, return a generic message plus a correlation ID.

### S3-G — Django Admin exposed at a predictable public path

- **Finding:** `/admin/` is proxied publicly with no IP allowlist, no MFA, and no brute-force protection
  (Django's admin login is not covered by `check_rate_limit`).
- **Evidence:** `code2day/urls.py:7`; `code2day_nginx_block.txt:32-39`.
- **Remediation:** restrict by source IP or put it behind a VPN/WAF rule, and enable MFA.

### S4 — Lower-severity observations

- **Database credentials injected into the static frontend container** (`docker-compose.yml:14-18`) — remove.
- **`.gitignore` lists files that are nonetheless tracked** (`judge0_install.sh`, `full-deploy.sh`,
  `Dockerfile.custom`, and others), creating a false sense that server-only material is excluded.
- **`xlsx` is installed from `https://cdn.sheetjs.com/...tgz`** rather than the npm registry
  (`package.json:17`) — outside registry provenance and audit tooling.
- **CI cannot fail on backend problems** — `manage.py check --deploy` is suffixed with `|| true`, and the
  existing test suites are never executed (`.github/workflows/deploy.yml:60`).
- **Static and media files are unserved in production** (§7.2) — an availability rather than confidentiality
  issue, but it means Django Admin renders unstyled and every uploaded logo 404s.
- **The code validator is a denylist** (`code_validator.py`) — useful as UX guidance, worthless as a boundary,
  and a source of false positives on legitimate solutions. Keep it, but never count it as a control.

### Security remediation order (recommended)

1. **S1-C** forgeable reset token → account takeover.
2. **S1-A / S1-B / S2-A / S2-B** — flip the DRF default to `IsAuthenticated`, add explicit `AllowAny` to the
   genuinely public endpoints, and delete the diagnostic view. One focused change closes most of the surface.
3. **S1-D** remove the Docker socket from the execution path (ships with the §17 architecture).
4. **S2-D / S2-E / S2-F** throttling, shared rate limiter, and the `--cpus` fix.
5. **S2-G / S3-A / S3-E** container hardening, SSRF allowlist + IMDSv2, proxy/TLS settings.
6. Everything else.

---

## 21. FINAL ARCHITECTURE

### 21.1 Recommended AWS architecture

```text
                                    Internet
                                        │
                                   ┌────▼─────┐
                                   │ Route 53 │   code2day.ramcoad.com (alias)
                                   └────┬─────┘
                                        │
                              ┌─────────▼──────────┐
                              │   AWS WAF          │  managed rules + rate-based rule
                              │   (on CloudFront)  │  ← first real throttle on /api/run/
                              └─────────┬──────────┘
                                        │
                              ┌─────────▼──────────┐
                              │    CloudFront      │  ACM cert, HTTP/2+3, compression
                              │                    │
                              │  behaviour  /*     ├──────► S3 (private, OAC)
                              │   → static SPA     │        React build + collected static
                              │                    │        SPA fallback: 403/404 → /index.html
                              │  behaviour /api/*  │
                              │  behaviour /admin/*├──────► ALB  (no caching, forward cookies)
                              │  behaviour /media/*├──────► S3 (uploads bucket, OAC)
                              └─────────┬──────────┘
                                        │  HTTPS
                    ══════════════ VPC (3 AZ) ══════════════════════════
                                        │
                        ┌───────────────▼────────────────┐
                        │  ALB  (public subnets)         │  idle timeout ≥ 180 s
                        └───────────────┬────────────────┘
                                        │
   PRIVATE-APP subnets                  │
   ┌────────────────────────────────────▼─────────────────────────────────────┐
   │  ECS Fargate — "api"        Django + Gunicorn (gthread), 2+ tasks, ASG    │
   │                             target-tracking on ALB RequestCountPerTarget  │
   └───┬─────────────────┬───────────────────┬──────────────────┬─────────────┘
       │                 │                   │                  │
       │ enqueue         │ session/cache     │ SQL              │ media
       ▼                 ▼                   ▼                  ▼
 ┌───────────┐   ┌────────────────┐   ┌──────────────┐   ┌──────────────┐
 │ SQS       │   │ ElastiCache    │   │ RDS Postgres │   │ S3 uploads   │
 │ submissions│  │ Redis/Valkey   │   │ Multi-AZ     │   │ (versioned,  │
 │  + DLQ    │   │ sessions,cache,│   │ PITR, PI,    │   │  KMS)        │
 └─────┬─────┘   │ rate limits    │   │ AWS Backup   │   └──────────────┘
       │         └────────────────┘   └──────────────┘
       │
       │  ┌──────────────────────────────────────────────────────────────┐
       ├─►│ ECS Fargate — "worker"   PDF reports, bulk imports,          │
       │  │                          roster sync, scheduled cleanups     │
       │  └──────────────────────────────────────────────────────────────┘
       │
       │  ┌──────────────────────────────────────────────────────────────┐
       └─►│ ECS Fargate — "dispatcher"   consumes submissions,           │
          │                              places jobs on the exec fleet   │
          └───────────────────────────┬──────────────────────────────────┘
                                      │  (ECS RunTask / internal API — NEVER a Docker socket)
   PRIVATE-ISOLATED subnets           │   no NAT · no IGW · no route to the internet
   ┌──────────────────────────────────▼──────────────────────────────────────┐
   │  ECS on EC2 — "execution fleet"                                          │
   │  Graviton c7g, Spot + on-demand baseline, ASG on SQS depth               │
   │  IMDSv2, hop-limit 1 · instance role: ECR pull + Logs only               │
   │                                                                          │
   │   sandbox container per SUBMISSION (all test cases inside):              │
   │     runtime gVisor (runsc) · --network none · --user 65534               │
   │     --cap-drop=ALL · --read-only + tmpfs /code · --pids-limit 64         │
   │     --memory 256m · --cpus 1 · seccomp · hard-killed on timeout          │
   │   images: python / node / java / c / cpp   (pre-pulled, ECR)             │
   └──────────────────────────────────────────────────────────────────────────┘

   ┌── Cross-cutting ────────────────────────────────────────────────────────┐
   │ ECR (immutable tags, scan-on-push, lifecycle)                            │
   │ Secrets Manager (DB, Django key, MySQL) · Parameter Store (config)       │
   │ KMS (RDS, S3, EBS, Secrets)                                              │
   │ CloudWatch Logs (retention 14–30 d) · Container Insights · alarms        │
   │ CloudTrail · AWS Backup                                                  │
   │ VPC endpoints: S3+DynamoDB (gateway) · ECR api/dkr, Logs, SQS,           │
   │                Secrets Manager, SSM (interface)                          │
   │ NAT Gateway — private-app only; the execution subnets have none          │
   │ Site-to-Site VPN → campus MySQL (collegeadmissiondb), deploy-time sync   │
   └──────────────────────────────────────────────────────────────────────────┘
```

### 21.2 Component rationale

| Component | Why it is there |
|---|---|
| **Route 53** | Alias records to CloudFront/ALB with health checks; free alias queries |
| **WAF** | The application has **no working rate limiting**; a rate-based rule is the fastest mitigation for §S2-D while the code is fixed |
| **CloudFront** | Serves the Monaco-heavy SPA from the edge; the `/api/*` behaviour preserves the **relative `/api` base URL**, so no frontend code change is needed; TLS via ACM removes certbot |
| **S3 (static)** | The frontend is a pure static build — no reason to pay for compute to serve it |
| **S3 (uploads)** | Replaces the host-local `code2day-backend-media` volume, which today blocks horizontal scaling and is **unreachable in production anyway** (§7.2) |
| **ALB** | Long timeouts for synchronous submits; path routing for 138 routes without per-route config; API Gateway's 29 s cap would break submits |
| **ECS Fargate (api)** | Stateless once sessions and media move off the host; no EC2 patching; scales on request count |
| **ElastiCache Redis/Valkey** | Removes the per-request `django_session` write (§B3/#5), caches the campus-rank and problem-catalogue queries (#6/#9), and provides the **shared** rate limiter (§S2-E) |
| **RDS PostgreSQL Multi-AZ** | Managed backups, PITR, failover, Performance Insights. Aurora only after read replicas are genuinely usable (§6.6) |
| **SQS + DLQ** | The admission control the platform completely lacks; converts a contest-start stampede into a queue; provides the autoscaling signal |
| **ECS Fargate (worker)** | Moves PDF generation, bulk imports, roster sync, and the discussion cleanup off the request path |
| **ECS Fargate (dispatcher)** | Replaces the Docker-socket-holding executor; a plain queue consumer with no privileged access |
| **ECS on EC2 (execution fleet)** | Warm images give 0.3–2 s starts; Graviton + Spot gives the best cost; full isolation via network-less, capability-less, gVisor-wrapped containers in subnets with no internet route |
| **ECR** | Fixes "images exist only on one host"; enables rollback by tag and scan-on-push |
| **Secrets Manager / KMS / CloudTrail / AWS Backup** | Baseline controls that do not exist today (`.env` edited by `sed`, no audit trail, no backup policy) |
| **VPC endpoints** | Keeps ECR pulls and log writes off the NAT Gateway, which is otherwise a top-3 line item |
| **Site-to-Site VPN** | `import_students` must reach the campus MySQL or rosters go stale |

### 21.3 What must change in the application to reach this architecture

| Change | Effort | Blocking? |
|---|---|---|
| `django-storages` + S3 for `MEDIA_ROOT`; serve static from S3/WhiteNoise | Small | Blocks multi-task API |
| `SESSION_ENGINE` → cache, `CACHES` → Redis | Small | Blocks the DB right-sizing |
| `SECURE_PROXY_SSL_HEADER` + security headers | Trivial | Blocks correct HTTPS behaviour behind the ALB |
| `CONN_MAX_AGE`, DB indexes, pagination | Small | Strongly recommended before load testing |
| Flip DRF default to `IsAuthenticated`; delete the diagnostic view; fix the reset token | Small | **Blocks internet exposure** |
| Batch test cases into one sandbox invocation | Medium | Blocks acceptable submit latency |
| SQS-based async submission + status polling endpoint | Medium–Large | Blocks contest-scale concurrency |
| Replace the Docker-socket executor with a queue consumer | Medium | Blocks the isolation model |
| Move migrations out of container start into a one-shot deploy task | Small | Blocks safe multi-task rollout |

---

## 22. DEPLOYMENT PLAN

Ten phases, each with explicit dependencies and exit criteria.

### Phase 1 — Foundation & infrastructure
**Depends on:** an AWS account, region choice (`ap-south-1` is the obvious fit for a Tamil Nadu campus —
lowest latency and data-residency alignment).
**Do:** AWS Organizations + separate `prod`/`staging` accounts; IAM Identity Center; CloudTrail
organisation trail; a Terraform/CDK repository with remote state; VPC across 3 AZs with public,
private-app, and private-isolated subnet tiers; security groups; VPC endpoints (S3, ECR api/dkr, Logs,
SQS, Secrets Manager, SSM); one NAT Gateway to start; KMS keys; ECR repositories; Secrets Manager entries
(no values in code); ACM certificate (DNS validation).
**Exit:** `terraform apply` is reproducible from an empty account; no console-only resources.

### Phase 2 — Database
**Depends on:** Phase 1 (VPC, KMS, Secrets).
**Do:** provision RDS PostgreSQL Multi-AZ (match the source major version — confirm with `SELECT version();`)
with encryption, automated backups, PITR, Performance Insights, `pg_stat_statements`, and a parameter group.
Provision ElastiCache Redis/Valkey. Dump and restore the existing database (`pg_dump -Fc` → `pg_restore`)
into staging; **drop the unused `code2day_inst_*` databases** (§6.2) once confirmed empty. Apply the new
indexes (§19 #8) and measure with `EXPLAIN (ANALYZE, BUFFERS)`.
**Exit:** staging RDS holds a verified copy; row counts match; index changes measured, not assumed.

### Phase 3 — Backend
**Depends on:** Phase 2.
**Do:** apply the application changes marked *Blocking* in §21.3 (S3 storage, Redis sessions, proxy SSL
header, `CONN_MAX_AGE`, pagination, the DRF permission-default flip, deletion of the diagnostic view, the
reset-token fix). Switch Gunicorn to `gthread`. Move `migrate` out of the container command into a one-shot
ECS task. Build and push to ECR. Deploy the `api` service on Fargate behind the ALB with health checks on
`/api/health/`.
**Exit:** staging API serves authenticated traffic behind the ALB; migrations run exactly once per deploy;
`manage.py check --deploy` is clean **without** `|| true`.

### Phase 4 — Frontend
**Depends on:** Phase 3 (a working API origin).
**Do:** `npm ci && npm run build`; sync `dist/` to the static S3 bucket; create the CloudFront distribution
with OAC, the `/api/*` and `/admin/*` behaviours pointing at the ALB, `/media/*` at the uploads bucket, and
403/404 → `/index.html` for SPA routing; attach ACM and WAF; set cache policies (long TTL for hashed assets,
no-store for `index.html`).
**Exit:** the SPA loads from CloudFront, login works end to end, and no code change was needed to reach the
API.

### Phase 5 — Code execution
**Depends on:** Phases 1–3.
**Do:** build the 5 sandbox images for `arm64` and push to ECR (verify Boost/CGAL/scipy availability on
Graviton — **this is a real porting risk; test before committing to Graviton**). Stand up the isolated
execution cluster (ECS on EC2, ASG, IMDSv2 hop-limit 1, gVisor). Build the dispatcher as an SQS consumer with
**no Docker socket**. Implement per-submission batching and the hardened container flags (§17.3). Implement
hard timeout kill. Add the async submit + status-polling endpoints and the matching frontend change.
**Exit:** all 5 languages execute correctly; a deliberate infinite loop is killed and reaped; nothing in the
path can reach the Docker daemon or the internet.

### Phase 6 — Networking & security
**Depends on:** Phases 1–5.
**Do:** finalise security groups (least privilege, SG-to-SG references only); WAF rules including the
rate-based rule; Site-to-Site VPN to the campus MySQL and a verified `import_students` run; restrict
`/admin/` by IP or VPN; enable GuardDuty and Security Hub; complete the §20 remediation list; run an
independent review of the auth surface.
**Exit:** every S1 and S2 finding is closed and verified; no security group allows `0.0.0.0/0` except the
ALB on 443.

### Phase 7 — CI/CD
**Depends on:** Phases 3–5.
**Do:** GitHub Actions with OIDC to an AWS role (no long-lived keys); **retire the self-hosted runner on the
production host**; build and push immutable image tags to ECR; run the existing test suites and
`manage.py check --deploy` as **hard gates**; deploy to staging automatically and to production on approval;
rolling ECS deployments with circuit breaker and automatic rollback; run migrations as a pre-deploy one-shot
task with a snapshot taken first.
**Exit:** a push to `main` reaches staging with no human on the production host; rollback is a tag change.

### Phase 8 — Monitoring
**Depends on:** Phase 7.
**Do:** CloudWatch Container Insights; structured JSON logging with retention set; alarms on ALB 5xx and
p99 latency, ECS CPU/memory, RDS CPU/connections/free storage/replica lag, ElastiCache evictions, **SQS queue
depth and DLQ message count**, and execution-fleet capacity; a CloudWatch dashboard per tier; SNS to on-call;
synthetic canaries for login and submit.
**Exit:** every §19 bottleneck has a metric and an alarm; the DLQ is never silently non-empty.

### Phase 9 — Load testing
**Depends on:** Phase 8 (you cannot interpret a load test without telemetry).
**Do:** execute §23 in full against staging, sized identically to production. Fill in every
"UNKNOWN — requires measurement" in §18 from real data. Tune task counts, RDS class, and fleet size from
observed p95, then re-run.
**Exit:** the 1,000-user profile passes with p95 within target and an error rate below 0.5%; §18 has no
remaining unknowns.

### Phase 10 — Production cutover
**Depends on:** Phases 1–9.
**Do:** freeze writes; final `pg_dump`/restore (or DMS with CDC for a shorter window); sync media to S3;
lower the DNS TTL 24 h in advance; cut over; keep the old VM powered off but intact for 30 days; monitor
intensively for 72 h; run a rollback rehearsal **before** the real cutover.
**Exit:** production serves from AWS; the rollback path has been rehearsed, not merely documented.

---

## 23. LOAD TEST PLAN

**Tooling:** k6 or Locust (both handle cookie sessions and CSRF cleanly). Run from EC2 inside the same region
to avoid measuring the internet. Distributed load generators once past 500 virtual users.

**Seed data required before testing:** a realistic problem catalogue with realistic test-case counts,
1,000+ student accounts with known passwords, at least one published contest assigned to a large batch, and
a populated discussion thread. `manage.py seed_code2day`, `seed_lab_data`, and `seed_missing_students` exist
and can be adapted.

### 23.1 Scenario mix (model the real product, not a synthetic average)

| Scenario | Share of VUs | Actions |
|---|---|---|
| **Browsers** | 55% | login → dashboard → problem list → problem detail → idle with the 60 s TopBar poll |
| **Practisers** | 25% | the above → open a problem → 3–5 **Run** calls → 1 **Submit** |
| **Discussers** | 10% | login → open Discuss → hold the page (5 s + 10 s pollers) for the whole test |
| **Contest takers** | 8% | start contest → fetch problems → 2–4 submits within the session window |
| **Staff/HOD** | 2% | login → staff dashboard → student analytics → **generate a PDF report** |

### 23.2 Load steps

| Step | Concurrent VUs | Duration | Purpose |
|---|---|---|---|
| Smoke | 5 | 5 min | Correctness of the script and seed data |
| **100** | 100 | 20 min | Baseline; establish p50/p95 with no contention |
| **250** | 250 | 20 min | First contention point — expect Gunicorn saturation on the *current* stack |
| **500** | 500 | 30 min | Realistic busy-day load |
| **1,000** | 1,000 | 30 min | Target |
| **2,000** | 2,000 | 20 min | Headroom / find the breaking point |
| **Contest spike** | 300 VUs submitting within 120 s | 10 min | **The real failure mode.** Run this at every step |
| Soak | 500 | 4 h | Connection leaks, memory growth, dead-tuple bloat, leaked containers |

### 23.3 Test cases

| # | Test | What it exercises | Pass criterion |
|---|---|---|---|
| 1 | Login (`/api/csrf-token/` → `/api/auth/lookup/` → `/api/auth/login/`) | Auth path, session creation, rate limiter | p95 < 500 ms; no false 429s for distinct users |
| 2 | Dashboard (`GET /api/dashboard/`) | The campus-rank aggregate (§19 #6) | p95 < 800 ms |
| 3 | Problem list (`GET /api/problems/`) | Unpaginated serialisation + payload size (§19 #9) | p95 < 600 ms; response < 500 KB |
| 4 | Problem detail | Detail serialiser + progress map | p95 < 300 ms |
| 5 | **Run** (`POST /api/run/`, no submit) | Single execution, per-language | p95 < 5 s (Python/Node), < 12 s (Java/C++) |
| 6 | **Submit** (`POST /api/run/` with `is_submit=true`) | **N sequential executions** — the core bottleneck | p95 < 15 s after batching |
| 7 | Contest submit | Auth + session-expiry checks + full test-case run + scoring | p95 < 20 s |
| 8 | Compilation-heavy submit (Java, C++) | Compiler cost per container | Measure separately — do not average with Python |
| 9 | Discussion poll (5 s) | The DELETE-on-read path (§19 #7) | p95 < 200 ms; no lock waits in `pg_stat_activity` |
| 10 | Notification poll (60 s, all users) | Baseline background load | p95 < 150 ms |
| 11 | Concurrent execution burst | 300 submits in 120 s | Zero 5xx; queue drains within the session window |
| 12 | PDF report generation | ReportLab + remote logo fetch | p95 < 10 s; must not starve the API tier |
| 13 | File upload (institution) | Multipart → S3 | p95 < 3 s for a 5 MB file |
| 14 | JA bulk import (500-row `.xlsx`) | In-request spreadsheet parsing | Completes without a worker timeout |
| 15 | **Abuse simulation** | Infinite loop, memory bomb, fork bomb, 100 MB stdout | Every container is killed and reaped; the host stays healthy; other users' p95 is unaffected |

### 23.4 Metrics to capture

**Client side:** p50 / p95 / p99 / max latency per scenario; requests/sec; error rate by HTTP status
(separate 4xx from 5xx, and 502/504 from 500); throughput of completed submits per minute.

**API tier:** ECS task CPU and memory; Gunicorn active workers and request queue depth; ALB
`RequestCountPerTarget`, `TargetResponseTime`, `HTTPCode_ELB_5XX_Count`, `RejectedConnectionCount`;
task count over time (does autoscaling keep up?).

**Database:** CPU; active and idle connections; `pg_stat_statements` top 20 by total time; lock waits;
dead-tuple ratio and autovacuum activity; write IOPS (watch `django_session` specifically); replica lag if
replicas exist; free storage.

**Cache:** hit ratio; evictions; CPU; connection count.

**Queue:** `ApproximateNumberOfMessagesVisible` (depth), age of the oldest message, DLQ count,
consumer throughput.

**Execution fleet:** container **start latency** (the number that decides §17); execution duration by
language; concurrent container count; fleet CPU and memory; **leaked container count** (must be zero);
Spot interruption rate; task/job failure rate.

**Network:** bytes in/out; NAT Gateway processed bytes; cross-AZ transfer.

### 23.5 Expected results on the **current** architecture (a baseline to beat)

**[INFERRED from §10.2 — verify by measurement]**

| Step | Prediction |
|---|---|
| 100 VUs, browse-only | Passes comfortably |
| 250 VUs, browse-only | Passes; the dashboard aggregate begins to show in p95 |
| 250 VUs with the practise mix | **Degrades** — submits occupy Gunicorn workers; polling latency climbs |
| 500 VUs | **Fails** — 12 workers exhausted; widespread 502/504 |
| Contest spike (300 in 120 s) | **Fails at any step** — the sequential-execution bottleneck (§19 #1) |
| Abuse simulation | **Fails** — leaked containers persist and degrade the host (§19 #4) |

Running these first on the current stack is worthwhile: it produces the before/after evidence that justifies
the AWS spend and the application changes.

---

## 24. EVIDENCE CLASSIFICATION SUMMARY

### 24.1 VERIFIED FROM CODE

- Django 5.1.4 + DRF 3.15.2, PostgreSQL only; React 18.3.1 + Vite 5.4.11 + Monaco 0.44.0.
- 38 models, 137 APIView classes, 138 URL routes, 61 migrations, 32 management commands, 46 React components.
- **No WebSockets, no SSE, no GraphQL, no gRPC** anywhere in the repository.
- **No cache tier, no message queue, no async worker at runtime.** Celery code exists; `celery` is not
  installed.
- Gunicorn **12 sync workers**, `--timeout 120`, `--max-requests 1000`.
- Executor: uvicorn **4 workers** × `ThreadPoolExecutor(40)` ⇒ up to **160 concurrent `docker run`**.
- Sandbox limits: `--network none`, `--memory 256m`, `--memory-swap 256m`, `--pids-limit 64`,
  `--security-opt no-new-privileges`, wall timeout 15 s.
- `--cpus` receives `CPU_TIME_LIMIT` (default 10) — a CPU **count**, not a time budget.
- Timed-out containers are **not** killed (`main.py:171-186`).
- Executor uses the **host Docker CLI** (`docker-ce-cli` installed in the image; `subprocess` invocation).
- 5 executable languages (Python, Node, Java, C, C++); the frontend also offers **SQL, which cannot execute**.
- A submit runs **one container per test case, sequentially**, with 3 retries × 30 s each.
- `SESSION_SAVE_EVERY_REQUEST = True` with the DB session backend; 30-day cookie.
- `CONN_MAX_AGE` unset; **no `CACHES`**; **no `DATABASE_ROUTERS`**; **no explicit DB indexes**.
- Per-institution databases are created and migrated but **never queried**.
- `MEDIA_URL` is routed only under `if settings.DEBUG` ⇒ **uploads 404 in production**; WhiteNoise is
  installed but **not in `MIDDLEWARE`** ⇒ **static 404s in production**.
- Client polling: Discuss 5 s + 10 s, TopBar 60 s, HOD 30 s.
- In-progress code is stored **only** in the browser's `localStorage`.
- **No per-user workspace, container, VM, or process exists.**
- 38 views are `AllowAny` or have no permission class, including institution create/**delete**, global
  maintenance, executor submit, and a hard-coded-token database diagnostic.
- The password-reset token is `reset_<user_id>_<timestamp>`, unsigned and unverified on completion.
- Rate limiting exists **only** on auth/lookup, in a per-process dict.
- CI runs `manage.py check --deploy … || true` and **runs no tests**; CD builds **on the production host**.
- The production compose file lives **outside this repository**.
- `advanced_filters.py` is unwired (frontend 404s); `LabSubmitView` always 500s due to a signature mismatch.
- An external **MySQL** database (`collegeadmissiondb`) is the authoritative student roster, synced each deploy.

### 24.2 INFERRED

- The live executor is the custom FastAPI service (the only tracked implementation answering
  `POST /submissions`), with the Piston steps in CI now no-ops. *Confidence: medium-high — must be confirmed.*
- `/var/run/docker.sock` is bind-mounted into the executor. *Confidence: high — `docker run` cannot work
  otherwise.*
- Backend memory ≈ 250–400 MB per worker (pandas + Pillow + ReportLab imported at module scope) ⇒ 3–5 GB for
  12 workers.
- Sandbox images are large: C/C++ ≈ 2–4 GB (Boost + CGAL), Python ≈ 1–2 GB.
- Cold-start times: Python/Node ≈ 0.4–1.5 s, C/C++ ≈ 1.5–5 s, Java ≈ 3–8 s.
- The frontend bundle is 3–6 MB uncompressed / 1–2 MB gzipped (Monaco-dominated).
- The current stack supports roughly 150–300 concurrent browsing users and **collapses at ~15–25 concurrent
  submits**.
- Usage is heavily bursty and timetable-driven, not diurnally smooth.
- Media storage is single-digit MB; the database is the real storage cost.

### 24.3 UNKNOWN — REQUIRES MEASUREMENT

Every item below has a command in §18.10.

| # | Unknown | Why it matters |
|---|---|---|
| 1 | **Which executor is actually running** | Changes the isolation model and the entire §17 decision |
| 2 | Registered users / DAU / peak concurrent | The base multiplier for every other number |
| 3 | **Average test cases per problem** | Multiplies container count per submit — the single biggest cost lever |
| 4 | Executions per day and per peak minute | Directly sizes the execution fleet |
| 5 | **Language mix** | Java/C++ cost 3–8× Python per execution |
| 6 | Real per-language execution latency | Decides whether Fargate-per-execution is viable at all |
| 7 | Current database size and growth rate | Sizes RDS storage and IOPS |
| 8 | Reads/sec and writes/sec | Sizes the RDS instance class |
| 9 | API requests/sec, average and peak | Sizes the API tier and ALB LCUs |
| 10 | Monthly egress | CloudFront/ALB data-transfer cost |
| 11 | Log volume per day | CloudWatch ingestion cost |
| 12 | Host vCPU/RAM and current utilisation | The reference point for right-sizing |
| 13 | Frontend bundle size | First-load egress and cache strategy |
| 14 | Sandbox image sizes | ECR storage and pull time |
| 15 | Run:Submit ratio | Separates cheap single executions from expensive N-way fan-outs |
| 16 | Whether arm64 sandbox images build correctly | Gates the Graviton cost saving |
| 17 | PostgreSQL major version | Gates the RDS engine choice and migration method |
| 18 | Contest schedule and cohort sizes | Defines the peak the architecture must absorb |

---

## 25. FINAL SUMMARY

## PROJECT DEPLOYMENT PROFILE

### Application
**Code2Day / RAMCOAD** — a campus placement-readiness platform for an engineering college. LeetCode-style
coding practice with a Monaco browser IDE and automated test-case grading; timed programming and aptitude
contests with per-student session windows and HOD approval workflow; lab assignments (three generations of
model); a 24-workbook aptitude question bank; progress analytics, achievements and campus ranking; role-scoped
discussion channels; and branded PDF reporting. Seven roles: student, staff, HOD, TPU, director, junior admin,
system admin. Institution-scoped multi-tenancy on a single shared database.

### Stack
React 18 + Vite 5 + Monaco (static SPA) → nginx → Django 5.1 + DRF 3.15 on Gunicorn (12 sync workers) →
PostgreSQL (host-installed) + a custom FastAPI Judge0-compatible executor that spawns Docker containers on the
host daemon. No cache, no queue, no async worker, no WebSocket.

### Architecture
Three containers (frontend, backend, executor) on **one VM**, fronted by host nginx with Let's Encrypt TLS,
with PostgreSQL on the host and the Docker daemon doubling as the sandbox runtime. Monolithic Django app
(`views.py` is 11,092 lines). All execution is synchronous and in-request.

### Database
PostgreSQL, ~40 tables, 61 migrations, **zero explicit indexes**, no connection pooling, DB-backed sessions
rewritten on every request. Multi-tenancy is by `institution` FK; the per-institution physical databases that
the code creates are never used. Fastest-growing tables are `ExecutionRecord`, `ProblemSolution`, and
`ContestSubmission` — all storing full source code as unbounded TEXT with **no retention policy**.

### Storage
No per-user file storage. Only institution logos and admin-uploaded files, on a host-local Docker volume —
and **currently unreachable in production** because `MEDIA_URL` is only routed under `DEBUG`. Collected static
is likewise unserved (WhiteNoise installed but not enabled). User code lives in the database, not in files.
Object storage (S3) is a clean fit; EFS is unnecessary.

### Code execution
Docker-out-of-Docker. One throwaway container **per test case**, run sequentially inside the HTTP request.
Five languages (Python 3.11, Node 20, Java 17, C, C++17); SQL is offered by the UI but cannot execute.
Good controls: `--network none`, 256 MB, `--pids-limit 64`, `no-new-privileges`. Bad controls: runs as root
with full default capabilities, `--cpus` mistakenly set to **10**, timed-out containers never killed, the API
in front of it is unauthenticated, and the executor holds the host Docker socket.

### Authentication
Custom, session-cookie based. Identifier lookup (register number / faculty ID) → first-login password set →
Django session (`HttpOnly`, `Secure`, `SameSite=Lax`, 30 days). Role resolution via `UnifiedAuthMixin`. No
OAuth, no SSO, no MFA, no email delivery — **password reset returns the token in the HTTP response**, and that
token is forgeable.

### Networking
Public: 443 only. `/api` and `/admin` → backend:8000; `/` → frontend:8001. Internal Docker bridge network to
the executor (unauthenticated). PostgreSQL over `host.docker.internal`. Outbound needed for the campus MySQL
sync, the institution-logo fetch, and image builds. **The sandboxes have no network at all — preserve that.**

### External services
Campus **MySQL** (`collegeadmissiondb`) — the authoritative student roster, synced on every deploy — plus a
faculty MySQL for ad-hoc imports, Let's Encrypt, arbitrary logo URLs, and build-time registries. No LLM, no
OAuth provider, no email, no SMS, no payments, no analytics, no error tracking.

### Current deployment
Single VM; GitHub Actions with a **self-hosted runner on the production host**; images built on prod; no
registry, no tagging, no rollback, no zero-downtime; migrations run twice per deploy with no backup;
CI cannot fail on backend errors; the authoritative compose file is not in the repository.

### Security concerns
Unauthenticated **institution create/DROP DATABASE**; unauthenticated **arbitrary code execution**; a
**forgeable password-reset token** enabling account takeover; a **hard-coded, committed diagnostic token**
exposing database topology; unauthenticated system-admin dashboards and a one-request **global maintenance
kill switch**; the executor's **Docker socket** (root-equivalent); no rate limiting on expensive endpoints;
a per-process rate limiter; sandbox containers as root; SSRF via `logo_url`; missing
`SECURE_PROXY_SSL_HEADER`; insecure `DEBUG`/`SECRET_KEY` defaults. **Full detail and remediation order in
§20 — the S1 items must be fixed before any internet exposure, on AWS or anywhere else.**

### Scaling concerns
Twelve sync workers is a hard ceiling of 12 in-flight requests. A submit occupies one worker for N sequential
container executions with up to 93 s of retry per test case. Sessions write to PostgreSQL on every request
while the client polls every 5 seconds. The dashboard ranks the entire cohort in Python on every load. There
are no indexes, no pagination, no cache, no queue, and no admission control. Timed-out containers leak
forever.

---

## 1,000 USER CAPACITY MODEL

| Metric | Value | Basis |
|---|---|---|
| **Registered users** | **1,000** (target) — actual **UNKNOWN** | Business target from the brief; measure with `SELECT count(*) FROM student_profiles;` |
| **Expected DAU** | **UNKNOWN — requires measurement.** **[INFERRED]** 25–40% on a normal day (250–400), spiking to **80–95%** on a contest or lab day | Academic platforms are timetable-driven, not habit-driven; measure from `last_login_on` |
| **Peak concurrent users** | **UNKNOWN — requires measurement.** **[INFERRED]** 150–300 typical; **500–900 during a scheduled contest** | A contest assigns whole batches simultaneously (`Contest.assigned_batches`) |
| **Concurrent workspaces** | **0 — the concept does not exist** | **[VERIFIED §11]** No per-user containers, VMs, or processes. Editor state is client-side. **Enter 0 in any cost template** |
| **Concurrent executions (typical)** | **UNKNOWN — requires measurement.** **[INFERRED]** 5–20 containers | From the practise mix at typical concurrency |
| **Concurrent executions (contest peak)** | **[INFERRED] 100–600 containers**, depending entirely on the test-case count | 300 students × 1 submit each within ~2 min × N test cases each |
| **Average execution duration** | **UNKNOWN — requires measurement.** **[INFERRED]** 0.4–1.5 s Python/Node; 1.5–5 s C/C++; 3–8 s Java. **Hard cap 15 s [VERIFIED]** | Cold-start plus compile; measure per language |
| **Peak execution rate** | **UNKNOWN — requires measurement.** **[INFERRED]** 150–3,000 container starts/minute at contest peak | = submits/min × avg test cases; **per-submission batching cuts this by roughly N×** |
| **Executions per DAU per day** | **UNKNOWN — requires measurement** | `execution_records` count ÷ distinct students per day |
| **Memory per execution** | **256 MB [VERIFIED]** | `MEMORY_LIMIT_MB` |
| **vCPU per execution** | **1 vCPU planned** (currently mis-granted as 10) **[VERIFIED bug]** | Fix `--cpus` before sizing |
| **Idle compute per user** | **≈ 0 [VERIFIED]** | No standing per-user compute; one `django_session` row |
| **Capacity of the current stack** | **[INFERRED] ~150–300 concurrent browsers; fails at ~15–25 concurrent submits** | 12 Gunicorn workers ÷ submit duration (§10.2) |

> **The decisive unknown is the average test-case count per problem.** It multiplies container starts,
> submit latency, and execution cost simultaneously. One SQL query resolves it (§18.10) and it should be the
> first number obtained.

---

## AWS RECOMMENDATION

### 1. RECOMMENDED — "Managed core, isolated execution fleet"

CloudFront + WAF + S3 (SPA) → ALB → **ECS Fargate** API (2+ tasks, autoscaled) → **RDS PostgreSQL Multi-AZ**
+ **ElastiCache Redis** + **S3** uploads; **SQS** for submissions and background work; a Fargate
**dispatcher** and **worker**; and a dedicated **ECS-on-EC2 Graviton execution fleet** (Spot + on-demand
baseline, gVisor, no network, no NAT, IMDSv2 hop-limit 1). Full topology in §21.

**Why:** it fixes the five structural defects at once — the 12-worker ceiling (Fargate + threads + SQS), the
session write amplification (ElastiCache), the host-local media volume (S3), the Docker socket (dispatcher +
isolated fleet), and the absence of admission control (SQS + WAF) — while keeping the container-shaped
codebase almost intact. Warm images preserve the 0.3–2 s start latency the UX depends on, which
Fargate-per-execution cannot match. Graviton plus Spot makes execution — the dominant variable cost — as cheap
as it can safely be. Multi-AZ everywhere removes the current single-VM SPOF.

**Trade-off:** it requires the application changes in §21.3, and you own AMI patching for the execution fleet.

### 2. LOWER-COST — "Consolidated, single-AZ, minimal managed services"

CloudFront + S3 (SPA) → ALB → **one ECS-on-EC2 cluster** hosting the API, the dispatcher, and the execution
containers on the same Graviton instances; **RDS single-AZ** (`db.t4g`); **no ElastiCache** initially (keep DB
sessions but set `SESSION_SAVE_EVERY_REQUEST = False`); **no SQS** (keep synchronous submits, but with
per-submission batching); a single NAT Gateway; short log retention.

**Why:** roughly the shape of today's deployment with managed data, TLS, and a CDN. Cheapest AWS footprint
that is still an improvement.

**Trade-offs:** single-AZ RDS means a maintenance window is an outage; co-locating execution with the API
means a runaway submission degrades the API (exactly today's failure mode); without SQS the contest spike
still breaks. **Acceptable only if the real peak turns out to be well under 500 concurrent users and contests
are small.** The §20 S1 fixes are still mandatory — they are free.

### 3. HIGHER-SCALE — "Multi-institution SaaS"

Multi-region CloudFront; **Aurora PostgreSQL** with reader endpoints (after the code supports read routing) or
Aurora Serverless v2 for the bursty academic profile; ElastiCache cluster mode; SQS with per-tenant queues and
fair scheduling; **EKS with Karpenter** and a gVisor/Kata RuntimeClass for execution, or Firecracker on
bare metal if per-execution isolation must be provable to an auditor; ECS/EKS API tier across 3 AZs; DynamoDB
for sessions and rate limits; OpenSearch for logs; Cognito or a SAML IdP federation once real SSO is required;
per-tenant cost allocation tags.

**Why:** the only shape that survives many institutions, contractual isolation requirements, and
tens of thousands of students.

**Trade-off:** substantially higher fixed cost (EKS control planes, Aurora minimums, OpenSearch) and a
platform team. **Not justified for a single college** — the current codebase's tenant model (a single database
with FK scoping and unused per-tenant databases) would have to be reworked first anyway.

---

## COST MODEL INPUTS — MACHINE-READABLE TABLE

`status`: `VERIFIED` = read from code · `INFERRED` = reasoned estimate · `UNKNOWN` = must be measured
(recipe in §18.10) · `TARGET` = from the business brief.

| key | value | unit | status | source_or_method |
|---|---|---|---|---|
| users.registered.target | 1000 | users | TARGET | audit brief |
| users.registered.actual | null | users | UNKNOWN | `SELECT count(*) FROM student_profiles;` |
| users.staff.actual | null | users | UNKNOWN | `SELECT count(*) FROM staff_profiles;` |
| users.dau.ratio_normal_day | 0.25–0.40 | ratio | INFERRED | measure `last_login_on` |
| users.dau.ratio_contest_day | 0.80–0.95 | ratio | INFERRED | contests assign whole batches |
| users.peak_concurrent.normal | 150–300 | users | INFERRED | nginx access log |
| users.peak_concurrent.contest | 500–900 | users | INFERRED | nginx access log on a contest day |
| workspaces.concurrent | 0 | workspaces | VERIFIED | §11 — no per-user compute exists |
| workspaces.idle_percentage | n/a | % | VERIFIED | concept does not apply |
| api.requests_per_sec.avg | null | req/s | UNKNOWN | nginx logs |
| api.requests_per_sec.peak | null | req/s | UNKNOWN | nginx logs |
| api.polling.per_user_idle | 1 | req/min | VERIFIED | TopBar 60 s poll |
| api.polling.per_user_discuss | 18 | req/min | VERIFIED | 5 s + 10 s pollers |
| api.gunicorn_workers | 12 | workers | VERIFIED | backend/docker-compose.yml:15 |
| api.max_inflight_requests | 12 | requests | VERIFIED | sync worker class |
| api.request_timeout | 120 | seconds | VERIFIED | gunicorn + nginx |
| api.memory_per_worker | 250–400 | MB | INFERRED | `docker stats` to confirm |
| api.memory_total | 3–5 | GB | INFERRED | 12 × per-worker |
| api.vcpu_estimate | 2–4 | vCPU | INFERRED | `docker stats` to confirm |
| websocket.concurrent_connections | 0 | connections | VERIFIED | feature does not exist |
| exec.languages_supported | 5 | languages | VERIFIED | main.py:41-52 |
| exec.containers_per_submit | = test_case_count | containers | VERIFIED | views.py:496 (sequential) |
| exec.test_cases_per_problem.avg | null | count | UNKNOWN | **highest-priority query** — §18.10 |
| exec.executions_per_day | null | count | UNKNOWN | `execution_records` daily histogram |
| exec.container_starts_per_day | null | count | UNKNOWN | executions × test cases |
| exec.peak_per_minute | null | count/min | UNKNOWN | hourly histogram, contest day |
| exec.peak_concurrent_containers.inferred | 100–600 | containers | INFERRED | 300 submits/2 min × N |
| exec.duration.python_node | 0.4–1.5 | seconds | INFERRED | measure per §18.10 |
| exec.duration.c_cpp | 1.5–5 | seconds | INFERRED | measure per §18.10 |
| exec.duration.java | 3–8 | seconds | INFERRED | measure per §18.10 |
| exec.duration.wall_limit | 15 | seconds | VERIFIED | WALL_TIME_LIMIT |
| exec.memory_per_container | 256 | MB | VERIFIED | MEMORY_LIMIT_MB |
| exec.vcpu_per_container.configured | 10 | vCPU | VERIFIED | **bug** — `--cpus` receives CPU_TIME_LIMIT |
| exec.vcpu_per_container.planned | 1 | vCPU | INFERRED | post-fix sizing assumption |
| exec.max_concurrency.configured | 160 | executions | VERIFIED | 4 uvicorn × 40 threads |
| exec.language_mix | null | % by language | UNKNOWN | `GROUP BY language` — Java/C++ cost 3–8× Python |
| exec.run_to_submit_ratio | null | ratio | UNKNOWN | execution_records vs problem_solutions |
| exec.network_access | none | — | VERIFIED | `--network none` |
| exec.image_size.python | null | GB | UNKNOWN | `docker images` — INFERRED 1–2 GB |
| exec.image_size.c_cpp | null | GB | UNKNOWN | `docker images` — INFERRED 2–4 GB |
| storage.s3_per_user | 0 | GB | VERIFIED | no per-user file storage |
| storage.media_total | null | MB | UNKNOWN | INFERRED single-digit MB |
| storage.static_site | null | MB | UNKNOWN | `du -sh frontend/dist`; INFERRED 5–20 MB |
| storage.db_size | null | GB | UNKNOWN | `pg_database_size()` |
| storage.db_growth_per_month | null | GB/mo | UNKNOWN | executions/mo × row size; **no retention policy** |
| storage.row_size.execution_record | 2–25 | KB | VERIFIED | source_code ≤20 KB + stdin ≤10 KB + outputs |
| storage.retention_policy | none | — | VERIFIED | no TTL/archival on any table |
| db.engine | PostgreSQL | — | VERIFIED | settings.py:100 |
| db.version | null | version | UNKNOWN | `SELECT version();` |
| db.tables | ~40 | tables | VERIFIED | 38 models + Django + 3 M2M |
| db.explicit_indexes | 0 | indexes | VERIFIED | no db_index / Meta.indexes |
| db.connection_pooling | none | — | VERIFIED | CONN_MAX_AGE unset |
| db.max_concurrent_connections | 12 | connections | VERIFIED | one per Gunicorn worker |
| db.session_writes_per_request | 1 | writes | VERIFIED | SESSION_SAVE_EVERY_REQUEST |
| db.reads_per_sec | null | ops/s | UNKNOWN | pg_stat_database deltas |
| db.writes_per_sec | null | ops/s | UNKNOWN | pg_stat_database deltas |
| db.read_replica_ready | false | boolean | VERIFIED | no DATABASE_ROUTERS |
| cache.exists | false | boolean | VERIFIED | no CACHES setting |
| queue.exists | false | boolean | VERIFIED | celery not installed |
| network.ingress_per_month | null | GB | UNKNOWN | nginx logs |
| network.egress_per_month | null | GB | UNKNOWN | nginx logs; Monaco + PDFs dominate |
| network.frontend_bundle_size | null | MB | UNKNOWN | INFERRED 3–6 MB raw / 1–2 MB gzip |
| network.nat_gateway_gb | null | GB | UNKNOWN | minimise via VPC endpoints |
| logs.gb_per_day | null | GB/day | UNKNOWN | `du -sh` on Docker json logs |
| logs.retention_current | unbounded | — | VERIFIED | max-size 100M, no max-file |
| deploy.environments | 1 | count | VERIFIED | production only; no staging |
| deploy.availability_zones | 1 | count | VERIFIED | single VM |
| deploy.rollback_capability | none | — | VERIFIED | no image tagging or registry |
| external.mysql_sync_required | true | boolean | VERIFIED | import_students on every deploy |
| external.mysql_frequency | per deploy | — | VERIFIED | .github/workflows/deploy.yml:167 |
| security.unauthenticated_critical_endpoints | 5+ | count | VERIFIED | §20 S1-A, S1-B, S2-A, S2-B |
| security.execution_rate_limit | none | — | VERIFIED | **execution cost is currently unbounded** |

> **Two warnings for whoever builds the cost model from this table.**
>
> 1. **Do not price execution until `exec.test_cases_per_problem.avg` and `exec.language_mix` are measured.**
>    Those two numbers can swing execution compute by an order of magnitude, and execution is the dominant
>    variable cost.
> 2. **Do not price anything until `security.execution_rate_limit` is fixed.** With an unauthenticated,
>    unthrottled execution endpoint granting 10 vCPUs per call, the AWS bill is attacker-controlled and no
>    forecast is meaningful.

---

*End of PROJECT_DEPLOYMENT_PROFILE.md — generated from git HEAD `26fbc88`. No application source was modified.*
