"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { estatusLabel, formatFechaCorta, money } from "../lib/format";
import { useToast } from "../components/Toaster";
import {
  Badge,
  Button,
  EmptyState,
  GlassCard,
  LoadingScreen,
  PageHeader,
  PageShell,
  Panel,
  Skeleton,
} from "../components/ui";

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

function estatusTone(estatus: string) {
  if (estatus === "CONTRATO_FIRMADO") return "success" as const;
  if (estatus === "ACTIVO") return "info" as const;
  if (estatus === "EN_PROCESO_CONTRATO") return "warning" as const;
  return "neutral" as const;
}

/** Barra de avance de pagos. Solo presentación. */
function Progreso({ hechos, total }: { hechos: number; total: number }) {
  const safeTotal = total > 0 ? total : 1;
  const ratio = Math.max(0, Math.min(1, hechos / safeTotal));

  return (
    <div className="min-w-[120px]">
      <div className="flex items-baseline justify-between gap-2 text-xs font-semibold text-white/70">
        <span className="tabular-nums">
          {hechos}/{total}
        </span>
        <span className="tabular-nums">{Math.round(ratio * 100)}%</span>
      </div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/15"
        role="progressbar"
        aria-valuenow={hechos}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Pagos realizados"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-200 to-white transition-[width]"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

// --- Page ---
export default function ClientesPage() {
  const router = useRouter();
  const toast = useToast();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [rows, setRows] = useState<PrestamoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

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
        toast.error("Error cargando cartera", error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as unknown as PrestamoRow[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mapped;

    return mapped.filter((p) => {
      const nombre = p.formularios_clientes?.nombre_completo?.toLowerCase() ?? "";
      const correo = p.formularios_clientes?.correo?.toLowerCase() ?? "";
      const tel = p.formularios_clientes?.telefono?.toLowerCase() ?? "";
      return nombre.includes(q) || correo.includes(q) || tel.includes(q);
    });
  }, [mapped, query]);

  const totales = useMemo(() => {
    return mapped.reduce(
      (acc, p) => {
        acc.prestado += Number(p.monto ?? 0);
        acc.porCobrar += Number(p.total_a_pagar ?? 0);
        return acc;
      },
      { prestado: 0, porCobrar: 0 }
    );
  }, [mapped]);

  if (checkingAuth) {
    return <LoadingScreen label="Verificando sesión…" />;
  }

  return (
    <PageShell size="lg">
      <GlassCard>
        <PageHeader
          title="Clientes"
          subtitle={
            <>
              Sesión: <span className="font-semibold text-white/85">{userEmail ?? "—"}</span>
            </>
          }
          actions={
            <>
              <Button size="sm" onClick={() => router.push("/prestamo")}>
                Nuevo préstamo
              </Button>
              <Button size="sm" variant="secondary" onClick={cerrarSesion}>
                Cerrar sesión
              </Button>
            </>
          }
        />

        {/* KPIs */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { k: "Préstamos activos", v: String(mapped.length) },
            { k: "Capital prestado", v: money(totales.prestado) },
            { k: "Por cobrar", v: money(totales.porCobrar) },
          ].map((kpi) => (
            <div key={kpi.k} className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/55">{kpi.k}</p>
              {loading ? (
                <Skeleton className="mt-2 h-7 w-28" />
              ) : (
                <p className="mt-1 text-xl font-extrabold tabular-nums text-white sm:text-2xl">
                  {kpi.v}
                </p>
              )}
            </div>
          ))}
        </div>

        <Panel className="mt-4">
          <label htmlFor="buscar" className="text-sm font-semibold text-white/90">
            Buscar
          </label>
          <input
            id="buscar"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, correo o teléfono…"
            className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/40 outline-none transition hover:border-white/25 focus:border-white/45 focus:bg-white/15"
          />

          <div className="mt-5">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : filtrados.length === 0 ? (
              <EmptyState
                title={query ? "Sin resultados" : "Aún no hay préstamos activos"}
                desc={
                  query
                    ? "Prueba con otro nombre, correo o teléfono."
                    : "Cuando generes un préstamo y el cliente firme, aparecerá aquí."
                }
                action={
                  query ? (
                    <Button variant="secondary" size="sm" onClick={() => setQuery("")}>
                      Limpiar búsqueda
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => router.push("/prestamo")}>
                      Generar préstamo
                    </Button>
                  )
                }
              />
            ) : (
              <>
                {/* ---------- Móvil: tarjetas ---------- */}
                <ul className="space-y-3 lg:hidden">
                  {filtrados.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-extrabold">
                            {p.formularios_clientes?.nombre_completo ?? "Sin cliente ligado"}
                          </p>
                          <p className="truncate text-sm text-white/60">
                            {p.formularios_clientes?.correo ?? "—"}
                          </p>
                        </div>
                        <Badge tone={estatusTone(p.estatus)}>{estatusLabel(p.estatus)}</Badge>
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        <div>
                          <dt className="text-white/55">Próximo pago</dt>
                          <dd className="font-semibold tabular-nums">
                            {p.proximoPago === "—" ? "—" : formatFechaCorta(p.proximoPago)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-white/55">Pago quincenal</dt>
                          <dd className="font-semibold tabular-nums">
                            {money(Number(p.pago_quincenal))}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-white/55">Monto</dt>
                          <dd className="font-semibold tabular-nums">{money(Number(p.monto))}</dd>
                        </div>
                        <div>
                          <dt className="text-white/55">Término</dt>
                          <dd className="font-semibold tabular-nums">
                            {formatFechaCorta(p.fecha_termino)}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-4">
                        <Progreso hechos={Number(p.pagos_realizados ?? 0)} total={p.quincenas} />
                      </div>
                    </li>
                  ))}
                </ul>

                {/* ---------- Escritorio: tabla ---------- */}
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full text-left text-sm text-white">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-white/55">
                        <th scope="col" className="py-3 pr-4 font-semibold">
                          Cliente
                        </th>
                        <th scope="col" className="py-3 pr-4 font-semibold">
                          Estatus
                        </th>
                        <th scope="col" className="py-3 pr-4 font-semibold">
                          Próximo pago
                        </th>
                        <th scope="col" className="py-3 pr-4 font-semibold">
                          Avance
                        </th>
                        <th scope="col" className="py-3 pr-4 text-right font-semibold">
                          Monto
                        </th>
                        <th scope="col" className="py-3 pr-4 text-right font-semibold">
                          Pago quincenal
                        </th>
                        <th scope="col" className="py-3 text-right font-semibold">
                          Término
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.map((p) => (
                        <tr
                          key={p.id}
                          className="border-t border-white/10 transition hover:bg-white/5"
                        >
                          <td className="py-4 pr-4">
                            <p className="font-bold">
                              {p.formularios_clientes?.nombre_completo ?? "Sin cliente ligado"}
                            </p>
                            <p className="text-xs text-white/55">
                              {p.formularios_clientes?.correo ?? "—"}
                            </p>
                          </td>
                          <td className="py-4 pr-4">
                            <Badge tone={estatusTone(p.estatus)}>{estatusLabel(p.estatus)}</Badge>
                          </td>
                          <td className="py-4 pr-4 tabular-nums">
                            {p.proximoPago === "—" ? "—" : formatFechaCorta(p.proximoPago)}
                          </td>
                          <td className="py-4 pr-4">
                            <Progreso hechos={Number(p.pagos_realizados ?? 0)} total={p.quincenas} />
                          </td>
                          <td className="py-4 pr-4 text-right tabular-nums">
                            {money(Number(p.monto))}
                          </td>
                          <td className="py-4 pr-4 text-right font-semibold tabular-nums">
                            {money(Number(p.pago_quincenal))}
                          </td>
                          <td className="py-4 text-right tabular-nums">
                            {formatFechaCorta(p.fecha_termino)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </Panel>
      </GlassCard>
    </PageShell>
  );
}
