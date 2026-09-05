import type { Metadata } from "next";
import { requireTeacher } from "@/lib/auth";
import { getMyReferrals } from "@/lib/queries/referrals";
import { ReferralPanel } from "@/components/portal/ReferralPanel";

export const metadata: Metadata = { title: "Refer a friend" };

export default async function TeacherReferPage() {
  const { profile } = await requireTeacher();
  const referrals = await getMyReferrals(profile.id);

  return (
    <ReferralPanel
      referralCode={profile.referral_code}
      referrals={referrals}
      audience="teacher"
    />
  );
}
