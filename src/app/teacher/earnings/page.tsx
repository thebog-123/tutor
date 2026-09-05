import type { Metadata } from "next";
import { requireTeacher } from "@/lib/auth";
import { getTeacherInvoices, getTeacherSessions } from "@/lib/queries/teacher";
import { formatDate, formatHours, formatMoney } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeading, Stat } from "@/components/ui";
import type { PayoutStatus } from "@/lib/database.types";

export const metadata: Metadata = { title: "Earnings" };

const PAYOUT_TONE: Record<PayoutStatus, "sage" | "mustard" | "neutral"> = {
  paid: "sage",
  processing: "mustard",
  pending: "neutral",
};

const PAYOUT_LABEL: Record<PayoutStatus, string> = {
  paid: "Paid",
  processing: "Processing",
  pending: "Pending",
};

export default async function TeacherEarningsPage() {
  const { teacher } = await requireTeacher();
  const [invoices, allSessions] = await Promise.all([
    getTeacherInvoices(teacher.id),
    getTeacherSessions(teacher.id, { limit: 500 }),
  ]);

  const taught = allSessions.filter((session) => session.status === "completed");
  const hoursTaught = taught.reduce(
    (sum, session) => sum + session.duration_minutes / 60,
    0,
  );

  const owed = invoices
    .filter((invoice) => invoice.payout_status !== "paid")
    .reduce((sum, invoice) => sum + Number(invoice.teacher_payout_amount), 0);
  const paidOut = invoices
    .filter((invoice) => invoice.payout_status === "paid")
    .reduce((sum, invoice) => sum + Number(invoice.teacher_payout_amount), 0);

  return (
    <>
      <PageHeading
        title="Earnings"
        description="What you've taught, and what the agency owes you. Payouts are marked off by the agency."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sessions taught" value={taught.length} tone="sage" />
        <Stat label="Hours taught" value={formatHours(hoursTaught)} tone="sage" />
        <Stat label="Owed to you" value={formatMoney(owed)} hint="not yet paid out" tone="mustard" />
        <Stat label="Paid to date" value={formatMoney(paidOut)} tone="ink" />
      </div>

      {teacher.hourly_rate ? (
        <p className="mt-4 text-sm text-ink-500">
          Your agreed rate is{" "}
          <span className="font-semibold text-ink-800">
            {formatMoney(teacher.hourly_rate)}
          </span>{" "}
          per hour.
        </p>
      ) : null}

      <Card className="mt-6">
        <CardHeader
          title="Payouts"
          description="One row per invoice the agency has raised for your students."
        />
        {invoices.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No earnings recorded yet"
              description="Once the agency raises an invoice for a lesson you've taught, it shows up here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead>
                <tr className="border-b border-paper-200 text-left text-xs uppercase tracking-[0.06em] text-ink-400">
                  <th className="px-5 py-3 font-semibold">Student</th>
                  <th className="px-5 py-3 font-semibold">Period</th>
                  <th className="px-5 py-3 text-right font-semibold">Hours</th>
                  <th className="px-5 py-3 text-right font-semibold">Your payout</th>
                  <th className="px-5 py-3 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-200">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-5 py-3">
                      <span className="font-medium text-ink-800">
                        {invoice.student?.user?.full_name ?? "Student"}
                      </span>
                      {invoice.description ? (
                        <span className="mt-0.5 block text-xs text-ink-400">
                          {invoice.description}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-ink-600">
                      {invoice.period_start && invoice.period_end
                        ? `${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`
                        : formatDate(invoice.issued_at)}
                    </td>
                    <td className="px-5 py-3 text-right text-ink-600">
                      {formatHours(invoice.hours)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-ink-900">
                      {formatMoney(invoice.teacher_payout_amount, invoice.currency)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Badge tone={PAYOUT_TONE[invoice.payout_status]}>
                        {PAYOUT_LABEL[invoice.payout_status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
