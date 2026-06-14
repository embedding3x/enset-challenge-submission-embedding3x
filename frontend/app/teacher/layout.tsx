import type { Metadata } from "next";
import RequireRole from "@/components/auth/RequireRole";

export const metadata: Metadata = {
  title: "Teacher | Agentic TP Platform",
};

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole role="teacher">{children}</RequireRole>;
}
