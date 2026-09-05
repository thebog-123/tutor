import type { Metadata } from "next";
import { requireStudent } from "@/lib/auth";
import { getStudentSessions } from "@/lib/queries/student";
import { formatDate, formatDateTime, formatRelative, formatTime } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Upcoming sessions" };

export default async function StudentSessionsPage() {
  const { student } = await requireStudent();
  const sessions = await getStudentSessions(student.id, { limit: 200 });

  const now = Date.now();
  const upcoming = sessions
    .filter((s) => new Date(s.scheduled_at).getTime() >= now && s.status !== "cancelled")
    .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
  const past = sessions.filter((s) => new Date(s.scheduled_at).getTime() < now);

  return (
    <>
      <PageHeading
        title="Sessions"
        description="Your lesson schedule. A Join button appears once your tutor shares the meeting link."
      />

      <section>
        <h2 className="mb-3 font-serif text-lg text-ink-900">Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyState
            title="No lessons booked"
            description="Your tutor books sessions from their calendar — they'll appear here straight away."
          />
        ) : (
          <ul className="space-y-4">
            {upcoming.map((session) => (
              <li key={session.id}>
                <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <p className="font-serif text-lg text-ink-900">
                      {session.topic ?? "Lesson"}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {formatDate(session.scheduled_at)} at {formatTime(session.scheduled_at)} ·{" "}
                      {session.duration_minutes} min
                    </p>
                    <p className="mt-1 text-xs text-ink-400">
                      {formatRelative(session.scheduled_at)}
                    </p>
                  </div>

                  {session.zoom_link ? (
                    <a
                      href={session.zoom_link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-sage-600 px-4 py-2.5 text-sm font-semibold text-paper-50 transition focus-ring hover:bg-sage-700"
                    >
                      Join on Zoom
                    </a>
                  ) : (
                    <Badge tone="mustard">Link not shared yet</Badge>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 font-serif text-lg text-ink-900">Past lessons</h2>
        {past.length === 0 ? (
          <EmptyState title="No lessons yet" />
        ) : (
          <Card>
            <ul className="divide-y divide-paper-200">
              {past.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-800">
                      {session.topic ?? "Lesson"}
                    </p>
                    <p className="text-xs text-ink-400">
                      {formatDateTime(session.scheduled_at)}
                    </p>
                  </div>
                  <Badge tone={session.status === "cancelled" ? "clay" : "neutral"}>
                    {session.status === "cancelled"
                      ? "Cancelled"
                      : session.status === "completed"
                        ? "Completed"
                        : "Finished"}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </>
  );
}
