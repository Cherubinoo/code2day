# RAMCOAD — Placement Readiness & Assessment Platform

> An end-to-end, institution-grade platform for student placement preparation: coding contests, aptitude testing, progress analytics, mentorship, and structured learning — all under one roof.
>
> **Live:** [code2day.ramcoad.com](https://code2day.ramcoad.com)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Key Features](#2-key-features)
3. [Tech Stack](#3-tech-stack)
4. [System Architecture](#4-system-architecture)
5. [User Roles & Permissions](#5-user-roles--permissions)
6. [Database Structure](#6-database-structure)
7. [API Reference Overview](#7-api-reference-overview)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Core Workflows](#9-core-workflows)
   - [Student Onboarding](#91-student-onboarding)
   - [Contest Lifecycle](#92-contest-lifecycle)
   - [Code Execution Pipeline](#93-code-execution-pipeline)
   - [Aptitude Assessment Flow](#94-aptitude-assessment-flow)
   - [Mentor & Advisor Assignment](#95-mentor--advisor-assignment)
   - [Analytics & Reporting](#96-analytics--reporting)
   - [Company Tracking](#97-company-tracking)
   - [Discussion System](#98-discussion-system)
10. [Setup & Installation](#10-setup--installation)
    - [Prerequisites](#101-prerequisites)
    - [Development Setup](#102-development-setup)
    - [Production Deployment](#103-production-deployment)
11. [Environment Variables](#11-environment-variables)
12. [Deployment Scripts](#12-deployment-scripts)
13. [Screenshots](#13-screenshots)
14. [Security Notes](#14-security-notes)
15. [Contributing](#15-contributing)

---

## 1. Project Overview

RAMCOAD is a full-stack web application built to support college students preparing for campus placements. It provides a structured environment where students practice coding problems, take timed aptitude assessments, participate in faculty-created contests, track their progress over time, and interact with mentors and class advisors.

The platform is **multi-tenant**: each institution (college) operates in its own isolated data space while sharing the same deployment. A hierarchy of roles — from System Admin down to Student — governs what each user can see and do.

**Who it is for:**
- **Students** — practice problems, take contests, track performance, interact with mentors
- **Staff / Faculty** — create contests, monitor student performance, manage discussions
- **HOD** — approve contests before they go live, view department-wide analytics
- **Junior Admin (JA)** — manage student records, batch/section assignments, mentor pairings
- **TPU / Director / Admin** — institution-wide oversight and reporting

---

## 2. Key Features

### Coding Engine
- Curated problem bank with Easy / Medium / Hard difficulty levels
- Multi-language support (C, C++, Java, Python, JavaScript, SQL, and more)
- Monaco editor (same engine as VS Code) with syntax highlighting
- Real-time code execution via Code2Day Custom Code Executor (`code-executor`)
- Per-problem time tracking (session-based)
- Solved / unsolved state with full submission history

### Contest System
- Staff create and publish programming or aptitude contests
- Approval workflow: Staff → HOD approval → Published
- Session-based contest timer (auto-submits on expiry)
- Per-student contest participation records with session management
- Winner allocation after contest ends
- Detailed analytics: pass rates, average score, top performers

### Aptitude Module
- Hierarchical topic tree (Category → Subtopic)
- Multiple-choice questions linked to topics
- Study mode (practice questions individually with instant feedback)
- Aptitude contests (timed, in-contest format)
- Per-topic accuracy tracking over time

### Progress & Analytics
- Student dashboard: streak, login days, campus rank, solved count
- Score history line chart across all contest attempts
- Topic accuracy radar/spider chart (filterable by category, mode toggle)
- Company-tagged problem tracking
- Difficulty breakdown (Easy / Medium / Hard)
- PDF report generation for students, staff, and contests
- Staff view of any individual student's detailed analytics

### Mentorship & Advising
- JA assigns staff as mentors to individual students
- JA assigns staff as class advisors to batch/section groups
- Staff sees dedicated "My Mentees" and "My Class" dashboards with view-progress buttons
- Students can view their assigned mentor and class advisor

### Gamification
- Achievement badges (coding, aptitude, contest, streak categories)
- Campus leaderboard (daily and all-time)
- Streak system and login-day tracking
- Trophy milestones (e.g., "Solved 50 problems", "7-day streak")

### Discussion & Communication
- 8 thread types: General, Batch, Section, Mentor, Staff, HOD, Direct, Problem-specific
- Embedded polls within discussion messages
- System-wide announcements
- Per-user notification system

### Administration
- Multi-tenant institution management (branding, logos, custom domains)
- Bulk student import via Excel/CSV
- Single-student quick-add form
- Batch and section reassignment tools
- Department management
- Global maintenance mode toggle
- Institution-level file management (PDFs, resources)

---

## 3. Tech Stack

### Backend

| Layer | Technology |
|---|---|
| Framework | Django 5.1.4 |
| API | Django REST Framework 3.15.2 |
| Database | PostgreSQL (production), SQLite (development) |
| Auth | Django session-based authentication |
| CORS | django-cors-headers |
| Task Queue | Celery + Redis |
| Code Execution Engine | Code2Day Custom Executor (`code-executor` FastAPI + Docker) |
| PDF Generation | ReportLab 4.0.7 |
| Data Processing | pandas 2.2.3, openpyxl 3.1.5 |
| Image Handling | Pillow 10.4.0 |
| Server | Gunicorn + Whitenoise |

### Frontend

| Layer | Technology |
|---|---|
| Framework | React 18.3.1 |
| Build Tool | Vite 5.4.11 |
| Code Editor | Monaco Editor 0.44.0 |
| Icons | Lucide React |
| Charts | Custom SVG (no external chart library) |
| Styling | Plain CSS (no UI framework) |

### Infrastructure & Deployment

| Layer | Technology |
|---|---|
| PaaS & Deployment Manager | Dokploy Platform |
| Containerization | Docker + Docker Compose (`code2day-frontend`, `code2day-backend`, `code-executor`) |
| Container Networks | `dokploy-network`, `code2day-shared` (external bridges) |
| Reverse Proxy | Nginx (SSL termination, static delivery, `/api/*` proxy) |
| CI/CD & Auto-Deploy | GitHub Webhooks + Dokploy Auto-Deployment Pipeline |
| Code Sandbox Microservice | Code2Day Custom Code Executor (`code-executor` - FastAPI + Docker) |
| Cache / Message Broker | Redis |

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Dokploy PaaS Engine                           │
│     • GitHub Webhook Auto-Deployment                                    │
│     • Container Lifecycle & Monitoring                                 │
│     • dokploy-network & code2day-shared docker networks                 │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│                        Browser / Client                                 │
│                React 18 SPA (Vite Production Build)                     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTPS
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Nginx Reverse Proxy Server                         │
│   • SSL / TLS Termination                                               │
│   • Static Asset Delivery (React SPA frontend:8001)                      │
│   • /api/* → Backend Gunicorn Application                               │
└──────────────┬────────────────────────────────────────┬─────────────────┘
               │                                        │
               ▼                                        ▼
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│   Django DRF Backend        │        │  Code2Day Custom Code Executor   │
│   • Session Auth + CSRF     │        │  • FastAPI Microservice          │
│   • Role-Based Access       │◄──────►│  • Isolated Docker Containers    │
│   • PDF Report Generator    │        │  • cgroup v2 & Quota Limits      │
│   • Celery Async Worker     │        └──────────────────────────────────┘
└──────────────┬──────────────┘
               │
         ┌─────┴────────┐
         │              │
         ▼              ▼
┌────────────────┐ ┌─────────┐
│   PostgreSQL   │ │  Redis  │
│  (Database)    │ │ (Cache/ │
│                │ │ Broker) │
└────────────────┘ └─────────┘
```

### Request & Deployment Flow

1. **Auto-Deployment Flow**:
   - Commits pushed to GitHub trigger Dokploy webhooks.
   - Dokploy pulls updates, builds production Docker images (`code2day-frontend`, `code2day-backend`), and deploys container instances over `dokploy-network` and `code2day-shared` networks without interrupting background microservices like `code-executor`.

2. **Application Request Flow**:
   - Web requests reach Nginx reverse proxy over HTTPS.
   - Front-end assets (`/`) serve from `code2day-frontend` container.
   - API endpoints (`/api/*`) proxy to `code2day-backend` Django service.
   - For code execution, Django dispatches jobs to `code-executor` custom sandbox container and returns structured verdict payloads.
   - Asynchronous jobs (PDF generation, contest winner calculations) execute via Celery workers with Redis.

### Multi-Tenancy

Every model that holds institution-specific data carries an `institution` foreign key. A custom Django middleware resolves the institution from the authenticated user on each request. Data queries are automatically scoped so that no institution can access another's records.

---

## 5. User Roles & Permissions

The platform has **8 distinct roles**. Each role gets a tailored dashboard and a specific set of permitted API endpoints.

| Role | Code | Description |
|---|---|---|
| **Student** | `student` | Primary end users. Practice problems, take contests, track progress. |
| **Staff / Faculty** | `staff` | Create and manage contests, view student analytics, lead discussions. |
| **Head of Department** | `hod` | Approve contests before publishing. Department-wide oversight. |
| **Training & Placement Unit** | `tpu` | Placement-focused analytics and reporting across batches. |
| **Director** | `director` | Institution-level oversight, all analytics, read access everywhere. |
| **Junior Admin** | `ja` | Manage student records, bulk import, batch/section/mentor assignment. |
| **System Admin** | `admin` | Full system access. Institution creation, global settings, user management. |

### Role Capability Matrix

| Capability | Student | Staff | HOD | TPU | Director | JA | Admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Solve problems | ✅ | — | — | — | — | — | — |
| Take contests | ✅ | — | — | — | — | — | — |
| View own progress | ✅ | — | — | — | — | — | — |
| Create contests | — | ✅ | — | — | — | — | ✅ |
| View student analytics | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve contests | — | — | ✅ | — | — | — | ✅ |
| Manage students (CRUD) | — | — | — | — | — | ✅ | ✅ |
| Bulk import students | — | — | — | — | — | ✅ | ✅ |
| Assign mentors | — | — | — | — | — | ✅ | ✅ |
| Assign class advisors | — | — | — | — | — | ✅ | ✅ |
| Create institutions | — | — | — | — | — | — | ✅ |
| Global maintenance mode | — | — | — | — | — | — | ✅ |
| Generate PDF reports | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Access Control Implementation

Role checks are enforced at the view layer via `UnifiedAuthMixin`. Each protected view calls `get_authenticated_profile(request)` which returns:
- The user's profile object (student or staff)
- The resolved role string (`"student"`, `"staff"`, `"hod"`, etc.)
- An error `Response` if authentication fails

Views that need a specific role check the returned role and return `403 Forbidden` if it does not match. Staff accounts that have been locked (deactivated by HOD) receive `403` on all requests.

---

## 6. Database Structure

> The full entity-relationship diagram and column-level schema will be added as a separate attachment. This section covers model groups, their purpose, and key relationships.

### Model Groups

#### Identity & Organisation

```
Institution
  ├── name, domain, logo, branding_colors
  ├── maintenance_mode, maintenance_message
  └── created_at

Department
  ├── institution → Institution
  ├── name, code
  └── head_of_department → StaffProfile (nullable)

StudentProfile
  ├── user → Django User (OneToOne)
  ├── institution → Institution
  ├── department → Department (nullable)
  ├── register_number  (unique student identifier)
  ├── name, batch, section
  ├── current_streak, login_days, campus_rank
  ├── tracked_companies  (JSON list of company names)
  ├── mentor → StaffProfile (nullable)
  └── password_is_set

StaffProfile
  ├── user → Django User (OneToOne)
  ├── institution → Institution
  ├── department → Department (nullable)
  ├── faculty_id  (unique staff identifier)
  ├── name, role
  ├── role: staff | hod | tpu | director | ja | admin
  └── is_active

BatchAdvisor
  ├── staff → StaffProfile
  ├── batch, section
  ├── department → Department
  └── institution → Institution
```

#### Problem & Learning

```
Problem
  ├── title, slug  (unique URL key)
  ├── difficulty: Easy | Medium | Hard
  ├── description, examples, hints, editorial
  ├── companies  (comma-separated company tags)
  ├── tags, topics
  ├── available_languages  (JSON)
  └── is_daily_problem

TestCase
  ├── problem → Problem
  ├── input, expected_output
  └── is_hidden

ProblemSession          (time tracking per sitting)
  ├── student → StudentProfile
  ├── problem → Problem
  ├── started_at, ended_at, time_spent_seconds
  └── is_active

SolvedProblem           (one record per student per problem — unique)
  ├── student → StudentProfile
  └── problem → Problem

ProblemSolution         (every submission attempt)
  ├── student → StudentProfile
  ├── problem → Problem
  ├── code, language, status
  ├── time_taken_ms, memory_used_kb
  └── submitted_at

DailyProblem
  ├── problem → Problem
  └── date
```

#### Aptitude

```
AptitudeTopic
  ├── title
  ├── parent → AptitudeTopic  (nullable — enables subtopics)
  └── order

AptitudeQuestion
  ├── topic → AptitudeTopic
  ├── question_text
  ├── option_a, option_b, option_c, option_d
  ├── correct_answer: a | b | c | d
  └── difficulty

SolvedAptitude
  ├── student → StudentProfile
  └── question → AptitudeQuestion
```

#### Contest

```
Contest
  ├── title, description
  ├── contest_type: programming | aptitude
  ├── status: draft | pending_approval | approved | published | ended
  ├── created_by → StaffProfile
  ├── department → Department
  ├── problems ↔ Problem  (ManyToMany — programming contests)
  ├── aptitude_questions ↔ AptitudeQuestion  (ManyToMany — aptitude contests)
  ├── duration_minutes, start_time, end_time
  └── approved_by → StaffProfile (nullable)

ContestParticipation
  ├── student → StudentProfile
  ├── contest → Contest
  ├── started_at, ended_at
  ├── problems_solved  (programming contests)
  ├── is_active  (True while session is live)
  └── is_winner

ContestSubmission       (programming contest code submissions)
  ├── contest → Contest
  ├── student → StudentProfile
  ├── problem → Problem
  ├── code, language, status
  └── submitted_at

AptitudeContestSubmission   (aptitude contest answers)
  ├── contest → Contest
  ├── student → StudentProfile
  ├── question → AptitudeQuestion
  ├── selected_answer
  └── is_correct
```

#### Engagement & Gamification

```
Achievement
  ├── name, description, category
  ├── criteria_type, criteria_value
  └── icon, color

UserAchievement
  ├── student → StudentProfile
  ├── achievement → Achievement
  └── earned_at

StudentActivity
  ├── student → StudentProfile
  ├── activity_type: login | solve | practice | contest
  └── date
```

#### Communication

```
DiscussionMessage
  ├── thread_type: general | batch | section | mentor | staff | hod | direct | problem
  ├── sender → User
  ├── content, is_poll
  ├── poll_options, poll_votes  (JSON)
  ├── institution → Institution
  └── created_at

Announcement
  ├── title, body
  ├── institution → Institution
  ├── created_by → StaffProfile
  └── created_at

Notification
  ├── recipient → User
  ├── message, is_read
  └── created_at
```

### Key Relationships at a Glance

```
Institution ──< Department ──< StudentProfile
                           ──< StaffProfile
                           ──< Contest

StudentProfile >── SolvedProblem >── Problem
StudentProfile >── ContestParticipation >── Contest
StudentProfile >── AptitudeContestSubmission >── AptitudeQuestion
StudentProfile ──> StaffProfile  (mentor, nullable)

Contest ──< ContestParticipation
Contest >──< Problem             (ManyToMany — programming)
Contest >──< AptitudeQuestion    (ManyToMany — aptitude)

AptitudeTopic ──< AptitudeTopic  (self-referential: category → subtopic)
AptitudeTopic ──< AptitudeQuestion
```

---

## 7. API Reference Overview

All routes are prefixed with `/api/`. Authentication uses Django's session cookie + CSRF token. Every mutating request (`POST`, `PUT`, `DELETE`, `PATCH`) must include the `X-CSRFToken` header.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/auth/lookup/` | Unified user lookup (student / staff / admin) |
| POST | `/api/auth/login/` | Student login |
| POST | `/api/auth/logout/` | Student logout |
| POST | `/api/auth/first-login/` | Set password on first login |
| POST | `/api/auth/password-reset/` | Reset forgotten password |
| GET | `/api/csrf-token/` | Fetch CSRF token |
| POST | `/api/auth/staff/login/` | Staff / faculty login |
| POST | `/api/auth/staff/logout/` | Staff logout |
| POST | `/api/auth/admin/login/` | Admin login |

### Student

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard/` | Full student dashboard |
| POST | `/api/dashboard/tracked-companies/` | Update tracked company list |
| GET | `/api/problems/` | Problem bank (with progress state per student) |
| GET | `/api/problems/<slug>/` | Problem detail |
| POST | `/api/problems/progress/` | Mark problem solved / unsolved |
| POST | `/api/problems/<slug>/session/start/` | Start a timed problem session |
| POST | `/api/problems/<slug>/session/end/` | End a problem session |
| GET | `/api/student/contests/` | Accessible contests for this student |
| GET | `/api/student/contests/<id>/` | Contest detail |
| POST | `/api/student/contests/<id>/start/` | Start contest session |
| POST | `/api/student/contests/<id>/stop/` | End contest session early |
| POST | `/api/student/contests/<id>/auto-submit/` | Auto-submit on timer expiry |
| GET | `/api/student/contests/<id>/session-status/` | Check if session is still active |
| POST | `/api/student/contests/<id>/aptitude/submit/` | Submit aptitude contest answers |
| POST | `/api/student/contests/<id>/lock/` | Trigger proctoring lock screen |
| POST | `/api/student/contests/<id>/unlock/` | Unlock contest via staff PIN authorization |
| POST | `/api/student/contests/<id>/snapshot/` | Upload proctoring webcam snapshot |
| GET | `/api/student/analytics/` | Own performance analytics |
| GET | `/api/student/mentor-advisor/` | Assigned mentor and class advisor |
| GET | `/api/aptitude/topics/` | Full aptitude topic tree |
| GET | `/api/aptitude/questions/` | Aptitude questions (filterable by topic) |
| POST | `/api/aptitude/questions/submit/` | Submit an aptitude answer (study mode) |
| GET | `/api/ranking/` | Campus leaderboard |
| GET | `/api/dashboard/daily/leaderboard/` | Daily leaderboard |
| POST | `/api/run/` | Execute a code snippet (practice mode) |
| GET | `/api/dashboard/tracked-companies/report/` | Download Tracked Companies PDF performance report |

### Staff

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/contests/` | List all contests (staff scope) |
| POST | `/api/contests/` | Create a new contest |
| GET / PUT / DELETE | `/api/contests/<id>/` | Contest detail / update / delete |
| POST | `/api/contests/<id>/submit-for-approval/` | Send contest to HOD for review |
| POST | `/api/contests/<id>/approve/` | HOD approves a contest |
| POST | `/api/contests/<id>/publish/` | Publish approved contest |
| GET | `/api/contests/<id>/analytics/` | Contest performance analytics |
| POST | `/api/contests/<id>/assign-batches/` | Assign contest to specific batches |
| GET | `/api/staff/mentor/dashboard/` | Mentees view (with progress) |
| GET | `/api/staff/advisor/dashboard/` | Class advisor view |
| GET | `/api/students/<reg_no>/analytics/` | Individual student analytics |
| GET | `/api/students/<reg_no>/report/` | Download Student Performance PDF report |
| GET | `/api/staff/<faculty_id>/report/` | Download Staff Performance PDF report |
| GET | `/api/batches/<batch_code>/report/` | Download Batch Performance PDF report |
| GET | `/api/contests/<id>/report/` | Download Contest Overview PDF report |
| GET | `/api/contests/<id>/students/<reg_no>/report/` | Download Student Contest Performance PDF report |

### Junior Admin (JA)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/ja/dashboard/` | JA dashboard overview |
| GET | `/api/ja/students/` | Student list with filters |
| POST | `/api/ja/students/create/` | Add a single student |
| PUT | `/api/ja/students/<reg_no>/update/` | Update student details |
| DELETE | `/api/ja/students/<reg_no>/delete/` | Remove a student |
| POST | `/api/ja/students/<reg_no>/move/` | Move student to another batch |
| POST | `/api/ja/students/assign-batch/` | Bulk batch assignment |
| POST | `/api/ja/students/assign-section/` | Bulk section assignment |
| POST | `/api/ja/import/` | Bulk import via Excel |
| GET | `/api/ja/import/template/` | Download import template |
| GET | `/api/ja/staff/` | Staff list for assignments |
| GET / POST | `/api/ja/advisors/` | List / assign batch advisors |
| DELETE | `/api/ja/advisors/<batch_code>/` | Remove an advisor assignment |
| GET | `/api/ja/mentors/` | List mentor assignments |
| POST | `/api/ja/mentors/assign/` | Assign mentor to students |

### Admin

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/dashboard/` | System-wide admin dashboard |
| GET / POST | `/api/admin/v2/institutions/` | List / create institutions |
| GET / PUT / DELETE | `/api/admin/v2/institutions/<id>/` | Institution detail |
| GET | `/api/admin/v2/institutions/<id>/hub/` | Full institution data hub |
| POST | `/api/admin/v2/global-maintenance/` | Toggle global maintenance mode |
| GET / POST | `/api/admin/v2/institutions/<id>/departments/` | Manage departments |
| GET | `/api/admin/v2/institutions/<id>/files/` | Institution file management |
| GET / POST | `/api/admin/v2/institutions/<id>/branding/` | Branding settings |

### Discussion & Utility

| Method | Endpoint | Description |
|---|---|---|
| GET / POST | `/api/discussions/` | Discussion messages |
| GET | `/api/discussions/threads/` | Thread list |
| POST | `/api/discussions/<id>/vote/` | Vote on an embedded poll |
| GET | `/api/announcements/` | System announcements |
| GET | `/api/notifications/` | User notifications |
| POST | `/api/notifications/<id>/read/` | Mark notification as read |
| GET | `/api/health/` | Health check (no auth required) |

---

## 8. Frontend Architecture

### Component Structure

```
src/
├── App.jsx                        Main app — routing, auth state, dashboard data
├── main.jsx                       React entry point
├── styles.css                     Global CSS (design tokens, utilities, animations)
│
├── components/
│   ├── admin/
│   │   ├── AdminDashboard.jsx     System admin panel (institution management)
│   │   └── InstitutionDetail.jsx
│   │
│   ├── common/
│   │   ├── AuthScreen.jsx         Login / first-login / lookup screen
│   │   ├── TopBar.jsx             Navigation bar (role-aware)
│   │   ├── Footer.jsx
│   │   ├── PerformanceCharts.jsx  SVG charts: line chart, radar chart, aptitude radar
│   │   ├── ContestDetailModal.jsx
│   │   ├── ContestSessionTimer.jsx
│   │   ├── PasswordResetModal.jsx
│   │   ├── TwoStepVerification.jsx
│   │   ├── AdvancedStudentFilter.jsx
│   │   ├── ReportFilterModal.jsx
│   │   ├── DevelopersProfile.jsx
│   │   └── MaintenanceScreen.jsx
│   │
│   ├── hod/
│   │   ├── HODDashboard.jsx       HOD overview + contest approval queue
│   │   └── ContestApprovalPanel.jsx
│   │
│   ├── ja/
│   │   └── JADashboard.jsx        Student management, import, mentor/advisor assignment
│   │
│   ├── staff/
│   │   ├── StaffDashboard.jsx     Contests, analytics, mentees, class
│   │   ├── ContestCreator.jsx
│   │   ├── EnhancedContestCreator.jsx
│   │   └── StudentAnalyticsModal.jsx
│   │
│   └── student/
│       ├── ContestDashboardWidget.jsx
│       ├── SqlResultTable.jsx
│       └── pages/
│           ├── ExplorePage.jsx                   Problem bank with filters
│           ├── ProblemsPage.jsx                  Problem detail + Monaco editor
│           ├── ProgressPage.jsx                  Student progress (4 tabs)
│           ├── AptitudePage.jsx                  Aptitude study mode
│           ├── AptitudeQuizPage.jsx              Aptitude quiz interface
│           ├── AptitudeContestWorkspacePage.jsx  Timed aptitude contest
│           ├── StudentContestsPage.jsx           Contest listing
│           ├── ContestPage.jsx                   Contest detail
│           ├── ContestContainer.jsx              Contest workspace wrapper
│           ├── ContestWorkspacePage.jsx          Programming contest workspace
│           ├── ContestProblemPage.jsx            Single problem inside a contest
│           ├── DiscussPage.jsx                   Discussion threads
│           ├── CompanyPage.jsx                   Company-tagged problem search
│           └── RoadmapsPage.jsx                  Learning roadmaps
│
└── lib/
    ├── api.js                  API client (fetch wrappers)
    ├── appData.js              Constants, nav items, language configs
    ├── appUtils.js             Utility functions
    ├── codeExecution.js        Code submission helpers
    ├── languageDetector.js     Language detection from code
    ├── useHistoryNav.js        URL-based navigation hook (no React Router)
    └── achievementData.js      Badge / achievement definitions
```

### State Management

The application uses React's built-in `useState` and `useEffect` — no external state library. The top-level `App.jsx` holds:

- `dashboard` — full student or staff dashboard payload, passed as props to child pages
- `setDashboard` — updater passed down so child pages can make optimistic UI updates
- `activePage` — the current "route" (the app is a SPA without React Router)
- `problemSet` — the full problem list, fetched once and cached in state

Navigation uses a `useHistoryNav` custom hook that reflects the current page in the browser URL without a full reload.

### Charts

All charts are hand-authored SVG within React — no external chart library is used. This keeps the bundle small and gives full control over the visual design.

| Component | Description |
|---|---|
| `ScoreLineChart` | Contest score history: line + area fill, hover tooltip, dashed average line |
| `TopicRadarChart` | Compact radar used in the overall Performance Dashboard panel |
| `AptitudeProgressRadar` | Large filterable radar in the Aptitude tab with mode toggle (Contest Accuracy / Study Progress), category filter pills, and an insights panel (strongest topic, needs-work list, average accuracy) |

---

## 9. Core Workflows

### 9.1 Student Onboarding

```
1. JA creates student record
      POST /api/ja/students/create/
      Fields: register_number, name, batch, section, email, mobile, gender

   — OR —

   JA bulk-imports via Excel
      POST /api/ja/import/
      Template: GET /api/ja/import/template/

2. Student visits the platform and enters their register number
      GET /api/auth/lookup/   →  { exists: true, password_is_set: false }

3. First login: student sets a new password
      POST /api/auth/first-login/
      Fields: register_number, new_password, confirm_password

4. Student logs in
      POST /api/auth/login/
      Session cookie is set on the browser

5. Student lands on their Dashboard
      GET /api/dashboard/
      Returns: stats, problems solved, streak, rank,
               contests, aptitude progress, achievements
```

### 9.2 Contest Lifecycle

```
DRAFT
  Staff creates a contest
    POST /api/contests/
    Fields: title, type (programming/aptitude), duration,
            problems or questions, assigned batches

PENDING APPROVAL
  Staff submits for HOD review
    POST /api/contests/<id>/submit-for-approval/

APPROVED
  HOD reviews and approves (or rejects with a reason)
    POST /api/contests/<id>/approve/

PUBLISHED
  Staff or HOD publishes the approved contest
    POST /api/contests/<id>/publish/
  Contest becomes visible to assigned student batches.

ACTIVE — Student Side
  Student opens contest → clicks "Start"
    POST /api/student/contests/<id>/start/
    → ContestParticipation created (is_active = True)
    → Countdown timer begins client-side

  Student submits code or selects answers
    POST /api/student/contests/<id>/problems/<slug>/submit/   (programming)
    POST /api/student/contests/<id>/aptitude/submit/          (aptitude)

  Session ends: student submits manually or timer hits zero
    POST /api/student/contests/<id>/stop/
    POST /api/student/contests/<id>/auto-submit/
    → ContestParticipation.is_active = False

ENDED
  Contest passes its end_time.
  Staff triggers winner allocation (Celery background task).
  Analytics available: GET /api/contests/<id>/analytics/
  PDF report available: GET /api/contests/<id>/report/
```

### 9.3 Code Execution Pipeline

```
Student writes code in the Monaco editor and clicks "Run".

1. Frontend → Django
      POST /api/run/
      Body: { code, language, stdin }

2. Django CodeRunView:
   a. Security-validates the code (code_validator.py)
   b. Maps language name → execution language ID
   c. Submits job to Code2Day Custom Executor (`code-executor` microservice): POST /submissions/
   d. Polls executor service until verdict is ready
   e. Normalises output via execution_adapter.py
   f. Returns: { status, stdout, stderr, time_ms, memory_kb }

3. For contest submissions, Django runs all test cases (including hidden):
      POST /api/student/contests/<id>/problems/<slug>/submit/
   Possible results:
     Accepted | Wrong Answer | Time Limit Exceeded |
     Memory Limit Exceeded | Runtime Error | Compilation Error

4. Results are stored in ExecutionRecord.
   SolvedProblem is created/confirmed if all test cases pass.
```

### 9.4 Aptitude Assessment Flow

#### Study Mode (Individual Practice)

```
1. Student opens the Aptitude page
      GET /api/aptitude/topics/      → full topic tree
      GET /api/aptitude/questions/   → questions, filterable by topic

2. Topic & Question State Persistence:
   • The current topic ID is synchronized with URL search params (?topic=<id>) and sessionStorage.
   • The active question number is synchronized with URL search params (?q=<num>) and sessionStorage.
   • On browser refresh (F5 / Ctrl+R), the application restores both the active topic and exact question position.

3. Student selects an answer and submits:
      POST /api/aptitude/questions/submit/
      Body: { question_id, selected_option }
      Response: { is_correct, correct_option, explanation }

4. Real-time Status & Solved Tracking:
   • On correct submission, SolvedAptitude record is created in backend.
   • Question state immediately updates to is_solved: true in UI with green CheckCircle badges.
   • Question navigator highlights solved questions, and topic completion percentages update dynamically.
```

#### Contest Mode (Timed)

```
1. Student starts the aptitude contest
      POST /api/student/contests/<id>/start/

2. All questions are shown simultaneously in the timed workspace.

3. Student selects answers and submits everything before the timer ends
      POST /api/student/contests/<id>/aptitude/submit/
      Body: { answers: [{ question_id, selected_answer }, ...] }

4. Each answer is saved to AptitudeContestSubmission with is_correct flag.
   Score = (correct answers / total questions) × 100
```

### 9.5 Mentor & Advisor Assignment

```
MENTOR ASSIGNMENT  (student ↔ staff, 1-to-1)

  JA selects a staff member and assigns students to them
    POST /api/ja/mentors/assign/
    Body: { staff_id: "FAC001", register_numbers: ["21CS001", "21CS002", ...] }

  Staff views their mentees
    GET /api/staff/mentor/dashboard/
    → Lists all mentees with solved count, streak, last active, status.
    → "View Progress" button opens detailed analytics for each mentee.

  Student views their mentor
    GET /api/student/mentor-advisor/

CLASS ADVISOR ASSIGNMENT  (staff ↔ batch/section)

  JA assigns a staff member as advisor to a batch + section
    POST /api/ja/advisors/
    Body: { staff_id, batch, section, department_id }

  Staff views their class
    GET /api/staff/advisor/dashboard/
    → Lists all students in the assigned batch/section.

  Student views their class advisor
    GET /api/student/mentor-advisor/
```

### 9.6 Analytics & Reporting

#### Student Self-Analytics (accessed by the student)

```
GET /api/student/analytics/

Returns:
  score_history   → [ { label, title, score_pct, date, contest_type }, ... ]
  topic_accuracy  → [ { topic, category, accuracy, total, correct }, ... ]
  tests_completed, avg_score, peak_score
  solved_count, difficulty_breakdown: { Easy, Medium, Hard }
  time_spent_hours
  aptitude: { solved, total, percentage }
```

#### Individual Student Analytics (accessed by staff)

```
GET /api/students/<register_number>/analytics/

Returns all of the above, plus:
  student: { register_number, name, batch, department,
             current_streak, login_days, campus_rank }
  contest_participations
  company_insights
  project_insights
```

#### PDF Report Generation

```
Student report  →  GET /api/students/<reg_no>/report/
Staff report    →  GET /api/staff/<faculty_id>/report/
Contest report  →  GET /api/contests/<id>/report/

Generated server-side with ReportLab:
  • Institutional branding (logo, colors)
  • Watermarked pages
  • Performance charts rendered as PDF primitives
  • Tabulated data: submissions, contest history, aptitude scores
```

### 9.7 Company Tracking

Students mark companies they are targeting for placements. Problems in the bank are tagged with company names.

```
1. Student opens Companies tab in ProgressPage.

2. Clicks "Manage Tracks" → modal lists all companies that appear in the problem bank.

3. Student toggles companies on/off (each toggle is a separate API call):
      POST /api/dashboard/tracked-companies/
      Body: { companies: ["Google", "Amazon", "TCS"] }
      Response: { status: "success", tracked_companies: [...] }

4. tracked_companies is saved on the StudentProfile.

5. The Companies tab shows one progress card per tracked company,
   displaying how many tagged problems the student has solved.
   Each card can be clicked to see the list of solved problems for that company.
```

### 9.8 Discussion System

The platform supports 8 thread types, each scoped to the right audience automatically based on the sender's profile.

| Thread Type | Audience |
|---|---|
| `general` | All authenticated users in the institution |
| `batch` | Students in the same batch + their staff |
| `section` | Students in the same section + their staff |
| `mentor` | Student + their assigned mentor |
| `staff` | Staff-only (per department) |
| `hod` | HOD-only view |
| `direct` | Any two users (DM) |
| `problem` | Discussion attached to a specific problem |

```
POST /api/discussions/
Body: {
  thread_type: "batch",
  content: "Has anyone solved the DP section yet?",
  is_poll: false
}

GET /api/discussions/?thread_type=batch
→ Returns messages scoped to the requesting user's batch automatically.

Polls:
POST /api/discussions/
Body: {
  thread_type: "general",
  content: "Which language do you prefer?",
  is_poll: true,
  poll_options: ["Python", "Java", "C++", "JavaScript"]
}

POST /api/discussions/<id>/vote/
Body: { option_index: 0 }
```

---

## 10. Setup & Installation

### 10.1 Prerequisites

- **Python** 3.11 or later
- **Node.js** 18 or later, and npm 9+
- **PostgreSQL** 15+ (production) or SQLite (development only)
- **Redis** 7+ (required for Celery)
- **Docker** and **Docker Compose** (for the Judge0 code execution sandbox)

### 10.2 Development Setup

#### Clone the repository

```bash
git clone <repository-url>
cd ramcoad.com
```

#### Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Linux / macOS
venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Create environment file from the template
cp .env.example .env
# Edit .env — at minimum set SECRET_KEY and DATABASE_URL

# Apply migrations
python manage.py migrate

# Create a superuser (System Admin account)
python manage.py create_admin

# Optional: load initial data
python manage.py load_aptitude       # Aptitude questions
python manage.py create_departments  # Default departments

# Start the development server
python manage.py runserver
```

Backend is available at `http://localhost:8000`.

#### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server (proxies /api/* to localhost:8000 via vite.config.js)
npm run dev
```

Frontend is available at `http://localhost:5173`.

#### Code Execution Sandbox (optional for local work)

Without Judge0 running, code execution requests will fail. To run the sandbox locally:

```bash
# From the project root
docker-compose up judge0 redis
```

Or use the setup script:

```bash
bash judge0_setup.sh
```

### 10.3 Production Deployment

All services are orchestrated via Docker Compose.

#### Services defined in `docker-compose.yml`

| Service | Description |
|---|---|
| `backend` | Django + Gunicorn |
| `frontend` | React build served via Nginx |
| `nginx` | Reverse proxy (SSL termination, routing) |
| `redis` | Cache and Celery broker |
| `celery` | Background task worker |
| `judge0` | Code execution sandbox |
| `judge0-workers` | Judge0 worker processes |
| `db` | PostgreSQL (if containerised) |

#### Steps

```bash
# 1. Populate backend/.env with all required values

# 2. Build and start all services
docker-compose up --build -d

# 3. Run migrations
docker-compose exec backend python manage.py migrate

# 4. Collect static files
docker-compose exec backend python manage.py collectstatic --no-input

# 5. Create the initial admin account
docker-compose exec backend python manage.py create_admin
```

Or use the convenience script:

```bash
bash full-deploy.sh
```

#### SSL / HTTPS

Place SSL certificates where `nginx.conf` expects them (typically `/etc/nginx/certs/`). The recommended approach is Let's Encrypt:

```bash
certbot certonly --webroot -w /var/www/certbot -d yourdomain.com
```

Then update `nginx.conf` with the correct certificate paths and reload Nginx.

---

## 11. Environment Variables

Copy `backend/.env.example` to `backend/.env`. **Never commit `.env` to version control.**

```bash
# ── Django Core ───────────────────────────────────────────────────────────────
SECRET_KEY=<50-character random key>
DEBUG=False
ALLOWED_HOSTS=yourdomain.com,localhost

# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://user:password@host:5432/dbname

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0

# ── Code Execution (Judge0) ───────────────────────────────────────────────────
JUDGE0_BASE_URL=http://localhost:2358
JUDGE0_TOKEN=<judge0-api-token if using the hosted cloud version>

# ── CORS & CSRF ───────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS=https://yourdomain.com
CSRF_TRUSTED_ORIGINS=https://yourdomain.com

# ── Execution Resource Limits ─────────────────────────────────────────────────
MAX_CPU_TIME=5          # seconds per submission
MAX_MEMORY=256          # MB per submission
MAX_FILE_SIZE=64        # MB output limit

# ── Rate Limiting ─────────────────────────────────────────────────────────────
RATE_LIMIT_WINDOW=60    # seconds
RATE_LIMIT_MAX=30       # requests per window per user
```

---

## 12. Deployment & Dokploy Maintenance Scripts

| Script / Config | Purpose |
|---|---|
| `docker-compose.yml` | Container definition for Dokploy PaaS deployment (`dokploy-network`, `code2day-shared`) |
| `redeploy-app.sh` | Rebuild and restart frontend & backend containers while keeping Judge0 services running |
| `deploy.sh` | Standard deployment script (git pull, build, database migration, container restart) |
| `quick-redeploy.sh` | Fast zero-downtime application container reload |
| `full-deploy.sh` | Complete deployment from scratch (services, database setup, environment bootstrap) |
| `deploy-judge0.sh` | Deploy or redeploy only the isolated Judge0 code sandbox container |
| `judge0_install.sh` | First-time installation script for Judge0 sandbox environment |
| `judge0_setup.sh` | Configure Judge0 worker threads, memory quotas, and execution queues |
| `build-custom-judge0.sh` | Build custom multi-language Judge0 Docker image |
| `fix-db-connection.sh` | Diagnose and repair PostgreSQL database connectivity |
| `fix-deployment.sh` | Automated deployment troubleshooting and container container diagnostic tool |
| `setup-auto-restart.sh` | Configure auto-restart policies for containers and services |
| `setup-dns.sh` | Configure DNS and domain routing for multi-tenant institution hosts |

---

## 13. Screenshots

> Screenshots will be added here. The placeholders below mark each view to document.

### Student Dashboard — Overview
`<!-- screenshot: student-dashboard-overview.png -->`

### Student Progress — Score History & Performance Charts
`<!-- screenshot: student-progress-charts.png -->`

### Student Progress — Aptitude Radar (Filterable)
`<!-- screenshot: aptitude-radar-filterable.png -->`

### Problem Workspace (Monaco Editor)
`<!-- screenshot: problem-workspace-monaco.png -->`

### Contest Workspace — Programming
`<!-- screenshot: contest-workspace-programming.png -->`

### Contest Workspace — Aptitude
`<!-- screenshot: aptitude-contest-workspace.png -->`

### Staff Dashboard — Contest Management
`<!-- screenshot: staff-dashboard-contests.png -->`

### Staff — Student Analytics Modal
`<!-- screenshot: staff-analytics-modal.png -->`

### Staff — My Mentees Tab
`<!-- screenshot: staff-mentees-tab.png -->`

### HOD — Contest Approval Panel
`<!-- screenshot: hod-approval-panel.png -->`

### Junior Admin — Student Management
`<!-- screenshot: ja-student-management.png -->`

### Junior Admin — Mentor Assignment
`<!-- screenshot: ja-mentor-assignment.png -->`

### Discussion Threads
`<!-- screenshot: discussion-threads.png -->`

### Admin — Institution Management
`<!-- screenshot: admin-institution-management.png -->`

---

## 14. Security Notes

### Authentication
- Session-based authentication using Django's built-in session framework.
- Session cookies are HTTP-only (inaccessible to JavaScript).
- CSRF tokens are required on all mutating requests (`POST`, `PUT`, `DELETE`, `PATCH`).
- Login endpoints have rate limiting to prevent brute-force attacks.

### Role Enforcement
- Every API view checks the user's role before processing.
- Staff accounts can be locked by a HOD; locked accounts receive `403 Forbidden` on all requests.
- Students and staff are always filtered by institution at the ORM level.

### Code Execution Sandbox
- All student code runs inside a Judge0 container with hard limits on CPU time, memory, and output size.
- The container has no network access and runs with a read-only filesystem.
- Process isolation prevents code from accessing host resources.

### Data Privacy
- Student identifiers, emails, and personal details are never included in public-facing endpoints.
- Analytics endpoints require the authenticated student themselves, or authenticated staff.
- PDF reports are watermarked and scoped to the requesting institution.

### Credentials
- Passwords are hashed with Django's default PBKDF2-SHA256.
- First-login flow requires a new password to be set before any feature is accessible.
- Passwords are never returned in any API response.

---

## 15. Contributing & Git Workflow Guide

### Comprehensive Git Workflow

#### 1. Branch Management
- Always create a dedicated branch for every feature or fix from `main`:
  ```bash
  git checkout main
  git pull origin main
  git checkout -b feat/your-feature-name
  ```

#### 2. Branch Naming Standards

| Prefix | Usage | Example |
|---|---|---|
| `feat/` | New features or API endpoints | `feat/batch-pdf-report` |
| `fix/` | Bug fixes and runtime repairs | `fix/workspace-render-error` |
| `refactor/` | Code structure improvements with no logic change | `refactor/aptitude-state` |
| `docs/` | Documentation and README updates | `docs/update-git-explanation` |
| `chore/` | Configuration, build, or dependency updates | `chore/vite-config` |

#### 3. Pre-Commit Verification (Mandatory)
Before committing any changes, run backend and frontend verification commands to guarantee zero regressions:

```bash
# 1. Verify Django Backend System Check
cd backend
python manage.py check

# 2. Verify Frontend Production Build
cd ../frontend
npm run build
```

#### 4. Staging & Atomic Commits
- **STRICT RULE**: Avoid `git add -A` or `git add .` to prevent staging temporary files, environment variables, or log scratchpads.
- Stage only explicit, related files for each commit:

```bash
# Stage specific modified files
git add backend/apps/learning/views.py backend/apps/learning/urls.py
git commit -m "feat: add PDF performance report endpoints for batch and company tracking"
```

#### 5. Conventional Commit Conventions

| Prefix | Description | Example |
|---|---|---|
| `feat:` | Adding a new feature | `feat: add aptitude problem persistence across page refreshes` |
| `fix:` | Fixing an error or bug | `fix: resolve undefined props in workspace render view` |
| `refactor:` | Restructuring code | `refactor: optimize database query in student analytics` |
| `docs:` | Updating documentation | `docs: update API reference and Git workflow guide in README` |
| `chore:` | Maintenance tasks | `chore: update dependencies` |

#### 6. Database Migrations Workflow
When adding or altering Django models in `backend/apps/learning/models.py`:

```bash
# 1. Create migration file
python manage.py makemigrations

# 2. Apply and test locally
python manage.py migrate

# 3. Stage model changes and migration file together
git add backend/apps/learning/models.py backend/apps/learning/migrations/
git commit -m "feat: add proctoring lock and snapshot fields to Contest model"
```

*Note: Never edit or delete migration files that have already been applied to production.*

#### 7. Pushing & Pull Request Submission

```bash
# Push feature branch to remote
git push origin feat/your-feature-name
```
Open a Pull Request against `main`. Ensure all automated build checks pass before merging.

1. Write the view class in `views.py` (or a dedicated `*_views.py` file for large feature areas).
2. Register the URL in `apps/learning/urls.py`.
3. Export the view class from `urls.py`'s import block.
4. If the endpoint changes a model, write and apply the migration.
5. Document the new endpoint in this README under the appropriate role section.

---

*This document covers the platform at its current state. The full database schema (ERD) and per-endpoint request / response specifications will be added as separate documents. Screenshots will be inserted into Section 13 once captured.*
