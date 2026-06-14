"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types";

/**
 * Route guard for an entire segment (used by app/student/layout.tsx and
 * app/teacher/layout.tsx). Waits for the auth session to hydrate from
 * localStorage before deciding, so a page refresh never bounces a
 * logged-in user back to /login.
 */
export default function RequireRole({
  role,
  children,
}: {
  role: UserRole;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (user.role !== role) {
      router.replace(user.role === "teacher" ? "/teacher/dashboard" : "/student/dashboard");
    }
  }, [loading, user, role, router]);

  if (loading || !user || user.role !== role) {
    return (
      <div className="min-h-screen bg-appbg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-textmuted">
          <div className="h-8 w-8 rounded-full border-2 border-panelborder border-t-primary animate-spin" />
          <p className="text-sm">Loading your session…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
