"use client";

import React from "react";
import Image from "next/image";
import { TP } from "@/types";
import ExplanationChat from "@/components/agents/ExplanationChat";

interface TPExplanationProps {
  tp: TP;
  stepIndex: number;
  onStart: () => void;
}

export default function TPExplanation({ tp, stepIndex, onStart }: TPExplanationProps) {
  const step = tp.steps[stepIndex];

  return (
    <div className="flex h-full bg-appbg">
      {/* Left: Step overview */}
      <div className="flex-1 overflow-y-auto p-8 border-r border-panelborder">
        <div className="max-w-2xl mx-auto">
          {/* AI assistant intro — the chatbot greets the student at each step */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative shrink-0">
              <Image
                src="/chatbot-logo.png"
                alt="AI Assistant"
                width={56}
                height={58}
                className="w-14 h-14 rounded-full object-cover ring-2 ring-primary/60 shadow-lg shadow-primary/30"
              />
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-appbg" />
            </div>
            <div>
              <p className="text-xs text-textmuted uppercase tracking-widest">
                Explanation Agent · Mistral
              </p>
              <p className="text-sm text-textlight font-medium">
                Step {stepIndex + 1} of {tp.steps.length}: {step.title}
              </p>
            </div>
          </div>

          {/* Step instructions */}
          <div className="bg-panelbg border border-panelborder rounded-2xl p-6 mb-6">
            <h2 className="font-serif text-lg font-semibold text-white mb-3">{step.title}</h2>
            <p className="text-textlight text-sm leading-relaxed">{step.instructions}</p>
          </div>

          {/* Required tags */}
          <div className="p-4 rounded-xl bg-navactive border border-panelborder mb-8">
            <p className="text-xs text-textmuted uppercase tracking-wider mb-2">
              Required HTML elements
            </p>
            <div className="flex flex-wrap gap-2">
              {step.requiredTags.map((tag) => (
                <code
                  key={tag}
                  className="px-2 py-1 rounded bg-paneldark text-purple-300 text-sm font-mono border border-panelborder"
                >
                  &lt;{tag}&gt;
                </code>
              ))}
            </div>
          </div>

          <button
            onClick={onStart}
            className="w-full py-4 rounded-xl btn-gradient font-bold text-lg glow-button"
          >
            Start Coding
          </button>
        </div>
      </div>

      {/* Right: AI Explanation Chat (real agent) */}
      <div className="w-[420px] shrink-0 flex flex-col p-4">
        <ExplanationChat tp={tp} step={step} />
      </div>
    </div>
  );
}
