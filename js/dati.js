// GNAM · accesso ai dati
// Due "motori" con la stessa interfaccia:
//  - Supabase (uso reale, dati condivisi in famiglia)
//  - Dimostrativo (nessuna configurazione, dati solo in questo browser)

import { RICETTE_INIZIALI } from "./ricette-iniziali.js";
import { analizzaTestoSemplice } from "./util.js";

const CAMPI_RICETTA = [
  "titolo", "descrizione", "categoria", "tag", "porzioni", "tempo_prep", "tempo_cottura", "tempo_riposo",
  "difficolta", "costo", "ingredienti", "passi", "note", "fonte_tipo", "fonte_url", "fonte_autore",
  "lingua_originale", "testo_originale", "foto_path", "foto_originali", "privata",
];
const soloCampi = (r) => Object.fromEntries(CAMPI_RICETTA.filter((k) => k in r).map((k) => [k, r[k]]));

// ---------------------------------------------------------------------
export function creaArchivio(config) {
  const conSupabase = config?.supabaseUrl && config?.supabaseAnonKey && window.supabase?.createClient;
  return conSupabase ? archivioSupabase(config) : archivioDemo();
}

// =====================================================================
//  SUPABASE
// =====================================================================
function archivioSupabase(config) {
  const sb = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
  });
  const cacheUrl = new Map(); // path → {url, scade}
  let io = null;

  const errore = (e) => { if (e) throw new Error(e.message || String(e)); };

  async function caricaProfilo(user) {
    if (!user) { io = null; return null; }
    const { data } = await sb.from("profili").select("*").eq("id", user.id).maybeSingle();
    io = data ?? { id: user.id, email: user.email, nome: user.email?.split("@")[0], is_admin: false };
    return io;
  }

  return {
    demo: false,
    get io() { return io; },

    async sessione() {
      const { data } = await sb.auth.getSession();
      return caricaProfilo(data.session?.user ?? null);
    },
    suCambioAccesso(cb) {
      sb.auth.onAuthStateChange(async (_e, s) => cb(await caricaProfilo(s?.user ?? null)));
    },
    async inviaLink(email) {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
      });
      if (error && /signups? not allowed|not found|otp_disabled/i.test(error.message)) {
        throw new Error("Questa email non è abilitata. Chiedi a Fabio di invitarti.");
      }
      errore(error);
    },
    async verificaCodice(email, codice) {
      const { data, error } = await sb.auth.verifyOtp({ email, token: codice, type: "email" });
      if (error) throw new Error("Codice non valido o scaduto. Richiedine uno nuovo.");
      return caricaProfilo(data.user);
    },
    async esci() { await sb.auth.signOut(); io = null; },

    // ---- ricette
    async elencoRicette() {
      const { data, error } = await sb.from("ricette")
        .select("id,autore_id,titolo,descrizione,categoria,tag,porzioni,tempo_prep,tempo_cottura,difficolta,costo,foto_path,privata,fonte_tipo,ingredienti,creata_il,aggiornata_il")
        .order("creata_il", { ascending: false });
      errore(error); return data;
    },
    async ricetta(id) {
      const { data, error } = await sb.from("ricette").select("*").eq("id", id).maybeSingle();
      errore(error); return data;
    },
    async salvaRicetta(r) {
      const campi = soloCampi(r);
      const q = r.id ? sb.from("ricette").update(campi).eq("id", r.id) : sb.from("ricette").insert(campi);
      const { data, error } = await q.select().single();
      errore(error); return data;
    },
    async eliminaRicetta(r) {
      const { error } = await sb.from("ricette").delete().eq("id", r.id);
      errore(error);
      const foto = [r.foto_path, ...(r.foto_originali ?? [])].filter(Boolean);
      if (foto.length) await sb.storage.from("ricette").remove(foto);
    },

    // ---- foto
    async caricaFoto(blob, cartella = "piatti") {
      const path = `${io.id}/${cartella}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("ricette").upload(path, blob, { contentType: blob.type || "image/jpeg" });
      errore(error); return path;
    },
    async urlFoto(paths) {
      const ora = Date.now();
      const mancanti = [...new Set(paths.filter((p) => p && !(cacheUrl.get(p)?.scade > ora)))];
      if (mancanti.length) {
        const { data } = await sb.storage.from("ricette").createSignedUrls(mancanti, 3600 * 6);
        for (const d of data ?? []) if (d.signedUrl) cacheUrl.set(d.path, { url: d.signedUrl, scade: ora + 3600 * 5 * 1000 });
      }
      return Object.fromEntries(paths.filter(Boolean).map((p) => [p, cacheUrl.get(p)?.url ?? ""]));
    },
    async eliminaFoto(path) { if (path) await sb.storage.from("ricette").remove([path]); },

    // ---- preferite e voti
    async preferenze() {
      const { data, error } = await sb.from("ricette_utente").select("*");
      errore(error);
      const mie = {}, medie = {};
      for (const r of data ?? []) {
        if (r.utente_id === io?.id) mie[r.ricetta_id] = r;
        if (r.voto) (medie[r.ricetta_id] ??= []).push(r.voto);
      }
      for (const k in medie) medie[k] = { media: medie[k].reduce((a, b) => a + b, 0) / medie[k].length, n: medie[k].length };
      return { mie, medie };
    },
    async impostaPreferenza(ricetta_id, patch) {
      const { error } = await sb.from("ricette_utente").upsert({ utente_id: io.id, ricetta_id, ...patch });
      errore(error);
    },

    // ---- lista della spesa
    async spesa() {
      const { data, error } = await sb.from("lista_spesa").select("*").order("creato_il");
      errore(error); return data;
    },
    async aggiungiSpesa(voci) {
      const { error } = await sb.from("lista_spesa").insert(voci); errore(error);
    },
    async aggiornaSpesa(id, patch) {
      const { error } = await sb.from("lista_spesa").update(patch).eq("id", id); errore(error);
    },
    async eliminaSpesa(ids) {
      const { error } = await sb.from("lista_spesa").delete().in("id", ids); errore(error);
    },

    // ---- famiglia
    async familiari() {
      const { data, error } = await sb.from("profili").select("*").order("creato_il"); errore(error); return data;
    },
    async cambiaNome(nome) {
      const { error } = await sb.from("profili").update({ nome }).eq("id", io.id); errore(error); io.nome = nome;
    },
    async impostaAdmin(id, valore) {
      const { error } = await sb.rpc("imposta_admin", { utente: id, valore }); errore(error);
    },
    async invita(email, nome) {
      const { data, error } = await sb.functions.invoke("invita-utente", { body: { email, nome, redirect: location.origin + location.pathname } });
      if (error) {
        const dettaglio = await error.context?.json?.().catch(() => null);
        throw new Error(dettaglio?.errore ?? error.message);
      }
      if (data?.errore) throw new Error(data.errore);
    },

    // ---- intelligenza artificiale
    async ia(richiesta, segnale) {
      const chiamata = sb.functions.invoke("gnam-ai", { body: richiesta, signal: segnale });
      const stop = new Promise((_, no) => segnale?.addEventListener("abort", () => no(new Error(segnale.reason?.message ?? "Lettura annullata.")), { once: true }));
      const { data, error } = await Promise.race([chiamata, stop]);
      if (error) {
        const dettaglio = await error.context?.json?.().catch(() => null);
        throw new Error(dettaglio?.errore ?? "Il servizio di lettura non risponde. Controlla che la funzione gnam-ai sia pubblicata.");
      }
      if (data?.errore) throw new Error(data.errore);
      return data;
    },
  };
}

// =====================================================================
//  DIMOSTRATIVO (localStorage, nessun server)
// =====================================================================
function archivioDemo() {
  const CHIAVE = "gnam-demo-v1";
  const blobUrl = new Map();
  const IO = { id: "demo-fabio", nome: "Fabio", email: "demo@gnam.local", is_admin: true };
  const ALTRI = [
    { id: "demo-2", nome: "Familiare 2", email: "familiare2@esempio.it", is_admin: false },
    { id: "demo-3", nome: "Familiare 3", email: "familiare3@esempio.it", is_admin: false },
  ];

  function iniziale() {
    const t0 = Date.now();
    return {
      entrato: false,
      ricette: RICETTE_INIZIALI.map((r, i) => ({
        ...structuredClone(r), id: "demo-r" + (i + 1), autore_id: IO.id, privata: false,
        foto_path: null, foto_originali: [], lingua_originale: "it", testo_originale: "",
        creata_il: new Date(t0 - (RICETTE_INIZIALI.length - i) * 86400000).toISOString(),
        aggiornata_il: new Date(t0 - (RICETTE_INIZIALI.length - i) * 86400000).toISOString(),
      })),
      pref: { "demo-r2": { preferita: true, voto: 5 } },
      spesa: [],
    };
  }
  let stato;
  try { stato = JSON.parse(localStorage.getItem(CHIAVE)) || iniziale(); } catch { stato = iniziale(); }
  const salva = () => { try { localStorage.setItem(CHIAVE, JSON.stringify(stato)); } catch { /* memoria piena o non disponibile */ } };
  const attesa = (ms = 120) => new Promise((r) => setTimeout(r, ms));
  let cb = () => {};

  return {
    demo: true,
    get io() { return stato.entrato ? IO : null; },
    async sessione() { return stato.entrato ? IO : null; },
    suCambioAccesso(f) { cb = f; },
    async inviaLink() { await attesa(400); },
    async verificaCodice() { stato.entrato = true; salva(); cb(IO); return IO; },
    async entraDemo() { stato.entrato = true; salva(); cb(IO); return IO; },
    async esci() { stato.entrato = false; salva(); cb(null); },

    async elencoRicette() { await attesa(); return [...stato.ricette].sort((a, b) => b.creata_il.localeCompare(a.creata_il)); },
    async ricetta(id) { await attesa(60); return structuredClone(stato.ricette.find((r) => r.id === id) ?? null); },
    async salvaRicetta(r) {
      await attesa(200);
      const ora = new Date().toISOString();
      if (r.id) {
        const i = stato.ricette.findIndex((x) => x.id === r.id);
        stato.ricette[i] = { ...stato.ricette[i], ...soloCampi(r), aggiornata_il: ora };
        salva(); return stato.ricette[i];
      }
      const nuova = { foto_originali: [], tag: [], ...soloCampi(r), id: "demo-" + crypto.randomUUID(), autore_id: IO.id, creata_il: ora, aggiornata_il: ora };
      stato.ricette.push(nuova); salva(); return nuova;
    },
    async eliminaRicetta(r) { stato.ricette = stato.ricette.filter((x) => x.id !== r.id); salva(); },

    async caricaFoto(blob) { const p = "demo:" + crypto.randomUUID(); blobUrl.set(p, URL.createObjectURL(blob)); return p; },
    async urlFoto(paths) { return Object.fromEntries(paths.filter(Boolean).map((p) => [p, blobUrl.get(p) ?? ""])); },
    async eliminaFoto(p) { blobUrl.delete(p); },

    async preferenze() {
      const medie = {};
      for (const [k, v] of Object.entries(stato.pref)) if (v.voto) medie[k] = { media: v.voto, n: 1 };
      return { mie: structuredClone(stato.pref), medie };
    },
    async impostaPreferenza(id, patch) { stato.pref[id] = { ...(stato.pref[id] ?? {}), ...patch }; salva(); },

    async spesa() { return structuredClone(stato.spesa); },
    async aggiungiSpesa(voci) {
      for (const v of voci) stato.spesa.push({ fatto: false, ...v, id: crypto.randomUUID(), creato_il: new Date().toISOString() });
      salva();
    },
    async aggiornaSpesa(id, patch) { Object.assign(stato.spesa.find((v) => v.id === id) ?? {}, patch); salva(); },
    async eliminaSpesa(ids) { stato.spesa = stato.spesa.filter((v) => !ids.includes(v.id)); salva(); },

    async familiari() { return [IO, ...ALTRI]; },
    async cambiaNome(nome) { IO.nome = nome; },
    async impostaAdmin() { throw new Error("Nella demo i ruoli non si possono cambiare."); },
    async invita() { await attesa(300); throw new Error("Nella demo gli inviti non partono: collega Supabase per invitare la famiglia."); },

    async ia(req) {
      await attesa(700);
      if (req.modo === "testo") {
        const b = analizzaTestoSemplice(req.testo);
        return {
          bozza: { ...b, descrizione: "", tag: [], fonte_tipo: "testo", testo_originale: req.testo, lingua_originale: "it" },
          completezza: "parziale",
          avvisi: ["Nella demo il testo è diviso con regole semplici, senza IA. Con Gemini collegato la scheda viene compilata, tradotta e ordinata automaticamente."],
        };
      }
      throw new Error("Nella demo la lettura di link, video e foto non è attiva: serve la funzione gnam-ai su Supabase con la chiave Gemini. Prova \"Da testo\" oppure \"Scrivo io\".");
    },
  };
}
