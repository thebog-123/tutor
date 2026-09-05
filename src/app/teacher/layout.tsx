import { requireTeacher } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PortalShell } from "@/components/PortalShell";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { profile, teacher } = await requireTeacher();
  const supabase = await createSupabaseServerClient();

  const { count: openQuestions } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", teacher.id)
    .eq("status", "open");

  return (
    <PortalShell
      role="teacher"
      userName={profile.full_name}
      subtitle={teacher.subject_specialty ?? "Tutor"}
      nav={[
        { href: "/teacher", label: "Overview" },
        { href: "/teacher/students", label: "My students" },
        { href: "/teacher/sessions", label: "Sessions & notes" },
        { href: "/teacher/questions", label: "Questions", badge: openQuestions ?? 0 },
        { href: "/teacher/calendar", label: "Calendar" },
        { href: "/teacher/earnings", label: "Earnings" },
      ]}
    >
      {children}
    </PortalShell>
  );
}
