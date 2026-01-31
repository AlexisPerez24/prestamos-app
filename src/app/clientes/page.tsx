"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

// --- Types ---
type Cliente = {
  id: number;
  nombre_completo: string;
  correo: string | null;
  telefono: string;
};

type PrestamoRow = {
  id: number;
  monto: number;
  quincenas: number;
  pago_quincenal: number;
  total_a_pagar: number;
  pagos_realizados: number;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_termino: string; // YYYY-MM-DD
  estatus: string;
  formularios_clientes: Cliente | null; // join
};

// --- Helpers de fechas (igual estilo que tú) ---
function toDateOnly(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Siguiente quincena "real":
 * - si día 1-14 => 15
 * - si día 15-29 => 30
 * - si día 30/31 => 15 del siguiente mes
 */
function addQuincenaReal(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDate();

  if (day < 15) return new Date(date.getFullYear(), date.getMonth(), 15);
  if (day < 30) return new Date(date.getFullYear(), date.getMonth(), 30);
  return new Date(date.getFullYear(), date.getMonth() + 1, 15);
}

/**
 * Calcula la fecha del N-ésimo pago:
 * pago #1 = fecha_inicio
 * pago #2 = addQuincenaReal(fecha_inicio)
 * etc.
 */
function fechaPagoN(fechaInicioISO: string, n: number) {
  let actual = toDateOnly(fechaInicioISO);
  // n=1 => 0 saltos
  for (let i = 1; i < n; i++) actual = addQuincenaReal(actual);
  return formatISO(actual);
}

function money(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

// --- Page ---
export default function ClientesPage() {
  const router = useRouter();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [rows, setRows] = useState<PrestamoRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ proteger ruta
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = "/";
        return;
      }
      setUserEmail(data.session.user.email ?? null);
      setCheckingAuth(false);
    })();
  }, []);

  async function cerrarSesion() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  // ✅ cargar cartera
  useEffect(() => {
    if (checkingAuth) return;

    (async () => {
      setLoading(true);

      // Estatus que consideramos "activos" (ajusta si usas otros)
      const activeStatuses = ["EN_PROCESO_CONTRATO", "CONTRATO_FIRMADO", "ACTIVO"];

      const { data, error } = await supabase
        .from("prestamos")
        .select(
          `
          id,
          monto,
          quincenas,
          pago_quincenal,
          total_a_pagar,
          pagos_realizados,
          fecha_inicio,
          fecha_termino,
          estatus,
          formularios_clientes (
            id,
            nombre_completo,
            correo,
            telefono
          )
        `
        )
        .in("estatus", activeStatuses)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        alert(error.message || "Error cargando cartera");
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as unknown as PrestamoRow[]);
      setLoading(false);
    })();
  }, [checkingAuth]);

  const mapped = useMemo(() => {
    return rows.map((p) => {
      const pagosRealizados = Number(p.pagos_realizados ?? 0);
      const siguientePagoNum = pagosRealizados + 1; // si 0 pagos, toca el #1
      const proximoPago =
        siguientePagoNum <= p.quincenas ? fechaPagoN(p.fecha_inicio, siguientePagoNum) : "—";

      return {
        ...p,
        proximoPago,
      };
    });
  }, [rows]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#2b0f46] p-8 flex items-center justify-center">
        <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-white/10 p-6 text-white shadow-xl backdrop-blur">
          <p className="text-white/90">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#2b0f46]">
      <div className="min-h-screen bg-gradient-to-br from-[#2b0f46] via-[#5b2a86] to-[#a77ad6] p-6 md:p-10">
        <div className="mx-auto w-full max-w-5xl rounded-[28px] border border-white/10 bg-white/10 p-6 md:p-8 shadow-2xl backdrop-blur">
          {/* Header */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-white">Clientes</h1>
              <p className="mt-1 text-sm text-white/70">
                Sesión: <span className="font-semibold">{userEmail ?? "—"}</span>
              </p>
            </div>

            <div className="flex items-center gap-3 self-start">
              <button
                type="button"
                onClick={() => router.push("/prestamo")}
                className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
              >
                Volver
              </button>

              <button
                type="button"
                onClick={cerrarSesion}
                className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
              >
                Cerrar sesión
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-5">
            {loading ? (
              <p className="text-white/85">Cargando cartera...</p>
            ) : mapped.length === 0 ? (
              <p className="text-white/85">No hay préstamos activos para mostrar.</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full min-w-[900px] text-left text-sm text-white">
                  <thead className="text-white/80">
                    <tr>
                      <th className="py-3 pr-4">Cliente</th>
                      <th className="py-3 pr-4">Correo</th>
                      <th className="py-3 pr-4">Estatus</th>
                      <th className="py-3 pr-4">Próximo pago</th>
                      <th className="py-3 pr-4">Pagos</th>
                      <th className="py-3 pr-4">Monto</th>
                      <th className="py-3 pr-4">Pago quincenal</th>
                      <th className="py-3 pr-4">Término</th>
                    </tr>
                  </thead>
                  <tbody className="text-white/90">
                    {mapped.map((p) => (
                      <tr key={p.id} className="border-t border-white/10">
                        <td className="py-3 pr-4 font-semibold">
                          {p.formularios_clientes?.nombre_completo ?? "—"}
                        </td>
                        <td className="py-3 pr-4">{p.formularios_clientes?.correo ?? "—"}</td>
                        <td className="py-3 pr-4">{p.estatus}</td>
                        <td className="py-3 pr-4">{p.proximoPago}</td>
                        <td className="py-3 pr-4">
                          {p.pagos_realizados}/{p.quincenas}
                        </td>
                        <td className="py-3 pr-4">{money(Number(p.monto))}</td>
                        <td className="py-3 pr-4">{money(Number(p.pago_quincenal))}</td>
                        <td className="py-3 pr-4">{p.fecha_termino}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="mt-4 text-xs text-white/60">
            Próximo paso: filtros “Por vencer”, “Vencidos”, “Al corriente”, y marcar pagos.
          </p>
        </div>
      </div>
    </div>
  );
}
