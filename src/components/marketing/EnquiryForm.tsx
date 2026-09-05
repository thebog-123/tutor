"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitEnquiry, type EnquiryState } from "@/app/actions/enquiries";
import { Button } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" variant="mustard" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Sending…" : "Send enquiry"}
    </Button>
  );
}

export function EnquiryForm({ defaultReferralCode }: { defaultReferralCode?: string }) {
  const [state, formAction] = useActionState<EnquiryState, FormData>(submitEnquiry, {
    status: "idle",
    message: null,
  });

  if (state.status === "success") {
    return (
      <div className="rounded-card border border-sage-200 bg-sage-100 px-6 py-10 text-center">
        <p className="font-serif text-xl text-sage-700">Enquiry received</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-600">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="enq-name">
            Your name
          </label>
          <input id="enq-name" name="name" required maxLength={120} className="field-input" />
        </div>
        <div>
          <label className="field-label" htmlFor="enq-email">
            Email address
          </label>
          <input
            id="enq-email"
            name="email"
            type="email"
            required
            maxLength={200}
            className="field-input"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="enq-role">
            I&apos;m enquiring as
          </label>
          <select id="enq-role" name="role" required defaultValue="parent_student" className="field-input">
            <option value="parent_student">A parent or student</option>
            <option value="prospective_tutor">A prospective tutor</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="enq-subject">
            Subject &amp; level
          </label>
          <input
            id="enq-subject"
            name="subject"
            maxLength={160}
            placeholder="e.g. GCSE Maths"
            className="field-input"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="enq-referrer">
            Who referred you?{" "}
            <span className="font-normal normal-case tracking-normal">(optional)</span>
          </label>
          <input
            id="enq-referrer"
            name="referrer_name"
            maxLength={120}
            placeholder="Their name"
            className="field-input"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="enq-code">
            Referral code{" "}
            <span className="font-normal normal-case tracking-normal">(optional)</span>
          </label>
          <input
            id="enq-code"
            name="referral_code"
            maxLength={32}
            defaultValue={defaultReferralCode ?? ""}
            placeholder="e.g. K7PQ2M"
            className="field-input font-mono uppercase tracking-widest"
          />
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="enq-message">
          Message
        </label>
        <textarea
          id="enq-message"
          name="message"
          required
          rows={5}
          maxLength={4000}
          placeholder="Tell us about the student, the exam board, and what you're hoping to work on."
          className="field-input resize-y"
        />
      </div>

      {/* honeypot — visually hidden, never focusable */}
      <div className="hidden" aria-hidden>
        <label htmlFor="enq-company">Company</label>
        <input id="enq-company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      {state.status === "error" && state.message ? (
        <p
          role="alert"
          className="rounded-lg border border-clay-500/30 bg-clay-100 px-3 py-2 text-sm text-clay-600"
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <SubmitButton />
        <p className="text-xs text-ink-400">
          We only use these details to reply to your enquiry.
        </p>
      </div>
    </form>
  );
}
