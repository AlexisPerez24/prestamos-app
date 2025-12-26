import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

const ONLY_LETTERS_SPACES = /^[A-ZÁÉÍÓÚÑÜ\s]+$/i;

function normalizeUpper(v: string) {
  return v.replace(/\s+/g, " ").trim().toUpperCase();
}

function normalizeCard(v: string) {
  // deja solo números (por si pegan con espacios)
  return v.replace(/\D+/g, "").trim();
}

const BodySchema = z.object({
  token: z.string().min(10),

  apellido_paterno: z.string().min(2).transform(normalizeUpper).refine((v) => ONLY_LETTERS_SPACES.test(v), "Solo letras"),
  apellido_materno: z.string().min(2).transform(normalizeUpper).refine((v) => ONLY_LETTERS_SPACES.test(v), "Solo letras"),
  nombres: z.string().min(2).transform(normalizeUpper).refine((v) => ONLY_LETTERS_SPACES.test(v), "Solo letras"),

  // ✅ NUEVOS (del flujo)
  ine_numero: z.string().min(6, "INE inválido").max(30, "INE demasiado largo").transform((v) => v.replace(/\s+/g, "").trim()),
  banco: z.string().min(2, "Banco inválido").max(60, "Banco demasiado largo").transform(normalizeUpper),
  numero_tarjeta: z
    .string()
    .min(8, "Tarjeta inválida")
    .max(25, "Tarjeta inválida")
    .transform(normalizeCard),

  telefono: z
    .string()
    .min(10, "Teléfono inválido")
    .max(15, "Teléfono inválido")
    .regex(/^[0-9+ ]+$/, "Solo números, espacios o +")
    .transform((v) => v.replace(/\s+/g, " ").trim()),

  correo: z.string().email().optional().or(z.literal("")),
  direccion: z.string().min(5).transform((v) => v.replace(/\s+/g, " ").trim()),

  firma_dataurl: z.string().min(30), // base64 PNG
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    // 1) Buscar préstamo por token
    const { data: prestamo, error: errPrestamo } = await supabaseAdmin
      .from("prestamos")
      .select("id, cliente_id, estatus")
      .eq("liga_token", body.token)
      .single();

    if (errPrestamo || !prestamo) {
      return NextResponse.json({ error: "Token inválido" }, { status: 400 });
    }

    if (["CANCELADO", "TERMINADO"].includes(prestamo.estatus)) {
      return NextResponse.json({ error: "Este préstamo ya no acepta firma" }, { status: 403 });
    }

    // 2) Nombre completo
    const nombre_completo = `${body.apellido_paterno} ${body.apellido_materno} ${body.nombres}`
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    let clienteId = (prestamo.cliente_id as number | null) ?? null;

    // 3) Insertar o actualizar cliente (✅ ahora con INE/banco/tarjeta)
    const payloadCliente = {
      apellido_paterno: body.apellido_paterno,
      apellido_materno: body.apellido_materno,
      nombres: body.nombres,
      nombre_completo,
      telefono: body.telefono,
      correo: body.correo || null,
      direccion: body.direccion,
      ine_numero: body.ine_numero,
      banco: body.banco,
      numero_tarjeta: body.numero_tarjeta,
    };

    if (clienteId) {
      const { error } = await supabaseAdmin.from("formularios_clientes").update(payloadCliente).eq("id", clienteId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseAdmin
        .from("formularios_clientes")
        .insert([payloadCliente])
        .select("id")
        .single();

      if (error || !data) throw error;
      clienteId = data.id;
    }

    // 4) Guardar firma y cerrar contrato
    const { error: errUpd } = await supabaseAdmin
      .from("prestamos")
      .update({
        cliente_id: clienteId,
        firma_dataurl: body.firma_dataurl,
        fecha_firma: new Date().toISOString(),
        estatus: "CONTRATO_FIRMADO",
      })
      .eq("id", prestamo.id);

    if (errUpd) throw errUpd;

    return NextResponse.json({
      ok: true,
      redirect: `/contrato?id=${prestamo.id}`,
    });
} catch (e: unknown) {
  console.error(e);

  const message =
    e instanceof Error ? e.message : "Error interno";

  return NextResponse.json(
    { error: message },
    { status: 400 }
  );
}

}
