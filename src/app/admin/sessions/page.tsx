import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAllSessions } from "@/lib/queries/admin";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeading, Stat } from "@/components/ui";
import type { SessionStatus } from "@/lib/database.types";

export const metadata: Metadata = { title: "All sessions" };

const STATUS_TONE: Record<SessionStatus, "sage" | "clay" | "neutral"> = {
  completed: "sage",
  cancelled: "clay",
  scheduled: "neutral",
};

export default async function AdminSessionsPage() {
  await requireAdmin();
  const sessions = await getAllSessions(300);

  const now = Date.now();
  const upcoming = sessions.filter(
    (session) =>
      new Date(session.scheduled_at).getTime() >= now && session.status === "scheduled",
  );
  const completed = sessions.filter((session) => session.status === "completed");
  const withoutLink = upcoming.filter((session) => !session.zoom_link);

  return (
    <>
      <PageHeading
        title="All sessions"
        description="Read-only view across every tutor and student pair."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Upcoming" value={upcoming.length} tone="sage" />
        <Stat label="Completed" value={completed.length} tone="ink" />
        <Stat
          label="Missing a link"
          value={withoutLink.length}
          hint={withoutLink.length ? "upcoming, no meeting link" : "all links shared"}
          tone={withoutLink.length ? "mustard" : "sage"}
        />
      </div>

      <Card className="mt-6">
        {sessions.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No sessions booked yet"
              description="Tutors schedule sessions from their own calendar."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-paper-200 text-left text-xs uppercase tracking-[0.06em] text-ink-400">
                  <th className="px-5 py-3 font-semibold">When</th>
                  <th className="px-5 py-3 font-semibold">Student</th>
                  <th className="px-5 py-3 font-semibold">Tutor</th>
                  <th className="px-5 py-3 font-semibold">Topic</th>
                  <th className="px-5 py-3 font-semibold">Link</th>
                  <th className="px-5 py-3 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-200">
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-ink-600">
                      {formatDateTime(session.scheduled_at)}
                      <span className="mt-0.5 block text-xs text-ink-400">
                        {session.duration_minutes} min
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium text-ink-800">
                      {session.student?.user?.full_name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-ink-600">
                      {session.teacher?.user?.full_name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-ink-600">{session.topic ?? "—"}</td>
                    <td className="px-5 py-3">
                      {session.zoom_link ? (
                        <Badge tone="sage">Shared</Badge>
                      ) : (
                        <Badge tone="mustard">Not shared</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Badge tone={STATUS_TONE[session.status]}>{session.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
