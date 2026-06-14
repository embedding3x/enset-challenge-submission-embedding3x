"use client";

import React, { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { tpService } from "@/services/tpService";
import { agentService, RegenerableSection } from "@/services/agentService";
import { LANGUAGES, getLanguage, LanguageProfile } from "@/lib/languages";
import {
  buildLocalTP, regenerateLocalSection, DraftTP, FallbackSettings,
} from "@/lib/tpFallback";
import { TPContent, TPStep, QuizQuestion, RubricCriterion, TPStatus } from "@/types";
import {
  Upload, FileText, X, Sparkles, Wand2, Loader2, Check, Plus, Trash2,
  ChevronDown, Code2, ListChecks, Clock, BarChart3, Languages, ShieldCheck,
  RefreshCw, Download, GraduationCap, Bot, FileCheck2, CircleDot, ArrowLeft,
  Target, Wrench, Trophy, Lightbulb, Gauge, Terminal, ScrollText, Boxes,
} from "lucide-react";

// ── Catppuccin-ish palette ─────────────────────────────────────────────────
const C = {
  base: "#141724", mantle: "#181b2b", surface0: "#1e2235", surface1: "#2a2f4c",
  surface2: "#4a5170", overlay: "#8b92b2", text: "#e2e8f0", subtext: "#b6bdd9",
  mauve: "#c084fc", blue: "#60a5fa", green: "#34d399", red: "#f87171",
  yellow: "#fbbf24", peach: "#fb923c", teal: "#2dd4bf",
};

const uid = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const DIFF = {
  beginner: { label: { fr: "Débutant", en: "Beginner" }, color: C.green },
  intermediate: { label: { fr: "Intermédiaire", en: "Intermediate" }, color: C.yellow },
  advanced: { label: { fr: "Avancé", en: "Advanced" }, color: C.red },
};

const STATUS_FLOW: { id: TPStatus; label: { fr: string; en: string } }[] = [
  { id: "draft", label: { fr: "Brouillon", en: "Draft" } },
  { id: "reviewed", label: { fr: "Relu", en: "Reviewed" } },
  { id: "enhanced", label: { fr: "Amélioré", en: "Enhanced" } },
  { id: "published", label: { fr: "Publié", en: "Published" } },
];

// ── Types ───────────────────────────────────────────────────────────────────
interface UploadedFile { id: string; name: string; size: number; kind: "enonce" | "annexe"; }

interface Settings {
  progLang: string;          // mandatory programming language id ("" = none yet)
  difficulty: "beginner" | "intermediate" | "advanced";
  stepCount: number;
  questionCount: number;
  uiLang: "fr" | "en";       // prose language of the generated text
  antiCheat: boolean;
  prompt: string;
}

// ── Shape coercion (defensive for both LLM and local output) ─────────────────
function coerceOptions(options: { id?: string; text?: string }[] | undefined): QuizQuestion["options"] {
  const letters = ["a", "b", "c", "d"];
  const out = (options ?? []).map((o, i) => ({ id: o.id ?? letters[i] ?? String(i), text: o.text ?? "" }));
  while (out.length < 4) out.push({ id: letters[out.length], text: "" });
  return out;
}

function coerceQuiz(quiz: any[] | undefined): QuizQuestion[] {
  return (quiz ?? []).map((q) => {
    const options = coerceOptions(q.options);
    const correctId = options.some((o) => o.id === (q.correctId ?? q.correct_id))
      ? (q.correctId ?? q.correct_id) : options[0]?.id ?? "a";
    return { id: q.id ?? uid(), question: q.question ?? "", options, correctId, explanation: q.explanation ?? "" };
  });
}

function coerceTestCases(value: any[] | undefined): { id?: string; name: string; stdin: string; expectedStdout: string }[] {
  return (value ?? []).map((t, i) => ({
    id: t.id ?? uid(),
    name: t.name ?? `Test ${i + 1}`,
    stdin: t.stdin ?? "",
    expectedStdout: t.expectedStdout ?? t.expected_stdout ?? "",
  }));
}

function coerceSteps(steps: any[] | undefined): TPStep[] {
  return (steps ?? []).map((s) => ({
    id: s.id ?? uid(),
    title: s.title ?? "",
    instructions: s.instructions ?? "",
    requiredTags: s.requiredTags ?? s.required_tags ?? [],
    testCases: coerceTestCases(s.testCases ?? s.test_cases),
    quiz: coerceQuiz(s.quiz),
  }));
}

function coerceCriteria(value: any[] | undefined): RubricCriterion[] {
  return (value ?? []).map((c) =>
    typeof c === "string"
      ? { criterion: c, points: 0 }
      : { criterion: c.criterion ?? c.label ?? "", points: Number(c.points) || 0 }
  );
}

const asStrings = (v: any): string[] => (Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)]);

function coerceContent(c: any): TPContent {
  c = c ?? {};
  return {
    context: c.context ?? "",
    objectives: asStrings(c.objectives),
    prerequisites: asStrings(c.prerequisites),
    tools: asStrings(c.tools),
    expectedOutput: c.expectedOutput ?? c.expected_output ?? "",
    constraints: asStrings(c.constraints),
    evaluationCriteria: coerceCriteria(c.evaluationCriteria ?? c.evaluation_criteria),
    bonus: asStrings(c.bonus),
  };
}

function coerceDraft(raw: any, profile: LanguageProfile, s: Settings, createdBy: string): DraftTP {
  return {
    id: raw.id ?? uid(),
    title: raw.title ?? `${profile.label} — TP`,
    description: raw.description ?? "",
    field: raw.field ?? "",
    difficulty: (["beginner", "intermediate", "advanced"].includes(raw.difficulty) ? raw.difficulty : s.difficulty),
    estimatedMinutes: Number(raw.estimatedMinutes) || 45,
    language: profile.id,
    starterHTML: raw.starterHTML ?? raw.starter ?? profile.starter,
    content: coerceContent(raw.content),
    steps: coerceSteps(raw.steps),
    status: "draft",
    antiCheat: s.antiCheat,
    createdBy,
    createdAt: new Date().toISOString(),
  };
}

// ── Small atoms ───────────────────────────────────────────────────────────────
function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: `${color}1f`, color, border: `1px solid ${color}3a` }}>
      {children}
    </span>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium" style={{ color: C.subtext }}>
        <Icon size={13} style={{ color: C.overlay }} /> {label}
      </span>
      {children}
    </label>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string; c?: string }[] }) {
  return (
    <div className="flex gap-1 rounded-lg p-1" style={{ background: C.mantle, border: `1px solid ${C.surface1}` }}>
      {options.map((o) => {
        const active = value === o.v;
        return (
          <button key={o.v} onClick={() => onChange(o.v)}
            className="flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all"
            style={active
              ? { background: `${o.c || C.mauve}26`, color: o.c || C.mauve, border: `1px solid ${o.c || C.mauve}55` }
              : { color: C.subtext, border: "1px solid transparent" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function RegenButton({ busy, onClick, lang }: { busy: boolean; onClick: () => void; lang: "fr" | "en" }) {
  return (
    <button onClick={onClick} disabled={busy}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
      style={{ background: `${C.mauve}1a`, color: C.mauve, border: `1px solid ${C.mauve}33`, opacity: busy ? 0.6 : 1 }}>
      {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
      {lang === "fr" ? "Régénérer" : "Regenerate"}
    </button>
  );
}

function SectionCard({ icon: Icon, color, title, action, children }: {
  icon: React.ElementType; color: string; title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.surface0, border: `1px solid ${C.surface1}` }}>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: C.subtext }}>
          <Icon size={14} style={{ color }} /> {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

// List of free-text strings with add/remove.
function ListEditor({ items, onChange, placeholder, lang }: {
  items: string[]; onChange: (items: string[]) => void; placeholder: string; lang: "fr" | "en";
}) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.overlay }} />
          <textarea value={it} rows={1}
            onChange={(e) => onChange(items.map((x, xi) => (xi === i ? e.target.value : x)))}
            className="flex-1 resize-none rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.text }} />
          <button onClick={() => onChange(items.filter((_, xi) => xi !== i))} className="mt-1.5 rounded-md p-1" style={{ color: C.overlay }}>
            <X size={14} />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...items, ""])}
        className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: C.mauve }}>
        <Plus size={12} /> {placeholder}
      </button>
    </div>
  );
}

function RubricEditor({ items, onChange, lang }: { items: RubricCriterion[]; onChange: (items: RubricCriterion[]) => void; lang: "fr" | "en" }) {
  const total = items.reduce((s, c) => s + (Number(c.points) || 0), 0);
  return (
    <div className="space-y-2">
      {items.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={c.criterion}
            onChange={(e) => onChange(items.map((x, xi) => (xi === i ? { ...x, criterion: e.target.value } : x)))}
            placeholder={lang === "fr" ? "Critère…" : "Criterion…"}
            className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.text }} />
          <input type="number" value={c.points}
            onChange={(e) => onChange(items.map((x, xi) => (xi === i ? { ...x, points: Number(e.target.value) || 0 } : x)))}
            className="w-16 rounded-lg px-2 py-1.5 text-center text-sm outline-none"
            style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.text }} />
          <span className="text-xs" style={{ color: C.overlay }}>pts</span>
          <button onClick={() => onChange(items.filter((_, xi) => xi !== i))} className="rounded-md p-1" style={{ color: C.overlay }}>
            <X size={14} />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button onClick={() => onChange([...items, { criterion: "", points: 0 }])}
          className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: C.mauve }}>
          <Plus size={12} /> {lang === "fr" ? "Critère" : "Criterion"}
        </button>
        <span className="text-xs font-medium" style={{ color: total === 100 ? C.green : C.yellow }}>
          {lang === "fr" ? "Total" : "Total"}: {total}/100
        </span>
      </div>
    </div>
  );
}

function QuizCard({ q, onChange, onRemove, lang }: { q: QuizQuestion; onChange: (q: QuizQuestion) => void; onRemove: () => void; lang: "fr" | "en" }) {
  return (
    <div className="rounded-lg p-3" style={{ background: C.base, border: `1px solid ${C.surface1}` }}>
      <div className="mb-2 flex items-start gap-2">
        <input value={q.question} onChange={(e) => onChange({ ...q, question: e.target.value })}
          placeholder={lang === "fr" ? "Question…" : "Question…"}
          className="flex-1 rounded-md px-2 py-1.5 text-sm outline-none"
          style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.text }} />
        <button onClick={onRemove} className="rounded-md p-1.5" style={{ color: C.overlay }}><Trash2 size={14} /></button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {q.options.map((o) => {
          const correct = q.correctId === o.id;
          return (
            <div key={o.id} className="flex items-center gap-1.5">
              <button onClick={() => onChange({ ...q, correctId: o.id })}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                style={correct ? { background: C.green, color: C.base } : { border: `1px solid ${C.surface2}`, color: "transparent" }}>
                <Check size={11} />
              </button>
              <input value={o.text}
                onChange={(e) => onChange({ ...q, options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })}
                className="w-full rounded-md px-2 py-1 text-xs outline-none"
                style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.text }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepCard({ step, index, onChange, onRemove, lang, reqLabel }: {
  step: TPStep; index: number; onChange: (s: TPStep) => void; onRemove: () => void; lang: "fr" | "en"; reqLabel: string;
}) {
  const [open, setOpen] = useState(index === 0);
  const [tagInput, setTagInput] = useState("");
  const addTag = () => {
    const t = tagInput.trim().replace(/[<>]/g, "");
    if (t && !step.requiredTags.includes(t)) onChange({ ...step, requiredTags: [...step.requiredTags, t] });
    setTagInput("");
  };
  const newQuestion = (): QuizQuestion => ({
    id: uid(), question: "",
    options: [{ id: "a", text: "" }, { id: "b", text: "" }, { id: "c", text: "" }, { id: "d", text: "" }],
    correctId: "a", explanation: "",
  });
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: C.surface0, border: `1px solid ${C.surface1}` }}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold"
          style={{ background: `${C.mauve}26`, color: C.mauve }}>{index + 1}</span>
        <span className="flex-1 truncate text-sm font-medium" style={{ color: C.text }}>
          {step.title || (lang === "fr" ? "Étape sans titre" : "Untitled step")}
        </span>
        <span className="text-xs" style={{ color: C.overlay }}>{step.requiredTags.length} · {step.quiz.length} Q</span>
        <ChevronDown size={16} style={{ color: C.overlay, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          <input value={step.title} onChange={(e) => onChange({ ...step, title: e.target.value })}
            placeholder={lang === "fr" ? "Titre de l'étape" : "Step title"}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.text }} />
          <textarea value={step.instructions} onChange={(e) => onChange({ ...step, instructions: e.target.value })}
            rows={3} placeholder={lang === "fr" ? "Consignes…" : "Instructions…"}
            className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.text }} />
          <div>
            <span className="mb-1.5 block text-xs font-medium" style={{ color: C.subtext }}>{reqLabel}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {step.requiredTags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs"
                  style={{ background: `${C.blue}1f`, color: C.blue, border: `1px solid ${C.blue}3a` }}>
                  {t}
                  <button onClick={() => onChange({ ...step, requiredTags: step.requiredTags.filter((x) => x !== t) })}><X size={11} /></button>
                </span>
              ))}
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder={lang === "fr" ? "+ ajouter" : "+ add"}
                className="w-24 rounded-md px-2 py-1 font-mono text-xs outline-none"
                style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.text }} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: C.subtext }}>{lang === "fr" ? "QCM de compréhension" : "Comprehension quiz"}</span>
              <button onClick={() => onChange({ ...step, quiz: [...step.quiz, newQuestion()] })}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs" style={{ color: C.mauve }}>
                <Plus size={12} /> {lang === "fr" ? "Question" : "Question"}
              </button>
            </div>
            {step.quiz.map((q, qi) => (
              <QuizCard key={q.id} q={q} lang={lang}
                onChange={(nq) => onChange({ ...step, quiz: step.quiz.map((x, i) => (i === qi ? nq : x)) })}
                onRemove={() => onChange({ ...step, quiz: step.quiz.filter((_, i) => i !== qi) })} />
            ))}
          </div>
          <button onClick={onRemove} className="inline-flex items-center gap-1 text-xs" style={{ color: C.red }}>
            <Trash2 size={12} /> {lang === "fr" ? "Supprimer l'étape" : "Remove step"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AgentTPCreatorPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [regen, setRegen] = useState<RegenerableSection | null>(null);
  const [tp, setTp] = useState<DraftTP | null>(null);
  const [usedLocal, setUsedLocal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [published, setPublished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<Settings>({
    progLang: "",
    difficulty: "intermediate",
    stepCount: 4,
    questionCount: 2,
    uiLang: "fr",
    antiCheat: true,
    prompt: "",
  });
  const L = settings.uiLang;
  const profile = getLanguage(settings.progLang);
  const reqLabel = profile?.requirement === "tags"
    ? (L === "fr" ? "Balises HTML requises" : "Required HTML tags")
    : (L === "fr" ? "Mots-clés / concepts requis" : "Required keywords / concepts");

  const fbSettings = (): FallbackSettings => ({
    difficulty: settings.difficulty, stepCount: settings.stepCount,
    questionCount: settings.questionCount, uiLang: settings.uiLang,
    antiCheat: settings.antiCheat, prompt: settings.prompt,
  });

  // ── File handling ──────────────────────────────────────────────────────────
  const addFiles = useCallback((list: FileList) => {
    setFiles((p) => [
      ...p,
      ...Array.from(list).map((f, i) => ({
        id: uid(), name: f.name, size: f.size,
        kind: (p.length === 0 && i === 0 ? "enonce" : "annexe") as "enonce" | "annexe",
      })),
    ]);
  }, []);
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); };
  const removeFile = (id: string) => setFiles((p) => p.filter((f) => f.id !== id));

  const hasInput = files.length > 0 || settings.prompt.trim().length > 0;
  const canGenerate = !!profile && hasInput;

  // ── Edits move the draft into "reviewed" (teacher edits have priority) ──────
  const editTP = (updater: (t: DraftTP) => DraftTP) =>
    setTp((p) => {
      if (!p) return p;
      const next = updater(p);
      if (next.status === "draft" || next.status === "enhanced") next.status = "reviewed";
      return next;
    });
  const editContent = (key: keyof TPContent, value: any) =>
    editTP((t) => ({ ...t, content: { ...t.content, [key]: value } }));

  // ── Generate draft ───────────────────────────────────────────────────────
  const generate = async () => {
    if (!profile) return;
    setGenerating(true); setTp(null); setPublished(false); setNotice(null); setUsedLocal(false);
    const createdBy = user?.id ?? "teacher";
    try {
      const res = await agentService.generateTP({
        prompt: settings.prompt,
        prog_language: profile.id,
        ui_language: settings.uiLang,
        difficulty: settings.difficulty,
        step_count: settings.stepCount,
        questions_per_step: settings.questionCount,
        file_names: files.map((f) => f.name),
      });
      setTp(coerceDraft(res.tp, profile, settings, createdBy));
    } catch {
      setUsedLocal(true);
      setNotice(L === "fr"
        ? "Service IA indisponible — brouillon généré localement (spécifique au langage)."
        : "AI service unavailable — draft generated locally (language-specific).");
      setTp(buildLocalTP(profile, fbSettings(), createdBy));
    } finally {
      setGenerating(false);
    }
  };

  // ── Enhance (AI refinement, preserves teacher edits) ────────────────────────
  const enhance = async () => {
    if (!tp || !profile) return;
    setEnhancing(true); setNotice(null);
    try {
      const res = await agentService.enhanceTP({
        tp, prog_language: profile.id, ui_language: settings.uiLang,
      });
      const next = coerceDraft(res.tp, profile, settings, tp.createdBy);
      setTp({ ...next, id: tp.id, status: "enhanced", antiCheat: tp.antiCheat });
    } catch {
      setNotice(L === "fr"
        ? "Amélioration IA indisponible (service hors-ligne). Vos modifications sont conservées."
        : "AI enhancement unavailable (service offline). Your edits are preserved.");
    } finally {
      setEnhancing(false);
    }
  };

  // ── Regenerate a single section ─────────────────────────────────────────────
  const applySection = (section: RegenerableSection, value: any) => {
    if (value == null) return;
    if (section === "steps") return editTP((t) => ({ ...t, steps: coerceSteps(value) }));
    if (section === "quiz") {
      const quizzes: QuizQuestion[][] = (value as any[]).map((q) => coerceQuiz(q));
      return editTP((t) => ({ ...t, steps: t.steps.map((s, i) => (quizzes[i] ? { ...s, quiz: quizzes[i] } : s)) }));
    }
    if (section === "starter") return editTP((t) => ({ ...t, starterHTML: String(value) }));
    if (section === "evaluationCriteria") return editContent("evaluationCriteria", coerceCriteria(value));
    if (section === "context" || section === "expectedOutput") return editContent(section, String(value));
    return editContent(section as keyof TPContent, asStrings(value));
  };

  const regenerate = async (section: RegenerableSection) => {
    if (!tp || !profile) return;
    setRegen(section); setNotice(null);
    try {
      const res = await agentService.regenerateSection({
        section, tp, prog_language: profile.id, ui_language: settings.uiLang,
        difficulty: settings.difficulty, step_count: settings.stepCount, questions_per_step: settings.questionCount,
      });
      applySection(section, res.value);
    } catch {
      applySection(section, regenerateLocalSection(section, profile, fbSettings()));
    } finally {
      setRegen(null);
    }
  };

  // ── Export / Publish ────────────────────────────────────────────────────────
  const exportJSON = () => {
    if (!tp) return;
    navigator.clipboard?.writeText(JSON.stringify(tp, null, 2))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  };

  const handlePublish = async () => {
    if (!tp || !profile) return;
    const created = await tpService.saveTP({
      ...tp,
      field: tp.field || profile.label,
      difficulty: tp.difficulty,
      language: profile.validatorId, // canonical id the student IDE & validator understand
      content: tp.content,
      status: "published",
      antiCheat: tp.antiCheat,
    } as any);
    if (!created) { setNotice(L === "fr" ? "Publication impossible. Le backend est-il démarré ?" : "Could not publish. Is the backend running?"); return; }
    setPublished(true);
    setTimeout(() => router.push("/teacher/dashboard"), 1400);
  };

  const statusIndex = tp ? STATUS_FLOW.findIndex((s) => s.id === tp.status) : -1;

  return (
    <div className="min-h-screen w-full" style={{ background: C.base, color: C.text }}>
      <style>{`
        @keyframes riseIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .rise{animation:riseIn .4s cubic-bezier(.4,0,.2,1) both}
      `}</style>

      <div className="pointer-events-none fixed inset-0" style={{
        background: `radial-gradient(900px 500px at 80% -10%, ${C.mauve}14, transparent 60%), radial-gradient(700px 400px at 0% 100%, ${C.blue}10, transparent 55%)`,
      }} />

      {/* Nav */}
      <nav className="z-10 border-b px-6 py-3.5 flex items-center justify-between sticky top-0"
        style={{ background: `${C.mantle}ee`, borderColor: C.surface1, backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-3">
          <Link href="/teacher/dashboard" className="flex items-center gap-1.5 text-sm" style={{ color: C.overlay }}>
            <ArrowLeft size={15} /> Dashboard
          </Link>
          <span style={{ color: C.surface2 }}>/</span>
          <span className="text-sm font-medium" style={{ color: C.text }}>{L === "fr" ? "Créer un TP" : "Create TP"}</span>
          <span style={{ color: C.surface2 }}>/</span>
          <span className="text-sm font-medium" style={{ color: C.mauve }}>Agent IA</span>
        </div>
        <Pill color={C.mauve}><Bot size={12} /> {profile ? profile.label : (L === "fr" ? "langage non choisi" : "no language")}</Pill>
      </nav>

      <div className="relative mx-auto max-w-[1320px] px-5 py-6 md:px-8">
        {/* Header */}
        <header className="mb-6 flex items-center gap-3.5">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ background: `linear-gradient(135deg, ${C.mauve}, ${C.blue})`, color: C.base }}>
            <Wand2 size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight" style={{ color: C.text }}>
              {L === "fr" ? "Créateur de TP par l'Agent IA" : "AI Agent TP Creator"}
            </h1>
            <p className="text-xs" style={{ color: C.overlay }}>
              {L === "fr"
                ? "Choisissez un langage, décrivez le sujet, puis relisez et améliorez le brouillon avant publication."
                : "Pick a language, describe the topic, then review and enhance the draft before publishing."}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[400px_1fr]">
          {/* ── LEFT: inputs ── */}
          <div className="space-y-4">
            {/* Language selector (mandatory) */}
            <div className="rounded-2xl p-4" style={{ background: C.surface0, border: `1px solid ${C.surface1}` }}>
              <label className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: C.subtext }}>
                <Code2 size={13} style={{ color: C.mauve }} />
                {L === "fr" ? "Langage de programmation" : "Programming language"}
                <span style={{ color: C.red }}>*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {LANGUAGES.map((lng) => {
                  const active = settings.progLang === lng.id;
                  return (
                    <button key={lng.id} onClick={() => setSettings({ ...settings, progLang: lng.id })}
                      className="flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center transition-all"
                      style={active
                        ? { background: `${lng.color}26`, border: `1px solid ${lng.color}88`, color: C.text }
                        : { background: C.mantle, border: `1px solid ${C.surface1}`, color: C.subtext }}>
                      <span className="text-lg leading-none">{lng.icon}</span>
                      <span className="text-[11px] font-medium leading-tight">{lng.label}</span>
                    </button>
                  );
                })}
              </div>
              {profile ? (
                <p className="mt-2.5 flex items-start gap-1.5 text-xs" style={{ color: C.overlay }}>
                  <CircleDot size={10} className="mt-0.5 shrink-0" style={{ color: profile.color }} />
                  {profile.ecosystem[L]}
                </p>
              ) : (
                <p className="mt-2.5 text-xs" style={{ color: C.yellow }}>
                  {L === "fr" ? "Sélection obligatoire avant la génération." : "Required before generation."}
                </p>
              )}
            </div>

            {/* Dropzone */}
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={onDrop} onClick={() => inputRef.current?.click()}
              className="cursor-pointer rounded-2xl p-5 text-center transition-all"
              style={{ background: dragOver ? `${C.mauve}12` : C.surface0, border: `1.5px dashed ${dragOver ? C.mauve : C.surface2}` }}>
              <input ref={inputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt,.md" className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)} />
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: `${C.mauve}1f`, color: C.mauve }}>
                <Upload size={18} />
              </div>
              <p className="text-sm font-medium" style={{ color: C.text }}>{L === "fr" ? "Déposer un énoncé (optionnel)" : "Drop an énoncé (optional)"}</p>
              <p className="mt-1 text-xs" style={{ color: C.overlay }}>PDF · DOCX · TXT</p>
            </div>
            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 rounded-xl p-3" style={{ background: C.mantle, border: `1px solid ${C.surface1}` }}>
                    <FileText size={16} style={{ color: C.teal }} />
                    <span className="min-w-0 flex-1 truncate text-sm" style={{ color: C.text }}>{f.name}</span>
                    <button onClick={() => removeFile(f.id)} style={{ color: C.overlay }}><X size={15} /></button>
                  </div>
                ))}
              </div>
            )}

            {/* Prompt */}
            <div className="rounded-2xl p-4" style={{ background: C.surface0, border: `1px solid ${C.surface1}` }}>
              <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: C.subtext }}>
                <Sparkles size={13} style={{ color: C.peach }} /> {L === "fr" ? "Consigne pour l'agent" : "Prompt for the agent"}
              </label>
              <textarea value={settings.prompt} onChange={(e) => setSettings({ ...settings, prompt: e.target.value })} rows={4}
                placeholder={profile
                  ? (L === "fr" ? `Ex. « TP ${profile.label} : ${profile.topics.fr[0]} »` : `e.g. "${profile.label} lab: ${profile.topics.en[0]}"`)
                  : (L === "fr" ? "Décrivez le sujet du TP…" : "Describe the TP topic…")}
                className="w-full resize-none rounded-xl px-3 py-2.5 text-sm leading-relaxed outline-none"
                style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.text }} />
            </div>

            {/* Settings */}
            <div className="space-y-3.5 rounded-2xl p-4" style={{ background: C.surface0, border: `1px solid ${C.surface1}` }}>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: C.subtext }}>
                <Sparkles size={13} style={{ color: C.mauve }} /> {L === "fr" ? "Paramètres" : "Settings"}
              </h3>
              <Field label={L === "fr" ? "Difficulté" : "Difficulty"} icon={BarChart3}>
                <Seg value={settings.difficulty} onChange={(v) => setSettings({ ...settings, difficulty: v })}
                  options={(Object.entries(DIFF) as [Settings["difficulty"], typeof DIFF[keyof typeof DIFF]][]).map(([k, v]) => ({ v: k, label: v.label[L], c: v.color }))} />
              </Field>
              <Field label={L === "fr" ? `Nombre d'étapes : ${settings.stepCount}` : `Steps: ${settings.stepCount}`} icon={ListChecks}>
                <input type="range" min={2} max={8} value={settings.stepCount}
                  onChange={(e) => setSettings({ ...settings, stepCount: +e.target.value })} className="w-full" style={{ accentColor: C.mauve }} />
              </Field>
              <Field label={L === "fr" ? `Questions par étape : ${settings.questionCount}` : `Questions per step: ${settings.questionCount}`} icon={GraduationCap}>
                <input type="range" min={1} max={6} value={settings.questionCount}
                  onChange={(e) => setSettings({ ...settings, questionCount: +e.target.value })} className="w-full" style={{ accentColor: C.green }} />
              </Field>
              <Field label={L === "fr" ? "Langue du contenu" : "Content language"} icon={Languages}>
                <Seg value={settings.uiLang} onChange={(v) => setSettings({ ...settings, uiLang: v })}
                  options={[{ v: "fr", label: "Français", c: C.blue }, { v: "en", label: "English", c: C.blue }]} />
              </Field>
              <button onClick={() => setSettings({ ...settings, antiCheat: !settings.antiCheat })}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm" style={{ background: C.mantle, border: `1px solid ${C.surface1}` }}>
                <span className="flex items-center gap-2" style={{ color: C.text }}>
                  <ShieldCheck size={15} style={{ color: settings.antiCheat ? C.green : C.overlay }} />
                  {L === "fr" ? "Anti-triche (copier-coller off)" : "Anti-cheat (paste off)"}
                </span>
                <span className="relative h-5 w-9 rounded-full" style={{ background: settings.antiCheat ? C.green : C.surface2 }}>
                  <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: settings.antiCheat ? "18px" : "2px" }} />
                </span>
              </button>
              <button onClick={generate} disabled={!canGenerate || generating}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all"
                style={{
                  background: !canGenerate || generating ? C.surface1 : `linear-gradient(135deg, ${C.mauve}, ${C.blue})`,
                  color: !canGenerate || generating ? C.overlay : C.base,
                  cursor: !canGenerate || generating ? "not-allowed" : "pointer",
                }}>
                {generating
                  ? (<><Loader2 size={16} className="animate-spin" /> {L === "fr" ? "Génération…" : "Generating…"}</>)
                  : (<><Wand2 size={16} /> {tp ? (L === "fr" ? "Régénérer le brouillon" : "Regenerate draft") : (L === "fr" ? "Générer le brouillon" : "Generate draft")}</>)}
              </button>
              {!profile && (
                <p className="text-center text-xs" style={{ color: C.yellow }}>
                  {L === "fr" ? "Choisissez d'abord un langage." : "Choose a language first."}
                </p>
              )}
            </div>
          </div>

          {/* ── RIGHT: draft + HITL review ── */}
          <div className="rounded-2xl p-5 md:p-6" style={{ background: C.surface0, border: `1px solid ${C.surface1}`, minHeight: 520 }}>
            {!tp ? (
              <div className="flex h-full min-h-[460px] flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl" style={{ background: `${C.mauve}14`, color: C.mauve }}>
                  <GraduationCap size={30} />
                </div>
                <h2 className="text-base font-semibold" style={{ color: C.text }}>
                  {L === "fr" ? "Le brouillon de TP apparaîtra ici" : "The TP draft appears here"}
                </h2>
                <p className="mt-1.5 max-w-sm text-sm" style={{ color: C.overlay }}>
                  {L === "fr"
                    ? "Sélectionnez un langage, décrivez le sujet, puis lancez l'agent. Le brouillon est entièrement modifiable et peut être amélioré par l'IA avant publication."
                    : "Select a language, describe the topic, then run the agent. The draft is fully editable and can be AI-enhanced before publishing."}
                </p>
              </div>
            ) : (
              <div className="rise space-y-4">
                {/* Status pipeline */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {STATUS_FLOW.map((s, i) => {
                    const done = i < statusIndex, current = i === statusIndex;
                    const col = current ? C.mauve : done ? C.green : C.overlay;
                    return (
                      <React.Fragment key={s.id}>
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{ background: current ? `${col}26` : "transparent", color: col, border: `1px solid ${current ? col + "66" : "transparent"}` }}>
                          {done ? <Check size={11} /> : <CircleDot size={11} />} {s.label[L]}
                        </span>
                        {i < STATUS_FLOW.length - 1 && <span style={{ color: C.surface2 }}>→</span>}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Draft banner */}
                {tp.status === "draft" && (
                  <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium"
                    style={{ background: `${C.yellow}14`, color: C.yellow, border: `1px solid ${C.yellow}3a` }}>
                    <Sparkles size={13} /> {L === "fr" ? "Brouillon IA — Relecture enseignant requise" : "AI Draft — Requires Teacher Review"}
                    {usedLocal && <span style={{ color: C.overlay }}>· {L === "fr" ? "mode hors-ligne" : "offline mode"}</span>}
                  </div>
                )}
                {notice && (
                  <div className="rounded-xl px-3 py-2 text-xs" style={{ background: `${C.blue}14`, color: C.blue, border: `1px solid ${C.blue}3a` }}>
                    {notice}
                  </div>
                )}

                {/* Title + meta */}
                <div className="space-y-3">
                  <input value={tp.title} onChange={(e) => editTP((t) => ({ ...t, title: e.target.value }))}
                    className="w-full bg-transparent text-xl font-semibold outline-none" style={{ color: C.text }} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill color={profile?.color ?? C.mauve}>{profile?.icon} {profile?.label}</Pill>
                    <Pill color={DIFF[tp.difficulty].color}><BarChart3 size={12} /> {DIFF[tp.difficulty].label[L]}</Pill>
                    <Pill color={C.peach}><Clock size={12} /> {tp.estimatedMinutes} min</Pill>
                    <Pill color={C.blue}><ListChecks size={12} /> {tp.steps.length} {L === "fr" ? "étapes" : "steps"}</Pill>
                    {tp.antiCheat && <Pill color={C.green}><ShieldCheck size={12} /> Anti-cheat</Pill>}
                  </div>
                  <textarea value={tp.description} onChange={(e) => editTP((t) => ({ ...t, description: e.target.value }))}
                    rows={2} className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.subtext }} />
                  <div className="flex gap-2">
                    <input value={tp.field} onChange={(e) => editTP((t) => ({ ...t, field: e.target.value }))}
                      placeholder={L === "fr" ? "Module / discipline" : "Module / field"}
                      className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none" style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.text }} />
                    <input type="number" value={tp.estimatedMinutes} onChange={(e) => editTP((t) => ({ ...t, estimatedMinutes: Number(e.target.value) || 0 }))}
                      className="w-24 rounded-lg px-3 py-1.5 text-sm outline-none" style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.text }} />
                  </div>
                </div>

                {/* Context */}
                <SectionCard icon={ScrollText} color={C.teal} title={L === "fr" ? "Contexte / Problème" : "Context / Problem"}
                  action={<RegenButton busy={regen === "context"} onClick={() => regenerate("context")} lang={L} />}>
                  <textarea value={tp.content.context} onChange={(e) => editContent("context", e.target.value)} rows={3}
                    className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none" style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.text }} />
                </SectionCard>

                {/* Objectives + Prerequisites */}
                <div className="grid gap-4 md:grid-cols-2">
                  <SectionCard icon={Target} color={C.mauve} title={L === "fr" ? "Objectifs pédagogiques" : "Learning objectives"}
                    action={<RegenButton busy={regen === "objectives"} onClick={() => regenerate("objectives")} lang={L} />}>
                    <ListEditor items={tp.content.objectives} onChange={(v) => editContent("objectives", v)} lang={L} placeholder={L === "fr" ? "Objectif" : "Objective"} />
                  </SectionCard>
                  <SectionCard icon={Boxes} color={C.blue} title={L === "fr" ? "Prérequis" : "Prerequisites"}
                    action={<RegenButton busy={regen === "prerequisites"} onClick={() => regenerate("prerequisites")} lang={L} />}>
                    <ListEditor items={tp.content.prerequisites} onChange={(v) => editContent("prerequisites", v)} lang={L} placeholder={L === "fr" ? "Prérequis" : "Prerequisite"} />
                  </SectionCard>
                </div>

                {/* Tools */}
                <SectionCard icon={Wrench} color={C.peach} title={L === "fr" ? "Outils / Environnement" : "Required tools / Environment"}
                  action={<RegenButton busy={regen === "tools"} onClick={() => regenerate("tools")} lang={L} />}>
                  <ListEditor items={tp.content.tools} onChange={(v) => editContent("tools", v)} lang={L} placeholder={L === "fr" ? "Outil" : "Tool"} />
                </SectionCard>

                {/* Starter code */}
                <SectionCard icon={Terminal} color={C.yellow}
                  title={L === "fr" ? `Code de départ (${profile?.label})` : `Starter code (${profile?.label})`}
                  action={<RegenButton busy={regen === "starter"} onClick={() => regenerate("starter")} lang={L} />}>
                  <textarea value={tp.starterHTML} onChange={(e) => editTP((t) => ({ ...t, starterHTML: e.target.value }))} rows={8} spellCheck={false}
                    className="font-mono w-full resize-none rounded-xl px-3 py-2.5 text-xs leading-relaxed outline-none"
                    style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.green }} />
                </SectionCard>

                {/* Steps */}
                <SectionCard icon={ListChecks} color={C.mauve} title={L === "fr" ? "Étapes & QCM" : "Steps & quiz"}
                  action={
                    <div className="flex items-center gap-1.5">
                      <RegenButton busy={regen === "quiz"} onClick={() => regenerate("quiz")} lang={L} />
                      <RegenButton busy={regen === "steps"} onClick={() => regenerate("steps")} lang={L} />
                      <button onClick={() => editTP((t) => ({ ...t, steps: [...t.steps, { id: uid(), title: "", instructions: "", requiredTags: [], quiz: [] }] }))}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium" style={{ background: `${C.mauve}1f`, color: C.mauve }}>
                        <Plus size={12} /> {L === "fr" ? "Étape" : "Step"}
                      </button>
                    </div>
                  }>
                  <div className="space-y-2.5">
                    {tp.steps.map((s, i) => (
                      <StepCard key={s.id} step={s} index={i} lang={L} reqLabel={reqLabel}
                        onChange={(ns) => editTP((t) => ({ ...t, steps: t.steps.map((x, xi) => (xi === i ? ns : x)) }))}
                        onRemove={() => editTP((t) => ({ ...t, steps: t.steps.filter((_, xi) => xi !== i) }))} />
                    ))}
                  </div>
                </SectionCard>

                {/* Expected output + Constraints */}
                <div className="grid gap-4 md:grid-cols-2">
                  <SectionCard icon={Code2} color={C.green} title={L === "fr" ? "Sortie attendue" : "Expected output"}
                    action={<RegenButton busy={regen === "expectedOutput"} onClick={() => regenerate("expectedOutput")} lang={L} />}>
                    <textarea value={tp.content.expectedOutput} onChange={(e) => editContent("expectedOutput", e.target.value)} rows={3}
                      className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none" style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: C.text }} />
                  </SectionCard>
                  <SectionCard icon={ShieldCheck} color={C.red} title={L === "fr" ? "Contraintes" : "Constraints"}
                    action={<RegenButton busy={regen === "constraints"} onClick={() => regenerate("constraints")} lang={L} />}>
                    <ListEditor items={tp.content.constraints} onChange={(v) => editContent("constraints", v)} lang={L} placeholder={L === "fr" ? "Contrainte" : "Constraint"} />
                  </SectionCard>
                </div>

                {/* Evaluation rubric */}
                <SectionCard icon={Gauge} color={C.yellow} title={L === "fr" ? "Critères d'évaluation (barème)" : "Evaluation criteria (rubric)"}
                  action={<RegenButton busy={regen === "evaluationCriteria"} onClick={() => regenerate("evaluationCriteria")} lang={L} />}>
                  <RubricEditor items={tp.content.evaluationCriteria} onChange={(v) => editContent("evaluationCriteria", v)} lang={L} />
                </SectionCard>

                {/* Bonus */}
                <SectionCard icon={Trophy} color={C.teal} title={L === "fr" ? "Défis bonus / Extensions" : "Bonus challenges / Extensions"}
                  action={<RegenButton busy={regen === "bonus"} onClick={() => regenerate("bonus")} lang={L} />}>
                  <ListEditor items={tp.content.bonus} onChange={(v) => editContent("bonus", v)} lang={L} placeholder={L === "fr" ? "Bonus" : "Bonus"} />
                </SectionCard>

                {/* Action bar */}
                <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-2 border-t px-5 pb-1 pt-4 md:-mx-6 md:px-6"
                  style={{ borderColor: C.surface1, background: C.surface0 }}>
                  <button onClick={enhance} disabled={enhancing}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold"
                    style={{ background: `linear-gradient(135deg, ${C.peach}, ${C.yellow})`, color: C.base, opacity: enhancing ? 0.7 : 1 }}>
                    {enhancing ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
                    {L === "fr" ? "Améliorer le TP" : "Enhance TP"}
                  </button>
                  <button onClick={exportJSON}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-medium"
                    style={{ background: C.mantle, border: `1px solid ${C.surface1}`, color: copied ? C.green : C.subtext }}>
                    {copied ? <Check size={14} /> : <Download size={14} />} {copied ? (L === "fr" ? "Copié" : "Copied") : "Export JSON"}
                  </button>
                  <button onClick={handlePublish} disabled={published}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all"
                    style={{
                      background: published ? C.surface1 : `linear-gradient(135deg, ${C.green}, ${C.teal})`,
                      color: published ? C.overlay : C.base, cursor: published ? "not-allowed" : "pointer",
                    }}>
                    {published
                      ? (<><Check size={15} /> {L === "fr" ? "Publié !" : "Published!"}</>)
                      : (<><FileCheck2 size={15} /> {L === "fr" ? "Approuver & Publier" : "Approve & Publish"}</>)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
