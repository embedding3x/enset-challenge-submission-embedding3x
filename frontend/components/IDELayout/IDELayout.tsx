"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import CodeEditor from "@/components/editor/CodeEditor";
import LivePreview from "@/components/Preview/LivePreview";
import RunConsole from "@/components/Preview/RunConsole";
import HintBox from "@/components/agents/HintBox";
import { TPStep, ValidationResult, TPProgress, StepProgress, HintHistoryEntry } from "@/types";
import { createValidatorForStep } from "@/patterns/InterpreterPattern";
import { tpService } from "@/services/tpService";
import { validationService } from "@/services/validationService";

interface IDELayoutProps {
  step: TPStep;
  stepIndex: number;
  totalSteps: number;
  progress: TPProgress;
  starterHTML: string;
  /** TP language — drives which validator the validation-service runs. */
  language?: string;
  /** When false, paste/drag-drop are allowed in the editor. */
  antiCheat?: boolean;
  onStepComplete: (code: string, timeSeconds: number, hints: number) => void;
  onProgressUpdate: (updated: TPProgress) => void;
}

export default function IDELayout({
  step,
  stepIndex,
  totalSteps,
  progress,
  starterHTML,
  language = "html",
  antiCheat = true,
  onStepComplete,
  onProgressUpdate,
}: IDELayoutProps) {
  const stepProgress = progress.steps[stepIndex];
  // The live HTML preview only makes sense for web TPs; other languages keep a
  // full-width editor and rely on the validation-service for feedback.
  const isWebPreview = ["html", "css", "web"].includes((language ?? "").toLowerCase());
  const [code, setCode] = useState(stepProgress?.code || starterHTML);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(stepProgress?.hintsUsed ?? 0);
  const [timeSeconds, setTimeSeconds] = useState(stepProgress?.timeSpentSeconds ?? 0);
  const [showHints, setShowHints] = useState(false);
  // Run-attempt tracking (penalty system) + latest error output for the hint agent.
  const [runsTotal, setRunsTotal] = useState(stepProgress?.runsTotal ?? 0);
  const [runsFailed, setRunsFailed] = useState(stepProgress?.runsFailed ?? 0);
  const [errorOutput, setErrorOutput] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs always hold the latest values so the periodic autosave can never
  // persist a stale snapshot (the old closure-based save wiped hint history
  // and time on every tick — that was the "progress resets on refresh" bug).
  const codeRef = useRef(code);
  codeRef.current = code;
  const timeRef = useRef(timeSeconds);
  timeRef.current = timeSeconds;
  const hintsRef = useRef(hintsUsed);
  hintsRef.current = hintsUsed;
  const progressRef = useRef(progress);
  progressRef.current = progress;

  /**
   * Persist the freshest snapshot of the current step (code, time, hints) on
   * top of the latest known progress. `patch` lets callers add fields that
   * aren't tracked by refs (e.g. hintHistory).
   */
  const persistStep = useCallback(
    (patch: Partial<StepProgress> = {}) => {
      const base = progressRef.current;
      const steps = base.steps.map((s, i) =>
        i === stepIndex
          ? {
              ...s,
              code: codeRef.current,
              timeSpentSeconds: timeRef.current,
              hintsUsed: hintsRef.current,
              ...patch,
            }
          : s
      );
      const updated: TPProgress = {
        ...base,
        steps,
        totalTimeSeconds: steps.reduce((sum, s) => sum + (s.timeSpentSeconds ?? 0), 0),
        lastActiveAt: new Date().toISOString(),
      };
      progressRef.current = updated;
      tpService.saveProgress(updated);
      onProgressUpdate(updated);
    },
    [stepIndex, onProgressUpdate]
  );

  // ── Step timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => setTimeSeconds((prev) => prev + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stepIndex]);

  // Autosave every 5s of activity.
  useEffect(() => {
    if (timeSeconds > 0 && timeSeconds % 5 === 0) persistStep();
  }, [timeSeconds, persistStep]);

  // Flush a final snapshot when the tab is hidden (refresh, close, nav away)
  // so at most a moment of work is lost.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") persistStep();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [persistStep]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const handleHintUsed = useCallback(
    (entry: HintHistoryEntry) => {
      const next = hintsUsed + 1;
      setHintsUsed(next);
      hintsRef.current = next;
      const current = progressRef.current.steps[stepIndex];
      persistStep({ hintHistory: [...(current?.hintHistory ?? []), entry] });
    },
    [hintsUsed, stepIndex, persistStep]
  );

  // ── Run-attempt tracking (penalty system) ─────────────────────────────────
  const recordRun = useCallback(
    (failed: boolean, errOut?: string) => {
      const cur = progressRef.current.steps[stepIndex];
      const nextTotal = (cur?.runsTotal ?? 0) + 1;
      const nextFailed = (cur?.runsFailed ?? 0) + (failed ? 1 : 0);
      setRunsTotal(nextTotal);
      setRunsFailed(nextFailed);
      if (errOut !== undefined) setErrorOutput(errOut);
      persistStep({ runsTotal: nextTotal, runsFailed: nextFailed });
    },
    [stepIndex, persistStep]
  );

  // Live console "▶ Run": only genuine executions count (infra failures don't).
  const handleConsoleRun = useCallback(
    (o: { ran: boolean; ok: boolean; errorOutput?: string }) => {
      if (!o.ran) return;
      recordRun(!o.ok, o.errorOutput ?? "");
    },
    [recordRun]
  );

  // Build a compact error summary from a validation result to feed the hint agent.
  const errorFromValidation = (r: ValidationResult): string => {
    const parts: string[] = [];
    if (r.compileOutput) parts.push("Compilation error:\n" + r.compileOutput);
    if (r.runtimeError) parts.push("Runtime error:\n" + r.runtimeError);
    (r.testResults ?? [])
      .filter((t) => !t.passed)
      .forEach((t) =>
        parts.push(
          `Test "${t.name}" failed — expected: ${t.expected ?? ""} | got: ${t.actual ?? ""}` +
            (t.stderr ? ` | stderr: ${t.stderr}` : "")
        )
      );
    if (!parts.length && r.errors?.length) parts.push(r.errors.join("\n"));
    return parts.join("\n\n");
  };

  // ── Validate ────────────────────────────────────────────────────────────────
  // Real validation runs in the validation-service (per-language: HTML
  // structure, JS/Python syntax, …). The local Interpreter-pattern HTML
  // validator is the offline fallback.
  const runValidation = useCallback(async (): Promise<ValidationResult> => {
    const remote = await validationService.validate({
      language,
      code: codeRef.current,
      requiredTags: step.requiredTags ?? [],
      testCases: step.testCases ?? [],
    });
    if (remote) return remote;
    return createValidatorForStep(step.requiredTags ?? []).validate(codeRef.current);
  }, [language, step.requiredTags, step.testCases]);

  // Execution-based validation (compile + run test cases) is a real run attempt;
  // structural/web checks are not counted against the student.
  const accountForRun = useCallback(
    (result: ValidationResult) => {
      if (result.checked === "execution" || result.checked === "syntax") {
        recordRun(!result.valid, result.valid ? "" : errorFromValidation(result));
      }
    },
    [recordRun]
  );

  const handleValidate = useCallback(async () => {
    setValidating(true);
    const result = await runValidation();
    setValidating(false);
    accountForRun(result);
    setValidation(result);
    if (!result.valid) setShowHints(true);
  }, [runValidation, accountForRun]);

  // ── Submit step ─────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setValidating(true);
    const result = await runValidation();
    setValidating(false);
    accountForRun(result);
    setValidation(result);

    if (result.valid) {
      if (timerRef.current) clearInterval(timerRef.current);
      onStepComplete(codeRef.current, timeRef.current, hintsRef.current);
    } else {
      setShowHints(true);
    }
  }, [runValidation, accountForRun, onStepComplete]);

  return (
    <div className="flex flex-col min-h-full bg-[#141724]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#181b2b] border-b border-[#272b43] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#a8b2d8] font-mono">
            Step {stepIndex + 1} / {totalSteps}
          </span>
          <span className="text-sm font-semibold text-white">{step.title}</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Timer */}
          <div className="flex items-center gap-1.5 bg-[#272b43] rounded px-3 py-1">
            <span className="text-[10px] text-[#a8b2d8]">⏱</span>
            <span className="text-sm font-mono text-[#f43f5e]">
              {formatTime(timeSeconds)}
            </span>
          </div>
          {/* Hints counter */}
          <div className="flex items-center gap-1.5 bg-[#272b43] rounded px-3 py-1">
            <span className="text-[10px] text-[#a8b2d8]">💡</span>
            <span className="text-sm font-mono text-[#f5a623]">
              {hintsUsed} hints
            </span>
          </div>
          {/* Run attempts counter */}
          <div className="flex items-center gap-1.5 bg-[#272b43] rounded px-3 py-1" title="Failed / total runs">
            <span className="text-[10px] text-[#a8b2d8]">▶</span>
            <span className="text-sm font-mono" style={{ color: runsFailed > 5 ? "#f87171" : "#60a5fa" }}>
              {runsFailed}/{runsTotal} runs
            </span>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="px-4 py-3 bg-[#272b43] border-b border-[#1a4a8a] shrink-0">
        <p className="text-sm text-[#a8b2d8]">
          <span className="text-white font-medium">📋 Task: </span>
          {step.instructions}
        </p>
        {(step.requiredTags ?? []).length > 0 && (
          <p className="text-xs text-[#8b92b2] mt-1">
            {isWebPreview ? "Required elements: " : "Required keywords: "}
            {(step.requiredTags ?? []).map((t) => (
              <code
                key={t}
                className="mx-0.5 px-1 rounded bg-[#141724] text-[#c084fc]"
              >
                {isWebPreview ? `<${t}>` : t}
              </code>
            ))}
          </p>
        )}
      </div>

      <div className="flex flex-1 min-h-[240px] overflow-hidden gap-0.5">
        {/* Left: Editor */}
        <div className="flex-1 flex flex-col overflow-hidden p-2">
          <CodeEditor value={code} onChange={setCode} antiCheat={antiCheat} />
        </div>

        {/* Right: live display — web renders an HTML preview, every other
            language runs in a sandbox console. */}
        <div className="flex-1 flex flex-col overflow-hidden p-2">
          {isWebPreview ? (
            <LivePreview html={code} />
          ) : (
            <RunConsole code={code} language={language} onRun={handleConsoleRun} />
          )}
        </div>
      </div>

      {/* AI Hint Box */}
      <div className="mx-4 mb-2 shrink-0">
        <HintBox
          step={step}
          studentCode={code}
          hintsUsed={hintsUsed}
          language={language}
          errorOutput={errorOutput}
          attemptNumber={runsFailed}
          initialHints={stepProgress?.hintHistory ?? []}
          onHintUsed={handleHintUsed}
        />
      </div>

      {/* Validation feedback — language-aware: tests, compile/runtime errors, suggestions */}
      {validation && !validation.valid && showHints && (
        <div className="mx-4 mb-3 p-3 bg-[#2d1b1b] border border-[#f87171] rounded-lg shrink-0 max-h-64 overflow-auto">
          <p className="text-sm font-semibold text-[#f87171] mb-2">
            ❌ Validation failed
            {validation.checked ? <span className="text-[#8b92b2] font-normal"> · {validation.checked}</span> : null}
            {typeof validation.testsTotal === "number" && validation.testsTotal > 0 ? (
              <span className="text-[#8b92b2] font-normal"> · {validation.testsPassed ?? 0}/{validation.testsTotal} tests passed</span>
            ) : null}
          </p>

          {validation.compileOutput && (
            <pre className="text-xs text-[#fb923c] whitespace-pre-wrap mb-2 font-mono">{validation.compileOutput}</pre>
          )}
          {validation.runtimeError && (
            <pre className="text-xs text-[#f87171] whitespace-pre-wrap mb-2 font-mono">{validation.runtimeError}</pre>
          )}

          {(validation.testResults ?? []).length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {validation.testResults!.map((t, i) => (
                <li key={i} className="text-xs">
                  <span className={t.passed ? "text-[#34d399]" : "text-[#f87171]"}>
                    {t.passed ? "✓" : "✗"} {t.name}
                  </span>
                  {!t.passed && (
                    <span className="text-[#8b92b2] font-mono">
                      {" "}— expected <span className="text-[#a8b2d8]">{JSON.stringify(t.expected)}</span>, got{" "}
                      <span className="text-[#fb923c]">{JSON.stringify(t.actual)}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <ul className="space-y-1">
            {(validation.suggestions?.length ? validation.suggestions : validation.hints.length ? validation.hints : validation.errors).map(
              (msg, i) => (
                <li key={i} className="text-sm text-[#fb923c] flex gap-2">
                  <span>💡</span>
                  <span>{msg}</span>
                </li>
              )
            )}
          </ul>
        </div>
      )}

      {validation?.valid && (
        <div className="mx-4 mb-3 p-3 bg-[#1b2d1b] border border-[#34d399] rounded-lg shrink-0">
          <p className="text-sm font-semibold text-[#34d399]">
            ✅{" "}
            {typeof validation.testsTotal === "number" && validation.testsTotal > 0
              ? `All ${validation.testsTotal} test case(s) passed — click Submit to continue.`
              : "Looks good! Click Submit to continue."}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#181b2b] border-t border-[#272b43] shrink-0">
        <button
          onClick={handleValidate}
          disabled={validating}
          className="px-4 py-2 rounded-lg bg-[#272b43] text-[#a8b2d8] hover:bg-[#1a4a8a] text-sm font-medium transition-colors disabled:opacity-60"
        >
          {validating ? "⏳ Validating…" : "🔍 Run & Validate"}
        </button>
        <button
          onClick={handleSubmit}
          disabled={validating}
          className="px-6 py-2 rounded-lg bg-[#f43f5e] text-white hover:bg-[#c73652] text-sm font-semibold transition-colors disabled:opacity-60"
        >
          Submit Step →
        </button>
      </div>
    </div>
  );
}
