import type { Metadata } from "next";
import { requireStudent } from "@/lib/auth";
import {
  amountDue,
  countUnreadReplies,
  getStudentInvoices,
  getStudentNotes,
  getStudentQuestions,
  getStudentSessions,
  getStudentTutor,
} from "@/lib/queries/student";
import { formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeading,
  Stat,
} from "@/components/ui";

export const metadata: Metadata = { title: "Overview" };

export default async function StudentOverviewPage() {
  const { profile, student } = await requireStudent();

  const [tutor, questions, invoices, notes, upcoming] = await Promise.all([
    getStudentTutor(student.teacher_id),
    getStudentQuestions(student.id),
    getStudentInvoices(student.id),
    getStudentNotes(student.id),
    getStudentSessions(student.id, { from: new Date(), ascending: true, limit: 3 }),
  ]);

  const unread = countUnreadReplies(questions);
  const due = amountDue(invoices);
  const firstName = profile.full_name.split(" ")[0];
  const nextSession = upcoming[0];

  return (
    <>
      <PageHeading
        title={`Hello, ${firstName}`}
        description="Your lessons, notes and questions in one place."
      />

      {!student.teacher_id ? (
        <Card className="mb-6 border-mustard-200 bg-mustard-100 p-5">
          <p className="font-serif text-lg text-ink-900">We&apos;re finding you a tutor</p>
          <p className="mt-1 text-sm text-ink-600">
            The agency is matching you with a specialist now. Once you&apos;re assigned, your
            lessons, notes and questions will appear here.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Your tutor"
          value={
            <span className="text-xl">{tutor?.user?.full_name ?? "Not assigned yet"}</span>
          }
          hint={tutor?.subject_specialty ?? undefined}
          tone="sage"
        />
        <Stat
          label="Unread replies"
          value={unread}
          hint={unread ? "from your tutor" : "nothing new"}
          tone="mustard"
        />
        <Stat
          label="Amount due"
          value={formatMoney(due)}
          hint={due > 0 ? "across open invoices" : "nothing outstanding"}
          tone={due > 0 ? "clay" : "ink"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Next lesson"
            action={
              <ButtonLink href="/student/sessions" variant="ghost" size="sm">
                All sessions
              </ButtonLink>
            }
          />
          <div className="p-5">
            {!nextSession ? (
              <EmptyState
                title="No lessons booked"
                description="Your tutor schedules sessions — they'll show up here as soon as one is booked."
              />
            ) : (
              <>
                <p className="font-serif text-xl text-ink-900">
                  {nextSession.topic ?? "Lesson"}
                </p>
                <p className="mt-1 text-sm text-ink-500">
                  {formatDateTime(nextSession.scheduled_at)} · {nextSession.duration_minutes} min
                </p>
                <div className="mt-4">
                  {nextSession.zoom_link ? (
                    <a
                      href={nextSession.zoom_link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center justify-center rounded-lg bg-sage-600 px-4 py-2.5 text-sm font-semibold text-paper-50 transition hover:bg-sage-700 focus-ring"
                    >
                      Join on Zoom
                    </a>
                  ) : (
                    <Badge tone="mustard">Link not shared yet</Badge>
                  )}
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Latest lesson notes"
            action={
              <ButtonLink href="/student/notes" variant="ghost" size="sm">
                All notes
              </ButtonLink>
            }
          />
          {notes.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No notes yet"
                description="After each lesson your tutor uploads notes here."
              />
            </div>
          ) : (
            <ul className="divide-y divide-paper-200">
              {notes.slice(0, 4).map((note) => (
                <li key={note.id} className="px-5 py-4">
                  <p className="truncate font-serif text-base text-ink-900">{note.title}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {formatRelative(note.uploaded_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
