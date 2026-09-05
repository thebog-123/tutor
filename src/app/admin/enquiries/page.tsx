import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAllEnquiries } from "@/lib/queries/admin";
import { formatDateTime, formatRelative } from "@/lib/format";
import { updateEnquiry } from "@/app/admin/actions";
import { ActionForm } from "@/components/portal/ActionForm";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeading,
  Stat,
} from "@/components/ui";
import type { EnquiryStatus } from "@/lib/database.types";

export const metadata: Metadata = { title: "Enquiries" };

const STATUS_TONE: Record<EnquiryStatus, "mustard" | "sage" | "neutral" | "ink"> = {
  new: "mustard",
  contacted: "ink",
  converted: "sage",
  closed: "neutral",
};

export default async function AdminEnquiriesPage() {
  await requireAdmin();
  const enquiries = await getAllEnquiries();

  const fresh = enquiries.filter((enquiry) => enquiry.status === "new");
  const converted = enquiries.filter((enquiry) => enquiry.status === "converted");

  return (
    <>
      <PageHeading
        title="Enquiries"
        description="Submissions from the homepage form. Turn the good ones into accounts."
        action={
          <ButtonLink href="/admin/people" variant="primary" size="sm">
            Create an account
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total" value={enquiries.length} tone="ink" />
        <Stat label="New" value={fresh.length} hint="not yet contacted" tone="mustard" />
        <Stat label="Converted" value={converted.length} hint="became accounts" tone="sage" />
      </div>

      {enquiries.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No enquiries yet"
            description="When someone fills in the homepage form, their message lands here."
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {enquiries.map((enquiry) => (
            <li key={enquiry.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-serif text-lg text-ink-900">{enquiry.name}</p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      <a
                        href={`mailto:${enquiry.email}`}
                        className="rounded underline decoration-paper-400 underline-offset-4 focus-ring hover:text-ink-800"
                      >
                        {enquiry.email}
                      </a>
                    </p>
                    <p className="mt-1 text-xs text-ink-400">
                      {enquiry.role === "prospective_tutor" ? "Prospective tutor" : "Parent or student"}
                      {enquiry.subject ? ` · ${enquiry.subject}` : ""} ·{" "}
                      {formatRelative(enquiry.created_at)} ({formatDateTime(enquiry.created_at)})
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[enquiry.status]}>{enquiry.status}</Badge>
                </div>

                {enquiry.referrer_name || enquiry.referral_code ? (
                  <p className="mt-3 rounded-lg border border-mustard-200 bg-mustard-100 px-3 py-2 text-xs text-ink-700">
                    Referred by{" "}
                    <span className="font-semibold">
                      {enquiry.referrer_name ?? "someone using a code"}
                    </span>
                    {enquiry.referral_code ? (
                      <>
                        {" "}
                        · code{" "}
                        <span className="font-mono font-semibold tracking-wider">
                          {enquiry.referral_code}
                        </span>
                      </>
                    ) : null}
                    . Enter this code when you create their account and the 10% commission is
                    recorded automatically.
                  </p>
                ) : null}

                <p className="mt-4 whitespace-pre-line rounded-lg bg-paper-100 px-4 py-3 text-sm leading-relaxed text-ink-700">
                  {enquiry.message}
                </p>

                <div className="mt-4 border-t border-paper-200 pt-4">
                  <ActionForm
                    action={updateEnquiry}
                    submitLabel="Save"
                    variant="outline"
                    size="sm"
                  >
                    <input type="hidden" name="enquiry_id" value={enquiry.id} />
                    <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                      <div>
                        <label className="field-label" htmlFor={`status-${enquiry.id}`}>
                          Status
                        </label>
                        <select
                          id={`status-${enquiry.id}`}
                          name="status"
                          defaultValue={enquiry.status}
                          className="field-input"
                        >
                          <option value="new">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="converted">Converted</option>
                          <option value="closed">Closed</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label" htmlFor={`note-${enquiry.id}`}>
                          Internal note
                        </label>
                        <input
                          id={`note-${enquiry.id}`}
                          name="admin_note"
                          defaultValue={enquiry.admin_note ?? ""}
                          maxLength={500}
                          placeholder="e.g. Matched with Alice — account created 5 Sept"
                          className="field-input"
                        />
                      </div>
                    </div>
                  </ActionForm>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
