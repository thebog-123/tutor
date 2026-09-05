import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Invoice,
  Note,
  Question,
  Session,
  TeacherWithUser,
} from "@/lib/database.types";

export async function getStudentTutor(
  teacherId: string | null,
): Promise<TeacherWithUser | null> {
  if (!teacherId) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("teachers")
    .select("*, user:users(id, full_name, email)")
    .eq("id", teacherId)
    .maybeSingle();
  return (data as TeacherWithUser) ?? null;
}

export async function getStudentSessions(
  studentId: string,
  opts: { from?: Date; ascending?: boolean; limit?: number } = {},
): Promise<Session[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("sessions").select("*").eq("student_id", studentId);
  if (opts.from) query = query.gte("scheduled_at", opts.from.toISOString());
  query = query.order("scheduled_at", { ascending: opts.ascending ?? false });
  if (opts.limit) query = query.limit(opts.limit);
  const { data } = await query;
  return (data as Session[]) ?? [];
}

export type StudentNote = Note & {
  session: Pick<Session, "id" | "scheduled_at" | "topic"> | null;
};

export async function getStudentNotes(studentId: string): Promise<StudentNote[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("notes")
    .select("*, session:sessions(id, scheduled_at, topic)")
    .eq("student_id", studentId)
    .order("uploaded_at", { ascending: false });
  return (data as StudentNote[]) ?? [];
}

export type StudentQuestion = Question & {
  session: Pick<Session, "id" | "scheduled_at" | "topic"> | null;
};

export async function getStudentQuestions(studentId: string): Promise<StudentQuestion[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("questions")
    .select("*, session:sessions(id, scheduled_at, topic)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  return (data as StudentQuestion[]) ?? [];
}

export async function getStudentInvoices(studentId: string): Promise<Invoice[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("invoices")
    .select("*")
    .eq("student_id", studentId)
    .order("issued_at", { ascending: false });
  return (data as Invoice[]) ?? [];
}

/** Answered threads the student hasn't opened yet. */
export function countUnreadReplies(questions: Question[]) {
  return questions.filter((q) => q.status === "answered" && !q.read_by_student).length;
}

export function amountDue(invoices: Invoice[]) {
  return invoices
    .filter((invoice) => invoice.status === "due" || invoice.status === "overdue")
    .reduce((sum, invoice) => sum + Number(invoice.amount), 0);
}
