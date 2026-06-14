/**
 * System-configurable evaluation settings.
 *
 * Defaults live here; an admin can override them at runtime from the debug/status
 * page (persisted to localStorage). Kept on the client because the final grade is
 * computed client-side in tpService.evaluateStudent.
 */

export interface EvaluationSettings {
  /** Failed runs strictly above this count trigger the penalty. */
  failedRunThreshold: number;
  /** Percentage points subtracted from the final score when the threshold is exceeded. */
  failedRunPenaltyPercent: number;
}

export const DEFAULT_EVALUATION_SETTINGS: EvaluationSettings = {
  failedRunThreshold: 5,
  failedRunPenaltyPercent: 5,
};

const KEY = "agentic_tp_eval_settings";

export function getEvaluationSettings(): EvaluationSettings {
  if (typeof window === "undefined") return DEFAULT_EVALUATION_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_EVALUATION_SETTINGS;
    return { ...DEFAULT_EVALUATION_SETTINGS, ...(JSON.parse(raw) as Partial<EvaluationSettings>) };
  } catch {
    return DEFAULT_EVALUATION_SETTINGS;
  }
}

export function setEvaluationSettings(patch: Partial<EvaluationSettings>): EvaluationSettings {
  const next = { ...getEvaluationSettings(), ...patch };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}

/** Sum failed runs across all steps of a progress record. */
export function totalFailedRuns(steps: { runsFailed?: number }[] | undefined): number {
  return (steps ?? []).reduce((sum, s) => sum + (s.runsFailed ?? 0), 0);
}
