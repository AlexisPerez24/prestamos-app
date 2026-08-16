"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../components/Toaster";
import { Button, Field, GlassCard, PageHeader, PageShell, TextInput } from "../components/ui";

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
  const toast = useToast();

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
      toast.error("Error guardando datos", error.message);
      return;
    }

    toast.success("Cliente guardado correctamente");
    reset();
  };

  return (
    <PageShell>
      <GlassCard>
        <PageHeader title="Ingresar datos" subtitle="Alta manual de un cliente." />

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Apellido paterno" error={errors.apellido_paterno?.message}>
              {(p) => (
                <TextInput
                  {...p}
                  {...register("apellido_paterno")}
                  className="uppercase"
                  autoComplete="family-name"
                  autoCapitalize="characters"
                />
              )}
            </Field>

            <Field label="Apellido materno" error={errors.apellido_materno?.message}>
              {(p) => (
                <TextInput
                  {...p}
                  {...register("apellido_materno")}
                  className="uppercase"
                  autoCapitalize="characters"
                />
              )}
            </Field>

            <Field label="Nombre(s)" error={errors.nombres?.message}>
              {(p) => (
                <TextInput
                  {...p}
                  {...register("nombres")}
                  className="uppercase"
                  autoComplete="given-name"
                  autoCapitalize="characters"
                />
              )}
            </Field>
          </div>

          <Field label="Dirección" error={errors.direccion?.message}>
            {(p) => <TextInput {...p} {...register("direccion")} autoComplete="street-address" />}
          </Field>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Teléfono" error={errors.telefono?.message}>
              {(p) => (
                <TextInput
                  {...p}
                  {...register("telefono")}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                />
              )}
            </Field>

            <Field
              label="Correo"
              error={errors.correo?.message}
              hint={!errors.correo ? "Opcional." : undefined}
            >
              {(p) => (
                <TextInput
                  {...p}
                  {...register("correo")}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              )}
            </Field>
          </div>

          <Button type="submit" fullWidth loading={isSubmitting}>
            {isSubmitting ? "Guardando…" : "Guardar datos"}
          </Button>
        </form>
      </GlassCard>
    </PageShell>
  );
}
