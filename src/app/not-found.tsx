import Link from "next/link";

/** Pagina bestaat niet — bijvoorbeeld na een oude link uit een e-mail. */
export default function NotFound() {
  return (
    <div className="card px-5 py-8 text-center">
      <p aria-hidden className="text-3xl">
        🧭
      </p>
      <h1 className="mt-2 text-lg font-semibold">Deze pagina bestaat niet</h1>
      <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: "var(--muted)" }}>
        Misschien is de link verouderd. Je agenda vind je gewoon op Vandaag.
      </p>
      <div className="mt-4">
        <Link href="/" className="btn btn-primary">
          Naar Vandaag
        </Link>
      </div>
    </div>
  );
}
