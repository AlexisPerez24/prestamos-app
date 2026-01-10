import { Resend } from "resend";

function mustGetEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en env`);
  return v;
}

export async function enviarContratoEmails(params: {
  clienteEmail?: string | null;
  clienteNombre: string;
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
      content: params.pdfBase64, // base64 string ✅
    },
  ];

  // 1) Correo a GAEL
  await resend.emails.send({
    from: FROM_EMAIL,
    to: [GAEL_EMAIL],
    subject: `Contrato firmado - ${params.clienteNombre}`,
    html: `
      <p>Se firmó un contrato.</p>
      <p><b>Cliente:</b> ${params.clienteNombre}</p>
      <p>Se adjunta el PDF como evidencia.</p>
    `,
    attachments,
  });

  // 2) Correo al cliente (si puso correo)
  if (params.clienteEmail) {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [params.clienteEmail],
      subject: `Gracias por confiar en EGMR Group — Tu contrato`,
      html: `
        <p>Hola <b>${params.clienteNombre}</b>,</p>
        <p>Gracias por confiar en <b>EGMR Group</b>.</p>
        <p>Adjuntamos tu contrato en PDF para tu respaldo.</p>
        <p>— EGMR Group</p>
      `,
      attachments,
    });
  }
}
