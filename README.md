# Ramcoad Platform: Comprehensive Project Documentation

**Live Access:** [code2day.ramcoad.com](https://code2day.ramcoad.com)

Ramcoad is a state-of-the-art educational, assessment, and contest platform engineered to deliver structured learning modules, aptitude tests, and highly secure programming contests. The platform is designed with a multi-tenant architecture, catering to different institutions with strict role-based access control, advanced anti-cheat mechanisms, and high-performance asynchronous code execution.

---

## 1. System Architecture & Tech Stack

### Core Technologies
- **Frontend Framework:** React (bootstrapped with Vite)
- **Backend Framework:** Django (Python)
- **Database:** SQLite (Development) / PostgreSQL (Production ready)
- **Caching & Message Broker:** Redis
- **Task Queue:** Celery (for asynchronous operations)
- **Code Execution Engine:** Custom Execution Engine (Containerized secure sandbox)
- **Web Server / Reverse Proxy:** Nginx

### Architecture Overview
The architecture is decoupled into a robust RESTful Django backend and a dynamic React frontend. All long-running tasks, such as code compilation and execution via the Custom Execution Engine, are offloaded to Celery workers backed by Redis. This ensures the web server remains unblocked and highly responsive, while the frontend actively polls task statuses to provide real-time feedback to users.

---

## 2. Core Modules & Functionality

### 2.1 Multi-Tenant & Role-Based Access
The system supports multiple institutions under a single deployment (Multi-tenancy). 
- **Institutions & Departments:** Dedicated configuration, branding (logos/names), and database isolation logic per institution.
- **Roles:**
  - **Students:** Can access learning modules, take contests, and track progress.
  - **Student Leaders:** Class Representatives, Placement Coordinators.
  - **Staff/Faculty:** Can draft and monitor contests, view student analytics.
  - **Administration:** Head of Department (HOD), Training & Placement Unit (TPU), Junior Admins (JA), and System Admins.

### 2.2 Learning & Problem Solving Engine
A comprehensive coding and problem-solving module designed similar to LeetCode.
- **Problem Bank:** Extensive database of coding problems with varying difficulties (Easy, Medium, Hard), tags, hints, and expected time/space complexities.
- **Daily Challenges:** Special "Problem of the Day" mechanism to encourage daily engagement.
- **Code Editor Workspace:** A premium, web-based Monaco editor integration supporting multiple languages (JavaScript, Python, C++, Java, etc.).
- **Execution & Evaluation:** Integration with the Custom Execution Engine for isolated execution. Submissions are checked against hidden test cases, reporting memory and execution time.

### 2.3 Aptitude Assessment
A structured system for non-programming assessments.
- **Topics & Subtopics:** Hierarchical categorization of aptitude concepts (e.g., Logical Reasoning, Quantitative, Verbal).
- **Question Bank:** Multiple-choice questions with varied difficulties and detailed explanations for the correct answers.

### 2.4 Professional Career Roadmaps
- Multi-phase curriculum data guiding students through specific technical roles (e.g., Frontend Developer, Backend Developer, Data Scientist).
- Interactive timelines and resource grids to track roadmap completion.

### 2.5 Contest System & Anti-Cheat
A highly robust assessment environment tailored for academic and hiring evaluations.
- **Contest Lifecycle:** Draft $\rightarrow$ Pending Approval $\rightarrow$ Approved $\rightarrow$ Published $\rightarrow$ Active $\rightarrow$ Completed.
- **Secure Workspace (Anti-Cheat):**
  - **Aggressive Fullscreen Enforcement:** Users are forced into fullscreen. Exiting fullscreen throws immediate warnings and pauses the workspace.
  - **Distraction-Free Mode:** Hides global navigation, disabling tab switching and copy-pasting.
  - **Session Tracking:** Tracks precise time spent on individual problems.
  - **Submission Analytics:** Detailed tracking of test cases passed, failed, and syntax errors during the contest timeframe.

### 2.6 Communication & Discussions
An integrated communication module to facilitate interaction.
- **Thread Types:** General Discussion, Direct Messages, Batch-specific rooms, Staff Rooms, HOD/TPU panels, and Problem-specific threads.
- **Features:** Supports rich text, polls, and read-receipts.

### 2.7 Gamification & Analytics
- **Activity Tracking:** Tracks daily logins, current streak, and problem-solving days.
- **Achievements/Badges:** Automated awarding of badges based on criteria like solve counts or specific milestones in coding and aptitude.
- **Leaderboards:** Dynamic leaderboards ranked by problems solved, contest scores, and streaks.

---

## 3. UI/UX & Design Philosophy

- **Premium Aesthetics:** The frontend avoids generic styles in favor of curated HSL color palettes, dynamic glassmorphism, smooth gradients, and a sleek dark-mode-first aesthetic.
- **Micro-Animations:** Strategic use of hover effects, page transitions, and interactive elements to create a responsive and "alive" user interface.
- **Responsive Layout:** fully optimized for both desktop-class contest taking and mobile-friendly learning.

---

## 4. Setup & Deployment Guide

### Prerequisites
- Python 3.9+
- Node.js 18+
- Redis Server
- Docker & Docker Compose (for Custom Execution Engine)

### 4.1 Backend Setup (Django & Celery)
1. **Navigate and Virtual Environment:**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
2. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
3. **Environment Variables:**
   Create a `.env` file based on `.env.example` (configure DB, Redis URL, Execution Engine API keys).
4. **Database Migration & Superuser:**
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   python manage.py createsuperuser
   ```
5. **Start Services:**
   - Start Django server: `python manage.py runserver`
   - Start Redis (if not running globally).
   - Start Celery Worker: `celery -A your_project_name worker --loglevel=info`

### 4.2 Frontend Setup (React/Vite)
1. **Navigate to Frontend:**
   ```bash
   cd frontend
   ```
2. **Install Dependencies:**
   ```bash
   npm install
   ```
3. **Start Development Server:**
   ```bash
   npm run dev
   ```

### 4.3 Execution Engine Setup
Ensure the Custom Execution Engine is running on your network (usually via docker-compose). Update the backend's `EXECUTION_ENGINE_URL` environment variable to point to the engine's API endpoint.

---

## 5. Deployment & CI/CD Pipeline

The project relies on a modern, containerized deployment strategy powered by **Docker** and automated via **GitHub Actions**.

### 5.1 Dockerized Architecture
Both the frontend and backend are deployed as isolated Docker containers to ensure consistency across environments:
- **Frontend Container (`Dockerfile.frontend`):** Built as a static asset bundle and served using a lightweight Nginx container.
- **Backend Container (`Dockerfile.backend`):** Runs the Django application via Gunicorn/Uvicorn.
- **Service Containers:** Redis, Celery Workers, and the Custom Execution Engine run in their respective containers within the same Docker network (typically orchestrated via `docker-compose`).

### 5.2 Server Deployment & Reverse Proxy
- **Nginx Reverse Proxy:** A centralized Nginx instance acts as the main entry point (reverse proxy) for the domain.
  - It handles SSL termination (HTTPS).
  - Routes web traffic targeting the root (`/`) directly to the Frontend Docker container.
  - Proxies API traffic (`/api/`, `/admin/`, and `/media/`) securely to the Backend Django container.
  
### 5.3 GitHub Actions (CI/CD)
The repository uses GitHub Actions to automate the testing, building, and deployment process:
1. **Continuous Integration (CI):** On push or pull request to the main branch, GitHub Actions executes linting and automated test suites.
2. **Image Build:** If tests pass, the pipeline builds fresh Docker images for both the frontend and backend.
3. **Continuous Deployment (CD):** The updated images are pushed to a container registry. The production server is then automatically triggered (via SSH or webhook) to pull the latest images and recreate the containers, providing a seamless, automated deployment cycle.

---

## 6. Real-World Testing & Impact

The platform has been rigorously tested and deployed in real-time environments to ensure reliability and scalability:
- **Large-Scale Deployment:** Tested live with **150+ students** accessing the platform concurrently for placement practice.
- **Department-Wide Training:** Successfully utilized to train all students within the Department of AD (Artificial Intelligence and Data Science).
- **Placement Assessment:** Specifically tested for analyzing and evaluating **120+ 3rd-year students** during rigorous placement assessments.

### Sample Reports
Sample assessment and programming test reports generated by the platform have been included in this repository:
- [Assessment Report](sample_reports/1.pdf)
- [Programming Test Report](sample_reports/programing%20test.pdf)
