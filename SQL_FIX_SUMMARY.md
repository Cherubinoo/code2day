# SQL Language Support Fix - Summary

## Problem
When deploying the custom Judge0 image with SQL support, submissions were failing with:
```
Error: near line 2: access permission denied
Error: near line 11: access permission denied
Error: near line 18: access permission denied
... (repeated for other lines)
```

These errors occurred for all SQL operations: CREATE TABLE, INSERT, UPDATE, DELETE.

## Root Cause
The SQL executor in Judge0 (language_id: 82) was configured to use:
```bash
/bin/cat script.sql | /usr/bin/sqlite3 db.sqlite
```

SQLite was trying to create/write to `db.sqlite` file in the sandboxed isolate environment, which had restrictive permissions preventing write access to the database file.

## Solution
Changed the SQL executor configuration to use an in-memory SQLite database:
```bash
/bin/cat script.sql | /usr/bin/sqlite3 :memory:
```

### Why This Works
- **`:memory:`** creates a temporary in-memory database
- Each SQL submission gets its own isolated database session
- No file I/O means no permission issues
- Perfect for the sandboxed isolate environment

## Implementation

### Files Created/Modified
1. **Dockerfile.sql-fix** - Updated Judge0 image with SQL fix
2. **docker-compose.judge0.yml** - Docker Compose configuration (optional)

### Deployment Steps

1. **Build the fixed image**:
```bash
docker build -f Dockerfile.sql-fix -t code2day-judge0:sql-fixed .
```

2. **Start Judge0 services with cgroup support**:
```bash
# Stop old containers
docker rm -f judge0-server judge0-workers

# Start with SQL fix and cgroup support
docker run -d \
  --name judge0-server \
  --network code2day-shared \
  -p 2358:2358 \
  --cgroupns=host \
  -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
  -e POSTGRES_HOST=judge0-db \
  -e POSTGRES_DB=judge0 \
  -e POSTGRES_USER=judge0 \
  -e POSTGRES_PASSWORD=code2dayJudge2024 \
  -e REDIS_HOST=judge0-redis \
  -e REDIS_PASSWORD=code2dayRedis2024 \
  --privileged \
  code2day-judge0:sql-fixed

docker run -d \
  --name judge0-workers \
  --network code2day-shared \
  --cgroupns=host \
  -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
  -e POSTGRES_HOST=judge0-db \
  -e POSTGRES_DB=judge0 \
  -e POSTGRES_USER=judge0 \
  -e POSTGRES_PASSWORD=code2dayJudge2024 \
  -e REDIS_HOST=judge0-redis \
  -e REDIS_PASSWORD=code2dayRedis2024 \
  --privileged \
  code2day-judge0:sql-fixed /api/scripts/workers
```

## Testing

### Test 1: Simple SELECT
```bash
curl -X POST http://localhost:2358/submissions?wait=true \
  -H "Content-Type: application/json" \
  -d '{"source_code": "SELECT '\''Hello from SQLite'\'';", "language_id": 82, "stdin": ""}'
```

**Result**: ✅ Accepted

### Test 2: CREATE TABLE + INSERT + SELECT
```sql
CREATE TABLE Employees (
    EmployeeID INT PRIMARY KEY,
    FirstName VARCHAR(50),
    LastName VARCHAR(50),
    Department VARCHAR(50),
    Salary DECIMAL(10,2)
);

INSERT INTO Employees VALUES (1, 'John', 'Smith', 'HR', 50000.00);
INSERT INTO Employees VALUES (2, 'Alice', 'Johnson', 'IT', 65000.00);

SELECT * FROM Employees;
```

**Result**: ✅ Accepted (All rows returned)

## Important Notes

- The in-memory database is ephemeral - data is not persisted between submissions
- Each SQL submission has its own isolated database environment
- This is ideal for educational/testing scenarios in Code2Day
- If data persistence is needed in the future, a different approach would be required

## Image Tags

- `code2day-judge0:cgv2` - Original image (with SQL permission errors)
- `code2day-judge0:sql-fixed` - Fixed image (working SQL support)

## Cleanup

The temporary docker-compose.judge0.yml can be removed after deployment is confirmed working.
