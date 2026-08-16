import Link from "next/link";

export const metadata = {
  title: "Página no encontrada",
};

export default function NotFound() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-brand-900">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-800 via-brand-600 to-brand-300" />
      <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-white/15 blur-3xl" />

      <div className="relative flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-white/15 bg-white/10 p-8 text-center shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <p className="text-5xl font-extrabold tracking-tight text-white/30">404</p>
          <h1 className="mt-3 text-xl font-extrabold text-white">Esta página no existe</h1>
          <p className="mt-2 text-sm text-white/65">
            Revisa la dirección o vuelve al inicio para iniciar sesión.
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 font-bold text-brand-900 shadow-lg transition hover:bg-white/90"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
