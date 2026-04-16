# Code-2Day Setup Guide

## Prerequisites
- PostgreSQL (via pgAdmin) - already configured
- Python 3.12+
- Node.js 18+ (for frontend)

## Database

PostgreSQL is configured and already contains **1825 problems** with **4281 test cases**.

**Default connection (already set in settings.py):**
- Host: localhost
- Database: code2day
- User: postgres
- Password: 123

To verify database connection:
```powershell
cd backend
python check_db.py
```

## 1. Start Backend Server

```powershell
cd backend
.\start_server.ps1
```

Or manually:
```powershell
cd backend
python manage.py runserver
```

## 2. Configure External Judge0 (Code Execution) - Optional

To enable code execution, set the `JUDGE0_BASE_URL` environment variable:

```powershell
# Example: Point to external Judge0 instance
cd backend
$env:JUDGE0_BASE_URL="http://your-judge0-server:2358"
python manage.py runserver
```

**Without Judge0:** Code execution will show mock responses (for UI testing).

## 3. Start Frontend (New Terminal)

```powershell
cd frontend
npm install  # if not done
npm run dev
```

## Verify Everything Works

1. Open http://localhost:5173
2. Login with a student register number
3. Open a problem
4. Write code and click **Run** - should execute via Judge0

## Troubleshooting

### Database Connection Error
1. Open pgAdmin
2. Check if `code2day` database exists
3. Verify password in `backend/code2day/settings.py` line 102

### Code Execution Not Working
Check if `JUDGE0_BASE_URL` is set:
```powershell
cd backend
$env:JUDGE0_BASE_URL="http://your-judge0-server:2358"
python manage.py runserver
```

## Architecture

```
Frontend (5173) → Django API (8000) → PostgreSQL (pgAdmin)
                          ↓
               External Judge0 Instance (optional)
```

- **Frontend**: React + Vite + Monaco Editor
- **Backend**: Django + Django REST Framework
- **Database**: PostgreSQL (via pgAdmin) - 1825 problems loaded
- **Code Execution**: External Judge0 instance (optional)

## Language Support

Judge0 supports 40+ languages including:
- Python (71)
- JavaScript (63)
- Java (62)
- C++ (54)
- C (50)
- C# (51)
- Go (60)
- Rust (73)

See full list in `frontend/src/lib/codeExecution.js`
