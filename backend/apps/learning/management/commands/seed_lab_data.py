"""
Seed the 'test' Lab and its exercises created locally so they exist on the
server too. Uses get_or_create so it is safe to run multiple times (idempotent).
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.learning.models import Department, Lab, LabExercise, StaffProfile

LAB = {
    "name": "test",
    "department_code": "243",
    "batch": "23-27",
    "section": "A",
    "staff_in_charge_faculty_id": "1607",
    "created_by_faculty_id": "1223",
}

EXERCISES = [
    {
        'title': 'Implementation of Single Dimensional Arrays in C++',
        'description': 'Write a C++ program to implement a single dimensional array supporting operations such as insertion, deletion, traversal, and searching of elements.\n\nExamples:\n  Input:  arr = [10,20,30,40,50]\n  Output: Array elements: 10 20 30 40 50\n  Explanation: Demonstrates declaration, initialization and traversal of a 1-D array.\n\nDifficulty: Easy',
        'order': 1,
    },
    {
        'title': 'Implementation of Multi Dimensional Arrays in C++',
        'description': 'Write a C++ program to implement a two-dimensional array and perform operations such as initialization, traversal, and element access using row and column indices.\n\nExamples:\n  Input:  matrix = [[1,2],[3,4]]\n  Output: 1 2\\n3 4\n  Explanation: Demonstrates storage and traversal of a 2-D array using nested loops.\n\nDifficulty: Easy',
        'order': 2,
    },
    {
        'title': 'Implementation of Single Linked List in C++',
        'description': 'Write a C++ program to implement a singly linked list with operations for insertion, deletion, and traversal of nodes.\n\nExamples:\n  Input:  Insert 10, 20, 30 at end\n  Output: 10 -> 20 -> 30 -> NULL\n  Explanation: Demonstrates node creation and traversal using next pointers.\n\nDifficulty: Medium',
        'order': 3,
    },
    {
        'title': 'Implementation of Double Linked List in C++',
        'description': 'Write a C++ program to implement a doubly linked list supporting insertion, deletion, and forward/backward traversal.\n\nExamples:\n  Input:  Insert 10, 20, 30\n  Output: Forward: 10 <-> 20 <-> 30\\nBackward: 30 <-> 20 <-> 10\n  Explanation: Each node stores pointers to both the next and previous node.\n\nDifficulty: Medium',
        'order': 4,
    },
    {
        'title': 'Implementation of Circular Linked List in C++',
        'description': "Write a C++ program to implement a circular linked list where the last node points back to the first node, supporting insertion, deletion, and traversal.\n\nExamples:\n  Input:  Insert 10, 20, 30\n  Output: 10 -> 20 -> 30 -> (back to 10)\n  Explanation: The last node's next pointer references the head node instead of NULL.\n\nDifficulty: Medium",
        'order': 5,
    },
    {
        'title': 'Implementation of Abstract Data Type',
        'description': 'Study and implement an Abstract Data Type (ADT) in C++, defining data and operations independent of implementation using classes.\n\nExamples:\n  Input:  Define a Stack ADT with push/pop operations\n  Output: Stack ADT operations executed successfully\n  Explanation: Demonstrates encapsulation of data and operations through a class interface.\n\nDifficulty: Easy',
        'order': 6,
    },
    {
        'title': 'Internal Representation of Primitive Data Structures',
        'description': 'Study and demonstrate the internal (memory) representation of primitive data structures such as int, float, char, and pointers in C++.\n\nExamples:\n  Input:  int x = 10;\n  Output: Size of int: 4 bytes\n  Explanation: Demonstrates use of sizeof() and the address-of operator to inspect memory layout.\n\nDifficulty: Easy',
        'order': 7,
    },
    {
        'title': 'String Reverse Operation using Stack',
        'description': 'Write a C++ program to reverse a string using the stack data structure by pushing characters and popping them in reverse order.\n\nExamples:\n  Input:  s = "hello"\n  Output: "olleh"\n\nDifficulty: Easy',
        'order': 8,
    },
    {
        'title': 'Expression Evaluation using Stack',
        'description': 'Write a C++ program to evaluate an arithmetic (postfix) expression using a stack data structure.\n\nExamples:\n  Input:  expr = "23*54*+"\n  Output: 26\n  Explanation: Evaluates postfix expression using an operand stack.\n\nDifficulty: Medium',
        'order': 9,
    },
    {
        'title': 'Implementation of Circular Queue using Array',
        'description': 'Write a C++ program to implement a circular queue using an array, supporting enqueue and dequeue operations with wrap-around indexing.\n\nExamples:\n  Input:  Enqueue 10, 20, 30 then Dequeue\n  Output: Dequeued: 10, Queue: 20 30\n\nDifficulty: Medium',
        'order': 10,
    },
    {
        'title': 'Implementation of Priority Queue in C++',
        'description': 'Write a C++ program to implement a priority queue where elements are served based on priority rather than insertion order.\n\nExamples:\n  Input:  Insert (10,priority 2), (20,priority 1), (30,priority 3)\n  Output: Order served: 20 10 30\n\nDifficulty: Medium',
        'order': 11,
    },
    {
        'title': 'Prefix Expression Evaluation in C++',
        'description': 'Write a C++ program to evaluate a prefix expression using a stack by scanning the expression from right to left.\n\nExamples:\n  Input:  expr = "+9*26"\n  Output: 21\n\nDifficulty: Medium',
        'order': 12,
    },
    {
        'title': 'Conversion of Postfix to Infix',
        'description': 'Write a C++ program to convert a postfix expression to its equivalent infix expression using a stack.\n\nExamples:\n  Input:  "AB+"\n  Output: (A+B)\n\nDifficulty: Medium',
        'order': 13,
    },
    {
        'title': 'Conversion of Postfix to Prefix',
        'description': 'Write a C++ program to convert a postfix expression to its equivalent prefix expression using a stack.\n\nExamples:\n  Input:  "AB+"\n  Output: +AB\n\nDifficulty: Medium',
        'order': 14,
    },
    {
        'title': 'Conversion of Prefix to Post Fix Expression',
        'description': 'Write a C++ program to convert a prefix expression to its equivalent postfix expression using a stack.\n\nExamples:\n  Input:  "+AB"\n  Output: AB+\n\nDifficulty: Medium',
        'order': 15,
    },
    {
        'title': 'Conversion of Prefix to Infix using C++',
        'description': 'Write a C++ program to convert a prefix expression to its equivalent infix expression using a stack.\n\nExamples:\n  Input:  "+AB"\n  Output: (A+B)\n\nDifficulty: Medium',
        'order': 16,
    },
    {
        'title': 'Preorder Traversal of a Binary Tree in C++',
        'description': 'Write a C++ program to perform preorder traversal (root-left-right) of a binary tree, both recursively and iteratively.\n\nExamples:\n  Input:  tree = [1,null,2,3]\n  Output: 1 2 3\n\nDifficulty: Medium',
        'order': 17,
    },
    {
        'title': 'Inorder Traversal of a Binary Tree in C++',
        'description': 'Write a C++ program to perform inorder traversal (left-root-right) of a binary tree, both recursively and iteratively.\n\nExamples:\n  Input:  tree = [1,null,2,3]\n  Output: 1 3 2\n\nDifficulty: Medium',
        'order': 18,
    },
    {
        'title': 'Postorder Traversal of a Binary Tree in C++',
        'description': 'Write a C++ program to perform postorder traversal (left-right-root) of a binary tree, both recursively and iteratively.\n\nExamples:\n  Input:  tree = [1,null,2,3]\n  Output: 3 2 1\n\nDifficulty: Medium',
        'order': 19,
    },
    {
        'title': 'AVL Tree Rotations (LL, RR, LR, RL)',
        'description': 'Write a C++ program to implement an AVL tree and perform the four types of rotations (LL, RR, LR, RL) required to maintain balance after insertion.\n\nExamples:\n  Input:  Insert 30, 20, 10\n  Output: RR rotation performed, new root: 20\n\nDifficulty: Hard',
        'order': 20,
    },
    {
        'title': 'Implementation of Binary Search Tree (BST): Create, Insert, Delete, Modify',
        'description': 'Write a C++ program to implement a Binary Search Tree supporting creation, insertion, deletion, and modification of nodes.\n\nExamples:\n  Input:  Insert 50, 30, 70; then Delete 30\n  Output: Inorder after deletion: 50 70\n\nDifficulty: Medium',
        'order': 21,
    },
    {
        'title': 'Implementation of Splay Tree (All Operations)',
        'description': 'Write a C++ program to implement a splay tree, moving accessed nodes to the root using rotations to support amortized fast access.\n\nExamples:\n  Input:  Insert 10, 20, 30; then Access 10\n  Output: 10 becomes the root after splaying\n\nDifficulty: Hard',
        'order': 22,
    },
    {
        'title': 'Min Heap Implementation',
        'description': 'Write a C++ program to implement a min heap supporting insertion and extraction of the minimum element while maintaining the heap property.\n\nExamples:\n  Input:  Insert 5, 3, 8, 1\n  Output: Extracted min: 1\n\nDifficulty: Medium',
        'order': 23,
    },
    {
        'title': 'Implementation of Binary Max Heap in C++',
        'description': 'Write a C++ program to implement a binary max heap supporting insertion and extraction of the maximum element.\n\nExamples:\n  Input:  Insert 5, 3, 8, 1\n  Output: Extracted max: 8\n\nDifficulty: Medium',
        'order': 24,
    },
    {
        'title': 'Implementation of Quick Sort',
        'description': 'Write a C++ program to sort an array using the quick sort algorithm based on the divide-and-conquer technique.\n\nExamples:\n  Input:  [5,2,9,1]\n  Output: [1,2,5,9]\n\nDifficulty: Medium',
        'order': 25,
    },
    {
        'title': 'Implementation of Heap Sort',
        'description': 'Write a C++ program to sort an array using the heap sort algorithm by building a max heap and repeatedly extracting the maximum.\n\nExamples:\n  Input:  [5,2,9,1]\n  Output: [1,2,5,9]\n\nDifficulty: Medium',
        'order': 26,
    },
    {
        'title': 'Implementation of Binary Search',
        'description': 'Write a C++ program to search for an element in a sorted array using the binary search algorithm.\n\nExamples:\n  Input:  arr=[1,3,5,7,9], target=7\n  Output: Found at index 3\n\nDifficulty: Easy',
        'order': 27,
    },
    {
        'title': 'Implementation of Hashing Techniques',
        'description': 'Write a C++ program to implement basic hashing techniques for storing and retrieving data using a hash function.\n\nExamples:\n  Input:  Insert keys 12, 25, 35 with table size 10\n  Output: 12 -> index 2, 25 -> index 5, 35 -> index 5 (collision)\n\nDifficulty: Medium',
        'order': 28,
    },
    {
        'title': 'Implementation of Bubble Sort',
        'description': 'Write a C++ program to sort an array using the bubble sort algorithm by repeatedly swapping adjacent elements.\n\nExamples:\n  Input:  [5,2,9,1]\n  Output: [1,2,5,9]\n\nDifficulty: Easy',
        'order': 29,
    },
    {
        'title': 'Implementation of Insertion Sort',
        'description': 'Write a C++ program to sort an array using the insertion sort algorithm by building a sorted portion one element at a time.\n\nExamples:\n  Input:  [5,2,9,1]\n  Output: [1,2,5,9]\n\nDifficulty: Easy',
        'order': 30,
    },
    {
        'title': 'Implementation of Merge Sort',
        'description': 'Write a C++ program to sort an array using the merge sort algorithm based on the divide-and-conquer technique.\n\nExamples:\n  Input:  [5,2,9,1]\n  Output: [1,2,5,9]\n\nDifficulty: Medium',
        'order': 31,
    },
    {
        'title': 'Implementation of Bucket Sort',
        'description': 'Write a C++ program to sort an array of floating point numbers using the bucket sort algorithm by distributing elements into buckets.\n\nExamples:\n  Input:  [0.42,0.32,0.23,0.52]\n  Output: [0.23,0.32,0.42,0.52]\n\nDifficulty: Medium',
        'order': 32,
    },
    {
        'title': 'Implementation of Dictionary using Hash Table',
        'description': 'Write a C++ program to implement a dictionary (key-value store) using a hash table supporting insertion, deletion, and lookup.\n\nExamples:\n  Input:  Insert ("apple",1), ("banana",2); Lookup "apple"\n  Output: 1\n\nDifficulty: Medium',
        'order': 33,
    },
    {
        'title': 'Collision Handling in Hashing',
        'description': 'Write a C++ program to demonstrate collision handling in a hash table when two keys map to the same index.\n\nExamples:\n  Input:  Insert 12 and 22 with table size 10\n  Output: Collision detected at index 2, resolved using chaining\n\nDifficulty: Medium',
        'order': 34,
    },
    {
        'title': 'Implementation of Separate Chaining',
        'description': 'Write a C++ program to implement separate chaining as a collision resolution technique using linked lists at each hash table index.\n\nExamples:\n  Input:  Insert 12, 22, 32 with table size 10\n  Output: Index 2: 12 -> 22 -> 32\n\nDifficulty: Medium',
        'order': 35,
    },
    {
        'title': 'Implementation of Quadratic Probing',
        'description': 'Write a C++ program to implement quadratic probing as a collision resolution technique in open addressing hash tables.\n\nExamples:\n  Input:  Insert 12, 22, 32 with table size 10\n  Output: 12 at index 2, 22 at index 3, 32 at index 6\n\nDifficulty: Medium',
        'order': 36,
    },
    {
        'title': 'Implementation of BFS',
        'description': 'Write a C++ program to perform Breadth First Search (BFS) traversal on a graph using a queue.\n\nExamples:\n  Input:  Edges (0,1),(0,2),(1,3); start = 0\n  Output: 0 1 2 3\n\nDifficulty: Medium',
        'order': 37,
    },
    {
        'title': 'Implementation of DFS',
        'description': 'Write a C++ program to perform Depth First Search (DFS) traversal on a graph using recursion or a stack.\n\nExamples:\n  Input:  Edges (0,1),(0,2),(1,3); start = 0\n  Output: 0 1 3 2\n\nDifficulty: Medium',
        'order': 38,
    },
    {
        'title': 'Implementation of Minimum Spanning Tree (Prims)',
        'description': "Write a C++ program to find the Minimum Spanning Tree of a weighted graph using Prim's algorithm.\n\nExamples:\n  Input:  Weighted graph with 4 vertices\n  Output: Edges in MST: (0,1),(1,2),(2,3); Total weight: 6\n\nDifficulty: Hard",
        'order': 39,
    },
    {
        'title': "Implementation of Shortest Path Algorithm (Dijkstra's Algorithm)",
        'description': "Write a C++ program to find the shortest path from a source vertex to all other vertices in a weighted graph using Dijkstra's algorithm.\n\nExamples:\n  Input:  Weighted graph, source = 0\n  Output: Shortest distances: [0,4,12,19]\n\nDifficulty: Hard",
        'order': 40,
    },
    {
        'title': "Implementation of Kruskal's Algorithm (MST)",
        'description': "Write a C++ program to find the Minimum Spanning Tree of a weighted graph using Kruskal's algorithm and the union-find technique.\n\nExamples:\n  Input:  Weighted graph with 4 vertices\n  Output: Edges in MST: (0,1),(1,2),(2,3); Total weight: 6\n\nDifficulty: Hard",
        'order': 41,
    },
]


class Command(BaseCommand):
    help = "Seed the 'test' Lab and its exercises (idempotent)"

    def handle(self, *args, **options):
        department = Department.objects.filter(code=LAB["department_code"]).first()
        if not department:
            self.stdout.write(self.style.ERROR(
                f"Department code {LAB['department_code']!r} not found — run setup_departments_and_map first."
            ))
            return

        staff_in_charge = StaffProfile.objects.filter(faculty_id=LAB["staff_in_charge_faculty_id"]).first()
        created_by = StaffProfile.objects.filter(faculty_id=LAB["created_by_faculty_id"]).first()

        with transaction.atomic():
            lab, lab_created = Lab.objects.get_or_create(
                name=LAB["name"],
                department=department,
                batch=LAB["batch"],
                section=LAB["section"],
                defaults={
                    "start_date": timezone.now(),
                    "end_date": timezone.now() + timedelta(days=30),
                    "staff_in_charge": staff_in_charge,
                    "created_by": created_by,
                    "is_active": True,
                },
            )
            self.stdout.write(self.style.SUCCESS(
                f"{'CREATED' if lab_created else 'FOUND'} lab: {lab.name} (id={lab.id})"
            ))

            created_count = 0
            skipped_count = 0
            for ex in EXERCISES:
                _, created = LabExercise.objects.get_or_create(
                    lab=lab,
                    title=ex["title"],
                    defaults={
                        "description": ex["description"],
                        "order": ex["order"],
                    },
                )
                if created:
                    created_count += 1
                else:
                    skipped_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"\nDone — exercises created {created_count}, already present {skipped_count}."
        ))
