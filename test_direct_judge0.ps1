# Test Judge0 directly
$ErrorActionPreference = "Stop"

Write-Host "Testing Judge0 Directly at 172.16.4.111:2358..." -ForegroundColor Cyan

# Test 1: System Info
try {
    Write-Host "`nTEST 1: Direct System Info" -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "http://172.16.4.111:2358/system_info" -Method GET -TimeoutSec 10
    Write-Host "Response: $($response | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
}

# Test 2: Submit without base64 (simple JSON)
try {
    Write-Host "`nTEST 2: Simple JSON submission (no base64)" -ForegroundColor Yellow
    $body = @{ 
        language_id = 71
        source_code = "print(2+2)"
        stdin = ""
    } | ConvertTo-Json -Compress
    
    $response = Invoke-RestMethod -Uri "http://172.16.4.111:2358/submissions?wait=true" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
    Write-Host "Status ID: $($response.status.id)" -ForegroundColor Green
    Write-Host "Status Desc: $($response.status.description)" -ForegroundColor Green
    Write-Host "Stdout: $($response.stdout)" -ForegroundColor Green
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
}

# Test 3: Submit with base64
try {
    Write-Host "`nTEST 3: Base64 encoded submission" -ForegroundColor Yellow
    $source = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("print(2+2)"))
    $stdin = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(""))
    
    $body = @{ 
        language_id = 71
        source_code = $source
        stdin = $stdin
        base64_encoded = $true
    } | ConvertTo-Json -Compress
    
    $response = Invoke-RestMethod -Uri "http://172.16.4.111:2358/submissions?wait=true&base64_encoded=true" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
    Write-Host "Status ID: $($response.status.id)" -ForegroundColor Green
    if ($response.stdout) {
        $stdout = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($response.stdout))
        Write-Host "Stdout (decoded): $stdout" -ForegroundColor Green
    }
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
}

Write-Host "`nDirect tests completed!" -ForegroundColor Cyan
