"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth";

export type ActionResult = { ok: boolean; message: string | null };

const OK: ActionResult = { ok: true, message: null };
const fail = (message: string): ActionResult => ({ ok: false, message });

export async function askQuestion(formData: FormData): Promise<ActionResult> {
  const { student } = await requireStudent();

  if (!student.teacher_id) {
    return fail("You don't have a tutor assigned yet, so there's nobody to ask.");
  }

  const text = String(formData.get("question_text") ?? "").trim();
  const sessionId = String(formData.get("session_id") ?? "") || null;

  if (!text) return fail("Write your question first.");
  if (text.length > 4000) return fail("Please keep your question under 4000 characters.");

  const supabase = await createSupabaseServerClient();

  // Only allow tagging a session that is genuinely this student's.
  if (sessionId) {
    const { data } = await supabase
      .from("sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("student_id", student.id)
      .maybeSingle();
    if (!data) return fail("That lesson isn't one of yours.");
  }

  const { error } = await supabase.from("questions").insert({
    student_id: student.id,
    teacher_id: student.teacher_id,
    session_id: sessionId,
    question_text: text,
  });

  if (error) return fail("Couldn't send that question. Please try again.");

  revalidatePath("/student", "layout");
  revalidatePath("/teacher", "layout");
  return OK;
}

export async function markRepliesRead(): Promise<ActionResult> {
  const { student } = await requireStudent();
  const supabase = await createSupabaseServerClient();

  await supabase
    .from("questions")
    .update({ read_by_student: true })
    .eq("student_id", student.id)
    .eq("status", "answered")
    .eq("read_by_student", false);

  revalidatePath("/student", "layout");
  return OK;
}

export async function withdrawQuestion(formData: FormData): Promise<ActionResult> {
  await requireStudent();
  const id = String(formData.get("question_id") ?? "");
  if (!id) return fail("Missing question.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("questions").delete().eq("id", id);
  if (error) return fail("Couldn't withdraw that question — it may already be answered.");

  revalidatePath("/student", "layout");
  revalidatePath("/teacher", "layout");
  return OK;
}
