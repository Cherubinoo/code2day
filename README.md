# code-2day

`code-2day` is a React + Django starter for a student coding practice platform inspired by LeetCode.

## Frontend

- React + Vite
- Monaco editor integration
- Soft sage and deep olive theme
- Dashboard with streak heatmap, login-day tiles, problem stats, and difficulty-based problem sets

## Backend

- Django + Django REST Framework
- SQLite database for local development
- Separate API routes for dashboard data, problem lists, and editor bootstrap data
- Starter models for student profiles, problems, and submissions
- Initial migration and a demo seed command

## Run locally

### Frontend:

```bash
cd frontend
npm install
npm run dev
```

### Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_code2day
python manage.py import_students
python manage.py runserver
```

## Student import and first login

- Import command: `python manage.py import_students`
- Student lookup: `GET /api/auth/student/?register_number=<value>`
- First password setup: `POST /api/auth/first-login/`
- Student login: `POST /api/auth/login/`

Imported students are created with their register number as the username and an unusable password. On first login, the student sets a password through the first-login endpoint; after that, the normal login endpoint can be used. 
