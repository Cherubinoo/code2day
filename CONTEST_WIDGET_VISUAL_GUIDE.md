# Contest Widget Visual Guide

## 📊 Component Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│                        My Contests Section                          │
│                  Your contest participation and performance         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐│
│  │ 🏆 Total     │  │ ▶️ Participated│  │ ✅ Completed │  │ 🎯 Prob ││
│  │ Contests     │  │              │  │              │  │ Solved  ││
│  │              │  │              │  │              │  │         ││
│  │      4       │  │      2       │  │      1       │  │    15   ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────┘│
│   Purple Gradient   Pink Gradient    Blue Gradient    Green Grad  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [ ▶️ Active (2) ]  [ 📅 Upcoming (1) ]  [ ✅ Completed (1) ]      │
│   ─────────────                                                     │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ 🏆 Spring Coding Challenge              [ Active Now 🟢 ]   │  │
│  │                                                               │  │
│  │ Test your skills with algorithmic problems                   │  │
│  │                                                               │  │
│  │ 📅 Start: Apr 15, 07:15  ⏱️ Duration: 60 min  🎯 Problems: 5│  │
│  │                                                               │  │
│  │ ┌─────────────────────────────────────────────────────────┐ │  │
│  │ │ Your Progress                                           │ │  │
│  │ │ 3/5 solved    45 points                    In Progress  │ │  │
│  │ │ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │  │
│  │ └─────────────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ 🏆 Algorithm Mastery Contest             [ Active Now 🟢 ]   │  │
│  │                                                               │  │
│  │ Advanced data structures and algorithms                      │  │
│  │                                                               │  │
│  │ 📅 Start: Apr 15, 08:00  ⏱️ Duration: 90 min  🎯 Problems: 8│  │
│  │                                                               │  │
│  │                    [ Start Contest ]                          │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Color Scheme

### Statistics Cards

#### Total Contests (Purple)
```
┌─────────────────────┐
│ Background:         │
│ #667eea → #764ba2   │
│ (Purple gradient)   │
│                     │
│ 🏆 Total Contests   │
│        4            │
└─────────────────────┘
```

#### Participated (Pink)
```
┌─────────────────────┐
│ Background:         │
│ #f093fb → #f5576c   │
│ (Pink gradient)     │
│                     │
│ ▶️ Participated     │
│        2            │
└─────────────────────┘
```

#### Completed (Blue)
```
┌─────────────────────┐
│ Background:         │
│ #4facfe → #00f2fe   │
│ (Blue gradient)     │
│                     │
│ ✅ Completed        │
│        1            │
└─────────────────────┘
```

#### Problems Solved (Green)
```
┌─────────────────────┐
│ Background:         │
│ #43e97b → #38f9d7   │
│ (Green gradient)    │
│                     │
│ 🎯 Problems Solved  │
│       15            │
└─────────────────────┘
```

---

## 🏷️ Status Badges

### Active Contest
```
┌──────────────┐
│ Active Now 🟢│  Background: #dcfce7 (light green)
└──────────────┘  Text: #22c55e (green)
```

### Upcoming Contest
```
┌──────────────┐
│ Upcoming 🔵  │  Background: #dbeafe (light blue)
└──────────────┘  Text: #3b82f6 (blue)
```

### Completed Contest
```
┌──────────────┐
│ Completed ⚪ │  Background: #f3f4f6 (light gray)
└──────────────┘  Text: #6b7280 (gray)
```

---

## 📱 Responsive Layouts

### Desktop (1200px+)
```
┌────────────────────────────────────────────────────────┐
│  [Card 1]    [Card 2]    [Card 3]    [Card 4]         │
│  4 columns                                             │
└────────────────────────────────────────────────────────┘
```

### Tablet (768px - 1199px)
```
┌────────────────────────────────────┐
│  [Card 1]    [Card 2]              │
│  [Card 3]    [Card 4]              │
│  2 columns                         │
└────────────────────────────────────┘
```

### Mobile (< 768px)
```
┌──────────────┐
│  [Card 1]    │
│  [Card 2]    │
│  [Card 3]    │
│  [Card 4]    │
│  1 column    │
└──────────────┘
```

---

## 🎯 Contest Card States

### Not Started (Active Contest)
```
┌─────────────────────────────────────────────────┐
│ 🏆 Contest Title              [ Active Now 🟢 ] │
│                                                 │
│ Contest description text here                   │
│                                                 │
│ 📅 Apr 15, 07:15  ⏱️ 60 min  🎯 5 problems     │
│                                                 │
│              [ Start Contest ]                  │
│              (Blue button)                      │
└─────────────────────────────────────────────────┘
```

### In Progress
```
┌─────────────────────────────────────────────────┐
│ 🏆 Contest Title              [ Active Now 🟢 ] │
│                                                 │
│ Contest description text here                   │
│                                                 │
│ 📅 Apr 15, 07:15  ⏱️ 60 min  🎯  5 problems     │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ Your Progress                               │ │
│ │                                             │ │
│ │ 3/5 solved    45 points    [ In Progress ]  │ │
│ │                                             │ │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │
│ │ (60% complete - gradient progress bar)      │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Completed
```
┌─────────────────────────────────────────────────┐
│ 🏆 Contest Title            [ Completed ⚪ ]    │
│                                                 │
│ Contest description text here                   │
│                                                 │
│ 📅 Apr 14, 10:00  ⏱️ 60 min  🎯 5 problems     │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ Your Progress                               │ │
│ │                                             │ │
│ │ 5/5 solved    100 points                    │ │
│ │                                             │ │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ │
│ │ (100% complete - full green bar)            │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Upcoming
```
┌─────────────────────────────────────────────────┐
│ 🏆 Contest Title             [ Upcoming 🔵 ]    │
│                                                 │
│ Contest description text here                   │
│                                                 │
│ 📅 Apr 16, 14:00  ⏱️ 90 min  🎯  8 problems     │
│                                                 │
│ (No action button - contest not started yet)   │
└─────────────────────────────────────────────────┘
```

---

## 🎭 Empty States

### No Contests
```
┌─────────────────────────────────────┐
│                                     │
│              🏆                     │
│         (Large trophy)              │
│                                     │
│    No contests assigned yet         │
│                                     │
│  Check back later for upcoming      │
│           contests                  │
│                                     │
└─────────────────────────────────────┘
```

### No Active Contests
```
┌─────────────────────────────────────┐
│                                     │
│              🎯                     │
│         (Target icon)               │
│                                     │
│      No active contests             │
│                                     │
└─────────────────────────────────────┘
```

### Loading State
```
┌─────────────────────────────────────┐
│                                     │
│              ⏳                     │
│         (Hourglass)                 │
│                                     │
│      Loading contests...            │
│                                     │
└─────────────────────────────────────┘
```

### Error State
```
┌─────────────────────────────────────┐
│                                     │
│              ⚠️                     │
│         (Warning icon)              │
│                                     │
│   Failed to load contests           │
│   [Error message here]              │
│                                     │
└─────────────────────────────────────┘
```

---

## 🎬 Animations & Interactions

### Card Hover Effect
```
Before Hover:
┌─────────────────┐
│   Contest Card  │  transform: translateY(0)
└─────────────────┘  box-shadow: none

On Hover:
┌─────────────────┐
│   Contest Card  │  transform: translateY(-2px)
└─────────────────┘  box-shadow: 0 4px 12px rgba(0,0,0,0.1)
     ↑ Lifts up
```

### Progress Bar Animation
```
Initial:
[░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  0%

Animates to:
[▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░]  60%
 ← Smooth transition (0.3s ease)
```

### Tab Switch
```
Active Tab:
[ ▶️ Active (2) ]  ← Blue background, white text
  ─────────────

Inactive Tab:
[ 📅 Upcoming (1) ]  ← Transparent, muted text
```

---

## 📐 Spacing & Dimensions

### Statistics Cards
```
Padding: 1.25rem (20px)
Border Radius: 12px
Gap between cards: 1rem (16px)
Min Width: 200px
```

### Contest Cards
```
Padding: 1.5rem (24px)
Border Radius: 12px
Border: 1px solid var(--border)
Gap between cards: 1rem (16px)
```

### Progress Bar
```
Height: 8px
Border Radius: 4px
Background: var(--bg-1)
Fill: Linear gradient (accent → #667eea)
```

### Buttons
```
Padding: 0.75rem (12px)
Border Radius: 8px
Font Size: 0.875rem (14px)
Font Weight: 600
```

---

## 🎨 Typography

### Card Titles
```
Font Size: 1.125rem (18px)
Font Weight: 600
Color: var(--text)
```

### Statistics Numbers
```
Font Size: 2.5rem (40px)
Font Weight: 700
Color: white
```

### Description Text
```
Font Size: 0.875rem (14px)
Line Height: 1.5
Color: var(--text-muted)
```

### Badge Text
```
Font Size: 0.75rem (12px)
Font Weight: 600
Padding: 0.25rem 0.75rem
Border Radius: 9999px (pill shape)
```

---

## ✨ Key Visual Features

1. **Gradient Backgrounds** - Eye-catching colored gradients for stats
2. **Status Badges** - Clear visual indicators for contest state
3. **Progress Bars** - Animated gradient progress indicators
4. **Hover Effects** - Subtle lift and shadow on interaction
5. **Icons** - Emoji and Lucide icons for visual clarity
6. **Responsive Grid** - Adapts to all screen sizes
7. **Empty States** - Friendly messages when no data
8. **Loading States** - Clear feedback during data fetch

---

## 🎯 Accessibility Features

- Clear color contrast for readability
- Icon + text labels for clarity
- Keyboard navigation support
- Screen reader friendly structure
- Focus states on interactive elements
- Semantic HTML structure

---

**This visual guide shows exactly how the contest widget appears and behaves in the student dashboard!**
