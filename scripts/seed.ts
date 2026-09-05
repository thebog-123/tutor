/**
 * Seeds a demo agency: one admin, three tutors, five students (one waiting
 * for a match), plus sessions, notes, questions, invoices and enquiries.
 *
 *   npm run seed
 *
 * Idempotent — re-running it reuses existing accounts by email and clears the
 * demo rows it owns first. Needs SUPABASE_SERVICE_ROLE_KEY, so never run it
 * against production data.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Copy .env.example to .env.local and fill it in first — see README.md.",
  );
  process.exit(1);
}

const db: SupabaseClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "binder-demo-2024";

type Role = "admin" | "teacher" | "student";

async function findUserByEmail(email: string) {
  // listUsers is paginated; the demo set is small enough to scan a page or two.
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function upsertAccount(email: string, fullName: string, role: Role) {
  const normalised = email.toLowerCase();
  const existing = await findUserByEmail(normalised);

  let id: string;
  if (existing) {
    id = existing.id;
    await db.auth.admin.updateUserById(id, { password: DEMO_PASSWORD });
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: normalised,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error || !data.user) throw error ?? new Error(`Could not create ${email}`);
    id = data.user.id;
  }

  const { error } = await db
    .from("users")
    .upsert({ id, email: normalised, full_name: fullName, role }, { onConflict: "id" });
  if (error) throw error;

  return id;
}

/** Local-time offset from now, so the demo always has a live-looking week. */
function at(daysFromNow: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function dateOnly(daysFromNow: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

const TEACHERS = [
  {
    email: "alice.nwosu@thebinder.test",
    name: "Dr Alice Nwosu",
    subject_specialty: "A Level Physics & Maths",
    headline: "Ten years of A Level Physics, and a habit of making mechanics click.",
    bio: "Physics PhD and former head of department. I teach from past papers backwards — we work out what the examiner wants, then build the technique to give it to them.",
    years_experience: 10,
    hourly_rate: 42,
  },
  {
    email: "marcus.bell@thebinder.test",
    name: "Marcus Bell",
    subject_specialty: "GCSE & A Level Maths",
    headline: "For students who've decided they're 'not a maths person'.",
    bio: "Fifteen years teaching secondary maths, most of it with students who arrived convinced they couldn't do it. Patient, structured, and relentless about showing working.",
    years_experience: 15,
    hourly_rate: 38,
  },
  {
    email: "sofia.reyes@thebinder.test",
    name: "Sofia Reyes",
    subject_specialty: "English Literature & Admissions",
    headline: "Essays that argue something, and personal statements that sound human.",
    bio: "Cambridge English graduate and admissions interviewer. I work on structure first: what is the argument, and does every paragraph earn its place?",
    years_experience: 7,
    hourly_rate: 40,
  },
];

const STUDENTS = [
  {
    email: "jonah.price@thebinder.test",
    name: "Jonah Price",
    year_group: "Year 13",
    subject: "A Level Physics",
    teacherEmail: "alice.nwosu@thebinder.test",
    guardian_name: "Rebecca Price",
    guardian_email: "rebecca.price@thebinder.test",
  },
  {
    email: "amara.osei@thebinder.test",
    name: "Amara Osei",
    year_group: "Year 11",
    subject: "GCSE Maths",
    teacherEmail: "marcus.bell@thebinder.test",
    guardian_name: "Daniel Osei",
    guardian_email: "daniel.osei@thebinder.test",
  },
  {
    email: "kit.marchetti@thebinder.test",
    name: "Kit Marchetti",
    year_group: "Year 12",
    subject: "A Level English Literature",
    teacherEmail: "sofia.reyes@thebinder.test",
    guardian_name: "Elena Marchetti",
    guardian_email: "elena.marchetti@thebinder.test",
  },
  {
    email: "noor.haddad@thebinder.test",
    name: "Noor Haddad",
    year_group: "Year 13",
    subject: "A Level Maths",
    teacherEmail: "alice.nwosu@thebinder.test",
    guardian_name: "Yusuf Haddad",
    guardian_email: "yusuf.haddad@thebinder.test",
  },
  {
    // deliberately left unmatched so the admin dashboard has something to do
    email: "theo.lindqvist@thebinder.test",
    name: "Theo Lindqvist",
    year_group: "Year 10",
    subject: "GCSE Chemistry",
    teacherEmail: null,
    guardian_name: "Anna Lindqvist",
    guardian_email: "anna.lindqvist@thebinder.test",
  },
];

async function main() {
  console.log("Seeding The Binder…\n");

  const adminId = await upsertAccount("admin@thebinder.test", "Harriet Vale", "admin");
  console.log(`  admin      admin@thebinder.test (${adminId.slice(0, 8)}…)`);

  // ---------------------------------------------------------------- tutors
  const teacherIdByEmail = new Map<string, string>();
  for (const teacher of TEACHERS) {
    const userId = await upsertAccount(teacher.email, teacher.name, "teacher");
    const { data, error } = await db
      .from("teachers")
      .upsert(
        {
          user_id: userId,
          subject_specialty: teacher.subject_specialty,
          headline: teacher.headline,
          bio: teacher.bio,
          years_experience: teacher.years_experience,
          hourly_rate: teacher.hourly_rate,
          is_published: true,
        },
        { onConflict: "user_id" },
      )
      .select("id")
      .single();
    if (error) throw error;
    teacherIdByEmail.set(teacher.email, data.id);
    console.log(`  teacher    ${teacher.email}`);
  }

  // -------------------------------------------------------------- students
  const studentIdByEmail = new Map<string, string>();
  for (const student of STUDENTS) {
    const userId = await upsertAccount(student.email, student.name, "student");
    const { data, error } = await db
      .from("students")
      .upsert(
        {
          user_id: userId,
          year_group: student.year_group,
          subject: student.subject,
          guardian_name: student.guardian_name,
          guardian_email: student.guardian_email,
          teacher_id: student.teacherEmail
            ? (teacherIdByEmail.get(student.teacherEmail) ?? null)
            : null,
        },
        { onConflict: "user_id" },
      )
      .select("id")
      .single();
    if (error) throw error;
    studentIdByEmail.set(student.email, data.id);
    console.log(
      `  student    ${student.email}${student.teacherEmail ? "" : "  (unassigned)"}`,
    );
  }

  const S = (email: string) => studentIdByEmail.get(email)!;
  const T = (email: string) => teacherIdByEmail.get(email)!;

  // Clear the demo relations so re-running doesn't pile up duplicates.
  const studentIds = [...studentIdByEmail.values()];
  await db.from("notes").delete().in("student_id", studentIds);
  await db.from("questions").delete().in("student_id", studentIds);
  await db.from("invoices").delete().in("student_id", studentIds);
  await db.from("sessions").delete().in("student_id", studentIds);
  await db.from("enquiries").delete().like("email", "%@thebinder.test");

  // -------------------------------------------------------------- sessions
  const sessionRows = [
    // Jonah — Physics, a history plus a booked week ahead
    { s: "jonah.price@thebinder.test", t: "alice.nwosu@thebinder.test", when: at(-21, 17, 30), topic: "Circular motion — setting up the equations", status: "completed" },
    { s: "jonah.price@thebinder.test", t: "alice.nwosu@thebinder.test", when: at(-14, 17, 30), topic: "Gravitational fields past paper", status: "completed" },
    { s: "jonah.price@thebinder.test", t: "alice.nwosu@thebinder.test", when: at(-7, 17, 30), topic: "Capacitors — discharge curves", status: "completed" },
    { s: "jonah.price@thebinder.test", t: "alice.nwosu@thebinder.test", when: at(2, 17, 30), topic: "Mock paper 2 walkthrough", status: "scheduled", zoom: "https://zoom.us/j/98765432101" },
    { s: "jonah.price@thebinder.test", t: "alice.nwosu@thebinder.test", when: at(9, 17, 30), topic: "Nuclear decay problems", status: "scheduled" },

    // Amara — GCSE Maths
    { s: "amara.osei@thebinder.test", t: "marcus.bell@thebinder.test", when: at(-10, 16, 0), topic: "Simultaneous equations", status: "completed" },
    { s: "amara.osei@thebinder.test", t: "marcus.bell@thebinder.test", when: at(-3, 16, 0), topic: "Surds and indices", status: "completed" },
    { s: "amara.osei@thebinder.test", t: "marcus.bell@thebinder.test", when: at(1, 16, 0), topic: "Quadratic inequalities and sketching", status: "scheduled", zoom: "https://zoom.us/j/11223344556" },
    { s: "amara.osei@thebinder.test", t: "marcus.bell@thebinder.test", when: at(8, 16, 0), topic: "Trigonometry — non-right-angled triangles", status: "scheduled" },

    // Kit — English
    { s: "kit.marchetti@thebinder.test", t: "sofia.reyes@thebinder.test", when: at(-5, 18, 0), topic: "Othello — structuring the comparative essay", status: "completed" },
    { s: "kit.marchetti@thebinder.test", t: "sofia.reyes@thebinder.test", when: at(3, 18, 0), topic: "Unseen poetry technique", status: "scheduled" },

    // Noor — A Level Maths
    { s: "noor.haddad@thebinder.test", t: "alice.nwosu@thebinder.test", when: at(-8, 19, 0), topic: "Integration by parts", status: "completed" },
    { s: "noor.haddad@thebinder.test", t: "alice.nwosu@thebinder.test", when: at(4, 19, 0), topic: "Differential equations", status: "scheduled", zoom: "https://zoom.us/j/55667788990" },
  ] as const;

  const { data: sessions, error: sessionError } = await db
    .from("sessions")
    .insert(
      sessionRows.map((row) => ({
        student_id: S(row.s),
        teacher_id: T(row.t),
        scheduled_at: row.when,
        topic: row.topic,
        status: row.status,
        duration_minutes: 60,
        zoom_link: "zoom" in row ? row.zoom : null,
      })),
    )
    .select("id, student_id, scheduled_at, topic");
  if (sessionError) throw sessionError;
  console.log(`\n  ${sessions.length} sessions`);

  const sessionByTopic = new Map(sessions.map((s) => [s.topic, s.id]));

  // ----------------------------------------------------------------- notes
  const { error: noteError } = await db.from("notes").insert([
    {
      student_id: S("jonah.price@thebinder.test"),
      teacher_id: T("alice.nwosu@thebinder.test"),
      session_id: sessionByTopic.get("Capacitors — discharge curves") ?? null,
      title: "Capacitors — discharge curves",
      summary:
        "We derived the exponential discharge equation from first principles rather than quoting it. Jonah is now confident finding the time constant from a graph.\n\nBefore next time: Q3 and Q4 from the 2019 paper, and re-read the log-linear plot section.",
      uploaded_at: at(-7, 19, 0),
    },
    {
      student_id: S("jonah.price@thebinder.test"),
      teacher_id: T("alice.nwosu@thebinder.test"),
      session_id: sessionByTopic.get("Gravitational fields past paper") ?? null,
      title: "Gravitational fields — past paper feedback",
      summary:
        "Method is sound; marks are being lost on units and on not stating the assumption about point masses. Worth writing the assumption line out every single time.",
      uploaded_at: at(-14, 19, 0),
    },
    {
      student_id: S("amara.osei@thebinder.test"),
      teacher_id: T("marcus.bell@thebinder.test"),
      session_id: sessionByTopic.get("Surds and indices") ?? null,
      title: "Surds and indices — worked examples",
      summary:
        "Big improvement on rationalising denominators. The remaining wobble is negative fractional indices — we'll open with those next week.\n\nPractice: exercise 4C, questions 1–12.",
      uploaded_at: at(-3, 17, 30),
    },
    {
      student_id: S("kit.marchetti@thebinder.test"),
      teacher_id: T("sofia.reyes@thebinder.test"),
      session_id: sessionByTopic.get("Othello — structuring the comparative essay") ?? null,
      title: "Othello — essay structure",
      summary:
        "Kit's argument is genuinely original but currently arrives in paragraph four. We restructured so the thesis lands in the opening and every paragraph tests it.",
      uploaded_at: at(-5, 20, 0),
    },
    {
      student_id: S("noor.haddad@thebinder.test"),
      teacher_id: T("alice.nwosu@thebinder.test"),
      session_id: sessionByTopic.get("Integration by parts") ?? null,
      title: "Integration by parts — choosing u",
      summary:
        "LIATE as a rule of thumb, plus the two cases where it misleads. Noor spotted the recursive trick for e^x sin x without prompting.",
      uploaded_at: at(-8, 20, 30),
    },
  ]);
  if (noteError) throw noteError;
  console.log("  5 lesson notes");

  // ------------------------------------------------------------- questions
  const { error: questionError } = await db.from("questions").insert([
    {
      student_id: S("jonah.price@thebinder.test"),
      teacher_id: T("alice.nwosu@thebinder.test"),
      session_id: sessionByTopic.get("Capacitors — discharge curves") ?? null,
      question_text:
        "On Q4 of the 2019 paper I get 2.3 ms for the time constant but the mark scheme says 2.3 s. Have I mixed up microfarads somewhere?",
      answer_text:
        "You have — C is 470 µF, not 470 nF. Convert to 4.7 × 10⁻⁴ F and the arithmetic falls out at 2.3 s. Worth writing the conversion on its own line before you substitute; that's where this always goes wrong.",
      read_by_student: true,
      created_at: at(-6, 20, 15),
    },
    {
      student_id: S("amara.osei@thebinder.test"),
      teacher_id: T("marcus.bell@thebinder.test"),
      session_id: sessionByTopic.get("Surds and indices") ?? null,
      question_text:
        "For question 8 do I rationalise first or expand the brackets first? I got a different answer each way.",
      answer_text:
        "Expand first, then rationalise once at the end — you'll only have one surd to deal with. Getting two different answers means a sign slipped in the expansion; check the middle term.",
      read_by_student: false,
      created_at: at(-2, 18, 40),
    },
    {
      student_id: S("kit.marchetti@thebinder.test"),
      teacher_id: T("sofia.reyes@thebinder.test"),
      question_text:
        "Is it alright to disagree with the critic I'm quoting, or does that look like I've misunderstood them?",
      created_at: at(-1, 21, 5),
    },
    {
      student_id: S("noor.haddad@thebinder.test"),
      teacher_id: T("alice.nwosu@thebinder.test"),
      session_id: sessionByTopic.get("Integration by parts") ?? null,
      question_text:
        "I'm stuck on the recursive one from the sheet — after two rounds of parts I'm back where I started. What am I missing?",
      created_at: at(0, 9, 20),
    },
  ]);
  if (questionError) throw questionError;
  console.log("  4 questions (2 answered, 2 open)");

  // -------------------------------------------------------------- invoices
  const { error: invoiceError } = await db.from("invoices").insert([
    {
      student_id: S("jonah.price@thebinder.test"),
      teacher_id: T("alice.nwosu@thebinder.test"),
      description: "Tuition — 3 sessions",
      hours: 3,
      amount: 195,
      teacher_payout_amount: 126,
      status: "paid",
      issued_at: dateOnly(-30),
      due_date: dateOnly(-16),
      paid_at: at(-18, 10, 0),
      period_start: dateOnly(-30),
      period_end: dateOnly(-1),
      payout_status: "paid",
      payout_paid_at: at(-15, 10, 0),
    },
    {
      student_id: S("amara.osei@thebinder.test"),
      teacher_id: T("marcus.bell@thebinder.test"),
      description: "Tuition — 2 sessions",
      hours: 2,
      amount: 120,
      teacher_payout_amount: 76,
      status: "due",
      issued_at: dateOnly(-6),
      due_date: dateOnly(8),
      period_start: dateOnly(-30),
      period_end: dateOnly(-1),
      payout_status: "pending",
    },
    {
      student_id: S("kit.marchetti@thebinder.test"),
      teacher_id: T("sofia.reyes@thebinder.test"),
      description: "Tuition — 1 session",
      hours: 1,
      amount: 65,
      teacher_payout_amount: 40,
      status: "overdue",
      issued_at: dateOnly(-40),
      due_date: dateOnly(-12),
      period_start: dateOnly(-40),
      period_end: dateOnly(-20),
      payout_status: "pending",
    },
    {
      student_id: S("noor.haddad@thebinder.test"),
      teacher_id: T("alice.nwosu@thebinder.test"),
      description: "Tuition — 1 session",
      hours: 1,
      amount: 65,
      teacher_payout_amount: 42,
      status: "due",
      issued_at: dateOnly(-4),
      due_date: dateOnly(10),
      payout_status: "processing",
    },
  ]);
  if (invoiceError) throw invoiceError;
  console.log("  4 invoices");

  // ------------------------------------------------------------- enquiries
  const { error: enquiryError } = await db.from("enquiries").insert([
    {
      name: "Rachel Okonjo",
      email: "rachel.okonjo@thebinder.test",
      role: "parent_student",
      subject: "GCSE Chemistry",
      message:
        "My daughter is in Year 10 and has gone from enjoying chemistry to dreading it since the mocks. Looking for someone patient who can rebuild her confidence before the summer.",
      status: "new",
    },
    {
      name: "Idris Ahmed",
      email: "idris.ahmed@thebinder.test",
      role: "prospective_tutor",
      subject: "A Level Further Maths",
      message:
        "Maths PhD student, three years of tutoring alongside my research. I'd particularly like to take on Further Maths and STEP students. CV available on request.",
      status: "new",
    },
    {
      name: "Fiona Buckley",
      email: "fiona.buckley@thebinder.test",
      role: "parent_student",
      subject: "11+ preparation",
      message:
        "We're looking at 11+ for January entry. Is it too late to start, and roughly what would a weekly session cost?",
      status: "contacted",
      admin_note: "Called back 2 Sept — sending over the 11+ pack, deciding by Friday.",
    },
  ]);
  if (enquiryError) throw enquiryError;
  console.log("  3 enquiries\n");

  console.log("Done. Sign in with any of these — password is the same for all:\n");
  console.log(`  password: ${DEMO_PASSWORD}\n`);
  console.log("  Admin    /login/admin   admin@thebinder.test");
  console.log("  Teacher  /login         alice.nwosu@thebinder.test");
  console.log("  Student  /login         jonah.price@thebinder.test");
  console.log("\nTheo Lindqvist is deliberately left unassigned so the admin");
  console.log("Connections page has a student waiting to be matched.\n");
}

main().catch((error) => {
  console.error("\nSeed failed:", error?.message ?? error);
  process.exit(1);
});
