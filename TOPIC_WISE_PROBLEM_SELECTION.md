# Topic-Wise Problem Selection - Enhanced Contest Creator

## New Features

### 1. Two-Tab Interface

#### Browse Problems Tab
- Filter problems by topic and difficulty
- See all available problems with tags
- Select problems with checkboxes
- Visual feedback when problems are selected (green highlight)

#### Selected Problems Tab
- View all selected problems in a clean list
- See problem order (numbered 1, 2, 3...)
- Remove individual problems with "Remove" button
- Shows count in tab label: "Selected (5)"

### 2. Smart Filtering

#### Topic Filter
- Dropdown showing all unique topics from problems
- Topics are extracted from problem tags
- "All Topics" option to see everything
- Automatically sorted alphabetically

#### Difficulty Filter
- Easy / Medium / Hard options
- "All Difficulties" to see everything
- Color-coded badges for quick identification:
  - Easy: Green
  - Medium: Yellow
  - Hard: Red

### 3. Enhanced Problem Display

#### In Browse View
- Problem title (bold)
- Topic tags (up to 3 shown, blue badges)
- Difficulty badge (color-coded)
- Checkbox for selection
- Green background when selected

#### In Selected View
- Numbered list (1, 2, 3...)
- Problem title
- All topic tags
- Difficulty badge
- Remove button (red)
- Clean card layout

## User Flow

### Step 1: Browse and Filter
1. Go to Step 2 in contest creator
2. You start in "Browse Problems" tab
3. Use filters to narrow down problems:
   - Select a topic (e.g., "Array", "Hash Map")
   - Select a difficulty (e.g., "Easy")
4. Problems list updates automatically

### Step 2: Select Problems
1. Click checkboxes to select problems
2. Selected problems get green highlight
3. Counter updates: "Selected (X)"

### Step 3: Review Selection
1. Click "Selected" tab
2. See all selected problems in order
3. Review the list
4. Remove any unwanted problems

### Step 4: Continue
1. Click "Next" to go to Step 3 (Assign Students)
2. Selected problems are saved in the contest

## Visual Design

### Colors
- Primary: Indigo (#4f46e5)
- Success: Green (#059669)
- Warning: Yellow (#d97706)
- Danger: Red (#dc2626)
- Background: Light gray (#f9fafb)

### Layout
- Filters in a grid (2 columns)
- Scrollable problem list (max 350px height)
- Clean spacing and borders
- Smooth transitions

## Technical Details

### State Management
```javascript
const [selectedTopic, setSelectedTopic] = useState('all');
const [selectedDifficulty, setSelectedDifficulty] = useState('all');
const [problemView, setProblemView] = useState('browse');
```

### Helper Functions
- `getUniqueTopics()` - Extracts unique topics from all problems
- `getFilteredProblems()` - Filters problems by topic and difficulty
- `getSelectedProblems()` - Gets full details of selected problems

### Data Structure
Problems must have:
- `slug` (unique identifier)
- `title` (display name)
- `difficulty` (Easy/Medium/Hard)
- `tags` (array of topic strings)

## Example Usage

### Scenario 1: Create Easy Array Problems Contest
1. Set difficulty filter to "Easy"
2. Set topic filter to "Array"
3. Select 3-5 problems
4. Switch to "Selected" tab to review
5. Continue to next step

### Scenario 2: Mixed Difficulty Contest
1. Keep filters on "All"
2. Browse and select problems of different difficulties
3. Use "Selected" tab to ensure good mix
4. Reorder by removing and re-adding if needed

### Scenario 3: Topic-Focused Contest
1. Set topic to "Dynamic Programming"
2. Keep difficulty on "All"
3. Select problems across all difficulties
4. Review in "Selected" tab

## Benefits

1. **Better Organization** - Topic and difficulty filters make it easy to find relevant problems
2. **Clear Selection** - Separate tab shows exactly what's selected
3. **Easy Management** - Remove button allows quick deselection
4. **Visual Feedback** - Color coding and highlights improve UX
5. **Scalability** - Works well even with hundreds of problems

## Testing Checklist

- [ ] Filters update problem list correctly
- [ ] Selecting problems adds them to "Selected" tab
- [ ] Counter updates accurately
- [ ] Remove button works in "Selected" tab
- [ ] Green highlight shows in "Browse" tab for selected problems
- [ ] Empty states show appropriate messages
- [ ] Filters reset when switching between tabs
- [ ] Selected problems persist when switching tabs
- [ ] Can select/deselect same problem from both tabs
