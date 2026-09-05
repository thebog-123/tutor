import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Enquiry,
  Invoice,
  Question,
  Session,
  StudentWithUser,
  TeacherWithUser,
} from "@/lib/database.types";

export async function getAllTeachers(): Promise<TeacherWithUser[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("teachers")
    .select("*, user:users(id, full_name, email)")
    .order("created_at");
  return (data as TeacherWithUser[]) ?? [];
}

export async function getAllStudents(): Promise<StudentWithUser[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("students")
    .select("*, user:users(id, full_name, email)")
    .order("created_at");
  return (data as StudentWithUser[]) ?? [];
}

export type AdminSession = Session & {
  teacher: TeacherWithUser | null;
  student: StudentWithUser | null;
};

export async function getAllSessions(limit = 200): Promise<AdminSession[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("sessions")
    .select(
      "*, teacher:teachers(*, user:users(id, full_name, email)), student:students(*, user:users(id, full_name, email))",
    )
    .order("scheduled_at", { ascending: false })
    .limit(limit);
  return (data as AdminSession[]) ?? [];
}

export type AdminQuestion = Question & {
  teacher: TeacherWithUser | null;
  student: StudentWithUser | null;
  session: Pick<Session, "id" | "scheduled_at" | "topic"> | null;
};

export async function getAllQuestions(limit = 200): Promise<AdminQuestion[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("questions")
    .select(
      "*, teacher:teachers(*, user:users(id, full_name, email)), student:students(*, user:users(id, full_name, email)), session:sessions(id, scheduled_at, topic)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as AdminQuestion[]) ?? [];
}

export type AdminInvoice = Invoice & {
  teacher: TeacherWithUser | null;
  student: StudentWithUser | null;
};

export async function getAllInvoices(): Promise<AdminInvoice[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("invoices")
    .select(
      "*, teacher:teachers(*, user:users(id, full_name, email)), student:students(*, user:users(id, full_name, email))",
    )
    .order("issued_at", { ascending: false });
  return (data as AdminInvoice[]) ?? [];
}

export async function getAllEnquiries(): Promise<Enquiry[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("enquiries")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as Enquiry[]) ?? [];
}
