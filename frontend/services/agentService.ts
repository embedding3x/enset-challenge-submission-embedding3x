/**
 * Agent Service — connects the frontend to the AI agent gateway.
 *
 * Routes:
 *   POST /api/agents/explain       → Explanation Agent (Mistral)
 *   POST /api/agents/hint          → Hint Agent (deepseek-coder:6.7b via Ollama)
 *   POST /api/agents/generate-quiz → Evaluation Agent (Gemma 3 27B)
 *   POST /api/agents/evaluate      → Evaluation Agent scoring
 *
 * Falls back gracefully when the backend is unavailable.
 */

const AGENT_BASE =
  process.env.NEXT_PUBLIC_AGENT_GATEWAY_URL ?? "http://localhost:8000";

function getAuthHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem("agentic_tp_session");
  if (!raw) return {};
  try {
    const session = JSON.parse(raw);
    const token = session.token ?? session.jwt ?? null;
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    // ignore
  }
  return {};
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${AGENT_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`Agent request failed [${res.status}]: ${err}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExplainRequest {
  tp_id: string;
  tp_title: string;
  tp_description: string;
  step_id: string;
  step_title: string;
  step_instructions: string;
  required_tags: string[];
  question?: string;
  session_id?: string;
}

export interface ExplainResponse {
  explanation: string;
  type: "explanation" | "clarification" | "guidance";
  agent: string;
  model: string;
}

export interface HintRequest {
  step_id: string;
  step_title: string;
  step_instructions: string;
  student_code: string;
  /** Programming language — makes hints language-aware (not HTML-only). */
  language?: string;
  required_tags: string[];
  /** Latest compiler/runtime/failed-test output so hints address real errors. */
  error_output?: string;
  hints_already_given: number;
  previous_hints: string[];
  /** Failed run attempts so far — drives hint urgency. */
  attempt_number?: number;
  session_id?: string;
}

export interface HintResponse {
  hint: string;
  hint_level: number;
  validation_passed: boolean;
  missing_tags: string[];
  agent: string;
  model: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface GenerateQuizRequest {
  tp_id: string;
  tp_title: string;
  tp_description: string;
  step_titles: string[];
  student_code: string;
  num_questions?: number;
}

export interface GenerateQuizResponse {
  questions: QuizQuestion[];
  agent: string;
  model: string;
}

export interface EvaluateAnswersRequest {
  tp_id: string;
  tp_title: string;
  questions: QuizQuestion[];
  student_answers: number[];
  student_code: string;
}

// ── Generate / Enhance TP ───────────────────────────────────────────────────

export interface GenerateTPRequest {
  prompt: string;
  /** Highest-priority constraint: the programming language id (java, python, web…). */
  prog_language: string;
  /** Prose language for the generated text (fr / en). */
  ui_language?: string;
  difficulty: string;
  step_count: number;
  /** How many quiz questions the agent must generate for each step. */
  questions_per_step?: number;
  file_names?: string[];
  course_ids?: string[];
}

export interface AgentTPContent {
  context: string;
  objectives: string[];
  prerequisites: string[];
  tools: string[];
  expectedOutput: string;
  constraints: string[];
  evaluationCriteria: Array<{ criterion: string; points: number }>;
  bonus: string[];
}

export interface AgentTP {
  id: string;
  title: string;
  description: string;
  field?: string;
  difficulty: string;
  estimatedMinutes: number;
  language: string;
  starterHTML: string;
  content: AgentTPContent;
  steps: Array<{
    id: string;
    title: string;
    instructions: string;
    requiredTags: string[];
    quiz: Array<{
      id: string;
      question: string;
      options: { id: string; text: string }[];
      correctId: string;
      explanation: string;
    }>;
  }>;
  status?: string;
}

export interface GenerateTPResponse {
  tp: AgentTP;
  agent: string;
  model: string;
  used_rag: boolean;
}

export interface EnhanceTPRequest {
  tp: unknown;
  prog_language: string;
  ui_language?: string;
  /** Optional free-text steering from the teacher. */
  instructions?: string;
}

export interface EnhanceTPResponse {
  tp: AgentTP;
  agent: string;
  model: string;
}

/** Sections that can be regenerated independently in the review step. */
export type RegenerableSection =
  | "context"
  | "objectives"
  | "prerequisites"
  | "tools"
  | "expectedOutput"
  | "constraints"
  | "evaluationCriteria"
  | "bonus"
  | "starter"
  | "steps"
  | "quiz";

export interface RegenerateSectionRequest {
  section: RegenerableSection;
  tp: unknown;
  prog_language: string;
  ui_language?: string;
  difficulty?: string;
  step_count?: number;
  questions_per_step?: number;
}

export interface RegenerateSectionResponse {
  section: RegenerableSection;
  /** The regenerated value, shaped per section (string | string[] | steps[]…). */
  value: unknown;
  agent: string;
  model: string;
}

export interface EvaluateAnswersResponse {
  score: number;
  correct: number;
  total: number;
  grade: string;
  feedback: string;
  breakdown: Array<{
    question_num: number;
    question: string;
    student_answer: string;
    correct_answer: string;
    is_correct: boolean;
    explanation: string;
  }>;
  agent: string;
  model: string;
}

export interface ServiceStatus {
  name: string;
  kind: string;
  status: "up" | "degraded" | "down";
  latency_ms: number;
  url: string;
  model?: string;
  error?: string;
}

export interface PlatformStatus {
  overall: "ok" | "degraded" | "down";
  checked_at: string;
  services: ServiceStatus[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const agentService = {
  /**
   * Get an AI explanation of a TP step (or answer a clarification question).
   * Uses Mistral via the Explanation Agent.
   */
  async explain(req: ExplainRequest): Promise<ExplainResponse> {
    return post<ExplainResponse>("/api/agents/explain", req);
  },

  /**
   * Get a progressive hint for the student's current code.
   * Uses deepseek-coder:6.7b via the Hint Agent (Ollama).
   */
  async getHint(req: HintRequest): Promise<HintResponse> {
    return post<HintResponse>("/api/agents/hint", req);
  },

  /**
   * Generate AI quiz questions based on the student's completed TP.
   * Uses Gemma 3 27B via the Evaluation Agent.
   */
  async generateQuiz(req: GenerateQuizRequest): Promise<GenerateQuizResponse> {
    return post<GenerateQuizResponse>("/api/agents/generate-quiz", req);
  },

  /**
   * Evaluate the student's quiz answers and generate feedback.
   * Uses Gemma 3 27B via the Evaluation Agent.
   */
  async evaluate(req: EvaluateAnswersRequest): Promise<EvaluateAnswersResponse> {
    return post<EvaluateAnswersResponse>("/api/agents/evaluate", req);
  },

  /**
   * Ask the AI agent to generate a full, language-specific TP draft from a
   * prompt or uploaded files. The selected programming language is the
   * highest-priority constraint. Falls back gracefully when the backend is down.
   */
  async generateTP(req: GenerateTPRequest): Promise<GenerateTPResponse> {
    return post<GenerateTPResponse>("/api/agents/generate-tp", req);
  },

  /**
   * AI-assisted refinement of a teacher-reviewed draft. Improves clarity and
   * academic quality, fixes inconsistencies, keeps the TP aligned with the
   * selected language — while preserving the teacher's edits.
   */
  async enhanceTP(req: EnhanceTPRequest): Promise<EnhanceTPResponse> {
    return post<EnhanceTPResponse>("/api/agents/enhance-tp", req);
  },

  /**
   * Regenerate a single section of the draft (objectives, test cases, starter
   * code, etc.) without touching the rest of the teacher's work.
   */
  async regenerateSection(
    req: RegenerateSectionRequest
  ): Promise<RegenerateSectionResponse> {
    return post<RegenerateSectionResponse>("/api/agents/regenerate-section", req);
  },

  /** Fetch the list of programming languages the agent supports. */
  async getSupportedLanguages(): Promise<{ languages: Array<{ id: string; label: string }> }> {
    const res = await fetch(`${AGENT_BASE}/api/agents/languages`, { method: "GET" });
    if (!res.ok) throw new Error("Could not load supported languages");
    return res.json();
  },

  /** Aggregated health of all agents, the LLM backend and the sandbox (admin/debug). */
  async getPlatformStatus(): Promise<PlatformStatus> {
    const res = await fetch(`${AGENT_BASE}/api/agents/status`, { method: "GET" });
    if (!res.ok) throw new Error(`Status check failed [${res.status}]`);
    return res.json() as Promise<PlatformStatus>;
  },

  /**
   * Check if the agent gateway is reachable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${AGENT_BASE}/health`, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  },
};
