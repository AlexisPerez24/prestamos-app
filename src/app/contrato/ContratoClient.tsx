"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { formatFechaMX, money, pct } from "../lib/format";
import { useToast } from "../components/Toaster";
import {
  Badge,
  Button,
  DataRow,
  EmptyState,
  GlassCard,
  LoadingScreen,
  PageHeader,
  PageShell,
  Panel,
  SectionTitle,
} from "../components/ui";

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
  const toast = useToast();

  const [prestamo, setPrestamo] = useState<Prestamo | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // ✅ flujo cliente (token)
      if (token) {
        const { data: p, error: errP } = await supabase
          .from("prestamos")
          .select("*")
          .eq("liga_token", token)
          .single();

        if (errP || !p) {
          console.error(errP);
          toast.error("No se pudo cargar el préstamo", "La liga (token) no es válida.");
          setLoading(false);
          return;
        }

        if (!p.cliente_id) {
          toast.error("Faltan datos del cliente.");
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
          toast.error("No se pudo cargar el cliente.");
          setLoading(false);
          return;
        }

        setPrestamo(p as Prestamo);
        setCliente(c as Cliente);
        setLoading(false);
        return;
      }

      // ✅ flujo interno (id)
      if (!id) {
        setLoading(false);
        return;
      }

      const { data: p, error: errP } = await supabase
        .from("prestamos")
        .select("*")
        .eq("id", Number(id))
        .single();

      if (errP || !p) {
        console.error(errP);
        toast.error("No se pudo cargar el préstamo");
        setLoading(false);
        return;
      }

      if (!p.cliente_id) {
        toast.info("Este préstamo aún no tiene cliente ligado.");
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
        toast.error("No se pudo cargar el cliente");
        setLoading(false);
        return;
      }

      setPrestamo(p as Prestamo);
      setCliente(c as Cliente);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  const intereses = useMemo(() => {
    if (!prestamo) return null;

    const interesTotal = Number(prestamo.interes_total_pct || 0);

    // ✅ anual aproximado desde tu interes_total_pct (que viene del Excel)
    const interesOrdinarioAnual =
      prestamo.quincenas > 0 ? (interesTotal * 24) / prestamo.quincenas : 0;

    // ✅ moratorio mensual fijo (ajústalo a tu gusto)
    const interesMoratorioMensual = 10;

    return { interesTotal, interesOrdinarioAnual, interesMoratorioMensual };
  }, [prestamo]);

  if (!id && !token) {
    return (
      <PageShell>
        <GlassCard>
          <EmptyState
            title="Falta identificar el contrato"
            desc={
              <>
                Abre esta página con <b className="font-mono">?token=</b> (cliente) o{" "}
                <b className="font-mono">?id=</b> (interno).
              </>
            }
          />
        </GlassCard>
      </PageShell>
    );
  }

  if (loading) {
    return <LoadingScreen label="Cargando contrato…" />;
  }

  if (!prestamo || !cliente || !intereses) {
    return (
      <PageShell>
        <GlassCard>
          <EmptyState
            title="No hay datos para mostrar"
            desc="Verifica la liga o que el préstamo ya tenga un cliente ligado."
            action={
              <Button variant="secondary" onClick={() => history.back()}>
                Volver
              </Button>
            }
          />
        </GlassCard>
      </PageShell>
    );
  }

  const firmado = prestamo.estatus === "CONTRATO_FIRMADO";
  const canDownload = Boolean(token) && firmado;

  return (
    <PageShell>
      <GlassCard className="space-y-6">
        <PageHeader
          title="Vista previa del contrato"
          subtitle="Así quedará el documento que recibe el cliente."
          actions={<Badge tone={firmado ? "success" : "warning"}>{firmado ? "Firmado" : "Pendiente de firma"}</Badge>}
        />

        {/* Partes */}
        <Panel>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/55">Cliente</p>
          <div className="mt-2">
            <DataRow label="Nombre" value={cliente.nombre_completo} />
            <DataRow label="Teléfono" value={cliente.telefono} />
            <DataRow label="Dirección" value={cliente.direccion || "—"} />
            <DataRow label="Correo" value={cliente.correo || "—"} />
          </div>
        </Panel>

        {/* Condiciones */}
        <Panel>
          <SectionTitle>Condiciones del préstamo</SectionTitle>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
                Pago quincenal
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
            <DataRow label="Monto del préstamo" value={money(prestamo.monto)} />
            <DataRow label="Plazo" value={`${prestamo.quincenas} quincenas`} />
            <DataRow label="Fecha de inicio" value={formatFechaMX(prestamo.fecha_inicio)} />
            <DataRow label="Fecha de término" value={formatFechaMX(prestamo.fecha_termino)} />
          </div>
        </Panel>

        {/* Cláusula */}
        <Panel>
          <SectionTitle>Tercera.— Intereses</SectionTitle>

          <div className="mt-3 space-y-3 text-sm leading-relaxed text-white/80">
            <p>
              El préstamo causará un interés ordinario del{" "}
              <b className="text-white">{pct(intereses.interesOrdinarioAnual)} anual</b>, mismo que será
              cubierto junto con cada pago quincenal.
            </p>
            <p>
              En caso de incumplimiento en el pago oportuno, se causarán intereses moratorios del{" "}
              <b className="text-white">{pct(intereses.interesMoratorioMensual)} mensual</b> sobre el
              saldo insoluto.
            </p>
            <p>
              Interés total aplicado durante todo el plazo:{" "}
              <b className="text-white">{pct(intereses.interesTotal)}</b>.
            </p>
          </div>
        </Panel>

        {/* Firmas */}
        <Panel>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/55">Firmas</p>
          <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-2">
            {["Cliente", "Prestamista"].map((rol) => (
              <div key={rol} className="text-center">
                <div className="mx-auto h-px w-full max-w-[220px] bg-white/35" />
                <p className="mt-2 text-xs font-bold uppercase tracking-widest text-white/70">{rol}</p>
              </div>
            ))}
          </div>
        </Panel>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" fullWidth onClick={() => history.back()}>
            Volver
          </Button>

          <Button
            fullWidth
            disabled={!canDownload}
            loading={downloading}
            onClick={async () => {
              if (!token) {
                toast.info("Descarga no disponible", "Para descargar como cliente se requiere ?token=");
                return;
              }

              try {
                setDownloading(true);
                await downloadPdfFromToken(token);
              } catch (e: unknown) {
                const message = e instanceof Error ? e.message : "Error descargando PDF";
                toast.error("No se pudo descargar", message);
              } finally {
                setDownloading(false);
              }
            }}
          >
            {downloading ? "Generando…" : "Descargar contrato PDF"}
          </Button>
        </div>

        {!canDownload && (
          <p className="text-sm text-white/55">
            La descarga se habilita cuando el contrato está <b className="text-white/80">firmado</b> y
            la página se abre con <b className="font-mono text-white/80">?token=</b>.
          </p>
        )}
      </GlassCard>
    </PageShell>
  );
}
