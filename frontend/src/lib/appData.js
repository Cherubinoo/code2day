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
    duration: "~18 weeks",
    focus: "Arrays, strings, browser logic, component thinking",
    status: "Ready",
    phases: [
      {
        name: "Phase 1 — Core Web Foundations",
        duration: "3 weeks",
        topics: ["HTML5 Semantics", "Accessibility (ARIA)", "CSS Grid & Flexbox", "Custom Properties", "Responsive Design", "Browser DevTools", "Git & GitHub"]
      },
      {
        name: "Phase 2 — JavaScript Deep Dive",
        duration: "4 weeks",
        topics: ["ES2024+ Features", "Closures & Scope", "Promises & async/await", "Array/String methods", "DOM Manipulation", "Fetch API", "Event Loop internals"]
      },
      {
        name: "Phase 3 — React 19 & TypeScript",
        duration: "5 weeks",
        topics: ["React 19 Actions & Server Components", "TypeScript generics", "Custom Hooks", "React Query v5", "Zustand state management", "Vite & Turbopack"]
      },
      {
        name: "Phase 4 — Styling Systems",
        duration: "3 weeks",
        topics: ["Tailwind CSS v4", "shadcn/ui", "Design Tokens", "Storybook 8", "Radix UI", "Figma-to-Code workflow"]
      },
      {
        name: "Phase 5 — Performance & Modern Stack",
        duration: "3 weeks",
        topics: ["Core Web Vitals", "Next.js 15 App Router", "Edge Functions", "Vercel AI SDK", "WebAssembly basics", "Micro-frontends"]
      }
    ],
    youtube: [
      { name: "Fireship", detail: "100 Seconds + React deep dives" },
      { name: "Kevin Powell", detail: "Advanced CSS mastery" },
      { name: "Jack Herrington", detail: "React 19 & patterns" },
      { name: "Theo (t3.gg)", detail: "Modern full stack" }
    ],
    courses: [
      { name: "The Odin Project", link: "theodinproject.com", detail: "free full frontend path" },
      { name: "Total TypeScript", link: "totaltypescript.com", detail: "by Matt Pocock" },
      { name: "CSS for JS Devs", link: "css-for-js.dev", detail: "by Josh W. Comeau" },
      { name: "Zero to Mastery", link: "zerotomastery.io", detail: "React Developer 2025" }
    ]
  },
  {
    id: "backend-developer",
    role: "Backend Developer",
    title: "API & Data Structures",
    duration: "~20 weeks",
    focus: "Hashing, SQL, trees, service-style problem solving",
    status: "Ready",
    phases: [
      {
        name: "Phase 1 — DSA Foundations",
        duration: "4 weeks",
        topics: ["Big O Notation", "Hashing & Hash Maps", "Binary Trees & BST", "Heaps", "Graph Traversal (BFS/DFS)", "Two Pointers", "Sliding Window"]
      },
      {
        name: "Phase 2 — Server & API Fundamentals",
        duration: "4 weeks",
        topics: ["Node.js Event Loop", "Express.js / Fastify", "REST API design", "HTTP & Status Codes", "Middleware patterns", "Rate limiting", "JWT Authentication"]
      },
      {
        name: "Phase 3 — Databases & SQL",
        duration: "4 weeks",
        topics: ["SQL Joins & Aggregation", "Indexes & Query Plans", "Transactions & ACID", "PostgreSQL advanced", "Redis Caching", "Drizzle/Prisma ORM", "MongoDB basics"]
      },
      {
        name: "Phase 4 — System Design Basics",
        duration: "4 weeks",
        topics: ["Load Balancing", "Microservices vs Monolith", "Message Queues (Kafka/RabbitMQ)", "API Gateways", "OAuth 2.0/OIDC", "Docker", "tRPC & GraphQL"]
      },
      {
        name: "Phase 5 — Cloud & Production",
        duration: "4 weeks",
        topics: ["AWS/GCP core services", "Container orchestration", "CI/CD Pipelines", "Observability & Logging", "gRPC", "Serverless Functions", "Security best practices"]
      }
    ],
    youtube: [
      { name: "Hussein Nasser", detail: "Backend engineering deep dives" },
      { name: "ByteByteGo", detail: "System design explained" },
      { name: "Fireship", detail: "Backend & DevOps shorts" },
      { name: "NeetCode", detail: "DSA problem breakdowns" }
    ],
    courses: [
      { name: "Boot.dev", link: "boot.dev", detail: "Backend Developer path (Go/Python)" },
      { name: "NeetCode.io", link: "neetcode.io", detail: "DSA + System Design" },
      { name: "Udemy", link: "udemy.com", detail: "Node.js, Express, MongoDB Bootcamp (Jonas S.)" },
      { name: "freeCodeCamp", link: "freecodecamp.org", detail: "Back End Dev & APIs (free)" }
    ]
  },
  {
    id: "full-stack-developer",
    role: "Full Stack Developer",
    title: "Product Builder Path",
    duration: "~22 weeks",
    focus: "Mixed DSA, SQL, implementation, debugging",
    status: "Ready",
    phases: [
      {
        name: "Phase 1 — Unified Foundations",
        duration: "3 weeks",
        topics: ["JS/TS fundamentals", "Git workflow", "Linux CLI basics", "HTTP protocol", "JSON & REST", "Debugging tools"]
      },
      {
        name: "Phase 2 — Frontend with React",
        duration: "4 weeks",
        topics: ["React 19", "Next.js 15 App Router", "TypeScript", "Tailwind CSS", "shadcn/ui", "React Hook Form", "Zod validation"]
      },
      {
        name: "Phase 3 — Backend + Database",
        duration: "5 weeks",
        topics: ["Node.js / Bun runtime", "tRPC or REST APIs", "PostgreSQL", "Drizzle ORM", "Redis", "Auth.js / Clerk", "File uploads with S3"]
      },
      {
        name: "Phase 4 — DSA & Implementation",
        duration: "5 weeks",
        topics: ["Binary Search", "Stacks & Queues", "Linked Lists", "Dynamic Programming", "SQL optimization", "Debugging strategies", "Code review skills"]
      },
      {
        name: "Phase 5 — Deploy & Scale",
        duration: "5 weeks",
        topics: ["Vercel / Railway deployment", "Docker basics", "GitHub Actions CI/CD", "Observability", "Performance profiling", "AI integrations (LLM APIs)", "SaaS product patterns"]
      }
    ],
    youtube: [
      { name: "Theo (t3.gg)", detail: "Full stack with T3 Stack" },
      { name: "Traversy Media", detail: "Full stack projects" },
      { name: "Web Dev Simplified", detail: "Clear concept breakdowns" },
      { name: "Hamed Bahram", detail: "Next.js deep dives" }
    ],
    courses: [
      { name: "Fullstack Open", link: "fullstackopen.com", detail: "University of Helsinki (free)" },
      { name: "create.t3.gg", link: "create.t3.gg", detail: "T3 Stack docs & starter (free)" },
      { name: "Udemy", link: "udemy.com", detail: "MERN Stack Front To Back 2025" },
      { name: "Zero to Mastery", link: "zerotomastery.io", detail: "Full Stack Developer" }
    ]
  },
  {
    id: "data-analyst",
    role: "Data Analyst",
    title: "SQL & Reporting",
    duration: "~16 weeks",
    focus: "Joins, aggregation, query logic, clean reporting",
    status: "Ready",
    phases: [
      {
        name: "Phase 1 — SQL from Zero to Fluent",
        duration: "4 weeks",
        topics: ["SELECT fundamentals", "JOINs (inner/outer/cross)", "GROUP BY & Aggregation", "Subqueries & CTEs", "Window Functions (ROW_NUMBER, RANK, LAG/LEAD)", "NULL handling", "Index basics"]
      },
      {
        name: "Phase 2 — Python for Analysis",
        duration: "3 weeks",
        topics: ["pandas DataFrames", "NumPy arrays", "Data cleaning & wrangling", "Matplotlib / Seaborn", "Jupyter Notebooks", "String & date parsing", "EDA workflows"]
      },
      {
        name: "Phase 3 — BI Tools & Visualization",
        duration: "3 weeks",
        topics: ["Power BI Desktop", "DAX basics", "Tableau fundamentals", "Chart design best practices", "Dashboard storytelling", "Google Looker Studio"]
      },
      {
        name: "Phase 4 — Data Warehousing & dbt",
        duration: "3 weeks",
        topics: ["Star vs Snowflake schema", "BigQuery / Snowflake", "dbt Core (models, tests, docs)", "ETL vs ELT", "Airflow basics", "Data quality checks"]
      },
      {
        name: "Phase 5 — Business & Advanced Analytics",
        duration: "3 weeks",
        topics: ["A/B Testing & statistics", "Cohort analysis", "Funnel metrics", "Revenue attribution", "Excel advanced (pivot tables, Power Query)", "AI-assisted analysis"]
      }
    ],
    youtube: [
      { name: "Alex The Analyst", detail: "Full analyst playlist" },
      { name: "Luke Barousse", detail: "Data analyst roadmap 2025" },
      { name: "Tina Huang", detail: "SQL & data science" },
      { name: "Ken Jee", detail: "Data career & projects" }
    ],
    courses: [
      { name: "Kaggle", link: "kaggle.com/learn", detail: "free SQL & Python courses" },
      { name: "DataCamp", link: "datacamp.com", detail: "Data Analyst with SQL career track" },
      { name: "Udemy", link: "udemy.com", detail: "The Complete SQL Bootcamp by Jose Portilla" },
      { name: "dbt Learn", link: "courses.getdbt.com", detail: "Official free dbt fundamentals" }
    ]
  },
  {
    id: "software-engineer",
    role: "Software Engineer",
    title: "Placement Core Track",
    duration: "~20 weeks",
    focus: "Binary search, stacks, linked lists, contest fundamentals",
    status: "Ready",
    phases: [
      {
        name: "Phase 1 — Complexity & Problem Thinking",
        duration: "2 weeks",
        topics: ["Big O", "Theta", "Omega", "Amortized analysis", "Space vs time tradeoffs", "Recursion tree method", "Benchmarking & profiling"]
      },
      {
        name: "Phase 2 — Linear Data Structures",
        duration: "4 weeks",
        topics: ["Arrays & Dynamic arrays", "Singly & Doubly Linked Lists", "Stacks & Queues", "Monotonic Stacks", "Two Pointers", "Sliding Window", "Prefix Sums"]
      },
      {
        name: "Phase 3 — Non-Linear Structures",
        duration: "5 weeks",
        topics: ["Binary Trees traversal (in/pre/post)", "Binary Search Trees", "Heaps & Heapify", "Graphs (adjacency list/matrix)", "BFS & DFS patterns", "Topological Sort", "Union-Find / Disjoint Set"]
      },
      {
        name: "Phase 4 — Algorithms & Patterns",
        duration: "5 weeks",
        topics: ["Binary Search variants", "Divide & Conquer", "Greedy algorithms", "Backtracking", "DP — 1D & 2D (knapsack, LCS, LIS)", "String algorithms (KMP)", "Bit manipulation"]
      },
      {
        name: "Phase 5 — Contest & Mock Practice",
        duration: "4 weeks",
        topics: ["Codeforces Div 2 problems", "LeetCode weekly contests", "System Design basics", "STAR behavioral answers", "Peer mock interviews", "Resume optimization"]
      }
    ],
    youtube: [
      { name: "NeetCode", detail: "LeetCode solutions with pattern recognition" },
      { name: "Abdul Bari", detail: "Algorithm deep dives (must-watch)" },
      { name: "Striver (TakeUForward)", detail: "DSA sheet walkthroughs" },
      { name: "Errichto", detail: "Competitive programming techniques" }
    ],
    courses: [
      { name: "Striver's A-Z DSA Sheet", link: "takeuforward.org", detail: "free sheet walkthroughs" },
      { name: "NeetCode.io", link: "neetcode.io", detail: "Roadmap + 150 problems" },
      { name: "Udemy", link: "udemy.com", detail: "Master the Coding Interview by Andrei Neagoie" },
      { name: "AlgoExpert", link: "algoexpert.io", detail: "160 curated problems" }
    ]
  },
  {
    id: "qa-automation-engineer",
    role: "QA Automation Engineer",
    title: "Logic & Validation Track",
    duration: "~18 weeks",
    focus: "Edge cases, parsing, state checking, practical coding",
    status: "Ready",
    phases: [
      {
        name: "Phase 1 — Testing Fundamentals",
        duration: "3 weeks",
        topics: ["Test types (unit/integration/E2E)", "Test pyramid strategy", "Black box vs white box", "Bug lifecycle", "Equivalence partitioning", "Boundary value analysis", "Test case design"]
      },
      {
        name: "Phase 2 — API Testing & Validation",
        duration: "4 weeks",
        topics: ["REST API concepts", "Postman collections & environments", "JSON Schema validation", "Auth testing (JWT/OAuth)", "Error code coverage", "Data-driven testing", "pytest / REST Assured"]
      },
      {
        name: "Phase 3 — UI Test Automation",
        duration: "4 weeks",
        topics: ["Playwright (industry standard in 2025)", "Cypress fundamentals", "Page Object Model", "Locator strategies", "Flakiness handling", "Screenshot diffing", "Accessibility automation (axe-core)"]
      },
      {
        name: "Phase 4 — State & Logic Testing",
        duration: "3 weeks",
        topics: ["State machine testing", "Decision table testing", "Pairwise testing", "Edge case enumeration", "Regex & parsing checks", "Form validation edge cases", "Race condition testing"]
      },
      {
        name: "Phase 5 — CI/CD & Reporting",
        duration: "4 weeks",
        topics: ["GitHub Actions for tests", "Docker test environments", "Allure Reports", "Jira/Zephyr integration", "Performance testing with k6", "Security testing basics", "Test coverage metrics"]
      }
    ],
    youtube: [
      { name: "Playwright Official", detail: "Modern E2E testing tutorials" },
      { name: "SDET Unicorns", detail: "Full QA roadmap 2025" },
      { name: "Naveen AutomationLabs", detail: "Selenium & API testing" },
      { name: "Execute Automation", detail: "Cypress & Playwright series" }
    ],
    courses: [
      { name: "Test Automation University", link: "testautomationu.applitools.com", detail: "by Applitools (free)" },
      { name: "Udemy", link: "udemy.com", detail: "Playwright with TypeScript (LambdaTest)" },
      { name: "Udemy", link: "udemy.com", detail: "Complete Java Selenium WebDriver by Rahul Shetty" },
      { name: "Ministry of Testing Dojo", link: "ministryoftesting.com", detail: "Professional QA community" }
    ]
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
  { id: "aptitude", label: "Aptitude", icon: Brain },
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
