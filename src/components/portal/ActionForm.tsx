"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, cn } from "@/components/ui";

export type ActionResult = { ok: boolean; message: string | null };

const IDLE: ActionResult = { ok: true, message: null };

function Submit({
  label,
  pendingLabel,
  variant,
  size,
  confirm,
  className,
}: {
  label: string;
  pendingLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  confirm?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {pending ? (pendingLabel ?? "Saving…") : label}
    </Button>
  );
}

/**
 * Wraps a server action that takes FormData and returns an ActionResult,
 * rendering its error inline. Success state is handled by revalidation, so
 * there is nothing to show on the happy path.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  variant = "primary",
  size = "md",
  confirm,
  className,
  buttonClassName,
  footer,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  confirm?: string;
  className?: string;
  buttonClassName?: string;
  footer?: React.ReactNode;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    async (_prev, formData) => action(formData),
    IDLE,
  );

  return (
    <form action={formAction} className={cn("space-y-3", className)}>
      {children}
      {state.ok === false && state.message ? (
        <p
          role="alert"
          className="rounded-lg border border-clay-500/30 bg-clay-100 px-3 py-2 text-sm text-clay-600"
        >
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Submit
          label={submitLabel}
          pendingLabel={pendingLabel}
          variant={variant}
          size={size}
          confirm={confirm}
          className={buttonClassName}
        />
        {footer}
      </div>
    </form>
  );
}
