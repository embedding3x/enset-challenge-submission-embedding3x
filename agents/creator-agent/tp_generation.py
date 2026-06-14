"""
TP generation prompt-engineering & normalization.

This module owns everything language-specific about generating a Travaux
Pratiques (practical lab assignment) draft:

  * the registry of supported programming languages,
  * the prompts (the selected language is the highest-priority constraint, and
    the model is instructed to act as a university professor),
  * normalization of the model's JSON into the shape the frontend expects.

It is deliberately framework-free (pure functions + data) so it can be unit
tested and reused by main.py without importing FastAPI.
"""
from __future__ import annotations

import uuid
from typing import Any

# ─── Supported languages ──────────────────────────────────────────────────────
# `validator_id` is the language id understood by the validation-service.
# `requirement` controls how a step's `requiredTags` are framed: HTML tag names
# for the web stack, otherwise language keywords/identifiers/concepts.

LANGUAGES: list[dict[str, Any]] = [
    {
        "id": "java", "label": "Java", "validator_id": "java", "requirement": "keywords",
        "ecosystem": "OOP, Collections, Generics, Spring Boot, JUnit, Maven/Gradle",
        "tools": ["JDK 17+", "Maven or Gradle", "JUnit 5", "IntelliJ IDEA / VS Code"],
        "topics": "object-oriented design, interfaces & generics, Collections & Streams, Spring Boot REST APIs",
        "starter": 'public class Main {\n    public static void main(String[] args) {\n        // TODO: implement the exercise\n        System.out.println("Hello, TP!");\n    }\n}',
    },
    {
        "id": "python", "label": "Python", "validator_id": "python", "requirement": "keywords",
        "ecosystem": "algorithms, data/AI (NumPy, pandas, scikit-learn), automation, pytest",
        "tools": ["Python 3.11+", "pip / venv", "pytest", "VS Code / PyCharm"],
        "topics": "data structures & algorithms, data analysis with pandas, automation scripts, intro machine learning",
        "starter": 'def main() -> None:\n    # TODO: implement the exercise\n    print("Hello, TP!")\n\n\nif __name__ == "__main__":\n    main()',
    },
    {
        "id": "javascript", "label": "JavaScript", "validator_id": "javascript", "requirement": "keywords",
        "ecosystem": "Node.js, ES modules, async/await, Express, Jest",
        "tools": ["Node.js 20+", "npm", "Jest", "VS Code"],
        "topics": "array/object manipulation, asynchronous programming, Node/Express APIs, higher-order functions",
        "starter": 'function main() {\n  // TODO: implement the exercise\n  console.log("Hello, TP!");\n}\n\nmain();',
    },
    {
        "id": "typescript", "label": "TypeScript", "validator_id": "typescript", "requirement": "keywords",
        "ecosystem": "static typing, interfaces, generics, Node/React",
        "tools": ["Node.js 20+", "tsc / ts-node", "npm", "VS Code"],
        "topics": "types & interfaces, generics & utility types, typed domain modelling, typed Express APIs",
        "starter": 'function main(): void {\n  // TODO: implement the exercise\n  console.log("Hello, TP!");\n}\n\nmain();',
    },
    {
        "id": "c", "label": "C", "validator_id": "c", "requirement": "keywords",
        "ecosystem": "pointers, manual memory management, structs, gcc/make, gdb",
        "tools": ["gcc / clang", "make", "gdb", "VS Code"],
        "topics": "pointers & memory management, dynamic arrays & structs, string handling, sorting algorithms",
        "starter": '#include <stdio.h>\n\nint main(void) {\n    /* TODO: implement the exercise */\n    printf("Hello, TP!\\n");\n    return 0;\n}',
    },
    {
        "id": "cpp", "label": "C++", "validator_id": "cpp", "requirement": "keywords",
        "ecosystem": "STL, OOP, templates, RAII, smart pointers, CMake",
        "tools": ["g++ / clang++", "CMake", "gdb", "CLion / VS Code"],
        "topics": "STL containers, classes & inheritance, templates & generics, RAII & memory management",
        "starter": '#include <iostream>\n\nint main() {\n    // TODO: implement the exercise\n    std::cout << "Hello, TP!" << std::endl;\n    return 0;\n}',
    },
    {
        "id": "csharp", "label": "C#", "validator_id": "csharp", "requirement": "keywords",
        "ecosystem": ".NET, OOP, LINQ, ASP.NET Core, xUnit",
        "tools": [".NET SDK 8+", "dotnet CLI", "Visual Studio / Rider / VS Code"],
        "topics": "classes & properties, LINQ queries, generic collections, ASP.NET Core web APIs",
        "starter": 'using System;\n\nclass Program {\n    static void Main() {\n        // TODO: implement the exercise\n        Console.WriteLine("Hello, TP!");\n    }\n}',
    },
    {
        "id": "php", "label": "PHP", "validator_id": "php", "requirement": "keywords",
        "ecosystem": "back-end web, Composer, Laravel/Symfony, PDO",
        "tools": ["PHP 8.2+", "Composer", "VS Code"],
        "topics": "associative arrays, OOP & classes, database access with PDO, small REST APIs",
        "starter": '<?php\n\nfunction main(): void {\n    // TODO: implement the exercise\n    echo "Hello, TP!" . PHP_EOL;\n}\n\nmain();',
    },
    {
        "id": "go", "label": "Go", "validator_id": "go", "requirement": "keywords",
        "ecosystem": "concurrency (goroutines, channels), modules, net/http, testing",
        "tools": ["Go 1.22+", "go modules", "VS Code"],
        "topics": "slices & maps, goroutines & channels, HTTP servers with net/http, interfaces",
        "starter": 'package main\n\nimport "fmt"\n\nfunc main() {\n    // TODO: implement the exercise\n    fmt.Println("Hello, TP!")\n}',
    },
    {
        "id": "rust", "label": "Rust", "validator_id": "rust", "requirement": "keywords",
        "ecosystem": "ownership & borrow checker, Cargo, traits, error handling",
        "tools": ["Rust (rustup) 1.78+", "Cargo", "VS Code + rust-analyzer"],
        "topics": "ownership & borrowing, structs & enums, error handling with Result, traits & generics",
        "starter": 'fn main() {\n    // TODO: implement the exercise\n    println!("Hello, TP!");\n}',
    },
    {
        "id": "kotlin", "label": "Kotlin", "validator_id": "kotlin", "requirement": "keywords",
        "ecosystem": "JVM, null-safety, coroutines, Android, Gradle",
        "tools": ["Kotlin 1.9+", "Gradle", "IntelliJ IDEA / Android Studio"],
        "topics": "data classes, null-safety & extension functions, coroutines, functional collections",
        "starter": 'fun main() {\n    // TODO: implement the exercise\n    println("Hello, TP!")\n}',
    },
    {
        "id": "dart", "label": "Dart", "validator_id": "dart", "requirement": "keywords",
        "ecosystem": "Dart 3 sound null-safety, OOP & mixins, generics, collections, async/await, Futures, Streams, Flutter, clean architecture, state management (Provider/Bloc/Riverpod concepts), pub",
        "tools": ["Dart SDK 3+", "Flutter SDK (optional)", "pub", "VS Code / Android Studio"],
        "topics": "variables & types, OOP (classes, mixins, generics), collections (List/Map/Set), async/await & Futures, Streams, Flutter widget basics, clean architecture, state management concepts",
        "starter": "import 'dart:io';\n\nvoid main() {\n  // Read input from stdin and print results to stdout so tests can run.\n  final line = stdin.readLineSync();\n  // TODO: implement the exercise\n  print(line ?? '');\n}",
    },
    {
        "id": "web", "label": "Web (HTML/CSS/JS)", "validator_id": "html", "requirement": "tags",
        "ecosystem": "semantic HTML, responsive CSS, DOM JavaScript, accessibility",
        "tools": ["Modern browser", "VS Code", "Live Server (optional)"],
        "topics": "semantic HTML structure, responsive CSS layout, DOM interactivity, accessible forms",
        "starter": '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>My Page</title>\n</head>\n<body>\n  <!-- Start here -->\n</body>\n</html>',
    },
]

_LANG_BY_ID = {lang["id"]: lang for lang in LANGUAGES}

_DIFFICULTY_GUIDE = {
    "beginner": "Beginner: guided exercise, basic syntax, one clear objective, generous scaffolding.",
    "intermediate": "Intermediate: problem-solving, modularity, data structures, simple APIs, partial scaffolding.",
    "advanced": "Advanced: architecture, optimization, concurrency, design patterns, frameworks or AI concepts; minimal scaffolding.",
}


def language_profile(prog_language: str | None) -> dict[str, Any]:
    """Return the registry entry for a language id, defaulting to Python (never web)."""
    return _LANG_BY_ID.get((prog_language or "").strip().lower(), _LANG_BY_ID["python"])


# ─── Prompt construction ──────────────────────────────────────────────────────

def _json_schema_block(questions_per_step: int) -> str:
    return (
        "Return ONLY a valid JSON object (no markdown, no prose) with EXACTLY this shape:\n"
        "{\n"
        '  "title": string,\n'
        '  "description": string,            // one or two sentences\n'
        '  "field": string,                  // module/discipline, e.g. "Programmation Orientée Objet"\n'
        '  "difficulty": "beginner"|"intermediate"|"advanced",\n'
        '  "estimatedMinutes": number,\n'
        '  "language": string,               // MUST equal the requested language id\n'
        '  "starterHTML": string,            // starter SOURCE CODE in the target language (this field name is legacy)\n'
        '  "content": {\n'
        '    "context": string,              // context / problem statement\n'
        '    "objectives": string[],         // learning objectives\n'
        '    "prerequisites": string[],\n'
        '    "tools": string[],              // required tools / environment\n'
        '    "expectedOutput": string,       // what a correct solution produces\n'
        '    "constraints": string[],\n'
        '    "evaluationCriteria": [{ "criterion": string, "points": number }],  // rubric, points sum ~100\n'
        '    "bonus": string[]               // bonus challenges / extensions\n'
        "  },\n"
        '  "steps": [{\n'
        '    "title": string,\n'
        '    "instructions": string,         // detailed, step-by-step\n'
        '    "requiredTags": string[],       // see the REQUIRED-TAGS rule below\n'
        '    "testCases": [{ "name": string, "stdin": string, "expectedStdout": string }],  // see the TEST-CASES rule\n'
        f'    "quiz": [exactly {questions_per_step} items of '
        '{ "question": string, "options": [{"id":"a","text":string},{"id":"b",...},{"id":"c",...},{"id":"d",...}], '
        '"correctId": "a"|"b"|"c"|"d", "explanation": string }]\n'
        "  }]\n"
        "}"
    )


def _system_prompt(profile: dict[str, Any], ui_language: str) -> str:
    lang_label = profile["label"]
    prose_lang = "French" if (ui_language or "fr").startswith("fr") else "English"
    if profile["requirement"] == "tags":
        req_rule = (
            'REQUIRED-TAGS rule: each step\'s "requiredTags" is a list of HTML tag names '
            '(without angle brackets), e.g. ["header","nav","form"], that the student must use.'
        )
    else:
        req_rule = (
            f'REQUIRED-TAGS rule: each step\'s "requiredTags" is a list of {lang_label} '
            "keywords, identifiers, types or API names the solution must contain, e.g. "
            f'{profile["topics"].split(", ")[0]!r} concepts expressed as code tokens.'
        )
    return (
        "You are an experienced university professor designing a practical laboratory "
        "assignment (Travaux Pratiques / TP) for engineering students.\n\n"
        "STRICT RULES (in priority order):\n"
        f"1. The selected programming language is {lang_label}. This is the HIGHEST-priority "
        "constraint. EVERY part of the TP — title, context, objectives, instructions, starter "
        "code, expected output, test cases and evaluation criteria — MUST be about "
        f"{lang_label}.\n"
        "2. NEVER default to HTML or web development unless the selected language is "
        "explicitly Web (HTML/CSS/JS).\n"
        f"3. Use {lang_label}-specific terminology, libraries, frameworks, tooling and syntax. "
        f"Ecosystem to draw from: {profile['ecosystem']}. Suitable topics: {profile['topics']}.\n"
        f"4. The starter code (\"starterHTML\" field) MUST be syntactically valid {lang_label} "
        "code that compiles/runs and gives the student a sensible starting point.\n"
        "5. Generate academically realistic, university-level work — not a generic toy task.\n"
        f"6. Write all natural-language text in {prose_lang}. Keep code and identifiers in their "
        "conventional form.\n"
        f"7. {req_rule}\n"
        f"8. {_test_case_rule(profile)}\n"
        f"{_language_guidance(profile)}"
        "9. Output a structured JSON object exactly matching the requested schema."
    )


def _test_case_rule(profile: dict[str, Any]) -> str:
    if profile["requirement"] == "tags":
        return (
            'TEST-CASES rule: for web TPs leave each step\'s "testCases" as an empty array [] '
            "(web pages are validated structurally, not executed)."
        )
    return (
        f'TEST-CASES rule: each {profile["label"]} step MUST include 2-4 runnable "testCases". '
        "Design the exercise so the program is AUTO-GRADABLE: the solution prints its result to "
        "STANDARD OUTPUT, and (when input is needed) reads from STANDARD INPUT. Each test case is "
        '{ "name", "stdin" (exact input fed to the program, "" if none), "expectedStdout" (the '
        "EXACT expected output) }. The starter code must set up this stdin→stdout structure. "
        "expectedStdout must match what a correct solution literally prints (mind whitespace/newlines)."
    )


# Deep, language-specific authoring guidance. Keeps generated TPs idiomatic and
# academically realistic rather than generic. Empty string for languages with no
# extra notes (the ecosystem/topics already cover them).
_LANGUAGE_GUIDANCE: dict[str, str] = {
    "dart": (
        "DART GUIDANCE: choose a topic appropriate to the difficulty from: variables & types and "
        "null-safety; OOP (classes, named constructors, mixins, generics, abstract classes); "
        "collections (List/Map/Set, spread, collection-if/for); functional style; async/await & "
        "Future; Stream processing; Flutter widget basics (StatelessWidget/StatefulWidget, build, "
        "composition); clean architecture (entities/use-cases/repositories layering); and state-"
        "management CONCEPTS (Provider/Bloc/Riverpod, immutability, unidirectional data flow). "
        "Use Dart 3 syntax (sound null-safety, records/patterns where relevant). For console "
        "exercises read input with `stdin.readLineSync()` (import 'dart:io') and print results so "
        "test cases run. For Flutter/state-management topics that can't run headless, keep test "
        "cases on the pure-Dart logic (e.g. a Bloc's reducer, a use-case) and validate that. All "
        "code MUST be valid, analyzer-clean Dart."
    ),
}


def _language_guidance(profile: dict[str, Any]) -> str:
    note = _LANGUAGE_GUIDANCE.get(profile["id"], "")
    return (note + "\n") if note else ""


def _context_block(context: dict[str, Any]) -> str:
    parts: list[str] = []
    rag = context.get("rag_context")
    if rag:
        joined = "\n".join(f"- {c.get('name','')}: {c.get('excerpt','')[:400]}" for c in rag)
        parts.append("Relevant course material to ground the TP in:\n" + joined)
    files = context.get("file_names")
    if files:
        parts.append("Teacher-uploaded reference files: " + ", ".join(files))
    return ("\n\n".join(parts) + "\n\n") if parts else ""


def build_generation_messages(
    *,
    prompt: str,
    profile: dict[str, Any],
    ui_language: str,
    difficulty: str,
    step_count: int,
    questions_per_step: int,
    context: dict[str, Any],
) -> list[dict[str, str]]:
    diff_guide = _DIFFICULTY_GUIDE.get(difficulty, _DIFFICULTY_GUIDE["intermediate"])
    user = (
        f"Design a complete {profile['label']} TP.\n\n"
        f"Teacher brief: {prompt.strip() or '(none — choose a relevant, realistic topic)'}\n\n"
        f"{_context_block(context)}"
        f"Difficulty — {diff_guide}\n"
        f"Produce EXACTLY {step_count} progressive steps. Each step MUST contain EXACTLY "
        f"{questions_per_step} multiple-choice comprehension question(s).\n"
        f"Set \"language\" to \"{profile['id']}\".\n\n"
        + _json_schema_block(questions_per_step)
    )
    return [
        {"role": "system", "content": _system_prompt(profile, ui_language)},
        {"role": "user", "content": user},
    ]


def build_enhance_messages(
    *,
    tp: dict[str, Any],
    profile: dict[str, Any],
    ui_language: str,
    instructions: str | None,
) -> list[dict[str, str]]:
    system = _system_prompt(profile, ui_language) + (
        "\n\nYou are now REFINING a draft a teacher has already reviewed and edited. "
        "Improve clarity, academic quality and consistency, and fix mistakes — but you MUST "
        "PRESERVE the teacher's intent and edits. Do not remove their content or change the "
        "topic. Keep the same JSON schema, the same language, and the same number of steps and "
        "questions per step."
    )
    user = (
        "Here is the current draft as JSON. Return an improved version with the EXACT same "
        "schema and keys.\n"
        + (f"\nTeacher's enhancement request: {instructions.strip()}\n" if instructions else "")
        + "\nDRAFT:\n"
        + json.dumps(tp, ensure_ascii=False)
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


_SECTION_SPEC: dict[str, str] = {
    "context": '{"value": string}  // a fresh context / problem statement',
    "objectives": '{"value": string[]}  // 3-6 learning objectives',
    "prerequisites": '{"value": string[]}',
    "tools": '{"value": string[]}  // required tools / environment',
    "expectedOutput": '{"value": string}',
    "constraints": '{"value": string[]}',
    "evaluationCriteria": '{"value": [{"criterion": string, "points": number}]}  // points sum ~100',
    "bonus": '{"value": string[]}  // bonus challenges / extensions',
    "starter": '{"value": string}  // valid starter source code in the target language',
}


def build_section_messages(
    *,
    section: str,
    tp: dict[str, Any],
    profile: dict[str, Any],
    ui_language: str,
    difficulty: str,
    step_count: int,
    questions_per_step: int,
) -> list[dict[str, str]]:
    system = _system_prompt(profile, ui_language)
    if section == "steps":
        spec = (
            f'{{"value": [exactly {step_count} steps, each '
            '{"title": string, "instructions": string, "requiredTags": string[], '
            '"testCases": [{"name","stdin","expectedStdout"}], '
            f'"quiz": [exactly {questions_per_step} MCQs as in the main schema]}}]}}'
        )
    elif section == "quiz":
        spec = (
            '{"value": [one array per step, in order; each inner array has exactly '
            f'{questions_per_step} MCQs {{"question","options"[a-d],"correctId","explanation"}}]}}'
        )
    else:
        spec = _SECTION_SPEC.get(section, '{"value": string}')

    user = (
        f"Regenerate ONLY the '{section}' section of this {profile['label']} TP. "
        "Keep it consistent with the rest of the draft and aligned with the language.\n\n"
        f"Difficulty: {difficulty}.\n\n"
        "Current draft (for context):\n"
        + json.dumps(tp, ensure_ascii=False)
        + "\n\nReturn ONLY valid JSON of the form: "
        + spec
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


# ─── Normalization ────────────────────────────────────────────────────────────

def _uid() -> str:
    return f"id-{uuid.uuid4().hex[:10]}"


def _as_list(value: Any) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _normalize_options(options: Any) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    letters = ["a", "b", "c", "d", "e", "f"]
    for i, opt in enumerate(_as_list(options)):
        letter = letters[i] if i < len(letters) else str(i)
        if isinstance(opt, dict):
            out.append({"id": str(opt.get("id") or letter), "text": str(opt.get("text") or opt.get("label") or "")})
        else:
            out.append({"id": letter, "text": str(opt)})
    while len(out) < 4:
        letter = letters[len(out)]
        out.append({"id": letter, "text": ""})
    return out


def normalize_quiz(quiz: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for q in _as_list(quiz):
        if not isinstance(q, dict):
            continue
        options = _normalize_options(q.get("options"))
        correct = q.get("correctId") or q.get("correct_id")
        if correct not in {o["id"] for o in options}:
            correct = options[0]["id"] if options else "a"
        out.append({
            "id": str(q.get("id") or _uid()),
            "question": str(q.get("question") or ""),
            "options": options,
            "correctId": correct,
            "explanation": str(q.get("explanation") or ""),
        })
    return out


def normalize_test_cases(value: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, tc in enumerate(_as_list(value)):
        if not isinstance(tc, dict):
            continue
        expected = tc.get("expectedStdout")
        if expected is None:
            expected = tc.get("expected_stdout") or tc.get("expected") or ""
        out.append({
            "id": str(tc.get("id") or _uid()),
            "name": str(tc.get("name") or f"Test {i + 1}"),
            "stdin": str(tc.get("stdin") or ""),
            "expectedStdout": str(expected),
        })
    return out


def normalize_steps(steps: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for s in _as_list(steps):
        if not isinstance(s, dict):
            continue
        tags = s.get("requiredTags")
        if tags is None:
            tags = s.get("required_tags")
        out.append({
            "id": str(s.get("id") or _uid()),
            "title": str(s.get("title") or ""),
            "instructions": str(s.get("instructions") or ""),
            "requiredTags": [str(t) for t in _as_list(tags)],
            "testCases": normalize_test_cases(s.get("testCases") or s.get("test_cases")),
            "quiz": normalize_quiz(s.get("quiz")),
        })
    return out


def normalize_criteria(value: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for c in _as_list(value):
        if isinstance(c, dict):
            pts = c.get("points")
            try:
                pts = int(pts)
            except (TypeError, ValueError):
                pts = 0
            out.append({"criterion": str(c.get("criterion") or c.get("label") or ""), "points": pts})
        else:
            out.append({"criterion": str(c), "points": 0})
    return out


def normalize_content(content: Any) -> dict[str, Any]:
    c = content if isinstance(content, dict) else {}
    return {
        "context": str(c.get("context") or ""),
        "objectives": [str(x) for x in _as_list(c.get("objectives"))],
        "prerequisites": [str(x) for x in _as_list(c.get("prerequisites"))],
        "tools": [str(x) for x in _as_list(c.get("tools"))],
        "expectedOutput": str(c.get("expectedOutput") or c.get("expected_output") or ""),
        "constraints": [str(x) for x in _as_list(c.get("constraints"))],
        "evaluationCriteria": normalize_criteria(c.get("evaluationCriteria") or c.get("evaluation_criteria")),
        "bonus": [str(x) for x in _as_list(c.get("bonus"))],
    }


def normalize_tp(raw: Any, *, profile: dict[str, Any], difficulty: str, status: str = "draft") -> dict[str, Any]:
    """Coerce whatever the model returned into the strict frontend TP shape."""
    tp = raw if isinstance(raw, dict) else {}
    # Some models wrap the answer, e.g. {"result": {...}} or {"tp": {...}}.
    for key in ("result", "tp", "data"):
        if not tp.get("title") and isinstance(tp.get(key), dict):
            tp = tp[key]
    try:
        minutes = int(tp.get("estimatedMinutes"))
    except (TypeError, ValueError):
        minutes = {"beginner": 30, "intermediate": 60, "advanced": 90}.get(difficulty, 45)
    starter = tp.get("starterHTML") or tp.get("starter") or profile["starter"]
    return {
        "id": str(tp.get("id") or _uid()),
        "title": str(tp.get("title") or f"{profile['label']} — TP"),
        "description": str(tp.get("description") or ""),
        "field": str(tp.get("field") or ""),
        "difficulty": tp.get("difficulty") if tp.get("difficulty") in {"beginner", "intermediate", "advanced"} else difficulty,
        "estimatedMinutes": minutes,
        "language": profile["id"],
        "starterHTML": str(starter),
        "content": normalize_content(tp.get("content")),
        "steps": normalize_steps(tp.get("steps")),
        "status": status,
    }
