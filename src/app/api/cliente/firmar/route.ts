import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { enviarContratoEmails } from "@/app/lib/email";

export const runtime = "nodejs";

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

const BodySchema = z.object({
  token: z.string().min(10),

  apellido_paterno: z
    .string()
    .min(2)
    .transform(normalizeUpper)
    .refine((v) => ONLY_LETTERS_SPACES.test(v), "Solo letras"),
  apellido_materno: z
    .string()
    .min(2)
    .transform(normalizeUpper)
    .refine((v) => ONLY_LETTERS_SPACES.test(v), "Solo letras"),
  nombres: z
    .string()
    .min(2)
    .transform(normalizeUpper)
    .refine((v) => ONLY_LETTERS_SPACES.test(v), "Solo letras"),

  ine_numero: z
    .string()
    .min(6, "INE inválido")
    .max(30, "INE demasiado largo")
    .transform((v) => v.replace(/\s+/g, "").trim()),

  banco: z
    .string()
    .min(2, "Banco inválido")
    .max(60, "Banco demasiado largo")
    .transform(normalizeUpper),

  numero_tarjeta: z
    .string()
    .min(8, "Tarjeta inválida")
    .max(25, "Tarjeta inválida")
    .transform(onlyDigits),

  telefono: z
    .string()
    .min(10, "Teléfono inválido")
    .max(15, "Teléfono inválido")
    .regex(/^[0-9+ ]+$/, "Solo números, espacios o +")
    .transform(normalizeTrim),

  correo: z
    .union([z.string().email("Correo inválido"), z.literal("")])
    .optional()
    .transform((v) => (v ? normalizeEmail(v) : "")),

  direccion: z.string().min(5, "Dirección inválida").transform(normalizeTrim),

  firma_dataurl: z.string().min(30),
});

/**
 * ✅ Base URL confiable en Vercel:
 * - Vercel manda x-forwarded-host y x-forwarded-proto
 * - si no existen, cae a APP_URL
 * - si tampoco, cae a new URL(req.url).origin
 */
function getBaseUrl(req: Request) {
  const h = req.headers;

  const xfHost = h.get("x-forwarded-host");
  const xfProto = h.get("x-forwarded-proto");

  if (xfHost) {
    const proto = xfProto || "https";
    return `${proto}://${xfHost}`;
  }

  if (process.env.APP_URL?.trim()) return process.env.APP_URL.trim();

  return new URL(req.url).origin;
}

async function generarPdfBase64DesdeToken(token: string, baseUrl: string) {
  const url = `${baseUrl}/api/cliente/pdf`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    let bodyText = "";

    if (contentType.includes("application/json")) {
      const j = await res.json().catch(() => ({}));
      bodyText = JSON.stringify(j);
    } else {
      bodyText = await res.text().catch(() => "");
    }

    throw new Error(
      `No se pudo generar PDF para correo (status ${res.status}). URL=${url}. Body=${bodyText.slice(
        0,
        500
      )}`
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    const { data: prestamo, error: errPrestamo } = await supabaseAdmin
      .from("prestamos")
      // ✅ IMPORTANTE: traer numero_folio
      .select("id, numero_folio, cliente_id, estatus, liga_token")
      .eq("liga_token", body.token)
      .single();

    if (errPrestamo || !prestamo) {
      return NextResponse.json({ error: "Token inválido" }, { status: 400 });
    }

    if (["CANCELADO", "TERMINADO"].includes(prestamo.estatus)) {
      return NextResponse.json(
        { error: "Este préstamo ya no acepta firma" },
        { status: 403 }
      );
    }

    const nombre_completo = `${body.apellido_paterno} ${body.apellido_materno} ${body.nombres}`
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    let clienteId = (prestamo.cliente_id as number | null) ?? null;

    const payloadCliente = {
      apellido_paterno: body.apellido_paterno,
      apellido_materno: body.apellido_materno,
      nombres: body.nombres,
      nombre_completo,
      telefono: body.telefono,
      correo: body.correo ? body.correo : null,
      direccion: body.direccion,
      ine_numero: body.ine_numero,
      banco: body.banco,
      numero_tarjeta: body.numero_tarjeta,
    };

    if (clienteId) {
      const { error } = await supabaseAdmin
        .from("formularios_clientes")
        .update(payloadCliente)
        .eq("id", clienteId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      const { data, error } = await supabaseAdmin
        .from("formularios_clientes")
        .insert([payloadCliente])
        .select("id")
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message || "No se pudo crear cliente" },
          { status: 400 }
        );
      }

      clienteId = data.id;
    }

    const { error: errUpd } = await supabaseAdmin
      .from("prestamos")
      .update({
        cliente_id: clienteId,
        firma_dataurl: body.firma_dataurl,
        fecha_firma: new Date().toISOString(),
        estatus: "CONTRATO_FIRMADO",
      })
      .eq("id", prestamo.id);

    if (errUpd) {
      return NextResponse.json({ error: errUpd.message }, { status: 400 });
    }

    // ======= ENVIAR CORREOS (PDF adjunto) =======
    const baseUrl = getBaseUrl(req);
    const pdfBase64 = await generarPdfBase64DesdeToken(body.token, baseUrl);
    const filename = `contrato_prestamo_${prestamo.id}.pdf`;

    const correoCliente = body.correo?.trim()
      ? body.correo.trim().toLowerCase()
      : null;

    const folioLimpio =
      typeof prestamo.numero_folio === "string" && prestamo.numero_folio.trim()
        ? prestamo.numero_folio.trim()
        : "";

    const prestamoFolio = folioLimpio
      ? `Préstamo: ${folioLimpio}`
      : `Préstamo ID: ${prestamo.id}`;

    await enviarContratoEmails({
      clienteEmail: correoCliente,
      clienteNombre: nombre_completo,
      prestamoFolio, // ✅ requerido por email.ts
      pdfBase64,
      filename,
    });

    return NextResponse.json({
      ok: true,
      redirect: `/contrato?id=${prestamo.id}`,
    });
  } catch (e: unknown) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
