import { Resend } from "resend";

export const runtime = "nodejs";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL; // ej: "EGMR <no-reply@egmrgroup.com>"

if (!RESEND_API_KEY) {
  console.warn("Falta RESEND_API_KEY en env");
}
if (!FROM_EMAIL) {
  console.warn("Falta FROM_EMAIL en env");
}

export const resend = new Resend(RESEND_API_KEY);

export function getFromEmail() {
  // fallback por si no pones FROM_EMAIL (aunque deberías)
  return FROM_EMAIL || "EGMR <onboarding@resend.dev>";
}
