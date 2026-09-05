import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EnquiryForm } from "@/components/marketing/EnquiryForm";
import { Badge, ButtonLink, Card } from "@/components/ui";
import type { PublicTutor } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const SUBJECTS = [
  { name: "Mathematics", levels: "KS3 · GCSE · A Level · STEP" },
  { name: "Physics", levels: "GCSE · A Level · IB" },
  { name: "Chemistry", levels: "GCSE · A Level" },
  { name: "Biology", levels: "GCSE · A Level" },
  { name: "English Literature", levels: "KS3 · GCSE · A Level" },
  { name: "History", levels: "GCSE · A Level" },
  { name: "Computer Science", levels: "GCSE · A Level" },
  { name: "Admissions", levels: "11+ · Oxbridge · UCAT" },
];

const STEPS = [
  {
    step: "01",
    title: "Send an enquiry",
    body: "Tell us the subject, level and exam board, plus anything the student is finding hard. It takes two minutes.",
  },
  {
    step: "02",
    title: "We match you",
    body: "The agency reads every enquiry by hand and pairs the student with a specialist tutor — no algorithm, no marketplace.",
  },
  {
    step: "03",
    title: "Work in the portal",
    body: "Lessons, notes, questions between sessions and invoices all live in one place, for the student and the tutor alike.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "Two grades in five months, but the real change is that she'll now sit down and start a past paper without being asked.",
    name: "Priya R.",
    detail: "Parent · A Level Chemistry",
  },
  {
    quote:
      "Being able to read back the notes from every lesson before a mock was the thing that actually made the difference.",
    name: "Tom H.",
    detail: "Student · GCSE Maths",
  },
  {
    quote:
      "As a tutor, having the notes, the questions and the invoicing in one binder means I spend my time teaching.",
    name: "Dr Alice Nwosu",
    detail: "Tutor · Physics",
  },
];

async function getTutors(): Promise<PublicTutor[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("public_tutors")
      .select("*")
      .order("full_name")
      .limit(6);
    return (data as PublicTutor[]) ?? [];
  } catch {
    // Supabase isn't configured yet — the marketing page still renders.
    return [];
  }
}

export default async function HomePage() {
  const tutors = await getTutors();

  return (
    <div className="paper-grain min-h-screen bg-paper-100">
      {/* ------------------------------------------------------------ nav */}
      <header className="sticky top-0 z-30 border-b border-paper-300/70 bg-paper-100/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="focus-ring rounded">
            <span className="font-serif text-xl tracking-tight text-ink-900">The Binder</span>
            <span className="ml-2 hidden text-xs uppercase tracking-[0.2em] text-mustard-600 sm:inline">
              Tutoring
            </span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <a
              href="#subjects"
              className="hidden rounded px-2 py-1 text-sm text-ink-600 focus-ring hover:text-ink-900 sm:inline"
            >
              Subjects
            </a>
            <a
              href="#tutors"
              className="hidden rounded px-2 py-1 text-sm text-ink-600 focus-ring hover:text-ink-900 sm:inline"
            >
              Tutors
            </a>
            <a
              href="#enquire"
              className="hidden rounded px-2 py-1 text-sm text-ink-600 focus-ring hover:text-ink-900 sm:inline"
            >
              Enquire
            </a>
            <ButtonLink href="/login" variant="outline" size="sm">
              Log in
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main>
        {/* --------------------------------------------------------- hero */}
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <Badge tone="sage">Hand-matched private tutoring</Badge>
              <h1 className="mt-5 font-serif text-4xl leading-[1.1] text-ink-900 sm:text-5xl lg:text-6xl">
                Every lesson, note and question — kept in one binder.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg">
                We match students with specialist tutors by hand, then give both of them a portal
                where the work actually lives: lesson notes after every session, questions answered
                between them, and a schedule nobody has to chase.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="#enquire" variant="primary" size="lg">
                  Enquire about a tutor
                </ButtonLink>
                <ButtonLink href="#how" variant="outline" size="lg">
                  How it works
                </ButtonLink>
              </div>
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-paper-300 pt-6">
                {[
                  ["1 : 1", "Every session"],
                  ["48 hrs", "Typical match time"],
                  ["No", "Sign-up fees"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <dt className="sr-only">{label}</dt>
                    <dd>
                      <span className="block font-serif text-2xl text-ink-900">{value}</span>
                      <span className="mt-0.5 block text-xs text-ink-400">{label}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* stylised "binder" card stack */}
            <div className="relative mx-auto w-full max-w-md lg:mx-0">
              <div className="absolute -left-3 top-5 hidden h-full w-full rounded-card border border-paper-300 bg-paper-200 sm:block" />
              <div className="absolute -left-1.5 top-2.5 hidden h-full w-full rounded-card border border-paper-300 bg-paper-50 sm:block" />
              <Card className="relative p-6 shadow-lift">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                    Tuesday · 17:30
                  </p>
                  <Badge tone="mustard">Upcoming</Badge>
                </div>
                <h3 className="mt-3 font-serif text-xl text-ink-900">
                  Quadratic inequalities &amp; sketching
                </h3>
                <p className="mt-1 text-sm text-ink-500">A Level Maths · with Dr Alice Nwosu</p>

                <div className="mt-5 space-y-3 border-t border-paper-200 pt-5">
                  {[
                    ["Lesson notes", "Uploaded 4 Sept", "sage"],
                    ["Open question", "Answered · 2 hrs ago", "mustard"],
                    ["September invoice", "Paid", "sage"],
                  ].map(([label, meta, tone]) => (
                    <div key={label} className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-ink-800">{label}</span>
                      <Badge tone={tone as "sage" | "mustard"}>{meta}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- subjects */}
        <section id="subjects" className="border-y border-paper-300 bg-paper-50">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-serif text-3xl text-ink-900">Subjects &amp; levels</h2>
            <p className="mt-2 max-w-2xl text-ink-600">
              Our tutors are subject specialists — most are postgraduates or practising teachers in
              the subject they tutor.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SUBJECTS.map((subject) => (
                <li
                  key={subject.name}
                  className="rounded-card border border-paper-300 bg-paper-100 px-4 py-4 transition hover:border-sage-400 hover:bg-sage-100/40"
                >
                  <p className="font-serif text-lg text-ink-900">{subject.name}</p>
                  <p className="mt-1 text-xs text-ink-500">{subject.levels}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* -------------------------------------------------- how it works */}
        <section id="how" className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="font-serif text-3xl text-ink-900">How it works</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((item) => (
              <Card key={item.step} className="p-6">
                <span className="font-serif text-sm font-semibold text-mustard-600">
                  {item.step}
                </span>
                <h3 className="mt-2 font-serif text-xl text-ink-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{item.body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------- tutors */}
        <section id="tutors" className="border-y border-paper-300 bg-sage-100/40">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-serif text-3xl text-ink-900">Meet some of our tutors</h2>
            <p className="mt-2 max-w-2xl text-ink-600">
              You&apos;ll be introduced to one tutor, chosen for the student — not handed a list to
              sift through.
            </p>

            {tutors.length === 0 ? (
              <Card className="mt-8 border-dashed p-8 text-center">
                <p className="font-serif text-lg text-ink-800">Tutor profiles are on their way</p>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-500">
                  Once the agency publishes tutor profiles they appear here. Send an enquiry and
                  we&apos;ll introduce you to the right one directly.
                </p>
              </Card>
            ) : (
              <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {tutors.map((tutor) => (
                  <li key={tutor.id}>
                    <Card className="flex h-full flex-col p-6">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mustard-100 font-serif text-base font-semibold text-mustard-700">
                          {tutor.full_name
                            .split(" ")
                            .map((p) => p[0])
                            .filter(Boolean)
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-serif text-lg text-ink-900">
                            {tutor.full_name}
                          </p>
                          <p className="truncate text-xs text-ink-500">
                            {tutor.subject_specialty ?? "Tutor"}
                          </p>
                        </div>
                      </div>
                      {tutor.headline ? (
                        <p className="mt-4 font-serif text-sm text-sage-700">{tutor.headline}</p>
                      ) : null}
                      {tutor.bio ? (
                        <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-600">
                          {tutor.bio}
                        </p>
                      ) : null}
                      {tutor.years_experience ? (
                        <p className="mt-4 border-t border-paper-200 pt-3 text-xs text-ink-400">
                          {tutor.years_experience} years tutoring
                        </p>
                      ) : null}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* -------------------------------------------------- testimonials */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="font-serif text-3xl text-ink-900">What families say</h2>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((item) => (
              <li key={item.name}>
                <Card className="flex h-full flex-col p-6">
                  <p className="flex-1 font-serif text-base leading-relaxed text-ink-800">
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  <div className="mt-5 border-t border-paper-200 pt-4">
                    <p className="text-sm font-semibold text-ink-800">{item.name}</p>
                    <p className="text-xs text-ink-400">{item.detail}</p>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------------- enquire */}
        <section id="enquire" className="border-t border-paper-300 bg-paper-50">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="font-serif text-3xl text-ink-900">Enquire</h2>
              <p className="mt-3 max-w-md leading-relaxed text-ink-600">
                Tell us what you need and the agency will reply personally. There&apos;s no
                self-signup — we create your portal account once we&apos;ve matched you with a
                tutor.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-ink-600">
                {[
                  "No fees to enquire or to be matched",
                  "A named tutor, not a rotating pool",
                  "Portal access for the student and the parent",
                ].map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mustard-500"
                      aria-hidden
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <Card className="p-6 sm:p-8">
              <EnquiryForm />
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-paper-300 bg-ink-900">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-serif text-lg text-paper-50">The Binder</p>
            <p className="mt-1 text-sm text-ink-300">
              © {new Date().getFullYear()} The Binder Tutoring. All rights reserved.
            </p>
          </div>
          <div className="flex gap-5 text-sm">
            <Link href="/login" className="rounded text-paper-200 focus-ring hover:text-paper-50">
              Portal login
            </Link>
            <Link
              href="/login/admin"
              className="rounded text-ink-300 focus-ring hover:text-paper-50"
            >
              Agency admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
