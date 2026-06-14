"use client";

import React, { useState } from "react";
import { executionService, ExecutionResult, ExecutionError } from "@/services/executionService";
import { getLanguage } from "@/lib/languages";

interface RunConsoleProps {
  code: string;
  /** Language id understood by the executor (java, python, cpp…). */
  language: string;
  /**
   * Reports a genuine code execution outcome (not infra failures) so the IDE can
   * track run attempts for the penalty system and feed errors to the hint agent.
   * `ran` is false for sandbox/gateway errors, which must not count.
   */
  onRun?: (outcome: { ran: boolean; ok: boolean; errorOutput?: string }) => void;
}

/**
 * Per-language "live display" for non-web TPs: runs the student's code in a
 * sandbox and shows stdout / stderr / compiler output, terminal-style — with a
 * precise reason when the sandbox itself is the problem.
 */
export default function RunConsole({ code, language, onRun }: RunConsoleProps) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<{ kind: string; message: string } | null>(null);
  const [stdin, setStdin] = useState("");
  const [showStdin, setShowStdin] = useState(false);

  const profile = getLanguage(language);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await executionService.run({ language, code, stdin });
      setResult(r);
      const errorOutput = r.kind === "success" ? "" : (r.compile_output || r.stderr || "");
      onRun?.({ ran: true, ok: r.kind === "success", errorOutput });
    } catch (e) {
      if (e instanceof ExecutionError) {
        setError({ kind: e.kind, message: e.message });
      } else {
        setError({ kind: "unknown", message: "Unexpected error while running your code." });
      }
      // Infra failures do not count as a failed student attempt.
      onRun?.({ ran: false, ok: false });
    } finally {
      setRunning(false);
    }
  };

  const hasCompileError = result?.kind === "compile_error";
  const isRuntimeError = result?.kind === "runtime_error";

  return (
    <div className="relative h-full flex flex-col rounded-lg overflow-hidden border border-[#2a2f4c] bg-[#0f1117]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#181b2b] border-b border-[#2a2f4c] shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#f87171]" />
          <span className="w-3 h-3 rounded-full bg-[#fbbf24]" />
          <span className="w-3 h-3 rounded-full bg-[#34d399]" />
        </div>
        <span className="text-xs text-[#8b92b2] font-mono ml-1">
          {profile?.icon} {profile?.label ?? language} · console
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowStdin((s) => !s)}
            className="text-[11px] text-[#8b92b2] hover:text-white transition-colors"
            title="Provide standard input"
          >
            stdin
          </button>
          <button
            onClick={run}
            disabled={running}
            className="px-3 py-1 rounded-md bg-[#34d399] text-[#0f1117] text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {running ? "Running…" : "▶ Run"}
          </button>
        </div>
      </div>

      {showStdin && (
        <textarea
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          rows={2}
          placeholder="Standard input (one value per line)…"
          spellCheck={false}
          className="w-full bg-[#141724] text-[#e2e8f0] font-mono text-xs px-4 py-2 outline-none border-b border-[#2a2f4c] resize-none placeholder:text-[#4a5170]"
        />
      )}

      {/* Output */}
      <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed">
        {!result && !error && !running && (
          <p className="text-[#4a5170]">
            Press <span className="text-[#34d399]">▶ Run</span> to compile &amp; execute your {profile?.label ?? language} code.
          </p>
        )}
        {running && <p className="text-[#fbbf24]">⏳ Compiling &amp; running in the sandbox…</p>}

        {/* Infra failure — the sandbox/gateway itself is the problem. */}
        {error && (
          <div>
            <p className="text-[#f87171] font-semibold">⚠ Sandbox problem ({error.kind})</p>
            <p className="text-[#fb923c] mt-1 whitespace-pre-wrap">{error.message}</p>
            <p className="text-[#8b92b2] mt-2">This is not counted as a failed attempt.</p>
          </div>
        )}

        {hasCompileError && (
          <div className="mb-2">
            <p className="text-[#f87171] font-semibold mb-1">Compilation error</p>
            <pre className="text-[#fb923c] whitespace-pre-wrap">{result!.compile_output}</pre>
          </div>
        )}
        {result?.stdout && <pre className="text-[#e2e8f0] whitespace-pre-wrap">{result.stdout}</pre>}
        {result?.stderr && <pre className="text-[#f87171] whitespace-pre-wrap mt-1">{result.stderr}</pre>}
        {result && !result.stdout && !result.stderr && !hasCompileError && (
          <p className="text-[#8b92b2]">(no output)</p>
        )}
        {result && (
          <p className={`mt-3 text-[11px] ${result.kind === "success" ? "text-[#34d399]" : "text-[#f87171]"}`}>
            ● {result.kind === "success" ? "ran successfully" : isRuntimeError ? "runtime error" : "compile error"}
            {" · "}exit {result.exit_code} · {profile?.label ?? language} {result.version}
            {result.elapsed_ms != null ? ` · ${result.elapsed_ms}ms` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
