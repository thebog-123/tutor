import type { Metadata } from "next";
import { requireStudent } from "@/lib/auth";
import { getStudentSessions, getStudentTutor } from "@/lib/queries/student";
import { formatDateTime, formatHours } from "@/lib/format";
import { ButtonLink, Card, EmptyState, PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "My tutor" };

export default async function StudentTutorPage() {
  const { student } = await requireStudent();
  const [tutor, sessions] = await Promise.all([
    getStudentTutor(student.teacher_id),
    getStudentSessions(student.id, { limit: 500 }),
  ]);

  if (!tutor) {
    return (
      <>
        <PageHeading title="My tutor" />
        <EmptyState
          title="No tutor assigned yet"
          description="The agency matches every student with a specialist tutor by hand. You'll see their profile here as soon as you're paired."
        />
      </>
    );
  }

  const completed = sessions.filter((session) => session.status === "completed");
  const hoursTogether = completed.reduce(
    (sum, session) => sum + session.duration_minutes / 60,
    0,
  );

  return (
    <>
      <PageHeading title="My tutor" description="Who you're working with, and how to reach them." />

      <Card className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-5">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-sage-100 font-serif text-xl font-semibold text-sage-700">
            {tutor.user?.full_name
              .split(" ")
              .map((part) => part[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")}
          </span>
          <div className="min-w-0">
            <h2 className="font-serif text-2xl text-ink-900">{tutor.user?.full_name}</h2>
            <p className="mt-0.5 text-sm text-ink-500">
              {tutor.subject_specialty ?? "Tutor"}
              {tutor.years_experience ? ` · ${tutor.years_experience} years tutoring` : ""}
            </p>
          </div>
        </div>

        {tutor.headline ? (
          <p className="mt-6 font-serif text-lg leading-relaxed text-sage-700">
            {tutor.headline}
          </p>
        ) : null}

        {tutor.bio ? (
          <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-600">{tutor.bio}</p>
        ) : null}

        <dl className="mt-6 grid gap-4 border-t border-paper-200 pt-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-[0.08em] text-ink-400">Lessons together</dt>
            <dd className="mt-1 font-serif text-2xl text-ink-900">{completed.length}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.08em] text-ink-400">Hours taught</dt>
            <dd className="mt-1 font-serif text-2xl text-ink-900">
              {formatHours(hoursTogether)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.08em] text-ink-400">Last lesson</dt>
            <dd className="mt-1 text-sm text-ink-700">
              {completed[0] ? formatDateTime(completed[0].scheduled_at) : "None yet"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-paper-200 pt-6">
          <ButtonLink href="/student/questions" variant="sage">
            Ask a question
          </ButtonLink>
          <ButtonLink href="/student/notes" variant="outline">
            Read lesson notes
          </ButtonLink>
        </div>

        <p className="mt-5 text-xs text-ink-400">
          Questions go through the portal so your tutor can answer them alongside your lesson
          notes. For anything about billing or your match, contact the agency.
        </p>
      </Card>
    </>
  );
}
