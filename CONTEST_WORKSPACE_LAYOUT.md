# Contest Workspace Layout - Same as Problems Page ✅

## Overview
The contest workspace now uses the **exact same layout** as the regular problems page (`/problems`) - with problem list on the left, description in the middle, and code editor on the right, all in one unified view.

---

## 🎯 Layout Structure

```
┌────────────────────────────────────────────────────────────────────────┐
│  [← Back]  Contest Title                    Score: 45  ⏱️ 00:45:23    │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────┬─────────────────────────┬──────────────────────────┐  │
│  │ Problems │ Description             │ Code Editor              │  │
│  │          │                         │                          │  │
│  │ [Hide]   │ [Description|Submissions│ [JavaScript ▼]          │  │
│  │          │                         │                          │  │
│  │ ✓ 1. Two │ # Two Sum               │ function twoSum() {      │  │
│  │   Sum    │                         │   // Your code here      │  │
│  │   Easy   │ Find two numbers...     │ }                        │  │
│  │          │                         │                          │  │
│  │ ○ 2. Val │ Examples:               │ [Run] [Submit]           │  │
│  │   Paren  │ Input: [2,7,11,15]      │                          │  │
│  │   Easy   │ Output: [0,1]           │ ────────────────────────│  │
│  │          │                         │ Output:                  │  │
│  │ ○ 3. Add │ Hints:                  │ Run code to see output...│  │
│  │   Two    │ 💡 Use hash table       │                          │  │
│  │   Medium │                         │                          │  │
│  │          │                         │                          │  │
│  └──────────┴─────────────────────────┴──────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Three-Column Layout

### Left Column: Problem List (Collapsible)
- **Show/Hide toggle** - Collapse to save space
- **Problem cards** with:
  - ✓ Checkmark for solved problems
  - ○ Circle for unsolved problems
  - Problem number and title
  - Difficulty level
  - Active state highlighting
- **Solved counter** - "3/5 Solved"
- **Scrollable** - For contests with many problems

### Middle Column: Problem Description
- **Tab navigation**:
  - Description tab
  - Submissions tab
- **Problem details**:
  - Title and difficulty badge
  - Tags
  - Description text
  - Examples with input/output
  - Hints (if available)
- **Submission history**:
  - Status badges (Accepted/Wrong Answer)
  - Language and score
  - Timestamp

### Right Column: Code Editor
- **Monaco Editor** (same as problems page)
- **Language selector** dropdown
- **Action buttons**:
  - Run - Test with custom input
  - Submit - Official submission
- **Output panel**:
  - Shows execution results
  - Custom input section (collapsible)
  - Scrollable output

---

## 🔄 User Flow

### 1. Start Contest
```
Contest List → Click "Start Contest" → Contest Workspace
```

### 2. Solve Problems
```
1. Problem list shows all problems
2. Click on a problem → Description loads in middle
3. Write code in editor on right
4. Click "Run" → Test with custom input
5. Click "Submit" → Official submission
6. Problem marked as solved (✓)
7. Click next problem → Repeat
```

### 3. Navigation
```
- Click problem in list → Switch to that problem
- Click "Back" → Return to contest list
- Sidebar toggle → Show/hide problem list
- Tab switch → Description ↔ Submissions
```

---

## 🎯 Key Features

### Same as Problems Page
✅ Three-column layout  
✅ Monaco code editor  
✅ Collapsible sidebar  
✅ Tab navigation  
✅ Run and Submit buttons  
✅ Output panel  
✅ Custom input support  
✅ Syntax highlighting  
✅ Dark theme editor  

### Contest-Specific
✅ Timer display in header  
✅ Score tracking  
✅ Solved counter  
✅ Auto-submit on timer expiry  
✅ Time-based restrictions  
✅ Submission history per problem  

---

## 📊 Component Structure

```
ContestWorkspacePage
├── Header
│   ├── Back button
│   ├── Contest title
│   ├── Score display
│   └── Timer
├── Time-up warning (if expired)
└── Three-column layout
    ├── Left: Problem List Sidebar
    │   ├── Show/Hide toggle
    │   ├── Solved counter
    │   └── Problem cards (clickable)
    ├── Middle: Description Panel
    │   ├── Tab bar (Description/Submissions)
    │   ├── Problem content
    │   │   ├── Title and tags
    │   │   ├── Description
    │   │   ├── Examples
    │   │   └── Hints
    │   └── Submissions list
    └── Right: Editor Panel
        ├── Toolbar
        │   ├── Language selector
        │   └── Run/Submit buttons
        ├── Monaco Editor
        └── Output Panel
            ├── Output header
            ├── Custom input (collapsible)
            └── Output content
```

---

## 🎨 Styling

### Uses Existing CSS Classes
```css
.page-stack
.problem-page
.page-header
.compact-header
.problem-page-header
.workspace-title-row
.back-to-list-btn
.problem-header-meta
.workspace-brief
.problem-layout
.leetcode-layout
.problem-sidebar
.judge-sidebar
.sidebar-toggle
.problem-section-list
.problem-section-card
.problem-description-panel
.judge-description
.tab-bar
.compact-tabs
.tab-button
.scroll-column
.editor-panel
.judge-editor
.editor-toolbar
.language-select
.editor-container
.output-panel
.output-header
.output-content
```

**Result:** Looks identical to `/problems` page!

---

## 🔧 Technical Implementation

### State Management
```javascript
const [contest, setContest] = useState(null);
const [problems, setProblems] = useState([]);
const [selectedProblemSlug, setSelectedProblemSlug] = useState(null);
const [selectedProblem, setSelectedProblem] = useState(null);
const [code, setCode] = useState('');
const [language, setLanguage] = useState('JavaScript');
const [output, setOutput] = useState('');
const [timeRemaining, setTimeRemaining] = useState(null);
const [sidebarOpen, setSidebarOpen] = useState(true);
const [problemDetailTab, setProblemDetailTab] = useState('description');
```

### Problem Selection
```javascript
async function selectProblem(slug) {
  setSelectedProblemSlug(slug);
  setProblemDetailTab('description');
  
  // Load problem details
  const res = await fetch(`/api/student/contests/${contestId}/problems/${slug}/`);
  const data = await res.json();
  setSelectedProblem(data);
  
  // Reset code to starter template
  setCode(starterCodeByLanguage[language]);
  setOutput('');
}
```

### Code Execution
```javascript
async function handleRunCode() {
  const result = await runCodeExecution({
    sourceCode: code,
    language: language,
    stdin: customInput,
    problemSlug: selectedProblemSlug,
    isSubmit: false,
  });
  setOutput(result.stdout || result.stderr);
}
```

### Submission
```javascript
async function handleSubmit() {
  const languageId = getLanguageIdForChoice(language);
  
  const res = await fetch(
    `/api/student/contests/${contestId}/problems/${selectedProblemSlug}/submit/`,
    {
      method: 'POST',
      body: JSON.stringify({
        source_code: code,
        language: language,
        language_id: languageId,
      }),
    }
  );
  
  const data = await res.json();
  // Show results and reload to update solved status
}
```

---

## 🎯 Benefits

### 1. Familiar Interface
- Students already know how to use it
- Same as regular practice problems
- No learning curve

### 2. Efficient Workflow
- All problems visible at once
- Quick switching between problems
- No page reloads

### 3. Better UX
- See progress at a glance
- Compare problems easily
- Smooth transitions

### 4. Consistent Design
- Uses same CSS classes
- Same Monaco editor
- Same Judge0 backend

---

## 📁 Files Created/Modified

### Created
```
✅ frontend/src/components/student/pages/ContestWorkspacePage.jsx (NEW)
```

### Modified
```
✅ frontend/src/components/student/pages/ContestContainer.jsx
   - Simplified to 2 views (list/workspace)
   - Removed detail and problem views
   - Direct navigation to workspace
```

---

## ✅ Verification

### Visual Check
- [ ] Three columns visible
- [ ] Problem list on left
- [ ] Description in middle
- [ ] Editor on right
- [ ] Timer in header
- [ ] Looks like `/problems` page

### Functional Check
- [ ] Can click problems in list
- [ ] Description updates
- [ ] Code editor works
- [ ] Run button executes code
- [ ] Submit button works
- [ ] Solved problems marked with ✓
- [ ] Timer counts down
- [ ] Sidebar can collapse

### Navigation Check
- [ ] Start contest → Opens workspace
- [ ] Back button → Returns to list
- [ ] Problem switching works
- [ ] Tab switching works
- [ ] Sidebar toggle works

---

## 🚀 Usage

### For Students

**Step 1: Start Contest**
```
1. Go to Contests page
2. Click "Start Contest"
3. Confirm in modal
4. → Opens workspace with all problems
```

**Step 2: Solve Problems**
```
1. See all problems in left sidebar
2. Click on Problem 1
3. Read description in middle
4. Write code in right editor
5. Click "Run" to test
6. Click "Submit" for official submission
7. Problem marked as solved ✓
8. Click Problem 2 to continue
```

**Step 3: Switch Problems**
```
- Click any problem in left list
- Description and editor update
- Previous code is lost (by design)
- Each problem starts fresh
```

**Step 4: Finish**
```
- Solve all problems or wait for timer
- Auto-submit when time expires
- Click "Back" to return to contest list
```

---

## 🎉 Result

The contest workspace now provides:
- ✅ Same layout as `/problems` page
- ✅ All problems visible in one view
- ✅ Quick problem switching
- ✅ Familiar interface
- ✅ Efficient workflow
- ✅ Run and Submit in same place
- ✅ No separate pages for each problem

**Students can solve all contest problems in one unified workspace!** 🚀

---

**Status:** COMPLETE ✅  
**Layout:** Same as Problems Page  
**Navigation:** List → Workspace (all problems)  
**Last Updated:** April 15, 2026
