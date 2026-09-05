import type { Metadata } from "next";
import { requireStudent } from "@/lib/auth";
import { amountDue, getStudentInvoices } from "@/lib/queries/student";
import { formatDate, formatHours, formatMoney } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeading, Stat } from "@/components/ui";
import type { InvoiceStatus } from "@/lib/database.types";

export const metadata: Metadata = { title: "Invoices" };

const STATUS_TONE: Record<InvoiceStatus, "sage" | "mustard" | "clay" | "neutral"> = {
  paid: "sage",
  due: "mustard",
  overdue: "clay",
  draft: "neutral",
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: "Paid",
  due: "Due",
  overdue: "Overdue",
  draft: "Draft",
};

export default async function StudentInvoicesPage() {
  const { student } = await requireStudent();
  const invoices = await getStudentInvoices(student.id);

  const due = amountDue(invoices);
  const paid = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  const overdue = invoices.filter((invoice) => invoice.status === "overdue").length;

  return (
    <>
      <PageHeading
        title="Invoices"
        description="Charges raised by the agency. Payment is arranged with the agency directly."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Outstanding" value={formatMoney(due)} tone={due > 0 ? "clay" : "sage"} />
        <Stat label="Paid to date" value={formatMoney(paid)} tone="sage" />
        <Stat
          label="Overdue"
          value={overdue}
          hint={overdue ? "please settle these" : "nothing overdue"}
          tone={overdue ? "clay" : "ink"}
        />
      </div>

      <Card className="mt-6">
        {invoices.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No invoices yet"
              description="Charges for your lessons will be listed here once the agency raises them."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-paper-200 text-left text-xs uppercase tracking-[0.06em] text-ink-400">
                  <th className="px-5 py-3 font-semibold">Description</th>
                  <th className="px-5 py-3 font-semibold">Issued</th>
                  <th className="px-5 py-3 font-semibold">Due</th>
                  <th className="px-5 py-3 text-right font-semibold">Hours</th>
                  <th className="px-5 py-3 text-right font-semibold">Amount</th>
                  <th className="px-5 py-3 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-200">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-5 py-3 text-ink-800">
                      {invoice.description ?? "Tuition"}
                      {invoice.period_start && invoice.period_end ? (
                        <span className="mt-0.5 block text-xs text-ink-400">
                          {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-ink-600">{formatDate(invoice.issued_at)}</td>
                    <td className="px-5 py-3 text-ink-600">{formatDate(invoice.due_date)}</td>
                    <td className="px-5 py-3 text-right text-ink-600">
                      {formatHours(invoice.hours)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-ink-900">
                      {formatMoney(invoice.amount, invoice.currency)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Badge tone={STATUS_TONE[invoice.status]}>
                        {STATUS_LABEL[invoice.status]}
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
