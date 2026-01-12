// src/app/api/cliente/pdf/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export const runtime = "nodejs";

const BodySchema = z.object({
  token: z.string().min(10),
});

type ClienteRow = {
  id: number;
  nombre_completo: string | null;
  telefono: string | null;
  direccion: string | null;
  correo: string | null;
  ine_numero: string | null;
  banco: string | null;
  numero_tarjeta: string | null;
};

type PrestamoRow = {
  id: number;
  numero_folio: string | null;
  monto: number | null;
  quincenas: number | null;
  interes_total_pct: number | null;
  pago_quincenal: number | null;
  total_a_pagar: number | null;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  firma_dataurl: string | null;
  estatus: string | null;
  liga_token: string | null;
  formularios_clientes: ClienteRow | ClienteRow[] | null;
};

function dataUrlToUint8Array(dataUrl: string) {
  const m = dataUrl.match(/^data:(.+);base64,(.*)$/);
  if (!m) throw new Error("firma_dataurl inválido");
  const b64 = m[2];
  const bin = Buffer.from(b64, "base64");
  return new Uint8Array(bin);
}

function moneyMXN(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatFechaMX(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
}

function formatFechaSuscripcionHoyMX() {
  const hoy = new Date();
  const dia = String(hoy.getDate()).padStart(2, "0");
  const mes = hoy.toLocaleDateString("es-MX", { month: "long" });
  const anio = hoy.getFullYear();
  return `${dia} de ${mes} de ${anio}`;
}

/** Ajusta texto a líneas aprox (no es tipográfico perfecto, pero funciona bien). */
function wrapText(text: string, maxChars = 95) {
  const out: string[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      out.push("");
      continue;
    }
    const words = line.split(" ");
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (test.length <= maxChars) cur = test;
      else {
        if (cur) out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/* =========================
   Número a letras (MXN)
   ========================= */

function onlyInt(n: number) {
  return Math.floor(Math.abs(n));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function unidades(n: number) {
  switch (n) {
    case 1:
      return "UN";
    case 2:
      return "DOS";
    case 3:
      return "TRES";
    case 4:
      return "CUATRO";
    case 5:
      return "CINCO";
    case 6:
      return "SEIS";
    case 7:
      return "SIETE";
    case 8:
      return "OCHO";
    case 9:
      return "NUEVE";
    default:
      return "";
  }
}

function decenas(n: number) {
  if (n < 10) return unidades(n);
  if (n >= 10 && n < 20) {
    switch (n) {
      case 10:
        return "DIEZ";
      case 11:
        return "ONCE";
      case 12:
        return "DOCE";
      case 13:
        return "TRECE";
      case 14:
        return "CATORCE";
      case 15:
        return "QUINCE";
      case 16:
        return "DIECISÉIS";
      case 17:
        return "DIECISIETE";
      case 18:
        return "DIECIOCHO";
      case 19:
        return "DIECINUEVE";
    }
  }
  if (n >= 20 && n < 30) {
    if (n === 20) return "VEINTE";
    return `VEINTI${unidades(n - 20)}`;
  }
  const d = Math.floor(n / 10);
  const u = n % 10;
  const base =
    d === 3
      ? "TREINTA"
      : d === 4
      ? "CUARENTA"
      : d === 5
      ? "CINCUENTA"
      : d === 6
      ? "SESENTA"
      : d === 7
      ? "SETENTA"
      : d === 8
      ? "OCHENTA"
      : d === 9
      ? "NOVENTA"
      : "";
  return u ? `${base} Y ${unidades(u)}` : base;
}

function centenas(n: number) {
  if (n < 100) return decenas(n);
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const rest = n % 100;
  const base =
    c === 1
      ? "CIENTO"
      : c === 2
      ? "DOSCIENTOS"
      : c === 3
      ? "TRESCIENTOS"
      : c === 4
      ? "CUATROCIENTOS"
      : c === 5
      ? "QUINIENTOS"
      : c === 6
      ? "SEISCIENTOS"
      : c === 7
      ? "SETECIENTOS"
      : c === 8
      ? "OCHOCIENTOS"
      : c === 9
      ? "NOVECIENTOS"
      : "";
  return rest ? `${base} ${decenas(rest)}` : base;
}

function miles(n: number) {
  if (n < 1000) return centenas(n);
  const m = Math.floor(n / 1000);
  const rest = n % 1000;
  const milesTxt = m === 1 ? "MIL" : `${centenas(m)} MIL`;
  return rest ? `${milesTxt} ${centenas(rest)}` : milesTxt;
}

function millones(n: number) {
  if (n < 1_000_000) return miles(n);
  const mm = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  const mmTxt = mm === 1 ? "UN MILLÓN" : `${miles(mm)} MILLONES`;
  return rest ? `${mmTxt} ${miles(rest)}` : mmTxt;
}

function numeroALetrasMXN(monto: number) {
  const abs = Math.abs(monto);
  const entero = onlyInt(abs);
  const cent = Math.round((abs - Math.floor(abs)) * 100);

  const letras = entero === 0 ? "CERO" : millones(entero);
  const centavos = pad2(cent);
  return `${letras} PESOS ${centavos}/100 M.N.`;
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    const { data, error: errP } = await supabaseAdmin
      .from("prestamos")
      .select(
        `
        id,
        numero_folio,
        monto,
        quincenas,
        interes_total_pct,
        pago_quincenal,
        total_a_pagar,
        fecha_inicio,
        fecha_termino,
        firma_dataurl,
        estatus,
        liga_token,
        formularios_clientes (
          id,
          nombre_completo,
          telefono,
          direccion,
          correo,
          ine_numero,
          banco,
          numero_tarjeta
        )
      `
      )
      .eq("liga_token", body.token)
      .single();

    const prestamo = data as PrestamoRow | null;

    if (errP || !prestamo) {
      return NextResponse.json({ error: "Token inválido" }, { status: 400 });
    }

    const rawC = prestamo.formularios_clientes;
    const c: ClienteRow | null =
      Array.isArray(rawC) ? rawC[0] ?? null : rawC ?? null;

    if (!c) {
      return NextResponse.json({ error: "Faltan datos del cliente" }, { status: 400 });
    }
    if (!prestamo.firma_dataurl) {
      return NextResponse.json({ error: "No hay firma registrada" }, { status: 400 });
    }
    if (prestamo.estatus !== "CONTRATO_FIRMADO") {
      return NextResponse.json({ error: "Contrato aún no está firmado" }, { status: 403 });
    }

    // ==== Datos cliente ====
    const nombre = String(c.nombre_completo ?? "").trim() || "__________________________";
    const telefono = String(c.telefono ?? "").trim() || "__________________________";
    const direccion = String(c.direccion ?? "").trim() || "__________________________";
    const correo = String(c.correo ?? "").trim() || "__________________________";
    const ine = String(c.ine_numero ?? "").trim() || "__________________________";
    const banco = String(c.banco ?? "").trim() || "__________________________";
    const tarjeta = String(c.numero_tarjeta ?? "").trim() || "__________________________";

    // ✅ Folio
    const folio = String(prestamo.numero_folio ?? "").trim() || "__________________________";

    // ✅ Interés % EXACTO (Excel) guardado en DB
    const interesExcel = Number(prestamo.interes_total_pct ?? 0);

    // Moratorio mensual fijo (ajústalo)
    const interesMoratorioMensual = 10;

    // ==== Datos pagaré ====
    const totalAPagar = Number(prestamo.total_a_pagar ?? 0);
    const totalEnLetra = numeroALetrasMXN(totalAPagar);

    const fechaSuscripcion = formatFechaSuscripcionHoyMX();

    const pdfDoc = await PDFDocument.create();
    const pageSize: [number, number] = [612, 792]; // Letter
    let page = pdfDoc.addPage(pageSize);

    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const marginX = 60;
    const topY = 740;
    let y = topY;

    const fontSize = 12;
    const lineGap = 6;

    const drawLineText = (text: string, size = fontSize, bold = false) => {
      page.drawText(text, { x: marginX, y, size, font: bold ? fontBold : font });
      y -= size + lineGap;
    };

    const quincenas = Number(prestamo.quincenas ?? 0);

    const contenido = [
      "CONTRATO DE PRÉSTAMO DE DINERO CON PAGARÉ",
      `FOLIO PRÉSTAMO: ${folio}`,
      "",
      `Que celebran por una parte el C. Eddy Gael Manzo Rodelo, persona física con actividad empresarial, con RFC MARE921112HD2, a quien en lo sucesivo se le denominará “EL PRESTAMISTA”, y por la otra parte ${nombre}, con domicilio en ${direccion}, número de teléfono ${telefono} y correo ${correo}, con identificación oficial INE número ${ine}, a quien en lo sucesivo se le denominará “EL DEUDOR”, al tenor de las siguientes:`,
      "",
      "CLÁUSULAS",
      "",
      "PRIMERA. – Objeto del contrato.",
      `EL PRESTAMISTA entrega en calidad de préstamo personal al DEUDOR la cantidad de ${moneyMXN(
        Number(prestamo.monto ?? 0)
      )}, misma que el DEUDOR recibe a su entera satisfacción.`,
      "",
      "SEGUNDA. – Plazo y forma de pago.",
      `El DEUDOR se obliga a pagar el préstamo en un plazo de ${quincenas} quincenas, iniciando el primer pago el día ${formatFechaMX(
        String(prestamo.fecha_inicio)
      )}, debiendo realizar pagos quincenales de ${moneyMXN(
        Number(prestamo.pago_quincenal ?? 0)
      )}, siendo el último pago el día ${formatFechaMX(
        String(prestamo.fecha_termino)
      )} por la cantidad de ${moneyMXN(Number(prestamo.pago_quincenal ?? 0))}.`,
      "",
      "TERCERA. – Intereses.",
      `El préstamo causará un interés ordinario del ${interesExcel.toFixed(
        6
      )}%, mismo que será cubierto junto con cada pago quincenal. En caso de incumplimiento en el pago oportuno, se causarán intereses moratorios del ${interesMoratorioMensual.toFixed(
        2
      )}% mensual sobre el saldo insoluto.`,
      "",
      `Interés total aplicado durante todo el plazo: ${interesExcel.toFixed(6)}%.`,
      "",
      "CUARTA. – Lugar y forma de pago.",
      "El DEUDOR se obliga a realizar los pagos única y exclusivamente mediante transferencia electrónica o depósito bancario a la cuenta que designe por escrito EL PRESTAMISTA, quedando prohibido cualquier otro medio de pago distinto a los aquí señalados.",
      "",
      "QUINTA. – Mora.",
      "En caso de incumplimiento de dos (2) pagos consecutivos, se tendrá por vencido anticipadamente el plazo, pudiendo EL PRESTAMISTA exigir el pago total del adeudo junto con los intereses generados.",
      "",
      "SEXTA. – Garantía.",
      "Para garantizar el cumplimiento de las obligaciones del presente contrato, el DEUDOR suscribe el pagaré que se adjunta como Anexo “A”.",
      "",
      "SÉPTIMA. – Jurisdicción.",
      "Las partes acuerdan someterse expresamente a las leyes y tribunales competentes de la ciudad de Tijuana, B.C., renunciando al fuero que pudiera corresponderles por razón de su domicilio presente o futuro.",
      "",
      "PAGARÉ",
      "(Conforme a los artículos 170 y siguientes de la Ley General de Títulos y Operaciones de Crédito)",
      "",
      `Lugar y fecha de suscripción: Tijuana, B.C., ${fechaSuscripcion}`,
      "",
      "Debo (emos) y pagaré (emos) incondicionalmente a la orden de:",
      "C. Eddy Gael Manzo Rodelo, RFC: MARE921112HD2 (EL PRESTAMISTA)",
      "",
      `La cantidad de: ${moneyMXN(totalAPagar)} (${totalEnLetra})`,
      "",
      "En: Tijuana, B.C.",
      "",
      `Fecha de vencimiento: ${formatFechaMX(String(prestamo.fecha_termino))}`,
      "",
      `Este pagaré causará intereses ordinarios a razón de ${interesExcel.toFixed(
        6
      )}% y, en caso de incumplimiento, intereses moratorios del ${interesMoratorioMensual.toFixed(
        2
      )}% mensual.`,
      "",
      "El suscriptor reconoce haber recibido la cantidad prestada a su entera satisfacción.",
      "",
      `Datos para depósito: Banco ${banco} — Tarjeta ${tarjeta}.`,
    ].join("\n");

    drawLineText("CONTRATO DE PRÉSTAMO DE DINERO CON PAGARÉ", 15, true);
    y -= 2;

    const reservedBottom = 210;
    const minY = reservedBottom;

    const lines = wrapText(contenido, 95);
    for (const line of lines) {
      if (y < minY) {
        page = pdfDoc.addPage(pageSize);
        y = topY;
      }
      if (!line) {
        y -= fontSize;
        continue;
      }
      drawLineText(line, 12, false);
    }

    if (y < 280) {
      page = pdfDoc.addPage(pageSize);
      y = topY;
    }

    const blockTopY = 240;
    const lineY = 170;

    const col1X = marginX;
    const col2X = marginX + 270;
    const lineW = 220;

    page.drawText("FIRMAS", { x: marginX, y: blockTopY, size: 12, font: fontBold });

    page.drawLine({ start: { x: col1X, y: lineY }, end: { x: col1X + lineW, y: lineY } });
    page.drawLine({ start: { x: col2X, y: lineY }, end: { x: col2X + lineW, y: lineY } });

    page.drawText("EL DEUDOR", { x: col1X + 78, y: lineY - 18, size: 11, font });
    page.drawText("EL PRESTAMISTA", { x: col2X + 62, y: lineY - 18, size: 11, font });

    const firmaBytes = dataUrlToUint8Array(String(prestamo.firma_dataurl));
    const firmaImg = await pdfDoc.embedPng(firmaBytes);

    const firmaW = 210;
    const firmaH = 70;
    const firmaX = col1X + (lineW - firmaW) / 2;
    const firmaY = lineY + 6;

    page.drawImage(firmaImg, { x: firmaX, y: firmaY, width: firmaW, height: firmaH });

    page.drawText(String(nombre).toUpperCase(), { x: col1X, y: lineY - 42, size: 10, font });
    page.drawText("C. EDDY GAEL MANZO RODELO", { x: col2X, y: lineY - 42, size: 10, font });

    const pdfBytes = await pdfDoc.save();
    const filename = `contrato_prestamo_${prestamo.id}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
