# Contest Creator UI Guide

## Step 2: Select Problems - New Interface

### Tab Navigation
```
┌─────────────────────────────────────────────────────┐
│ [Browse Problems]  [Selected (3)]                   │
│ ═════════════════                                   │
└─────────────────────────────────────────────────────┘
```

### Browse Problems Tab

```
┌─────────────────────────────────────────────────────┐
│ Filters                                             │
│ ┌──────────────────┐  ┌──────────────────┐         │
│ │ Topic            │  │ Difficulty       │         │
│ │ [All Topics ▼]   │  │ [All Difficulties▼]       │
│ └──────────────────┘  └──────────────────┘         │
│                                                     │
│ Problems List                                       │
│ ┌─────────────────────────────────────────────────┐│
│ │ ☑ Two Sum Variants                              ││
│ │   Array  Hash Map                    [Easy]     ││
│ │                                                  ││
│ │ ☐ Balanced Brackets                             ││
│ │   Stack  String                      [Medium]   ││
│ │                                                  ││
│ │ ☑ Longest Substring                             ││
│ │   String  Sliding Window             [Medium]   ││
│ │                                                  ││
│ │ ☐ Binary Tree Traversal                         ││
│ │   Tree  DFS                          [Hard]     ││
│ └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### Selected Problems Tab

```
┌─────────────────────────────────────────────────────┐
│ Selected Problems                                   │
│ ┌─────────────────────────────────────────────────┐│
│ │ ① Two Sum Variants                              ││
│ │   Array  Hash Map  [Easy]      [Remove]        ││
│ │                                                  ││
│ │ ② Longest Substring                             ││
│ │   String  Sliding Window  [Medium]  [Remove]   ││
│ │                                                  ││
│ │ ③ Valid Parentheses                             ││
│ │   Stack  String  [Easy]            [Remove]    ││
│ └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

## Color Legend

### Difficulty Badges
- 🟢 **Easy** - Green background (#d1fae5), green text (#059669)
- 🟡 **Medium** - Yellow background (#fef3c7), orange text (#d97706)
- 🔴 **Hard** - Red background (#fee2e2), red text (#dc2626)

### Topic Tags
- 🔵 **All Topics** - Blue background (#e0e7ff), indigo text (#4338ca)

### Selection States
- ✅ **Selected** - Green background (#f0fdf4), green border (#bbf7d0)
- ⬜ **Not Selected** - Transparent background, no border

### Buttons
- **Remove** - Red background (#fee2e2), red text (#dc2626)
- **Active Tab** - Indigo underline (#4f46e5), bold text
- **Inactive Tab** - Gray text (#666), normal weight

## Interaction Flow

### Selecting Problems
1. User clicks on "Browse Problems" tab (default)
2. User selects filters (optional):
   - Topic: "Array"
   - Difficulty: "Easy"
3. List updates to show only matching problems
4. User clicks checkbox next to problem
5. Problem gets green highlight
6. "Selected" tab counter increases: (0) → (1)

### Reviewing Selection
1. User clicks "Selected" tab
2. Sees numbered list of selected problems
3. Can remove problems by clicking "Remove" button
4. Counter decreases when problem removed

### Deselecting Problems
Two ways:
1. **From Browse tab**: Uncheck the checkbox
2. **From Selected tab**: Click "Remove" button

Both methods work the same way and sync across tabs.

## Empty States

### No Problems in Database
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│              No problems available                  │
│     Please add problems to the database first.      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### No Matching Filters
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│       No problems match the selected filters        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### No Problems Selected
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│            No problems selected                     │
│   Switch to "Browse Problems" tab to select         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Responsive Behavior

### Scrolling
- Browse list: Max height 350px, scrolls vertically
- Selected list: Max height 450px, scrolls vertically
- Filters: Always visible at top

### Overflow
- Long problem titles: Wrap to next line
- Many tags: Show all tags in Selected view, first 3 in Browse view
- Many problems: Scroll to see more

## Keyboard Navigation
- Tab key: Navigate between filters and checkboxes
- Space: Toggle checkbox
- Enter: Click focused button
- Arrow keys: Navigate dropdown options

## Accessibility
- All interactive elements are keyboard accessible
- Color is not the only indicator (text labels present)
- Sufficient color contrast for readability
- Clear focus indicators
