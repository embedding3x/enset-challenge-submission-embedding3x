"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { tpService } from "@/services/tpService";
import { userService } from "@/services/userService";
import { subscribeProgress } from "@/services/realtimeService";
import { TP, TPProgress, Evaluation } from "@/types";
import {
  X,
  Code2,
  Clock,
  Lightbulb,
  BookOpen,
  Layers,
  Search,
  AlertTriangle,
} from "lucide-react";
import AppNavbar from "@/components/layout/AppNavbar";

interface StudentRow {
  studentId: string;
  studentName: string;
  initials: string;
  status: "not_started" | "in_progress" | "completed";
  currentStep: number;
  totalSteps: number;
  timeSeconds: number;
  hintsUsed: number;
  quizScore: number | null;
  online: boolean;
  lastActiveAt?: string;
  evaluation: Evaluation;
  code: string;
}

interface TPGroup {
  tp: TP;
  students: StudentRow[];
}

interface FieldGroup {
  field: string;
  tps: TPGroup[];
}

interface DifficultStep {
  label: string;
  detail: string;
  severity: number; // 1..3
}

const formatTime = (s: number) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
};

const ago = (iso?: string) => {
  if (!iso) return "never";
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
};

const gradeColor = (g: string) => {
  if (g === "A") return "bg-green-500/10 text-green-400 border border-green-500/20";
  if (g === "B") return "bg-teal-500/10 text-teal-400 border border-teal-500/20";
  if (g === "C") return "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20";
  if (g === "D") return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
  if (g === "F") return "bg-red-500/10 text-red-400 border border-red-500/20";
  return "bg-navactive text-textmuted";
};

const gradeWord = (g: string) =>
  g === "A" ? "Excellent" : g === "B" ? "Good" : g === "C" ? "Fair" : g === "D" ? "Weak" : "Failing";

const statusPill = (r: StudentRow) => {
  if (r.status === "completed")
    return (
      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
        Completed
      </span>
    );
  if (r.status === "in_progress")
    return (
      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
        In Progress (Step {r.currentStep})
      </span>
    );
  return (
    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-navactive text-textmuted">
      Not Started
    </span>
  );
};

function DetailModal({ row, tpTitle, onClose }: { row: StudentRow; tpTitle: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.65)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-panelborder bg-paneldark"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between border-b border-panelborder bg-paneldark px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{row.studentName}</h2>
            <p className="mt-0.5 text-sm text-textmuted">{tpTitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-lg px-3 py-1.5 text-lg font-bold ${gradeColor(row.evaluation.grade)}`}>
              {row.evaluation.points}/100 · {row.evaluation.grade}
            </span>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-textmuted transition-colors hover:bg-navactive hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          {/* Evaluation factors */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-white">⚖️ Agent evaluation</h3>
            <div className="space-y-3">
              {row.evaluation.factors.map((f) => (
                <div key={f.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-textlight">{f.label}</span>
                    <span className="font-mono text-textmuted">
                      {f.score}/{f.max}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-navactive">
                    <div
                      className="h-1.5 rounded-full bg-gradient-hero"
                      style={{ width: `${(f.score / f.max) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-textmuted">{f.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Saved code */}
          <div>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-white">
              <Code2 size={14} /> Submitted code
            </h3>
            {row.code.trim() ? (
              <pre className="overflow-x-auto rounded-xl border border-panelborder bg-[#0d1117] p-4 text-xs leading-relaxed text-textlight">
                <code>{row.code}</code>
              </pre>
            ) : (
              <p className="rounded-xl border border-dashed border-panelborder p-6 text-center text-sm text-textmuted">
                No code saved yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudentEvaluationPage() {
  const { user } = useAuth();
  const [fields, setFields] = useState<FieldGroup[]>([]);
  const [difficultSteps, setDifficultSteps] = useState<DifficultStep[]>([]);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<{ row: StudentRow; tpTitle: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!user) return; // RequireRole in the segment layout guarantees this resolves

    let cancelled = false;

    (async () => {
      const [assignments, userMap] = await Promise.all([
        tpService.getAssignmentsForTeacher(user.id),
        userService.getUserMap(),
      ]);
      const studentName = (id: string) => userMap[id]?.name ?? id;
      const initials = (id: string) => userMap[id]?.avatarInitials ?? "??";

      // Resolve each assigned TP, grouped by field.
      const byField = new Map<string, Map<string, { tp: TP; studentIds: Set<string> }>>();
      const tpCache = new Map<string, TP | null>();
      for (const a of assignments) {
        if (!tpCache.has(a.tpId)) tpCache.set(a.tpId, await tpService.getTPById(a.tpId));
        const tp = tpCache.get(a.tpId);
        if (!tp) continue;
        const field = tp.field || "Général";
        if (!byField.has(field)) byField.set(field, new Map());
        const tpMap = byField.get(field)!;
        if (!tpMap.has(tp.id)) tpMap.set(tp.id, { tp, studentIds: new Set() });
        a.studentIds.forEach((sid) => tpMap.get(tp.id)!.studentIds.add(sid));
      }

      // Fetch all progress per TP once, keyed by `${studentId}:${tpId}`.
      const tpIds = Array.from(new Set(assignments.map((a) => a.tpId)));
      const progressLists = await Promise.all(tpIds.map((id) => tpService.getProgressByTp(id)));
      const progMap = new Map<string, TPProgress>();
      progressLists.flat().forEach((p) => progMap.set(`${p.studentId}:${p.tpId}`, p));

      // AI insight: rank steps by total hints requested across all students.
      const hintTotals = new Map<string, { label: string; hints: number; students: number }>();
      progressLists.flat().forEach((p) => {
        const tp = tpCache.get(p.tpId);
        if (!tp) return;
        p.steps.forEach((sp, i) => {
          if (!sp.hintsUsed) return;
          const step = tp.steps[i];
          const key = `${tp.id}:${i}`;
          const entry =
            hintTotals.get(key) ??
            { label: `Step ${i + 1}: ${step?.title ?? sp.stepId}`, hints: 0, students: 0 };
          entry.hints += sp.hintsUsed;
          entry.students += 1;
          hintTotals.set(key, entry);
        });
      });
      const difficult = Array.from(hintTotals.values())
        .sort((a, b) => b.hints - a.hints)
        .slice(0, 2)
        .map((e) => ({
          label: e.label,
          detail: `${e.students} student${e.students > 1 ? "s" : ""} needed ${e.hints} hint${e.hints > 1 ? "s" : ""}.`,
          severity: Math.min(3, Math.ceil(e.hints / 2)),
        }));

      const result: FieldGroup[] = Array.from(byField.entries())
        .map(([field, tpMap]) => ({
          field,
          tps: Array.from(tpMap.values()).map(({ tp, studentIds }) => ({
            tp,
            students: Array.from(studentIds).map((sid): StudentRow => {
              const prog = progMap.get(`${sid}:${tp.id}`) ?? null;
              return {
                studentId: sid,
                studentName: studentName(sid),
                initials: initials(sid),
                status: prog?.status ?? "not_started",
                currentStep: prog ? Math.min(prog.currentStepIndex + 1, tp.steps.length) : 0,
                totalSteps: tp.steps.length,
                timeSeconds: prog?.totalTimeSeconds ?? 0,
                hintsUsed: prog?.steps.reduce((s, st) => s + (st.hintsUsed ?? 0), 0) ?? 0,
                quizScore: prog?.quizScore ?? null,
                online: tpService.isOnline(prog),
                lastActiveAt: prog?.lastActiveAt,
                evaluation: tpService.evaluateStudent(prog, tp),
                code: tpService.getBestCode(prog),
              };
            }),
          })),
        }))
        .sort((a, b) => a.field.localeCompare(b.field));

      if (!cancelled) {
        setFields(result);
        setDifficultSteps(difficult);
      }
    })();

    return () => { cancelled = true; };
  }, [user, tick]);

  // Live updates: a progress push over WebSocket triggers a refetch (the snapshot
  // is already persisted server-side, so re-reading reflects it immediately).
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeProgress(() => setTick((t) => t + 1));
    // Light fallback refresh keeps "online/offline" presence accurate if the
    // socket is unavailable.
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => {
      unsubscribe();
      clearInterval(id);
    };
  }, [user]);

  const allRows = useMemo(
    () => fields.flatMap((f) => f.tps.flatMap((t) => t.students)),
    [fields]
  );

  const overall = useMemo(() => {
    const total = allRows.length;
    const completed = allRows.filter((r) => r.status === "completed").length;
    const times = allRows.map((r) => r.timeSeconds).filter((t) => t > 0);
    const avgSec = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    return {
      total,
      completed,
      completionPct: total ? Math.round((completed / total) * 100) : 0,
      avgTime: avgSec
        ? `${Math.floor(avgSec / 3600) ? `${Math.floor(avgSec / 3600)}h ` : ""}${Math.floor((avgSec % 3600) / 60)}m`
        : "—",
    };
  }, [allRows]);

  // Working search + status filter (per analytics mockup).
  const matches = (r: StudentRow) => {
    const q = search.trim().toLowerCase();
    if (q && !r.studentName.toLowerCase().includes(q)) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  };

  const filteredFields = useMemo(
    () =>
      fields
        .map((fg) => ({
          field: fg.field,
          tps: fg.tps
            .map((tg) => ({ tp: tg.tp, students: tg.students.filter(matches) }))
            .filter((tg) => tg.students.length > 0),
        }))
        .filter((fg) => fg.tps.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields, search, statusFilter]
  );

  // SVG ring geometry for the completion-rate card.
  const ringCirc = 2 * Math.PI * 36;

  return (
    <div className="min-h-screen bg-appbg">
      {selected && (
        <DetailModal
          row={selected.row}
          tpTitle={selected.tpTitle}
          onClose={() => setSelected(null)}
        />
      )}

      <AppNavbar />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Page title */}
        <section className="mb-8">
          <h1 className="font-serif text-3xl font-semibold mb-1 text-white">
            TP Performance Analytics
          </h1>
          <p className="text-textmuted text-sm">
            Detailed insights and live student progress, graded by the evaluation agent.
          </p>
        </section>

        {/* Overall stats */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4 text-white">Overall Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Completion rate */}
            <div className="bg-panelbg rounded-xl p-6 border border-panelborder flex items-center space-x-6 shadow-lg bg-gradient-to-br from-blue-600/20 to-transparent">
              <div className="relative flex items-center justify-center shrink-0">
                <div className="w-20 h-20 rounded-full border-4 border-navactive flex items-center justify-center">
                  <span className="text-xl font-bold text-white">{overall.completionPct}%</span>
                </div>
                <svg className="absolute top-0 left-0 w-20 h-20 -rotate-90">
                  <circle
                    className="text-secondary"
                    cx="40"
                    cy="40"
                    fill="transparent"
                    r="36"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeDasharray={ringCirc}
                    strokeDashoffset={ringCirc * (1 - overall.completionPct / 100)}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div>
                <p className="text-textmuted text-sm font-medium">Completion Rate</p>
                <h3 className="text-3xl font-bold text-white">{overall.completionPct}%</h3>
                <p className="text-xs text-textmuted mt-1">
                  {overall.completed}/{overall.total} submissions completed
                </p>
              </div>
            </div>

            {/* Average time */}
            <div className="bg-panelbg rounded-xl p-6 border border-panelborder flex items-center space-x-6 shadow-lg bg-gradient-to-br from-green-600/20 to-transparent">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20 shrink-0">
                <Clock className="h-8 w-8 text-emerald-400" />
              </div>
              <div>
                <p className="text-textmuted text-sm font-medium">Average Time Spent</p>
                <h3 className="text-3xl font-bold text-white">{overall.avgTime}</h3>
                <p className="text-xs text-emerald-400 mt-1 font-medium">across active students</p>
              </div>
            </div>

            {/* Most difficult steps */}
            <div className="bg-panelbg rounded-xl p-6 border border-panelborder shadow-lg bg-gradient-to-br from-purple-600/20 to-transparent relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-500/10 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-orange-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">Most Difficult Steps</h3>
                </div>
                <span className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold flex items-center space-x-1 border border-white/20 text-white">
                  <span>✦</span> <span>AI Insights</span>
                </span>
              </div>
              {difficultSteps.length === 0 ? (
                <p className="text-sm text-textmuted mt-3">No struggles detected yet.</p>
              ) : (
                <ul className="text-sm space-y-2 mt-3">
                  {difficultSteps.map((s) => (
                    <li key={s.label} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-slate-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                        <span>
                          {s.label}{" "}
                          <span className="text-textmuted text-xs">— {s.detail}</span>
                        </span>
                      </span>
                      <span className="flex items-center gap-0.5 shrink-0">
                        {[1, 2, 3].map((lvl) => (
                          <span
                            key={lvl}
                            className={`w-1.5 h-3.5 rounded-sm ${
                              lvl <= s.severity
                                ? s.severity >= 3
                                  ? "bg-red-500"
                                  : "bg-orange-500"
                                : "bg-navactive"
                            }`}
                          />
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Student performance */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4 text-white">Student Performance</h2>

          {/* Filters & search */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="relative flex-grow max-w-2xl">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-textmuted" />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-panelborder rounded-lg bg-panelbg text-sm text-white placeholder-textmuted/60 focus:outline-none focus:ring-1 focus:ring-secondary focus:border-secondary"
                placeholder="Search students..."
                type="text"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-panelbg border border-panelborder rounded-lg px-4 py-2 text-sm text-white focus:ring-secondary focus:border-secondary"
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In progress</option>
              <option value="not_started">Not started</option>
            </select>
          </div>

          {filteredFields.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-panelborder bg-paneldark p-10 text-center">
              <p className="text-textmuted">
                {fields.length === 0
                  ? "No assignments yet — assign a TP to see student analytics here."
                  : "No students match your filters."}
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {filteredFields.map((fg) => (
                <section key={fg.field}>
                  {/* Field header */}
                  <div className="mb-4 flex items-center gap-3">
                    <Layers size={18} className="text-primary" />
                    <h2 className="text-lg font-semibold text-white">{fg.field}</h2>
                    <span className="rounded-full bg-navactive px-2 py-0.5 text-xs text-textmuted">
                      {fg.tps.length} TP{fg.tps.length > 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="space-y-6">
                    {fg.tps.map((tg) => (
                      <div
                        key={tg.tp.id}
                        className="overflow-hidden rounded-xl border border-panelborder bg-panelbg shadow-xl"
                      >
                        <div className="flex items-center justify-between border-b border-panelborder px-5 py-4">
                          <div className="flex items-center gap-2">
                            <BookOpen size={15} className="text-secondary" />
                            <h3 className="font-semibold text-white">{tg.tp.title}</h3>
                          </div>
                          <span className="text-xs text-textmuted">
                            {tg.students.length} student{tg.students.length > 1 ? "s" : ""} ·{" "}
                            {tg.tp.steps.length} steps · ~{tg.tp.estimatedMinutes}m
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-navactive text-textmuted uppercase text-xs font-bold tracking-wider">
                              <tr>
                                <th className="px-5 py-3">Student</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Progress</th>
                                <th className="px-5 py-3">Time</th>
                                <th className="px-5 py-3 text-center">Hints Used</th>
                                <th className="px-5 py-3">Quiz</th>
                                <th className="px-5 py-3">AI Score</th>
                                <th className="px-5 py-3 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-panelborder">
                              {tg.students.map((r) => (
                                <tr key={r.studentId} className="hover:bg-white/5 transition-colors">
                                  {/* Student + presence */}
                                  <td className="px-5 py-4">
                                    <div className="flex items-center gap-2.5">
                                      <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-navactive text-xs font-semibold text-textlight">
                                        {r.initials}
                                        <span
                                          title={r.online ? "Online" : `Last active ${ago(r.lastActiveAt)}`}
                                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-panelbg ${
                                            r.online ? "bg-green-500" : "bg-gray-600"
                                          }`}
                                        />
                                      </span>
                                      <div className="leading-tight">
                                        <div className="font-medium text-textlight">{r.studentName}</div>
                                        <div
                                          className={`text-[10px] ${
                                            r.online ? "text-green-400" : "text-textmuted"
                                          }`}
                                        >
                                          {r.online ? "● online" : `offline · ${ago(r.lastActiveAt)}`}
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Status */}
                                  <td className="px-5 py-4">{statusPill(r)}</td>

                                  {/* Progress */}
                                  <td className="px-5 py-4">
                                    <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-20 rounded-full bg-navactive">
                                        <div
                                          className="h-1.5 rounded-full bg-gradient-hero"
                                          style={{
                                            width: r.totalSteps
                                              ? `${(r.currentStep / r.totalSteps) * 100}%`
                                              : "0%",
                                          }}
                                        />
                                      </div>
                                      <span className="text-xs text-textmuted">
                                        {r.currentStep}/{r.totalSteps}
                                      </span>
                                    </div>
                                  </td>

                                  {/* Time */}
                                  <td className="px-5 py-4">
                                    <span className="flex items-center gap-1 font-mono text-xs text-textmuted">
                                      <Clock size={11} /> {formatTime(r.timeSeconds)}
                                    </span>
                                  </td>

                                  {/* Hints */}
                                  <td className="px-5 py-4 text-center">
                                    <span className="inline-flex items-center gap-1 font-mono text-xs text-yellow-400">
                                      <Lightbulb size={11} /> {r.hintsUsed}
                                    </span>
                                  </td>

                                  {/* Quiz */}
                                  <td className="px-5 py-4 text-xs">
                                    {r.quizScore !== null ? (
                                      <span
                                        className={`font-bold ${
                                          r.quizScore >= 80
                                            ? "text-green-400"
                                            : r.quizScore >= 50
                                            ? "text-yellow-400"
                                            : "text-red-400"
                                        }`}
                                      >
                                        {r.quizScore}%
                                      </span>
                                    ) : (
                                      <span className="text-textmuted/50">—</span>
                                    )}
                                  </td>

                                  {/* AI Score */}
                                  <td className="px-5 py-4">
                                    {r.status === "not_started" ? (
                                      <span className="text-textmuted/50 text-xs">- / 100</span>
                                    ) : (
                                      <span
                                        className={`px-3 py-1 rounded-full text-xs font-semibold ${gradeColor(
                                          r.evaluation.grade
                                        )}`}
                                      >
                                        {r.evaluation.points}/100 ({gradeWord(r.evaluation.grade)})
                                      </span>
                                    )}
                                  </td>

                                  {/* Detail */}
                                  <td className="px-5 py-4 text-right">
                                    <button
                                      onClick={() => setSelected({ row: r, tpTitle: tg.tp.title })}
                                      className="bg-navactive hover:bg-panelborder px-3 py-1.5 rounded-lg text-xs text-textlight transition-colors"
                                    >
                                      View Details
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
