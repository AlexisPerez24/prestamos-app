import { Suspense } from "react";
import ContratoClient from "./ContratoClient";
import { LoadingScreen } from "../components/ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contrato",
};

export default function ContratoPage() {
  return (
    <Suspense fallback={<LoadingScreen label="Cargando contrato…" />}>
      <ContratoClient />
    </Suspense>
  );
}
