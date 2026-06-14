"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { TP, TPStep } from "@/types";
import { agentService, ExplainResponse } from "@/services/agentService";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  loading?: boolean;
}

interface ExplanationChatProps {
  tp: TP;
  step: TPStep;
  sessionId?: string;
}

function BotAvatar({ size = 28 }: { size?: number }) {
  return (
    <Image
      src="/chatbot-logo.png"
      alt="AI Assistant"
      width={size}
      height={size}
      className="rounded-full object-cover ring-1 ring-primary/50 shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

export default function ExplanationChat({ tp, step, sessionId }: ExplanationChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentAvailable, setAgentAvailable] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Check agent availability once on mount
  useEffect(() => {
    agentService.isAvailable().then(setAgentAvailable);
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load initial explanation when step changes
  useEffect(() => {
    if (agentAvailable !== true) return;
    loadInitialExplanation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, agentAvailable]);

  async function loadInitialExplanation() {
    const loadingId = Date.now().toString();
    setMessages([
      {
        id: loadingId,
        role: "assistant",
        content: "",
        loading: true,
      },
    ]);

    try {
      const response = await agentService.explain({
        tp_id: tp.id,
        tp_title: tp.title,
        tp_description: tp.description,
        step_id: step.id,
        step_title: step.title,
        step_instructions: step.instructions,
        required_tags: step.requiredTags,
        session_id: sessionId,
      });

      setMessages([
        {
          id: loadingId,
          role: "assistant",
          content: response.explanation,
          loading: false,
        },
      ]);
    } catch (err) {
      setMessages([
        {
          id: loadingId,
          role: "assistant",
          content: buildFallbackExplanation(step),
          loading: false,
        },
      ]);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || isLoading) return;

    const userMsgId = `user-${Date.now()}`;
    const botMsgId = `bot-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: question },
      { id: botMsgId, role: "assistant", content: "", loading: true },
    ]);
    setInput("");
    setIsLoading(true);

    try {
      let response: ExplainResponse;

      if (agentAvailable) {
        response = await agentService.explain({
          tp_id: tp.id,
          tp_title: tp.title,
          tp_description: tp.description,
          step_id: step.id,
          step_title: step.title,
          step_instructions: step.instructions,
          required_tags: step.requiredTags,
          question,
          session_id: sessionId,
        });
      } else {
        response = {
          explanation: buildFallbackAnswer(question, step),
          type: "clarification",
          agent: "fallback",
          model: "local",
        };
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId
            ? { ...m, content: response.explanation, loading: false }
            : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId
            ? {
                ...m,
                content:
                  "I'm having trouble connecting right now. Please check that the AI agents are running and try again.",
                loading: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-paneldark rounded-xl border border-panelborder">
      {/* Header */}
      <div className="px-4 py-3 border-b border-panelborder flex items-center gap-3">
        <BotAvatar size={34} />
        <div>
          <p className="text-sm font-medium text-white">Explanation Agent</p>
          <p className="text-xs text-textmuted">
            {agentAvailable === true
              ? "Mistral — online"
              : agentAvailable === false
              ? "Offline — using fallback"
              : "Connecting..."}
          </p>
        </div>
        <div
          className={`ml-auto w-2 h-2 rounded-full ${
            agentAvailable === true
              ? "bg-emerald-400"
              : agentAvailable === false
              ? "bg-red-400"
              : "bg-amber-400 animate-pulse"
          }`}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-textmuted text-sm py-8">
            <p>Loading explanation...</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            {msg.role === "user" ? (
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 bg-primary/20 text-purple-300">
                You
              </div>
            ) : (
              <BotAvatar size={28} />
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary/15 text-textlight rounded-tr-sm"
                  : "bg-panelbg text-textlight border border-panelborder rounded-tl-sm"
              }`}
            >
              {msg.loading ? (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="p-3 border-t border-panelborder flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this step..."
          disabled={isLoading}
          className="flex-1 bg-panelbg border border-panelborder rounded-xl px-4 py-2 text-sm text-textlight placeholder-textmuted/60 outline-none focus:border-secondary transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="px-4 py-2 btn-gradient rounded-xl text-sm font-medium disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}

// ─── Fallback content when agent is unavailable ────────────────────────────────

function buildFallbackExplanation(step: TPStep): string {
  const tags = step.requiredTags.map((t) => `<${t}>`).join(", ");
  return (
    `In this step: "${step.title}", you'll practice using ${tags} elements.\n\n` +
    `${step.instructions}\n\n` +
    `Think about what each of these HTML elements is used for in real websites. ` +
    `What content do they describe? What role do they play in a page's structure?\n\n` +
    `Feel free to ask me any questions about the concepts involved!`
  );
}

function buildFallbackAnswer(question: string, step: TPStep): string {
  const tags = step.requiredTags.join(", ");
  if (question.toLowerCase().includes("code") || question.toLowerCase().includes("solution")) {
    return (
      `I'm here to guide you, not give you the answer! Try thinking about it this way: ` +
      `the goal of this step is to understand ${tags}. What do you think these elements are used for in HTML? ` +
      `What would you expect to see on a webpage that uses them?`
    );
  }
  return (
    `That's a great question! In the context of this step, think about how ${tags} ` +
    `elements are used to structure web content. The key is to understand the semantic purpose ` +
    `of each element — not just what it looks like, but what it means to the browser and to users. ` +
    `Does that help clarify things?`
  );
}
