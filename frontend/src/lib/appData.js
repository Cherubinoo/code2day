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
  editor: {
    starter_code: starterCodeByLanguage.JavaScript,
  },
};

export const fallbackProblems = [
  {
    title: "Two Sum Variants",
    slug: "two-sum-variants",
    description: "Given an array of integers `nums` and an integer `target`, return **indices** of the two numbers such that they add up to `target`. You may assume that each input would have **exactly one solution**, and you may not use the same element twice.",
    difficulty: "Easy",
    tags: ["Array", "Hash Map"],
    is_daily: true,
    progress_state: "open",
    available_languages: ["JavaScript", "Python", "Java", "C++", "C", "C#", "Go", "Rust", "TypeScript", "PHP", "Ruby", "Swift", "Kotlin"],
    examples: [
      { input: "nums = [2,7,11,15], target = 9", output: "[0,1]", explanation: "Because nums[0] + nums[1] == 9, we return [0, 1]." },
      { input: "nums = [3,2,4], target = 6", output: "[1,2]", explanation: "Because nums[1] + nums[2] == 6, we return [1, 2]." },
      { input: "nums = [3,3], target = 6", output: "[0,1]", explanation: "Because nums[0] + nums[1] == 6, we return [0, 1]." }
    ],
    hints: ["Try using a hash map to store complement values", "For each number, check if (target - current) exists in the map", "Return the indices when you find the complement"],
    sample_output: "Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]\n\nInput: nums = [3,2,4], target = 6\nOutput: [1,2]"
  },
  {
    title: "Binary Search Basics",
    slug: "binary-search-basics",
    description: "Given an array of integers `nums` which is sorted in **ascending order**, and an integer `target`, write a function to search `target` in `nums`. If `target` exists, then return its index. Otherwise, return `-1`. You must write an algorithm with `O(log n)` runtime complexity.",
    difficulty: "Easy",
    tags: ["Binary Search", "Array"],
    is_daily: false,
    progress_state: "not_completed",
    available_languages: ["JavaScript", "Python", "Java", "C++", "C", "C#", "Go", "Rust", "TypeScript", "PHP", "Ruby", "Swift", "Kotlin"],
    examples: [
      { input: "nums = [-1,0,3,5,9,12], target = 9", output: "4", explanation: "9 exists in nums and its index is 4" },
      { input: "nums = [-1,0,3,5,9,12], target = 2", output: "-1", explanation: "2 does not exist in nums so return -1" }
    ],
    hints: ["Calculate the middle index of the current search range", "Compare the middle element with the target", "Eliminate half of the search space based on comparison"],
    sample_output: "Input: nums = [-1,0,3,5,9,12], target = 9\nOutput: 4\n\nInput: nums = [-1,0,3,5,9,12], target = 2\nOutput: -1"
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
    description: "Given a string `s` containing just the characters `'('`, `')'`, `'{'`, `'}'`, `'['` and `']'`, determine if the input string is **valid**.\\n\\nAn input string is **valid** if:\\n1. Open brackets must be closed by the same type of brackets.\\n2. Open brackets must be closed in the correct order.\\n3. Every close bracket has a corresponding open bracket of the same type.",
    difficulty: "Medium",
    tags: ["Stack", "String"],
    is_daily: false,
    progress_state: "not_completed",
    available_languages: ["JavaScript", "Python", "Java", "C++", "C", "C#", "Go", "Rust", "TypeScript", "PHP", "Ruby", "Swift", "Kotlin"],
    examples: [
      { input: "s = \"()\"", output: "true", explanation: "Simple valid parentheses" },
      { input: "s = \"()[]{}\"", output: "true", explanation: "Multiple valid bracket types" },
      { input: "s = \"(]\"", output: "false", explanation: "Mismatched bracket types" },
      { input: "s = \"([)]\"", output: "false", explanation: "Wrong closing order" }
    ],
    hints: ["Use a stack data structure", "Push opening brackets onto the stack", "When you see a closing bracket, check if it matches the top of stack"],
    sample_output: "Input: s = \"()\"\\nOutput: true\\n\\nInput: s = \"(]\"\\nOutput: false"
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
    description: "You are given an array of `k` linked-lists `lists`, each linked-list is sorted in **ascending order**. Merge all the linked-lists into **one sorted** linked-list and return it.",
    difficulty: "Hard",
    tags: ["Heap", "Linked List"],
    is_daily: false,
    progress_state: "completed",
    available_languages: ["JavaScript", "Python", "Java", "C++", "C", "C#", "Go", "Rust", "TypeScript", "PHP", "Ruby", "Swift", "Kotlin"],
    examples: [
      { input: "lists = [[1,4,5],[1,3,4],[2,6]]", output: "[1,1,2,3,4,4,5,6]", explanation: "The linked-lists are: [1->4->5, 1->3->4, 2->6] Merging them into one sorted list: 1->1->2->3->4->4->5->6" },
      { input: "lists = []", output: "[]", explanation: "Empty list of lists" },
      { input: "lists = [[]]", output: "[]", explanation: "List containing empty list" }
    ],
    hints: ["Consider using a min-heap/priority queue", "Compare the head of each list to find the minimum", "Add the next element from the same list after extracting min"],
    sample_output: "Input: lists = [[1,4,5],[1,3,4],[2,6]]\nOutput: [1,1,2,3,4,4,5,6]\n\nInput: lists = []\nOutput: []"
  },
  {
    title: "Median of Two Sorted Arrays",
    slug: "median-of-two-sorted-arrays",
    description: "Given two sorted arrays `nums1` and `nums2` of size `m` and `n` respectively, return the median of the two sorted arrays.",
    difficulty: "Hard",
    tags: ["Array", "Binary Search", "Divide and Conquer"],
    is_daily: false,
    progress_state: "not_completed",
    available_languages: ["JavaScript", "Python", "Java", "C++", "C", "C#", "Go", "Rust", "TypeScript", "PHP", "Ruby", "Swift", "Kotlin"],
    examples: [
      { input: "nums1 = [1,3], nums2 = [2]", output: "2.00000", explanation: "Merged array = [1,2,3] and median is 2." },
      { input: "nums1 = [1,2], nums2 = [3,4]", output: "2.50000", explanation: "Merged array = [1,2,3,4] and median is (2 + 3) / 2 = 2.5." },
      { input: "nums1 = [], nums2 = [1]", output: "1.00000", explanation: "Only element is 1, median is 1." }
    ],
    hints: ["Think about binary search on the smaller array", "Partition both arrays such that left half contains half of total elements", "Find the correct partition where all left elements <= all right elements"],
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
