# Judge0 Test Script for Windows PowerShell
# Tests basic functionality of Judge0 installation

param(
    [string]$Judge0Url = "http://localhost:2358",
    [int]$Timeout = 30
)

# Colors for output
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"
$Blue = "Cyan"

function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Red
}

function Write-Header {
    param([string]$Message)
    Write-Host $Message -ForegroundColor $Blue
}

function Test-SystemInfo {
    Write-Status "Testing Judge0 system info..."
    try {
        $response = Invoke-RestMethod -Uri "$Judge0Url/system_info" -TimeoutSec 10
        Write-Status "✅ Judge0 is running!"
        Write-Status "   Version: $($response.version)"
        Write-Status "   Languages available: $($response.languages.Count)"
        return $true
    }
    catch {
        Write-Error "❌ System info failed: $($_.Exception.Message)"
        return $false
    }
}

function Test-Languages {
    Write-Status "`n🌐 Testing available languages..."
    try {
        $languages = Invoke-RestMethod -Uri "$Judge0Url/languages" -TimeoutSec 10
        Write-Status "✅ Found $($languages.Count) languages:"
        
        # Show some popular languages
        $popular = @('C++', 'Python', 'Java', 'JavaScript', 'C#', 'Go', 'Rust')
        foreach ($lang in $languages) {
            if ($lang.name -in $popular) {
                Write-Status "   • $($lang.name) (ID: $($lang.id))"
            }
        }
        return $true
    }
    catch {
        Write-Error "❌ Languages test failed: $($_.Exception.Message)"
        return $false
    }
}

function Submit-AndWait {
    param(
        [string]$SourceCode,
        [int]$LanguageId,
        [string]$LanguageName,
        [string]$ExpectedOutput = $null
    )
    
    Write-Status "`n🧪 Testing $LanguageName..."
    
    # Prepare submission data
    $submissionData = @{
        source_code = $SourceCode
        language_id = $LanguageId
        stdin = ""
    }
    
    if ($ExpectedOutput) {
        $submissionData.expected_output = $ExpectedOutput
    }
    
    try {
        # Submit code
        $response = Invoke-RestMethod -Uri "$Judge0Url/submissions" -Method Post -Body ($submissionData | ConvertTo-Json) -ContentType "application/json" -TimeoutSec $Timeout
        
        if ($response.status.description -eq 'Accepted') {
            Write-Status "✅ $LanguageName test passed!"
            Write-Status "   Output: $($response.stdout.Trim())"
            return $true
        }
        else {
            Write-Error "❌ $LanguageName test failed!"
            Write-Error "   Status: $($response.status.description)"
            if ($response.stderr) {
                Write-Error "   Error: $($response.stderr.Trim())"
            }
            return $false
        }
    }
    catch {
        Write-Error "❌ $LanguageName error: $($_.Exception.Message)"
        return $false
    }
}

function Run-Tests {
    Write-Header "🚀 Starting Judge0 Tests"
    Write-Header "=" * 50
    
    # Test system info
    if (-not (Test-SystemInfo)) {
        Write-Error "`n❌ Judge0 is not responding. Please check your installation."
        return $false
    }
    
    # Test languages
    if (-not (Test-Languages)) {
        Write-Error "`n❌ Could not fetch languages. Please check your installation."
        return $false
    }
    
    # Test code execution
    $tests = @(
        @{
            name = "C++"
            language_id = 54
            source_code = '#include <iostream>
int main() {
    std::cout << "Hello Judge0!" << std::endl;
    return 0;
}'
            expected = "Hello Judge0!"
        },
        @{
            name = "Python 3"
            language_id = 71
            source_code = 'print("Hello from Python!")'
            expected = "Hello from Python!"
        },
        @{
            name = "JavaScript"
            language_id = 63
            source_code = 'console.log("Hello from JavaScript!");'
            expected = "Hello from JavaScript!"
        },
        @{
            name = "Java"
            language_id = 62
            source_code = 'public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from Java!");
    }
}'
            expected = "Hello from Java!"
        }
    )
    
    $passed = 0
    $total = $tests.Count
    
    foreach ($test in $tests) {
        if (Submit-AndWait -SourceCode $test.source_code -LanguageId $test.language_id -LanguageName $test.name -ExpectedOutput $test.expected) {
            $passed++
        }
    }
    
    Write-Header "`n$('=' * 50)"
    Write-Header "🎯 Test Results: $passed/$total tests passed"
    
    if ($passed -eq $total) {
        Write-Status "🎉 All tests passed! Judge0 is working perfectly!"
        return $true
    }
    else {
        Write-Warning "⚠️  Some tests failed. Please check your Judge0 configuration."
        return $false
    }
}

# Main execution
$success = Run-Tests

if ($success) {
    exit 0
} else {
    exit 1
}