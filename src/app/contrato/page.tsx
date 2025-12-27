import { Suspense } from "react";
import ContratoClient from "./ContratoClient";

export const dynamic = "force-dynamic";

export default function ContratoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6">
            <p>Cargando contrato...</p>
          </div>
        </div>
      }
    >
      <ContratoClient />
    </Suspense>
  );
}
