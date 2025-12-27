"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

type Prestamo = {
  id: number;
  cliente_id: number | null;
  monto: number;
  quincenas: number;
  interes_total_pct: number;
  pago_quincenal: number;
  total_a_pagar: number;
  fecha_inicio: string;
  fecha_termino: string;
  estatus: string;
  liga_token: string | null;
};

type Cliente = {
  id: number;
  nombre_completo: string;
  direccion: string | null;
  telefono: string;
  correo: string | null;
};

function money(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatFechaMX(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "2-digit" });
}

async function downloadPdfFromToken(token: string) {
  const res = await fetch("/api/cliente/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(j?.error ?? "No se pudo generar el PDF");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "contrato.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}

export default function ContratoClient() {
  const sp = useSearchParams();
  const id = sp.get("id");
  const token = sp.get("token");

  const [prestamo, setPrestamo] = useState<Prestamo | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);

      if (token) {
        const { data: p, error: errP } = await supabase.from("prestamos").select("*").eq("liga_token", token).single();

        if (errP || !p) {
          console.error(errP);
          alert("No se pudo cargar el préstamo (token inválido).");
          setLoading(false);
          return;
        }

        if (!p.cliente_id) {
          alert("Faltan datos del cliente.");
          setLoading(false);
          return;
        }

        const { data: c, error: errC } = await supabase
          .from("formularios_clientes")
          .select("*")
          .eq("id", p.cliente_id)
          .single();

        if (errC || !c) {
          console.error(errC);
          alert("No se pudo cargar el cliente.");
          setLoading(false);
          return;
        }

        setPrestamo(p as Prestamo);
        setCliente(c as Cliente);
        setLoading(false);
        return;
      }

      if (!id) {
        setLoading(false);
        return;
      }

      const { data: p, error: errP } = await supabase.from("prestamos").select("*").eq("id", Number(id)).single();

      if (errP || !p) {
        console.error(errP);
        alert("No se pudo cargar el préstamo");
        setLoading(false);
        return;
      }

      if (!p.cliente_id) {
        alert("Este préstamo aún no tiene cliente ligado.");
        setPrestamo(p as Prestamo);
        setLoading(false);
        return;
      }

      const { data: c, error: errC } = await supabase
        .from("formularios_clientes")
        .select("*")
        .eq("id", p.cliente_id)
        .single();

      if (errC || !c) {
        console.error(errC);
        alert("No se pudo cargar el cliente");
        setLoading(false);
        return;
      }

      setPrestamo(p as Prestamo);
      setCliente(c as Cliente);
      setLoading(false);
    })();
  }, [id, token]);

  const textoContrato = useMemo(() => {
    if (!prestamo || !cliente) return "";
    return [
      "CONTRATO DE PRÉSTAMO (VISTA PREVIA)",
      "",
      `Cliente: ${cliente.nombre_completo}`,
      `Teléfono: ${cliente.telefono}`,
      `Dirección: ${cliente.direccion ?? "—"}`,
      `Correo: ${cliente.correo ?? "—"}`,
      "",
      `Por medio del presente, ${cliente.nombre_completo} solicita un préstamo por la cantidad de ${money(prestamo.monto)}, a pagarse en ${prestamo.quincenas} quincenas.`,
      "",
      `El pago quincenal será de ${money(prestamo.pago_quincenal)}, con un total a pagar de ${money(prestamo.total_a_pagar)}.`,
      "",
      `La fecha de inicio es ${formatFechaMX(prestamo.fecha_inicio)} y la fecha de término es ${formatFechaMX(prestamo.fecha_termino)}.`,
      "",
      `Interés total aplicado: ${Number(prestamo.interes_total_pct).toFixed(6)}%.`,
      "",
      "Firmas:",
      "__________________________   __________________________",
      "      CLIENTE                          PRESTAMISTA",
    ].join("\n");
  }, [prestamo, cliente]);

  if (!id && !token) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6">
          <h1 className="text-xl font-bold">Contrato</h1>
          <p className="mt-2 text-red-600">
            Falta <b>?token=</b> (cliente) o <b>?id=</b> (interno).
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6">
          <p>Cargando contrato...</p>
        </div>
      </div>
    );
  }

  if (!prestamo || !cliente) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6">
          <p>No hay datos para mostrar.</p>
        </div>
      </div>
    );
  }

  const canDownload = Boolean(token) && prestamo.estatus === "CONTRATO_FIRMADO";

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-8 space-y-4">
        <h1 className="text-2xl font-bold">Vista previa del contrato</h1>

        <div className="text-sm text-gray-700">
          <p><b>Cliente:</b> {cliente.nombre_completo}</p>
          <p><b>Teléfono:</b> {cliente.telefono}</p>
          <p><b>Dirección:</b> {cliente.direccion || "—"}</p>
          <p><b>Correo:</b> {cliente.correo || "—"}</p>
        </div>

        <hr />

        <pre className="whitespace-pre-wrap text-sm bg-gray-50 border rounded p-4">{textoContrato}</pre>

        <div className="pt-4 flex flex-col md:flex-row gap-3">
          <button className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded" onClick={() => history.back()}>
            Volver
          </button>

          <button
            disabled={!canDownload || downloading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded"
            onClick={async () => {
              if (!token) {
                alert("Para descargar como cliente se requiere ?token=");
                return;
              }

              try {
                setDownloading(true);
                await downloadPdfFromToken(token);
              } catch (e: unknown) {
                const message = e instanceof Error ? e.message : "Error descargando PDF";
                alert(message);
              } finally {
                setDownloading(false);
              }
            }}
          >
            {downloading ? "Generando..." : "Descargar contrato PDF"}
          </button>
        </div>

        {!canDownload && (
          <p className="text-sm text-gray-500">
            Nota: La descarga se habilita cuando el contrato está <b>firmado</b> y la página se abre con <b>?token=</b>.
          </p>
        )}
      </div>
    </div>
  );
}
