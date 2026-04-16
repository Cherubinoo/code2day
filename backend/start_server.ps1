# PowerShell script to start Django with PostgreSQL
# Run: .\start_server.ps1

# PostgreSQL Configuration (matches settings.py)
$env:DB_NAME = "code2day"
$env:DB_USER = "postgres"
$env:DB_PASSWORD = "123"
$env:DB_HOST = "localhost"
$env:DB_PORT = "5432"

# Judge0 Configuration (optional - uncomment to use external Judge0)
# $env:JUDGE0_BASE_URL = "http://your-judge0-server:2358"
$env:JUDGE0_TIMEOUT_SECONDS = "30"

Write-Host "Starting Code-2Day Server..." -ForegroundColor Green
Write-Host "Database: PostgreSQL (code2day)" -ForegroundColor Cyan
Write-Host "Judge0:   Disabled (set JUDGE0_BASE_URL to enable)" -ForegroundColor Yellow
Write-Host ""

python manage.py runserver
