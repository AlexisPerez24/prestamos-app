export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="bg-white rounded-xl shadow p-8 w-full max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Prestamos App</h1>

        <p className="text-gray-600">
          Panel para generar préstamos y ligas de contrato.
        </p>

        <a
          href="/prestamo"
          className="inline-flex w-full justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Generar nuevo préstamo
        </a>
      </div>
    </div>
  );
}
