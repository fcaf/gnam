// =====================================================================
//  GNAM · funzione "gnam-ai"
//  Trasforma link, video, foto e testi in una scheda ricetta con Google Gemini.
//  La chiave Gemini resta qui, sul server: il browser non la vede mai.
//
//  Segreti da impostare (Supabase > Edge Functions > Secrets):
//    GEMINI_API_KEY   chiave creata su https://aistudio.google.com (gratuita)
//    GEMINI_MODEL     facoltativo, predefinito "gemini-flash-latest"
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const UA = "Mozilla/5.0 (compatible; GNAM-ricettario/1.0; +https://github.com/fcaf)";

const CATEGORIE = [
  "Antipasto", "Primo", "Secondo", "Contorno", "Piatto unico", "Pane e lievitati",
  "Dolce", "Salsa e condimento", "Conserva", "Bevanda",
];
const UNITA = ["g", "kg", "ml", "l", "cucchiai", "cucchiaini", "tazze", "pizzico", "spicchi", "pz", "fette", "mazzetto", "q.b."];

function risposta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ---------- istruzioni per Gemini ----------
const ISTRUZIONI = `Sei l'assistente di GNAM, il ricettario di una famiglia italiana.
Ricevi materiale su UNA ricetta (video, foto di appunti scritti a mano, pagine di libri, pagine web, testo libero) e restituisci la scheda in JSON.
Regole:
- Scrivi tutto in italiano. Se il materiale è in un'altra lingua, traduci e indica la lingua in "lingua_originale" (codice ISO, es. "en"); se è italiano metti "it".
- Converti le unità anglosassoni in metriche (cup, oz, lb, °F → g/ml, °C).
- Ingredienti: un oggetto per ingrediente con quantita (numero o null), unita (una tra: ${UNITA.join(", ")}), nome, nota. "Quanto basta" → quantita null e unita "q.b.". Raggruppa in "gruppi" se la ricetta ha parti distinte (es. impasto, farcitura); altrimenti un solo gruppo con nome "".
- Passi: frasi chiare all'imperativo, un'azione principale per passo, con tempi e temperature.
- categoria: una tra ${CATEGORIE.join(", ")}.
- tag: fino a 6 tra cui, quando pertinenti: Veloce, Vegetariano, Vegano, Senza glutine, Senza lattosio, Light, Al forno, Fritto, In padella, Della tradizione, Della nonna, Per le feste, Estate, Inverno, Autunno, Primavera, Pesce, Carne, Per bambini, Aperitivo, Si prepara prima, Economico. Puoi aggiungerne altri brevi.
- difficolta: 1 facile, 2 media, 3 impegnativa. costo: 1 basso, 2 medio, 3 alto. Tempi in minuti (null se ignoti). porzioni: numero (stima se manca).
- testo_originale: per video e foto, la trascrizione fedele di quanto detto o scritto che riguarda la ricetta (massimo 4000 caratteri). Per pagine web lascia "".
- Non inventare dosi. Se un dato manca lascialo vuoto e spiegalo in "avvisi".
- completezza: "completa", "parziale" (manca qualcosa di importante) o "insufficiente" (non c'è una ricetta riconoscibile).
- Se nel materiale non c'è alcuna ricetta, completezza "insufficiente" e spiega il motivo in "avvisi".`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    titolo: { type: "STRING" },
    descrizione: { type: "STRING" },
    categoria: { type: "STRING" },
    tag: { type: "ARRAY", items: { type: "STRING" } },
    porzioni: { type: "INTEGER", nullable: true },
    tempo_prep: { type: "INTEGER", nullable: true },
    tempo_cottura: { type: "INTEGER", nullable: true },
    tempo_riposo: { type: "INTEGER", nullable: true },
    difficolta: { type: "INTEGER", nullable: true },
    costo: { type: "INTEGER", nullable: true },
    gruppi: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          nome: { type: "STRING" },
          ingredienti: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                quantita: { type: "NUMBER", nullable: true },
                unita: { type: "STRING" },
                nome: { type: "STRING" },
                nota: { type: "STRING" },
              },
              required: ["nome"],
            },
          },
        },
        required: ["ingredienti"],
      },
    },
    passi: { type: "ARRAY", items: { type: "STRING" } },
    note: { type: "STRING" },
    fonte_autore: { type: "STRING" },
    lingua_originale: { type: "STRING" },
    testo_originale: { type: "STRING" },
    completezza: { type: "STRING", enum: ["completa", "parziale", "insufficiente"] },
    avvisi: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["titolo", "gruppi", "passi", "completezza"],
};

// ---------- utilità web ----------
function idYouTube(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/);
  return m ? m[1] : null;
}

function tipoLink(url: string) {
  const h = new URL(url).hostname.replace(/^www\.|^m\./, "");
  if (/youtube\.com$|youtu\.be$/.test(h)) return "youtube";
  if (/tiktok\.com$/.test(h)) return "tiktok";
  if (/facebook\.com$|fb\.watch$|fb\.com$/.test(h)) return "facebook";
  if (/instagram\.com$/.test(h)) return "instagram";
  return "web";
}

// Tempo massimo per ogni richiesta esterna: senza, una pagina che non risponde blocca tutto.
const ATTESA_PAGINA = 15_000;
const ATTESA_GEMINI = 110_000;

async function scarica(url: string, maxByte = 3_000_000) {
  let r: Response;
  try {
    r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(ATTESA_PAGINA) });
  } catch (e) {
    if ((e as Error).name === "TimeoutError") throw new Error("la pagina non ha risposto in tempo");
    throw e;
  }
  if (!r.ok) throw new Error(`La pagina ha risposto ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  return { finale: r.url, tipo: r.headers.get("content-type") ?? "", dati: buf.slice(0, maxByte) };
}

function meta(html: string, prop: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1]?.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'") ?? "";
}

function ricettaJsonLd(html: string): string {
  const blocchi = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const trovate: unknown[] = [];
  const visita = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(visita);
    const o = n as Record<string, unknown>;
    const t = o["@type"];
    if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) trovate.push(o);
    Object.values(o).forEach(visita);
  };
  for (const b of blocchi) { try { visita(JSON.parse(b.trim())); } catch { /* blocco non valido */ } }
  return trovate.length ? JSON.stringify(trovate[0]).slice(0, 30_000) : "";
}

function testoPagina(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|li|h\d|div|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, 60_000);
}

function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------- chiamata a Gemini ----------
async function chiediGemini(parti: unknown[]) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: ISTRUZIONI }] },
      contents: [{ role: "user", parts: parti }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: SCHEMA },
    }),
    signal: AbortSignal.timeout(ATTESA_GEMINI),
  }).catch((e) => {
    if ((e as Error).name === "TimeoutError") throw new Error("Gemini ci sta mettendo troppo. Riprova tra poco o usa un video più corto.");
    throw e;
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 429) throw new Error("Hai esaurito per ora la quota gratuita di Gemini. Riprova tra qualche minuto o domani.");
  if (!r.ok) throw new Error(`Gemini ha risposto ${r.status}: ${j?.error?.message ?? "errore sconosciuto"}`);
  const testo = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  if (!testo) throw new Error("Gemini non ha restituito una risposta. Riprova con un altro materiale.");
  return JSON.parse(testo.replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

// ---------- foto del piatto dal web ----------
async function salvaFotoDaUrl(admin: ReturnType<typeof createClient>, utente: string, url: string) {
  try {
    const f = await scarica(url, 6_000_000);
    if (!/^image\/(jpeg|png|webp)/.test(f.tipo)) return null;
    const est = f.tipo.includes("png") ? "png" : f.tipo.includes("webp") ? "webp" : "jpg";
    const path = `${utente}/piatti/${crypto.randomUUID()}.${est}`;
    const { error } = await admin.storage.from("ricette").upload(path, f.dati, { contentType: f.tipo.split(";")[0] });
    return error ? null : path;
  } catch { return null; }
}

// ---------- gestore ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return risposta({ errore: "Metodo non consentito" }, 405);

  // 1. Solo familiari autenticati
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return risposta({ errore: "Accesso richiesto" }, 401);
  if (!GEMINI_KEY) return risposta({ errore: "Manca la chiave GEMINI_API_KEY nei segreti della funzione." }, 500);

  try {
    const body = await req.json();
    const modo: string = body.modo;
    const parti: unknown[] = [];
    let fonte_tipo = "testo";
    let fonte_url: string | null = null;
    let fonte_autore = "";
    let fotoUrl = "";
    const avvisiExtra: string[] = [];

    if (modo === "testo") {
      const t = String(body.testo ?? "").slice(0, 60_000);
      if (t.trim().length < 15) return risposta({ errore: "Il testo è troppo corto per contenere una ricetta." }, 400);
      parti.push({ text: `Testo della ricetta incollato dall'utente:\n\n${t}` });
    } else if (modo === "immagini") {
      const imgs: { mime: string; dati: string }[] = body.immagini ?? [];
      if (!imgs.length) return risposta({ errore: "Nessuna foto ricevuta." }, 400);
      fonte_tipo = "foto";
      parti.push({ text: `Ecco ${imgs.length} foto (appunti a mano, pagine di libro o screenshot) della stessa ricetta, in ordine. Leggile con attenzione, anche la calligrafia difficile.` });
      for (const i of imgs.slice(0, 8)) parti.push({ inline_data: { mime_type: i.mime, data: i.dati } });
    } else if (modo === "video_file") {
      const v = body.video;
      if (!v?.dati) return risposta({ errore: "Nessun video ricevuto." }, 400);
      fonte_tipo = "video";
      fonte_url = body.url || null;
      parti.push({ text: "Video di una ricetta. Trascrivi quanto detto e mostrato (testi in sovrimpressione inclusi) e ricava la scheda." });
      parti.push({ inline_data: { mime_type: v.mime || "video/mp4", data: v.dati } });
      if (body.didascalia) parti.push({ text: `Didascalia del post:\n${String(body.didascalia).slice(0, 5000)}` });
    } else if (modo === "link") {
      const url = String(body.url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) return risposta({ errore: "Il link deve iniziare con http:// o https://" }, 400);
      fonte_url = url;
      let tipo = tipoLink(url);

      // I link di condivisione (share.google, vm.tiktok, fb.watch…) vanno risolti
      let finale = url;
      if (tipo === "web" || tipo === "tiktok" || tipo === "facebook") {
        try { const p = await scarica(url, 2_000_000); finale = p.finale; tipo = tipoLink(finale); fonte_url = finale;
          if (tipo === "web" || tipo === "facebook" || tipo === "instagram") {
            const html = new TextDecoder().decode(p.dati);
            fotoUrl = meta(html, "og:image");
            fonte_autore = meta(html, "og:site_name") || meta(html, "author");
            if (tipo === "web") {
              const ld = ricettaJsonLd(html);
              parti.push({ text: `Pagina web: ${finale}\nTitolo: ${meta(html, "og:title")}\n` +
                (ld ? `\nDati strutturati della ricetta (JSON-LD):\n${ld}\n` : "") +
                `\nTesto della pagina:\n${testoPagina(html)}` });
              fonte_tipo = "web";
            } else {
              const descr = meta(html, "og:description") || meta(html, "description");
              const tit = meta(html, "og:title");
              if (!descr.trim() || /log ?in|accedi|registrati/i.test(tit) && descr.length < 80) {
                return risposta({ errore: `${tipo === "facebook" ? "Facebook" : "Instagram"} non lascia leggere questo post senza accesso. Scarica il video e caricalo con "Carica il video", oppure copia la didascalia e usa "Da testo".` }, 422);
              }
              fonte_tipo = "video";
              parti.push({ text: `Post ${tipo} (${finale}).\nTitolo: ${tit}\nDidascalia: ${descr}` });
              avvisiExtra.push(`Da ${tipo} si legge solo la didascalia del post. Se la ricetta è detta nel video, scaricalo e caricalo nella sezione "Da link" con "Carica il video".`);
            }
          }
        } catch (e) {
          if (tipo === "web") return risposta({ errore: `Non riesco ad aprire la pagina: ${(e as Error).message}` }, 400);
          if (tipo === "facebook" || tipo === "instagram") {
            return risposta({ errore: `Non riesco ad aprire il post (${(e as Error).message}). Scarica il video e caricalo con "Carica il video", oppure copia la didascalia e usa "Da testo".` }, 422);
          }
        }
      }

      if (tipo === "youtube") {
        const id = idYouTube(finale);
        if (!id) return risposta({ errore: "Non riconosco questo link di YouTube." }, 400);
        fonte_tipo = "video";
        fonte_url = `https://www.youtube.com/watch?v=${id}`;
        fotoUrl = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        try {
          const o = await (await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(fonte_url)}`, { signal: AbortSignal.timeout(ATTESA_PAGINA) })).json();
          fonte_autore = o.author_name ?? "";
          parti.push({ text: `Video YouTube "${o.title ?? ""}" di ${o.author_name ?? "autore sconosciuto"}. Guardalo, trascrivi la ricetta e compila la scheda.` });
        } catch { parti.push({ text: "Video YouTube con una ricetta. Guardalo, trascrivi la ricetta e compila la scheda." }); }
        parti.push({ file_data: { file_uri: fonte_url } });
      } else if (tipo === "tiktok") {
        fonte_tipo = "video";
        try {
          const o = await (await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(finale)}`, { signal: AbortSignal.timeout(ATTESA_PAGINA) })).json();
          fonte_autore = o.author_name ?? "";
          fotoUrl = o.thumbnail_url ?? "";
          parti.push({ text: `Video TikTok di ${o.author_name ?? "?"}. Didascalia:\n${o.title ?? ""}` });
        } catch { /* nessuna didascalia */ }
        avvisiExtra.push("Da TikTok si legge solo la didascalia. Se la ricetta è spiegata a voce, scarica il video e caricalo con \"Carica il video\".");
      }
      if (!parti.length) {
        return risposta({ errore: "Da questo link non riesco a leggere nulla. Scarica il video e caricalo, oppure incolla il testo della ricetta." }, 422);
      }
    } else {
      return risposta({ errore: "Modalità sconosciuta" }, 400);
    }

    const r = await chiediGemini(parti);

    // gruppi → lista piatta con intestazioni di sezione
    const ingredienti: unknown[] = [];
    for (const g of r.gruppi ?? []) {
      if (g.nome && (r.gruppi.length > 1)) ingredienti.push({ sezione: g.nome });
      for (const i of g.ingredienti ?? []) {
        ingredienti.push({ quantita: i.quantita ?? null, unita: i.unita || (i.quantita == null ? "q.b." : ""), nome: i.nome, nota: i.nota ?? "" });
      }
    }

    let foto_path: string | null = null;
    if (fotoUrl && body.salva_foto !== false && r.completezza !== "insufficiente") {
      foto_path = await salvaFotoDaUrl(admin, auth.user.id, fotoUrl);
    }

    return risposta({
      bozza: {
        titolo: r.titolo ?? "",
        descrizione: r.descrizione ?? "",
        categoria: CATEGORIE.includes(r.categoria) ? r.categoria : "",
        tag: (r.tag ?? []).slice(0, 8),
        porzioni: r.porzioni ?? null,
        tempo_prep: r.tempo_prep ?? null,
        tempo_cottura: r.tempo_cottura ?? null,
        tempo_riposo: r.tempo_riposo ?? null,
        difficolta: r.difficolta ?? null,
        costo: r.costo ?? null,
        ingredienti,
        passi: r.passi ?? [],
        note: r.note ?? "",
        fonte_tipo,
        fonte_url,
        fonte_autore: r.fonte_autore || fonte_autore,
        lingua_originale: r.lingua_originale ?? "it",
        testo_originale: r.testo_originale ?? "",
        foto_path,
      },
      completezza: r.completezza,
      avvisi: [...(r.avvisi ?? []), ...avvisiExtra],
    });
  } catch (e) {
    return risposta({ errore: (e as Error).message ?? "Errore imprevisto" }, 500);
  }
});
