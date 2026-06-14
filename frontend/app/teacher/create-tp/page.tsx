"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { tpService } from "@/services/tpService";
import { TP, TPStep, QuizQuestion } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const emptyQuestion = (): QuizQuestion => ({
  id: uid(),
  question: "",
  options: [
    { id: "a", text: "" },
    { id: "b", text: "" },
    { id: "c", text: "" },
    { id: "d", text: "" },
  ],
  correctId: "a",
  explanation: "",
});

const emptyStep = (): TPStep => ({
  id: uid(),
  title: "",
  instructions: "",
  requiredTags: [],
  quiz: [emptyQuestion()],
});

// ─── Sub-components ───────────────────────────────────────────────────────────
function StepEditor({
  step,
  index,
  onChange,
  onRemove,
}: {
  step: TPStep;
  index: number;
  onChange: (s: TPStep) => void;
  onRemove: () => void;
}) {
  const [tagInput, setTagInput] = useState("");

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/[<>]/g, "");
    if (t && !step.requiredTags.includes(t)) {
      onChange({ ...step, requiredTags: [...step.requiredTags, t] });
    }
    setTagInput("");
  };

  const removeTag = (tag: string) =>
    onChange({
      ...step,
      requiredTags: step.requiredTags.filter((t) => t !== tag),
    });

  const updateQuestion = (qi: number, q: QuizQuestion) => {
    const quiz = [...step.quiz];
    quiz[qi] = q;
    onChange({ ...step, quiz });
  };

  return (
    <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f4c] p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-[#c084fc]">Step {index + 1}</h3>
        <button
          onClick={onRemove}
          className="text-xs text-[#f87171] hover:text-white transition-colors"
        >
          Remove
        </button>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className="text-sm text-[#b6bdd9] block mb-1">
            Step Title
          </label>
          <input
            value={step.title}
            onChange={(e) => onChange({ ...step, title: e.target.value })}
            className="w-full bg-[#2a2f4c] rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:ring-1 focus:ring-[#c084fc] border border-[#4a5170] placeholder:text-[#8b92b2]"
            placeholder="e.g. Add a Heading"
          />
        </div>

        {/* Instructions */}
        <div>
          <label className="text-sm text-[#b6bdd9] block mb-1">
            Instructions
          </label>
          <textarea
            value={step.instructions}
            onChange={(e) =>
              onChange({ ...step, instructions: e.target.value })
            }
            rows={3}
            className="w-full bg-[#2a2f4c] rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:ring-1 focus:ring-[#c084fc] border border-[#4a5170] resize-none placeholder:text-[#8b92b2]"
            placeholder="Describe what the student needs to do..."
          />
        </div>

        {/* Required tags */}
        <div>
          <label className="text-sm text-[#b6bdd9] block mb-1">
            Required HTML Tags (for validation)
          </label>
          <div className="flex gap-2">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
              className="flex-1 bg-[#2a2f4c] rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:ring-1 focus:ring-[#c084fc] border border-[#4a5170] placeholder:text-[#8b92b2]"
              placeholder="e.g. h1, p, button"
            />
            <button
              onClick={addTag}
              className="px-4 py-2 rounded-xl bg-[#4a5170] text-white text-sm hover:bg-[#585b70] transition-colors"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {step.requiredTags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#2a2f4c] text-[#c084fc] text-xs font-mono border border-[#4a5170]"
              >
                &lt;{tag}&gt;
                <button
                  onClick={() => removeTag(tag)}
                  className="text-[#f87171] hover:text-white"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Quiz questions */}
        <div>
          <label className="text-sm text-[#b6bdd9] block mb-2">
            Quiz Questions
          </label>
          <div className="space-y-3">
            {step.quiz.map((q, qi) => (
              <QuestionEditor
                key={q.id}
                question={q}
                index={qi}
                onChange={(updated) => updateQuestion(qi, updated)}
                onRemove={() => {
                  const quiz = step.quiz.filter((_, i) => i !== qi);
                  onChange({ ...step, quiz });
                }}
              />
            ))}
          </div>
          <button
            onClick={() =>
              onChange({ ...step, quiz: [...step.quiz, emptyQuestion()] })
            }
            className="mt-3 text-xs text-[#60a5fa] hover:text-white transition-colors"
          >
            + Add question
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionEditor({
  question,
  index,
  onChange,
  onRemove,
}: {
  question: QuizQuestion;
  index: number;
  onChange: (q: QuizQuestion) => void;
  onRemove: () => void;
}) {
  return (
    <div className="bg-[#181b2b] rounded-xl border border-[#2a2f4c] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[#8b92b2]">Question {index + 1}</span>
        <button
          onClick={onRemove}
          className="text-xs text-[#f87171] hover:text-white"
        >
          Remove
        </button>
      </div>
      <input
        value={question.question}
        onChange={(e) => onChange({ ...question, question: e.target.value })}
        className="w-full bg-[#1e2235] rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-1 focus:ring-[#c084fc] border border-[#2a2f4c] placeholder:text-[#4a5170] mb-3"
        placeholder="Question text..."
      />
      <div className="grid grid-cols-2 gap-2 mb-3">
        {question.options.map((opt) => (
          <div key={opt.id} className="flex items-center gap-2">
            <button
              onClick={() => onChange({ ...question, correctId: opt.id })}
              className={`w-5 h-5 rounded-full border shrink-0 transition-colors ${
                question.correctId === opt.id
                  ? "border-[#34d399] bg-[#34d399]"
                  : "border-[#4a5170]"
              }`}
            />
            <input
              value={opt.text}
              onChange={(e) => {
                const options = question.options.map((o) =>
                  o.id === opt.id ? { ...o, text: e.target.value } : o
                );
                onChange({ ...question, options });
              }}
              className="flex-1 bg-[#1e2235] rounded-lg px-2 py-1.5 text-white text-xs outline-none focus:ring-1 focus:ring-[#c084fc] border border-[#2a2f4c] placeholder:text-[#4a5170]"
              placeholder={`Option ${opt.id.toUpperCase()}`}
            />
          </div>
        ))}
      </div>
      <input
        value={question.explanation}
        onChange={(e) =>
          onChange({ ...question, explanation: e.target.value })
        }
        className="w-full bg-[#1e2235] rounded-lg px-3 py-2 text-[#b6bdd9] text-xs outline-none focus:ring-1 focus:ring-[#c084fc] border border-[#2a2f4c] placeholder:text-[#4a5170]"
        placeholder="Explanation shown after quiz submit..."
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CreateTPPage() {
  const { user, isTeacher, logout } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [field, setField] = useState("Développement Web");
  const [difficulty, setDifficulty] = useState<TP["difficulty"]>("beginner");
  const [estimatedMinutes, setEstimatedMinutes] = useState(20);
  const [starterHTML, setStarterHTML] = useState(
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>My Page</title>\n</head>\n<body>\n  <!-- Write your code below -->\n\n</body>\n</html>`
  );
  const [steps, setSteps] = useState<TPStep[]>([emptyStep()]);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);

  const updateStep = (i: number, s: TPStep) => {
    const next = [...steps];
    next[i] = s;
    setSteps(next);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert("Please add a title.");
      return;
    }
    const tp: TP = {
      id: uid(),
      title,
      description,
      field: field.trim() || "Général",
      difficulty,
      estimatedMinutes,
      starterHTML,
      steps: steps.filter((s) => s.title.trim()),
      createdBy: user!.id,
      createdAt: new Date().toISOString(),
    };
    const created = await tpService.saveTP(tp);
    if (!created) { alert("Could not save the TP. Is the backend running?"); return; }
    setSaved(true);
    setTimeout(() => router.push("/teacher/dashboard"), 1200);
  };

  if (!isTeacher) return null;

  return (
    <div className="min-h-screen bg-[#141724]">
      {/* Nav */}
      <nav className="bg-[#181b2b] border-b border-[#2a2f4c] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/teacher/dashboard" className="text-[#8b92b2] hover:text-white transition-colors text-sm">
            ← Dashboard
          </Link>
          <span className="text-[#2a2f4c]">/</span>
          <span className="text-white text-sm font-medium">Create TP</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPreview(!preview)}
            className="px-3 py-1.5 rounded-lg bg-[#2a2f4c] text-[#b6bdd9] text-sm hover:bg-[#4a5170] transition-colors"
          >
            {preview ? "✏️ Edit" : "👁 Preview"}
          </button>
          <button
            onClick={handleSave}
            className={`px-4 py-1.5 rounded-lg font-semibold text-sm transition-all ${
              saved
                ? "bg-[#34d399] text-[#141724]"
                : "bg-gradient-to-r from-[#c084fc] to-[#60a5fa] text-[#141724] hover:opacity-90"
            }`}
          >
            {saved ? "✅ Saved!" : "Save TP"}
          </button>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Create a new TP</h1>
          <p className="text-[#8b92b2] mt-1">
            Define the instructions, starter code, steps, and quiz questions.
          </p>
        </div>

        {/* Meta */}
        <div className="bg-[#181b2b] rounded-2xl border border-[#2a2f4c] p-6 space-y-4">
          <h2 className="font-semibold text-white">📋 TP Details</h2>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-[#1e2235] rounded-xl px-4 py-3 text-white text-lg font-semibold outline-none focus:ring-1 focus:ring-[#c084fc] border border-[#2a2f4c] placeholder:text-[#4a5170]"
            placeholder="TP Title"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-[#1e2235] rounded-xl px-4 py-2.5 text-[#b6bdd9] text-sm outline-none focus:ring-1 focus:ring-[#c084fc] border border-[#2a2f4c] resize-none placeholder:text-[#4a5170]"
            placeholder="Short description for students..."
          />
          <div>
            <label className="text-xs text-[#8b92b2] block mb-1">
              Field / Module
            </label>
            <input
              value={field}
              onChange={(e) => setField(e.target.value)}
              list="tp-field-options"
              className="w-full bg-[#1e2235] rounded-xl px-3 py-2 text-white text-sm outline-none border border-[#2a2f4c] focus:ring-1 focus:ring-[#c084fc] placeholder:text-[#4a5170]"
              placeholder="e.g. Développement Web"
            />
            <datalist id="tp-field-options">
              <option value="Développement Web" />
              <option value="Design & CSS" />
              <option value="JavaScript" />
              <option value="Base de données" />
            </datalist>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs text-[#8b92b2] block mb-1">
                Difficulty
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as TP["difficulty"])}
                className="w-full bg-[#1e2235] rounded-xl px-3 py-2 text-white text-sm outline-none border border-[#2a2f4c] focus:ring-1 focus:ring-[#c084fc]"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-[#8b92b2] block mb-1">
                Estimated time (min)
              </label>
              <input
                type="number"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                className="w-full bg-[#1e2235] rounded-xl px-3 py-2 text-white text-sm outline-none border border-[#2a2f4c] focus:ring-1 focus:ring-[#c084fc]"
              />
            </div>
          </div>
        </div>

        {/* Starter HTML */}
        <div className="bg-[#181b2b] rounded-2xl border border-[#2a2f4c] p-6">
          <h2 className="font-semibold text-white mb-3">
            🗂 Starter HTML
          </h2>
          <p className="text-xs text-[#8b92b2] mb-3">
            This is the initial code students will see when opening the TP.
          </p>
          <div className="bg-[#1e2235] rounded-xl border border-[#2a2f4c] overflow-hidden">
            <div className="px-4 py-2 bg-[#2a2f4c] flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#f87171]" />
              <span className="w-3 h-3 rounded-full bg-[#fbbf24]" />
              <span className="w-3 h-3 rounded-full bg-[#34d399]" />
              <span className="text-xs text-[#8b92b2] ml-2 font-mono">
                index.html
              </span>
            </div>
            <textarea
              value={starterHTML}
              onChange={(e) => setStarterHTML(e.target.value)}
              rows={12}
              className="w-full bg-transparent px-4 py-3 text-[#e2e8f0] font-mono text-sm outline-none resize-none"
              spellCheck={false}
            />
          </div>
          {preview && (
            <div className="mt-4">
              <p className="text-xs text-[#8b92b2] mb-2">Preview:</p>
              <iframe
                srcDoc={starterHTML}
                className="w-full h-48 bg-white rounded-xl border border-[#2a2f4c]"
                sandbox="allow-scripts"
                title="HTML Preview"
              />
            </div>
          )}
        </div>

        {/* Steps */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">🪜 Steps</h2>
            <button
              onClick={() => setSteps([...steps, emptyStep()])}
              className="text-sm text-[#60a5fa] hover:text-white transition-colors"
            >
              + Add step
            </button>
          </div>
          {steps.map((step, i) => (
            <StepEditor
              key={step.id}
              step={step}
              index={i}
              onChange={(s) => updateStep(i, s)}
              onRemove={() => setSteps(steps.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>

        <button
          onClick={handleSave}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#c084fc] to-[#60a5fa] text-[#141724] font-bold text-lg hover:opacity-90 transition-opacity"
        >
          {saved ? "✅ Saved!" : "Save TP"}
        </button>
      </div>
    </div>
  );
}
