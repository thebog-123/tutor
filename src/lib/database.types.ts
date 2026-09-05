// Hand-maintained mirror of supabase/migrations. Regenerate with
// `npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts`
// once you are running the Supabase CLI against your own project.

export type UserRole = "admin" | "teacher" | "student";
export type SessionStatus = "scheduled" | "completed" | "cancelled";
export type QuestionStatus = "open" | "answered";
export type InvoiceStatus = "draft" | "due" | "paid" | "overdue";
export type PayoutStatus = "pending" | "processing" | "paid";
export type EnquiryRole = "parent_student" | "prospective_tutor";
export type EnquiryStatus = "new" | "contacted" | "converted" | "closed";

export type AppUser = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  created_at: string;
};

export type Teacher = {
  id: string;
  user_id: string;
  subject_specialty: string | null;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  hourly_rate: number | null;
  avatar_url: string | null;
  is_published: boolean;
  created_at: string;
};

export type Student = {
  id: string;
  user_id: string;
  year_group: string | null;
  subject: string | null;
  teacher_id: string | null;
  guardian_name: string | null;
  guardian_email: string | null;
  admin_notes: string | null;
  created_at: string;
};

export type Session = {
  id: string;
  teacher_id: string;
  student_id: string;
  scheduled_at: string;
  duration_minutes: number;
  topic: string | null;
  zoom_link: string | null;
  status: SessionStatus;
  created_at: string;
};

export type Note = {
  id: string;
  session_id: string | null;
  teacher_id: string;
  student_id: string;
  title: string;
  summary: string | null;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  uploaded_at: string;
};

export type Question = {
  id: string;
  student_id: string;
  teacher_id: string;
  session_id: string | null;
  question_text: string;
  answer_text: string | null;
  status: QuestionStatus;
  read_by_student: boolean;
  created_at: string;
  answered_at: string | null;
};

export type Invoice = {
  id: string;
  student_id: string;
  teacher_id: string;
  description: string | null;
  hours: number;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  issued_at: string;
  due_date: string | null;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  teacher_payout_amount: number;
  payout_status: PayoutStatus;
  payout_paid_at: string | null;
  provider: string | null;
  provider_customer_id: string | null;
  provider_invoice_id: string | null;
  provider_payment_id: string | null;
  provider_metadata: Record<string, unknown> | null;
  created_at: string;
};

export type Enquiry = {
  id: string;
  name: string;
  email: string;
  role: EnquiryRole;
  subject: string | null;
  message: string;
  status: EnquiryStatus;
  admin_note: string | null;
  created_at: string;
};

export type PublicTutor = {
  id: string;
  full_name: string;
  subject_specialty: string | null;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  avatar_url: string | null;
};

/** Shapes returned by the joined queries used across the dashboards. */
export type StudentWithUser = Student & { user: Pick<AppUser, "id" | "full_name" | "email"> };
export type TeacherWithUser = Teacher & { user: Pick<AppUser, "id" | "full_name" | "email"> };
