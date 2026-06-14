import { authService } from "./authService";

/**
 * Analytics service — reads the Kafka-fed agent_events data exposed by
 * tp-service (/api/analytics/*) through the API gateway. Used by the
 * teacher dashboard for live platform-level stats.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export interface AnalyticsSummary {
  interactions: number;
  progressUpdates: number;
  quizzesCompleted: number;
}

export interface AgentEvent {
  id: string;
  topic: string;
  type?: string;
  sessionId?: string;
  tpId?: string;
  payloadJson?: string;
  receivedAt: string;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = authService.getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { headers: headers() });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export const analyticsService = {
  getSummary(): Promise<AnalyticsSummary> {
    return getJson<AnalyticsSummary>("/api/analytics/summary", {
      interactions: 0,
      progressUpdates: 0,
      quizzesCompleted: 0,
    });
  },

  getLatestEvents(topic?: string): Promise<AgentEvent[]> {
    const qs = topic ? `?topic=${encodeURIComponent(topic)}` : "";
    return getJson<AgentEvent[]>(`/api/analytics/events${qs}`, []);
  },
};
