// GNAM · utilità condivise

export const CATEGORIE = [
  { nome: "Antipasto", colore: "lemon" },
  { nome: "Primo", colore: "accent" },
  { nome: "Secondo", colore: "plum" },
  { nome: "Contorno", colore: "basil" },
  { nome: "Piatto unico", colore: "sky" },
  { nome: "Pane e lievitati", colore: "lemon" },
  { nome: "Dolce", colore: "plum" },
  { nome: "Salsa e condimento", colore: "accent" },
  { nome: "Conserva", colore: "basil" },
  { nome: "Bevanda", colore: "sky" },
];

export const TAG_BASE = [
  "Veloce", "Vegetariano", "Vegano", "Senza glutine", "Senza lattosio", "Light",
  "Al forno", "Fritto", "In padella", "Della tradizione", "Della nonna", "Per le feste",
  "Primavera", "Estate", "Autunno", "Inverno", "Pesce", "Carne", "Per bambini",
  "Aperitivo", "Si prepara prima", "Economico",
];

export const UNITA = ["g", "kg", "ml", "l", "cucchiai", "cucchiaini", "tazze", "pizzico", "spicchi", "pz", "fette", "mazzetto", "q.b."];
export const DIFFICOLTA = { 1: "Facile", 2: "Media", 3: "Impegnativa" };
export const COSTO = { 1: "Basso", 2: "Medio", 3: "Alto" };
export const FONTI = { manuale: "Scritta a mano", video: "Video", foto: "Foto", web: "Sito web", testo: "Testo" };

export const coloreCategoria = (c) => CATEGORIE.find((x) => x.nome === c)?.colore ?? "sky";

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function minuti(m) {
  if (!m) return "";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function tempoTotale(r) {
  return (r.tempo_prep || 0) + (r.tempo_cottura || 0);
}

// 1.5 → "1,5"; 0.333 → "⅓"; arrotondamenti sensati per la cucina
const FRAZ = [[0.25, "¼"], [0.333, "⅓"], [0.5, "½"], [0.667, "⅔"], [0.75, "¾"]];
export function formattaQuantita(q, unita = "") {
  if (q === null || q === undefined || q === "" || isNaN(q)) return "";
  const n = Number(q);
  const pesabile = ["g", "ml"].includes(unita);
  if (pesabile) return n >= 100 ? String(Math.round(n / 5) * 5) : String(Math.round(n));
  const intero = Math.floor(n), resto = n - intero;
  if (resto < 0.05) return String(intero || (n > 0 ? "<1" : 0));
  if (resto > 0.95) return String(intero + 1);
  if (n < 10 && !["kg", "l"].includes(unita)) {
    const f = FRAZ.find(([v]) => Math.abs(resto - v) < 0.06);
    if (f) return (intero ? intero + " " : "") + f[1];
  }
  return n.toLocaleString("it-IT", { maximumFractionDigits: n < 10 ? 2 : 1 });
}

export function rigaIngrediente(i, fattore = 1) {
  const q = i.quantita != null ? formattaQuantita(i.quantita * fattore, i.unita) : "";
  const u = i.unita && i.unita !== "pz" ? i.unita : "";
  if (u === "q.b.") return { qta: "q.b.", nome: i.nome, nota: i.nota };
  return { qta: [q, u].filter(Boolean).join(" "), nome: i.nome, nota: i.nota };
}

export function dataBreve(iso) {
  try { return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return ""; }
}

export function normalizza(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Riduce una foto (max lato 1600 px, JPEG) prima di caricarla o mandarla all'IA
export async function comprimiImmagine(file, lato = 1600, qualita = 0.82) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, lato / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((ok) => c.toBlob((b) => ok(b || file), "image/jpeg", qualita));
}

export function blobBase64(blob) {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]);
    r.onerror = ko;
    r.readAsDataURL(blob);
  });
}

let timerToast;
export function toast(msg, tipo = "ok") {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); document.body.append(el); }
  el.textContent = msg; el.dataset.tipo = tipo; el.classList.add("visibile");
  clearTimeout(timerToast); timerToast = setTimeout(() => el.classList.remove("visibile"), 3200);
}

// Analisi locale di un testo (usata nella demo, senza IA)
export function analizzaTestoSemplice(testo) {
  const righe = testo.split(/\n+/).map((r) => r.trim()).filter(Boolean);
  const titolo = righe.shift() ?? "Nuova ricetta";
  const ingredienti = [], passi = [];
  const reQ = /^[-•*]?\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|l|cucchiai(?:ni)?|cucchiaio|cucchiaino|tazze?|pizzico|spicchi?|pz|fette)?\.?\s+(?:di\s+)?(.+)$/i;
  for (const r of righe) {
    const m = r.match(reQ);
    if (m && r.length < 80) {
      let u = (m[2] || "pz").toLowerCase().replace(/^gr$/, "g").replace(/^cucchiaio$/, "cucchiai").replace(/^cucchiaino$/, "cucchiaini").replace(/^spicchio$/, "spicchi").replace(/^tazza$/, "tazze");
      ingredienti.push({ quantita: Number(m[1].replace(",", ".")), unita: u, nome: m[3], nota: "" });
    } else if (/q\.?\s?b\.?$/i.test(r) && r.length < 60) {
      ingredienti.push({ quantita: null, unita: "q.b.", nome: r.replace(/[-•*]\s*/, "").replace(/\s*q\.?\s?b\.?$/i, ""), nota: "" });
    } else {
      passi.push(r.replace(/^\d+[.)]\s*/, ""));
    }
  }
  return { titolo, ingredienti, passi };
}

export const ICONE = {
  cuore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.1 4.5c2.1 0 3.6 1.2 4.9 2.9 1.3-1.7 2.8-2.9 4.9-2.9 3.5 0 5.6 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>',
  stella: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7z"/></svg>',
  orologio: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  persone: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 19c.8-3.4 3.2-5 6-5s5.2 1.6 6 5M16 5.5a3 3 0 010 5.6M18 14.5c1.6.6 2.6 2.1 3 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  libro: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5A1.5 1.5 0 014 17.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5-.7 1.5-1.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  piu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  carrello: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2.2l2.2 10.2a1.5 1.5 0 001.5 1.2h8.3a1.5 1.5 0 001.4-1.1L20.5 8H6.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="19.5" r="1.4" fill="currentColor"/><circle cx="17" cy="19.5" r="1.4" fill="currentColor"/></svg>',
  famiglia: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5L12 5l8 6.5V19a1 1 0 01-1 1h-4.5v-5h-5v5H5a1 1 0 01-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  cerca: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  foto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A1.5 1.5 0 015.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  testo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h9l3 3v13H6zM9 10h6M9 13.5h6M9 17h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  matita: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5zM13.5 7l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  stampa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-5a2 2 0 012-2h12a2 2 0 012 2v5a1 1 0 01-1 1h-2M7 14h10v6H7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  cestino: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12.5c0 .3.3.5.6.5h6.8c.3 0 .6-.2.6-.5L17 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  indietro: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lucchetto: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 10.5l5-3v9l-5-3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  copia: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  su: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  giu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
};
