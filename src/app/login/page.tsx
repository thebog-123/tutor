import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="paper-grain flex min-h-screen flex-col items-center justify-center bg-paper-100 px-5 py-12">
      <Link href="/" className="mb-8 text-center focus-ring rounded-lg">
        <span className="font-serif text-2xl tracking-tight text-ink-900">The Binder</span>
        <span className="mt-1 block text-xs uppercase tracking-[0.22em] text-mustard-600">
          Tutoring
        </span>
      </Link>

      <Card className="w-full max-w-md p-7 shadow-lift">
        <h1 className="font-serif text-2xl text-ink-900">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-500">
          Sign in to your portal. Accounts are created by the agency — there is no signup.
        </p>

        {error === "profile_incomplete" ? (
          <p className="mt-4 rounded-lg border border-mustard-200 bg-mustard-100 px-3 py-2 text-sm text-mustard-700">
            Your account exists but its profile hasn&apos;t been finished yet. Please contact the
            agency.
          </p>
        ) : null}

        <div className="mt-6">
          <LoginForm mode="portal" />
        </div>
      </Card>

      <div className="mt-6 flex flex-col items-center gap-2 text-sm text-ink-500">
        <Link href="/login/admin" className="focus-ring rounded underline decoration-mustard-400 underline-offset-4 hover:text-ink-800">
          Agency admin login
        </Link>
        <Link href="/#enquire" className="focus-ring rounded hover:text-ink-800">
          Not with us yet? Send an enquiry
        </Link>
      </div>
    </main>
  );
}
