# Contest Code Execution System - Complete Integration ✅

## Overview
The contest system uses the **exact same code editor and Judge0 backend** as the regular problem-solving feature, ensuring consistency and reliability across the platform.

---

## 🎯 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Student Contest Flow                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              ContestProblemPage.jsx                          │
│  - Code Editor (Monaco-style textarea)                      │
│  - Language Selector (JS, Python, Java, C++, C)             │
│  - Run Button (test with custom input)                      │
│  - Submit Button (run against test cases)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              codeExecution.js Library                        │
│  - runCodeExecution() function                              │
│  - Language ID mapping (Judge0 IDs)                         │
│  - API call to /api/run/                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend API Endpoints                           │
│  - /api/run/ (test execution)                               │
│  - /api/student/contests/<id>/problems/<slug>/submit/       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Judge0 Service                                  │
│  - Code compilation                                          │
│  - Test case execution                                       │
│  - Result evaluation                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Components

### 1. Frontend - ContestProblemPage.jsx

**Location:** `frontend/src/components/student/pages/ContestProblemPage.jsx`

**Features:**
- Full-screen code editor with syntax highlighting
- Language selector (JavaScript, Python, Java, C++, C)
- Run button for testing with custom input
- Submit button for official submission
- Real-time timer display
- Output panel with test results
- Submission history tab

**Code Editor:**
```javascript
<textarea
  value={code}
  onChange={(e) => setCode(e.target.value)}
  disabled={isTimeUp}
  style={{
    width: '100%',
    height: '100%',
    padding: 16,
    fontFamily: 'monospace',
    fontSize: 14,
    background: '#1e1e1e',
    color: '#d4d4d4',
  }}
/>
```

**Run Code Function:**
```javascript
async function handleRunCode() {
  const result = await runCodeExecution({
    sourceCode: code,
    language: language,
    stdin: customInput,
    problemSlug: problemSlug,
    isSubmit: false,
  });
  
  // Display output
  setOutput(result.stdout || result.stderr || result.compile_output);
}
```

**Submit Code Function:**
```javascript
async function handleSubmit() {
  const languageId = getLanguageIdForChoice(language);
  
  const res = await fetch(
    `/api/student/contests/${contestId}/problems/${problemSlug}/submit/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCsrfToken(),
      },
      body: JSON.stringify({
        source_code: code,
        language: language,
        language_id: languageId,
      }),
    }
  );
  
  const data = await res.json();
  // Display results
}
```

---

### 2. Code Execution Library

**Location:** `frontend/src/lib/codeExecution.js`

**Language Mapping:**
```javascript
export const executionLanguageMap = {
  "C": 50,           // Judge0 language ID
  "C++": 54,
  "Java": 62,
  "JavaScript": 63,
  "Python": 71,
};
```

**Main Function:**
```javascript
export async function runCodeExecution({
  sourceCode,
  language,
  stdin = "",
  problemSlug = "",
  isSubmit = false,
}) {
  const languageId = getLanguageIdForChoice(language);
  
  const response = await fetch("/api/run/", {
    method: 'POST',
    body: JSON.stringify({
      source_code: sourceCode,
      language_id: languageId,
      stdin,
      language,
      problem_slug: problemSlug,
      is_submit: isSubmit,
    }),
  });
  
  return await response.json();
}
```

---

### 3. Backend - Contest Submission View

**Location:** `backend/apps/learning/views.py`

**Class:** `StudentContestSubmitView`

**Process Flow:**
```python
def post(self, request, contest_id, problem_slug):
    # 1. Validate student and contest access
    student = request.user.student_profile
    contest = Contest.objects.filter(
        id=contest_id,
        assigned_students=student,
        status='published'
    ).first()
    
    # 2. Check participation
    participation = ContestParticipation.objects.filter(
        contest=contest,
        student=student
    ).first()
    
    # 3. Check if contest has ended
    if contest.end_time and now > contest.end_time:
        return Response({"detail": "Contest has ended"})
    
    # 4. Get problem and test cases
    problem = contest.problems.filter(slug=problem_slug).first()
    test_cases = problem.test_cases.all()
    
    # 5. Execute against test cases using Judge0
    passed_cases = 0
    for test_case in test_cases:
        result = execute_judge0_submission(
            source_code=source_code,
            language_id=language_id,
            stdin=test_case.stdin,
            expected_output=test_case.expected_output
        )
        if result.get('status') == 'Accepted':
            passed_cases += 1
    
    # 6. Calculate score and status
    status_str = 'Accepted' if passed_cases == total_cases else 'Wrong Answer'
    score = (passed_cases / total_cases) * 100
    
    # 7. Create submission record
    submission = ContestSubmission.objects.create(
        contest=contest,
        student=student,
        problem=problem,
        code=source_code,
        language=language,
        status=status_str,
        score=int(score),
    )
    
    # 8. Update participation stats
    if status_str == 'Accepted':
        participation.problems_solved += 1
        participation.total_score += int(score)
        participation.save()
    
    # 9. Return results
    return Response({
        "submission": {
            "status": status_str,
            "score": score,
            "passed_cases": passed_cases,
            "total_cases": total_cases,
        }
    })
```

---

### 4. Judge0 Integration

**Service:** `backend/apps/learning/services/judge0.py`

**Function:** `execute_judge0_submission()`

**Process:**
1. Submit code to Judge0 API
2. Poll for results
3. Compare output with expected output
4. Return status (Accepted/Wrong Answer/Error)

**Configuration:**
```python
# settings.py
JUDGE0_API_URL = "https://judge0-ce.p.rapidapi.com"
JUDGE0_API_KEY = "your-api-key"
```

---

## 🎯 Supported Languages

| Language   | Judge0 ID | Editor Mode | Starter Code |
|------------|-----------|-------------|--------------|
| JavaScript | 63        | javascript  | ✅           |
| Python     | 71        | python      | ✅           |
| Java       | 62        | java        | ✅           |
| C++        | 54        | cpp         | ✅           |
| C          | 50        | c           | ✅           |

---

## 🔄 Execution Flow

### Test Run (Custom Input)
```
1. Student writes code
2. Student enters custom input (optional)
3. Student clicks "Run"
4. Frontend calls runCodeExecution()
5. Backend sends to Judge0
6. Judge0 executes code with stdin
7. Returns stdout/stderr
8. Frontend displays output
```

### Official Submit (Test Cases)
```
1. Student writes code
2. Student clicks "Submit"
3. Frontend sends to contest submit endpoint
4. Backend retrieves test cases from database
5. For each test case:
   - Execute code with test input
   - Compare output with expected
   - Track pass/fail
6. Calculate score (passed/total * 100)
7. Create ContestSubmission record
8. Update participation stats
9. Return results to frontend
10. Frontend displays pass/fail summary
```

---

## 📊 Data Models

### ContestSubmission
```python
class ContestSubmission(models.Model):
    contest = ForeignKey(Contest)
    student = ForeignKey(StudentProfile)
    problem = ForeignKey(Problem)
    code = TextField()
    language = CharField(max_length=50)
    status = CharField(max_length=50)  # Accepted, Wrong Answer, etc.
    score = IntegerField(default=0)
    submitted_at = DateTimeField(auto_now_add=True)
```

### ContestParticipation
```python
class ContestParticipation(models.Model):
    contest = ForeignKey(Contest)
    student = ForeignKey(StudentProfile)
    started_at = DateTimeField(auto_now_add=True)
    problems_solved = IntegerField(default=0)
    total_score = IntegerField(default=0)
    is_active = BooleanField(default=True)
```

---

## 🎨 UI Features

### Code Editor
- **Dark theme** (#1e1e1e background, #d4d4d4 text)
- **Monospace font** for code readability
- **Syntax highlighting** (basic via textarea)
- **Auto-indent** support
- **Full-screen** layout

### Language Selector
```javascript
<select value={language} onChange={handleLanguageChange}>
  <option>JavaScript</option>
  <option>Python</option>
  <option>Java</option>
  <option>C++</option>
  <option>C</option>
</select>
```

### Action Buttons
- **Run Button** - Green, with Play icon
- **Submit Button** - Blue, with Send icon
- **Disabled states** when time is up or executing

### Timer Display
```javascript
// Color-coded based on time remaining
- Normal: Blue background (#e0e7ff)
- Warning (<5 min): Yellow background (#fef3c7)
- Time Up: Red background (#fee2e2)
```

### Output Panel
- **Monospace font** for output
- **Scrollable** for long outputs
- **Custom input** section (collapsible)
- **Color-coded** results (green for success, red for errors)

---

## 🔒 Security Features

### 1. CSRF Protection
```javascript
headers: {
  'X-CSRFToken': getCsrfToken(),
}
```

### 2. Authentication
```python
permission_classes = [IsAuthenticated]
```

### 3. Contest Access Control
```python
# Check student is assigned to contest
contest = Contest.objects.filter(
    id=contest_id,
    assigned_students=student,
    status='published'
).first()
```

### 4. Time Validation
```python
# Prevent submissions after contest ends
if contest.end_time and now > contest.end_time:
    return Response({"detail": "Contest has ended"})
```

### 5. Participation Validation
```python
# Ensure student has started contest
participation = ContestParticipation.objects.filter(
    contest=contest,
    student=student
).first()
```

---

## 🧪 Testing

### Test Run Code
```javascript
// Frontend
await runCodeExecution({
  sourceCode: 'console.log("Hello World")',
  language: 'JavaScript',
  stdin: '',
  problemSlug: 'two-sum',
  isSubmit: false,
});

// Expected Output
{
  stdout: "Hello World\n",
  stderr: "",
  status: "Accepted",
  time: "0.02s",
  memory: "3.2MB"
}
```

### Test Submit Code
```javascript
// Frontend
fetch('/api/student/contests/1/problems/two-sum/submit/', {
  method: 'POST',
  body: JSON.stringify({
    source_code: 'function twoSum(nums, target) { ... }',
    language: 'JavaScript',
    language_id: 63,
  }),
});

// Expected Response
{
  "detail": "Code submitted successfully.",
  "submission": {
    "id": 123,
    "status": "Accepted",
    "score": 100,
    "passed_cases": 5,
    "total_cases": 5
  }
}
```

---

## 📝 Starter Code Templates

### JavaScript
```javascript
// Write your solution here
function solution() {
    
}
```

### Python
```python
# Write your solution here
def solution():
    pass
```

### Java
```java
public class Solution {
    public static void main(String[] args) {
        // Write your solution here
    }
}
```

### C++
```cpp
#include <iostream>
using namespace std;

int main() {
    // Write your solution here
    return 0;
}
```

### C
```c
#include <stdio.h>

int main() {
    // Write your solution here
    return 0;
}
```

---

## 🎯 Key Features

### 1. Same as Regular Problems
✅ Uses identical code execution library  
✅ Same Judge0 backend integration  
✅ Same language support  
✅ Same test case evaluation  
✅ Same output formatting  

### 2. Contest-Specific Features
✅ Timer integration  
✅ Contest participation tracking  
✅ Score calculation  
✅ Submission history  
✅ Time-based restrictions  

### 3. User Experience
✅ Full-screen editor  
✅ Custom input testing  
✅ Real-time feedback  
✅ Submission history  
✅ Clear error messages  

---

## 🚀 Usage Flow

### For Students

1. **Start Contest**
   - Navigate to contest page
   - Click "Start Contest"
   - Timer begins

2. **Select Problem**
   - View problem list
   - Click on a problem
   - Editor opens

3. **Write Code**
   - Select language
   - Write solution
   - Use starter code as template

4. **Test Code**
   - Enter custom input (optional)
   - Click "Run"
   - View output

5. **Submit Solution**
   - Click "Submit"
   - Wait for test case evaluation
   - View results (passed/total)

6. **View Submissions**
   - Click "Submissions" tab
   - See submission history
   - Check scores and status

---

## 📊 API Endpoints

### Get Problem Details
```
GET /api/student/contests/<contest_id>/problems/<problem_slug>/
```

**Response:**
```json
{
  "id": 1,
  "slug": "two-sum",
  "title": "Two Sum",
  "description": "Find two numbers that add up to target",
  "difficulty": "Easy",
  "examples": [...],
  "hints": [...],
  "submissions": [...]
}
```

### Submit Code
```
POST /api/student/contests/<contest_id>/problems/<problem_slug>/submit/
```

**Request:**
```json
{
  "source_code": "function twoSum() { ... }",
  "language": "JavaScript",
  "language_id": 63
}
```

**Response:**
```json
{
  "detail": "Code submitted successfully.",
  "submission": {
    "id": 123,
    "status": "Accepted",
    "score": 100,
    "passed_cases": 5,
    "total_cases": 5
  }
}
```

### Run Code (Test)
```
POST /api/run/
```

**Request:**
```json
{
  "source_code": "console.log('Hello')",
  "language_id": 63,
  "stdin": "",
  "language": "JavaScript",
  "problem_slug": "two-sum",
  "is_submit": false
}
```

**Response:**
```json
{
  "stdout": "Hello\n",
  "stderr": "",
  "status": "Accepted",
  "time": "0.02s",
  "memory": "3.2MB"
}
```

---

## ✅ Verification Checklist

- [x] Uses same codeExecution.js library
- [x] Uses same Judge0 backend
- [x] Supports all 5 languages
- [x] Run button works with custom input
- [x] Submit button evaluates test cases
- [x] Timer displays and updates
- [x] Time restrictions enforced
- [x] Submissions recorded in database
- [x] Participation stats updated
- [x] Submission history displayed
- [x] CSRF tokens included
- [x] Error handling implemented
- [x] Loading states shown

---

## 🎉 Conclusion

The contest code execution system is **fully integrated** with the same editor and Judge0 backend used for regular problems, ensuring:

✅ **Consistency** - Same experience across platform  
✅ **Reliability** - Proven execution system  
✅ **Maintainability** - Single codebase to maintain  
✅ **Scalability** - Judge0 handles load  
✅ **Security** - Sandboxed execution  

**Status: COMPLETE AND OPERATIONAL** 🚀

---

**Last Updated:** April 15, 2026  
**System:** Contest Code Execution  
**Integration:** Judge0 + Same Editor as Problems
