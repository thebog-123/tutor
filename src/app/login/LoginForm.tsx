"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, type LoginState } from "./actions";
import { Button, cn } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm({ mode }: { mode: "portal" | "admin" }) {
  const [role, setRole] = useState<"teacher" | "student">("student");
  const [state, formAction] = useActionState<LoginState, FormData>(signIn, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-5">
      {mode === "portal" ? (
        <>
          <input type="hidden" name="role" value={role} />
          <div
            role="radiogroup"
            aria-label="Account type"
            className="grid grid-cols-2 gap-1 rounded-xl border border-paper-300 bg-paper-100 p-1"
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
        </>
      ) : (
        <input type="hidden" name="role" value="admin" />
      )}

      <div>
        <label className="field-label" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="field-input"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field-input"
          placeholder="••••••••"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-clay-500/30 bg-clay-100 px-3 py-2 text-sm text-clay-600"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
