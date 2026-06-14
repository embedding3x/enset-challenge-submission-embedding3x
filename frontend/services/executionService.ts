/**
 * Execution service client — runs student code in a sandbox via the agent
 * gateway (`/api/execute`, backed by Piston) and returns its output. This powers
 * the per-language "live display" in the student IDE. Web (HTML/CSS) is rendered
 * client-side in an iframe instead and does not use this service.
 *
 * The gateway returns 200 with a `kind` of success | compile_error | runtime_error,
 * or a JSON error `{ detail: { kind, message } }` (kind: timeout |
 * sandbox_unreachable | unsupported_language | sandbox_error) on infra failure.
 * We surface those precisely so the UI can tell the user the real cause.
 */

const AGENT_BASE =
  process.env.NEXT_PUBLIC_AGENT_GATEWAY_URL ?? "http://localhost:8000";

export type ExecutionKind =
  | "success"
  | "compile_error"
  | "runtime_error";

export type ExecutionErrorKind =
  | "timeout"
  | "sandbox_unreachable"
  | "unsupported_language"
  | "sandbox_error"
  | "gateway_unreachable";

export interface ExecutionResult {
  ok: boolean;
  kind: ExecutionKind;
  language: string;
  version: string;
  stdout: string;
  stderr: string;
  output: string;
  compile_output: string;
  exit_code: number;
  elapsed_ms?: number;
}

export class ExecutionError extends Error {
  kind: ExecutionErrorKind;
  status: number;
  constructor(kind: ExecutionErrorKind, message: string, status: number) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.name = "ExecutionError";
  }
}

const WEB_LANGS = new Set(["html", "css", "web"]);

const ERROR_LABELS: Record<ExecutionErrorKind, string> = {
  timeout: "The sandbox timed out while running your code.",
  sandbox_unreachable: "The execution sandbox is unreachable (check internet / PISTON_URL).",
  unsupported_language: "This language has no execution profile in the sandbox.",
  sandbox_error: "The execution sandbox rejected the request.",
  gateway_unreachable: "The agent gateway is offline — start it and try again.",
};

export const executionService = {
  /** True when a language is executed server-side (vs. rendered as a web page). */
  isRunnable(language: string | undefined | null): boolean {
    const l = (language ?? "").toLowerCase();
    return l.length > 0 && !WEB_LANGS.has(l);
  },

  label(kind: ExecutionErrorKind): string {
    return ERROR_LABELS[kind] ?? "Execution failed.";
  },

  async run(input: { language: string; code: string; stdin?: string }): Promise<ExecutionResult> {
    let res: Response;
    try {
      res = await fetch(`${AGENT_BASE}/api/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: input.language, code: input.code, stdin: input.stdin ?? "" }),
      });
    } catch {
      throw new ExecutionError("gateway_unreachable", ERROR_LABELS.gateway_unreachable, 0);
    }

    if (res.ok) return (await res.json()) as ExecutionResult;

    // Infra failure: gateway returns { detail: { kind, message } }.
    let kind: ExecutionErrorKind = "sandbox_error";
    let message = `Execution failed (HTTP ${res.status})`;
    try {
      const body = await res.json();
      const detail = body?.detail;
      if (detail && typeof detail === "object" && detail.kind) {
        kind = detail.kind as ExecutionErrorKind;
        message = detail.message || ERROR_LABELS[kind] || message;
      }
    } catch {
      /* keep defaults */
    }
    throw new ExecutionError(kind, message, res.status);
  },
};
