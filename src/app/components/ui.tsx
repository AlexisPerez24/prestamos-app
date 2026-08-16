"use client";

import React, { forwardRef, useId } from "react";

/* =========================================================
   Primitivas de UI compartidas por todas las pantallas.
   Solo presentación: aquí no vive ninguna regla de negocio.
   ========================================================= */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------
   Layout
   --------------------------------------------------------- */

/** Fondo de marca + halos suaves. Envuelve TODA pantalla. */
export function PageShell({
  children,
  className,
  size = "md",
}: {
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const maxW = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-5xl" : "max-w-3xl";

  return (
    <div className="relative min-h-dvh overflow-hidden bg-brand-900">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-800 via-brand-600 to-brand-300" />
      <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-white/15 blur-3xl" />
      <div className="absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

      <div className="relative flex min-h-dvh flex-col items-center p-4 sm:p-6 md:p-10">
        <div className={cx("w-full", maxW, className)}>{children}</div>
      </div>
    </div>
  );
}

/** Tarjeta de vidrio. Contenedor estándar de contenido. */
export function GlassCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-card border border-white/15 bg-white/10 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6 md:p-8",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Bloque interior (resúmenes, tablas, secciones). */
export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-2xl border border-white/10 bg-white/10 p-4 sm:p-5", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{title}</h1>
        {subtitle && <div className="mt-1 truncate text-sm text-white/70">{subtitle}</div>}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-extrabold text-white sm:text-xl">{children}</h2>;
}

/* ---------------------------------------------------------
   Formularios
   --------------------------------------------------------- */

/** Envuelve un input y liga <label> con el control (accesibilidad). */
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const id = useId();
  const msgId = `${id}-msg`;

  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-white/90">
        {label}
      </label>

      <div className="mt-1.5">
        {children({
          id,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error || hint ? msgId : undefined,
        })}
      </div>

      {error ? (
        <p id={msgId} className="mt-1.5 text-sm font-medium text-rose-200">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="mt-1.5 text-sm text-white/55">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/40 outline-none transition " +
  "hover:border-white/25 focus:border-white/45 focus:bg-white/15 aria-[invalid=true]:border-rose-300/60 aria-[invalid=true]:bg-rose-400/10";

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return <input ref={ref} className={cx(inputClass, className)} {...props} />;
  }
);

/* ---------------------------------------------------------
   Botones
   --------------------------------------------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
  fullWidth?: boolean;
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-white text-brand-900 shadow-lg hover:bg-white/90 active:scale-[0.99]",
  secondary:
    "border border-white/15 bg-white/15 text-white hover:bg-white/25 active:scale-[0.99]",
  ghost: "text-white/80 hover:bg-white/10 hover:text-white",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  disabled,
  children,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition disabled:opacity-60 disabled:active:scale-100",
        size === "sm" ? "px-4 py-2 text-sm" : "px-4 py-3",
        VARIANTS[variant],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}

/* ---------------------------------------------------------
   Estados
   --------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-white/15", className)} />;
}

/** Pantalla de carga estándar (auth, fetch inicial, Suspense). */
export function LoadingScreen({ label = "Cargando…" }: { label?: string }) {
  return (
    <PageShell>
      <GlassCard>
        <div className="flex items-center gap-3 text-white/80">
          <Spinner />
          <span className="font-semibold">{label}</span>
        </div>

        <div className="mt-6 space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </GlassCard>
    </PageShell>
  );
}

/** Mensaje de vacío / error de carga. */
export function EmptyState({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-10 text-center">
      <p className="text-lg font-bold text-white">{title}</p>
      {desc && <p className="mx-auto mt-2 max-w-md text-sm text-white/65">{desc}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

const BADGE_TONES = {
  neutral: "border-white/20 bg-white/10 text-white/80",
  info: "border-sky-300/30 bg-sky-400/15 text-sky-100",
  success: "border-emerald-300/30 bg-emerald-400/15 text-emerald-100",
  warning: "border-amber-300/30 bg-amber-400/15 text-amber-100",
} as const;

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof BADGE_TONES;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold tracking-wide",
        BADGE_TONES[tone]
      )}
    >
      {children}
    </span>
  );
}

/** Fila etiqueta / valor usada en resúmenes y contratos. */
export function DataRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/10 py-2 last:border-b-0">
      <span className="text-sm text-white/60">{label}</span>
      <span
        className={cx(
          "text-right tabular-nums",
          strong ? "text-lg font-extrabold text-white" : "font-semibold text-white/95"
        )}
      >
        {value}
      </span>
    </div>
  );
}
