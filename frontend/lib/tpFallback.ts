/**
 * Language-aware local fallback for the TP Agent Creator.
 *
 * When the LLM backend is offline, the creator still produces a *language-
 * specific* draft (never an HTML-biased one) by drawing on the language
 * registry. The output matches the structured draft shape the UI edits and the
 * backend would otherwise return.
 */
import { LanguageProfile } from "./languages";
import { TPContent, TPStep, TPStatus, QuizQuestion, RubricCriterion } from "@/types";

export interface DraftTP {
  id: string;
  title: string;
  description: string;
  field: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  language: string;
  starterHTML: string;
  content: TPContent;
  steps: TPStep[];
  status: TPStatus;
  antiCheat: boolean;
  createdBy: string;
  createdAt: string;
}

export interface FallbackSettings {
  difficulty: "beginner" | "intermediate" | "advanced";
  stepCount: number;
  questionCount: number;
  uiLang: "fr" | "en";
  antiCheat: boolean;
  prompt: string;
}

const uid = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const MINUTES: Record<string, number> = { beginner: 30, intermediate: 60, advanced: 90 };

function tr(uiLang: "fr" | "en", fr: string, en: string) {
  return uiLang === "fr" ? fr : en;
}

function buildContent(p: LanguageProfile, uiLang: "fr" | "en", difficulty: string): TPContent {
  const topics = p.topics[uiLang];
  const objectives = topics.map((t) =>
    tr(uiLang, `Comprendre et mettre en pratique : ${t}.`, `Understand and practise: ${t}.`)
  );
  const evaluationCriteria: RubricCriterion[] = [
    { criterion: tr(uiLang, "Exactitude fonctionnelle", "Functional correctness"), points: 40 },
    { criterion: tr(uiLang, `Bonnes pratiques ${p.label}`, `${p.label} best practices`), points: 25 },
    { criterion: tr(uiLang, "Lisibilité et structure du code", "Code readability and structure"), points: 20 },
    { criterion: tr(uiLang, "Tests / cas limites traités", "Tests / edge cases handled"), points: 15 },
  ];
  return {
    context: tr(
      uiLang,
      `Ce TP ${p.label} met les étudiants en situation autour de ${topics[0]}. ${p.ecosystem.fr}.`,
      `This ${p.label} lab puts students to work on ${topics[0]}. ${p.ecosystem.en}.`
    ),
    objectives,
    prerequisites: [
      tr(uiLang, `Bases de la syntaxe ${p.label}`, `${p.label} syntax fundamentals`),
      tr(uiLang, "Notions d'algorithmique", "Basic algorithmics"),
    ],
    tools: [...p.tools],
    expectedOutput: tr(
      uiLang,
      "Un programme qui compile/s'exécute et produit le résultat attendu pour les cas de test fournis.",
      "A program that compiles/runs and produces the expected result for the provided test cases."
    ),
    constraints: [
      tr(uiLang, "N'utiliser que la bibliothèque standard sauf indication contraire.", "Use only the standard library unless stated otherwise."),
      tr(uiLang, "Respecter les conventions de nommage du langage.", "Follow the language naming conventions."),
    ],
    evaluationCriteria,
    bonus: [
      tr(uiLang, `Ajouter des tests automatisés (${difficulty === "advanced" ? "couverture complète" : "cas principaux"}).`, `Add automated tests (${difficulty === "advanced" ? "full coverage" : "main cases"}).`),
      tr(uiLang, "Optimiser la complexité de la solution.", "Optimise the solution's complexity."),
    ],
  };
}

function buildQuiz(count: number, topic: string, p: LanguageProfile, uiLang: "fr" | "en"): QuizQuestion[] {
  return Array.from({ length: count }).map(() => ({
    id: uid(),
    question: tr(
      uiLang,
      `À propos de « ${topic} » en ${p.label}, quelle affirmation est correcte ?`,
      `Regarding "${topic}" in ${p.label}, which statement is correct?`
    ),
    options: [
      { id: "a", text: tr(uiLang, "Réponse A — à compléter", "Answer A — to complete") },
      { id: "b", text: tr(uiLang, "Réponse B — à compléter", "Answer B — to complete") },
      { id: "c", text: tr(uiLang, "Réponse C — à compléter", "Answer C — to complete") },
      { id: "d", text: tr(uiLang, "Réponse D — à compléter", "Answer D — to complete") },
    ],
    correctId: "a",
    explanation: tr(uiLang, "Justification à relire par l'enseignant.", "Rationale to be reviewed by the teacher."),
  }));
}

export function buildSteps(p: LanguageProfile, s: FallbackSettings): TPStep[] {
  const topics = p.topics[s.uiLang];
  return Array.from({ length: s.stepCount }).map((_, i) => {
    const topic = topics[i % topics.length];
    const tags = p.keywords.slice(0, Math.max(2, Math.min(p.keywords.length, 3)));
    return {
      id: uid(),
      title: tr(s.uiLang, `Étape ${i + 1} — ${topic}`, `Step ${i + 1} — ${topic}`),
      instructions: tr(
        s.uiLang,
        `Implémentez la partie liée à ${topic}. Utilisez les constructions ${p.label} appropriées et respectez les contraintes du TP.`,
        `Implement the part dealing with ${topic}. Use the appropriate ${p.label} constructs and respect the lab constraints.`
      ),
      requiredTags: tags,
      quiz: buildQuiz(s.questionCount, topic, p, s.uiLang),
    };
  });
}

function deriveTitle(p: LanguageProfile, s: FallbackSettings): string {
  const prompt = s.prompt.trim();
  if (prompt) {
    const short = prompt.length > 60 ? prompt.slice(0, 57) + "…" : prompt;
    return short.charAt(0).toUpperCase() + short.slice(1);
  }
  const topic = p.topics[s.uiLang][0];
  return tr(s.uiLang, `TP ${p.label} — ${topic}`, `${p.label} Lab — ${topic}`);
}

export function buildLocalTP(p: LanguageProfile, s: FallbackSettings, createdBy: string): DraftTP {
  return {
    id: uid(),
    title: deriveTitle(p, s),
    description: tr(
      s.uiLang,
      `TP ${p.label} généré localement — brouillon à relire et enrichir.`,
      `Locally generated ${p.label} lab — draft to review and enrich.`
    ),
    field: tr(s.uiLang, `Programmation ${p.label}`, `${p.label} Programming`),
    difficulty: s.difficulty,
    estimatedMinutes: MINUTES[s.difficulty] ?? 45,
    language: p.id,
    starterHTML: p.starter,
    content: buildContent(p, s.uiLang, s.difficulty),
    steps: buildSteps(p, s),
    status: "draft",
    antiCheat: s.antiCheat,
    createdBy,
    createdAt: new Date().toISOString(),
  };
}

/** Locally regenerate a single section (used when the LLM enhance/regen is down). */
export function regenerateLocalSection(
  section: string,
  p: LanguageProfile,
  s: FallbackSettings
): unknown {
  const content = buildContent(p, s.uiLang, s.difficulty);
  switch (section) {
    case "steps":
      return buildSteps(p, s);
    case "quiz":
      return buildSteps(p, s).map((st) => st.quiz);
    case "starter":
      return p.starter;
    case "context":
    case "expectedOutput":
      return content[section];
    case "objectives":
    case "prerequisites":
    case "tools":
    case "constraints":
    case "bonus":
    case "evaluationCriteria":
      return content[section];
    default:
      return null;
  }
}
