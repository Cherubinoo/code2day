# PowerShell script to start Django with PostgreSQL
# Run: .\start_server.ps1
# 
# IMPORTANT: Set environment variables before running:
#   $env:DJANGO_SECRET_KEY = "your-secret-key"
#   $env:DB_PASSWORD = "your-db-password"
#   $env:JUDGE0_BASE_URL = "http://judge0-server:2358"

# Check required environment variables
$requiredVars = @("DB_PASSWORD", "DJANGO_SECRET_KEY")
foreach ($var in $requiredVars) {
    if (-not (Test-Path env:\$var)) {
        Write-Host "ERROR: Environment variable $var is not set" -ForegroundColor Red
        Write-Host "Please set: `$env:$var = 'your-value'" -ForegroundColor Yellow
        exit 1
    }
}

# Set defaults if not provided
if (-not (Test-Path env:\DB_NAME)) { $env:DB_NAME = "code2day" }
if (-not (Test-Path env:\DB_USER)) { $env:DB_USER = "postgres" }
if (-not (Test-Path env:\DB_HOST)) { $env:DB_HOST = "localhost" }
if (-not (Test-Path env:\DB_PORT)) { $env:DB_PORT = "5432" }
if (-not (Test-Path env:\JUDGE0_TIMEOUT_SECONDS)) { $env:JUDGE0_TIMEOUT_SECONDS = "30" }
if (-not (Test-Path env:\DJANGO_DEBUG)) { $env:DJANGO_DEBUG = "false" }

Write-Host "Starting Code-2Day Server..." -ForegroundColor Green
Write-Host "Database: $env:DB_HOST`:$env:DB_PORT/$env:DB_NAME (user: $env:DB_USER)" -ForegroundColor Cyan
Write-Host "Judge0:   $($env:JUDGE0_BASE_URL or 'Not configured')" -ForegroundColor Cyan
Write-Host "Debug:    $env:DJANGO_DEBUG" -ForegroundColor Yellow
Write-Host ""

python manage.py runserver
