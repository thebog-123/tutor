import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAllStudents, getAllTeachers } from "@/lib/queries/admin";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeading } from "@/components/ui";
import { CreateAccountForm } from "./CreateAccountForm";

export const metadata: Metadata = { title: "Accounts" };

export default async function AdminPeoplePage() {
  await requireAdmin();
  const [teachers, students] = await Promise.all([getAllTeachers(), getAllStudents()]);

  const teacherName = new Map(
    teachers.map((teacher) => [teacher.id, teacher.user?.full_name ?? "Tutor"]),
  );

  return (
    <>
      <PageHeading
        title="Accounts"
        description="There's no self-signup — every teacher and student account is created here."
      />

      <Card className="mb-8">
        <CardHeader
          title="Create an account"
          description="The person can sign in immediately with the password below."
        />
        <CreateAccountForm
          teachers={teachers.map((teacher) => ({
            id: teacher.id,
            name: teacher.user?.full_name ?? "Unnamed tutor",
          }))}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Tutors" description={`${teachers.length} on the books`} />
          {teachers.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No tutors yet" />
            </div>
          ) : (
            <ul className="divide-y divide-paper-200">
              {teachers.map((teacher) => (
                <li key={teacher.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-800">
                        {teacher.user?.full_name}
                      </p>
                      <p className="truncate text-xs text-ink-400">{teacher.user?.email}</p>
                    </div>
                    <Badge tone={teacher.is_published ? "sage" : "neutral"}>
                      {teacher.is_published ? "On homepage" : "Hidden"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-400">
                    {teacher.subject_specialty ?? "No specialty set"} · joined{" "}
                    {formatDate(teacher.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Students" description={`${students.length} enrolled`} />
          {students.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No students yet" />
            </div>
          ) : (
            <ul className="divide-y divide-paper-200">
              {students.map((student) => (
                <li key={student.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-800">
                        {student.user?.full_name}
                      </p>
                      <p className="truncate text-xs text-ink-400">{student.user?.email}</p>
                    </div>
                    <Badge tone={student.teacher_id ? "sage" : "mustard"}>
                      {student.teacher_id
                        ? (teacherName.get(student.teacher_id) ?? "Assigned")
                        : "Needs a match"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-400">
                    {[student.year_group, student.subject].filter(Boolean).join(" · ") ||
                      "No details set"}
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
