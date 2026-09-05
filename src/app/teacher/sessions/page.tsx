import Link from "next/link";
import type { Metadata } from "next";
import { requireTeacher } from "@/lib/auth";
import {
  getTeacherNotes,
  getTeacherSessions,
  getTeacherStudents,
} from "@/lib/queries/teacher";
import { formatDateTime, formatFileSize, formatRelative } from "@/lib/format";
import { deleteNote } from "@/app/teacher/actions";
import { NoteUploadForm } from "@/components/portal/NoteUploadForm";
import { ActionForm } from "@/components/portal/ActionForm";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeading,
  cn,
} from "@/components/ui";

export const metadata: Metadata = { title: "Sessions & notes" };

export default async function TeacherSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const { teacher } = await requireTeacher();
  const { student: studentFilter } = await searchParams;

  const [students, sessions, notes] = await Promise.all([
    getTeacherStudents(teacher.id),
    getTeacherSessions(teacher.id, { limit: 100 }),
    getTeacherNotes(teacher.id, 100),
  ]);

  const activeStudent = students.find((s) => s.id === studentFilter);
  const visibleSessions = activeStudent
    ? sessions.filter((s) => s.student_id === activeStudent.id)
    : sessions;
  const visibleNotes = activeStudent
    ? notes.filter((n) => n.student_id === activeStudent.id)
    : notes;

  const now = Date.now();
  const upcoming = visibleSessions
    .filter((s) => new Date(s.scheduled_at).getTime() >= now)
    .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
  const past = visibleSessions.filter((s) => new Date(s.scheduled_at).getTime() < now);

  const notesBySession = new Map<string, number>();
  for (const note of visibleNotes) {
    if (note.session_id) {
      notesBySession.set(note.session_id, (notesBySession.get(note.session_id) ?? 0) + 1);
    }
  }

  return (
    <>
      <PageHeading
        title="Sessions &amp; notes"
        description="Every lesson you've taught or have booked, and the notes attached to them."
      />

      {students.length === 0 ? (
        <EmptyState
          title="No students assigned yet"
          description="Once the agency matches you with a student, their sessions and notes will live here."
        />
      ) : (
        <>
          {/* -------------------------------------------------- filter */}
          <div className="mb-6 flex flex-wrap gap-2">
            <Link
              href="/teacher/sessions"
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-ring",
                !activeStudent
                  ? "border-ink-800 bg-ink-800 text-paper-50"
                  : "border-paper-300 bg-paper-50 text-ink-600 hover:border-ink-300",
              )}
            >
              All students
            </Link>
            {students.map((student) => (
              <Link
                key={student.id}
                href={`/teacher/sessions?student=${student.id}`}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-ring",
                  activeStudent?.id === student.id
                    ? "border-ink-800 bg-ink-800 text-paper-50"
                    : "border-paper-300 bg-paper-50 text-ink-600 hover:border-ink-300",
                )}
              >
                {student.user?.full_name ?? "Student"}
              </Link>
            ))}
          </div>

          {/* --------------------------------------------------- upload */}
          <Card className="mb-6">
            <CardHeader
              title="Upload lesson notes"
              description="Attach a file and a short summary so the student knows what to review."
            />
            <NoteUploadForm
              defaultStudentId={activeStudent?.id}
              students={students.map((s) => ({
                id: s.id,
                name: s.user?.full_name ?? "Student",
              }))}
              sessions={sessions.map((s) => ({
                id: s.id,
                studentId: s.student_id,
                label: `${formatDateTime(s.scheduled_at)}${s.topic ? ` — ${s.topic}` : ""}`,
              }))}
            />
          </Card>

          {/* ------------------------------------------------- sessions */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Upcoming" description={`${upcoming.length} scheduled`} />
              {upcoming.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title="Nothing scheduled"
                    description="Book sessions from the calendar."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-paper-200">
                  {upcoming.map((session) => (
                    <li key={session.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink-800">
                            {session.student?.user?.full_name ?? "Student"}
                          </p>
                          <p className="truncate text-sm text-ink-500">
                            {session.topic ?? "No topic set"}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-ink-400">
                          {formatRelative(session.scheduled_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-400">
                        {formatDateTime(session.scheduled_at)} · {session.duration_minutes} min
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Past sessions" description={`${past.length} taught`} />
              {past.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="No lessons yet" description="Past sessions appear here." />
                </div>
              ) : (
                <ul className="max-h-[26rem] divide-y divide-paper-200 overflow-y-auto">
                  {past.map((session) => {
                    const noteCount = notesBySession.get(session.id) ?? 0;
                    return (
                      <li key={session.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink-800">
                              {session.student?.user?.full_name ?? "Student"}
                            </p>
                            <p className="truncate text-sm text-ink-500">
                              {session.topic ?? "No topic set"}
                            </p>
                            <p className="mt-1 text-xs text-ink-400">
                              {formatDateTime(session.scheduled_at)}
                            </p>
                          </div>
                          <Badge tone={noteCount ? "sage" : "neutral"}>
                            {noteCount ? `${noteCount} note${noteCount > 1 ? "s" : ""}` : "No notes"}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          {/* ---------------------------------------------------- notes */}
          <Card className="mt-6">
            <CardHeader
              title="Notes you've uploaded"
              description="Most recent first. Students see these in their own feed."
            />
            {visibleNotes.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No lesson notes yet"
                  description="Upload your first note using the form above."
                />
              </div>
            ) : (
              <ul className="divide-y divide-paper-200">
                {visibleNotes.map((note) => (
                  <li key={note.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-serif text-base text-ink-900">{note.title}</p>
                        <p className="mt-0.5 text-xs text-ink-400">
                          {note.student?.user?.full_name ?? "Student"} ·{" "}
                          {formatRelative(note.uploaded_at)}
                          {note.session
                            ? ` · session ${formatDateTime(note.session.scheduled_at)}`
                            : ""}
                        </p>
                        {note.summary ? (
                          <p className="prose-note mt-2 whitespace-pre-line">{note.summary}</p>
                        ) : null}
                        {note.file_path ? (
                          <a
                            href={`/api/notes/${note.id}/download`}
                            className="mt-2 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-sage-700 underline decoration-sage-400 underline-offset-4 focus-ring hover:text-sage-600"
                          >
                            {note.file_name ?? "Download attachment"}
                            <span className="text-xs font-normal text-ink-400">
                              {formatFileSize(note.file_size)}
                            </span>
                          </a>
                        ) : null}
                      </div>
                      <ActionForm
                        action={deleteNote}
                        submitLabel="Delete"
                        pendingLabel="Deleting…"
                        variant="danger"
                        size="sm"
                        confirm="Delete this note? The student will no longer see it."
                        className="shrink-0 space-y-0"
                      >
                        <input type="hidden" name="note_id" value={note.id} />
                      </ActionForm>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
