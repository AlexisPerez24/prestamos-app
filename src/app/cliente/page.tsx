import { Suspense } from "react";
import ClienteClient from "./ClienteClient";
import { LoadingScreen } from "../components/ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Firma tu contrato",
};

export default function ClientePage() {
  return (
    <Suspense fallback={<LoadingScreen label="Cargando tu contrato…" />}>
      <ClienteClient />
    </Suspense>
  );
}
