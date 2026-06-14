import { TP, TPProgress, Assignment, StepProgress, Evaluation } from "@/types";
import { authService } from "./authService";
import { publishProgress } from "./realtimeService";
import { getEvaluationSettings, totalFailedRuns } from "@/lib/evaluationSettings";

/**
 * TP service — talks to the real tp-service (TPs, assignments, progress)
 * through the API gateway. All persistence lives in PostgreSQL (tp_db);
 * there is no client-side mock store anymore.
 *
 * I/O methods are async. Pure scoring/format helpers stay synchronous.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = authService.getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { headers: headers() });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export const tpService = {
  ONLINE_WINDOW_SECONDS: 120,

  // ─── TP CRUD ────────────────────────────────────────────────────────────────
  async getAllTPs(): Promise<TP[]> {
    return getJson<TP[]>("/api/tps", []);
  },

  async getTPById(id: string): Promise<TP | null> {
    return getJson<TP | null>(`/api/tps/${id}`, null);
  },

  /** Create a TP. Returns the persisted TP (with its server id) or null. */
  async saveTP(tp: Partial<TP>): Promise<TP | null> {
    try {
      const res = await fetch(`${API_BASE}/api/tps`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(tp),
      });
      if (!res.ok) return null;
      return (await res.json()) as TP;
    } catch {
      return null;
    }
  },

  async deleteTP(id: string): Promise<void> {
    try {
      await fetch(`${API_BASE}/api/tps/${id}`, { method: "DELETE", headers: headers() });
    } catch { /* ignore */ }
  },

  // ─── Assignments ──────────────────────────────────────────────────────────
  async getAssignmentsForTeacher(teacherId: string): Promise<Assignment[]> {
    return getJson<Assignment[]>(`/api/assignments?teacherId=${encodeURIComponent(teacherId)}`, []);
  },

  async getAssignmentsForStudent(studentId: string): Promise<Assignment[]> {
    return getJson<Assignment[]>(`/api/assignments?studentId=${encodeURIComponent(studentId)}`, []);
  },

  async saveAssignment(assignment: Partial<Assignment>): Promise<Assignment | null> {
    try {
      const res = await fetch(`${API_BASE}/api/assignments`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          tpId: assignment.tpId,
          studentIds: assignment.studentIds ?? [],
          dueDate: assignment.dueDate ?? null,
        }),
      });
      if (!res.ok) return null;
      return (await res.json()) as Assignment;
    } catch {
      return null;
    }
  },

  // ─── Progress ───────────────────────────────────────────────────────────────
  async getProgress(studentId: string, tpId: string): Promise<TPProgress | null> {
    try {
      const res = await fetch(`${API_BASE}/api/progress/${studentId}/${tpId}`, { headers: headers() });
      if (!res.ok) return null; // 404 → no progress yet
      return (await res.json()) as TPProgress;
    } catch {
      return null;
    }
  },

  async getProgressByTp(tpId: string): Promise<TPProgress[]> {
    return getJson<TPProgress[]>(`/api/progress?tpId=${encodeURIComponent(tpId)}`, []);
  },

  async createProgress(
    studentId: string,
    tpId: string,
    assignmentId: string,
    steps: { id: string }[]
  ): Promise<TPProgress> {
    const body = {
      assignmentId,
      currentStepIndex: 0,
      status: "in_progress",
      totalTimeSeconds: 0,
      quizAnswers: {},
      steps: steps.map(
        (s): StepProgress => ({
          stepId: s.id,
          code: "",
          timeSpentSeconds: 0,
          hintsUsed: 0,
          hintHistory: [],
          validationErrors: [],
          completed: false,
        })
      ),
    };
    try {
      const res = await fetch(`${API_BASE}/api/progress/${tpId}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });
      if (res.ok) return (await res.json()) as TPProgress;
    } catch { /* fall through */ }
    // Local optimistic object if the backend is unreachable.
    return {
      id: `prog-${Date.now()}`,
      studentId,
      tpId,
      assignmentId,
      currentStepIndex: 0,
      steps: body.steps,
      quizAnswers: {},
      totalTimeSeconds: 0,
      status: "in_progress",
      startedAt: new Date().toISOString(),
    };
  },

  /** Persist a progress snapshot (upsert by student+tp) and push it live. */
  async saveProgress(progress: TPProgress): Promise<TPProgress | null> {
    let saved: TPProgress | null = null;
    try {
      const res = await fetch(`${API_BASE}/api/progress/${progress.studentId}/${progress.tpId}`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify(progress),
      });
      if (res.ok) saved = (await res.json()) as TPProgress;
    } catch { /* ignore — realtime push below still informs dashboards */ }
    // Broadcast the latest snapshot so live dashboards update immediately.
    publishProgress(saved ?? progress);
    return saved;
  },

  // ─── Pure helpers (no I/O) ───────────────────────────────────────────────────
  isOnline(progress: TPProgress | null | undefined): boolean {
    if (!progress?.lastActiveAt) return false;
    const last = new Date(progress.lastActiveAt).getTime();
    return Date.now() - last <= this.ONLINE_WINDOW_SECONDS * 1000;
  },

  getBestCode(progress: TPProgress | null | undefined): string {
    if (!progress) return "";
    for (let i = progress.steps.length - 1; i >= 0; i--) {
      const c = progress.steps[i]?.code?.trim();
      if (c) return progress.steps[i].code;
    }
    return "";
  },

  evaluateStudent(progress: TPProgress | null | undefined, tp: TP): Evaluation {
    if (!progress || progress.status === "not_started") {
      return {
        points: 0,
        grade: "—",
        factors: [
          { label: "Time", score: 0, max: 30, detail: "Not started" },
          { label: "Hints", score: 0, max: 30, detail: "Not started" },
          { label: "Code format", score: 0, max: 40, detail: "No code submitted" },
        ],
      };
    }

    const estimateSec = Math.max(60, tp.estimatedMinutes * 60);
    const actualSec = Math.max(1, progress.totalTimeSeconds);
    const timeScore = Math.round(30 * Math.min(1, estimateSec / actualSec));
    const overBy = Math.max(0, actualSec - estimateSec);
    const timeDetail =
      overBy === 0
        ? `${Math.round(actualSec / 60)}m — within the ${tp.estimatedMinutes}m estimate`
        : `${Math.round(actualSec / 60)}m — ${Math.round(overBy / 60)}m over the ${tp.estimatedMinutes}m estimate`;

    const hintsUsed = progress.steps.reduce((s, st) => s + (st.hintsUsed ?? 0), 0);
    const allowed = Math.max(1, progress.steps.length * 2);
    const hintScore = Math.round(30 * Math.max(0, 1 - hintsUsed / allowed));
    const hintDetail = `${hintsUsed} hint${hintsUsed === 1 ? "" : "s"} used`;

    const code = this.getBestCode(progress);
    const requiredTags = Array.from(
      new Set(tp.steps.flatMap((s) => s.requiredTags ?? []))
    );
    const present = requiredTags.filter((t) =>
      new RegExp(`<${t}[\\s>/]`, "i").test(code)
    );
    const coverage = requiredTags.length
      ? present.length / requiredTags.length
      : code.trim()
      ? 1
      : 0;
    const coverageScore = Math.round(20 * coverage);

    let formatScore = 0;
    if (/<!doctype html>/i.test(code)) formatScore += 4;
    if (/\n[ \t]+\S/.test(code)) formatScore += 4; // some indentation
    const opens = (code.match(/<[a-zA-Z][^>]*[^/]>/g) ?? []).length;
    const closes = (code.match(/<\/[a-zA-Z]+>/g) ?? []).length;
    if (opens > 0 && closes > 0 && Math.abs(opens - closes) <= 2) formatScore += 6; // roughly balanced
    if (code.trim().length > 80) formatScore += 6; // not just the empty starter
    formatScore = Math.min(20, formatScore);

    const codeScore = coverageScore + formatScore;
    const codeDetail = requiredTags.length
      ? `${present.length}/${requiredTags.length} required tags · formatting ${formatScore}/20`
      : code.trim()
      ? `formatting ${formatScore}/20`
      : "No code submitted";

    const rawPoints = Math.min(100, timeScore + hintScore + codeScore);

    // Excessive failed runs penalty (configurable via system settings).
    const settings = getEvaluationSettings();
    const failedRuns = totalFailedRuns(progress.steps);
    const penaltyApplies = failedRuns > settings.failedRunThreshold;
    const penalty = penaltyApplies ? settings.failedRunPenaltyPercent : 0;
    const points = Math.max(0, rawPoints - penalty);

    const grade =
      points >= 90 ? "A" : points >= 75 ? "B" : points >= 60 ? "C" : points >= 45 ? "D" : "F";

    const factors = [
      { label: "Time", score: timeScore, max: 30, detail: timeDetail },
      { label: "Hints", score: hintScore, max: 30, detail: hintDetail },
      { label: "Code format", score: codeScore, max: 40, detail: codeDetail },
    ];
    if (penaltyApplies) {
      factors.push({
        label: "Run penalty",
        score: -penalty,
        max: 0,
        detail: `${failedRuns} failed runs (> ${settings.failedRunThreshold}) → −${penalty}%`,
      });
    }

    return { points, grade, factors };
  },

  generateExplanation(tp: TP, stepIndex: number): string {
    const step = tp.steps[stepIndex];
    if (!step) return "No explanation available.";

    const tagList = step.requiredTags.map((t) => `<${t}>`).join(", ");

    return `
# 📚 ${step.title}

## What you need to do
${step.instructions}

## Key concept
In this step, you'll be working with the following HTML element(s): **${tagList}**.

## Why it matters
HTML elements are the building blocks of every web page.
Each tag has a specific purpose: some display content, some organize structure, and some allow user interaction.

## How to approach it
1. Read the instructions carefully.
2. Look at the starter code and understand what's already there.
3. Add only the required elements — don't delete what exists.
4. Click **Run** to preview your result in real-time.
5. When you're happy, click **Validate** to check your work.

## 💡 Remember
- HTML tags always come in pairs: an opening tag \`<tag>\` and a closing tag \`</tag>\`.
- Nesting matters! Make sure your elements are properly nested inside \`<body>\`.

Good luck! You can do this. 🚀
    `.trim();
  },

  generateClarification(question: string, tp: TP): string {
    const lower = question.toLowerCase();

    if (lower.includes("what") && lower.includes("tag")) {
      return "Every HTML element is defined by a tag. Tags are written in angle brackets like <tagname>. They tell the browser what kind of content to display.";
    }
    if (lower.includes("where") || lower.includes("place")) {
      return "All visible content goes inside the <body> tag. Metadata and styles go inside <head>.";
    }
    if (lower.includes("how")) {
      return "Start by typing the opening tag, then your content, then the closing tag. For example: <h1>My Heading</h1>.";
    }
    if (lower.includes("error") || lower.includes("wrong")) {
      return "Don't worry! Check that you've spelled the tag correctly and that it's inside <body>. Use the validator to see exactly what's missing.";
    }

    return `Great question about "${tp.title}"! The key is to focus on the required HTML elements. Re-read the instructions carefully and try typing the code yourself — no copy-paste allowed. You've got this!`;
  },
};
