"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { tpService } from "@/services/tpService";
import { userService } from "@/services/userService";
import { analyticsService, AnalyticsSummary } from "@/services/analyticsService";
import { subscribeProgress } from "@/services/realtimeService";
import { TP, Assignment, TPProgress, User } from "@/types";
import {
  Wand2,
  PenLine,
  X,
  Sparkles,
  FolderOpen,
  Users,
  Inbox,
  BarChart3,
  CalendarDays,
  Bot,
} from "lucide-react";
import AppNavbar from "@/components/layout/AppNavbar";

function CreateTPModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  const choose = (path: string) => {
    onClose();
    router.push(path);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.65)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md glass-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Créer un TP</h2>
            <p className="mt-0.5 text-sm text-textmuted">Comment souhaitez-vous créer ce TP ?</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-textmuted transition-colors hover:bg-navactive hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => choose("/teacher/create-tp/agent")}
            className="group relative flex flex-col items-start gap-3 overflow-hidden rounded-2xl border border-panelborder bg-paneldark p-5 text-left transition-all hover:border-primary hover:bg-primary/5"
          >
            <div
              className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
              style={{ background: "radial-gradient(circle, #a855f744, transparent 70%)" }}
            />
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-hero text-white">
              <Wand2 size={18} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-semibold text-white">
                Agent IA
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-purple-300">
                  Nouveau
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-textmuted">
                Déposez l&apos;énoncé PDF ou écrivez un prompt — l&apos;agent génère le TP complet.
              </p>
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs font-medium text-purple-300">
              <Sparkles size={11} /> Recommandé
            </div>
          </button>

          {/* Manual */}
          <button
            onClick={() => choose("/teacher/create-tp")}
            className="group relative flex flex-col items-start gap-3 overflow-hidden rounded-2xl border border-panelborder bg-paneldark p-5 text-left transition-all hover:border-secondary hover:bg-secondary/5"
          >
            <div
              className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
              style={{ background: "radial-gradient(circle, #3b82f644, transparent 70%)" }}
            />
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navactive text-blue-400">
              <PenLine size={18} />
            </div>
            <div>
              <div className="font-semibold text-white">Manuellement</div>
              <p className="mt-1 text-xs leading-relaxed text-textmuted">
                Saisissez chaque étape, balise et question de quiz à la main.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

const ago = (iso?: string) => {
  if (!iso) return "";
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
};

export default function TeacherDashboardPage() {
  const { user } = useAuth();
  const [tps, setTPs] = useState<TP[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, TPProgress>>({});
  const [userMap, setUserMap] = useState<Record<string, User>>({});
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    const [allTPs, myAssigns, users, analytics] = await Promise.all([
      tpService.getAllTPs(),
      tpService.getAssignmentsForTeacher(user.id),
      userService.getUserMap(),
      analyticsService.getSummary(),
    ]);

    // Prefetch progress for every assigned TP, keyed by `${studentId}:${tpId}`.
    const tpIds = Array.from(new Set(myAssigns.map((a) => a.tpId)));
    const progressLists = await Promise.all(tpIds.map((id) => tpService.getProgressByTp(id)));
    const map: Record<string, TPProgress> = {};
    progressLists.flat().forEach((p) => { map[`${p.studentId}:${p.tpId}`] = p; });

    setTPs(allTPs);
    setAssignments(myAssigns);
    setProgressMap(map);
    setUserMap(users);
    setSummary(analytics);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Live updates: every student progress push over the WebSocket is merged
  // straight into the map (no refetch needed — the full snapshot travels with
  // the event). Analytics counters refresh alongside; a 30s interval keeps
  // online/offline presence accurate even if the socket drops.
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeProgress((p) => {
      setProgressMap((prev) => ({ ...prev, [`${p.studentId}:${p.tpId}`]: p }));
      analyticsService.getSummary().then(setSummary).catch(() => {});
    });
    const id = setInterval(loadData, 30000);
    return () => {
      unsubscribe();
      clearInterval(id);
    };
  }, [user, loadData]);

  const getStudentName = (id: string) => userMap[id]?.name ?? id;
  const getInitials = (id: string) => userMap[id]?.avatarInitials ?? "??";

  const myTPs = tps.filter((tp) => tp.createdBy === user?.id);
  const myAssignments = assignments.filter((a) => a.assignedBy === user?.id);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const progresses = Object.values(progressMap);
    const completed = progresses.filter((p) => p.status === "completed");
    const scores = completed
      .map((p) => p.quizScore)
      .filter((s): s is number => s != null);
    return {
      totalTPs: myTPs.length,
      activeStudents: new Set(myAssignments.flatMap((a) => a.studentIds)).size,
      toReview: completed.length,
      avgScore: scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
    };
  }, [progressMap, myTPs, myAssignments]);

  // ── Recent activity feed from live progress ─────────────────────────────
  const activity = useMemo(() => {
    return Object.values(progressMap)
      .filter((p) => p.lastActiveAt)
      .sort((a, b) => (b.lastActiveAt ?? "").localeCompare(a.lastActiveAt ?? ""))
      .slice(0, 5)
      .map((p) => {
        const tp = tps.find((t) => t.id === p.tpId);
        return {
          key: `${p.studentId}:${p.tpId}`,
          initials: getInitials(p.studentId),
          name: getStudentName(p.studentId),
          verb: p.status === "completed" ? "submitted" : "updated",
          tpTitle: tp?.title ?? p.tpId,
          when: ago(p.lastActiveAt),
          online: tpService.isOnline(p),
          done: p.status === "completed",
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressMap, tps, userMap]);

  // ── Pinned TPs (with assignment meta) ────────────────────────────────────
  const pinned = useMemo(
    () =>
      myTPs.slice(0, 4).map((tp) => {
        const assigns = myAssignments.filter((a) => a.tpId === tp.id);
        const studentCount = new Set(assigns.flatMap((a) => a.studentIds)).size;
        const dueDate = assigns.map((a) => a.dueDate).filter(Boolean).sort()[0];
        return { tp, studentCount, dueDate, published: assigns.length > 0 };
      }),
    [myTPs, myAssignments]
  );

  const statCards = [
    { label: "Total TPs", value: stats.totalTPs, icon: FolderOpen, dot: false },
    { label: "Active Students", value: stats.activeStudents, icon: Users, dot: false },
    { label: "Submissions to Review", value: stats.toReview, icon: Inbox, dot: stats.toReview > 0 },
    { label: "Average Score", value: stats.avgScore != null ? `${stats.avgScore}%` : "—", icon: BarChart3, dot: false },
    { label: "AI Interactions", value: summary?.interactions ?? "—", icon: Bot, dot: false },
  ];

  return (
    <div className="min-h-screen bg-appbg">
      {showCreateModal && <CreateTPModal onClose={() => setShowCreateModal(false)} />}

      <AppNavbar />

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Welcome header */}
        <section className="mb-12">
          <h1 className="font-serif text-4xl font-semibold mb-6 text-white">
            Welcome back, {user?.name}
          </h1>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-gradient font-semibold px-6 py-2.5 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-primary/20"
            >
              Create new TP <span className="text-lg leading-none">+</span>
            </button>
            <Link
              href="/teacher/assign-tp"
              className="px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-textlight font-semibold text-sm hover:bg-white/10 transition-colors"
            >
              Assign TP
            </Link>
          </div>
        </section>

        {/* Stats grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
          {statCards.map((s) => (
            <div key={s.label} className="glass-card p-6 flex justify-between items-start">
              <div>
                <p className="text-textmuted text-sm mb-2">{s.label}</p>
                <p className="text-3xl font-bold text-white">{s.value}</p>
              </div>
              <div className="relative bg-white/5 p-3 rounded-xl border border-white/10">
                <s.icon className="w-5 h-5 text-indigo-300" />
                {s.dot && (
                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-orange-400 rounded-full" />
                )}
              </div>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent activity */}
          <section className="glass-card p-8">
            <h2 className="text-xl font-semibold mb-8 text-white">Recent Activity</h2>
            {activity.length === 0 ? (
              <p className="text-sm text-textmuted">
                No student activity yet — assign a TP to get things moving.
              </p>
            ) : (
              <div className="space-y-6">
                {activity.map((a) => (
                  <div key={a.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-navactive border border-panelborder flex items-center justify-center text-xs font-bold relative text-textlight">
                        {a.initials}
                        <div
                          className={`absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-paneldark rounded-full ${
                            a.online ? "bg-green-500" : "bg-gray-600"
                          }`}
                        />
                      </div>
                      <p className="text-sm text-gray-300">
                        <span className="font-medium text-white">{a.name}</span> {a.verb}{" "}
                        &quot;{a.tpTitle}&quot; —{" "}
                        <span className="text-gray-500">{a.when}</span>
                      </p>
                    </div>
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        a.done ? "bg-green-500" : "bg-gray-600"
                      }`}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pinned TPs */}
          <section className="glass-card p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-semibold text-white">Pinned TPs</h2>
              <Link
                href="/teacher/student-evaluation"
                className="text-sm text-purple-300 hover:text-white transition-colors"
              >
                View analytics →
              </Link>
            </div>
            {pinned.length === 0 ? (
              <p className="text-sm text-textmuted">
                No TPs yet.{" "}
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="text-purple-300 hover:underline"
                >
                  Create your first TP →
                </button>
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pinned.map(({ tp, studentCount, dueDate, published }) => (
                  <div
                    key={tp.id}
                    className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col h-full"
                  >
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-[10px] uppercase tracking-wider text-gray-400">
                        Status
                      </span>
                      <span
                        className={`text-[10px] px-2 py-1 rounded-md font-medium ${
                          published
                            ? "bg-green-500/20 text-green-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {published ? "Published" : "Draft"}
                      </span>
                    </div>
                    <h3 className="text-lg font-serif font-medium mb-4 text-white">{tp.title}</h3>
                    <div className="space-y-2 text-xs text-gray-400 mb-6">
                      <p>
                        {tp.steps.length} steps • {tp.difficulty} • ~{tp.estimatedMinutes}m
                      </p>
                      {dueDate && (
                        <p className="flex items-center gap-1.5">
                          <CalendarDays className="w-3 h-3" />
                          Due: {new Date(dueDate).toLocaleDateString()}
                        </p>
                      )}
                      <p className="flex items-center gap-1.5">
                        <Users className="w-3 h-3" />
                        {studentCount} student{studentCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Link
                      href="/teacher/student-evaluation"
                      className="mt-auto w-full py-2 btn-gradient font-semibold rounded-lg text-sm text-center"
                    >
                      View
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
