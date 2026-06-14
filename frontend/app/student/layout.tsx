import type { Metadata } from "next";
import RequireRole from "@/components/auth/RequireRole";

export const metadata: Metadata = {
  title: "Student | Agentic TP Platform",
};

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole role="student">{children}</RequireRole>;
}
