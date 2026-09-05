import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAllStudents } from "@/lib/queries/admin";
import {
  REFERRAL_LABEL,
  REFERRAL_TONE,
  getAllReferrals,
} from "@/lib/queries/referrals";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import { createReferral, deleteReferral, updateReferral } from "@/app/admin/actions";
import { ActionForm } from "@/components/portal/ActionForm";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeading,
  Stat,
} from "@/components/ui";
import type { AppUser } from "@/lib/database.types";

export const metadata: Metadata = { title: "Referrals" };

export default async function AdminReferralsPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [referrals, students, { data: people }] = await Promise.all([
    getAllReferrals(),
    getAllStudents(),
    supabase
      .from("users")
      .select("id, full_name, email, role, referral_code")
      .in("role", ["student", "teacher"])
      .order("full_name"),
  ]);

  const users = (people as Array<Pick<AppUser, "id" | "full_name" | "email" | "role" | "referral_code">>) ?? [];

  const total = (status: string) =>
    referrals
      .filter((r) => r.status === status)
      .reduce((sum, r) => sum + Number(r.commission_amount ?? 0), 0);

  const pendingCount = referrals.filter((r) => r.status === "pending").length;

  return (
    <>
      <PageHeading
        title="Referrals"
        description="Who recommended whom, and what the agency owes them. Commission is 10% of the referred student's first paid invoice."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Referrals" value={referrals.length} tone="ink" />
        <Stat
          label="Awaiting first lesson"
          value={pendingCount}
          hint={pendingCount ? "no commission yet" : "none waiting"}
          tone="sage"
        />
        <Stat
          label="Owed"
          value={formatMoney(total("payable"))}
          hint="earned, not yet paid out"
          tone="mustard"
        />
        <Stat label="Paid out" value={formatMoney(total("paid"))} tone="sage" />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Record a referral"
          description="For referrals that came in by word of mouth rather than through the portal."
        />
        <div className="p-5">
          <ActionForm action={createReferral} submitLabel="Record referral">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="ref-user">
                  Referrer with an account
                </label>
                <select id="ref-user" name="referrer_user_id" defaultValue="" className="field-input">
                  <option value="">— Someone without an account —</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} · {user.role} · {user.referral_code}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-ink-400">
                  Pick someone here, or fill in the two fields opposite instead.
                </p>
              </div>
              <div className="grid gap-4">
                <div>
                  <label className="field-label" htmlFor="ref-ext-name">
                    Referrer name (no account)
                  </label>
                  <input id="ref-ext-name" name="referrer_name" maxLength={120} className="field-input" />
                </div>
                <div>
                  <label className="field-label" htmlFor="ref-ext-email">
                    Referrer email
                  </label>
                  <input
                    id="ref-ext-email"
                    name="referrer_email"
                    type="email"
                    maxLength={200}
                    className="field-input"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="field-label" htmlFor="ref-referred">
                  Person referred
                </label>
                <input
                  id="ref-referred"
                  name="referred_name"
                  maxLength={120}
                  placeholder="Their name"
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="ref-student">
                  Became this student
                </label>
                <select id="ref-student" name="student_id" defaultValue="" className="field-input">
                  <option value="">Not yet an account</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.user?.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="ref-override">
                  Override commission
                </label>
                <input
                  id="ref-override"
                  name="commission_amount_override"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Leave blank for 10%"
                  className="field-input"
                />
              </div>
            </div>
          </ActionForm>
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="All referrals" description={`${referrals.length} recorded`} />
        {referrals.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No referrals yet"
              description="Referrals logged by students and tutors land here, along with any you record by hand."
            />
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {referrals.map((referral) => (
              <li key={referral.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-800">
                      {referral.referrer_name}
                      <span className="font-normal text-ink-400"> referred </span>
                      {referral.referred_name}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {formatRelative(referral.created_at)}
                      {referral.referrer_user_id ? " · portal user" : " · no account"}
                      {referral.student_id
                        ? ` · account: ${referral.student?.user?.full_name ?? "linked"}`
                        : " · not yet an account"}
                      {referral.paid_at ? ` · paid ${formatDate(referral.paid_at)}` : ""}
                    </p>
                    {referral.note ? (
                      <p className="mt-1.5 text-xs text-ink-500">{referral.note}</p>
                    ) : null}
                    {referral.referrer_email ? (
                      <p className="mt-1 text-xs text-ink-400">{referral.referrer_email}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={REFERRAL_TONE[referral.status]}>
                      {REFERRAL_LABEL[referral.status]}
                    </Badge>
                    <p className="mt-1.5 font-serif text-xl text-ink-900">
                      {referral.commission_amount === null
                        ? "—"
                        : formatMoney(referral.commission_amount, referral.currency)}
                    </p>
                    {referral.commission_amount_override !== null ? (
                      <p className="text-xs text-ink-400">overridden</p>
                    ) : null}
                  </div>
                </div>

                <details className="mt-3 border-t border-paper-200 pt-3">
                  <summary className="cursor-pointer rounded text-xs font-semibold text-ink-500 focus-ring hover:text-ink-800">
                    Manage
                  </summary>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                    <ActionForm
                      action={updateReferral}
                      submitLabel="Save"
                      variant="outline"
                      size="sm"
                    >
                      <input type="hidden" name="referral_id" value={referral.id} />
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <label className="field-label" htmlFor={`rstatus-${referral.id}`}>
                            Status
                          </label>
                          <select
                            id={`rstatus-${referral.id}`}
                            name="status"
                            defaultValue={referral.status}
                            className="field-input"
                          >
                            <option value="pending">Pending</option>
                            <option value="payable">Payable</option>
                            <option value="paid">Paid</option>
                            <option value="void">Void</option>
                          </select>
                        </div>
                        <div>
                          <label className="field-label" htmlFor={`rstudent-${referral.id}`}>
                            Link to student
                          </label>
                          <select
                            id={`rstudent-${referral.id}`}
                            name="student_id"
                            defaultValue={referral.student_id ?? ""}
                            className="field-input"
                          >
                            <option value="">Not linked</option>
                            {students.map((student) => (
                              <option key={student.id} value={student.id}>
                                {student.user?.full_name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="field-label" htmlFor={`roverride-${referral.id}`}>
                            Override amount
                          </label>
                          <input
                            id={`roverride-${referral.id}`}
                            name="commission_amount_override"
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={referral.commission_amount_override ?? ""}
                            placeholder="10%"
                            className="field-input"
                          />
                        </div>
                        <div>
                          <label className="field-label" htmlFor={`rnote-${referral.id}`}>
                            Internal note
                          </label>
                          <input
                            id={`rnote-${referral.id}`}
                            name="admin_note"
                            defaultValue={referral.admin_note ?? ""}
                            maxLength={500}
                            className="field-input"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-ink-400">
                        Linking a referral to a student before their first invoice is paid lets
                        the 10% accrue on its own.
                      </p>
                    </ActionForm>

                    <div className="self-end">
                      <ActionForm
                        action={deleteReferral}
                        submitLabel="Delete"
                        pendingLabel="Deleting…"
                        variant="danger"
                        size="sm"
                        confirm="Delete this referral permanently?"
                        className="space-y-0"
                      >
                        <input type="hidden" name="referral_id" value={referral.id} />
                      </ActionForm>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
