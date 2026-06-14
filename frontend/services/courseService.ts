/**
 * Course service — talks to the standalone RAG service, which owns course
 * document upload, embedding/indexation (pgvector) and similarity search.
 * Keeps all course API calls out of the page components.
 */

const RAG_BASE =
  process.env.NEXT_PUBLIC_RAG_SERVICE_URL ?? "http://localhost:8005";

export interface Course {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  status: "indexing" | "indexed" | "error";
  chunks?: number;
  excerpt?: string;
  subject?: string;
  error?: string;
}

export interface CourseSearchHit {
  course_id: string;
  course_name: string;
  content: string;
  score: number;
}

export const courseService = {
  async list(): Promise<Course[]> {
    const res = await fetch(`${RAG_BASE}/api/rag/courses`);
    if (!res.ok) throw new Error(`Failed to list courses [${res.status}]`);
    const data = await res.json();
    return Array.isArray(data.courses) ? (data.courses as Course[]) : [];
  },

  /** Upload + index one document. Returns the indexed course record. */
  async upload(file: File, courseId?: string): Promise<Course> {
    const formData = new FormData();
    formData.append("file", file);
    if (courseId) formData.append("course_id", courseId);
    const res = await fetch(`${RAG_BASE}/api/rag/courses/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload failed [${res.status}]`);
    const { course } = await res.json();
    return course as Course;
  },

  async reindex(id: string): Promise<Course> {
    const res = await fetch(`${RAG_BASE}/api/rag/courses/${id}/reindex`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`Reindex failed [${res.status}]`);
    const { course } = await res.json();
    return course as Course;
  },

  async remove(id: string): Promise<void> {
    await fetch(`${RAG_BASE}/api/rag/courses/${id}`, { method: "DELETE" });
  },

  async search(query: string, courseIds?: string[], k = 5): Promise<CourseSearchHit[]> {
    const res = await fetch(`${RAG_BASE}/api/rag/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, course_ids: courseIds ?? [], k }),
    });
    if (!res.ok) throw new Error(`Search failed [${res.status}]`);
    const data = await res.json();
    return (data.results ?? []) as CourseSearchHit[];
  },
};
