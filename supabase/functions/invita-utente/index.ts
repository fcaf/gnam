// =====================================================================
//  GNAM · funzione "invita-utente"
//  L'amministratore invita un familiare: Supabase gli manda un'email
//  con il link per entrare. Le iscrizioni libere restano chiuse.
//
//  Segreto facoltativo: GNAM_URL = indirizzo dell'app
//  (es. https://fcaf.github.io/gnam/), usato come destinazione del link.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const risposta = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return risposta({ errore: "Accesso richiesto" }, 401);

  const { data: profilo } = await admin.from("profili").select("is_admin").eq("id", auth.user.id).single();
  if (!profilo?.is_admin) return risposta({ errore: "Solo l'amministratore può invitare nuovi familiari." }, 403);

  const { email, nome, redirect } = await req.json().catch(() => ({}));
  const pulita = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pulita)) return risposta({ errore: "Indirizzo email non valido." }, 400);

  const { error } = await admin.auth.admin.inviteUserByEmail(pulita, {
    data: { nome: String(nome ?? "").trim() },
    redirectTo: Deno.env.get("GNAM_URL") || redirect || undefined,
  });
  if (error) {
    const giaPresente = /already|registered|exists/i.test(error.message);
    return risposta({ errore: giaPresente ? "Questa persona ha già un accesso: può entrare dalla pagina di login." : error.message }, 400);
  }
  return risposta({ ok: true });
});
