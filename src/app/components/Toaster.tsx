"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type ToastKind = "success" | "error" | "info";

type Toast = {
  id: number;
  kind: ToastKind;
  title: string;
  desc?: string;
};

type ToastApi = {
  success: (title: string, desc?: string) => void;
  error: (title: string, desc?: string) => void;
  info: (title: string, desc?: string) => void;
};

const ToastCtx = createContext<ToastApi | null>(null);

/** Reemplaza los alert() del proyecto. Se monta una sola vez en el layout. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, desc?: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, title, desc }]);
      window.setTimeout(() => remove(id), kind === "error" ? 7000 : 4500);
    },
    [remove]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push("success", t, d),
      error: (t, d) => push("error", t, d),
      info: (t, d) => push("info", t, d),
    }),
    [push]
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}

      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:items-end sm:p-6"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

const KIND_STYLES: Record<ToastKind, { ring: string; bg: string; icon: string; iconBg: string }> = {
  success: {
    ring: "ring-emerald-300/30",
    bg: "bg-emerald-950/70",
    icon: "✓",
    iconBg: "bg-emerald-400/20 text-emerald-100",
  },
  error: {
    ring: "ring-rose-300/30",
    bg: "bg-rose-950/70",
    icon: "!",
    iconBg: "bg-rose-400/20 text-rose-100",
  },
  info: {
    ring: "ring-white/20",
    bg: "bg-brand-900/80",
    icon: "i",
    iconBg: "bg-white/15 text-white",
  },
};

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const s = KIND_STYLES[toast.kind];

  return (
    <div
      role="status"
      className={`pointer-events-auto w-full max-w-sm animate-fade-up rounded-2xl ${s.bg} p-4 shadow-2xl ring-1 ${s.ring} backdrop-blur-xl`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg text-sm font-bold ${s.iconBg}`}
        >
          {s.icon}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">{toast.title}</p>
          {toast.desc && (
            <p className="mt-0.5 break-words text-sm text-white/70">{toast.desc}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar aviso"
          className="-m-1 rounded-lg p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
