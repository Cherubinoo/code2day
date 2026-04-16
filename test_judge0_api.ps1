# Test Judge0 API endpoints using PowerShell
$ErrorActionPreference = "Stop"

Write-Host "Testing Judge0 API Endpoints..." -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# Test 1: System Info
try {
    Write-Host "`nTEST 1: Judge0 System Info" -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/judge0/system_info/" -Method GET -TimeoutSec 15
    Write-Host "Status: $($response.status)" -ForegroundColor Green
    if ($response.judge0_info) {
        Write-Host "Judge0 Version: $($response.judge0_info.version)" -ForegroundColor Green
    }
    Write-Host "PASS" -ForegroundColor Green
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
}

# Test 2: Submit Python Code
try {
    Write-Host "`nTEST 2: Submit Python Code (2+2)" -ForegroundColor Yellow
    $body = @{ 
        language_id = 71
        source_code = "print(2+2)"
    } | ConvertTo-Json -Compress
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/judge0/submit/" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
    Write-Host "Status: $($response.status)" -ForegroundColor Green
    Write-Host "Output: $($response.execution.output)" -ForegroundColor Green
    Write-Host "Time: $($response.execution.time)" -ForegroundColor Green
    Write-Host "PASS" -ForegroundColor Green
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
}

# Test 3: Submit C Code
try {
    Write-Host "`nTEST 3: Submit C Code" -ForegroundColor Yellow
    $body = @{ 
        language_id = 50
        source_code = "#include <stdio.h>`nint main(){`n  int s=0;`n  for(int i=0;i<100;i++) s+=i;`n  printf(`"Sum: %d`",s);`n  return 0;`n}"
    } | ConvertTo-Json -Compress
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/judge0/submit/" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
    Write-Host "Status: $($response.status)" -ForegroundColor Green
    Write-Host "Output: $($response.execution.output)" -ForegroundColor Green
    Write-Host "Time: $($response.execution.time)" -ForegroundColor Green
    Write-Host "PASS" -ForegroundColor Green
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
}

Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host "Tests completed!" -ForegroundColor Cyan
