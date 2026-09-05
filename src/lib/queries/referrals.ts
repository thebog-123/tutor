import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Referral, ReferralStatus, StudentWithUser } from "@/lib/database.types";

/** Referrals credited to the signed-in user. RLS scopes this to them. */
export async function getMyReferrals(userId: string): Promise<Referral[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("referrals")
    .select("*")
    .eq("referrer_user_id", userId)
    .order("created_at", { ascending: false });
  return (data as Referral[]) ?? [];
}

export type AdminReferral = Referral & { student: StudentWithUser | null };

export async function getAllReferrals(): Promise<AdminReferral[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("referrals")
    .select("*, student:students(*, user:users(id, full_name, email))")
    .order("created_at", { ascending: false });
  return (data as AdminReferral[]) ?? [];
}

/** Only `payable` and `paid` referrals carry a settled commission figure. */
export function referralTotals(referrals: Referral[]) {
  const earned = referrals
    .filter((r) => r.status === "payable" || r.status === "paid")
    .reduce((sum, r) => sum + Number(r.commission_amount ?? 0), 0);
  const awaitingPayout = referrals
    .filter((r) => r.status === "payable")
    .reduce((sum, r) => sum + Number(r.commission_amount ?? 0), 0);
  const paid = referrals
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + Number(r.commission_amount ?? 0), 0);

  return { earned, awaitingPayout, paid };
}

export const REFERRAL_TONE: Record<ReferralStatus, "sage" | "mustard" | "neutral" | "clay"> = {
  paid: "sage",
  payable: "mustard",
  pending: "neutral",
  void: "clay",
};

export const REFERRAL_LABEL: Record<ReferralStatus, string> = {
  pending: "Waiting on first lesson",
  payable: "Commission earned",
  paid: "Commission paid",
  void: "Not proceeding",
};
