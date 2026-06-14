"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { tpService } from "@/services/tpService";
import { TP, TPProgress } from "@/types";
import TPExplanation from "@/components/TPExplanation/TPExplanation";
import IDELayout from "@/components/IDELayout/IDELayout";
import Quiz from "@/components/quiz/Quiz";
import Link from "next/link";
import Image from "next/image";

// ─── Phase types ──────────────────────────────────────────────────────────────
type Phase = "explanation" | "coding" | "quiz" | "done";

export default function StudentTPPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("assignmentId") ?? "";
  const router = useRouter();
  const { user } = useAuth();

  const [tp, setTP] = useState<TP | null>(null);
  const [progress, setProgress] = useState<TPProgress | null>(null);
  const [phase, setPhase] = useState<Phase>("explanation");
  const [loading, setLoading] = useState(true);

  // Derived
  const stepIndex = progress?.currentStepIndex ?? 0;
  const currentStep = tp?.steps[stepIndex] ?? null;
  const allSteps = tp?.steps ?? [];
  const allQuestions = allSteps.flatMap((s) => s.quiz);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return; // RequireRole in the segment layout guarantees this resolves
    let cancelled = false;

    (async () => {
      const found = await tpService.getTPById(id);
      if (!found) { router.push("/student/dashboard"); return; }
      if (cancelled) return;
      setTP(found);

      let prog = await tpService.getProgress(user.id, id);
      if (!prog) {
        prog = await tpService.createProgress(user.id, id, assignmentId, found.steps);
      }
      if (cancelled) return;
      setProgress(prog);

      // Resume phase. If the student had already started coding the current
      // step (time or code saved), drop them straight back into the IDE so
      // the timer visibly continues where it left off.
      if (prog.status === "completed") setPhase("done");
      else if (prog.currentStepIndex >= found.steps.length) setPhase("quiz");
      else {
        const sp = prog.steps?.[prog.currentStepIndex];
        const started = sp && (sp.timeSpentSeconds > 0 || (sp.code ?? "").trim().length > 0);
        setPhase(started ? "coding" : "explanation");
      }

      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [id, assignmentId, user, router]);

  // ── Student starts coding (skips explanation) ─────────────────────────────
  const handleStartCoding = useCallback(() => setPhase("coding"), []);

  // ── Student finishes a step ───────────────────────────────────────────────
  const handleStepComplete = useCallback(
    (code: string, timeSeconds: number, hintsUsed: number) => {
      if (!progress || !tp) return;

      const updated: TPProgress = {
        ...progress,
        steps: progress.steps.map((s, i) =>
          i === stepIndex
            ? {
                ...s,
                code,
                timeSpentSeconds: timeSeconds,
                hintsUsed,
                completed: true,
                completedAt: new Date().toISOString(),
              }
            : s
        ),
      };
      // Recompute from the per-step times (the autosave keeps them fresh) so
      // the total can never double-count a step.
      updated.totalTimeSeconds = updated.steps.reduce(
        (sum, s) => sum + (s.timeSpentSeconds ?? 0),
        0
      );

      const nextStep = stepIndex + 1;
      if (nextStep >= tp.steps.length) {
        // All steps done → quiz
        updated.currentStepIndex = nextStep;
        updated.status = "in_progress";
        setProgress(updated);
        tpService.saveProgress(updated);
        setPhase("quiz");
      } else {
        // Move to next step explanation
        updated.currentStepIndex = nextStep;
        setProgress(updated);
        tpService.saveProgress(updated);
        setPhase("explanation");
      }
    },
    [progress, tp, stepIndex]
  );

  // ── Quiz submitted ─────────────────────────────────────────────────────────
  const handleQuizSubmit = useCallback(
    (answers: Record<string, string>, score: number) => {
      if (!progress) return;
      const updated: TPProgress = {
        ...progress,
        quizAnswers: answers,
        quizScore: score,
        status: "completed",
        completedAt: new Date().toISOString(),
      };
      setProgress(updated);
      tpService.saveProgress(updated);
      setPhase("done");
    },
    [progress]
  );

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading || !tp || !progress) {
    return (
      <div className="min-h-screen bg-[#141724] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-[#c084fc] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-[#8b92b2] text-sm">Loading TP...</p>
        </div>
      </div>
    );
  }

  // ─── Done screen ──────────────────────────────────────────────────────────
  if (phase === "done") {
    const totalHints = progress.steps.reduce((s, st) => s + st.hintsUsed, 0);
    const totalFailedRuns = progress.steps.reduce((s, st) => s + (st.runsFailed ?? 0), 0);
    const totalMins = Math.floor(progress.totalTimeSeconds / 60);

    return (
      <div className="min-h-screen bg-[#141724] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="relative inline-block mb-6">
            <Image
              src="/chatbot-logo.png"
              alt="AI Assistant celebrating"
              width={96}
              height={99}
              className="w-24 h-24 rounded-full object-cover ring-2 ring-[#a855f7]/60 shadow-lg shadow-[#a855f7]/40 mx-auto"
            />
            <span className="absolute -top-1 -right-2 text-3xl">🎉</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-white mb-2">TP Complete!</h1>
          <p className="text-[#8b92b2] mb-8">{tp.title}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Quiz Score", value: `${progress.quizScore ?? "—"}%`, color: "text-[#34d399]" },
              { label: "Time spent", value: `${totalMins}m`, color: "text-[#60a5fa]" },
              { label: "Hints used", value: String(totalHints), color: "text-[#fbbf24]" },
              { label: "Failed runs", value: String(totalFailedRuns), color: totalFailedRuns > 5 ? "text-[#f87171]" : "text-[#a8b2d8]" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-[#181b2b] rounded-2xl border border-[#2a2f4c] p-4"
              >
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-[#8b92b2] mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          <Link
            href="/student/dashboard"
            className="block w-full py-3 rounded-xl btn-gradient font-bold glow-button"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // ─── Quiz screen ──────────────────────────────────────────────────────────
  if (phase === "quiz") {
    return (
      <div className="min-h-screen bg-[#141724] overflow-y-auto">
        <nav className="bg-[#181b2b] border-b border-[#2a2f4c] px-6 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Link href="/student/dashboard" className="text-[#8b92b2] hover:text-white text-sm">
              ← Dashboard
            </Link>
            <span className="text-[#2a2f4c]">/</span>
            <span className="text-white text-sm font-medium">{tp.title}</span>
          </div>
          <span className="text-xs text-[#fbbf24] bg-[#fbbf24]/10 px-2 py-1 rounded-full">
            Final Quiz
          </span>
        </nav>
        <Quiz questions={allQuestions} onSubmit={handleQuizSubmit} />
      </div>
    );
  }

  // ─── Explanation screen ────────────────────────────────────────────────────
  if (phase === "explanation") {
    return (
      <div className="h-screen flex flex-col bg-[#141724]">
        {/* Top nav */}
        <nav className="bg-[#181b2b] border-b border-[#2a2f4c] px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Link href="/student/dashboard" className="text-[#8b92b2] hover:text-white text-sm">
              ← Dashboard
            </Link>
            <span className="text-[#2a2f4c]">/</span>
            <span className="text-white text-sm font-medium">{tp.title}</span>
          </div>

          {/* Step progress pills */}
          <div className="hidden sm:flex items-center gap-1.5">
            {tp.steps.map((s, i) => (
              <div
                key={s.id}
                className={`h-2 rounded-full transition-all ${
                  i < stepIndex
                    ? "w-6 bg-[#34d399]"
                    : i === stepIndex
                    ? "w-8 bg-[#c084fc]"
                    : "w-4 bg-[#2a2f4c]"
                }`}
              />
            ))}
          </div>

          <span className="text-xs text-[#8b92b2]">
            Step {stepIndex + 1} / {tp.steps.length}
          </span>
        </nav>

        {/* Explanation */}
        <div className="flex-1 overflow-hidden">
          <TPExplanation
            tp={tp}
            stepIndex={stepIndex}
            onStart={handleStartCoding}
          />
        </div>
      </div>
    );
  }

  // ─── Coding screen (IDE) ──────────────────────────────────────────────────
  if (phase === "coding" && currentStep) {
    return (
      <div className="h-screen flex flex-col bg-[#141724]">
        {/* Top nav */}
        <nav className="bg-[#181b2b] border-b border-[#2a2f4c] px-6 py-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPhase("explanation")}
              className="text-[#8b92b2] hover:text-white text-sm transition-colors"
            >
              ← Instructions
            </button>
            <span className="text-[#2a2f4c]">/</span>
            <span className="text-white text-sm font-medium truncate max-w-[200px]">
              {tp.title}
            </span>
          </div>

          {/* Step progress */}
          <div className="hidden sm:flex items-center gap-1.5">
            {tp.steps.map((s, i) => (
              <div
                key={s.id}
                className={`h-2 rounded-full transition-all ${
                  i < stepIndex
                    ? "w-6 bg-[#34d399]"
                    : i === stepIndex
                    ? "w-8 bg-[#f43f5e]"
                    : "w-4 bg-[#2a2f4c]"
                }`}
              />
            ))}
          </div>
        </nav>

        {/* IDE — keyed per step so timer/hints state resets between steps */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <IDELayout
            key={`${tp.id}-step-${stepIndex}`}
            step={currentStep}
            stepIndex={stepIndex}
            totalSteps={tp.steps.length}
            progress={progress}
            starterHTML={tp.starterHTML}
            language={tp.language ?? "html"}
            antiCheat={tp.antiCheat !== false}
            onStepComplete={handleStepComplete}
            onProgressUpdate={setProgress}
          />
        </div>
      </div>
    );
  }

  return null;
}
