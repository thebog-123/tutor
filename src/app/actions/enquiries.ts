"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EnquiryRole } from "@/lib/database.types";

export type EnquiryState = { status: "idle" | "error" | "success"; message: string | null };

const VALID_ROLES: EnquiryRole[] = ["parent_student", "prospective_tutor"];

export async function submitEnquiry(
  _prev: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "") as EnquiryRole;
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const referralCode = String(formData.get("referral_code") ?? "").trim().toUpperCase();
  const referrerName = String(formData.get("referrer_name") ?? "").trim();
  // Honeypot: real people leave this hidden field empty.
  const trap = String(formData.get("company") ?? "");

  if (trap) return { status: "success", message: "Thanks — we'll be in touch shortly." };

  if (!name || !email || !message) {
    return { status: "error", message: "Name, email and message are all required." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "That email address doesn't look right." };
  }
  if (!VALID_ROLES.includes(role)) {
    return { status: "error", message: "Choose whether you're enquiring as a family or a tutor." };
  }
  if (message.length > 4000) {
    return { status: "error", message: "Please keep your message under 4000 characters." };
  }
  if (referralCode.length > 32) {
    return { status: "error", message: "That referral code doesn't look right." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("enquiries").insert({
    name,
    email,
    role,
    subject: subject || null,
    message,
    status: "new",
    referral_code: referralCode || null,
    referrer_name: referrerName || null,
  });

  if (error) {
    return {
      status: "error",
      message: "We couldn't send that just now. Please try again in a moment.",
    };
  }

  return {
    status: "success",
    message: "Thanks — your enquiry is with the agency. We usually reply within one working day.",
  };
}
