"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface NavLink {
  label: string;
  href: string;
}

const TEACHER_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/teacher/dashboard" },
  { label: "Analytics", href: "/teacher/student-evaluation" },
  { label: "Courses", href: "/teacher/courses" },
  { label: "Assign TP", href: "/teacher/assign-tp" },
];

const STUDENT_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/student/dashboard" },
];

export default function AppNavbar() {
  const { user, logout, isTeacher } = useAuth();
  const pathname = usePathname();
  const links = isTeacher ? TEACHER_LINKS : STUDENT_LINKS;
  const home = isTeacher ? "/teacher/dashboard" : "/student/dashboard";

  return (
    <header className="sticky top-0 z-50 border-b border-panelborder bg-appbg/80 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Link href={home} className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Agentic TP Platform"
              width={179}
              height={120}
              priority
              className="h-[4.125rem] w-auto drop-shadow-[0_0_10px_rgba(168,85,247,0.45)]"
            />
          </Link>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              isTeacher
                ? "border-purple-500/30 bg-purple-500/10 text-purple-300"
                : "border-blue-500/30 bg-blue-500/10 text-blue-300"
            }`}
          >
            {isTeacher ? "Teacher" : "Student"}
          </span>
        </div>

        {/* Nav links */}
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-navactive text-white"
                    : "text-textmuted hover:bg-white/5 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-panelborder bg-panelbg text-xs font-semibold text-textlight">
            {user?.avatarInitials ?? "?"}
          </div>
          <span className="hidden text-sm font-medium text-textlight sm:block">
            {user?.name}
          </span>
          <button
            onClick={logout}
            className="text-sm text-textmuted transition-colors hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
