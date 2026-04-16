# Test script to check if problems API is working
Write-Host "Testing Problems API..." -ForegroundColor Cyan
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/problems/" -Method GET -UseBasicParsing -ErrorAction Stop
    Write-Host "Backend is running - Status: $($response.StatusCode)" -ForegroundColor Green
    
    $problems = $response.Content | ConvertFrom-Json
    Write-Host "Problems found: $($problems.Count)" -ForegroundColor Yellow
    
    if ($problems.Count -eq 0) {
        Write-Host "No problems in database! Run: python manage.py seed_code2day" -ForegroundColor Red
    } else {
        Write-Host "First 3 problems:" -ForegroundColor Green
        $problems | Select-Object -First 3 | ForEach-Object {
            Write-Host "  - $($_.title) ($($_.difficulty))" -ForegroundColor Cyan
        }
    }
} catch {
    Write-Host "Failed to connect to backend: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Make sure backend is running: cd backend; python manage.py runserver" -ForegroundColor Yellow
}
