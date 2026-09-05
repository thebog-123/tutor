import { requireStudent } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PortalShell } from "@/components/PortalShell";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { profile, student } = await requireStudent();
  const supabase = await createSupabaseServerClient();

  const { count: unread } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("student_id", student.id)
    .eq("status", "answered")
    .eq("read_by_student", false);

  return (
    <PortalShell
      role="student"
      userName={profile.full_name}
      subtitle={student.subject ?? student.year_group ?? "Student"}
      nav={[
        { href: "/student", label: "Overview" },
        { href: "/student/tutor", label: "My tutor" },
        { href: "/student/notes", label: "Lesson notes" },
        { href: "/student/questions", label: "Ask a question", badge: unread ?? 0 },
        { href: "/student/sessions", label: "Upcoming sessions" },
        { href: "/student/invoices", label: "Invoices" },
      ]}
    >
      {children}
    </PortalShell>
  );
}
