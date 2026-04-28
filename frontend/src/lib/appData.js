import { LayoutGrid, Map, Code2, Building2, Brain, FolderCode, Trophy, BarChart3, MessageSquare, Database, Terminal } from "lucide-react";

function buildFallbackCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  
  // Get first and last day of current month
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  
  // Calculate padding to fill calendar grid (start from Sunday)
  const startWeekday = monthStart.getDay(); // Sunday=0
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(monthStart.getDate() - startWeekday);
  
  const endWeekday = monthEnd.getDay();
  const endPadding = 6 - endWeekday;
  const calendarEnd = new Date(monthEnd);
  calendarEnd.setDate(monthEnd.getDate() + endPadding);
  
  // Generate random activity pattern for demo
  const calendar = [];
  const current = new Date(calendarStart);
  
  while (current <= calendarEnd) {
    // Random activity count (0-4) with higher probability for current month
    const isCurrentMonth = current.getMonth() === month;
    const count = isCurrentMonth 
      ? Math.floor(Math.random() * 5) // 0-4 for current month
      : Math.floor(Math.random() * 3); // 0-2 for padding days
    
    calendar.push({
      date: current.toISOString().slice(0, 10),
      count,
      weekday: current.toLocaleDateString("en-US", { weekday: "short" }),
      day: current.getDate(),
    });
    
    current.setDate(current.getDate() + 1);
  }
  
  return calendar;
}

export const starterCodeByLanguage = {
  "SQL": `-- SQL Practice Problem
-- Write your PostgreSQL query below
SELECT * FROM table_name;
`,
  "C": `#include <stdio.h>
#include <string.h>

void solve(const char* raw_input) {
    // Parse raw_input for this problem and print the final answer.
    printf("%s", raw_input);
}

int main(void) {
    char raw_input[65536];
    size_t total = fread(raw_input, 1, sizeof(raw_input) - 1, stdin);
    raw_input[total] = '\0';

    while (total > 0 && (raw_input[total - 1] == '\n' || raw_input[total - 1] == '\r')) {
        raw_input[--total] = '\0';
    }

    solve(raw_input);
    return 0;
}`,
  "C++": `#include <iostream>
#include <iterator>
#include <string>

using namespace std;

string solve(const string& rawInput) {
    // Parse rawInput for this problem and return the final answer.
    return rawInput;
}

int main() {
    string rawInput((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
    while (!rawInput.empty() && (rawInput.back() == '\n' || rawInput.back() == '\r')) {
        rawInput.pop_back();
    }

    string result = solve(rawInput);
    cout << result;
    return 0;
}`,
  Java: `import java.io.IOException;

public class Main {
    static String solve(String rawInput) {
        // Parse rawInput for this problem and return the final answer.
        return rawInput;
    }

    public static void main(String[] args) throws IOException {
        String rawInput = new String(System.in.readAllBytes()).stripTrailing();
        String result = solve(rawInput);
        if (result != null) {
            System.out.print(result);
        }
    }
}`,
  JavaScript: `const fs = require("fs");

const input = fs.readFileSync(0, "utf8").trimEnd();

function solve(rawInput) {
  // Parse rawInput for this problem and return the final answer.
  return rawInput;
}

const result = solve(input);
if (result !== undefined) {
  process.stdout.write(String(result));
}`,
  Python: `import sys


def solve(raw_input):
    # Parse raw_input for this problem and return the final answer.
    return raw_input


if __name__ == "__main__":
    raw_input = sys.stdin.read().rstrip("\n")
    result = solve(raw_input)
    if result is not None:
        sys.stdout.write(str(result))`,
};

export const editorLanguageByChoice = {
  "C": "c",
  "C++": "cpp",
  Java: "java",
  JavaScript: "javascript",
  Python: "python",
};

export const fallbackDashboard = {
  user: {
    name: "Student One",
    title: "",
    streak: 21,
    loginDays: 58,
    rank: "Campus Rank #12",
    registerNumber: "95362324xxxx",
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
  announcements: [],
  editor: {
    starter_code: starterCodeByLanguage.JavaScript,
  },
};

function generateMoreProblems(count = 150) {
  const difficulties = ["Easy", "Medium", "Hard"];
  const tags = ["Array", "String", "Hash Map", "Stack", "Binary Search", "Heap", "Linked List", "SQL"];
  const states = ["not_completed", "open", "completed"];
  
  return Array.from({ length: count }, (_, i) => {
    const id = i + 1;
    const difficulty = difficulties[i % 3];
    const state = i < 45 ? "completed" : i < 60 ? "open" : "not_completed";
    const tag = tags[i % tags.length];
    
    return {
      title: `Problem ${id}: ${difficulty} Challenge`,
      slug: `problem-${id}`,
      description: `This is a generated description for problem ${id}. Solve this ${difficulty} challenge using ${tag} concepts.\\n\\n1. Read input.\\n2. Process data.\\n3. Print result.`,
      difficulty,
      tags: [tag, "Practice"],
      is_daily: i % 10 === 0,
      progress_state: state,
      available_languages: ["JavaScript", "Python", "Java", "C++", "C"],
      examples: [
        { input: "example input", output: "example output", explanation: "Explanation for example" }
      ],
      hints: ["Try to think about the constraints", "Use efficient data structures"],
    };
  });
}

export const fallbackProblems = [
  ...generateMoreProblems(155)
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

export const languageOptions = [
  "C",
  "C++",
  "Java",
  "JavaScript",
  "Python",
];

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
  { id: "explore", label: "Explore", icon: LayoutGrid },
  { id: "roadmaps", label: "Roadmaps", icon: Map },
  { id: "problems", label: "Problems", icon: Code2 },
  { id: "company", label: "Companies", icon: Building2 },

  { id: "contest", label: "Contest", icon: Trophy },
  { id: "progress", label: "Progress", icon: BarChart3 },
  { id: "discuss", label: "Discuss", icon: MessageSquare },
];

export const difficultyOrder = ["All Levels", "Easy", "Medium", "Hard"];
export const authStorageKey = "code2day-register-number";
export const progressSections = [
  { key: "open", label: "Open" },
  { key: "completed", label: "Completed" },
  { key: "not_completed", label: "Not Completed" },
];
