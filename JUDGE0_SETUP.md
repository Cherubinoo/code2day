# Judge0 Docker Setup for Code-2Day

## Overview
This guide sets up Judge0 code execution service using Docker for the Code-2Day platform.

## Prerequisites
- Docker Desktop installed and running
- Docker Compose (included with Docker Desktop)
- At least 4GB RAM available for Docker

## Quick Start

### 1. Start Judge0 Services

```bash
# From the project root directory
docker-compose up -d
```

This starts:
- **judge0-api** on port 2358
- **judge0-workers** (2 workers for code execution)
- **redis** (job queue)
- **postgres** (persistent storage)

### 2. Verify Judge0 is Running

```bash
# Check health
curl http://localhost:2358/system_info

# Expected response:
{
  "version": "1.13.1",
  "status": "healthy",
  "workers": 2
}
```

### 3. Test Code Execution

```bash
# Submit a Python code submission
curl -X POST http://localhost:2358/submissions?wait=true \
  -H "Content-Type: application/json" \
  -d '{
    "source_code": "print('Hello from Judge0!')",
    "language_id": 71,
    "base64_encoded": false
  }'
```

## Backend Configuration

The backend is already configured to use the local Judge0 instance at `http://localhost:2358`.

To use a remote Judge0 instance, set the environment variable:

```bash
# Windows PowerShell
$env:JUDGE0_BASE_URL="http://your-ec2-ip:2358"

# Or create backend/.env file
JUDGE0_BASE_URL=http://your-ec2-ip:2358
```

## Database Configuration

### SQLite (Default - Development)
No configuration needed. Database is at `backend/db.sqlite3`.

### PostgreSQL (Optional)
Set environment variables:

```bash
# Windows PowerShell
$env:DB_ENGINE="postgresql"
$env:DB_NAME="code2day"
$env:DB_USER="postgres"
$env:DB_PASSWORD="your_password"
$env:DB_HOST="localhost"
$env:DB_PORT="5432"

# Run migrations
python manage.py migrate

# Seed data
python manage.py seed_code2day
```

## Useful Commands

```bash
# View logs
docker-compose logs -f judge0-api
docker-compose logs -f judge0-workers

# Restart services
docker-compose restart

# Stop services
docker-compose down

# Reset everything (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d

# Check running containers
docker ps
```

## Troubleshooting

### Judge0 Not Responding
```bash
# Check if containers are running
docker ps

# Restart judge0
docker-compose restart
```

### Code Execution Timeout
Increase timeout in `backend/code2day/settings.py` or via env:
```bash
$env:JUDGE0_TIMEOUT_SECONDS="60"
```

### Database Connection Issues
For PostgreSQL, ensure the service is running:
```bash
# Check PostgreSQL service (Windows)
Get-Service postgresql*

# Or verify connection
psql -U postgres -d code2day -c "SELECT 1"
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Django API    │────▶│  Judge0 API     │
│   (Vite/React)  │     │   (Port 8000)   │     │  (Port 2358)    │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                              ┌─────────────────┐       │
                              │     Redis       │◀──────┤
                              │   (Job Queue)   │       │
                              └─────────────────┘       │
                                                        │
                              ┌─────────────────┐       │
                              │  Judge0 Workers │◀──────┘
                              │ (Code Execution)│
                              └─────────────────┘
```

## Language IDs Supported

| Language | ID |
|----------|-----|
| C | 50 |
| C++ | 54 |
| Java | 62 |
| JavaScript | 63 |
| Python | 71 |
| C# | 51 |
| Go | 60 |
| Rust | 73 |
| TypeScript | 74 |

See full list in `frontend/src/lib/codeExecution.js`

## Security Notes

- Judge0 runs code in isolated containers (using isolate)
- Default memory limit: 256MB per submission
- Default CPU time limit: 5 seconds
- Workers restart automatically on crash
- Authentication is disabled for local development
- **Enable authentication in production!**
