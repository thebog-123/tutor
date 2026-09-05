import type { Metadata } from "next";
import { requireStudent } from "@/lib/auth";
import {
  countUnreadReplies,
  getStudentQuestions,
  getStudentSessions,
  getStudentTutor,
} from "@/lib/queries/student";
import { formatDateTime, formatRelative } from "@/lib/format";
import { askQuestion, withdrawQuestion } from "@/app/student/actions";
import { ActionForm } from "@/components/portal/ActionForm";
import { MarkRepliesRead } from "@/components/portal/MarkRepliesRead";
import { Badge, Card, CardHeader, EmptyState, PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Ask a question" };

export default async function StudentQuestionsPage() {
  const { student } = await requireStudent();
  const [questions, sessions, tutor] = await Promise.all([
    getStudentQuestions(student.id),
    getStudentSessions(student.id, { limit: 40 }),
    getStudentTutor(student.teacher_id),
  ]);

  const unread = countUnreadReplies(questions);

  return (
    <>
      <MarkRepliesRead unreadCount={unread} />

      <PageHeading
        title="Ask a question"
        description={
          tutor
            ? `Questions go straight to ${tutor.user?.full_name}. You'll see the reply here.`
            : "Questions go to your tutor once you're matched."
        }
      />

      {!student.teacher_id ? (
        <EmptyState
          title="No tutor assigned yet"
          description="Once the agency matches you with a tutor you'll be able to ask questions between lessons."
        />
      ) : (
        <Card className="mb-8">
          <CardHeader title="New question" />
          <div className="p-5">
            <ActionForm action={askQuestion} submitLabel="Send to my tutor" variant="mustard">
              <div>
                <label className="field-label" htmlFor="q-session">
                  About a particular lesson?{" "}
                  <span className="font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <select id="q-session" name="session_id" defaultValue="" className="field-input">
                  <option value="">Not about a specific lesson</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {formatDateTime(session.scheduled_at)}
                      {session.topic ? ` — ${session.topic}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="q-text">
                  Your question
                </label>
                <textarea
                  id="q-text"
                  name="question_text"
                  required
                  rows={4}
                  maxLength={4000}
                  placeholder="Be as specific as you can — which question, which step, and what you tried."
                  className="field-input resize-y"
                />
              </div>
            </ActionForm>
          </div>
        </Card>
      )}

      <h2 className="mb-3 font-serif text-lg text-ink-900">Your questions</h2>

      {questions.length === 0 ? (
        <EmptyState
          title="You haven't asked anything yet"
          description="Stuck on a past paper question between lessons? Ask here and your tutor will reply."
        />
      ) : (
        <ul className="space-y-4">
          {questions.map((question) => (
            <li key={question.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={question.status === "answered" ? "sage" : "mustard"}>
                    {question.status === "answered" ? "Answered" : "Waiting for a reply"}
                  </Badge>
                  <span className="text-xs text-ink-400">
                    Asked {formatRelative(question.created_at)}
                  </span>
                </div>

                {question.session ? (
                  <p className="mt-2 text-xs text-ink-400">
                    About the lesson on {formatDateTime(question.session.scheduled_at)}
                    {question.session.topic ? ` — ${question.session.topic}` : ""}
                  </p>
                ) : null}

                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-800">
                  {question.question_text}
                </p>

                {question.answer_text ? (
                  <div className="mt-4 rounded-lg bg-sage-100 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-sage-700">
                      Reply · {formatRelative(question.answered_at)}
                    </p>
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                      {question.answer_text}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-paper-200 pt-3">
                    <p className="flex-1 text-xs text-ink-400">
                      Your tutor hasn&apos;t replied yet. You can withdraw the question while
                      it&apos;s still open.
                    </p>
                    <ActionForm
                      action={withdrawQuestion}
                      submitLabel="Withdraw"
                      pendingLabel="Withdrawing…"
                      variant="ghost"
                      size="sm"
                      confirm="Withdraw this question?"
                      className="space-y-0"
                    >
                      <input type="hidden" name="question_id" value={question.id} />
                    </ActionForm>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
