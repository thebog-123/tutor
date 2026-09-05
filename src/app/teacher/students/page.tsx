import type { Metadata } from "next";
import { requireTeacher } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTeacherStudents } from "@/lib/queries/teacher";
import { formatDateTime } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState, PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "My students" };

export default async function TeacherStudentsPage() {
  const { teacher } = await requireTeacher();
  const students = await getTeacherStudents(teacher.id);

  const supabase = await createSupabaseServerClient();
  const { data: nextSessions } = await supabase
    .from("sessions")
    .select("student_id, scheduled_at")
    .eq("teacher_id", teacher.id)
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true });

  // first upcoming session per student
  const nextByStudent = new Map<string, string>();
  for (const row of (nextSessions as { student_id: string; scheduled_at: string }[]) ?? []) {
    if (!nextByStudent.has(row.student_id)) {
      nextByStudent.set(row.student_id, row.scheduled_at);
    }
  }

  return (
    <>
      <PageHeading
        title="My students"
        description="Students the agency has currently assigned to you."
      />

      {students.length === 0 ? (
        <EmptyState
          title="No students assigned yet"
          description="The agency assigns students to tutors. As soon as you're matched with someone they'll appear here."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {students.map((student) => {
            const next = nextByStudent.get(student.id);
            return (
              <li key={student.id}>
                <Card className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-serif text-lg text-ink-900">
                        {student.user?.full_name ?? "Unnamed student"}
                      </p>
                      <p className="truncate text-sm text-ink-500">{student.user?.email}</p>
                    </div>
                    {student.year_group ? (
                      <Badge tone="sage">{student.year_group}</Badge>
                    ) : null}
                  </div>

                  <dl className="mt-4 space-y-2 border-t border-paper-200 pt-4 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-400">Subject</dt>
                      <dd className="text-right text-ink-700">{student.subject ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-400">Next session</dt>
                      <dd className="text-right text-ink-700">
                        {next ? formatDateTime(next) : "Not scheduled"}
                      </dd>
                    </div>
                    {student.guardian_name ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-400">Guardian</dt>
                        <dd className="text-right text-ink-700">{student.guardian_name}</dd>
                      </div>
                    ) : null}
                  </dl>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <ButtonLink
                      href={`/teacher/sessions?student=${student.id}`}
                      variant="outline"
                      size="sm"
                    >
                      Sessions &amp; notes
                    </ButtonLink>
                    <ButtonLink
                      href={`/teacher/questions?student=${student.id}`}
                      variant="ghost"
                      size="sm"
                    >
                      Questions
                    </ButtonLink>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
