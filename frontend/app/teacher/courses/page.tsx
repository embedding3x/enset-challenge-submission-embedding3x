"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { courseService, Course } from "@/services/courseService";
import {
  Upload, FileText, Trash2, X, BookOpen, CheckCircle2,
  Loader2, ArrowLeft, Database, Search, RefreshCw, AlertCircle,
  FileSearch, Cpu, Layers,
} from "lucide-react";

const C = {
  base: "#141724", mantle: "#181b2b", surface0: "#1e2235",
  surface1: "#2a2f4c", surface2: "#4a5170", overlay: "#8b92b2",
  text: "#e2e8f0", subtext: "#b6bdd9",
  mauve: "#c084fc", blue: "#60a5fa", green: "#34d399",
  red: "#f87171", yellow: "#fbbf24", peach: "#fb923c", teal: "#2dd4bf",
};

const COURSES_KEY = "agentic_tp_courses";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: Course["status"] }) {
  if (status === "indexing") return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: `${C.yellow}1f`, color: C.yellow, border: `1px solid ${C.yellow}3a` }}>
      <Loader2 size={11} className="animate-spin" /> Indexation…
    </span>
  );
  if (status === "indexed") return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: `${C.green}1f`, color: C.green, border: `1px solid ${C.green}3a` }}>
      <CheckCircle2 size={11} /> Indexé
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: `${C.red}1f`, color: C.red, border: `1px solid ${C.red}3a` }}>
      <AlertCircle size={11} /> Erreur
    </span>
  );
}

function CourseCard({ course, onDelete }: { course: Course; onDelete: (id: string) => void }) {
  return (
    <div className="group flex items-center gap-4 rounded-2xl p-4 transition-all"
      style={{ background: C.surface0, border: `1px solid ${C.surface1}` }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = C.surface2)}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = C.surface1)}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `${C.mauve}1f`, color: C.mauve }}>
        <FileText size={20} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="truncate font-medium text-sm" style={{ color: C.text }}>{course.name}</span>
          {course.subject && (
            <span className="shrink-0 rounded-md px-1.5 py-0.5 text-xs"
              style={{ background: `${C.blue}1f`, color: C.blue }}>
              {course.subject}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: C.overlay }}>
          <span>{formatSize(course.size)}</span>
          <span>·</span>
          <span>{formatDate(course.uploadedAt)}</span>
          {course.chunks && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Layers size={10} /> {course.chunks} chunks
              </span>
            </>
          )}
        </div>
      </div>

      <StatusBadge status={course.status} />

      <button
        onClick={() => onDelete(course.id)}
        className="rounded-lg p-1.5 opacity-0 transition-all group-hover:opacity-100"
        style={{ color: C.overlay }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = C.red)}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = C.overlay)}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Source of truth is the RAG service's store; localStorage is just a cache.
      try {
        const list = await courseService.list();
        if (!cancelled) {
          saveCourses(list);
          return;
        }
      } catch { /* fall back to cache below */ }
      if (cancelled || typeof window === "undefined") return;
      const raw = localStorage.getItem(COURSES_KEY);
      if (raw) {
        try { setCourses(JSON.parse(raw)); } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveCourses = (list: Course[]) => {
    setCourses(list);
    if (typeof window !== "undefined") localStorage.setItem(COURSES_KEY, JSON.stringify(list));
  };

  const upsert = (list: Course[], course: Course): Course[] => {
    const idx = list.findIndex((c) => c.id === course.id);
    if (idx >= 0) { const copy = [...list]; copy[idx] = course; return copy; }
    return [...list, course];
  };

  const addFiles = useCallback(async (list: FileList) => {
    setUploading(true);

    const fileArray = Array.from(list);
    // Show optimistic "indexing" rows while the backend embeds the documents.
    const incoming: Course[] = fileArray.map((f) => ({
      id: `course-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: f.name,
      size: f.size,
      uploadedAt: new Date().toISOString(),
      status: "indexing" as const,
    }));
    let working = [...courses, ...incoming];
    saveCourses(working);

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const courseId = incoming[i].id;
      try {
        const course = await courseService.upload(file, courseId);
        working = upsert(working, course);
      } catch {
        working = upsert(working, { ...incoming[i], status: "error" });
      }
      saveCourses(working);
    }

    setUploading(false);
  }, [courses]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const deleteCourse = async (id: string) => {
    saveCourses(courses.filter((c) => c.id !== id));
    try {
      await courseService.remove(id);
    } catch { /* already removed from UI */ }
  };

  const reindex = async (id: string) => {
    saveCourses(courses.map((c) => c.id === id ? { ...c, status: "indexing" as const, chunks: undefined } : c));
    try {
      const course = await courseService.reindex(id);
      setCourses((prev) => {
        const updated = upsert(prev, course);
        if (typeof window !== "undefined") localStorage.setItem(COURSES_KEY, JSON.stringify(updated));
        return updated;
      });
      return;
    } catch { /* fall through to error state */ }
    setCourses((prev) => {
      const updated = prev.map((c) => c.id === id ? { ...c, status: "error" as const } : c);
      if (typeof window !== "undefined") localStorage.setItem(COURSES_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const filtered = courses.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.subject ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const indexedCount = courses.filter((c) => c.status === "indexed").length;

  return (
    <div className="min-h-screen" style={{ background: C.base, color: C.text }}>
      <style>{`
        @keyframes riseIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .rise{animation:riseIn .4s cubic-bezier(.4,0,.2,1) both}
      `}</style>

      {/* atmosphere */}
      <div className="pointer-events-none fixed inset-0" style={{
        background: `radial-gradient(800px 400px at 100% 0%, ${C.teal}0f, transparent 55%), radial-gradient(600px 300px at 0% 100%, ${C.blue}0c, transparent 55%)`,
      }} />

      {/* Nav */}
      <nav className="z-10 border-b px-6 py-3.5 flex items-center gap-3 sticky top-0"
        style={{ background: `${C.mantle}ee`, borderColor: C.surface1, backdropFilter: "blur(12px)" }}>
        <Link href="/teacher/dashboard"
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: C.overlay }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = C.text)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = C.overlay)}>
          <ArrowLeft size={15} /> Dashboard
        </Link>
        <span style={{ color: C.surface2 }}>/</span>
        <span className="text-sm font-medium" style={{ color: C.text }}>Cours & Documents RAG</span>
      </nav>

      <div className="relative mx-auto max-w-4xl px-5 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: `linear-gradient(135deg, ${C.teal}, ${C.blue})`, color: C.base }}>
              <BookOpen size={18} />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: C.text }}>Cours & Documents RAG</h1>
          </div>
          <p style={{ color: C.overlay }} className="text-sm max-w-xl">
            Uploadez vos PDF de cours et annexes. L'agent IA les indexe dans sa base vectorielle
            et les utilise pour générer des TPs contextualisés et des réponses précises.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Documents", value: courses.length, icon: FileText, color: C.blue },
            { label: "Indexés", value: indexedCount, icon: Database, color: C.green },
            { label: "En cours", value: courses.filter((c) => c.status === "indexing").length, icon: Cpu, color: C.yellow },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl p-4"
              style={{ background: C.surface0, border: `1px solid ${C.surface1}` }}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} style={{ color }} />
                <span className="text-xs" style={{ color: C.overlay }}>{label}</span>
              </div>
              <span className="text-2xl font-bold" style={{ color: C.text }}>{value}</span>
            </div>
          ))}
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !uploading && inputRef.current?.click()}
          className="cursor-pointer rounded-2xl p-8 text-center mb-6 transition-all"
          style={{
            background: dragOver ? `${C.teal}0f` : C.surface0,
            border: `2px dashed ${dragOver ? C.teal : C.surface2}`,
          }}>
          <input ref={inputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt,.md" className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: `${C.teal}1f`, color: C.teal }}>
            {uploading ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
          </div>
          <p className="font-semibold mb-1" style={{ color: C.text }}>
            {uploading ? "Upload en cours…" : "Déposez vos documents de cours ici"}
          </p>
          <p className="text-sm" style={{ color: C.overlay }}>
            PDF · DOCX · TXT · Markdown — glissez ou cliquez pour sélectionner
          </p>
          <div className="mt-4 flex justify-center gap-2 flex-wrap">
            {["Cours magistral", "TD corrigé", "Annexe technique", "Slides", "Bibliographie"].map((tag) => (
              <span key={tag} className="rounded-full px-3 py-1 text-xs"
                style={{ background: C.surface1, color: C.subtext }}>
                {tag}
              </span>
            ))}
          </div>
        </div>

        {courses.length > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: C.surface0, border: `1px solid ${C.surface1}` }}>
            <Search size={15} style={{ color: C.overlay }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un document…"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: C.text }}
            />
            {search && (
              <button onClick={() => setSearch("")}>
                <X size={14} style={{ color: C.overlay }} />
              </button>
            )}
          </div>
        )}

        {courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl"
              style={{ background: `${C.blue}14`, color: C.blue }}>
              <FileSearch size={28} />
            </div>
            <p className="font-semibold" style={{ color: C.text }}>Aucun document uploadé</p>
            <p className="mt-1 text-sm" style={{ color: C.overlay }}>
              Uploadez vos PDFs de cours pour enrichir la base de connaissances de l'agent.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm" style={{ color: C.subtext }}>
                {filtered.length} document{filtered.length !== 1 ? "s" : ""}
                {search ? ` pour « ${search} »` : ""}
              </span>
            </div>
            {filtered.map((course, i) => (
              <div key={course.id} className="rise" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="group flex items-center gap-4 rounded-2xl p-4 transition-all"
                  style={{ background: C.surface0, border: `1px solid ${C.surface1}` }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = C.surface2)}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = C.surface1)}>
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${C.mauve}1f`, color: C.mauve }}>
                    <FileText size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="truncate font-medium text-sm" style={{ color: C.text }}>{course.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs" style={{ color: C.overlay }}>
                      <span>{formatSize(course.size)}</span>
                      <span>·</span>
                      <span>{formatDate(course.uploadedAt)}</span>
                      {course.chunks && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Layers size={10} /> {course.chunks} chunks</span>
                        </>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={course.status} />
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {course.status !== "indexing" && (
                      <button onClick={() => reindex(course.id)}
                        className="rounded-lg p-1.5 transition-colors"
                        style={{ color: C.overlay }}
                        title="Réindexer"
                        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = C.blue)}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = C.overlay)}>
                        <RefreshCw size={14} />
                      </button>
                    )}
                    <button onClick={() => deleteCourse(course.id)}
                      className="rounded-lg p-1.5 transition-colors"
                      style={{ color: C.overlay }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = C.red)}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = C.overlay)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {indexedCount > 0 && (
          <div className="mt-8 rounded-2xl p-4 rise"
            style={{ background: `${C.teal}0c`, border: `1px solid ${C.teal}2a` }}>
            <div className="flex items-start gap-3">
              <Database size={16} style={{ color: C.teal, flexShrink: 0, marginTop: 2 }} />
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: C.teal }}>Base vectorielle active</p>
                <p className="text-xs leading-relaxed" style={{ color: C.subtext }}>
                  {indexedCount} document{indexedCount > 1 ? "s" : ""} indexé{indexedCount > 1 ? "s" : ""} — l'agent IA utilisera
                  ce contexte lors de la génération de TPs et pour répondre aux questions des étudiants.
                  Créez un TP avec l'Agent IA pour en tirer parti.
                </p>
                <Link href="/teacher/create-tp/agent"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ color: C.teal }}>
                  Créer un TP avec l'Agent →
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
