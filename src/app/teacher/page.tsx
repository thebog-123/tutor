import type { Metadata } from "next";
import { requireTeacher } from "@/lib/auth";
import {
  getTeacherInvoices,
  getTeacherQuestions,
  getTeacherSessions,
  getTeacherStudents,
} from "@/lib/queries/teacher";
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

export default async function TeacherOverviewPage() {
  const { profile, teacher } = await requireTeacher();

  const [students, questions, invoices, upcoming] = await Promise.all([
    getTeacherStudents(teacher.id),
    getTeacherQuestions(teacher.id),
    getTeacherInvoices(teacher.id),
    getTeacherSessions(teacher.id, { from: new Date(), ascending: true, limit: 5 }),
  ]);

  const openQuestions = questions.filter((q) => q.status === "open");
  const owed = invoices
    .filter((invoice) => invoice.payout_status !== "paid")
    .reduce((sum, invoice) => sum + Number(invoice.teacher_payout_amount), 0);

  const firstName = profile.full_name.split(" ")[0];

  return (
    <>
      <PageHeading
        title={`Good to see you, ${firstName}`}
        description="Everything waiting on you today, in one place."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Students"
          value={students.length}
          hint={students.length === 1 ? "assigned to you" : "assigned to you"}
          tone="sage"
        />
        <Stat
          label="Open questions"
          value={openQuestions.length}
          hint={openQuestions.length ? "waiting for a reply" : "all caught up"}
          tone="mustard"
        />
        <Stat
          label="Owed to you"
          value={formatMoney(owed)}
          hint="across unpaid payouts"
          tone="ink"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Next sessions"
            action={
              <ButtonLink href="/teacher/calendar" variant="ghost" size="sm">
                Calendar
              </ButtonLink>
            }
          />
          {upcoming.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nothing scheduled yet"
                description="Add a session from the calendar and it will show up here."
                action={
                  <ButtonLink href="/teacher/calendar" variant="sage" size="sm">
                    Schedule a session
                  </ButtonLink>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-paper-200">
              {upcoming.map((session) => (
                <li key={session.id} className="flex items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-800">
                      {session.student?.user?.full_name ?? "Unknown student"}
                    </p>
                    <p className="truncate text-sm text-ink-500">
                      {session.topic ?? "No topic set"}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">
                      {formatDateTime(session.scheduled_at)}
                    </p>
                  </div>
                  <Badge tone={session.zoom_link ? "sage" : "mustard"}>
                    {session.zoom_link ? "Link added" : "No link"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Questions waiting"
            action={
              <ButtonLink href="/teacher/questions" variant="ghost" size="sm">
                All questions
              </ButtonLink>
            }
          />
          {openQuestions.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No open questions"
                description="When a student asks something between lessons it lands here."
              />
            </div>
          ) : (
            <ul className="divide-y divide-paper-200">
              {openQuestions.slice(0, 5).map((question) => (
                <li key={question.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-ink-800">
                      {question.student?.user?.full_name ?? "Unknown student"}
                    </p>
                    <span className="shrink-0 text-xs text-ink-400">
                      {formatRelative(question.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-600">
                    {question.question_text}
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
