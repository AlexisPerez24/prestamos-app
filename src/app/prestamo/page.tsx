"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "../lib/supabaseClient";
import { formatFechaMX, money, pct } from "../lib/format";
import { useToast } from "../components/Toaster";
import {
  Button,
  DataRow,
  Field,
  GlassCard,
  LoadingScreen,
  PageHeader,
  PageShell,
  Panel,
  SectionTitle,
  TextInput,
} from "../components/ui";

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

const DEFAULTS = () => ({
  numero_folio: "",
  quincenas: 12,
  pago_quincenal: 0,
  fecha_inicio: new Date().toISOString().slice(0, 10),
});

export default function PrestamoPage() {
  const router = useRouter();
  const toast = useToast();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [ligaGenerada, setLigaGenerada] = useState<string | null>(null);
  const [ligaCopiada, setLigaCopiada] = useState(false);

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
    defaultValues: DEFAULTS(),
    mode: "onChange",
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

  const hayResumen = resumen.total > 0;

  async function copiarLiga(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setLigaCopiada(true);
      window.setTimeout(() => setLigaCopiada(false), 2000);
      toast.success("Liga copiada al portapapeles");
    } catch {
      toast.error("No se pudo copiar", "Selecciona la liga y cópiala manualmente.");
    }
  }

  const onSubmit = async (data: FormData, event?: React.BaseSyntheticEvent) => {
    const submitter = event?.nativeEvent
      ? ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)
      : null;

    const accion = (submitter?.dataset?.accion as "guardar" | "liga" | undefined) ?? undefined;

    if (!accion) {
      toast.error("No se detectó la acción del botón", "Recarga la página e intenta de nuevo.");
      return;
    }

    const calc = calcularComoExcel(data.monto, data.quincenas, data.pago_quincenal);
    const fecha_termino = calcularFechaTerminoQuincenal(data.fecha_inicio, data.quincenas);

    if (calc.total < data.monto) {
      toast.error(
        "Interés negativo",
        "El total a pagar es menor que el monto. Ajusta los valores."
      );
      return;
    }

    setLigaGenerada(null);

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
      toast.error("Error guardando préstamo", error.message);
      return;
    }

    if (accion === "liga") {
      const token = crypto.randomUUID();

      const { error: tokErr } = await supabase.from("prestamos").update({ liga_token: token }).eq("id", inserted.id);

      if (tokErr) {
        console.error(tokErr);
        toast.error("Se guardó el préstamo, pero falló generar la liga.");
        return;
      }

      const link = `${window.location.origin}/cliente?token=${token}`;

      setLigaGenerada(link);
      toast.success("Liga generada", "Compártela con el cliente para que firme.");
      void copiarLiga(link);

      reset(DEFAULTS());

      return;
    }

    toast.success("Préstamo guardado correctamente");

    reset(DEFAULTS());

    router.push(`/contrato?id=${inserted.id}`);
  };

  if (checkingAuth) {
    return <LoadingScreen label="Verificando sesión…" />;
  }

  return (
    <PageShell>
      <GlassCard>
        <PageHeader
          title="Generar préstamo"
          subtitle={
            <>
              Sesión: <span className="font-semibold text-white/85">{userEmail ?? "—"}</span>
            </>
          }
          actions={
            <>
              <Button size="sm" onClick={() => router.push("/clientes")}>
                Ver clientes
              </Button>
              <Button size="sm" variant="secondary" onClick={cerrarSesion}>
                Cerrar sesión
              </Button>
            </>
          }
        />

        {ligaGenerada && (
          <div className="mt-6 animate-fade-up rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-4 sm:p-5">
            <p className="font-extrabold text-white">Liga del cliente lista</p>
            <p className="mt-1 text-sm text-white/70">
              El cliente entra con esta liga, llena sus datos y firma. No requiere usuario ni contraseña.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={ligaGenerada}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Liga generada"
                className="w-full rounded-xl border border-white/15 bg-brand-900/50 px-4 py-3 font-mono text-sm text-white/90 outline-none"
              />
              <Button onClick={() => copiarLiga(ligaGenerada)} className="sm:w-auto sm:shrink-0">
                {ligaCopiada ? "¡Copiada!" : "Copiar"}
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setLigaGenerada(null)}
              className="mt-3 text-sm font-semibold text-white/60 underline-offset-4 hover:text-white hover:underline"
            >
              Ocultar
            </button>
          </div>
        )}

        <form noValidate onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
          <Field label="Número de folio" error={errors.numero_folio?.message}>
            {(p) => (
              <TextInput
                {...p}
                {...register("numero_folio")}
                placeholder="Ej: PL250025"
                autoCapitalize="characters"
                spellCheck={false}
              />
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Monto" error={errors.monto?.message}>
              {(p) => (
                <TextInput
                  {...p}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={MAX_MONTO}
                  step="0.01"
                  {...register("monto", { valueAsNumber: true })}
                  placeholder="0.00"
                />
              )}
            </Field>

            <Field label="Quincenas (# pagos)" error={errors.quincenas?.message}>
              {(p) => (
                <TextInput
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={60}
                  {...register("quincenas", { valueAsNumber: true })}
                  placeholder="12"
                />
              )}
            </Field>

            <Field label="Pago por quincena" error={errors.pago_quincenal?.message}>
              {(p) => (
                <TextInput
                  {...p}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={MAX_MONTO}
                  step="0.01"
                  {...register("pago_quincenal", { valueAsNumber: true })}
                  placeholder="0.00"
                />
              )}
            </Field>
          </div>

          <Field label="Fecha del primer pago" error={errors.fecha_inicio?.message}>
            {(p) => <TextInput {...p} type="date" {...register("fecha_inicio")} />}
          </Field>

          {/* ---------- Resumen para el cliente ---------- */}
          <Panel>
            <SectionTitle>Resumen del préstamo</SectionTitle>

            {!hayResumen ? (
              <p className="mt-3 text-sm text-white/60">
                Llena monto, quincenas y pago quincenal para ver el cálculo.
              </p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
                      Pago quincenal
                    </p>
                    <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">
                      {money(resumen.pagoQuincenal)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
                      Total a pagar
                    </p>
                    <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">
                      {money(resumen.total)}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <DataRow label="Interés en pesos" value={money(resumen.interesMonto)} />
                  <DataRow label="Interés total del plazo" value={pct(resumen.interesTotalPct)} />
                  <DataRow
                    label="Fecha de término"
                    value={resumen.fecha_termino ? formatFechaMX(resumen.fecha_termino) : "—"}
                  />
                </div>
              </>
            )}
          </Panel>

          {/* ---------- Reparto interno (no mostrar al cliente) ---------- */}
          {hayResumen && (
            <Panel className="border-amber-300/20 bg-amber-400/5">
              <div>
                <span className="font-extrabold text-white">Reparto interno</span>
                <span className="mt-0.5 block text-xs text-amber-100/70">
                  Información privada · no la muestres al cliente
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
                    Gael · 60%
                  </p>
                  <p className="mt-1 text-xl font-extrabold tabular-nums text-white">
                    {money(resumen.netoGael)}
                  </p>
                  <p className="mt-1 text-sm text-white/60 tabular-nums">
                    {pct(resumen.interesGaelPct)} · recup. {money(resumen.recupGael)}/quincena
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
                    Lupin · 40%
                  </p>
                  <p className="mt-1 text-xl font-extrabold tabular-nums text-white">
                    {money(resumen.netoLupin)}
                  </p>
                  <p className="mt-1 text-sm text-white/60 tabular-nums">
                    {pct(resumen.interesLupinPct)} · recup. {money(resumen.recupLupin)}/quincena
                  </p>
                </div>
              </div>
            </Panel>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Button
              type="submit"
              data-accion="guardar"
              variant="secondary"
              loading={isSubmitting}
              fullWidth
            >
              {isSubmitting ? "Guardando…" : "Guardar"}
            </Button>

            <Button type="submit" data-accion="liga" loading={isSubmitting} fullWidth>
              {isSubmitting ? "Guardando…" : "Guardar y generar liga"}
            </Button>
          </div>
        </form>
      </GlassCard>
    </PageShell>
  );
}
