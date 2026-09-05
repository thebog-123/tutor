"use client";

import { useMemo, useState, useTransition } from "react";
import { assignTeacher } from "@/app/admin/actions";
import { Badge, Card, EmptyState, cn } from "@/components/ui";

export type ConnectionRow = {
  studentId: string;
  studentName: string;
  studentEmail: string;
  yearGroup: string | null;
  subject: string | null;
  teacherId: string | null;
};

export type TeacherOption = {
  id: string;
  name: string;
  specialty: string | null;
  studentCount: number;
};

type RowState = "idle" | "saving" | "saved" | "error";

export function ConnectionsTable({
  rows,
  teachers,
}: {
  rows: ConnectionRow[];
  teachers: TeacherOption[];
}) {
  const [assignments, setAssignments] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(rows.map((row) => [row.studentId, row.teacherId])),
  );
  const [status, setStatus] = useState<Record<string, RowState>>({});
  const [query, setQuery] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [, startTransition] = useTransition();

  const teacherName = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher.name])),
    [teachers],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (onlyUnassigned && assignments[row.studentId]) return false;
        if (!needle) return true;
        const assignedName = assignments[row.studentId]
          ? (teacherName.get(assignments[row.studentId]!) ?? "")
          : "";
        return [row.studentName, row.studentEmail, row.subject, row.yearGroup, assignedName]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle));
      })
      // students still needing a match float to the top
      .sort((a, b) => {
        const aUnassigned = assignments[a.studentId] ? 1 : 0;
        const bUnassigned = assignments[b.studentId] ? 1 : 0;
        if (aUnassigned !== bUnassigned) return aUnassigned - bUnassigned;
        return a.studentName.localeCompare(b.studentName);
      });
  }, [rows, query, onlyUnassigned, assignments, teacherName]);

  function onChange(studentId: string, value: string) {
    const teacherId = value || null;
    const previous = assignments[studentId] ?? null;

    setAssignments((current) => ({ ...current, [studentId]: teacherId }));
    setStatus((current) => ({ ...current, [studentId]: "saving" }));

    startTransition(async () => {
      const result = await assignTeacher(studentId, teacherId);
      if (result.ok) {
        setStatus((current) => ({ ...current, [studentId]: "saved" }));
        // let the confirmation fade rather than stick around
        setTimeout(
          () => setStatus((current) => ({ ...current, [studentId]: "idle" })),
          2000,
        );
      } else {
        setAssignments((current) => ({ ...current, [studentId]: previous }));
        setStatus((current) => ({ ...current, [studentId]: "error" }));
      }
    });
  }

  const unassignedCount = rows.filter((row) => !assignments[row.studentId]).length;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No students yet"
        description="Create a student account from the Accounts page and they'll appear here ready to be matched."
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search students, subjects or tutors…"
          aria-label="Search students"
          className="field-input mt-0 max-w-sm flex-1"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
          <input
            type="checkbox"
            checked={onlyUnassigned}
            onChange={(event) => setOnlyUnassigned(event.target.checked)}
            className="h-4 w-4 rounded border-paper-400 text-sage-600 focus:ring-sage-500"
          />
          Needs a match only
          {unassignedCount > 0 ? (
            <span className="rounded-full bg-mustard-500 px-2 py-0.5 text-xs font-bold text-ink-900">
              {unassignedCount}
            </span>
          ) : null}
        </label>
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-paper-200">
          {visible.map((row) => {
            const state = status[row.studentId] ?? "idle";
            const assigned = assignments[row.studentId];
            return (
              <li
                key={row.studentId}
                className={cn(
                  "flex flex-wrap items-center gap-4 px-5 py-4 transition",
                  !assigned && "bg-mustard-100/50",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-800">
                    {row.studentName}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    {[row.yearGroup, row.subject, row.studentEmail]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`assign-${row.studentId}`}>
                    Assign a tutor to {row.studentName}
                  </label>
                  <select
                    id={`assign-${row.studentId}`}
                    value={assigned ?? ""}
                    onChange={(event) => onChange(row.studentId, event.target.value)}
                    className={cn(
                      "field-input mt-0 min-w-[13rem] py-2 text-sm",
                      !assigned && "border-mustard-400",
                    )}
                  >
                    <option value="">— Needs a match —</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name}
                        {teacher.specialty ? ` · ${teacher.specialty}` : ""}
                      </option>
                    ))}
                  </select>

                  <span className="w-16 text-xs" aria-live="polite">
                    {state === "saving" ? (
                      <span className="text-ink-400">Saving…</span>
                    ) : state === "saved" ? (
                      <span className="font-semibold text-sage-600">Saved</span>
                    ) : state === "error" ? (
                      <span className="font-semibold text-clay-600">Failed</span>
                    ) : null}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-400">
            No students match that search.
          </p>
        ) : null}
      </Card>

      <div className="mt-6">
        <h2 className="mb-3 font-serif text-lg text-ink-900">Tutor load</h2>
        {teachers.length === 0 ? (
          <EmptyState
            title="No tutors yet"
            description="Create a teacher account before you can match anyone."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teachers.map((teacher) => {
              const live = rows.filter(
                (row) => assignments[row.studentId] === teacher.id,
              ).length;
              return (
                <li key={teacher.id}>
                  <Card className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-800">
                        {teacher.name}
                      </p>
                      <p className="truncate text-xs text-ink-400">
                        {teacher.specialty ?? "Tutor"}
                      </p>
                    </div>
                    <Badge tone={live === 0 ? "neutral" : "sage"}>
                      {live} student{live === 1 ? "" : "s"}
                    </Badge>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
