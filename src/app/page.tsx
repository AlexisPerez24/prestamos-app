"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "./lib/supabaseClient";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow p-8 w-full max-w-md">
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Fondo tipo tu imagen (morado/lila) */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#2a124f] via-[#6b2aa6] to-[#cbb7ff]" />

      {/* Brillos suaves */}
      <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-white/15 blur-3xl" />
      <div className="absolute -bottom-28 -right-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

      <div className="relative min-h-screen flex items-center justify-center p-6">
        {/* Card glass */}
        <div className="w-full max-w-md rounded-[28px] border border-white/25 bg-white/10 backdrop-blur-xl shadow-2xl p-8">
          {/* Logo circular arriba */}
          <div className="flex flex-col items-center gap-4">
            <div className="h-24 w-24 rounded-full bg-white/15 border border-white/25 flex items-center justify-center overflow-hidden">
              <Image
                src="/confianza.png"
                alt="CONFIANZA"
                width={100}
                height={100}
                className="object-contain"
                priority
              />
            </div>

            <div className="text-center">
              <h1 className="text-2xl font-bold text-white tracking-wide">CONFIANZA</h1>
              <p className="text-white/80 text-sm">Inicia sesión para generar préstamos</p>
            </div>
          </div>

          <form onSubmit={login} className="mt-6 space-y-4">
            {/* Email */}
            <div>
              <label className="text-white/80 text-sm">Email</label>
              <div className="mt-2 rounded-xl border border-white/25 bg-white/10 focus-within:border-white/40 transition">
                <input
                  className="w-full bg-transparent text-white placeholder:text-white/50 p-3 outline-none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-white/80 text-sm">Password</label>
              <div className="mt-2 rounded-xl border border-white/25 bg-white/10 focus-within:border-white/40 transition">
                <input
                  className="w-full bg-transparent text-white placeholder:text-white/50 p-3 outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* Mensaje error */}
            {msg && (
              <div className="rounded-xl border border-red-400/40 bg-red-500/15 text-red-100 px-4 py-3 text-sm">
                {msg}
              </div>
            )}

            {/* Botón */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl py-3 font-semibold text-white shadow-lg disabled:opacity-60
                         bg-gradient-to-r from-[#3a0f6a] via-[#6b2aa6] to-[#7c4dff]
                         hover:brightness-110 transition"
            >
              {submitting ? "Entrando..." : "LOGIN"}
            </button>

            <p className="text-xs text-white/70 text-center pt-2">
              {/* El cliente entra por liga con token (sin usuario/contraseña). */}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
