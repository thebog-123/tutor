"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export type ActionResult = { ok: boolean; message: string | null };

const OK: ActionResult = { ok: true, message: null };
const fail = (message: string): ActionResult => ({ ok: false, message });

/**
 * Logged by the referrer themselves from their "Refer a friend" page. The
 * row starts as `pending` with no money on it — row level security forbids a
 * referrer setting the commission, the student link or the status, so the
 * agency stays in control of what actually gets paid out.
 */
export async function submitReferral(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return fail("You need to be signed in to refer someone.");
  if (profile.role === "admin") {
    return fail("Record agency-side referrals from the admin Referrals page.");
  }

  const referredName = String(formData.get("referred_name") ?? "").trim();
  const referredEmail = String(formData.get("referred_email") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!referredName) return fail("Tell us who you're referring.");
  if (referredName.length > 120) return fail("That name is too long.");
  if (referredEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(referredEmail)) {
    return fail("That email address doesn't look right.");
  }
  if (note.length > 1000) return fail("Please keep the note under 1000 characters.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("referrals").insert({
    referrer_user_id: profile.id,
    referrer_name: profile.full_name,
    referrer_email: profile.email,
    referred_name: referredName,
    referred_email: referredEmail || null,
    note: note || null,
  });

  if (error) {
    return fail("Couldn't log that referral. Please try again.");
  }

  revalidatePath("/student", "layout");
  revalidatePath("/teacher", "layout");
  revalidatePath("/admin", "layout");
  return OK;
}
