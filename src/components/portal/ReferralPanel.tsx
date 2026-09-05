import { submitReferral } from "@/app/actions/referrals";
import { ActionForm } from "@/components/portal/ActionForm";
import { ReferralCode } from "@/components/portal/ReferralCode";
import {
  REFERRAL_LABEL,
  REFERRAL_TONE,
  referralTotals,
} from "@/lib/queries/referrals";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeading, Stat } from "@/components/ui";
import type { Referral } from "@/lib/database.types";

/**
 * Shared by the teacher and student "Refer a friend" pages — the mechanics are
 * identical, only the audience differs.
 */
export function ReferralPanel({
  referralCode,
  referrals,
  audience,
}: {
  referralCode: string;
  referrals: Referral[];
  audience: "student" | "teacher";
}) {
  const { earned, awaitingPayout, paid } = referralTotals(referrals);

  return (
    <>
      <PageHeading
        title="Refer a friend"
        description="Recommend someone to the agency and earn 10% of their first lesson."
      />

      <Card className="mb-6 p-5 sm:p-6">
        <ReferralCode code={referralCode} />
        <p className="mt-5 border-t border-paper-200 pt-4 text-sm leading-relaxed text-ink-600">
          Share your code with{" "}
          {audience === "teacher"
            ? "families or colleagues who are looking for a tutor"
            : "friends and classmates who could use a tutor"}
          . When they enquire, they enter your code — or you can log the referral below and
          we&apos;ll take it from there. Once the agency matches them and their{" "}
          <strong className="font-semibold text-ink-800">first invoice is paid</strong>, you earn{" "}
          <strong className="font-semibold text-ink-800">10% of it</strong>.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Referrals made" value={referrals.length} tone="ink" />
        <Stat
          label="Earned"
          value={formatMoney(earned)}
          hint={paid > 0 ? `${formatMoney(paid)} already paid` : "across all referrals"}
          tone="sage"
        />
        <Stat
          label="Awaiting payout"
          value={formatMoney(awaitingPayout)}
          hint={awaitingPayout > 0 ? "the agency will be in touch" : "nothing outstanding"}
          tone="mustard"
        />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Log a referral"
          description="Already told someone about us? Let the agency know so you get credited."
        />
        <div className="p-5">
          <ActionForm action={submitReferral} submitLabel="Log referral" variant="mustard">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="ref-name">
                  Their name
                </label>
                <input
                  id="ref-name"
                  name="referred_name"
                  required
                  maxLength={120}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="ref-email">
                  Their email{" "}
                  <span className="font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  id="ref-email"
                  name="referred_email"
                  type="email"
                  maxLength={200}
                  className="field-input"
                />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="ref-note">
                Anything we should know?
              </label>
              <textarea
                id="ref-note"
                name="note"
                rows={3}
                maxLength={1000}
                placeholder="e.g. Year 11, needs GCSE Maths before the spring mocks."
                className="field-input resize-y"
              />
            </div>
          </ActionForm>
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Your referrals" />
        {referrals.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No referrals yet"
              description="Share your code above, or log a referral so the agency knows who to credit."
            />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {referrals.map((referral) => (
              <li key={referral.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-800">
                      {referral.referred_name}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      Referred {formatRelative(referral.created_at)}
                      {referral.paid_at ? ` · paid ${formatDate(referral.paid_at)}` : ""}
                    </p>
                    {referral.note ? (
                      <p className="mt-1.5 text-xs text-ink-500">{referral.note}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={REFERRAL_TONE[referral.status]}>
                      {REFERRAL_LABEL[referral.status]}
                    </Badge>
                    {referral.commission_amount !== null ? (
                      <p className="mt-1.5 font-serif text-lg text-ink-900">
                        {formatMoney(referral.commission_amount, referral.currency)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-xs text-ink-400">
        Commission is 10% of the referred student&apos;s first paid invoice. It&apos;s recorded
        here as soon as that invoice settles, and paid out by the agency.
      </p>
    </>
  );
}
