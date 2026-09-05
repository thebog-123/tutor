"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createAccount, type CreateAccountResult } from "@/app/admin/actions";
import { Button, cn } from "@/components/ui";

const IDLE: CreateAccountResult = { ok: true, message: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create account"}
    </Button>
  );
}

export function CreateAccountForm({
  teachers,
}: {
  teachers: Array<{ id: string; name: string }>;
}) {
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [state, formAction] = useActionState<CreateAccountResult, FormData>(
    async (_prev, formData) => createAccount(formData),
    IDLE,
  );

  return (
    <form action={formAction} className="space-y-4 p-5">
      <input type="hidden" name="role" value={role} />

      <div
        role="radiogroup"
        aria-label="Account type"
        className="grid grid-cols-2 gap-1 rounded-xl border border-paper-300 bg-paper-100 p-1 sm:max-w-xs"
      >
        {(["student", "teacher"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={role === option}
            onClick={() => setRole(option)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-semibold capitalize transition focus-ring",
              role === option
                ? "bg-paper-50 text-ink-900 shadow-card"
                : "text-ink-500 hover:text-ink-800",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="acc-name">
            Full name
          </label>
          <input id="acc-name" name="full_name" required maxLength={120} className="field-input" />
        </div>
        <div>
          <label className="field-label" htmlFor="acc-email">
            Email address
          </label>
          <input
            id="acc-email"
            name="email"
            type="email"
            required
            maxLength={200}
            className="field-input"
          />
        </div>
      </div>

      {role === "teacher" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="acc-specialty">
              Subject specialty
            </label>
            <input
              id="acc-specialty"
              name="subject_specialty"
              maxLength={120}
              placeholder="e.g. A Level Physics"
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="acc-rate">
              Hourly rate paid to tutor
            </label>
            <input
              id="acc-rate"
              name="hourly_rate"
              type="number"
              min={0}
              step="0.01"
              placeholder="35.00"
              className="field-input"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="acc-headline">
              Headline for the homepage
            </label>
            <input
              id="acc-headline"
              name="headline"
              maxLength={160}
              placeholder="e.g. Ten years of A Level Physics, and a habit of making mechanics click."
              className="field-input"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="acc-bio">
              Bio
            </label>
            <textarea id="acc-bio" name="bio" rows={3} maxLength={1200} className="field-input resize-y" />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="acc-year">
              Year group
            </label>
            <input
              id="acc-year"
              name="year_group"
              maxLength={40}
              placeholder="e.g. Year 12"
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="acc-subject">
              Subject needed
            </label>
            <input
              id="acc-subject"
              name="subject"
              maxLength={120}
              placeholder="e.g. GCSE Maths"
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="acc-guardian">
              Guardian name
            </label>
            <input id="acc-guardian" name="guardian_name" maxLength={120} className="field-input" />
          </div>
          <div>
            <label className="field-label" htmlFor="acc-guardian-email">
              Guardian email
            </label>
            <input
              id="acc-guardian-email"
              name="guardian_email"
              type="email"
              maxLength={200}
              className="field-input"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="acc-referral">
              Referral code{" "}
              <span className="font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="acc-referral"
              name="referral_code"
              maxLength={32}
              placeholder="From their enquiry, if someone referred them"
              className="field-input font-mono uppercase tracking-widest sm:max-w-xs"
            />
            <p className="mt-1 text-xs text-ink-400">
              Records a referral for the code&apos;s owner. They earn 10% of this student&apos;s
              first paid invoice.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="acc-teacher">
              Assign a tutor now{" "}
              <span className="font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <select id="acc-teacher" name="teacher_id" defaultValue="" className="field-input">
              <option value="">Leave unassigned — match later</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div>
        <label className="field-label" htmlFor="acc-password">
          Temporary password{" "}
          <span className="font-normal normal-case tracking-normal">
            (leave blank to generate one)
          </span>
        </label>
        <input
          id="acc-password"
          name="password"
          type="text"
          minLength={8}
          maxLength={72}
          autoComplete="off"
          className="field-input sm:max-w-xs"
        />
      </div>

      {state.ok === false && state.message ? (
        <p
          role="alert"
          className="rounded-lg border border-clay-500/30 bg-clay-100 px-3 py-2 text-sm text-clay-600"
        >
          {state.message}
        </p>
      ) : null}

      {state.ok && state.password ? (
        <div className="rounded-lg border border-sage-200 bg-sage-100 px-4 py-3">
          <p className="text-sm text-ink-700">{state.message}</p>
          <p className="mt-2 font-mono text-base font-semibold tracking-wide text-ink-900">
            {state.password}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            This is shown once and isn&apos;t stored anywhere you can read it again.
          </p>
        </div>
      ) : null}

      <Submit />
    </form>
  );
}
