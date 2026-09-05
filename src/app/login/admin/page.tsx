import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "../LoginForm";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Agency admin login" };

export default function AdminLoginPage() {
  return (
    <main className="paper-grain flex min-h-screen flex-col items-center justify-center bg-ink-900 px-5 py-12">
      <Link href="/" className="mb-8 text-center focus-ring rounded-lg">
        <span className="font-serif text-2xl tracking-tight text-paper-50">The Binder</span>
        <span className="mt-1 block text-xs uppercase tracking-[0.22em] text-mustard-400">
          Agency admin
        </span>
      </Link>

      <Card className="w-full max-w-md p-7 shadow-lift">
        <h1 className="font-serif text-2xl text-ink-900">Agency admin</h1>
        <p className="mt-1 text-sm text-ink-500">
          Manage connections, billing and enquiries for the whole agency.
        </p>
        <div className="mt-6">
          <LoginForm mode="admin" />
        </div>
      </Card>

      <Link
        href="/login"
        className="mt-6 rounded text-sm text-paper-300 underline decoration-mustard-400 underline-offset-4 focus-ring hover:text-paper-50"
      >
        Teacher or student? Log in here
      </Link>
    </main>
  );
}
