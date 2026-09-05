import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAllStudents, getAllTeachers } from "@/lib/queries/admin";
import { PageHeading } from "@/components/ui";
import { ConnectionsTable } from "./ConnectionsTable";

export const metadata: Metadata = { title: "Connections" };

export default async function AdminConnectionsPage() {
  await requireAdmin();
  const [students, teachers] = await Promise.all([getAllStudents(), getAllTeachers()]);

  return (
    <>
      <PageHeading
        title="Connections"
        description="Assign or reassign a tutor for any student. Changes save the moment you pick."
      />

      <ConnectionsTable
        rows={students.map((student) => ({
          studentId: student.id,
          studentName: student.user?.full_name ?? "Unnamed student",
          studentEmail: student.user?.email ?? "",
          yearGroup: student.year_group,
          subject: student.subject,
          teacherId: student.teacher_id,
        }))}
        teachers={teachers.map((teacher) => ({
          id: teacher.id,
          name: teacher.user?.full_name ?? "Unnamed tutor",
          specialty: teacher.subject_specialty,
          studentCount: students.filter((s) => s.teacher_id === teacher.id).length,
        }))}
      />
    </>
  );
}
