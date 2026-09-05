import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- surfaces */

export function Card({
  className,
  children,
  ...rest
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-card border border-paper-300 bg-paper-50 shadow-card",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-paper-200 px-5 py-4">
      <div className="min-w-0">
        <h2 className="font-serif text-lg text-ink-900">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-ink-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-2xl text-ink-900 sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------------- buttons */

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition focus-ring disabled:cursor-not-allowed disabled:opacity-55";

const buttonVariants = {
  primary: "bg-ink-800 text-paper-50 hover:bg-ink-900",
  sage: "bg-sage-600 text-paper-50 hover:bg-sage-700",
  mustard: "bg-mustard-500 text-ink-900 hover:bg-mustard-600",
  outline:
    "border border-paper-300 bg-paper-50 text-ink-700 hover:border-ink-300 hover:bg-paper-100",
  ghost: "text-ink-600 hover:bg-paper-200 hover:text-ink-900",
  danger: "border border-clay-500 text-clay-600 hover:bg-clay-100",
} as const;

const buttonSizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5",
  lg: "px-5 py-3 text-base",
} as const;

type ButtonVariant = keyof typeof buttonVariants;
type ButtonSize = keyof typeof buttonSizes;

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...rest}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...rest}
    />
  );
}

/* -------------------------------------------------------------- indicators */

const badgeTones = {
  neutral: "bg-paper-200 text-ink-600 border-paper-300",
  sage: "bg-sage-100 text-sage-700 border-sage-200",
  mustard: "bg-mustard-100 text-mustard-700 border-mustard-200",
  clay: "bg-clay-100 text-clay-600 border-clay-500/30",
  ink: "bg-ink-800 text-paper-50 border-ink-800",
} as const;

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "sage",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "sage" | "mustard" | "ink" | "clay";
}) {
  const bar = {
    sage: "bg-sage-500",
    mustard: "bg-mustard-500",
    ink: "bg-ink-700",
    clay: "bg-clay-500",
  }[tone];

  return (
    <Card className="relative overflow-hidden p-5">
      <span className={cn("absolute inset-y-0 left-0 w-1", bar)} aria-hidden />
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
        {label}
      </p>
      <p className="mt-2 font-serif text-3xl text-ink-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-paper-300 bg-paper-100/60 px-6 py-12 text-center">
      <p className="font-serif text-base text-ink-800">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-ink-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
