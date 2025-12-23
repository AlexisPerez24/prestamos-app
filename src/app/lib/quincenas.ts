// src/lib/quincenas.ts

function nextQuincena(after: Date): Date {
  const y = after.getFullYear();
  const m = after.getMonth();
  const d = after.getDate();

  const d13 = new Date(y, m, 13);
  const d28 = new Date(y, m, 28);

  if (d > 28 || (d === 28 && after.getHours() >= 0)) {
    return new Date(y, m + 1, 13);
  }
  if (d > 13 || (d === 13 && after.getHours() >= 0)) {
    return d28;
  }
  return d13;
}

export function buildQuincenas(start: Date, count: number): Date[] {
  const fechas: Date[] = [];
  let current = nextQuincena(start);
  for (let i = 0; i < count; i++) {
    fechas.push(current);
    const dayAfter = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
    current = nextQuincena(dayAfter);
  }
  return fechas;
}

export function calcularCuota(monto: number, quincenas: number, tasaQuincenal = 0): number {
  const total = tasaQuincenal > 0 ? monto * (1 + tasaQuincenal * quincenas) : monto;
  return Math.round((total / quincenas) * 100) / 100;
}
