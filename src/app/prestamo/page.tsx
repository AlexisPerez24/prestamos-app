"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "../lib/supabaseClient";

/**
 * Cambia este límite si quieres aún más alto.
 * OJO: JS Number aguanta enorme, pero para dinero real conviene no pasar de 1e12.
 */
const MAX_MONTO = 1_000_000_000; // 1,000,000,000

// ✅ PORCENTAJES NUEVOS
const LUPIN_PCT = 0.40;
const GAEL_PCT = 0.60;

const schema = z
  .object({
    numero_folio: z
      .string()
      .min(3, "Ingresa un folio válido (mínimo 3 caracteres)")
      .max(50, "Folio demasiado largo")
      .transform((v) => v.trim().toUpperCase()),

    monto: z
      .number()
      .finite("Monto inválido")
      .positive("Monto inválido")
      .max(MAX_MONTO, `Monto demasiado alto (máx ${MAX_MONTO.toLocaleString("es-MX")})`),

    quincenas: z
      .number()
      .finite("Quincenas inválidas")
      .int("Quincenas debe ser entero")
      .min(1, "Mínimo 1")
      .max(60, "Máximo 60"),

    pago_quincenal: z
      .number()
      .finite("Pago quincenal inválido")
      .positive("Pago quincenal inválido")
      .max(MAX_MONTO, "Pago quincenal demasiado alto"),

    fecha_inicio: z.string().min(10, "Fecha inválida"), // YYYY-MM-DD
  })
  .superRefine((v, ctx) => {
    const total = v.pago_quincenal * v.quincenas;

    if (total < v.monto) {
      ctx.addIssue({
        code: "custom",
        path: ["pago_quincenal"],
        message:
          "Tu pago quincenal es muy bajo: (pago_quincenal × quincenas) debe ser ≥ monto para que el interés no sea negativo.",
      });
      ctx.addIssue({
        code: "custom",
        path: ["monto"],
        message:
          "Con estos valores el total a pagar sería menor que el monto (interés negativo). Ajusta pago quincenal o quincenas.",
      });
    }
  });

type FormData = z.infer<typeof schema>;

/** Convierte cualquier cosa a número seguro */
function toNum(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Redondeo a 2 decimales seguro */
function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Parse YYYY-MM-DD sin broncas de zona horaria */
function toDateOnly(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
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

function formatISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Calcula término en base a quincenas reales 15/30 */
function calcularFechaTerminoQuincenal(fechaInicioISO: string, quincenas: number) {
  let actual = toDateOnly(fechaInicioISO);
  for (let i = 1; i < quincenas; i++) actual = addQuincenaReal(actual);
  return formatISO(actual);
}

/**
 * ✅ CÁLCULO COMO EN EXCEL:
 * interes% = ((pago_quincenal * quincenas) - monto) / monto * 100
 * total_a_pagar = pago_quincenal * quincenas
 * interes_monto = total_a_pagar - monto
 *
 * ✅ Reparto: GAEL 60% / LUPIN 40%
 */
function calcularComoExcel(montoRaw: unknown, quincenasRaw: unknown, pagoQuincenalRaw: unknown) {
  const monto = toNum(montoRaw, 0);
  const quincenas = toNum(quincenasRaw, 1);
  const pagoQuincenal = toNum(pagoQuincenalRaw, 0);

  if (monto <= 0 || quincenas <= 0 || pagoQuincenal <= 0) {
    return {
      total: 0,
      pagoQuincenal: 0,
      interesMonto: 0,
      interesTotalPct: 0,
      interesLupinPct: 0,
      interesGaelPct: 0,
      netoGael: 0,
      netoLupin: 0,
      recupGael: 0,
      recupLupin: 0,
    };
  }

  const total = round2(pagoQuincenal * quincenas);
  const interesMonto = round2(total - monto);
  const interesTotalPct = round2((interesMonto / monto) * 100);

  const interesLupinPct = interesTotalPct * LUPIN_PCT;
  const interesGaelPct = interesTotalPct * GAEL_PCT;

  const netoGael = round2(monto + interesMonto * GAEL_PCT);
  const netoLupin = round2(interesMonto * LUPIN_PCT);

  const recupGael = round2(netoGael / quincenas);
  const recupLupin = round2(netoLupin / quincenas);

  return {
    total,
    pagoQuincenal: round2(pagoQuincenal),
    interesMonto,
    interesTotalPct,
    interesLupinPct,
    interesGaelPct,
    netoGael,
    netoLupin,
    recupGael,
    recupLupin,
  };
}

export default function PrestamoPage() {
  const router = useRouter();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // ✅ Estilos (solo UI)
  const inputBase = "mt-1 w-full rounded-xl border px-4 py-2.5 outline-none transition";
  const inputGlass =
    inputBase +
    " border-white/20 bg-white/90 text-gray-900 placeholder:text-gray-500" +
    " focus:border-white/40 focus:bg-white";
  const label = "text-sm font-medium text-white/90";

  // ✅ Proteger ruta: si no hay sesión => /
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

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      numero_folio: "",
      quincenas: 12,
      pago_quincenal: 0,
      fecha_inicio: new Date().toISOString().slice(0, 10),
    },
  });

  const monto = toNum(watch("monto"), 0);
  const quincenas = toNum(watch("quincenas"), 1);
  const pago_quincenal = toNum(watch("pago_quincenal"), 0);
  const fecha_inicio = watch("fecha_inicio");

  const resumen = useMemo(() => {
    const calc = calcularComoExcel(monto, quincenas, pago_quincenal);
    const fecha_termino =
      fecha_inicio && quincenas > 0 ? calcularFechaTerminoQuincenal(fecha_inicio, quincenas) : "";
    return { ...calc, fecha_termino };
  }, [monto, quincenas, pago_quincenal, fecha_inicio]);

  const onSubmit = async (data: FormData, event?: React.BaseSyntheticEvent) => {
    const submitter = event?.nativeEvent
      ? ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)
      : null;

    const accion = (submitter?.dataset?.accion as "guardar" | "liga" | undefined) ?? undefined;

    if (!accion) {
      alert("No se detectó la acción del botón. Recarga e intenta de nuevo.");
      return;
    }

    const calc = calcularComoExcel(data.monto, data.quincenas, data.pago_quincenal);
    const fecha_termino = calcularFechaTerminoQuincenal(data.fecha_inicio, data.quincenas);

    if (calc.total < data.monto) {
      alert("El total a pagar es menor que el monto (interés negativo). Ajusta los valores.");
      return;
    }

    const { data: inserted, error } = await supabase
      .from("prestamos")
      .insert([
        {
          numero_folio: data.numero_folio,
          cliente_id: null,
          monto: data.monto,
          quincenas: data.quincenas,

          pago_quincenal: calc.pagoQuincenal,
          total_a_pagar: calc.total,
          total_interes: calc.interesMonto,
          interes_total_pct: Number(calc.interesTotalPct.toFixed(6)),

          fecha_inicio: data.fecha_inicio,
          fecha_termino,

          interes_lupin_pct: Number(calc.interesLupinPct.toFixed(6)),
          interes_gael_pct: Number(calc.interesGaelPct.toFixed(6)),
          neto_lupin: calc.netoLupin,
          neto_gael: calc.netoGael,
          recuperado_quincenal_lupin: calc.recupLupin,
          recuperado_quincenal_gael: calc.recupGael,

          estatus: "EN_PROCESO_CONTRATO",
        },
      ])
      .select("id")
      .single();

    if (error) {
      console.error("SUPABASE INSERT ERROR:", error);
      alert(error.message || "Error guardando préstamo");
      return;
    }

    if (accion === "liga") {
      const token = crypto.randomUUID();

      const { error: tokErr } = await supabase.from("prestamos").update({ liga_token: token }).eq("id", inserted.id);

      if (tokErr) {
        console.error(tokErr);
        alert("Se guardó el préstamo, pero falló generar la liga.");
        return;
      }

      const link = `${window.location.origin}/cliente?token=${token}`;

      try {
        await navigator.clipboard.writeText(link);
        alert(`Liga copiada ✅\n\n${link}`);
      } catch {
        alert(`Liga generada ✅ (cópiala manualmente):\n\n${link}`);
      }

      reset({
        numero_folio: "",
        quincenas: 12,
        pago_quincenal: 0,
        fecha_inicio: new Date().toISOString().slice(0, 10),
      });

      return;
    }

    alert("Préstamo guardado correctamente ✅");

    reset({
      numero_folio: "",
      quincenas: 12,
      pago_quincenal: 0,
      fecha_inicio: new Date().toISOString().slice(0, 10),
    });

    window.location.href = `/contrato?id=${inserted.id}`;
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#2b0f46] p-8 flex items-center justify-center">
        <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/10 p-6 text-white shadow-xl backdrop-blur">
          <p className="text-white/90">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#2b0f46]">
      <div className="min-h-screen bg-gradient-to-br from-[#2b0f46] via-[#5b2a86] to-[#a77ad6] p-6 md:p-10">
        <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-white/10 bg-white/10 p-6 md:p-8 shadow-2xl backdrop-blur">
          {/* Header */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-white">Generar préstamo</h1>
              <p className="mt-1 text-sm text-white/70">
                Sesión: <span className="font-semibold">{userEmail ?? "—"}</span>
              </p>
            </div>

            {/* ✅ AQUÍ VA TU BOTÓN (zona marcada en rojo) */}
            <div className="flex items-center gap-3 self-start">
              <button
                type="button"
                onClick={() => router.push("/clientes")}
                className="rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-[#2b0f46] transition hover:bg-white/90"
              >
                Ver clientes
              </button>

              <button
                onClick={cerrarSesion}
                className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                type="button"
              >
                Cerrar sesión
              </button>
            </div>
          </div>

          <form noValidate onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
            <div>
              <label className={label}>Número de folio</label>
              <input {...register("numero_folio")} className={inputGlass} placeholder="Ej: PL250025" />
              {errors.numero_folio && <p className="mt-1 text-sm text-red-200">{errors.numero_folio.message}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className={label}>Monto</label>
                <input
                  type="number"
                  min={0}
                  max={MAX_MONTO}
                  step="0.01"
                  {...register("monto", { valueAsNumber: true })}
                  className={inputGlass}
                  placeholder="0.00"
                />
                {errors.monto && <p className="mt-1 text-sm text-red-200">{errors.monto.message}</p>}
              </div>

              <div>
                <label className={label}>Quincenas (#pagos)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  {...register("quincenas", { valueAsNumber: true })}
                  className={inputGlass}
                  placeholder="12"
                />
                {errors.quincenas && <p className="mt-1 text-sm text-red-200">{errors.quincenas.message}</p>}
              </div>

              <div>
                <label className={label}>Pago por quincena</label>
                <input
                  type="number"
                  min={0}
                  max={MAX_MONTO}
                  step="0.01"
                  {...register("pago_quincenal", { valueAsNumber: true })}
                  className={inputGlass}
                  placeholder="0.00"
                />
                {errors.pago_quincenal && <p className="mt-1 text-sm text-red-200">{errors.pago_quincenal.message}</p>}
              </div>
            </div>

            <div>
              <label className={label}>Fecha inicio</label>
              <input type="date" {...register("fecha_inicio")} className={inputGlass} />
              {errors.fecha_inicio && <p className="mt-1 text-sm text-red-200">{errors.fecha_inicio.message}</p>}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 p-5 text-white">
              <p className="text-lg font-bold">Resumen</p>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <p className="text-white/85">
                  Pago quincenal: <span className="font-semibold">${resumen.pagoQuincenal.toFixed(2)}</span>
                </p>
                <p className="text-white/85">
                  Total a pagar: <span className="font-semibold">${resumen.total.toFixed(2)}</span>
                </p>

                <p className="text-white/85">
                  Interés $: <span className="font-semibold">${resumen.interesMonto.toFixed(2)}</span>
                </p>
                <p className="text-white/85">
                  Interés total (% Excel):{" "}
                  <span className="font-semibold">{resumen.interesTotalPct.toFixed(6)}%</span>
                </p>

                <p className="text-white/85">
                  Interés % (LUPIN 40%): <span className="font-semibold">{resumen.interesLupinPct.toFixed(6)}%</span>
                </p>
                <p className="text-white/85">
                  Interés % (GAEL 60%): <span className="font-semibold">{resumen.interesGaelPct.toFixed(6)}%</span>
                </p>

                <p className="text-white/85">
                  NETO LUPIN: <span className="font-semibold">${resumen.netoLupin.toFixed(2)}</span>{" "}
                  <span className="text-white/60">(recup: ${resumen.recupLupin.toFixed(2)})</span>
                </p>

                <p className="text-white/85">
                  NETO GAEL: <span className="font-semibold">${resumen.netoGael.toFixed(2)}</span>{" "}
                  <span className="text-white/60">(recup: ${resumen.recupGael.toFixed(2)})</span>
                </p>

                <p className="text-white/85 md:col-span-2">
                  Fecha término: <span className="font-semibold">{resumen.fecha_termino || "—"}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <button
                type="submit"
                data-accion="guardar"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-white/15 px-4 py-3 font-bold text-white transition hover:bg-white/25 disabled:opacity-60"
              >
                {isSubmitting ? "Guardando..." : "Guardar"}
              </button>

              <button
                type="submit"
                data-accion="liga"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-white px-4 py-3 font-bold text-[#2b0f46] transition hover:bg-white/90 disabled:opacity-60"
              >
                {isSubmitting ? "Guardando..." : "Guardar y generar liga"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
