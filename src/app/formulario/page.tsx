"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "../lib/supabaseClient";

/* =========================
   Utilidades de normalización
   ========================= */
const normalizeSpaces = (v: string) => (v ?? "").replace(/\s+/g, " ").trim();
const normalizeUpper = (v: string) => normalizeSpaces(v).toUpperCase();
const ONLY_LETTERS_SPACES = /^[A-ZÁÉÍÓÚÜÑ ]+$/;

/* =========================
   Schema Zod (Zod v4 OK)
   ========================= */
const schema = z.object({
  apellido_paterno: z
    .string()
    .min(2, "Escribe el apellido paterno")
    .refine((v) => ONLY_LETTERS_SPACES.test(v.toUpperCase()), "Solo letras y espacios")
    .transform(normalizeUpper),

  apellido_materno: z
    .string()
    .min(2, "Escribe el apellido materno")
    .refine((v) => ONLY_LETTERS_SPACES.test(v.toUpperCase()), "Solo letras y espacios")
    .transform(normalizeUpper),

  nombres: z
    .string()
    .min(2, "Escribe el/los nombres")
    .refine((v) => ONLY_LETTERS_SPACES.test(v.toUpperCase()), "Solo letras y espacios")
    .transform(normalizeUpper),

  direccion: z
    .string()
    .min(5, "Escribe la dirección")
    .transform(normalizeSpaces),

  telefono: z
    .string()
    .min(10, "Escribe un teléfono válido (10 dígitos)")
    .max(15, "Teléfono demasiado largo")
    .regex(/^[0-9+ ]+$/, "Solo números, espacios o +")
    .transform(normalizeSpaces),

  // ✅ correo opcional: permite "" o email válido
  correo: z
    .union([z.literal(""), z.string().email("Correo inválido")])
    .transform(normalizeSpaces),
});

type FormData = z.infer<typeof schema>;

export default function FormularioClientePage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { correo: "" },
  });

  const onSubmit = async (data: FormData) => {
    const nombre_completo = `${data.apellido_paterno} ${data.apellido_materno} ${data.nombres}`
      .replace(/\s+/g, " ")
      .trim();

    const { error } = await supabase.from("formularios_clientes").insert([
      {
        apellido_paterno: data.apellido_paterno,
        apellido_materno: data.apellido_materno,
        nombres: data.nombres,
        nombre_completo,
        direccion: data.direccion,
        telefono: data.telefono,
        correo: data.correo === "" ? null : data.correo,
        firma_url: null,
        ine_url: null,
        selfie_url: null,
      },
    ]);

    if (error) {
      console.error(error);
      alert("Error guardando datos");
      return;
    }

    alert("Cliente guardado correctamente ✅");
    reset();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto mt-8 p-6 bg-white rounded-xl shadow">
        <h1 className="text-2xl font-bold mb-4">INGRESAR DATOS</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label>Apellido paterno</label>
              <input {...register("apellido_paterno")} className="w-full border p-2 rounded uppercase" />
              {errors.apellido_paterno && (
                <p className="text-red-600 text-sm">{errors.apellido_paterno.message}</p>
              )}
            </div>

            <div>
              <label>Apellido materno</label>
              <input {...register("apellido_materno")} className="w-full border p-2 rounded uppercase" />
              {errors.apellido_materno && (
                <p className="text-red-600 text-sm">{errors.apellido_materno.message}</p>
              )}
            </div>

            <div>
              <label>Nombre(s)</label>
              <input {...register("nombres")} className="w-full border p-2 rounded uppercase" />
              {errors.nombres && <p className="text-red-600 text-sm">{errors.nombres.message}</p>}
            </div>
          </div>

          <div>
            <label>Dirección</label>
            <input {...register("direccion")} className="w-full border p-2 rounded" />
            {errors.direccion && <p className="text-red-600 text-sm">{errors.direccion.message}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label>Teléfono</label>
              <input {...register("telefono")} className="w-full border p-2 rounded" />
              {errors.telefono && <p className="text-red-600 text-sm">{errors.telefono.message}</p>}
            </div>

            <div>
              <label>Correo (opcional)</label>
              <input {...register("correo")} className="w-full border p-2 rounded" />
              {errors.correo && <p className="text-red-600 text-sm">{errors.correo.message}</p>}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded"
          >
            {isSubmitting ? "Guardando..." : "Guardar datos"}
          </button>
        </form>
      </div>
    </div>
  );
}
