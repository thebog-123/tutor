"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { EnquiryStatus, InvoiceStatus, PayoutStatus } from "@/lib/database.types";

export type ActionResult = { ok: boolean; message: string | null };
export type CreateAccountResult = ActionResult & { password?: string };

const OK: ActionResult = { ok: true, message: null };
const fail = (message: string): ActionResult => ({ ok: false, message });

/* ---------------------------------------------------------- connections */

/**
 * The core admin action: pair a student with a tutor, or unassign them.
 * Called straight from a dropdown, so it stays deliberately small.
 */
export async function assignTeacher(
  studentId: string,
  teacherId: string | null,
): Promise<ActionResult> {
  await requireAdmin();
  if (!studentId) return fail("Missing student.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("students")
    .update({ teacher_id: teacherId })
    .eq("id", studentId);

  if (error) return fail("Couldn't save that assignment.");

  revalidatePath("/admin", "layout");
  revalidatePath("/teacher", "layout");
  revalidatePath("/student", "layout");
  return OK;
}

/* ------------------------------------------------------------- accounts */

function generatePassword() {
  // URL-safe, easy to read out loud once, replaced by the user on first login.
  return randomBytes(9).toString("base64url");
}

/**
 * There is no self-signup: the agency creates every account. Uses the
 * service-role key, which is why it sits behind requireAdmin().
 */
export async function createAccount(formData: FormData): Promise<CreateAccountResult> {
  await requireAdmin();

  const role = String(formData.get("role") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const requestedPassword = String(formData.get("password") ?? "").trim();

  if (role !== "teacher" && role !== "student") {
    return fail("Choose whether this is a teacher or a student account.");
  }
  if (!fullName) return fail("Enter the person's full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.");
  if (requestedPassword && requestedPassword.length < 8) {
    return fail("A password you set must be at least 8 characters.");
  }

  const password = requestedPassword || generatePassword();
  const admin = createSupabaseAdminClient();

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });

  if (authError || !created.user) {
    const alreadyExists =
      authError?.message?.toLowerCase().includes("already") ||
      authError?.status === 422;
    return fail(
      alreadyExists
        ? "There's already an account with that email address."
        : "Couldn't create that account. Check the Supabase service-role key is set.",
    );
  }

  const userId = created.user.id;

  const { error: profileError } = await admin
    .from("users")
    .insert({ id: userId, email, full_name: fullName, role });

  if (profileError) {
    // Don't leave a half-made account behind.
    await admin.auth.admin.deleteUser(userId);
    return fail("Couldn't save the profile for that account.");
  }

  if (role === "teacher") {
    const hourlyRate = Number(formData.get("hourly_rate"));
    const { error } = await admin.from("teachers").insert({
      user_id: userId,
      subject_specialty: String(formData.get("subject_specialty") ?? "").trim() || null,
      headline: String(formData.get("headline") ?? "").trim() || null,
      bio: String(formData.get("bio") ?? "").trim() || null,
      hourly_rate: Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : null,
    });
    if (error) {
      await admin.auth.admin.deleteUser(userId);
      return fail("Couldn't create the tutor profile.");
    }
  } else {
    const teacherId = String(formData.get("teacher_id") ?? "") || null;
    const { error } = await admin.from("students").insert({
      user_id: userId,
      year_group: String(formData.get("year_group") ?? "").trim() || null,
      subject: String(formData.get("subject") ?? "").trim() || null,
      guardian_name: String(formData.get("guardian_name") ?? "").trim() || null,
      guardian_email: String(formData.get("guardian_email") ?? "").trim() || null,
      teacher_id: teacherId,
    });
    if (error) {
      await admin.auth.admin.deleteUser(userId);
      return fail("Couldn't create the student profile.");
    }
  }

  revalidatePath("/admin", "layout");
  return {
    ok: true,
    message: `Account created for ${fullName}. Share this one-time password securely — they should change it after their first login.`,
    password,
  };
}

/* ------------------------------------------------------------- invoices */

export async function createInvoice(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const studentId = String(formData.get("student_id") ?? "");
  const amount = Number(formData.get("amount"));
  const hours = Number(formData.get("hours") ?? 0);
  const payout = Number(formData.get("teacher_payout_amount") ?? 0);

  if (!studentId) return fail("Choose a student.");
  if (!Number.isFinite(amount) || amount < 0) return fail("Enter a valid amount.");
  if (!Number.isFinite(hours) || hours < 0) return fail("Enter valid hours.");
  if (!Number.isFinite(payout) || payout < 0) return fail("Enter a valid tutor payout.");

  const supabase = await createSupabaseServerClient();

  // The invoice is against the student's current tutor.
  const { data: student } = await supabase
    .from("students")
    .select("teacher_id")
    .eq("id", studentId)
    .maybeSingle<{ teacher_id: string | null }>();

  if (!student?.teacher_id) {
    return fail("That student has no tutor assigned, so there's nobody to bill for.");
  }

  const { error } = await supabase.from("invoices").insert({
    student_id: studentId,
    teacher_id: student.teacher_id,
    description: String(formData.get("description") ?? "").trim() || null,
    amount,
    hours,
    teacher_payout_amount: payout,
    status: (String(formData.get("status") ?? "due") as InvoiceStatus) || "due",
    due_date: String(formData.get("due_date") ?? "") || null,
    period_start: String(formData.get("period_start") ?? "") || null,
    period_end: String(formData.get("period_end") ?? "") || null,
  });

  if (error) return fail("Couldn't raise that invoice.");

  revalidatePath("/admin", "layout");
  revalidatePath("/student", "layout");
  revalidatePath("/teacher", "layout");
  return OK;
}

export async function updateInvoiceStatus(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("invoice_id") ?? "");
  const status = String(formData.get("status") ?? "") as InvoiceStatus;
  if (!id || !status) return fail("Missing invoice.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status, paid_at: status === "paid" ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) return fail("Couldn't update that invoice.");

  revalidatePath("/admin", "layout");
  revalidatePath("/student", "layout");
  return OK;
}

export async function updatePayoutStatus(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("invoice_id") ?? "");
  const status = String(formData.get("payout_status") ?? "") as PayoutStatus;
  if (!id || !status) return fail("Missing invoice.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("invoices")
    .update({
      payout_status: status,
      payout_paid_at: status === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) return fail("Couldn't update that payout.");

  revalidatePath("/admin", "layout");
  revalidatePath("/teacher", "layout");
  return OK;
}

/* ------------------------------------------------------------ enquiries */

export async function updateEnquiry(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("enquiry_id") ?? "");
  const status = String(formData.get("status") ?? "") as EnquiryStatus;
  if (!id || !status) return fail("Missing enquiry.");

  const supabase = await createSupabaseServerClient();
  const patch: Record<string, unknown> = { status };
  if (formData.has("admin_note")) {
    patch.admin_note = String(formData.get("admin_note") ?? "").trim() || null;
  }

  const { error } = await supabase.from("enquiries").update(patch).eq("id", id);
  if (error) return fail("Couldn't update that enquiry.");

  revalidatePath("/admin", "layout");
  return OK;
}
