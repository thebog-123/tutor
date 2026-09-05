import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAllQuestions } from "@/lib/queries/admin";
import { formatDateTime, formatRelative } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeading, Stat } from "@/components/ui";

export const metadata: Metadata = { title: "Question activity" };

/** Rough SLA signal: an open question older than this needs chasing. */
const STALE_HOURS = 48;

export default async function AdminQuestionsPage() {
  await requireAdmin();
  const questions = await getAllQuestions(300);

  const open = questions.filter((question) => question.status === "open");
  const stale = open.filter(
    (question) =>
      Date.now() - new Date(question.created_at).getTime() > STALE_HOURS * 60 * 60 * 1000,
  );

  return (
    <>
      <PageHeading
        title="Question activity"
        description="Every Q&A thread across the agency, newest first. Read-only."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Threads" value={questions.length} tone="ink" />
        <Stat label="Open" value={open.length} tone="mustard" />
        <Stat
          label={`Unanswered > ${STALE_HOURS}h`}
          value={stale.length}
          hint={stale.length ? "worth chasing the tutor" : "nothing overdue"}
          tone={stale.length ? "clay" : "sage"}
        />
      </div>

      {questions.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No questions yet"
            description="Students post questions from their own dashboard."
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {questions.map((question) => {
            const isStale =
              question.status === "open" &&
              Date.now() - new Date(question.created_at).getTime() >
                STALE_HOURS * 60 * 60 * 1000;

            return (
              <li key={question.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink-800">
                      {question.student?.user?.full_name ?? "Student"}{" "}
                      <span className="font-normal text-ink-400">asked</span>{" "}
                      {question.teacher?.user?.full_name ?? "their tutor"}
                    </p>
                    <div className="flex items-center gap-2">
                      {isStale ? <Badge tone="clay">Chase up</Badge> : null}
                      <Badge tone={question.status === "answered" ? "sage" : "mustard"}>
                        {question.status === "answered" ? "Answered" : "Open"}
                      </Badge>
                    </div>
                  </div>

                  <p className="mt-1 text-xs text-ink-400">
                    {formatRelative(question.created_at)}
                    {question.session
                      ? ` · about the lesson on ${formatDateTime(question.session.scheduled_at)}`
                      : ""}
                  </p>

                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                    {question.question_text}
                  </p>

                  {question.answer_text ? (
                    <div className="mt-3 rounded-lg bg-sage-100 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-sage-700">
                        Tutor reply · {formatRelative(question.answered_at)}
                      </p>
                      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                        {question.answer_text}
                      </p>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
