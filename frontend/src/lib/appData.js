function buildFallbackCalendar() {
  const base = [
    1, 2, 0, 3, 2, 1, 4,
    0, 1, 3, 2, 1, 0, 2,
    3, 2, 2, 4, 1, 0, 1,
    2, 4, 3, 2, 1, 1, 0,
    3, 1, 2, 4, 2, 3, 1,
  ];
  const today = new Date();

  return base.map((count, index) => {
    const current = new Date(today);
    current.setDate(today.getDate() - (base.length - index - 1));

    return {
      date: current.toISOString().slice(0, 10),
      count,
      weekday: current.toLocaleDateString("en-US", { weekday: "short" }),
      day: current.getDate(),
    };
  });
}

export const starterCodeByLanguage = {
  JavaScript: `function solve(input) {
  return input;
}`,
  Python: `def solve(input_data):
    return input_data`,
  Java: `class Solution {
    public Object solve(Object input) {
        return input;
    }
}`,
  "C++": `#include <bits/stdc++.h>
using namespace std;

int main() {
    return 0;
}`,
  SQL: `SELECT *
FROM practice_table
LIMIT 10;`,
};

export const editorLanguageByChoice = {
  JavaScript: "javascript",
  Python: "python",
  Java: "java",
  "C++": "cpp",
  SQL: "sql",
};

export const fallbackDashboard = {
  user: {
    name: "Student One",
    title: "Imported from college admission database",
    streak: 21,
    loginDays: 58,
    rank: "Campus Rank #12",
    registerNumber: "953624243083",
    email: "student@example.com",
  },
  dailyProblem: {
    title: "Two Sum Variants",
    difficulty: "Easy",
    description:
      "Return the pair of indices whose values add up to a target using an approach that improves on brute force.",
    tags: ["Array", "Hash Map", "Warm-up"],
  },
  stats: {
    easy: 84,
    medium: 46,
    hard: 12,
  },
  weeklyActivity: [
    { day: "Mon", count: 2 },
    { day: "Tue", count: 1 },
    { day: "Wed", count: 3 },
    { day: "Thu", count: 2 },
    { day: "Fri", count: 4 },
    { day: "Sat", count: 1 },
    { day: "Sun", count: 2 },
  ],
  activityCalendar: buildFallbackCalendar(),
  consistencyLabel: "Activity calendar",
  leaderboard: [
    { name: "Arun", solved: 146 },
    { name: "Meera", solved: 132 },
    { name: "Kavin", solved: 118 },
  ],
  editor: {
    starter_code: starterCodeByLanguage.JavaScript,
  },
};

export const fallbackProblems = [
  {
    title: "Two Sum Variants",
    slug: "two-sum-variants",
    description: "Return the pair of indices whose values add up to a target.",
    difficulty: "Easy",
    tags: ["Array", "Hash Map"],
    is_daily: true,
    progress_state: "open",
    available_languages: ["JavaScript", "Python", "Java", "C++"],
  },
  {
    title: "Binary Search Basics",
    slug: "binary-search-basics",
    description: "Find the target position inside a sorted array with logarithmic time.",
    difficulty: "Easy",
    tags: ["Binary Search", "Array"],
    is_daily: false,
    progress_state: "not_completed",
    available_languages: ["JavaScript", "Python", "Java", "C++"],
  },
  {
    title: "Customer Order Summary",
    slug: "customer-order-summary",
    description: "Write a SQL query to summarize orders by customer and total amount.",
    difficulty: "Easy",
    tags: ["SQL"],
    is_daily: false,
    progress_state: "not_completed",
    available_languages: ["SQL"],
  },
  {
    title: "Balanced Brackets",
    slug: "balanced-brackets",
    description: "Validate whether an input string of brackets is correctly nested.",
    difficulty: "Medium",
    tags: ["Stack", "String"],
    is_daily: false,
    progress_state: "not_completed",
    available_languages: ["JavaScript", "Python", "Java", "C++"],
  },
  {
    title: "Monthly Revenue Report",
    slug: "monthly-revenue-report",
    description: "Build an aggregate SQL report that groups monthly revenue by product line.",
    difficulty: "Medium",
    tags: ["SQL"],
    is_daily: false,
    progress_state: "open",
    available_languages: ["SQL"],
  },
  {
    title: "Merge K Lists",
    slug: "merge-k-lists",
    description: "Merge multiple sorted linked lists into one sorted list.",
    difficulty: "Hard",
    tags: ["Heap", "Linked List"],
    is_daily: false,
    progress_state: "completed",
    available_languages: ["JavaScript", "Python", "Java", "C++"],
  },
  {
    title: "Warehouse Stock Audit",
    slug: "warehouse-stock-audit",
    description: "Use nested SQL logic to identify stock mismatches across warehouse snapshots.",
    difficulty: "Hard",
    tags: ["SQL"],
    is_daily: false,
    progress_state: "not_completed",
    available_languages: ["SQL"],
  },
];

export const roleTracks = [
  {
    id: "frontend-developer",
    role: "Frontend Developer",
    title: "UI Logic Sprint",
    focus: "Arrays, strings, browser logic, component thinking",
    status: "Roadmap update soon",
  },
  {
    id: "backend-developer",
    role: "Backend Developer",
    title: "API and Data Structures",
    focus: "Hashing, SQL, trees, service-style problem solving",
    status: "Roadmap update soon",
  },
  {
    id: "full-stack-developer",
    role: "Full Stack Developer",
    title: "Product Builder Path",
    focus: "Mixed DSA, SQL, implementation, debugging",
    status: "Roadmap update soon",
  },
  {
    id: "data-analyst",
    role: "Data Analyst",
    title: "SQL and Reporting",
    focus: "Joins, aggregation, query logic, clean reporting",
    status: "Roadmap update soon",
  },
  {
    id: "software-engineer",
    role: "Software Engineer",
    title: "Placement Core Track",
    focus: "Binary search, stacks, linked lists, contest fundamentals",
    status: "Roadmap update soon",
  },
  {
    id: "qa-automation-engineer",
    role: "QA Automation Engineer",
    title: "Logic and Validation Track",
    focus: "Edge cases, parsing, state checking, practical coding",
    status: "Roadmap update soon",
  },
];

export const featuredPaths = [
  {
    title: "Roadmap Updates",
    subtitle: "Detailed role roadmaps will be attached here soon for guided learning.",
    accent: "olive",
    detail: "Use the current role cards to explore practice until the roadmap release.",
  },
  {
    title: "Contest Notice",
    subtitle: "Weekly role-focused contests will continue to appear with direct solve entry.",
    accent: "sage",
    detail: "Join from Contest and continue inside the same coding workspace.",
  },
  {
    title: "SQL Practice Lane",
    subtitle: "Database practice will expand here with more SQL rounds and query sets.",
    accent: "clay",
    detail: "Current SQL questions already stay available in the problem filters.",
  },
  {
    title: "Placement Prep",
    subtitle: "More campus-ready revision lanes and announcements will be added shortly.",
    accent: "olive",
    detail: "Track new additions from this announcement panel.",
  },
];

export const conceptOptions = [
  "All Concepts",
  "Array",
  "Hash Map",
  "String",
  "Stack",
  "Binary Search",
  "Heap",
  "Linked List",
  "SQL",
];

export const languageOptions = ["JavaScript", "Python", "Java", "C++", "SQL"];

export const contestCards = [
  {
    id: "weekly-campus-contest",
    name: "Weekly Campus Contest",
    state: "Live",
    timing: "Today, 6:30 PM to 8:00 PM",
    detail: "4 problems, rank by speed and accuracy.",
    durationMinutes: 90,
    problems: ["two-sum-variants", "balanced-brackets", "merge-k-lists"],
  },
  {
    id: "backend-role-faceoff",
    name: "Backend Role Faceoff",
    state: "Upcoming",
    timing: "Tomorrow, 7:00 PM",
    detail: "Mixed backend-style coding and API logic challenge.",
    durationMinutes: 75,
    problems: ["binary-search-basics", "balanced-brackets", "merge-k-lists"],
  },
  {
    id: "sql-backend-sprint",
    name: "SQL Backend Sprint",
    state: "Upcoming",
    timing: "Sunday, 10:00 AM",
    detail: "3 database-focused problems for reporting, joins, and logic.",
    durationMinutes: 60,
    problems: ["customer-order-summary", "monthly-revenue-report", "warehouse-stock-audit"],
  },
];

export const resultCards = [
  { title: "Strongest Area", value: "Easy Problems", note: "84 solved with 92% success rate" },
  { title: "Focus Next", value: "Medium Problems", note: "46 solved, best room for growth" },
  { title: "Contest Peak", value: "Top 12%", note: "Best finish in last 5 contests" },
];

export const discussionThreads = [
  {
    author: "Meera",
    problem: "Two Sum Variants",
    tag: "@two-sum-variants",
    body: "Is everyone solving this with hashing first, or are you also comparing the sorted-two-pointer explanation for interviews?",
  },
  {
    author: "Kavin",
    problem: "Balanced Brackets",
    tag: "@balanced-brackets",
    body: "My stack approach passes, but I want a cleaner explanation for the final interview round. Sharing patterns would help.",
  },
  {
    author: "Arun",
    problem: "Merge K Lists",
    tag: "@merge-k-lists",
    body: "Can someone explain why the heap solution is preferred over repeated merging in contest settings?",
  },
];

export const navItems = [
  { id: "explore", label: "Explore" },
  { id: "roadmaps", label: "Roadmaps" },
  { id: "problems", label: "Problems" },
  { id: "contest", label: "Contest" },
  { id: "progress", label: "Progress" },
  { id: "discuss", label: "Discuss" },
];

export const difficultyOrder = ["All Levels", "Easy", "Medium", "Hard"];
export const authStorageKey = "code2day-register-number";
export const progressSections = [
  { key: "open", label: "Open" },
  { key: "completed", label: "Completed" },
  { key: "not_completed", label: "Not Completed" },
];
