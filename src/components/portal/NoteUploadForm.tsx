"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createNote } from "@/app/teacher/actions";
import { NOTES_BUCKET } from "@/lib/env";
import { Button } from "@/components/ui";

export type NoteStudentOption = { id: string; name: string };
export type NoteSessionOption = {
  id: string;
  studentId: string;
  label: string;
};

const MAX_BYTES = 20 * 1024 * 1024;

/** Keeps object keys predictable and safe for the storage path. */
function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
}

export function NoteUploadForm({
  students,
  sessions,
  defaultStudentId,
}: {
  students: NoteStudentOption[];
  sessions: NoteSessionOption[];
  defaultStudentId?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [studentId, setStudentId] = useState(defaultStudentId ?? students[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const studentSessions = useMemo(
    () => sessions.filter((session) => session.studentId === studentId),
    [sessions, studentId],
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const summary = String(data.get("summary") ?? "");
    const sessionId = String(data.get("session_id") ?? "") || null;
    const file = data.get("file") as File | null;

    if (!studentId) return setError("Choose a student.");
    if (!title) return setError("Give the note a title.");
    if (file && file.size > MAX_BYTES) {
      return setError("That file is larger than the 20 MB limit.");
    }

    setBusy(true);
    try {
      let filePath: string | null = null;

      if (file && file.size > 0) {
        // Uploaded straight to Storage from the browser: the bucket policy
        // checks that this tutor owns the student folder being written to.
        const supabase = createClient();
        const path = `${studentId}/${sessionId ?? "general"}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from(NOTES_BUCKET)
          .upload(path, file, { cacheControl: "3600", upsert: false });

        if (uploadError) {
          setBusy(false);
          setError("The file couldn't be uploaded. Check the file type and try again.");
          return;
        }
        filePath = path;
      }

      const result = await createNote({
        studentId,
        sessionId,
        title,
        summary,
        filePath,
        fileName: file && file.size > 0 ? file.name : null,
        fileType: file && file.size > 0 ? file.type || null : null,
        fileSize: file && file.size > 0 ? file.size : null,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      form.reset();
      setDone("Note saved. Your student can see it now.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (students.length === 0) return null;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="note-student">
            Student
          </label>
          <select
            id="note-student"
            name="student_id"
            className="field-input"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
          >
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="note-session">
            Session
          </label>
          <select id="note-session" name="session_id" className="field-input" defaultValue="">
            <option value="">Not tied to a session</option>
            {studentSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="note-title">
          Title
        </label>
        <input
          id="note-title"
          name="title"
          required
          maxLength={160}
          placeholder="e.g. Quadratic inequalities — worked examples"
          className="field-input"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="note-summary">
          Summary for the student
        </label>
        <textarea
          id="note-summary"
          name="summary"
          rows={3}
          maxLength={2000}
          placeholder="What you covered, and what to practise before next time."
          className="field-input resize-y"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="note-file">
          Attachment <span className="font-normal normal-case tracking-normal">(optional)</span>
        </label>
        <input
          id="note-file"
          name="file"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.txt"
          className="field-input file:mr-3 file:rounded-md file:border-0 file:bg-paper-200 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink-700"
        />
        <p className="mt-1 text-xs text-ink-400">PDF, image, Word or text file. Max 20 MB.</p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-clay-500/30 bg-clay-100 px-3 py-2 text-sm text-clay-600"
        >
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="rounded-lg border border-sage-200 bg-sage-100 px-3 py-2 text-sm text-sage-700">
          {done}
        </p>
      ) : null}

      <Button type="submit" variant="sage" disabled={busy}>
        {busy ? "Saving…" : "Save lesson note"}
      </Button>
    </form>
  );
}
