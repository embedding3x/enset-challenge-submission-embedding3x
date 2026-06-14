"use client";

import React, { useRef, useEffect } from "react";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** When true (teacher's TP setting), paste / drop / context menu are blocked. */
  antiCheat?: boolean;
  placeholder?: string;
}

export default function CodeEditor({
  value,
  onChange,
  disabled = false,
  antiCheat = true,
  placeholder = "<!-- Write your HTML here -->",
}: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const block = (e: React.SyntheticEvent) => e.preventDefault();

  return (
    <div className="relative h-full flex flex-col bg-[#1e2235] rounded-lg overflow-hidden border border-[#2a2f4c]">
      {/* Editor header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#181b2b] border-b border-[#2a2f4c]">
        <span className="w-3 h-3 rounded-full bg-[#f87171]" />
        <span className="w-3 h-3 rounded-full bg-[#fb923c]" />
        <span className="w-3 h-3 rounded-full bg-[#34d399]" />
        <span className="ml-3 text-xs text-[#8b92b2] font-mono">
          index.html
        </span>
        {disabled && (
          <span className="ml-auto text-xs text-[#f87171] font-mono">
            READ ONLY
          </span>
        )}
      </div>

      {/* Line numbers + editor */}
      <div className="flex flex-1 overflow-auto">
        {/* Line numbers */}
        <div className="select-none px-3 py-4 text-right text-[#4a5170] font-mono text-sm leading-6 bg-[#1e2235] min-w-[3rem]">
          {value.split("\n").map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          // Anti-cheat (only when enabled on the TP): no paste, drop, or context menu
          onPaste={antiCheat ? block : undefined}
          onDrop={antiCheat ? block : undefined}
          onContextMenu={antiCheat ? block : undefined}
          className={`
            flex-1 resize-none bg-transparent text-[#e2e8f0] font-mono text-sm
            leading-6 py-4 pr-4 outline-none caret-[#c084fc]
            placeholder:text-[#4a5170]
            ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-text"}
          `}
          style={{ tabSize: 2 }}
        />
      </div>

      {/* Anti-cheat notice */}
      {antiCheat && (
        <div className="px-4 py-1.5 bg-[#181b2b] border-t border-[#2a2f4c] flex items-center gap-2">
          <span className="text-[10px] text-[#f87171] font-mono tracking-wide">
            ⚠ PASTE DISABLED — Type your code manually
          </span>
        </div>
      )}
    </div>
  );
}
