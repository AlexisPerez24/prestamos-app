// import { createClient } from "@supabase/supabase-js";

// const supabaseUrl = process.env.SUPABASE_URL!;
// const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// // ⚠️ ESTE CLIENTE SOLO DEBE USARSE EN SERVER (API routes)
// // Nunca lo importes en componentes "use client"
// export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
//   auth: { persistSession: false },
// });



// src/app/lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

// ✅ En tu .env.local tú tienes NEXT_PUBLIC_SUPABASE_URL (no SUPABASE_URL)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 🔥 Si falta algo, truenas aquí y ya sabes qué variable es
if (!supabaseUrl) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
if (!serviceRoleKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

// ⚠️ ESTE CLIENTE SOLO SE USA EN SERVER (API routes)
// Nunca lo importes en componentes con "use client"
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
