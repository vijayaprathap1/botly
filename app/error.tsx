"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Try again. If it keeps happening, run <code className="rounded bg-zinc-100 px-1">npm run check</code> and look at the terminal running the app.
        {error.digest ? <span className="mt-2 block text-xs text-zinc-400">Reference: {error.digest}</span> : null}
      </p>
      <button onClick={reset} className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
        Try again
      </button>
    </main>
  );
}
