import { NextResponse } from "next/server";
import { z } from "zod";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

const BodySchema = z.object({
  token: z.string().min(10),
});

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
  return date.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "2-digit" });
}

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

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    const { data: prestamo, error: errP } = await supabaseAdmin
      .from("prestamos")
      .select(
        `
        id,
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

    if (errP || !prestamo) return NextResponse.json({ error: "Token inválido" }, { status: 400 });
    if (!prestamo.formularios_clientes) return NextResponse.json({ error: "Faltan datos del cliente" }, { status: 400 });
    if (!prestamo.firma_dataurl) return NextResponse.json({ error: "No hay firma registrada" }, { status: 400 });
    if (prestamo.estatus !== "CONTRATO_FIRMADO") {
      return NextResponse.json({ error: "Contrato aún no está firmado" }, { status: 403 });
    }

    const c = prestamo.formularios_clientes;

    // ✅ datos nuevos
    const ine = String(c.ine_numero ?? "").trim() || "__________________________";
    const banco = String(c.banco ?? "").trim() || "__________________________";
    const tarjeta = String(c.numero_tarjeta ?? "").trim() || "__________________________";

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

    // ====== CONTRATO (formato como el que pegaste) ======
    const contenido = [
      "CONTRATO DE PRÉSTAMO DE DINERO CON PAGARÉ",
      "",
      `Que celebran por una parte el C. Eddy Gael Manzo Rodelo, persona física con actividad empresarial, con RFC MARE921112HD2, a quien en lo sucesivo se le denominará “EL PRESTAMISTA”, y por la otra parte ${String(
        c.nombre_completo ?? "__________________________"
      )}, con domicilio en ${String(c.direccion ?? "__________________________")}, número de teléfono ${String(
        c.telefono ?? "__________________________"
      )} y con identificación oficial INE número ${ine}, a quien en lo sucesivo se le denominará “EL DEUDOR”, al tenor de las siguientes:`,
      "",
      "CLÁUSULAS",
      "",
      "PRIMERA. – Objeto del contrato.",
      `EL PRESTAMISTA entrega en calidad de préstamo personal al DEUDOR la cantidad de ${moneyMXN(
        Number(prestamo.monto)
      )}, misma que el DEUDOR recibe a su entera satisfacción.`,
      "",
      "SEGUNDA. – Plazo y forma de pago.",
      `El DEUDOR se obliga a pagar el préstamo en un plazo de ${Number(
        prestamo.quincenas
      )} quincenas, iniciando el primer pago el día ${formatFechaMX(
        String(prestamo.fecha_inicio)
      )}, debiendo realizar pagos quincenales de ${moneyMXN(
        Number(prestamo.pago_quincenal)
      )}, siendo el último pago el día ${formatFechaMX(String(prestamo.fecha_termino))} por la cantidad de ${moneyMXN(
        Number(prestamo.pago_quincenal)
      )}.`,
      "",
      "TERCERA. – Intereses.",
      "El préstamo causará un interés ordinario del ______% anual, mismo que será cubierto junto con cada pago quincenal. En caso de incumplimiento en el pago oportuno, se causarán intereses moratorios del ______% mensual sobre el saldo insoluto.",
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
      "Lugar y fecha de suscripción: Tijuana, B.C., ____ de __________ de 20___",
      "",
      "Debo (emos) y pagaré (emos) incondicionalmente a la orden de:",
      "C. Eddy Gael Manzo Rodelo, RFC: MARE921112HD2 (EL PRESTAMISTA)",
      "",
      `La cantidad de: ${moneyMXN(Number(prestamo.total_a_pagar))} (________________ pesos 00/100 M.N.)`,
      "",
      "En: Tijuana, B.C.",
      "",
      `Fecha de vencimiento: ${formatFechaMX(String(prestamo.fecha_termino))}`,
      "",
      "Este pagaré causará intereses ordinarios a razón de ______% anual y, en caso de incumplimiento, intereses moratorios del ______% mensual.",
      "",
      "El suscriptor reconoce haber recibido la cantidad prestada a su entera satisfacción.",
      "",
      // ✅ dato adicional (si lo quieres, aquí queda)
      `Datos para depósito: Banco ${banco} — Tarjeta ${tarjeta}.`,
    ].join("\n");

    // Header
    drawLineText("CONTRATO DE PRÉSTAMO DE DINERO CON PAGARÉ", 15, true);
    y -= 2;

    // Body + reserva zona firmas
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

    // Bloque firmas fijo
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

    // Firma EXACTAMENTE encima del renglón
    const firmaBytes = dataUrlToUint8Array(String(prestamo.firma_dataurl));
    const firmaImg = await pdfDoc.embedPng(firmaBytes);

    const firmaW = 210;
    const firmaH = 70;
    const firmaX = col1X + (lineW - firmaW) / 2;
    const firmaY = lineY + 6;

    page.drawImage(firmaImg, { x: firmaX, y: firmaY, width: firmaW, height: firmaH });

    page.drawText(String(c.nombre_completo ?? "").toUpperCase(), {
      x: col1X,
      y: lineY - 42,
      size: 10,
      font,
    });

    page.drawText("C. EDDY GAEL MANZO RODELO", {
      x: col2X,
      y: lineY - 42,
      size: 10,
      font,
    });

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
