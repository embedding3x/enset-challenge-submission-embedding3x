"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const ok = await login(email, password);
    if (!ok) {
      setError(
        "Invalid email or password. Try youssfi@enset.ma / teacher123"
      );
      setLoading(false);
    }
  };

  const quickLogin = (e: string, p: string) => {
    setEmail(e);
    setPassword(p);
  };

  const demoAccounts = [
    { role: "TEACHER", name: "M. Youssfi Mohamed", email: "youssfi@enset.ma", password: "teacher123" },
    { role: "TEACHER", name: "Mme. Ouhmida Asmae", email: "ouhmidas@enset.ma", password: "teacher123" },
    { role: "STUDENT", name: "Toubani Badr eddine", email: "toubani@enset.ma", password: "student123" },
    { role: "STUDENT", name: "Bahou houdaifa", email: "bahou@enset.ma", password: "student123" },
    { role: "STUDENT", name: "Aarab Aymane", email: "aymane@semlalia.ma", password: "student123" },
  ];

  return (
    <div className="relative min-h-screen bg-appbg flex items-center justify-center p-4 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute -top-32 left-1/3 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-32 right-1/3 w-96 h-96 rounded-full bg-secondary/10 blur-3xl" />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <Image
              src="/footer-logo.png"
              alt="Agentic TP Platform"
              width={180}
              height={120}
              priority
              className="h-28 w-auto mx-auto drop-shadow-[0_0_25px_rgba(168,85,247,0.3)]"
            />
          </Link>
          <p className="text-textmuted mt-3">AI-powered learning platform</p>
        </div>

        {/* Card */}
        <div className="glass-card p-8 shadow-2xl">
          <h2 className="font-serif text-xl font-semibold text-white mb-6">Sign in</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-textmuted mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-paneldark border border-panelborder rounded-xl px-4 py-3 text-white placeholder:text-textmuted/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                placeholder="you@school.fr"
              />
            </div>
            <div>
              <label className="block text-sm text-textmuted mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-paneldark border border-panelborder rounded-xl px-4 py-3 text-white placeholder:text-textmuted/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl btn-gradient font-bold text-base glow-button disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="text-center text-sm text-textmuted mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-primary font-medium hover:underline">
              Sign up
            </Link>
          </p>
        </div>

        {/* Quick login for demo */}
        <div className="mt-6 glass-card p-5">
          <p className="text-xs text-textmuted uppercase tracking-widest mb-3">
            Demo accounts
          </p>
          <div className="grid grid-cols-2 gap-2">
            {demoAccounts.map((acc) => (
              <button
                key={acc.email}
                onClick={() => quickLogin(acc.email, acc.password)}
                className="text-left p-3 rounded-xl bg-paneldark hover:bg-navactive transition-colors border border-panelborder"
              >
                <p
                  className={`text-xs font-mono ${
                    acc.role === "TEACHER" ? "text-primary" : "text-secondary"
                  }`}
                >
                  {acc.role}
                </p>
                <p className="text-sm text-white font-medium mt-0.5">{acc.name}</p>
                <p className="text-xs text-textmuted/70">{acc.email}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
