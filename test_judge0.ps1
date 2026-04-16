# Test Judge0 endpoints
Write-Host "Testing Judge0 Endpoints..." -ForegroundColor Cyan
Write-Host ""

# Test 1: System Info
try {
    Write-Host "TEST 1: Judge0 System Info" -ForegroundColor Yellow
    Write-Host "-" * 40
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/judge0/system_info/" -Method GET -TimeoutSec 15
    Write-Host "Status: $($response.status)" -ForegroundColor Green
    if ($response.judge0_info) {
        Write-Host "Judge0 Version: $($response.judge0_info.version)" -ForegroundColor Green
    }
    Write-Host "PASS" -ForegroundColor Green
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
}

Write-Host ""

# Test 2: Submit Python Code
try {
    Write-Host "TEST 2: Submit Python Code" -ForegroundColor Yellow
    Write-Host "-" * 40
    $body = @{ language_id = 71; source_code = "print(2+2)" } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/judge0/submit/" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
    Write-Host "Status: $($response.status)" -ForegroundColor Green
    Write-Host "Output: $($response.execution.output)" -ForegroundColor Green
    Write-Host "PASS" -ForegroundColor Green
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
}
