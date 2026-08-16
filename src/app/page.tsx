"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "./lib/supabaseClient";
import { Button, Field, GlassCard, LoadingScreen, TextInput } from "./components/ui";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        window.location.href = "/prestamo";
        return;
      }
      setLoading(false);
    })();
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!email.trim() || !password.trim()) {
      setMsg("Escribe tu correo y contraseña.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) throw error;

      window.location.href = "/prestamo";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error iniciando sesión";
      setMsg(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <LoadingScreen label="Verificando sesión…" />;
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-brand-900">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-800 via-brand-500 to-brand-200" />
      <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/15 blur-3xl" />
      <div className="absolute -bottom-28 -right-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

      <div className="relative flex min-h-dvh items-center justify-center p-4 sm:p-6">
        <GlassCard className="w-full max-w-md">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-white/25 bg-white/15">
              <Image
                src="/confianza.png"
                alt=""
                width={100}
                height={100}
                className="object-contain"
                priority
              />
            </div>

            <div className="text-center">
              <h1 className="text-2xl font-extrabold tracking-wide text-white">CONFIANZA</h1>
              <p className="mt-1 text-sm text-white/75">Inicia sesión para generar préstamos</p>
            </div>
          </div>

          <form onSubmit={login} className="mt-8 space-y-4" noValidate>
            <Field label="Correo">
              {(p) => (
                <TextInput
                  {...p}
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              )}
            </Field>

            <Field label="Contraseña">
              {(p) => (
                <div className="relative">
                  <TextInput
                    {...p}
                    className="pr-24"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-2 my-1.5 rounded-lg px-3 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    {showPassword ? "Ocultar" : "Ver"}
                  </button>
                </div>
              )}
            </Field>

            {msg && (
              <div
                role="alert"
                className="rounded-xl border border-rose-300/40 bg-rose-500/15 px-4 py-3 text-sm font-medium text-rose-100"
              >
                {msg}
              </div>
            )}

            <Button type="submit" loading={submitting} fullWidth className="mt-2">
              {submitting ? "Entrando…" : "Iniciar sesión"}
            </Button>
          </form>
        </GlassCard>
      </div>
    </div>
  );
}
