import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-zinc-600">The link may be wrong or expired.</p>
      <Link href="/app" className="mt-5 inline-block text-sm font-medium text-brand-700 underline">Go to the dashboard</Link>
    </main>
  );
}
