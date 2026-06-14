"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { tpService } from "@/services/tpService";
import { TP, Assignment, TPProgress } from "@/types";
import { MessageSquare, Bell, FileBarChart } from "lucide-react";
import SkillRadar, { RadarAxis } from "@/components/student/SkillRadar";
import AppNavbar from "@/components/layout/AppNavbar";

interface TPCard {
  tp: TP;
  assignment: Assignment;
  progress: TPProgress | null;
}

const ago = (iso?: string) => {
  if (!iso) return null;
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "moments ago";
  if (sec < 3600) return `${Math.floor(sec / 60)} minutes ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  return `${Math.floor(sec / 86400)} days ago`;
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  in_progress: {
    label: "In Progress",
    className: "bg-amber-600/20 text-amber-400 border-amber-700",
  },
  not_started: {
    label: "Not Started",
    className: "bg-gray-500/20 text-gray-400 border-gray-600",
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-700",
  },
};

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const [cards, setCards] = useState<TPCard[]>([]);

  useEffect(() => {
    if (!user) return; // RequireRole in the segment layout guarantees this resolves
    let cancelled = false;

    (async () => {
      const [assignments, allTPs] = await Promise.all([
        tpService.getAssignmentsForStudent(user.id),
        tpService.getAllTPs(),
      ]);

      const data: TPCard[] = (
        await Promise.all(
          assignments.map(async (a) => {
            const tp = allTPs.find((t) => t.id === a.tpId);
            if (!tp) return null;
            const progress = await tpService.getProgress(user.id, tp.id);
            return { tp, assignment: a, progress } as TPCard;
          })
        )
      ).filter((c): c is TPCard => c !== null);

      if (!cancelled) setCards(data);
    })();

    return () => { cancelled = true; };
  }, [user]);

  const statusOf = (p: TPProgress | null) =>
    !p || p.status === "not_started" ? "not_started" : p.status;

  const getProgressPct = (p: TPProgress | null, tp: TP) => {
    if (!p) return 0;
    return Math.round((Math.min(p.currentStepIndex, tp.steps.length) / tp.steps.length) * 100);
  };

  // Most recently active in-progress TP, else first not-started one.
  const continueCard = useMemo(() => {
    const inProgress = cards
      .filter((c) => statusOf(c.progress) === "in_progress")
      .sort((a, b) =>
        (b.progress?.lastActiveAt ?? "").localeCompare(a.progress?.lastActiveAt ?? "")
      );
    return inProgress[0] ?? cards.find((c) => statusOf(c.progress) === "not_started") ?? null;
  }, [cards]);

  // Skill radar: completion ratio per field (up to 6 axes).
  const radarAxes: RadarAxis[] = useMemo(() => {
    const byField = new Map<string, { done: number; total: number }>();
    cards.forEach(({ tp, progress }) => {
      const field = tp.field || "Général";
      const entry = byField.get(field) ?? { done: 0, total: 0 };
      entry.total += tp.steps.length;
      entry.done += progress
        ? Math.min(progress.currentStepIndex, tp.steps.length)
        : 0;
      byField.set(field, entry);
    });
    const axes = Array.from(byField.entries())
      .slice(0, 6)
      .map(([label, { done, total }]) => ({
        label,
        value: total ? done / total : 0,
      }));
    // Pad with reference axes so the radar always reads as a shape.
    const fillers = ["HTML", "CSS", "JavaScript", "Forms", "Layout", "Logic"];
    let i = 0;
    while (axes.length < 5 && i < fillers.length) {
      if (!axes.some((a) => a.label === fillers[i])) {
        axes.push({ label: fillers[i], value: 0.15 + (i % 3) * 0.1 });
      }
      i++;
    }
    return axes;
  }, [cards]);

  // Notifications derived from live progress data.
  const notifications = useMemo(() => {
    const items: { from: string; text: string; icon: "chat" | "bell" | "report" }[] = [];
    cards.forEach(({ tp, assignment, progress }) => {
      const status = statusOf(progress);
      if (status === "in_progress") {
        items.push({
          from: "AI Assistant",
          text: `New hint available for "${tp.title}"`,
          icon: "chat",
        });
      }
      if (assignment.dueDate && status !== "completed") {
        items.push({
          from: "Teacher",
          text: `"${tp.title}" is due ${new Date(assignment.dueDate).toLocaleDateString()}`,
          icon: "bell",
        });
      }
      if (status === "completed" && progress?.quizScore != null) {
        items.push({
          from: "System",
          text: `"${tp.title}" was graded: ${progress.quizScore}%`,
          icon: "report",
        });
      }
    });
    return items.slice(0, 6);
  }, [cards]);

  const notifIcon = (icon: string) =>
    icon === "chat" ? (
      <MessageSquare size={18} className="text-primary" />
    ) : icon === "bell" ? (
      <Bell size={18} className="text-primary" />
    ) : (
      <FileBarChart size={18} className="text-textmuted" />
    );

  return (
    <div className="min-h-screen bg-appbg flex flex-col">
      <AppNavbar />

      <main className="flex-grow max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: hero + assignments */}
        <div className="lg:col-span-2 flex flex-col gap-8">
          {/* Continue Working hero */}
          <section className="rounded-2xl p-8 bg-gradient-hero relative overflow-hidden shadow-2xl">
            <h1 className="font-serif text-3xl text-white mb-6 font-semibold tracking-wide drop-shadow-md">
              {continueCard ? "Continue Working" : `Welcome, ${user?.name?.split(" ")[0] ?? ""}`}
            </h1>

            {continueCard ? (
              <div className="glass-panel rounded-xl p-6 relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div className="flex-grow w-full">
                  <h2 className="text-xl font-serif font-semibold text-white mb-1">
                    {continueCard.tp.title}
                  </h2>
                  <p className="text-sm text-blue-100/70 mb-6 font-medium">
                    {ago(continueCard.progress?.lastActiveAt)
                      ? `Last active: ${ago(continueCard.progress?.lastActiveAt)}`
                      : "Not started yet — jump in!"}
                  </p>
                  <div className="w-full relative">
                    <div className="w-full bg-white/20 rounded-full overflow-hidden h-1.5">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${getProgressPct(continueCard.progress, continueCard.tp)}%`,
                          background: "linear-gradient(90deg, #3b82f6, #93c5fd)",
                        }}
                      />
                    </div>
                    <p className="text-xs text-blue-100/70 mt-2 font-medium">
                      {Math.min(
                        continueCard.progress?.currentStepIndex ?? 0,
                        continueCard.tp.steps.length
                      )}
                      /{continueCard.tp.steps.length} Steps Completed (
                      {getProgressPct(continueCard.progress, continueCard.tp)}%)
                    </p>
                  </div>
                </div>
                <Link
                  href={`/student/tp/${continueCard.tp.id}?assignmentId=${continueCard.assignment.id}`}
                  className="shrink-0 bg-white text-appbg font-semibold py-2.5 px-6 rounded-lg glow-button hover:scale-105 transition-transform duration-200"
                >
                  {statusOf(continueCard.progress) === "in_progress" ? "Resume Lab" : "Start Lab"}
                </Link>
              </div>
            ) : (
              <div className="glass-panel rounded-xl p-6 relative z-10 text-center">
                <p className="text-white/90">No TPs assigned yet — check back with your teacher.</p>
              </div>
            )}
          </section>

          {/* My Assignments */}
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-medium text-white mb-1">My Assignments</h2>
            <div className="flex flex-col gap-3">
              {cards.length === 0 && (
                <div className="bg-panelbg border border-dashed border-panelborder rounded-xl p-12 text-center text-textmuted">
                  Nothing here yet.
                </div>
              )}
              {cards.map(({ tp, assignment, progress }) => {
                const badge = STATUS_BADGE[statusOf(progress)];
                return (
                  <Link
                    key={`${tp.id}-${assignment.id}`}
                    href={`/student/tp/${tp.id}?assignmentId=${assignment.id}`}
                    className="bg-panelbg border border-panelborder/50 rounded-xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-primary/50 transition-colors cursor-pointer"
                  >
                    <div>
                      <h3 className="text-white font-medium mb-1">{tp.title}</h3>
                      <p className="text-sm text-textmuted">
                        {tp.steps.length} steps · {tp.difficulty} · ~{tp.estimatedMinutes}m
                        {assignment.dueDate &&
                          ` · Due: ${new Date(assignment.dueDate).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-sm text-textmuted font-light w-20 text-right">
                        {progress?.quizScore != null
                          ? `Score: ${progress.quizScore}%`
                          : `${getProgressPct(progress, tp)}%`}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right column: radar + notifications */}
        <div className="lg:col-span-1 flex flex-col gap-8">
          <section className="bg-paneldark border border-panelborder rounded-2xl p-6 relative">
            <h2 className="text-lg font-medium text-white mb-6">Skill Radar</h2>
            <SkillRadar axes={radarAxes} />
          </section>

          <section className="flex flex-col gap-4 flex-grow">
            <h2 className="text-lg font-medium text-white mb-1">Notifications</h2>
            <div className="bg-paneldark border border-panelborder rounded-2xl p-5 flex flex-col h-full max-h-[300px]">
              <h3 className="text-sm font-medium text-textmuted mb-4">Recent messages</h3>
              <div className="overflow-y-auto custom-scrollbar flex flex-col gap-4 pr-2">
                {notifications.length === 0 && (
                  <p className="text-sm text-textmuted py-4 text-center">
                    You&apos;re all caught up 🎉
                  </p>
                )}
                {notifications.map((notif, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 pb-4 ${
                      i < notifications.length - 1 ? "border-b border-panelborder/50" : ""
                    }`}
                  >
                    <div className="mt-0.5">{notifIcon(notif.icon)}</div>
                    <div>
                      <p className="text-sm font-medium text-white mb-0.5">{notif.from}</p>
                      <p className="text-sm text-textmuted">{notif.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
