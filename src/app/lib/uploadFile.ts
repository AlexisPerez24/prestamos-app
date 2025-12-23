// import { supabase } from "./supabaseClient";

// export async function uploadFile(file: File, path: string): Promise<string | null> {
//   const { error } = await supabase.storage
//     .from("uploads")
//     .upload(path, file, {
//       cacheControl: "3600",
//       upsert: false,
//     });
// // export async function uploadFile(file: File, path: string): Promise<string | null> {
// //   const { error: uploadError } = await supabase.storage
// //     .from("uploads")
// //     .upload(path, file, {
// //       cacheControl: "3600",
// //       upsert: true,
// //     });

//   if (uploadError) {
//     console.error("❌ Error al subir archivo:", uploadError.message);
//     return null;
//   }

//   const { data, error: urlError } = await supabase.storage
//     .from("uploads")
//     .createSignedUrl(path, 60 * 60 * 24 * 7);

//   if (urlError) {
//     console.error("❌ Error al generar URL:", urlError.message);
//     return null;
//   }

//   console.log("✅ Archivo subido exitosamente. URL:", data?.signedUrl);
//   return data?.signedUrl || null;
// }
import { supabase } from "./supabaseClient";

export async function uploadFile(file: File, filename: string): Promise<string | null> {
  // Subida del archivo al bucket 'uploads' directamente en la raíz (no en 'uploads/uploads')
  const { error: uploadError } = await supabase.storage
    .from("uploads")
    .upload(filename, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("❌ Error al subir archivo:", uploadError.message);
    return null;
  }

  // Crear URL firmada válida por 7 días
  const { data, error: urlError } = await supabase.storage
    .from("uploads")
    .createSignedUrl(filename, 60 * 60 * 24 * 7); // 7 días

  if (urlError) {
    console.error("❌ Error al generar URL:", urlError.message);
    return null;
  }

  console.log("✅ Archivo subido exitosamente. URL:", data?.signedUrl);
  return data?.signedUrl || null;
}

