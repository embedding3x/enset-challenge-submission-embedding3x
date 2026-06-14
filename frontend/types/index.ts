// ─── User ────────────────────────────────────────────────────────────────────
export type UserRole = "teacher" | "student";

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // legacy mock field; real auth uses JWT, not stored passwords
  role: UserRole;
  avatarInitials: string;
}

// ─── TP (Practical Work) ─────────────────────────────────────────────────────
/** A runnable test case: feed `stdin`, expect `expectedStdout` on standard output. */
export interface TestCase {
  id?: string;
  name: string;
  stdin: string;
  expectedStdout: string;
}

export interface TPStep {
  id: string;
  title: string;
  instructions: string;
  /**
   * Required constructs the step is validated against. For web TPs these are
   * HTML tags (e.g. ["h1", "p"]); for every other language they are required
   * keywords/concepts (e.g. ["class", "List", "@Override"]).
   */
  requiredTags: string[];
  /** Runnable test cases (executable languages); empty for web TPs. */
  testCases?: TestCase[];
  quiz: QuizQuestion[];
}

/** A single rubric line in the evaluation criteria. */
export interface RubricCriterion {
  criterion: string;
  points: number;
}

/**
 * University-level structured content produced by the TP Agent Creator and
 * editable by the teacher in the Human-in-the-Loop review step.
 */
export interface TPContent {
  /** Context / problem statement. */
  context: string;
  /** Learning objectives. */
  objectives: string[];
  /** Prerequisites. */
  prerequisites: string[];
  /** Required tools / environment. */
  tools: string[];
  /** Expected output / result. */
  expectedOutput: string;
  /** Constraints the solution must respect. */
  constraints: string[];
  /** Evaluation rubric. */
  evaluationCriteria: RubricCriterion[];
  /** Bonus challenges / extensions. */
  bonus: string[];
}

/** Human-in-the-Loop lifecycle status of a generated TP. */
export type TPStatus = "draft" | "reviewed" | "enhanced" | "published";

export interface TP {
  id: string;
  title: string;
  description: string;
  field: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  /** Starter code shown in the student editor (any language, not only HTML). */
  starterHTML: string;
  steps: TPStep[];
  /** Primary programming language id (java, python, web…). See lib/languages. */
  language?: string;
  /** Structured, university-level sections (objectives, rubric, etc.). */
  content?: TPContent;
  /** Human-in-the-Loop status. Defaults to "published" for legacy TPs. */
  status?: TPStatus;
  /** Teacher setting: block paste/drop in the student editor. Default true. */
  antiCheat?: boolean;
  createdBy: string; // teacher id
  createdAt: string;
}

// ─── Assignment ───────────────────────────────────────────────────────────────
export interface Assignment {
  id: string;
  tpId: string;
  studentIds: string[];
  assignedBy: string;
  assignedAt: string;
  dueDate?: string;
}

// ─── Student Progress ─────────────────────────────────────────────────────────
export interface HintHistoryEntry {
  level: number;
  text: string;
  missingTags: string[];
  timestamp: string;
}

export interface StepProgress {
  stepId: string;
  code: string;
  timeSpentSeconds: number;
  hintsUsed: number;
  hintHistory: HintHistoryEntry[];
  validationErrors: string[];
  /** Total code executions ("Run") the student triggered on this step. */
  runsTotal?: number;
  /** Executions that failed (compile or runtime error / failed tests). */
  runsFailed?: number;
  completed: boolean;
  completedAt?: string;
}

export interface TPProgress {
  id: string;
  studentId: string;
  tpId: string;
  assignmentId: string;
  currentStepIndex: number;
  steps: StepProgress[];
  quizAnswers: Record<string, string>; // questionId -> answerId
  quizScore?: number;
  totalTimeSeconds: number;
  status: "not_started" | "in_progress" | "completed";
  startedAt?: string;
  completedAt?: string;
  lastActiveAt?: string; 
}

export interface EvaluationFactor {
  label: string;
  score: number;
  max: number; 
  detail: string; 
}

export interface Evaluation {
  points: number; 
  grade: string;
  factors: EvaluationFactor[];
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────
export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: QuizOption[];
  correctId: string;
  explanation: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────
export interface TestCaseResult {
  name: string;
  passed: boolean;
  stdin?: string;
  expected?: string;
  actual?: string;
  stderr?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  hints: string[];
  /** How the result was produced: structure | syntax | execution | unavailable | presence. */
  checked?: string;
  suggestions?: string[];
  testResults?: TestCaseResult[];
  testsPassed?: number;
  testsTotal?: number;
  compileOutput?: string;
  runtimeError?: string;
}
