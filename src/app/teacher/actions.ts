"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth";
import { NOTES_BUCKET } from "@/lib/env";
import type { SessionStatus } from "@/lib/database.types";

export type ActionResult = { ok: boolean; message: string | null };

const OK: ActionResult = { ok: true, message: null };
const fail = (message: string): ActionResult => ({ ok: false, message });

/** RLS also enforces this, but failing early gives a readable error. */
async function assertOwnsStudent(studentId: string, teacherId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  return Boolean(data);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------- sessions */

export async function createSession(formData: FormData): Promise<ActionResult> {
  const { teacher } = await requireTeacher();
  const studentId = String(formData.get("student_id") ?? "");
  const scheduledAt = String(formData.get("scheduled_at") ?? "");
  const topic = String(formData.get("topic") ?? "").trim();
  const duration = Number(formData.get("duration_minutes") ?? 60);
  const zoomLink = String(formData.get("zoom_link") ?? "").trim();

  if (!studentId) return fail("Choose a student.");
  if (!scheduledAt) return fail("Choose a date and time.");
  if (!Number.isFinite(duration) || duration < 15 || duration > 480) {
    return fail("Duration must be between 15 and 480 minutes.");
  }
  if (zoomLink && !isHttpUrl(zoomLink)) return fail("The meeting link must be a full URL.");
  if (!(await assertOwnsStudent(studentId, teacher.id))) {
    return fail("That student isn't assigned to you.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("sessions").insert({
    teacher_id: teacher.id,
    student_id: studentId,
    scheduled_at: new Date(scheduledAt).toISOString(),
    duration_minutes: duration,
    topic: topic || null,
    zoom_link: zoomLink || null,
  });

  if (error) return fail("Couldn't schedule that session. Please try again.");
  revalidatePath("/teacher", "layout");
  return OK;
}

export async function updateSession(formData: FormData): Promise<ActionResult> {
  await requireTeacher();
  const id = String(formData.get("session_id") ?? "");
  if (!id) return fail("Missing session.");

  const patch: Record<string, unknown> = {};

  if (formData.has("scheduled_at")) {
    const value = String(formData.get("scheduled_at") ?? "");
    if (!value) return fail("Choose a date and time.");
    patch.scheduled_at = new Date(value).toISOString();
  }
  if (formData.has("topic")) {
    patch.topic = String(formData.get("topic") ?? "").trim() || null;
  }
  if (formData.has("duration_minutes")) {
    const duration = Number(formData.get("duration_minutes"));
    if (!Number.isFinite(duration) || duration < 15 || duration > 480) {
      return fail("Duration must be between 15 and 480 minutes.");
    }
    patch.duration_minutes = duration;
  }
  if (formData.has("zoom_link")) {
    const link = String(formData.get("zoom_link") ?? "").trim();
    if (link && !isHttpUrl(link)) return fail("The meeting link must be a full URL.");
    patch.zoom_link = link || null;
  }
  if (formData.has("status")) {
    patch.status = String(formData.get("status")) as SessionStatus;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("sessions").update(patch).eq("id", id);
  if (error) return fail("Couldn't save that change.");

  revalidatePath("/teacher", "layout");
  return OK;
}

export async function deleteSession(formData: FormData): Promise<ActionResult> {
  await requireTeacher();
  const id = String(formData.get("session_id") ?? "");
  if (!id) return fail("Missing session.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("sessions").delete().eq("id", id);
  if (error) return fail("Couldn't cancel that session.");

  revalidatePath("/teacher", "layout");
  return OK;
}

/* ---------------------------------------------------------------- notes */

/**
 * The file itself is uploaded straight from the browser to Supabase Storage
 * (which keeps large files off the serverless request path); this records the
 * row that points at it.
 */
export async function createNote(input: {
  studentId: string;
  sessionId: string | null;
  title: string;
  summary: string;
  filePath: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
}): Promise<ActionResult> {
  const { teacher } = await requireTeacher();

  const title = input.title.trim();
  if (!title) return fail("Give the note a title.");
  if (!input.studentId) return fail("Choose a student.");
  if (!(await assertOwnsStudent(input.studentId, teacher.id))) {
    return fail("That student isn't assigned to you.");
  }
  // The storage policy keys off the first path segment; keep the row honest too.
  if (input.filePath && !input.filePath.startsWith(`${input.studentId}/`)) {
    return fail("That file was uploaded to the wrong folder.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("notes").insert({
    teacher_id: teacher.id,
    student_id: input.studentId,
    session_id: input.sessionId || null,
    title,
    summary: input.summary.trim() || null,
    file_path: input.filePath,
    file_name: input.fileName,
    file_type: input.fileType,
    file_size: input.fileSize,
  });

  if (error) return fail("Couldn't save that note.");
  revalidatePath("/teacher", "layout");
  revalidatePath("/student", "layout");
  return OK;
}

export async function deleteNote(formData: FormData): Promise<ActionResult> {
  await requireTeacher();
  const id = String(formData.get("note_id") ?? "");
  if (!id) return fail("Missing note.");

  const supabase = await createSupabaseServerClient();
  const { data: note } = await supabase
    .from("notes")
    .select("file_path")
    .eq("id", id)
    .maybeSingle<{ file_path: string | null }>();

  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) return fail("Couldn't delete that note.");

  if (note?.file_path) {
    await supabase.storage.from(NOTES_BUCKET).remove([note.file_path]);
  }

  revalidatePath("/teacher", "layout");
  revalidatePath("/student", "layout");
  return OK;
}

/* ------------------------------------------------------------ questions */

export async function answerQuestion(formData: FormData): Promise<ActionResult> {
  await requireTeacher();
  const id = String(formData.get("question_id") ?? "");
  const answer = String(formData.get("answer_text") ?? "").trim();

  if (!id) return fail("Missing question.");
  if (!answer) return fail("Write a reply before posting.");
  if (answer.length > 8000) return fail("That reply is too long.");

  const supabase = await createSupabaseServerClient();
  // status and answered_at are set by the sync_question_status trigger
  const { error } = await supabase
    .from("questions")
    .update({ answer_text: answer, read_by_student: false })
    .eq("id", id);

  if (error) return fail("Couldn't post that reply.");
  revalidatePath("/teacher", "layout");
  revalidatePath("/student", "layout");
  return OK;
}
