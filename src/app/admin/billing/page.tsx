import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAllInvoices, getAllStudents } from "@/lib/queries/admin";
import { formatDate, formatHours, formatMoney } from "@/lib/format";
import { createInvoice, updateInvoiceStatus, updatePayoutStatus } from "@/app/admin/actions";
import { ActionForm } from "@/components/portal/ActionForm";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeading,
  Stat,
} from "@/components/ui";
import type { InvoiceStatus, PayoutStatus } from "@/lib/database.types";

export const metadata: Metadata = { title: "Billing" };

const STATUS_TONE: Record<InvoiceStatus, "sage" | "mustard" | "clay" | "neutral"> = {
  paid: "sage",
  due: "mustard",
  overdue: "clay",
  draft: "neutral",
};

const PAYOUT_TONE: Record<PayoutStatus, "sage" | "mustard" | "neutral"> = {
  paid: "sage",
  processing: "mustard",
  pending: "neutral",
};

export default async function AdminBillingPage() {
  await requireAdmin();
  const [invoices, students] = await Promise.all([getAllInvoices(), getAllStudents()]);

  const billable = students.filter((student) => student.teacher_id);

  const sum = (predicate: (status: InvoiceStatus) => boolean) =>
    invoices
      .filter((invoice) => predicate(invoice.status))
      .reduce((total, invoice) => total + Number(invoice.amount), 0);

  const owedToTutors = invoices
    .filter((invoice) => invoice.payout_status !== "paid")
    .reduce((total, invoice) => total + Number(invoice.teacher_payout_amount), 0);

  return (
    <>
      <PageHeading
        title="Billing"
        description="Every invoice across the agency. Payments are recorded by hand for now."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Due" value={formatMoney(sum((s) => s === "due"))} tone="mustard" />
        <Stat label="Overdue" value={formatMoney(sum((s) => s === "overdue"))} tone="clay" />
        <Stat label="Paid" value={formatMoney(sum((s) => s === "paid"))} tone="sage" />
        <Stat
          label="Owed to tutors"
          value={formatMoney(owedToTutors)}
          hint="payouts not yet made"
          tone="ink"
        />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Raise an invoice"
          description="Billed against the student's currently assigned tutor."
        />
        <div className="p-5">
          {billable.length === 0 ? (
            <EmptyState
              title="No billable students"
              description="Assign a tutor to a student on the Connections page before raising an invoice."
            />
          ) : (
            <ActionForm action={createInvoice} submitLabel="Raise invoice">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <label className="field-label" htmlFor="inv-student">
                    Student
                  </label>
                  <select id="inv-student" name="student_id" required className="field-input">
                    {billable.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.user?.full_name}
                        {student.subject ? ` · ${student.subject}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="inv-status">
                    Status
                  </label>
                  <select
                    id="inv-status"
                    name="status"
                    defaultValue="due"
                    className="field-input"
                  >
                    <option value="draft">Draft</option>
                    <option value="due">Due</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="field-label" htmlFor="inv-description">
                    Description
                  </label>
                  <input
                    id="inv-description"
                    name="description"
                    maxLength={200}
                    placeholder="e.g. September tuition — 4 sessions"
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="inv-hours">
                    Hours
                  </label>
                  <input
                    id="inv-hours"
                    name="hours"
                    type="number"
                    min={0}
                    step="0.25"
                    defaultValue={0}
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="inv-amount">
                    Charged to student
                  </label>
                  <input
                    id="inv-amount"
                    name="amount"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="inv-payout">
                    Paid to tutor
                  </label>
                  <input
                    id="inv-payout"
                    name="teacher_payout_amount"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={0}
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="inv-due">
                    Due date
                  </label>
                  <input id="inv-due" name="due_date" type="date" className="field-input" />
                </div>
                <div>
                  <label className="field-label" htmlFor="inv-start">
                    Period start
                  </label>
                  <input id="inv-start" name="period_start" type="date" className="field-input" />
                </div>
                <div>
                  <label className="field-label" htmlFor="inv-end">
                    Period end
                  </label>
                  <input id="inv-end" name="period_end" type="date" className="field-input" />
                </div>
              </div>
            </ActionForm>
          )}
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="All invoices" description={`${invoices.length} raised`} />
        {invoices.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No invoices yet" description="Raise the first one above." />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-800">
                      {invoice.student?.user?.full_name ?? "Student"}
                      <span className="font-normal text-ink-400">
                        {" "}
                        · tutor {invoice.teacher?.user?.full_name ?? "—"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {invoice.description ?? "Tuition"} · issued{" "}
                      {formatDate(invoice.issued_at)}
                      {invoice.due_date ? ` · due ${formatDate(invoice.due_date)}` : ""} ·{" "}
                      {formatHours(invoice.hours)}
                    </p>
                    <p className="mt-2 font-serif text-xl text-ink-900">
                      {formatMoney(invoice.amount, invoice.currency)}
                      <span className="ml-2 text-sm font-sans text-ink-400">
                        tutor {formatMoney(invoice.teacher_payout_amount, invoice.currency)}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <p className="mb-1 flex items-center gap-2 text-xs text-ink-400">
                        Invoice
                        <Badge tone={STATUS_TONE[invoice.status]}>{invoice.status}</Badge>
                      </p>
                      <ActionForm
                        action={updateInvoiceStatus}
                        submitLabel="Set"
                        pendingLabel="…"
                        variant="outline"
                        size="sm"
                        className="flex items-end gap-2 space-y-0"
                      >
                        <input type="hidden" name="invoice_id" value={invoice.id} />
                        <select
                          name="status"
                          defaultValue={invoice.status}
                          aria-label="Invoice status"
                          className="field-input mt-0 w-32 py-1.5 text-xs"
                        >
                          <option value="draft">Draft</option>
                          <option value="due">Due</option>
                          <option value="paid">Paid</option>
                          <option value="overdue">Overdue</option>
                        </select>
                      </ActionForm>
                    </div>

                    <div>
                      <p className="mb-1 flex items-center gap-2 text-xs text-ink-400">
                        Payout
                        <Badge tone={PAYOUT_TONE[invoice.payout_status]}>
                          {invoice.payout_status}
                        </Badge>
                      </p>
                      <ActionForm
                        action={updatePayoutStatus}
                        submitLabel="Set"
                        pendingLabel="…"
                        variant="outline"
                        size="sm"
                        className="flex items-end gap-2 space-y-0"
                      >
                        <input type="hidden" name="invoice_id" value={invoice.id} />
                        <select
                          name="payout_status"
                          defaultValue={invoice.payout_status}
                          aria-label="Payout status"
                          className="field-input mt-0 w-32 py-1.5 text-xs"
                        >
                          <option value="pending">Pending</option>
                          <option value="processing">Processing</option>
                          <option value="paid">Paid</option>
                        </select>
                      </ActionForm>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-xs text-ink-400">
        Payment processing isn&apos;t wired up yet. The invoice table already carries
        provider, customer, invoice and payment id columns, so Stripe or GoCardless can be added
        without a schema change.
      </p>
    </>
  );
}
