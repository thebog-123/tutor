import type { Metadata } from "next";
import { requireTeacher } from "@/lib/auth";
import { getTeacherSessions, getTeacherStudents } from "@/lib/queries/teacher";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { createSession, deleteSession, updateSession } from "@/app/teacher/actions";
import { ActionForm } from "@/components/portal/ActionForm";
import { DateTimeInput } from "@/components/portal/DateTimeInput";
import { Badge, Card, CardHeader, EmptyState, PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Calendar" };

export default async function TeacherCalendarPage() {
  const { teacher } = await requireTeacher();
  const [students, sessions] = await Promise.all([
    getTeacherStudents(teacher.id),
    getTeacherSessions(teacher.id, { from: new Date(), ascending: true, limit: 60 }),
  ]);

  // group upcoming sessions by calendar day
  const days = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const key = new Date(session.scheduled_at).toDateString();
    days.set(key, [...(days.get(key) ?? []), session]);
  }

  return (
    <>
      <PageHeading
        title="Calendar"
        description="Your upcoming lessons. Paste the meeting link for a session and your student will see a Join button."
      />

      {students.length === 0 ? (
        <EmptyState
          title="No students assigned yet"
          description="You'll be able to schedule sessions as soon as the agency matches you with a student."
        />
      ) : (
        <>
          <Card className="mb-6">
            <CardHeader title="Schedule a session" />
            <div className="p-5">
              <ActionForm action={createSession} submitLabel="Add to calendar" variant="sage">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="new-student">
                      Student
                    </label>
                    <select id="new-student" name="student_id" required className="field-input">
                      {students.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.user?.full_name ?? "Student"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="new-when">
                      Date &amp; time
                    </label>
                    <DateTimeInput id="new-when" name="scheduled_at" required />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="new-topic">
                      Topic
                    </label>
                    <input
                      id="new-topic"
                      name="topic"
                      maxLength={160}
                      placeholder="e.g. Past paper — mechanics"
                      className="field-input"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="new-duration">
                      Duration (minutes)
                    </label>
                    <input
                      id="new-duration"
                      name="duration_minutes"
                      type="number"
                      min={15}
                      max={480}
                      step={15}
                      defaultValue={60}
                      className="field-input"
                    />
                  </div>
                </div>
                <div>
                  <label className="field-label" htmlFor="new-zoom">
                    Meeting link{" "}
                    <span className="font-normal normal-case tracking-normal">(optional)</span>
                  </label>
                  <input
                    id="new-zoom"
                    name="zoom_link"
                    type="url"
                    placeholder="https://zoom.us/j/…"
                    className="field-input"
                  />
                </div>
              </ActionForm>
            </div>
          </Card>

          {sessions.length === 0 ? (
            <EmptyState
              title="Nothing scheduled"
              description="Add your first session with the form above."
            />
          ) : (
            <div className="space-y-8">
              {[...days.entries()].map(([day, daySessions]) => (
                <section key={day}>
                  <h2 className="mb-3 font-serif text-lg text-ink-900">
                    {formatDate(daySessions[0].scheduled_at)}
                  </h2>
                  <ul className="space-y-4">
                    {daySessions.map((session) => (
                      <li key={session.id}>
                        <Card className="p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-serif text-lg text-ink-900">
                                {formatTime(session.scheduled_at)} ·{" "}
                                {session.student?.user?.full_name ?? "Student"}
                              </p>
                              <p className="mt-0.5 text-sm text-ink-500">
                                {session.topic ?? "No topic set"} · {session.duration_minutes} min
                              </p>
                            </div>
                            <Badge tone={session.zoom_link ? "sage" : "mustard"}>
                              {session.zoom_link ? "Link shared" : "Link not shared"}
                            </Badge>
                          </div>

                          <div className="mt-4 border-t border-paper-200 pt-4">
                            <ActionForm
                              action={updateSession}
                              submitLabel="Save link"
                              pendingLabel="Saving…"
                              variant="outline"
                              size="sm"
                            >
                              <input type="hidden" name="session_id" value={session.id} />
                              <label className="field-label" htmlFor={`zoom-${session.id}`}>
                                Meeting link
                              </label>
                              <input
                                id={`zoom-${session.id}`}
                                name="zoom_link"
                                type="url"
                                defaultValue={session.zoom_link ?? ""}
                                placeholder="https://zoom.us/j/…"
                                className="field-input"
                              />
                            </ActionForm>
                          </div>

                          <details className="mt-4 border-t border-paper-200 pt-4">
                            <summary className="cursor-pointer rounded text-xs font-semibold text-ink-500 focus-ring hover:text-ink-800">
                              Reschedule or cancel
                            </summary>

                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                              <ActionForm
                                action={updateSession}
                                submitLabel="Update session"
                                variant="outline"
                                size="sm"
                              >
                                <input type="hidden" name="session_id" value={session.id} />
                                <div>
                                  <label className="field-label" htmlFor={`when-${session.id}`}>
                                    Date &amp; time
                                  </label>
                                  <DateTimeInput
                                    id={`when-${session.id}`}
                                    name="scheduled_at"
                                    defaultValue={session.scheduled_at}
                                    required
                                  />
                                </div>
                                <div>
                                  <label className="field-label" htmlFor={`topic-${session.id}`}>
                                    Topic
                                  </label>
                                  <input
                                    id={`topic-${session.id}`}
                                    name="topic"
                                    defaultValue={session.topic ?? ""}
                                    maxLength={160}
                                    className="field-input"
                                  />
                                </div>
                                <div>
                                  <label className="field-label" htmlFor={`status-${session.id}`}>
                                    Status
                                  </label>
                                  <select
                                    id={`status-${session.id}`}
                                    name="status"
                                    defaultValue={session.status}
                                    className="field-input"
                                  >
                                    <option value="scheduled">Scheduled</option>
                                    <option value="completed">Completed</option>
                                    <option value="cancelled">Cancelled</option>
                                  </select>
                                </div>
                              </ActionForm>

                              <div className="self-end">
                                <ActionForm
                                  action={deleteSession}
                                  submitLabel="Remove session"
                                  pendingLabel="Removing…"
                                  variant="danger"
                                  size="sm"
                                  confirm="Remove this session from the calendar?"
                                >
                                  <input type="hidden" name="session_id" value={session.id} />
                                  <p className="text-xs text-ink-400">
                                    Removing deletes the session for you and the student. Booked on{" "}
                                    {formatDateTime(session.created_at)}.
                                  </p>
                                </ActionForm>
                              </div>
                            </div>
                          </details>
                        </Card>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
