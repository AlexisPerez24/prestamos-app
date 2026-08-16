/**
 * Formato SOLO para presentación.
 * No modifica ni redondea nada que se guarde en base de datos.
 */

export function money(n: number) {
  return Number(n ?? 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

/** Porcentaje legible en pantalla (el valor guardado conserva sus 6 decimales). */
export function pct(n: number, decimals = 2) {
  return `${Number(n ?? 0).toLocaleString("es-MX", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

/** "YYYY-MM-DD" -> "15 de marzo de 2026" (sin corrimiento por zona horaria). */
export function formatFechaMX(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
}

/** "YYYY-MM-DD" -> "15 mar 2026". Para tablas y listas compactas. */
export function formatFechaCorta(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

/** Etiqueta legible para los estatus guardados en mayúsculas con guion bajo. */
export function estatusLabel(estatus: string) {
  const map: Record<string, string> = {
    EN_PROCESO_CONTRATO: "En proceso",
    CONTRATO_FIRMADO: "Firmado",
    ACTIVO: "Activo",
    TERMINADO: "Terminado",
    CANCELADO: "Cancelado",
  };
  return map[estatus] ?? estatus.replace(/_/g, " ").toLowerCase();
}
