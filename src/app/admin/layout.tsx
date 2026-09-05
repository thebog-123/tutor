import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PortalShell } from "@/components/PortalShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ count: unassigned }, { count: newEnquiries }, { count: payableReferrals }] =
    await Promise.all([
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .is("teacher_id", null),
    supabase
      .from("enquiries")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    supabase
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("status", "payable"),
  ]);

  return (
    <PortalShell
      role="admin"
      userName={profile.full_name}
      subtitle="Agency admin"
      nav={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/connections", label: "Connections", badge: unassigned ?? 0 },
        { href: "/admin/people", label: "Accounts" },
        { href: "/admin/sessions", label: "All sessions" },
        { href: "/admin/questions", label: "Question activity" },
        { href: "/admin/billing", label: "Billing" },
        { href: "/admin/enquiries", label: "Enquiries", badge: newEnquiries ?? 0 },
        { href: "/admin/referrals", label: "Referrals", badge: payableReferrals ?? 0 },
      ]}
    >
      {children}
    </PortalShell>
  );
}
