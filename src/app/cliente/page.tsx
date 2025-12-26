"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import { z } from "zod";
import { supabase } from "../lib/supabaseClient";

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

function money(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatFechaMX(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "2-digit" });
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

  numero_tarjeta: z
    .string()
    .min(8, "Tarjeta inválida")
    .max(25, "Tarjeta inválida")
    .transform(onlyDigits),

  direccion: z.string().min(5, "Escribe la dirección").transform(normalizeTrim),

  telefono: z
    .string()
    .min(10, "Teléfono inválido (mínimo 10 dígitos)")
    .max(15, "Teléfono demasiado largo")
    .regex(/^[0-9+ ]+$/, "Solo números, espacios o +")
    .transform(normalizeTrim),

  correo: z.string().optional(),
});

function ClienteInner() {
  const sp = useSearchParams();
  const token = sp.get("token");

  const [prestamo, setPrestamo] = useState<Prestamo | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"FORM" | "RESUMEN" | "FIRMA">("FORM");

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

  // ✅ FIX: ref correcto (no callback que regresa valor)
  const sigRef = useRef<SignatureCanvas>(null);

  const [submitting, setSubmitting] = useState(false);
  const [signedOk, setSignedOk] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data, error } = await supabase
        .from("prestamos")
        .select("id,monto,quincenas,pago_quincenal,total_a_pagar,interes_total_pct,fecha_inicio,fecha_termino,estatus")
        .eq("liga_token", token)
        .single();

      if (error || !data) {
        console.error(error);
        alert("Liga inválida o préstamo no encontrado");
        setPrestamo(null);
        setLoading(false);
        return;
      }

      if (["CANCELADO", "TERMINADO"].includes(data.estatus)) {
        alert("Esta liga ya no está disponible.");
        setPrestamo(null);
        setLoading(false);
        return;
      }

      if (data.estatus === "CONTRATO_FIRMADO") {
        setSignedOk(true);
        setStep("FIRMA");
      }

      setPrestamo(data as Prestamo);
      setLoading(false);
    })();
  }, [token]);

  const nombreCompleto = useMemo(() => {
    return `${form.apellido_paterno} ${form.apellido_materno} ${form.nombres}`.replace(/\s+/g, " ").trim();
  }, [form]);

  function validate() {
    const parsed = FormSchema.safeParse(form);
    if (parsed.success) {
      setErrors({});
      setForm({ ...parsed.data, correo: parsed.data.correo ?? "" }); // ✅ correo siempre string
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

    try {
      const res = await fetch("/api/cliente/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "No se pudo generar el PDF");
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
      alert("Error descargando PDF");
    }
  }

  async function firmarYAceptar() {
    if (!token || !prestamo) return;
    if (submitting) return;

    const canvas = sigRef.current;
    if (!canvas || canvas.isEmpty()) {
      alert("Dibuja tu firma antes de continuar.");
      return;
    }

    const parsed = FormSchema.safeParse(form);
    if (!parsed.success) {
      validate();
      alert("Revisa tus datos antes de firmar.");
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
        alert(json?.error ?? "Error firmando contrato");
        return;
      }

      setSignedOk(true);
      setPrestamo((p) => (p ? { ...p, estatus: "CONTRATO_FIRMADO" } : p));
      alert("Contrato firmado correctamente ✅\nAhora puedes descargar tu PDF.");
    } catch (e) {
      console.error(e);
      alert("Error de red firmando contrato");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow p-6">
          <h1 className="text-xl font-bold">Contrato</h1>
          <p className="mt-2 text-red-600">
            Falta el parámetro <b>?token=</b>
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow p-6">
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  if (!prestamo) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow p-6">
          <p>No hay datos para mostrar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-8 space-y-6">
        <h1 className="text-2xl font-bold">Proceso de contrato</h1>

        {step === "FORM" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Datos del cliente</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label>Apellido paterno</label>
                <input
                  value={form.apellido_paterno}
                  onChange={(e) => setForm((p) => ({ ...p, apellido_paterno: e.target.value }))}
                  className="w-full border p-2 rounded"
                />
                {errors.apellido_paterno && <p className="text-red-600 text-sm">{errors.apellido_paterno}</p>}
              </div>

              <div>
                <label>Apellido materno</label>
                <input
                  value={form.apellido_materno}
                  onChange={(e) => setForm((p) => ({ ...p, apellido_materno: e.target.value }))}
                  className="w-full border p-2 rounded"
                />
                {errors.apellido_materno && <p className="text-red-600 text-sm">{errors.apellido_materno}</p>}
              </div>

              <div>
                <label>Nombre(s)</label>
                <input
                  value={form.nombres}
                  onChange={(e) => setForm((p) => ({ ...p, nombres: e.target.value }))}
                  className="w-full border p-2 rounded"
                />
                {errors.nombres && <p className="text-red-600 text-sm">{errors.nombres}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label>Número de INE</label>
                <input
                  value={form.ine_numero}
                  onChange={(e) => setForm((p) => ({ ...p, ine_numero: e.target.value }))}
                  className="w-full border p-2 rounded"
                />
                {errors.ine_numero && <p className="text-red-600 text-sm">{errors.ine_numero}</p>}
              </div>

              <div>
                <label>Banco</label>
                <input
                  value={form.banco}
                  onChange={(e) => setForm((p) => ({ ...p, banco: e.target.value }))}
                  className="w-full border p-2 rounded"
                />
                {errors.banco && <p className="text-red-600 text-sm">{errors.banco}</p>}
              </div>

              <div>
                <label>Número de tarjeta</label>
                <input
                  value={form.numero_tarjeta}
                  onChange={(e) => setForm((p) => ({ ...p, numero_tarjeta: e.target.value }))}
                  className="w-full border p-2 rounded"
                />
                {errors.numero_tarjeta && <p className="text-red-600 text-sm">{errors.numero_tarjeta}</p>}
              </div>
            </div>

            <div>
              <label>Dirección completa</label>
              <input
                value={form.direccion}
                onChange={(e) => setForm((p) => ({ ...p, direccion: e.target.value }))}
                className="w-full border p-2 rounded"
              />
              {errors.direccion && <p className="text-red-600 text-sm">{errors.direccion}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label>Teléfono</label>
                <input
                  value={form.telefono}
                  onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))}
                  className="w-full border p-2 rounded"
                />
                {errors.telefono && <p className="text-red-600 text-sm">{errors.telefono}</p>}
              </div>

              <div>
                <label>Correo (opcional)</label>
                <input
                  value={form.correo}
                  onChange={(e) => setForm((p) => ({ ...p, correo: e.target.value }))}
                  className="w-full border p-2 rounded"
                />
              </div>
            </div>

            <button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
              onClick={() => {
                if (!validate()) return;
                setStep("RESUMEN");
              }}
            >
              Siguiente
            </button>
          </div>
        )}

        {step === "RESUMEN" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Resumen</h2>

            <div className="border rounded p-4 bg-gray-50 space-y-2">
              <p><b>Cliente:</b> {nombreCompleto || "—"}</p>
              <p><b>INE:</b> {form.ine_numero || "—"}</p>
              <p><b>Banco:</b> {form.banco || "—"}</p>
              <p><b>Tarjeta:</b> {form.numero_tarjeta ? maskCard(form.numero_tarjeta) : "—"}</p>

              <hr className="my-2" />

              <p><b>Teléfono:</b> {form.telefono || "—"}</p>
              <p><b>Dirección:</b> {form.direccion || "—"}</p>
              <p><b>Correo:</b> {form.correo || "—"}</p>

              <hr className="my-2" />

              <p><b>Monto prestado:</b> {money(prestamo.monto)}</p>
              <p><b>Pago por quincena:</b> {money(prestamo.pago_quincenal)}</p>
              <p><b>Número de pagos:</b> {prestamo.quincenas}</p>
              <p><b>Total a pagar:</b> {money(prestamo.total_a_pagar)}</p>
              <p><b>Fecha primer pago:</b> {formatFechaMX(prestamo.fecha_inicio)}</p>
              <p><b>Fecha último pago:</b> {formatFechaMX(prestamo.fecha_termino)}</p>
              <p><b>Interés total aplicado:</b> {prestamo.interes_total_pct.toFixed(6)}%</p>
            </div>

            <div className="flex gap-3">
              <button className="w-full bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded" onClick={() => setStep("FORM")}>
                Volver
              </button>
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded" onClick={() => setStep("FIRMA")}>
                Aceptar
              </button>
            </div>
          </div>
        )}

        {step === "FIRMA" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Firma digital</h2>

            <div className="border rounded p-4 bg-gray-50 space-y-1 text-sm">
              <p>
                <b>Estoy de acuerdo con:</b> préstamo de {money(prestamo.monto)} a {prestamo.quincenas} pagos de{" "}
                {money(prestamo.pago_quincenal)} (total {money(prestamo.total_a_pagar)}).
              </p>
              <p>
                <b>Primer pago:</b> {formatFechaMX(prestamo.fecha_inicio)} — <b>Último pago:</b>{" "}
                {formatFechaMX(prestamo.fecha_termino)}
              </p>
              <p>
                <b>INE:</b> {form.ine_numero || "—"} — <b>Banco:</b> {form.banco || "—"} — <b>Tarjeta:</b>{" "}
                {form.numero_tarjeta ? maskCard(form.numero_tarjeta) : "—"}
              </p>
            </div>

            {!signedOk && (
              <>
                <p className="text-sm text-gray-600">Dibuja tu firma y presiona “Firmar y aceptar”.</p>

                <div className="border rounded">
                  <SignatureCanvas
                    ref={sigRef}
                    canvasProps={{ width: 900, height: 250, className: "w-full h-[250px] bg-white" }}
                    // ✅ FIX: props correctas
                    minWidth={1}
                    maxWidth={2.5}
                  />
                </div>

                <div className="flex gap-3">
                  <button className="w-full bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded" onClick={() => sigRef.current?.clear()} disabled={submitting}>
                    Limpiar firma
                  </button>

                  <button
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded"
                    onClick={firmarYAceptar}
                    disabled={submitting}
                  >
                    {submitting ? "Procesando..." : "Firmar y aceptar"}
                  </button>
                </div>
              </>
            )}

            {signedOk && (
              <div className="border rounded p-4 bg-green-50 space-y-3">
                <p className="font-semibold">✅ Contrato firmado correctamente.</p>

                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded" onClick={descargarPDF}>
                  Descargar contrato PDF
                </button>

                <p className="text-sm text-gray-600">
                  Si cierras esta página, puedes volver a entrar con la misma liga para descargar el PDF mientras esté activa.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ✅ Wrapper con Suspense (esto quita el error de prerender/build)
export default function ClientePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-2xl mx-auto bg-white rounded-xl shadow p-6">
            <p>Cargando...</p>
          </div>
        </div>
      }
    >
      <ClienteInner />
    </Suspense>
  );
}
