import { Suspense } from "react";
import ClienteClient from "./ClienteClient";

export const dynamic = "force-dynamic";

export default function ClientePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-2xl mx-auto bg-white rounded-xl shadow p-6">
            <p>Cargando...</p>
          </div>
        </div>
      }
    >
      <ClienteClient />
    </Suspense>
  );
}
