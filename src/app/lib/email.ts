import { Resend } from "resend";

function mustGetEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en env`);
  return v;
}

export async function enviarContratoEmails(params: {
  clienteEmail?: string | null;
  clienteNombre: string;
  prestamoFolio: string; // ✅ NUEVO
  pdfBase64: string; // PDF en base64
  filename: string;
}) {
  const RESEND_API_KEY = mustGetEnv("RESEND_API_KEY");
  const FROM_EMAIL = mustGetEnv("FROM_EMAIL");
  const GAEL_EMAIL = mustGetEnv("GAEL_EMAIL");

  const resend = new Resend(RESEND_API_KEY);

  const attachments = [
    {
      filename: params.filename,
      content: params.pdfBase64, // base64 ✅
    },
  ];

  // 1) Correo a GAEL
  await resend.emails.send({
    from: FROM_EMAIL,
    to: [GAEL_EMAIL],
    subject: `Contrato firmado - ${params.clienteNombre} (${params.prestamoFolio})`,
    html: `
      <p>Se firmó un contrato.</p>
      <p><b>Cliente:</b> ${params.clienteNombre}</p>
      <p><b>${params.prestamoFolio}</b></p>
      <p>Se adjunta el PDF como evidencia.</p>
    `,
    attachments,
  });

  // 2) Correo al cliente (si puso correo)
  if (params.clienteEmail) {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [params.clienteEmail],
      subject: `Tu contrato de préstamo — CONFIANZA`,
      html: `
        <p>Hola <b>${params.clienteNombre}</b>, <b>${params.prestamoFolio}</b></p>

        <p>Gracias por elegir <b>CONFIANZA</b>.</p>

        <p>Adjuntamos tu contrato de préstamo en PDF para tu consulta y respaldo.</p>

        <p>Saludos,<br/>
        <b>CONFIANZA</b> by EGMR Group</p>
      `,
      attachments,
    });
  }
}
