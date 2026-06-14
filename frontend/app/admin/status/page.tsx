"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { agentService, PlatformStatus, ServiceStatus } from "@/services/agentService";
import {
  getEvaluationSettings,
  setEvaluationSettings,
  EvaluationSettings,
} from "@/lib/evaluationSettings";

const DOT: Record<ServiceStatus["status"], string> = {
  up: "#34d399",
  degraded: "#fbbf24",
  down: "#f87171",
};

const KIND_LABEL: Record<string, string> = {
  gateway: "Agent Gateway",
  "llm-agent": "AI Agent",
  "llm-backend": "LLM Backend",
  sandbox: "Execution Sandbox",
  validation: "Validation",
  rag: "RAG",
};

export default function AdminStatusPage() {
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<EvaluationSettings>({
    failedRunThreshold: 5,
    failedRunPenaltyPercent: 5,
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await agentService.getPlatformStatus());
      setError(null);
    } catch (e) {
      setError("Could not reach the agent gateway at all — it is offline.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSettings(getEvaluationSettings());
    refresh();
    const t = setInterval(refresh, 10000); // auto-refresh every 10s
    return () => clearInterval(t);
  }, [refresh]);

  const saveSettings = (patch: Partial<EvaluationSettings>) => {
    setSettings(setEvaluationSettings(patch));
  };

  const overallColor =
    status?.overall === "ok" ? "#34d399" : status?.overall === "degraded" ? "#fbbf24" : "#f87171";

  return (
    <div className="min-h-screen bg-[#141724] text-[#e2e8f0] p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/teacher/dashboard" className="text-[#8b92b2] hover:text-white text-sm">
              ← Dashboard
            </Link>
            <span className="text-[#2a2f4c]">/</span>
            <h1 className="text-lg font-semibold">Platform Status</h1>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-[#2a2f4c] text-[#b6bdd9] text-sm hover:bg-[#4a5170] disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>

        {/* Overall banner */}
        <div
          className="rounded-2xl border p-4 mb-6 flex items-center gap-3"
          style={{ borderColor: `${overallColor}55`, background: `${overallColor}14` }}
        >
          <span className="h-3 w-3 rounded-full" style={{ background: overallColor }} />
          <span className="font-medium" style={{ color: overallColor }}>
            {error ? "Gateway offline" : `Overall: ${status?.overall ?? "…"}`}
          </span>
          {status?.checked_at && (
            <span className="text-xs text-[#8b92b2] ml-auto">
              checked {new Date(status.checked_at).toLocaleTimeString()}
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-[#f87171] bg-[#2d1b1b] p-4 mb-6 text-sm text-[#fb923c]">
            {error} Start it with <code className="text-[#f87171]">./start.sh</code> or check{" "}
            <code className="text-[#f87171]">logs/agent-gateway.log</code>.
          </div>
        )}

        {/* Services grid */}
        <div className="grid gap-3 sm:grid-cols-2 mb-8">
          {(status?.services ?? []).map((s) => (
            <div
              key={s.name}
              className="rounded-2xl border border-[#2a2f4c] bg-[#181b2b] p-4 flex items-start gap-3"
            >
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: DOT[s.status] }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{s.name}</span>
                  <span className="text-[10px] uppercase tracking-wide text-[#8b92b2]">
                    {KIND_LABEL[s.kind] ?? s.kind}
                  </span>
                </div>
                <div className="text-xs text-[#8b92b2] mt-0.5">
                  {s.status} · {s.latency_ms}ms{s.model ? ` · ${s.model}` : ""}
                </div>
                {s.error && <div className="text-xs text-[#f87171] mt-1 truncate">{s.error}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Evaluation settings */}
        <h2 className="text-sm font-semibold text-[#b6bdd9] uppercase tracking-wide mb-3">
          Evaluation settings
        </h2>
        <div className="rounded-2xl border border-[#2a2f4c] bg-[#181b2b] p-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-[#8b92b2] block mb-1">Failed-run penalty threshold</span>
            <input
              type="number"
              min={0}
              value={settings.failedRunThreshold}
              onChange={(e) => saveSettings({ failedRunThreshold: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full bg-[#1e2235] rounded-lg px-3 py-2 text-sm outline-none border border-[#2a2f4c] focus:ring-1 focus:ring-[#c084fc]"
            />
            <span className="text-[11px] text-[#8b92b2]">Penalty applies when failed runs exceed this.</span>
          </label>
          <label className="block">
            <span className="text-xs text-[#8b92b2] block mb-1">Penalty (% of final score)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={settings.failedRunPenaltyPercent}
              onChange={(e) => saveSettings({ failedRunPenaltyPercent: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full bg-[#1e2235] rounded-lg px-3 py-2 text-sm outline-none border border-[#2a2f4c] focus:ring-1 focus:ring-[#c084fc]"
            />
            <span className="text-[11px] text-[#8b92b2]">
              Currently: more than {settings.failedRunThreshold} failed runs → −{settings.failedRunPenaltyPercent}%.
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
