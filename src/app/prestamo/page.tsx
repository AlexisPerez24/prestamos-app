"use client";

import React, { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "../lib/supabaseClient";

const schema = z.object({
  // ✅ Nuevo: folio manual
  numero_folio: z
    .string()
    .min(3, "Ingresa un folio válido (mínimo 3 caracteres)")
    .max(50, "Folio demasiado largo")
    .transform((v) => v.trim().toUpperCase()),

  monto: z.coerce.number().positive("Monto inválido"),
  quincenas: z.coerce.number().int().min(1, "Mínimo 1").max(60, "Máximo 60"),

  // ✅ Lo capturas tú (como en Excel)
  pago_quincenal: z.coerce.number().positive("Pago quincenal inválido"),

  fecha_inicio: z.string().min(10, "Fecha inválida"), // YYYY-MM-DD
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
 * ✅ CÁLCULO COMO EN EXCEL (ACTIVOS):
 * interes% = ((pago_quincenal * quincenas) - monto) / monto * 100
 * total_a_pagar = pago_quincenal * quincenas
 * interes_monto = total_a_pagar - monto
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

  const interesLupinPct = interesTotalPct * 0.45;
  const interesGaelPct = interesTotalPct * 0.55;

  const netoGael = round2(monto + interesMonto * 0.55);
  const netoLupin = round2(interesMonto * 0.45);

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

  const onSubmit = async (data: FormData, event?: unknown) => {
    const submitter = (event as any)?.nativeEvent?.submitter as HTMLButtonElement | undefined;
    const accion = submitter?.dataset?.accion as "guardar" | "liga" | undefined;

    if (!accion) {
      alert("No se detectó la acción del botón. Recarga e intenta de nuevo.");
      return;
    }

    const calc = calcularComoExcel(data.monto, data.quincenas, data.pago_quincenal);
    const fecha_termino = calcularFechaTerminoQuincenal(data.fecha_inicio, data.quincenas);

    // ✅ Insertamos SIN cliente_id (se asigna después cuando el cliente firme)
    const { data: inserted, error } = await supabase
      .from("prestamos")
      .insert([
        {
          numero_folio: data.numero_folio,

          cliente_id: null, // 👈 importante: todavía no existe el cliente
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
      console.error(error);
      // Si pusiste UNIQUE al folio, aquí te va a caer “duplicate key”
      alert(error.message || "Error guardando préstamo");
      return;
    }

    // ✅ Guardar y generar liga
    if (accion === "liga") {
      const token = crypto.randomUUID();

      const { error: tokErr } = await supabase
        .from("prestamos")
        .update({ liga_token: token })
        .eq("id", inserted.id);

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

    // ✅ Guardar normal -> contrato interno
    alert("Préstamo guardado correctamente ✅");

    reset({
      numero_folio: "",
      quincenas: 12,
      pago_quincenal: 0,
      fecha_inicio: new Date().toISOString().slice(0, 10),
    });

    window.location.href = `/contrato?id=${inserted.id}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto mt-8 p-6 bg-white rounded-xl shadow">
        <h1 className="text-2xl font-bold mb-4">Generar préstamo</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label>Número de folio</label>
            <input
              {...register("numero_folio")}
              className="w-full border p-2 rounded"
              placeholder="Ej: PL250025"
            />
            {errors.numero_folio && (
              <p className="text-red-600 text-sm">{errors.numero_folio.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label>Monto</label>
              <input
                type="number"
                {...register("monto", { valueAsNumber: true })}
                className="w-full border p-2 rounded"
              />
              {errors.monto && <p className="text-red-600 text-sm">{errors.monto.message}</p>}
            </div>

            <div>
              <label>Quincenas (#pagos)</label>
              <input
                type="number"
                {...register("quincenas", { valueAsNumber: true })}
                className="w-full border p-2 rounded"
              />
              {errors.quincenas && <p className="text-red-600 text-sm">{errors.quincenas.message}</p>}
            </div>

            <div>
              <label>Pago por quincena</label>
              <input
                type="number"
                step="0.01"
                {...register("pago_quincenal", { valueAsNumber: true })}
                className="w-full border p-2 rounded"
              />
              {errors.pago_quincenal && (
                <p className="text-red-600 text-sm">{errors.pago_quincenal.message}</p>
              )}
            </div>
          </div>

          <div>
            <label>Fecha inicio</label>
            <input type="date" {...register("fecha_inicio")} className="w-full border p-2 rounded" />
            {errors.fecha_inicio && <p className="text-red-600 text-sm">{errors.fecha_inicio.message}</p>}
          </div>

          <div className="border rounded p-4 bg-gray-50">
            <p className="font-semibold mb-2">Resumen</p>
            <p>Pago quincenal: <b>${resumen.pagoQuincenal.toFixed(2)}</b></p>
            <p>Total a pagar: <b>${resumen.total.toFixed(2)}</b></p>
            <p>Interés $: <b>${resumen.interesMonto.toFixed(2)}</b></p>
            <p>Interés total (% Excel): <b>{resumen.interesTotalPct.toFixed(6)}%</b></p>
            <p>Interés % (LUPIN 45%): <b>{resumen.interesLupinPct.toFixed(6)}%</b></p>
            <p>Interés % (GAEL 55%): <b>{resumen.interesGaelPct.toFixed(6)}%</b></p>
            <p>NETO LUPIN: <b>${resumen.netoLupin.toFixed(2)}</b> (recup: ${resumen.recupLupin.toFixed(2)})</p>
            <p>NETO GAEL: <b>${resumen.netoGael.toFixed(2)}</b> (recup: ${resumen.recupGael.toFixed(2)})</p>
            <p>Fecha término: <b>{resumen.fecha_termino || "—"}</b></p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="submit"
              data-accion="guardar"
              disabled={isSubmitting}
              className="w-full bg-gray-700 hover:bg-gray-800 disabled:opacity-60 text-white px-4 py-2 rounded"
            >
              {isSubmitting ? "Guardando..." : "Guardar"}
            </button>

            <button
              type="submit"
              data-accion="liga"
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded"
            >
              {isSubmitting ? "Guardando..." : "Guardar y generar liga"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
