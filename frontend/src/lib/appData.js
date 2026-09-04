import { LayoutGrid, Map, Code2, Building2, Brain, FolderCode, Trophy, BarChart3, MessageSquare, Database, Terminal, FlaskConical, Mic, Swords, Crown } from "lucide-react";

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
    calendar.push({
      date: current.toISOString().slice(0, 10),
      count: 0,
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
  Python: "python",
};

export const fallbackDashboard = {
  user: {
    name: "Student One",
    title: "",
    streak: 0,
    loginDays: 0,
    rank: "",
    registerNumber: "",
    email: "",
  },
  dailyProblem: {
    title: "Two Sum Variants",
    difficulty: "Easy",
    description:
      "Return the pair of indices whose values add up to a target using an approach that improves on brute force.",
    tags: ["Array", "Hash Map", "Warm-up"],
  },
  stats: {
    easy: 0,
    medium: 0,
    hard: 0,
  },
  weeklyActivity: [
    { day: "Mon", count: 0 },
    { day: "Tue", count: 0 },
    { day: "Wed", count: 0 },
    { day: "Thu", count: 0 },
    { day: "Fri", count: 0 },
    { day: "Sat", count: 0 },
    { day: "Sun", count: 0 },
  ],
  activityCalendar: buildFallbackCalendar(),
  consistencyLabel: "Activity calendar",
  leaderboard: [],
  announcements: [],
  editor: {
    starter_code: starterCodeByLanguage.Python,
  },
};

const REAL_PROBLEM_TEMPLATES = [
  {
    title: "Two Sum",
    slug: "two-sum",
    description: "Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nYou can return the answer in any order.",
    difficulty: "Easy",
    tags: ["Array", "Hash Map"],
    examples: [
      { input: "nums = [2,7,11,15], target = 9", output: "[0,1]", explanation: "Because nums[0] + nums[1] == 9, we return [0, 1]." },
      { input: "nums = [3,2,4], target = 6", output: "[1,2]", explanation: "Because nums[1] + nums[2] == 6, we return [1, 2]." }
    ],
    hints: ["Try storing visited values in a hash map to look up targets in O(1) time."]
  },
  {
    title: "Valid Parentheses",
    slug: "valid-parentheses",
    description: "Given a string `s` containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.\n\nAn input string is valid if:\n1. Open brackets must be closed by the same type of brackets.\n2. Open brackets must be closed in the correct order.\n3. Every close bracket has a corresponding open bracket of the same type.",
    difficulty: "Easy",
    tags: ["Stack", "String"],
    examples: [
      { input: "s = \"()[]{}\"", output: "true", explanation: "All open brackets match correctly." },
      { input: "s = \"(]\"", output: "false", explanation: "Mismatched bracket types." }
    ],
    hints: ["Use a stack to keep track of expected closing brackets."]
  },
  {
    title: "Merge Two Sorted Lists",
    slug: "merge-two-sorted-lists",
    description: "You are given the heads of two sorted linked lists `list1` and `list2`.\n\nMerge the two lists into one sorted list. The list should be made by splicing together the nodes of the first two lists.\n\nReturn the head of the merged linked list.",
    difficulty: "Easy",
    tags: ["Linked List", "Two Pointers"],
    examples: [
      { input: "list1 = [1,2,4], list2 = [1,3,4]", output: "[1,1,2,3,4,4]", explanation: "Merged nodes maintain non-decreasing order." }
    ],
    hints: ["Compare elements from both lists one by one using a dummy head node."]
  },
  {
    title: "Longest Substring Without Repeating Characters",
    slug: "longest-substring-without-repeating-characters",
    description: "Given a string `s`, find the length of the longest substring without repeating characters.",
    difficulty: "Medium",
    tags: ["String", "Sliding Window", "Hash Map"],
    examples: [
      { input: "s = \"abcabcbb\"", output: "3", explanation: "The answer is \"abc\", with the length of 3." },
      { input: "s = \"bbbbb\"", output: "1", explanation: "The answer is \"b\", with the length of 1." }
    ],
    hints: ["Use a sliding window with two pointers and a set or map of character positions."]
  },
  {
    title: "Container With Most Water",
    slug: "container-with-most-water",
    description: "You are given an integer array `height` of length `n`. There are `n` vertical lines drawn such that the two endpoints of the `i`-th line are `(i, 0)` and `(i, height[i])`.\n\nFind two lines that together with the x-axis form a container, such that the container contains the most water.\n\nReturn the maximum amount of water a container can store.",
    difficulty: "Medium",
    tags: ["Array", "Two Pointers", "Greedy"],
    examples: [
      { input: "height = [1,8,6,2,5,4,8,3,7]", output: "49", explanation: "The maximum area is obtained between index 1 and 8." }
    ],
    hints: ["Start with two pointers at opposite ends and move the shorter line inward."]
  },
  {
    title: "3Sum",
    slug: "3sum",
    description: "Given an integer array nums, return all the triplets `[nums[i], nums[j], nums[k]]` such that `i != j`, `i != k`, and `j != k`, and `nums[i] + nums[j] + nums[k] == 0`.\n\nNotice that the solution set must not contain duplicate triplets.",
    difficulty: "Medium",
    tags: ["Array", "Two Pointers", "Sorting"],
    examples: [
      { input: "nums = [-1,0,1,2,-1,-4]", output: "[[-1,-1,2],[-1,0,1]]", explanation: "Distinct triplets summing to zero." }
    ],
    hints: ["Sort the array first, then iterate and use two pointers for the remaining sum."]
  },
  {
    title: "Binary Tree Level Order Traversal",
    slug: "binary-tree-level-order-traversal",
    description: "Given the `root` of a binary tree, return the level order traversal of its nodes' values. (i.e., from left to right, level by level).",
    difficulty: "Medium",
    tags: ["Tree", "BFS", "Queue"],
    examples: [
      { input: "root = [3,9,20,null,null,15,7]", output: "[[3],[9,20],[15,7]]", explanation: "Level-by-level traversal." }
    ],
    hints: ["Use a queue for Breadth-First Search (BFS) while tracking level sizes."]
  },
  {
    title: "Course Schedule",
    slug: "course-schedule",
    description: "There are a total of `numCourses` courses you have to take, labeled from `0` to `numCourses - 1`. You are given an array `prerequisites` where `prerequisites[i] = [a_i, b_i]` indicates that you must take course `b_i` first if you want to take course `a_i`.\n\nReturn `true` if you can finish all courses. Otherwise, return `false`.",
    difficulty: "Medium",
    tags: ["Graph", "BFS", "DFS", "Topological Sort"],
    examples: [
      { input: "numCourses = 2, prerequisites = [[1,0]]", output: "true", explanation: "Take course 0 then course 1." },
      { input: "numCourses = 2, prerequisites = [[1,0],[0,1]]", output: "false", explanation: "Cycle detected between courses." }
    ],
    hints: ["Detect cycle in a directed graph using Kahn's algorithm or DFS colors."]
  },
  {
    title: "Coin Change",
    slug: "coin-change",
    description: "You are given an integer array `coins` representing coins of different denominations and an integer `amount` representing a total amount of money.\n\nReturn the fewest number of coins that you need to make up that amount. If that amount of money cannot be made up by any combination of the coins, return `-1`.",
    difficulty: "Medium",
    tags: ["Dynamic Programming", "BFS"],
    examples: [
      { input: "coins = [1,2,5], amount = 11", output: "3", explanation: "11 = 5 + 5 + 1." }
    ],
    hints: ["Use a DP table where dp[i] represents the min coins needed for amount i."]
  },
  {
    title: "Merge K Sorted Lists",
    slug: "merge-k-lists",
    description: "You are given an array of `k` linked-lists `lists`, each linked-list is sorted in ascending order.\n\nMerge all the linked-lists into one sorted linked-list and return it.",
    difficulty: "Hard",
    tags: ["Heap", "Linked List", "Divide and Conquer"],
    examples: [
      { input: "lists = [[1,4,5],[1,3,4],[2,6]]", output: "[1,1,2,3,4,4,5,6]", explanation: "Merged all sorted lists." }
    ],
    hints: ["Maintain a min-heap of nodes representing current head of each list."]
  },
  {
    title: "Trapping Rain Water",
    slug: "trapping-rain-water",
    description: "Given `n` non-negative integers representing an elevation map where the width of each bar is `1`, compute how much water it can trap after raining.",
    difficulty: "Hard",
    tags: ["Array", "Two Pointers", "Stack", "Dynamic Programming"],
    examples: [
      { input: "height = [0,1,0,2,1,0,1,3,2,1,2,1]", output: "6", explanation: "6 units of rain water trapped." }
    ],
    hints: ["Maintain maximum height to left and right using two pointers."]
  },
  {
    title: "Employees Earning More Than Their Managers",
    slug: "employees-earning-more-than-managers",
    description: "Write a SQL query to find the employees who earn more than their managers.\n\nTable: Employee (id, name, salary, managerId)",
    difficulty: "Easy",
    tags: ["SQL", "Database"],
    examples: [
      { input: "Employee table with salaries and manager IDs", output: "Joe", explanation: "Joe earns 70000 while his manager earns 60000." }
    ],
    hints: ["Perform a self-JOIN on the Employee table where employee.managerId = manager.id."]
  }
];

function generateMoreProblems(count = 150) {
  const topics = [
    "Array", "String", "Hash Map", "Stack", "Queue", "Two Pointers",
    "Sliding Window", "Binary Search", "Linked List", "Tree", "BFS", "DFS",
    "Graph", "Heap", "Dynamic Programming", "Greedy", "SQL", "Matrix",
    "Bit Manipulation", "Math", "System Design"
  ];
  const difficulties = ["Easy", "Medium", "Hard"];

  return Array.from({ length: count }, (_, i) => {
    const template = REAL_PROBLEM_TEMPLATES[i % REAL_PROBLEM_TEMPLATES.length];
    const topic = topics[i % topics.length];
    const difficulty = difficulties[i % 3];
    const id = i + 1;

    // Use template if direct match, otherwise construct clean problem
    if (i < REAL_PROBLEM_TEMPLATES.length) {
      return {
        ...template,
        progress_state: "not_completed",
        available_languages: template.tags.includes("SQL") ? ["SQL"] : ["Python", "Java", "C++", "C"],
      };
    }

    const title = `${template.title} II (Variant ${id})`;
    return {
      title,
      slug: `${template.slug}-variant-${id}`,
      description: `Solve this ${difficulty} ${topic} problem.\n\n${template.description}`,
      difficulty,
      tags: Array.from(new Set([topic, ...template.tags])),
      is_daily: i % 10 === 0,
      progress_state: "not_completed",
      available_languages: topic === "SQL" ? ["SQL"] : ["Python", "Java", "C++", "C"],
      examples: template.examples,
      hints: template.hints,
    };
  });
}

export const fallbackProblems = [
  ...generateMoreProblems(150)
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

// Master list of languages a Lab (regular or company-based) can restrict itself
// to. Shared between the HOD lab-creation language picker and the student
// exercise editor's language dropdown so the two never drift apart.
export const LAB_LANGUAGES = ["Python", "C", "C++", "Java"];

export const navItems = [
  { id: "explore",  label: "Explore",   icon: LayoutGrid },
  { id: "roadmaps", label: "Roadmaps",  icon: Map },
  { id: "problems", label: "Problems",  icon: Code2 },
  { id: "playground", label: "Playground", icon: Terminal },
  { id: "labs",     label: "Labs",      icon: FlaskConical },
  { id: "company",  label: "Companies", icon: Building2 },
  { id: "aptitude", label: "Aptitude",  icon: Brain },
  { id: "contest",  label: "Contest",   icon: Trophy },
  { id: "leaderboard", label: "Leaderboard", icon: Crown },
  { id: "interview", label: "Interview Practice", icon: Mic },
  { id: "competitive", label: "Competitive Practice", icon: Swords },
  { id: "progress", label: "Progress",  icon: BarChart3 },
  { id: "discuss",  label: "Discuss",   icon: MessageSquare },
];

export const difficultyOrder = ["All Levels", "Easy", "Medium", "Hard"];
export const authStorageKey = "code2day-register-number";
export const progressSections = [
  { key: "open", label: "Open" },
  { key: "completed", label: "Completed" },
  { key: "not_completed", label: "Not Completed" },
];
