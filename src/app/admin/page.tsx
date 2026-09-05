import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import {
  getAllEnquiries,
  getAllInvoices,
  getAllSessions,
  getAllStudents,
  getAllTeachers,
} from "@/lib/queries/admin";
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

export const metadata: Metadata = { title: "Agency overview" };

export default async function AdminOverviewPage() {
  await requireAdmin();

  const [teachers, students, invoices, enquiries, sessions] = await Promise.all([
    getAllTeachers(),
    getAllStudents(),
    getAllInvoices(),
    getAllEnquiries(),
    getAllSessions(10),
  ]);

  const unassigned = students.filter((student) => !student.teacher_id);
  const outstanding = invoices
    .filter((invoice) => invoice.status === "due" || invoice.status === "overdue")
    .reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  const newEnquiries = enquiries.filter((enquiry) => enquiry.status === "new");

  return (
    <>
      <PageHeading
        title="Agency overview"
        description="Where the agency stands today."
        action={
          <ButtonLink href="/admin/people" variant="primary" size="sm">
            Create an account
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tutors" value={teachers.length} tone="sage" />
        <Stat label="Students" value={students.length} tone="sage" />
        <Stat
          label="Needing a match"
          value={unassigned.length}
          hint={unassigned.length ? "assign a tutor" : "everyone is matched"}
          tone={unassigned.length ? "clay" : "ink"}
        />
        <Stat
          label="Outstanding"
          value={formatMoney(outstanding)}
          hint="due and overdue"
          tone="mustard"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Students needing a match"
            action={
              <ButtonLink href="/admin/connections" variant="ghost" size="sm">
                Connections
              </ButtonLink>
            }
          />
          {unassigned.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Everyone is matched"
                description="No student is currently waiting for a tutor."
              />
            </div>
          ) : (
            <ul className="divide-y divide-paper-200">
              {unassigned.slice(0, 6).map((student) => (
                <li
                  key={student.id}
                  className="flex items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-800">
                      {student.user?.full_name}
                    </p>
                    <p className="truncate text-xs text-ink-400">
                      {[student.year_group, student.subject].filter(Boolean).join(" · ") ||
                        student.user?.email}
                    </p>
                  </div>
                  <Badge tone="mustard">Unassigned</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="New enquiries"
            action={
              <ButtonLink href="/admin/enquiries" variant="ghost" size="sm">
                All enquiries
              </ButtonLink>
            }
          />
          {newEnquiries.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No new enquiries"
                description="Submissions from the homepage form land here."
              />
            </div>
          ) : (
            <ul className="divide-y divide-paper-200">
              {newEnquiries.slice(0, 6).map((enquiry) => (
                <li key={enquiry.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-ink-800">
                      {enquiry.name}
                    </p>
                    <span className="shrink-0 text-xs text-ink-400">
                      {formatRelative(enquiry.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-400">
                    {enquiry.role === "prospective_tutor" ? "Prospective tutor" : "Family"}
                    {enquiry.subject ? ` · ${enquiry.subject}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Recent sessions"
          action={
            <ButtonLink href="/admin/sessions" variant="ghost" size="sm">
              All sessions
            </ButtonLink>
          }
        />
        {sessions.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No sessions booked yet" />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {sessions.slice(0, 6).map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-800">
                    {session.student?.user?.full_name} with {session.teacher?.user?.full_name}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    {session.topic ?? "No topic"} · {formatDateTime(session.scheduled_at)}
                  </p>
                </div>
                <Badge
                  tone={
                    session.status === "completed"
                      ? "sage"
                      : session.status === "cancelled"
                        ? "clay"
                        : "neutral"
                  }
                >
                  {session.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
