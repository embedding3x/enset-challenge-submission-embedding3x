/**
 * Programming-language registry for the TP Agent Creator.
 *
 * This is the single source of truth that removes the old HTML bias: every
 * supported language carries its own starter code, tooling, ecosystem hints and
 * exercise topics, so a generated draft is always language-correct — even when
 * the LLM backend is offline and the local fallback builder is used.
 *
 * `id` is the canonical value persisted on TP.language and sent to the
 * validation-service. The validation-service understands html/css/javascript/
 * typescript/python natively and treats every other id as keyword-presence
 * checks, which is exactly what we want for compiled languages.
 */

export type LangId =
  | "java"
  | "python"
  | "javascript"
  | "typescript"
  | "c"
  | "cpp"
  | "csharp"
  | "php"
  | "go"
  | "rust"
  | "kotlin"
  | "dart"
  | "web";

export interface LanguageProfile {
  id: LangId;
  /** Canonical id sent to the validation-service (may differ from id, e.g. web→html). */
  validatorId: string;
  label: string;
  icon: string;
  /** Accent colour used for the selector chip. */
  color: string;
  /** Short ecosystem/tooling blurb shown under the selector. */
  ecosystem: { fr: string; en: string };
  /** Typical tools / environment a student needs. */
  tools: string[];
  /** Whether "required tags" should be labelled as HTML tags or keywords. */
  requirement: "tags" | "keywords";
  /** Example exercise topics — used to seed the local fallback draft. */
  topics: { fr: string[]; en: string[] };
  /** Language constructs used as required keywords in fallback steps. */
  keywords: string[];
  /** Language-correct starter scaffold for the student editor. */
  starter: string;
}

const J = (s: string) => s; // identity, keeps template literals readable

export const LANGUAGES: LanguageProfile[] = [
  {
    id: "java",
    validatorId: "java",
    label: "Java",
    icon: "☕",
    color: "#fb923c",
    ecosystem: {
      fr: "POO, Collections, Spring Boot, JUnit, Maven/Gradle",
      en: "OOP, Collections, Spring Boot, JUnit, Maven/Gradle",
    },
    tools: ["JDK 17+", "Maven or Gradle", "IntelliJ IDEA / VS Code", "JUnit 5"],
    requirement: "keywords",
    topics: {
      fr: ["modélisation orientée objet", "interfaces et généricité", "API REST avec Spring Boot", "Collections et Streams"],
      en: ["object-oriented modelling", "interfaces and generics", "REST API with Spring Boot", "Collections and Streams"],
    },
    keywords: ["class", "public", "interface", "List", "@Override"],
    starter: J(`public class Main {
    public static void main(String[] args) {
        // TODO: implement the exercise
        System.out.println("Hello, TP!");
    }
}`),
  },
  {
    id: "python",
    validatorId: "python",
    label: "Python",
    icon: "🐍",
    color: "#60a5fa",
    ecosystem: {
      fr: "algorithmes, data/IA (NumPy, pandas), automatisation, pytest",
      en: "algorithms, data/AI (NumPy, pandas), automation, pytest",
    },
    tools: ["Python 3.11+", "pip / venv", "VS Code or PyCharm", "pytest"],
    requirement: "keywords",
    topics: {
      fr: ["structures de données et algorithmes", "manipulation de données avec pandas", "scripts d'automatisation", "introduction au machine learning"],
      en: ["data structures and algorithms", "data wrangling with pandas", "automation scripts", "intro to machine learning"],
    },
    keywords: ["def", "return", "class", "import", "if __name__"],
    starter: J(`def main() -> None:
    # TODO: implement the exercise
    print("Hello, TP!")


if __name__ == "__main__":
    main()`),
  },
  {
    id: "javascript",
    validatorId: "javascript",
    label: "JavaScript",
    icon: "🟨",
    color: "#fbbf24",
    ecosystem: {
      fr: "Node.js, ES modules, async/await, tests Jest",
      en: "Node.js, ES modules, async/await, Jest tests",
    },
    tools: ["Node.js 20+", "npm", "VS Code", "Jest"],
    requirement: "keywords",
    topics: {
      fr: ["manipulation de tableaux et objets", "programmation asynchrone (Promises)", "API Node.js / Express", "fonctions d'ordre supérieur"],
      en: ["arrays and objects manipulation", "asynchronous programming (Promises)", "Node.js / Express API", "higher-order functions"],
    },
    keywords: ["function", "const", "=>", "async", "return"],
    starter: J(`function main() {
  // TODO: implement the exercise
  console.log("Hello, TP!");
}

main();`),
  },
  {
    id: "typescript",
    validatorId: "typescript",
    label: "TypeScript",
    icon: "🔷",
    color: "#3b82f6",
    ecosystem: {
      fr: "typage statique, interfaces, génériques, Node/React",
      en: "static typing, interfaces, generics, Node/React",
    },
    tools: ["Node.js 20+", "npm", "tsc / ts-node", "VS Code"],
    requirement: "keywords",
    topics: {
      fr: ["types et interfaces", "génériques et utilitaires de type", "modélisation typée d'un domaine", "API typée avec Express"],
      en: ["types and interfaces", "generics and utility types", "typed domain modelling", "typed API with Express"],
    },
    keywords: ["interface", "type", "const", ": ", "function"],
    starter: J(`function main(): void {
  // TODO: implement the exercise
  console.log("Hello, TP!");
}

main();`),
  },
  {
    id: "c",
    validatorId: "c",
    label: "C",
    icon: "🇨",
    color: "#94a3b8",
    ecosystem: {
      fr: "pointeurs, mémoire, structures, gcc/make",
      en: "pointers, memory, structs, gcc/make",
    },
    tools: ["gcc / clang", "make", "gdb", "VS Code"],
    requirement: "keywords",
    topics: {
      fr: ["pointeurs et gestion mémoire", "structures et tableaux dynamiques", "manipulation de chaînes", "algorithmes de tri"],
      en: ["pointers and memory management", "structs and dynamic arrays", "string manipulation", "sorting algorithms"],
    },
    keywords: ["#include", "int main", "printf", "malloc", "return"],
    starter: J(`#include <stdio.h>

int main(void) {
    /* TODO: implement the exercise */
    printf("Hello, TP!\\n");
    return 0;
}`),
  },
  {
    id: "cpp",
    validatorId: "cpp",
    label: "C++",
    icon: "➕",
    color: "#818cf8",
    ecosystem: {
      fr: "STL, POO, templates, RAII, CMake",
      en: "STL, OOP, templates, RAII, CMake",
    },
    tools: ["g++ / clang++", "CMake", "gdb", "VS Code / CLion"],
    requirement: "keywords",
    topics: {
      fr: ["conteneurs STL (vector, map)", "classes et héritage", "templates et généricité", "gestion mémoire et RAII"],
      en: ["STL containers (vector, map)", "classes and inheritance", "templates and generics", "memory management and RAII"],
    },
    keywords: ["#include", "int main", "std::", "class", "return"],
    starter: J(`#include <iostream>

int main() {
    // TODO: implement the exercise
    std::cout << "Hello, TP!" << std::endl;
    return 0;
}`),
  },
  {
    id: "csharp",
    validatorId: "csharp",
    label: "C#",
    icon: "#️⃣",
    color: "#a78bfa",
    ecosystem: {
      fr: ".NET, POO, LINQ, ASP.NET Core, xUnit",
      en: ".NET, OOP, LINQ, ASP.NET Core, xUnit",
    },
    tools: [".NET SDK 8+", "dotnet CLI", "Visual Studio / Rider / VS Code"],
    requirement: "keywords",
    topics: {
      fr: ["classes et propriétés", "requêtes LINQ", "API web ASP.NET Core", "collections génériques"],
      en: ["classes and properties", "LINQ queries", "ASP.NET Core web API", "generic collections"],
    },
    keywords: ["using", "class", "static", "void", "Console.WriteLine"],
    starter: J(`using System;

class Program {
    static void Main() {
        // TODO: implement the exercise
        Console.WriteLine("Hello, TP!");
    }
}`),
  },
  {
    id: "php",
    validatorId: "php",
    label: "PHP",
    icon: "🐘",
    color: "#8b5cf6",
    ecosystem: {
      fr: "web back-end, Composer, Laravel/Symfony, PDO",
      en: "back-end web, Composer, Laravel/Symfony, PDO",
    },
    tools: ["PHP 8.2+", "Composer", "VS Code"],
    requirement: "keywords",
    topics: {
      fr: ["tableaux associatifs", "POO et classes", "accès base de données (PDO)", "mini API REST"],
      en: ["associative arrays", "OOP and classes", "database access (PDO)", "small REST API"],
    },
    keywords: ["<?php", "function", "$", "echo", "class"],
    starter: J(`<?php

function main(): void {
    // TODO: implement the exercise
    echo "Hello, TP!" . PHP_EOL;
}

main();`),
  },
  {
    id: "go",
    validatorId: "go",
    label: "Go",
    icon: "🐹",
    color: "#22d3ee",
    ecosystem: {
      fr: "concurrence (goroutines), modules, net/http, testing",
      en: "concurrency (goroutines), modules, net/http, testing",
    },
    tools: ["Go 1.22+", "go modules", "VS Code"],
    requirement: "keywords",
    topics: {
      fr: ["slices et maps", "goroutines et channels", "serveur HTTP avec net/http", "interfaces"],
      en: ["slices and maps", "goroutines and channels", "HTTP server with net/http", "interfaces"],
    },
    keywords: ["package", "func", "import", "return", "fmt."],
    starter: J(`package main

import "fmt"

func main() {
    // TODO: implement the exercise
    fmt.Println("Hello, TP!")
}`),
  },
  {
    id: "rust",
    validatorId: "rust",
    label: "Rust",
    icon: "🦀",
    color: "#f97316",
    ecosystem: {
      fr: "ownership, borrow checker, Cargo, traits",
      en: "ownership, borrow checker, Cargo, traits",
    },
    tools: ["Rust (rustup) 1.78+", "Cargo", "VS Code + rust-analyzer"],
    requirement: "keywords",
    topics: {
      fr: ["ownership et emprunts", "structs et enums", "gestion d'erreurs avec Result", "traits et génériques"],
      en: ["ownership and borrowing", "structs and enums", "error handling with Result", "traits and generics"],
    },
    keywords: ["fn", "let", "struct", "match", "println!"],
    starter: J(`fn main() {
    // TODO: implement the exercise
    println!("Hello, TP!");
}`),
  },
  {
    id: "kotlin",
    validatorId: "kotlin",
    label: "Kotlin",
    icon: "🟪",
    color: "#c084fc",
    ecosystem: {
      fr: "JVM, null-safety, coroutines, Android, Gradle",
      en: "JVM, null-safety, coroutines, Android, Gradle",
    },
    tools: ["Kotlin 1.9+", "Gradle", "IntelliJ IDEA / Android Studio"],
    requirement: "keywords",
    topics: {
      fr: ["classes et data classes", "null-safety et fonctions d'extension", "coroutines", "collections fonctionnelles"],
      en: ["classes and data classes", "null-safety and extension functions", "coroutines", "functional collections"],
    },
    keywords: ["fun", "val", "var", "class", "println"],
    starter: J(`fun main() {
    // TODO: implement the exercise
    println("Hello, TP!")
}`),
  },
  {
    id: "dart",
    validatorId: "dart",
    label: "Dart",
    icon: "🎯",
    color: "#2dd4bf",
    ecosystem: {
      fr: "Flutter, async/await, null-safety, pub",
      en: "Flutter, async/await, null-safety, pub",
    },
    tools: ["Dart SDK 3+", "Flutter (optional)", "VS Code / Android Studio"],
    requirement: "keywords",
    topics: {
      fr: ["classes et null-safety", "futures et async/await", "collections", "widgets Flutter (intro)"],
      en: ["classes and null-safety", "futures and async/await", "collections", "Flutter widgets (intro)"],
    },
    keywords: ["void main", "class", "final", "var", "print"],
    starter: J(`void main() {
  // TODO: implement the exercise
  print('Hello, TP!');
}`),
  },
  {
    id: "web",
    validatorId: "html",
    label: "Web (HTML/CSS/JS)",
    icon: "🌐",
    color: "#34d399",
    ecosystem: {
      fr: "HTML sémantique, CSS responsive, JavaScript DOM",
      en: "semantic HTML, responsive CSS, DOM JavaScript",
    },
    tools: ["Navigateur moderne", "VS Code", "Live Server (optional)"],
    requirement: "tags",
    topics: {
      fr: ["structure HTML sémantique", "mise en page responsive avec CSS", "interactivité avec JavaScript", "formulaires accessibles"],
      en: ["semantic HTML structure", "responsive layout with CSS", "interactivity with JavaScript", "accessible forms"],
    },
    keywords: ["html", "head", "body", "section", "script"],
    starter: J(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Page</title>
</head>
<body>
  <!-- Start here -->
</body>
</html>`),
  },
];

export const LANGUAGE_BY_ID: Record<string, LanguageProfile> = Object.fromEntries(
  LANGUAGES.map((l) => [l.id, l])
);

export function getLanguage(id: string | undefined | null): LanguageProfile | undefined {
  if (!id) return undefined;
  return LANGUAGE_BY_ID[id];
}
