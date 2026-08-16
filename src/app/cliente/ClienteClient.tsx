"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import { z } from "zod";
import { supabase } from "../lib/supabaseClient";
import { formatFechaMX, money, pct } from "../lib/format";
import { useToast } from "../components/Toaster";
import {
  Button,
  DataRow,
  EmptyState,
  Field,
  GlassCard,
  LoadingScreen,
  PageShell,
  Panel,
  SectionTitle,
  TextInput,
} from "../components/ui";

type Prestamo = {
  id: number;
  monto: number;
  quincenas: number;
  pago_quincenal: number;
  total_a_pagar: number;
  interes_total_pct: number;
  fecha_inicio: string;
  fecha_termino: string;
  estatus: string;
};

const ONLY_LETTERS_SPACES = /^[A-ZÁÉÍÓÚÑÜ\s]+$/i;

function normalizeUpper(v: string) {
  return v.replace(/\s+/g, " ").trim().toUpperCase();
}
function normalizeTrim(v: string) {
  return v.replace(/\s+/g, " ").trim();
}
function onlyDigits(v: string) {
  return v.replace(/\D+/g, "").trim();
}
function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

function maskCard(v: string) {
  const s = onlyDigits(v);
  if (!s) return "—";
  const last4 = s.slice(-4);
  return `${"*".repeat(Math.max(0, s.length - 4))}${last4}`;
}

const FormSchema = z.object({
  apellido_paterno: z
    .string()
    .min(2, "Escribe el apellido paterno")
    .transform(normalizeUpper)
    .refine((v) => ONLY_LETTERS_SPACES.test(v), "Solo letras y espacios"),

  apellido_materno: z
    .string()
    .min(2, "Escribe el apellido materno")
    .transform(normalizeUpper)
    .refine((v) => ONLY_LETTERS_SPACES.test(v), "Solo letras y espacios"),

  nombres: z
    .string()
    .min(2, "Escribe el/los nombres")
    .transform(normalizeUpper)
    .refine((v) => ONLY_LETTERS_SPACES.test(v), "Solo letras y espacios"),

  ine_numero: z
    .string()
    .min(6, "INE inválido")
    .max(30, "INE demasiado largo")
    .transform((v) => v.replace(/\s+/g, "").trim()),

  banco: z.string().min(2, "Escribe tu banco").max(60, "Banco demasiado largo").transform(normalizeUpper),

  numero_tarjeta: z.string().min(8, "Tarjeta inválida").max(25, "Tarjeta inválida").transform(onlyDigits),

  direccion: z.string().min(5, "Escribe la dirección").transform(normalizeTrim),

  telefono: z
    .string()
    .min(10, "Teléfono inválido (mínimo 10 dígitos)")
    .max(15, "Teléfono demasiado largo")
    .regex(/^[0-9+ ]+$/, "Solo números, espacios o +")
    .transform(normalizeTrim),

  correo: z.string().min(5, "Escribe tu correo").email("Correo inválido").transform(normalizeEmail),
});

type Step = "FORM" | "RESUMEN" | "FIRMA";

const STEPS: Array<{ k: Step; n: number; t: string }> = [
  { k: "FORM", n: 1, t: "Datos" },
  { k: "RESUMEN", n: 2, t: "Resumen" },
  { k: "FIRMA", n: 3, t: "Firma" },
];

/** Indicador de progreso del flujo. */
function Stepper({ current, onGo }: { current: Step; onGo: (s: Step) => void }) {
  const idx = STEPS.findIndex((s) => s.k === current);

  return (
    <ol className="grid grid-cols-3 gap-2 sm:gap-3">
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        const clickable = done;

        return (
          <li key={s.k}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onGo(s.k)}
              aria-current={active ? "step" : undefined}
              className={[
                "flex w-full items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition sm:px-4",
                active
                  ? "border-white/35 bg-white/20 text-white"
                  : done
                    ? "border-white/20 bg-white/10 text-white/80 hover:bg-white/15"
                    : "border-white/10 bg-white/5 text-white/45",
              ].join(" ")}
            >
              <span
                aria-hidden
                className={[
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold",
                  active
                    ? "bg-white text-brand-900"
                    : done
                      ? "bg-white/25 text-white"
                      : "bg-white/10 text-white/50",
                ].join(" ")}
              >
                {done ? "✓" : s.n}
              </span>
              <span className="truncate text-sm font-bold">{s.t}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default function ClienteClient() {
  const sp = useSearchParams();
  const token = sp.get("token");
  const toast = useToast();

  const [prestamo, setPrestamo] = useState<Prestamo | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("FORM");

  const [form, setForm] = useState({
    apellido_paterno: "",
    apellido_materno: "",
    nombres: "",
    ine_numero: "",
    numero_tarjeta: "",
    banco: "",
    direccion: "",
    telefono: "",
    correo: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const sigRef = useRef<SignatureCanvas>(null);
  const sigWrapRef = useRef<HTMLDivElement>(null);
  const sigWidthRef = useRef(0);

  const [submitting, setSubmitting] = useState(false);
  const [signedOk, setSignedOk] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [hayTrazo, setHayTrazo] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      setLoading(true);

      // ✅ TIPADO: elimina cualquier "any"
      const { data, error } = await supabase
        .from("prestamos")
        .select("id,monto,quincenas,pago_quincenal,total_a_pagar,interes_total_pct,fecha_inicio,fecha_termino,estatus")
        .eq("liga_token", token)
        .single<Prestamo>();

      if (error || !data) {
        console.error(error);
        toast.error("Liga inválida", "No encontramos el préstamo de esta liga.");
        setPrestamo(null);
        setLoading(false);
        return;
      }

      if (["CANCELADO", "TERMINADO"].includes(data.estatus)) {
        toast.error("Esta liga ya no está disponible.");
        setPrestamo(null);
        setLoading(false);
        return;
      }

      if (data.estatus === "CONTRATO_FIRMADO") {
        setSignedOk(true);
        setStep("FIRMA");
      }

      setPrestamo(data);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const nombreCompleto = useMemo(() => {
    return `${form.apellido_paterno} ${form.apellido_materno} ${form.nombres}`.replace(/\s+/g, " ").trim();
  }, [form]);

  /**
   * El canvas de firma necesita que su resolución interna coincida con su
   * tamaño en pantalla; si no, el trazo aparece desfasado del dedo en móvil.
   */
  const ajustarCanvas = useCallback(() => {
    const pad = sigRef.current;
    const wrap = sigWrapRef.current;
    if (!pad || !wrap) return;

    const canvas = pad.getCanvas();
    const width = Math.round(wrap.clientWidth);
    if (width <= 0 || width === sigWidthRef.current) return;

    sigWidthRef.current = width;

    const height = width < 480 ? 200 : 260;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.getContext("2d")?.scale(ratio, ratio);

    pad.clear();
    setHayTrazo(false);
  }, []);

  useLayoutEffect(() => {
    if (step !== "FIRMA" || signedOk) return;

    sigWidthRef.current = 0;
    ajustarCanvas();

    const ro = new ResizeObserver(() => ajustarCanvas());
    if (sigWrapRef.current) ro.observe(sigWrapRef.current);

    return () => ro.disconnect();
  }, [step, signedOk, ajustarCanvas]);

  function validate() {
    const parsed = FormSchema.safeParse(form);
    if (parsed.success) {
      setErrors({});
      setForm(parsed.data);
      return true;
    }
    const e: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "form");
      e[k] = issue.message;
    }
    setErrors(e);
    return false;
  }

  async function descargarPDF() {
    if (!token) return;

    setDownloading(true);
    try {
      const res = await fetch("/api/cliente/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error("No se pudo generar el PDF", j?.error);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "contrato.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error("Error descargando PDF");
    } finally {
      setDownloading(false);
    }
  }

  async function firmarYAceptar() {
    if (!token || !prestamo) return;
    if (submitting) return;

    const canvas = sigRef.current;
    if (!canvas || canvas.isEmpty()) {
      toast.error("Falta tu firma", "Dibújala en el recuadro blanco antes de continuar.");
      return;
    }

    const parsed = FormSchema.safeParse(form);
    if (!parsed.success) {
      validate();
      toast.error("Revisa tus datos antes de firmar.");
      setStep("FORM");
      return;
    }

    const firma_dataurl = canvas.getTrimmedCanvas().toDataURL("image/png");

    setSubmitting(true);
    try {
      const res = await fetch("/api/cliente/firmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          ...parsed.data,
          firma_dataurl,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Error firmando contrato", json?.error);
        return;
      }

      setSignedOk(true);
      setPrestamo((p) => (p ? { ...p, estatus: "CONTRATO_FIRMADO" } : p));
      toast.success("Contrato firmado", "Se envió a tu correo. Ya puedes descargar el PDF.");
    } catch (e) {
      console.error(e);
      toast.error("Error de red", "Revisa tu conexión e intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <PageShell>
        <GlassCard>
          <EmptyState
            title="Liga incompleta"
            desc={
              <>
                Falta el parámetro <b className="font-mono">?token=</b> en la dirección. Pide de nuevo
                tu liga a quien te la compartió.
              </>
            }
          />
        </GlassCard>
      </PageShell>
    );
  }

  if (loading) {
    return <LoadingScreen label="Cargando tu contrato…" />;
  }

  if (!prestamo) {
    return (
      <PageShell>
        <GlassCard>
          <EmptyState
            title="No hay datos para mostrar"
            desc="La liga es inválida o el préstamo ya no está disponible."
          />
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <GlassCard className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Proceso de contrato
          </h1>
          <p className="text-sm text-white/70">Completa tus datos, revisa el resumen y firma.</p>
        </div>

        <Stepper current={step} onGo={setStep} />

        {step === "FORM" && (
          <div className="animate-fade-up space-y-5">
            <SectionTitle>Ingresa tus datos</SectionTitle>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Apellido paterno" error={errors.apellido_paterno}>
                {(p) => (
                  <TextInput
                    {...p}
                    value={form.apellido_paterno}
                    onChange={(e) => setForm((prev) => ({ ...prev, apellido_paterno: e.target.value }))}
                    autoComplete="family-name"
                    autoCapitalize="characters"
                  />
                )}
              </Field>

              <Field label="Apellido materno" error={errors.apellido_materno}>
                {(p) => (
                  <TextInput
                    {...p}
                    value={form.apellido_materno}
                    onChange={(e) => setForm((prev) => ({ ...prev, apellido_materno: e.target.value }))}
                    autoCapitalize="characters"
                  />
                )}
              </Field>

              <Field label="Nombre(s)" error={errors.nombres}>
                {(p) => (
                  <TextInput
                    {...p}
                    value={form.nombres}
                    onChange={(e) => setForm((prev) => ({ ...prev, nombres: e.target.value }))}
                    autoComplete="given-name"
                    autoCapitalize="characters"
                  />
                )}
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Número de INE" error={errors.ine_numero}>
                {(p) => (
                  <TextInput
                    {...p}
                    value={form.ine_numero}
                    onChange={(e) => setForm((prev) => ({ ...prev, ine_numero: e.target.value }))}
                    spellCheck={false}
                  />
                )}
              </Field>

              <Field label="Banco" error={errors.banco}>
                {(p) => (
                  <TextInput
                    {...p}
                    value={form.banco}
                    onChange={(e) => setForm((prev) => ({ ...prev, banco: e.target.value }))}
                    autoCapitalize="characters"
                  />
                )}
              </Field>

              <Field
                label="Número de tarjeta"
                error={errors.numero_tarjeta}
                hint={!errors.numero_tarjeta ? "Solo se guardan los últimos 4 visibles." : undefined}
              >
                {(p) => (
                  <TextInput
                    {...p}
                    value={form.numero_tarjeta}
                    onChange={(e) => setForm((prev) => ({ ...prev, numero_tarjeta: e.target.value }))}
                    inputMode="numeric"
                    autoComplete="cc-number"
                    spellCheck={false}
                  />
                )}
              </Field>
            </div>

            <Field label="Dirección completa" error={errors.direccion}>
              {(p) => (
                <TextInput
                  {...p}
                  value={form.direccion}
                  onChange={(e) => setForm((prev) => ({ ...prev, direccion: e.target.value }))}
                  autoComplete="street-address"
                />
              )}
            </Field>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Teléfono" error={errors.telefono}>
                {(p) => (
                  <TextInput
                    {...p}
                    value={form.telefono}
                    onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value }))}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                )}
              </Field>

              <Field label="Correo" error={errors.correo} hint={!errors.correo ? "Ahí llegará tu contrato." : undefined}>
                {(p) => (
                  <TextInput
                    {...p}
                    value={form.correo}
                    onChange={(e) => setForm((prev) => ({ ...prev, correo: e.target.value }))}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                )}
              </Field>
            </div>

            <Button
              fullWidth
              onClick={() => {
                if (!validate()) {
                  toast.error("Revisa los campos marcados en rojo.");
                  return;
                }
                setStep("RESUMEN");
              }}
            >
              Siguiente
            </Button>
          </div>
        )}

        {step === "RESUMEN" && (
          <div className="animate-fade-up space-y-5">
            <SectionTitle>Revisa antes de firmar</SectionTitle>

            <Panel>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/55">Tus datos</p>
              <div className="mt-2">
                <DataRow label="Cliente" value={nombreCompleto || "—"} />
                <DataRow label="INE" value={form.ine_numero || "—"} />
                <DataRow label="Banco" value={form.banco || "—"} />
                <DataRow label="Tarjeta" value={form.numero_tarjeta ? maskCard(form.numero_tarjeta) : "—"} />
                <DataRow label="Teléfono" value={form.telefono || "—"} />
                <DataRow label="Dirección" value={form.direccion || "—"} />
                <DataRow label="Correo" value={form.correo || "—"} />
              </div>
            </Panel>

            <Panel>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
                Condiciones del préstamo
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
                    Pagas cada quincena
                  </p>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">
                    {money(prestamo.pago_quincenal)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
                    Total a pagar
                  </p>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">
                    {money(prestamo.total_a_pagar)}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <DataRow label="Monto prestado" value={money(prestamo.monto)} />
                <DataRow label="Número de pagos" value={`${prestamo.quincenas} quincenas`} />
                <DataRow label="Primer pago" value={formatFechaMX(prestamo.fecha_inicio)} />
                <DataRow label="Último pago" value={formatFechaMX(prestamo.fecha_termino)} />
                <DataRow label="Interés total del plazo" value={pct(prestamo.interes_total_pct)} />
              </div>
            </Panel>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" fullWidth onClick={() => setStep("FORM")}>
                Volver
              </Button>
              <Button fullWidth onClick={() => setStep("FIRMA")}>
                Estoy de acuerdo
              </Button>
            </div>
          </div>
        )}

        {step === "FIRMA" && (
          <div className="animate-fade-up space-y-5">
            <SectionTitle>Firma digital</SectionTitle>

            <Panel>
              <p className="text-sm text-white/85">
                Acepto un préstamo de <b className="text-white">{money(prestamo.monto)}</b> a pagar en{" "}
                <b className="text-white">{prestamo.quincenas} quincenas</b> de{" "}
                <b className="text-white">{money(prestamo.pago_quincenal)}</b>, con un total de{" "}
                <b className="text-white">{money(prestamo.total_a_pagar)}</b>.
              </p>

              <div className="mt-3">
                <DataRow label="Primer pago" value={formatFechaMX(prestamo.fecha_inicio)} />
                <DataRow label="Último pago" value={formatFechaMX(prestamo.fecha_termino)} />
                <DataRow label="INE" value={form.ine_numero || "—"} />
                <DataRow label="Banco" value={form.banco || "—"} />
                <DataRow label="Tarjeta" value={form.numero_tarjeta ? maskCard(form.numero_tarjeta) : "—"} />
                <DataRow label="Correo" value={form.correo || "—"} />
              </div>
            </Panel>

            {!signedOk && (
              <>
                <div>
                  <p className="text-sm font-semibold text-white/90">Dibuja tu firma</p>
                  <p className="mt-0.5 text-sm text-white/55">
                    Usa el dedo o el mouse dentro del recuadro.
                  </p>

                  <div
                    ref={sigWrapRef}
                    className="mt-3 overflow-hidden rounded-2xl border border-white/15 bg-white shadow-inner"
                  >
                    <SignatureCanvas
                      ref={sigRef}
                      canvasProps={{
                        className: "block w-full touch-none bg-white",
                        "aria-label": "Área de firma",
                      }}
                      minWidth={1}
                      maxWidth={2.5}
                      penColor="#1b072c"
                      onBegin={() => setHayTrazo(true)}
                    />
                  </div>

                  {!hayTrazo && (
                    <p className="mt-2 text-sm text-white/50">
                      El recuadro está vacío: aún no has firmado.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => {
                      sigRef.current?.clear();
                      setHayTrazo(false);
                    }}
                    disabled={submitting}
                  >
                    Limpiar firma
                  </Button>

                  <Button fullWidth onClick={firmarYAceptar} loading={submitting}>
                    {submitting ? "Procesando…" : "Firmar y aceptar"}
                  </Button>
                </div>

                <p className="text-xs text-white/55">
                  Al firmar, el contrato se enviará a tu correo y a Gael como evidencia.
                </p>
              </>
            )}

            {signedOk && (
              <div className="animate-fade-up rounded-card border border-emerald-300/25 bg-emerald-400/10 p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-emerald-300/30 bg-emerald-400/20 text-lg text-emerald-100"
                  >
                    ✓
                  </span>
                  <div>
                    <p className="text-lg font-extrabold text-white">Contrato firmado correctamente</p>
                    <p className="mt-1 text-sm text-white/70">
                      Puedes volver a entrar con la misma liga para descargar el PDF mientras esté
                      activa.
                    </p>
                  </div>
                </div>

                <Button fullWidth className="mt-5" onClick={descargarPDF} loading={downloading}>
                  {downloading ? "Generando PDF…" : "Descargar contrato PDF"}
                </Button>
              </div>
            )}
          </div>
        )}
      </GlassCard>
    </PageShell>
  );
}
