import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Invoice,
  Note,
  Question,
  Session,
  StudentWithUser,
} from "@/lib/database.types";

export type SessionWithStudent = Session & {
  student: StudentWithUser | null;
};

export async function getTeacherStudents(teacherId: string): Promise<StudentWithUser[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("students")
    .select("*, user:users(id, full_name, email)")
    .eq("teacher_id", teacherId)
    .order("created_at");
  return (data as StudentWithUser[]) ?? [];
}

export async function getTeacherSessions(
  teacherId: string,
  opts: { from?: Date; to?: Date; limit?: number; ascending?: boolean } = {},
): Promise<SessionWithStudent[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("sessions")
    .select("*, student:students(*, user:users(id, full_name, email))")
    .eq("teacher_id", teacherId);

  if (opts.from) query = query.gte("scheduled_at", opts.from.toISOString());
  if (opts.to) query = query.lt("scheduled_at", opts.to.toISOString());

  query = query.order("scheduled_at", { ascending: opts.ascending ?? false });
  if (opts.limit) query = query.limit(opts.limit);

  const { data } = await query;
  return (data as SessionWithStudent[]) ?? [];
}

export type NoteWithContext = Note & {
  student: StudentWithUser | null;
  session: Pick<Session, "id" | "scheduled_at" | "topic"> | null;
};

export async function getTeacherNotes(
  teacherId: string,
  limit = 50,
): Promise<NoteWithContext[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("notes")
    .select(
      "*, student:students(*, user:users(id, full_name, email)), session:sessions(id, scheduled_at, topic)",
    )
    .eq("teacher_id", teacherId)
    .order("uploaded_at", { ascending: false })
    .limit(limit);
  return (data as NoteWithContext[]) ?? [];
}

export type QuestionWithContext = Question & {
  student: StudentWithUser | null;
  session: Pick<Session, "id" | "scheduled_at" | "topic"> | null;
};

export async function getTeacherQuestions(
  teacherId: string,
): Promise<QuestionWithContext[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("questions")
    .select(
      "*, student:students(*, user:users(id, full_name, email)), session:sessions(id, scheduled_at, topic)",
    )
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false });
  return (data as QuestionWithContext[]) ?? [];
}

export type InvoiceWithStudent = Invoice & { student: StudentWithUser | null };

export async function getTeacherInvoices(teacherId: string): Promise<InvoiceWithStudent[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("invoices")
    .select("*, student:students(*, user:users(id, full_name, email))")
    .eq("teacher_id", teacherId)
    .order("issued_at", { ascending: false });
  return (data as InvoiceWithStudent[]) ?? [];
}
