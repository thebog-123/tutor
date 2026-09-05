import type { Metadata } from "next";
import { requireStudent } from "@/lib/auth";
import { getStudentNotes } from "@/lib/queries/student";
import { formatDateTime, formatFileSize, formatRelative } from "@/lib/format";
import { Card, EmptyState, PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Lesson notes" };

export default async function StudentNotesPage() {
  const { student } = await requireStudent();
  const notes = await getStudentNotes(student.id);

  return (
    <>
      <PageHeading
        title="Lesson notes"
        description="Everything your tutor has uploaded, most recent first."
      />

      {notes.length === 0 ? (
        <EmptyState
          title="No lesson notes yet"
          description="After each lesson your tutor uploads a summary and any worksheets here."
        />
      ) : (
        <ul className="space-y-4">
          {notes.map((note) => (
            <li key={note.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-serif text-lg text-ink-900">{note.title}</h2>
                  <span className="text-xs text-ink-400">
                    {formatRelative(note.uploaded_at)}
                  </span>
                </div>

                {note.session ? (
                  <p className="mt-0.5 text-xs text-ink-400">
                    Lesson on {formatDateTime(note.session.scheduled_at)}
                    {note.session.topic ? ` — ${note.session.topic}` : ""}
                  </p>
                ) : null}

                {note.summary ? (
                  <p className="prose-note mt-3 whitespace-pre-line">{note.summary}</p>
                ) : null}

                {note.file_path ? (
                  <a
                    href={`/api/notes/${note.id}/download`}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-paper-300 bg-paper-100 px-3 py-2 text-sm font-semibold text-ink-700 transition focus-ring hover:border-sage-400 hover:bg-sage-100"
                  >
                    {note.file_name ?? "Open attachment"}
                    <span className="text-xs font-normal text-ink-400">
                      {formatFileSize(note.file_size)}
                    </span>
                  </a>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
