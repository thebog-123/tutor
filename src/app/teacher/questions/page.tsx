import Link from "next/link";
import type { Metadata } from "next";
import { requireTeacher } from "@/lib/auth";
import { getTeacherQuestions, getTeacherStudents } from "@/lib/queries/teacher";
import { formatDateTime, formatRelative } from "@/lib/format";
import { answerQuestion } from "@/app/teacher/actions";
import { ActionForm } from "@/components/portal/ActionForm";
import { Badge, Card, EmptyState, PageHeading, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Questions" };

export default async function TeacherQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const { teacher } = await requireTeacher();
  const { student: studentFilter } = await searchParams;

  const [questions, students] = await Promise.all([
    getTeacherQuestions(teacher.id),
    getTeacherStudents(teacher.id),
  ]);

  const activeStudent = students.find((s) => s.id === studentFilter);
  const visible = activeStudent
    ? questions.filter((q) => q.student_id === activeStudent.id)
    : questions;

  const open = visible.filter((q) => q.status === "open");
  const answered = visible.filter((q) => q.status === "answered");

  return (
    <>
      <PageHeading
        title="Questions"
        description="Anything your students have asked between lessons."
      />

      {students.length > 0 ? (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/teacher/questions"
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-ring",
              !activeStudent
                ? "border-ink-800 bg-ink-800 text-paper-50"
                : "border-paper-300 bg-paper-50 text-ink-600 hover:border-ink-300",
            )}
          >
            All students
          </Link>
          {students.map((student) => (
            <Link
              key={student.id}
              href={`/teacher/questions?student=${student.id}`}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-ring",
                activeStudent?.id === student.id
                  ? "border-ink-800 bg-ink-800 text-paper-50"
                  : "border-paper-300 bg-paper-50 text-ink-600 hover:border-ink-300",
              )}
            >
              {student.user?.full_name ?? "Student"}
            </Link>
          ))}
        </div>
      ) : null}

      <section>
        <h2 className="mb-3 font-serif text-lg text-ink-900">
          Waiting for a reply
          {open.length ? (
            <span className="ml-2 rounded-full bg-mustard-500 px-2 py-0.5 text-xs font-bold text-ink-900">
              {open.length}
            </span>
          ) : null}
        </h2>

        {open.length === 0 ? (
          <EmptyState
            title="Nothing to answer"
            description="You're all caught up. New questions from your students land here."
          />
        ) : (
          <ul className="space-y-4">
            {open.map((question) => (
              <li key={question.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink-800">
                      {question.student?.user?.full_name ?? "Student"}
                    </p>
                    <span className="text-xs text-ink-400">
                      Asked {formatRelative(question.created_at)}
                    </span>
                  </div>
                  {question.session ? (
                    <p className="mt-1 text-xs text-ink-400">
                      About the session on {formatDateTime(question.session.scheduled_at)}
                      {question.session.topic ? ` — ${question.session.topic}` : ""}
                    </p>
                  ) : null}

                  <blockquote className="mt-3 border-l-2 border-mustard-400 bg-paper-100 px-4 py-3 text-sm leading-relaxed text-ink-700">
                    {question.question_text}
                  </blockquote>

                  <div className="mt-4">
                    <ActionForm
                      action={answerQuestion}
                      submitLabel="Post reply"
                      pendingLabel="Posting…"
                      variant="sage"
                      size="sm"
                    >
                      <input type="hidden" name="question_id" value={question.id} />
                      <label className="field-label" htmlFor={`answer-${question.id}`}>
                        Your reply
                      </label>
                      <textarea
                        id={`answer-${question.id}`}
                        name="answer_text"
                        required
                        rows={4}
                        maxLength={8000}
                        className="field-input resize-y"
                        placeholder="Answer the question, and point them at anything worth re-reading."
                      />
                    </ActionForm>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 font-serif text-lg text-ink-900">Answered</h2>
        {answered.length === 0 ? (
          <EmptyState title="No answered questions yet" />
        ) : (
          <ul className="space-y-4">
            {answered.map((question) => (
              <li key={question.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink-800">
                      {question.student?.user?.full_name ?? "Student"}
                    </p>
                    <Badge tone={question.read_by_student ? "neutral" : "sage"}>
                      {question.read_by_student ? "Read" : "Unread"}
                    </Badge>
                  </div>

                  <blockquote className="mt-3 border-l-2 border-paper-300 bg-paper-100 px-4 py-3 text-sm leading-relaxed text-ink-700">
                    {question.question_text}
                  </blockquote>

                  <div className="mt-3 rounded-lg bg-sage-100 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-sage-700">
                      Your reply · {formatRelative(question.answered_at)}
                    </p>
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                      {question.answer_text}
                    </p>
                  </div>

                  <details className="mt-3">
                    <summary className="cursor-pointer rounded text-xs font-semibold text-ink-500 focus-ring hover:text-ink-800">
                      Edit reply
                    </summary>
                    <div className="mt-3">
                      <ActionForm
                        action={answerQuestion}
                        submitLabel="Update reply"
                        pendingLabel="Updating…"
                        variant="outline"
                        size="sm"
                      >
                        <input type="hidden" name="question_id" value={question.id} />
                        <textarea
                          name="answer_text"
                          required
                          rows={4}
                          maxLength={8000}
                          defaultValue={question.answer_text ?? ""}
                          className="field-input resize-y"
                        />
                      </ActionForm>
                    </div>
                  </details>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
