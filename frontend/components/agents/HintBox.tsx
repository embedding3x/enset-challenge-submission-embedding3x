"use client";

import React, { useState } from "react";
import { TPStep, HintHistoryEntry } from "@/types";
import { agentService, HintResponse } from "@/services/agentService";

interface HintBoxProps {
  step: TPStep;
  studentCode: string;
  hintsUsed: number;
  /** Programming language so hints are language-aware. */
  language?: string;
  /** Latest compiler/runtime/failed-test output to ground the hint. */
  errorOutput?: string;
  /** Failed run attempts so far. */
  attemptNumber?: number;
  initialHints?: HintHistoryEntry[];
  onHintUsed: (entry: HintHistoryEntry) => void;
  sessionId?: string;
}

const LEVEL_LABELS: Record<number, string> = {
  1: "Subtle hint",
  2: "Targeted hint",
  3: "Strong hint",
  4: "Specific hint",
};

const LEVEL_COLORS: Record<number, string> = {
  1: "text-[#60a5fa]",
  2: "text-[#c084fc]",
  3: "text-[#fbbf24]",
  4: "text-[#f87171]",
};

export default function HintBox({
  step,
  studentCode,
  hintsUsed,
  language = "html",
  errorOutput = "",
  attemptNumber = 0,
  initialHints = [],
  onHintUsed,
  sessionId,
}: HintBoxProps) {
  const [hints, setHints] = useState<HintHistoryEntry[]>(initialHints);
  const [isLoading, setIsLoading] = useState(false);
  const [validationPassed, setValidationPassed] = useState(false);
  const [missingTags, setMissingTags] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(true);

  const requiredTags = step.requiredTags ?? [];
  const maxHints = 5;
  const canRequestHint = hintsUsed < maxHints && !validationPassed;

  async function requestHint() {
    if (isLoading || !canRequestHint) return;
    setIsLoading(true);

    try {
      let response: HintResponse;

      const available = await agentService.isAvailable();
      if (available) {
        try {
          response = await agentService.getHint({
            step_id: step.id,
            step_title: step.title,
            step_instructions: step.instructions,
            student_code: studentCode,
            language,
            required_tags: requiredTags,
            error_output: errorOutput,
            hints_already_given: hintsUsed,
            previous_hints: hints.map((h) => h.text),
            attempt_number: attemptNumber,
            session_id: sessionId,
          });
        } catch {
          response = buildFallbackHint(step, studentCode, hintsUsed);
        }
      } else {
        response = buildFallbackHint(step, studentCode, hintsUsed);
      }

      const newHint: HintHistoryEntry = {
        level: response.hint_level,
        text: response.hint,
        missingTags: response.missing_tags,
        timestamp: new Date().toLocaleTimeString(),
      };

      setHints((prev) => [...prev, newHint]);
      setValidationPassed(response.validation_passed);
      setMissingTags(response.missing_tags);
      onHintUsed(newHint);
    } catch {
      const fallback = buildFallbackHint(step, studentCode, hintsUsed);
      const newHint: HintHistoryEntry = {
        level: fallback.hint_level,
        text: fallback.hint,
        missingTags: fallback.missing_tags,
        timestamp: new Date().toLocaleTimeString(),
      };
      setHints((prev) => [...prev, newHint]);
      setMissingTags(fallback.missing_tags);
      onHintUsed(newHint);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="bg-[#181b2b] border border-[#2a2f4c] rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-2 hover:bg-[#1e2235] transition-colors"
      >
        <span className="text-lg">💡</span>
        <div className="flex-1 text-left">
          <p className="text-sm font-medium text-white">Hint System</p>
          <p className="text-xs text-[#8b92b2]">
            {validationPassed
              ? "All required elements present!"
              : `${hintsUsed}/${maxHints} hints used`}
          </p>
        </div>

        {/* Tags status */}
        <div className="hidden sm:flex items-center gap-1">
          {requiredTags.map((tag) => {
            const missing = missingTags.includes(tag);
            return (
              <span
                key={tag}
                className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                  missing || hints.length === 0
                    ? "bg-[#2a2f4c] text-[#8b92b2]"
                    : "bg-[#34d399]/15 text-[#34d399]"
                }`}
              >
                {`<${tag}>`}
              </span>
            );
          })}
        </div>

        <span className="text-[#8b92b2] text-xs ml-2">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[#2a2f4c]">
          {/* Validation passed banner */}
          {validationPassed && (
            <div className="px-4 py-3 bg-[#34d399]/10 border-b border-[#34d399]/20">
              <p className="text-sm text-[#34d399] font-medium">
                All required HTML elements detected in your code!
              </p>
            </div>
          )}

          {/* Hint history */}
          {hints.length > 0 && (
            <div className="px-4 py-3 space-y-3 max-h-60 overflow-y-auto">
              {hints.map((hint, i) => (
                <div
                  key={i}
                  className="bg-[#1e2235] rounded-xl p-3 border border-[#2a2f4c]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-xs font-medium ${LEVEL_COLORS[hint.level] ?? "text-[#e2e8f0]"}`}
                    >
                      {LEVEL_LABELS[hint.level] ?? `Hint ${i + 1}`}
                    </span>
                    <span className="text-xs text-[#8b92b2]">{hint.timestamp}</span>
                  </div>
                  <p className="text-sm text-[#e2e8f0] leading-relaxed whitespace-pre-wrap">
                    {hint.text}
                  </p>
                  {hint.missingTags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="text-xs text-[#8b92b2]">Still missing:</span>
                      {hint.missingTags.map((t) => (
                        <span
                          key={t}
                          className="text-xs font-mono bg-[#f87171]/10 text-[#f87171] px-2 py-0.5 rounded-full"
                        >
                          {`<${t}>`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Request hint button */}
          <div className="px-4 py-3">
            {canRequestHint ? (
              <button
                onClick={requestHint}
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl border border-[#fbbf24]/30 text-[#fbbf24] text-sm font-medium hover:bg-[#fbbf24]/10 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <span className="w-3 h-3 border border-[#fbbf24] border-t-transparent rounded-full animate-spin" />
                    Thinking...
                  </>
                ) : (
                  <>
                    💡 Get hint {hints.length > 0 ? `(${maxHints - hintsUsed} left)` : ""}
                  </>
                )}
              </button>
            ) : validationPassed ? (
              <p className="text-center text-xs text-[#34d399]">
                Great job! Your code has all required elements.
              </p>
            ) : (
              <p className="text-center text-xs text-[#8b92b2]">
                Maximum hints reached. Try reviewing the hints above and your code carefully.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Fallback when agent is unavailable ───────────────────────────────────────

function buildFallbackHint(
  step: TPStep,
  studentCode: string,
  hintsUsed: number
): HintResponse {
  const code = studentCode.toLowerCase();
  const missing = (step.requiredTags ?? []).filter(
    (tag) => !code.includes(`<${tag}`)
  );

  const level = Math.min(4, hintsUsed + 1);
  let hint: string;

  if (missing.length === 0) {
    hint = "It looks like you might have all the required elements! Check your code and try submitting.";
  } else if (level === 1) {
    hint = `Think about the purpose of this step: "${step.title}". What kind of HTML elements would achieve that goal? Think about what you'd see on a real webpage.`;
  } else if (level === 2) {
    hint = `HTML has specific elements for different types of content. For this step, you need ${missing.length} more element(s). Think about semantic HTML — what element best describes the content you're adding?`;
  } else if (level === 3) {
    hint = `You're missing ${missing.length} element(s). One of them is a very common HTML element used for "${step.title.toLowerCase()}". What letters might it start with?`;
  } else {
    hint = `Check if you have these types of elements in your code: ${missing.map((t) => `a "${t[0]}" element`).join(", ")}. Make sure they're properly opened and closed.`;
  }

  return {
    hint,
    hint_level: level,
    validation_passed: missing.length === 0,
    missing_tags: missing,
    agent: "fallback",
    model: "local",
  };
}
