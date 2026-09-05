import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="font-serif text-sm uppercase tracking-[0.2em] text-mustard-600">404</p>
      <h1 className="mt-3 font-serif text-3xl text-ink-900">This page isn&apos;t in the binder</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        The page you were looking for has been moved or never existed.
      </p>
      <ButtonLink href="/" className="mt-6" variant="primary">
        Back to the homepage
      </ButtonLink>
    </main>
  );
}
