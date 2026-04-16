# Development Server Startup Script
Write-Host "Starting Development Servers..." -ForegroundColor Cyan
Write-Host ""

# Check if backend is already running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000" -Method GET -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    Write-Host "✓ Backend already running on port 8000" -ForegroundColor Green
} catch {
    Write-Host "Starting Django backend..." -ForegroundColor Yellow
    Write-Host "Run this in a separate terminal:" -ForegroundColor Cyan
    Write-Host "  cd backend" -ForegroundColor White
    Write-Host "  python manage.py runserver" -ForegroundColor White
    Write-Host ""
}

# Check if frontend is already running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5173" -Method GET -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    Write-Host "✓ Frontend already running on port 5173" -ForegroundColor Green
} catch {
    Write-Host "Starting React frontend..." -ForegroundColor Yellow
    Write-Host "Run this in a separate terminal:" -ForegroundColor Cyan
    Write-Host "  cd frontend" -ForegroundColor White
    Write-Host "  npm run dev" -ForegroundColor White
    Write-Host ""
}

Write-Host ""
Write-Host "Quick Commands:" -ForegroundColor Cyan
Write-Host "  Backend:  cd backend; python manage.py runserver" -ForegroundColor White
Write-Host "  Frontend: cd frontend; npm run dev" -ForegroundColor White
Write-Host "  Seed DB:  cd backend; python manage.py seed_code2day" -ForegroundColor White
Write-Host ""
Write-Host "Access the app at: http://localhost:5173" -ForegroundColor Green
