"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types";

export default function SignUpPage() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("student");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (username.trim().length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    const { ok, error: err } = await register({
      name: name.trim(),
      username: username.trim(),
      email: email.trim(),
      password,
      role,
    });
    if (!ok) {
      setError(err ?? "Could not create your account.");
      setLoading(false);
    }
  };

  const inputClass =
    "w-full bg-paneldark border border-panelborder rounded-xl px-4 py-3 text-white placeholder:text-textmuted/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors";

  const roleButton = (value: UserRole, label: string, emoji: string) => {
    const active = role === value;
    return (
      <button
        type="button"
        onClick={() => setRole(value)}
        className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
          active
            ? "border-primary bg-primary/10 text-white"
            : "border-panelborder bg-paneldark text-textmuted hover:border-textmuted/40"
        }`}
      >
        <span className="mr-1.5">{emoji}</span>
        {label}
      </button>
    );
  };

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
          <p className="text-textmuted mt-3">Create your account</p>
        </div>

        {/* Card */}
        <div className="glass-card p-8 shadow-2xl">
          <h2 className="font-serif text-xl font-semibold text-white mb-6">Sign up</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-textmuted mb-1.5">Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={inputClass}
                placeholder="Ada Lovelace"
              />
            </div>

            <div>
              <label className="block text-sm text-textmuted mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                className={inputClass}
                placeholder="ada"
              />
            </div>

            <div>
              <label className="block text-sm text-textmuted mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
                placeholder="you@school.fr"
              />
            </div>

            <div>
              <label className="block text-sm text-textmuted mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className={inputClass}
                placeholder="At least 6 characters"
              />
            </div>

            <div>
              <label className="block text-sm text-textmuted mb-1.5">I am a…</label>
              <div className="flex gap-3">
                {roleButton("student", "Student", "🧑‍💻")}
                {roleButton("teacher", "Teacher", "🧑‍🏫")}
              </div>
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
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-textmuted mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
