"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { tpService } from "@/services/tpService";
import { userService } from "@/services/userService";
import { TP, Assignment, User } from "@/types";

export default function AssignTPPage() {
  const { user, isTeacher } = useAuth();
  const [tps, setTPs] = useState<TP[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [selectedTP, setSelectedTP] = useState<string>("");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [saved, setSaved] = useState(false);
  const [existingAssignments, setExistingAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [allTPs, roster, existing] = await Promise.all([
        tpService.getAllTPs(),
        userService.getStudents(),
        tpService.getAssignmentsForTeacher(user?.id ?? ""),
      ]);
      if (cancelled) return;
      setTPs(allTPs);
      setStudents(roster);
      setExistingAssignments(existing);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const selectAll = () =>
    setSelectedStudents(students.map((s) => s.id));

  const clearAll = () => setSelectedStudents([]);

  const handleAssign = async () => {
    if (!selectedTP) { alert("Please select a TP."); return; }
    if (selectedStudents.length === 0) { alert("Please select at least one student."); return; }

    const created = await tpService.saveAssignment({
      tpId: selectedTP,
      studentIds: selectedStudents,
      ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
    });
    if (!created) { alert("Could not save the assignment. Is the backend running?"); return; }

    setSaved(true);
    setExistingAssignments(await tpService.getAssignmentsForTeacher(user?.id ?? ""));
    setSelectedTP("");
    setSelectedStudents([]);
    setDueDate("");
    setTimeout(() => setSaved(false), 3000);
  };

  const getTPTitle = (id: string) =>
    tps.find((t) => t.id === id)?.title ?? id;

  const getStudentNames = (ids: string[]) =>
    ids.map((id) => students.find((s) => s.id === id)?.name ?? id).join(", ");

  if (!isTeacher) return null;

  return (
    <div className="min-h-screen bg-[#141724]">
      {/* Nav */}
      <nav className="bg-[#181b2b] border-b border-[#2a2f4c] px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link
          href="/teacher/dashboard"
          className="text-[#8b92b2] hover:text-white transition-colors text-sm"
        >
          ← Dashboard
        </Link>
        <span className="text-[#2a2f4c]">/</span>
        <span className="text-white text-sm font-medium">Assign TP</span>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Assign a TP</h1>
          <p className="text-[#8b92b2] mt-1">
            Select a TP and the students who should complete it.
          </p>
        </div>

        {/* Assignment form */}
        <div className="bg-[#181b2b] rounded-2xl border border-[#2a2f4c] p-6 space-y-5">
          {/* TP selector */}
          <div>
            <label className="text-sm text-[#b6bdd9] block mb-2">
              Select a TP
            </label>
            <div className="grid gap-2">
              {tps.map((tp) => (
                <button
                  key={tp.id}
                  onClick={() => setSelectedTP(tp.id)}
                  className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all ${
                    selectedTP === tp.id
                      ? "border-[#c084fc] bg-[#c084fc]/10"
                      : "border-[#2a2f4c] bg-[#1e2235] hover:border-[#4a5170]"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-white">{tp.title}</p>
                    <p className="text-xs text-[#8b92b2] mt-0.5">
                      {tp.steps.length} steps · {tp.difficulty} ·{" "}
                      ~{tp.estimatedMinutes}min
                    </p>
                  </div>
                  {selectedTP === tp.id && (
                    <span className="text-[#c084fc] text-lg">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Student selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-[#b6bdd9]">
                Select students ({selectedStudents.length}/{students.length})
              </label>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs text-[#60a5fa] hover:text-white transition-colors"
                >
                  All
                </button>
                <span className="text-[#4a5170]">·</span>
                <button
                  onClick={clearAll}
                  className="text-xs text-[#8b92b2] hover:text-white transition-colors"
                >
                  None
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {students.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleStudent(s.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    selectedStudents.includes(s.id)
                      ? "border-[#60a5fa] bg-[#60a5fa]/10"
                      : "border-[#2a2f4c] bg-[#1e2235] hover:border-[#4a5170]"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      selectedStudents.includes(s.id)
                        ? "bg-[#60a5fa] text-[#141724]"
                        : "bg-[#2a2f4c] text-[#b6bdd9]"
                    }`}
                  >
                    {s.avatarInitials}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{s.name}</p>
                    <p className="text-xs text-[#8b92b2]">{s.email}</p>
                  </div>
                  {selectedStudents.includes(s.id) && (
                    <span className="text-[#60a5fa]">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className="text-sm text-[#b6bdd9] block mb-2">
              Due Date (optional)
            </label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-[#1e2235] rounded-xl px-4 py-2.5 text-[#b6bdd9] text-sm outline-none border border-[#2a2f4c] focus:ring-1 focus:ring-[#c084fc]"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleAssign}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
              saved
                ? "bg-[#34d399] text-[#141724]"
                : "bg-gradient-to-r from-[#c084fc] to-[#60a5fa] text-[#141724] hover:opacity-90"
            }`}
          >
            {saved ? "✅ Assignment created!" : "Assign to Students"}
          </button>
        </div>

        {/* Existing assignments */}
        {existingAssignments.length > 0 && (
          <div className="bg-[#181b2b] rounded-2xl border border-[#2a2f4c] p-6">
            <h2 className="font-semibold text-white mb-4">
              📋 Current Assignments
            </h2>
            <div className="space-y-3">
              {existingAssignments.map((a) => (
                <div
                  key={a.id}
                  className="p-4 rounded-xl bg-[#1e2235] border border-[#2a2f4c]"
                >
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-medium text-white">
                      {getTPTitle(a.tpId)}
                    </p>
                    {a.dueDate && (
                      <span className="text-xs text-[#fbbf24]">
                        Due {new Date(a.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8b92b2] mt-1">
                    👥 {getStudentNames(a.studentIds)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
