// =====================================================================
//  GNAM · Gusti Nostri, Archivio Multimediale
//  Applicazione principale (nessuna compilazione: basta pubblicare i file)
// =====================================================================
import { creaArchivio } from "./dati.js";
import {
  CATEGORIE, TAG_BASE, UNITA, DIFFICOLTA, COSTO, FONTI, ICONE, coloreCategoria, esc, $, $$, minuti, tempoTotale,
  rigaIngrediente, dataBreve, normalizza, debounce, comprimiImmagine, blobBase64, toast, formattaQuantita,
} from "./util.js";

const DB = creaArchivio(window.GNAM_CONFIG);
const vista = $("#vista");

const S = {
  io: null,
  ricette: [],
  pref: { mie: {}, medie: {} },
  urls: {},
  familiari: [],
  filtri: { q: "", cat: "", tag: "", solo: "" },
  bozza: null,          // ricetta in preparazione (da IA o nuova)
  esito: null,          // {completezza, avvisi} dell'ultima lettura IA
  fotoOriginali: [],    // blob delle foto appunti da salvare con la bozza
  caricato: false,
};

// ---------------------------------------------------------------------
//  Avvio e navigazione
// ---------------------------------------------------------------------
async function avvia() {
  if (DB.demo) document.body.classList.add("demo");
  try {
    S.io = await DB.sessione();
    if (!S.io && DB.demo && window.GNAM_CONFIG?.demoAutomatica) S.io = await DB.entraDemo();
  } catch (e) { console.error(e); }
  DB.suCambioAccesso((io) => {
    const prima = S.io?.id;
    S.io = io;
    if (io?.id !== prima) { S.caricato = false; vai(io ? "#/" : "#/accedi"); }
  });
  const erroreLink = new URLSearchParams(location.hash.replace(/^#/, "")).get("error_description");
  if (erroreLink) { toast("Il link di accesso non è più valido: richiedine uno nuovo.", "errore"); location.hash = "#/accedi"; }
  window.addEventListener("hashchange", instrada);
  instrada();
  registraServiceWorker();
}

function vai(h) { if (location.hash === h) instrada(); else location.hash = h; }

async function instrada() {
  let h = location.hash || "#/";
  if (/access_token|refresh_token/.test(h)) {
    // Supabase sta completando l'accesso dal link nell'email
    if (!S.io) return;
    history.replaceState(null, "", location.pathname + location.search + "#/");
    h = "#/";
  }
  const [, sezione = "", a, b] = h.replace(/^#\/?/, "#/").split("/");
  vista.onclick = null; vista.onchange = null;

  if (!S.io && sezione !== "accedi") return vai("#/accedi");
  if (S.io && sezione === "accedi") return vai("#/");

  document.body.dataset.schermata = sezione || "ricettario";
  aggiornaChrome(sezione || "ricettario");
  window.scrollTo(0, 0);
  rilasciaSchermo();

  try {
    if (S.io && !S.caricato) await ricaricaTutto();
    switch (sezione) {
      case "accedi": return vistaAccesso();
      case "": return vistaRicettario();
      case "ricetta": return vistaRicetta(a);
      case "nuova": return vistaNuova(a || "");
      case "scrivi": return vistaEditor(null);
      case "modifica": return vistaEditor(a);
      case "stampa": return vistaStampa(a, b || "a4");
      case "spesa": return vistaSpesa();
      case "famiglia": return vistaFamiglia();
      default: return vai("#/");
    }
  } catch (e) {
    console.error(e);
    vista.innerHTML = `<div class="vuoto"><h2>Qualcosa non ha funzionato</h2><p>${esc(e.message)}</p><a class="btn" href="#/">Torna alle ricette</a></div>`;
  }
}

async function ricaricaTutto() {
  const [ricette, pref] = await Promise.all([DB.elencoRicette(), DB.preferenze()]);
  S.ricette = ricette ?? [];
  S.pref = pref;
  S.caricato = true;
  const paths = S.ricette.map((r) => r.foto_path).filter(Boolean);
  if (paths.length) Object.assign(S.urls, await DB.urlFoto(paths));
}

function aggiornaChrome(sezione) {
  const attiva = { ricettario: "ricettario", ricetta: "ricettario", stampa: "ricettario", nuova: "nuova", scrivi: "nuova", modifica: "nuova", spesa: "spesa", famiglia: "famiglia" }[sezione];
  $$("[data-nav]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.nav === attiva));
  const n = $("#nome-utente"); if (n) n.textContent = S.io?.nome ?? "";
}

// ---------------------------------------------------------------------
//  ACCESSO
// ---------------------------------------------------------------------
function vistaAccesso() {
  vista.innerHTML = `
  <section class="accesso">
    <div class="accesso-marchio">
      <img src="img/logo.svg" alt="" width="120" height="120">
      <h1 class="wordmark">gnam</h1>
      <p class="acronimo"><b>G</b>usti <b>N</b>ostri, <b>A</b>rchivio <b>M</b>ultimediale</p>
      <p class="sottotitolo">Il ricettario della famiglia: video, appunti e foto diventano schede ordinate da cucinare e stampare.</p>
    </div>
    <form class="accesso-form carta" id="f-email" novalidate>
      <h2>Entra</h2>
      <label for="email">La tua email</label>
      <input id="email" type="email" autocomplete="email" inputmode="email" required placeholder="nome@esempio.it">
      <button class="btn primario largo" type="submit">Mandami il link</button>
      <p class="piccolo">Niente password: ricevi un'email con un link e un codice. Possono entrare solo i familiari invitati.</p>
      ${DB.demo ? `<div class="separatore"><span>oppure</span></div>
      <button class="btn largo" type="button" data-azione="entra-demo">Prova la demo</button>
      <p class="piccolo">Modalità dimostrativa: i dati restano solo in questo browser.</p>` : ""}
    </form>
    <form class="accesso-form carta" id="f-codice" hidden novalidate>
      <h2>Controlla la posta</h2>
      <p>Abbiamo scritto a <b id="email-inviata"></b>. Apri il link nell'email, oppure inserisci qui il codice: è il modo più sicuro se hai GNAM installato sul telefono.</p>
      <label for="codice">Codice dall'email</label>
      <input id="codice" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" class="codice">
      <button class="btn primario largo" type="submit">Entra</button>
      <button class="btn-testo" type="button" data-azione="cambia-email">Usa un'altra email</button>
    </form>
  </section>`;

  let email = "";
  $("#f-email").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    email = $("#email").value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Scrivi un indirizzo email valido.", "errore");
    const btn = ev.submitter; occupato(btn, true);
    try {
      await DB.inviaLink(email);
      $("#email-inviata").textContent = email;
      $("#f-email").hidden = true; $("#f-codice").hidden = false; $("#codice").focus();
    } catch (e) { toast(e.message, "errore"); }
    occupato(btn, false);
  });
  $("#f-codice").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const c = $("#codice").value.replace(/\D/g, "");
    if (c.length < 6) return toast("Il codice ha almeno 6 cifre.", "errore");
    const btn = ev.submitter; occupato(btn, true);
    try { S.io = await DB.verificaCodice(email, c); S.caricato = false; vai("#/"); }
    catch (e) { toast(e.message, "errore"); }
    occupato(btn, false);
  });
}

// ---------------------------------------------------------------------
//  RICETTARIO (elenco)
// ---------------------------------------------------------------------
function vistaRicettario() {
  const tuttiTag = [...new Set(S.ricette.flatMap((r) => r.tag ?? []))].sort((a, b) => a.localeCompare(b, "it"));
  const nPref = Object.values(S.pref.mie).filter((p) => p.preferita).length;
  vista.innerHTML = `
  <section class="testa-elenco">
    <div class="saluto">
      <h1>Ciao ${esc(S.io.nome)}</h1>
      <p id="conteggio"></p>
    </div>
    <label class="ricerca" for="cerca">
      ${ICONE.cerca}
      <input id="cerca" type="search" placeholder="Cerca per nome, ingrediente o tag" value="${esc(S.filtri.q)}" autocomplete="off">
    </label>
    <div class="chips scorri" role="group" aria-label="Categoria">
      <button class="chip" data-cat="" aria-pressed="${!S.filtri.cat}">Tutte</button>
      ${CATEGORIE.filter((c) => S.ricette.some((r) => r.categoria === c.nome)).map((c) =>
        `<button class="chip" data-colore="${c.colore}" data-cat="${esc(c.nome)}" aria-pressed="${S.filtri.cat === c.nome}">${esc(c.nome)}</button>`).join("")}
    </div>
    <div class="filtri">
      <div class="segmentato" role="group" aria-label="Mostra">
        <button data-solo="" aria-pressed="${!S.filtri.solo}">Tutte</button>
        <button data-solo="preferite" aria-pressed="${S.filtri.solo === "preferite"}">Preferite${nPref ? ` · ${nPref}` : ""}</button>
        <button data-solo="mie" aria-pressed="${S.filtri.solo === "mie"}">Mie</button>
      </div>
      <select id="filtro-tag" aria-label="Filtra per tag">
        <option value="">Tutti i tag</option>
        ${tuttiTag.map((t) => `<option ${S.filtri.tag === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
      </select>
    </div>
  </section>
  <div class="griglia" id="griglia"></div>`;

  const disegna = () => {
    const el = $("#griglia");
    const lista = filtraRicette();
    $("#conteggio").textContent = S.ricette.length
      ? (lista.length === S.ricette.length ? `${S.ricette.length} ricette in famiglia` : `${lista.length} di ${S.ricette.length} ricette`)
      : "Il ricettario è ancora vuoto";
    if (!S.ricette.length) {
      el.innerHTML = `<div class="vuoto ampio"><img src="img/logo.svg" alt="" width="72" height="72"><h2>Aggiungi la prima ricetta</h2>
        <p>Incolla il link di un video, fotografa un quaderno di appunti o scrivila tu.</p><a class="btn primario" href="#/nuova">${ICONE.piu} Aggiungi ricetta</a></div>`;
      return;
    }
    el.innerHTML = lista.length ? lista.map(cardRicetta).join("") :
      `<div class="vuoto ampio"><h2>Nessuna ricetta trovata</h2><p>Prova a cambiare la ricerca o i filtri.</p><button class="btn" data-azione="azzera-filtri">Azzera filtri</button></div>`;
  };
  disegna();

  $("#cerca").addEventListener("input", debounce((e) => { S.filtri.q = e.target.value; disegna(); }, 150));
  $("#filtro-tag").addEventListener("change", (e) => { S.filtri.tag = e.target.value; disegna(); });
  vista.onclick = (e) => {
    const c = e.target.closest("[data-cat]");
    if (c) { S.filtri.cat = c.dataset.cat; $$("[data-cat]").forEach((x) => x.setAttribute("aria-pressed", x === c)); disegna(); }
    const s = e.target.closest("[data-solo]");
    if (s) { S.filtri.solo = s.dataset.solo; $$("[data-solo]").forEach((x) => x.setAttribute("aria-pressed", x === s)); disegna(); }
  };
}

function filtraRicette() {
  const q = normalizza(S.filtri.q);
  const parole = q.split(/\s+/).filter(Boolean);
  return S.ricette.filter((r) => {
    if (S.filtri.cat && r.categoria !== S.filtri.cat) return false;
    if (S.filtri.tag && !(r.tag ?? []).includes(S.filtri.tag)) return false;
    if (S.filtri.solo === "preferite" && !S.pref.mie[r.id]?.preferita) return false;
    if (S.filtri.solo === "mie" && r.autore_id !== S.io.id) return false;
    if (!parole.length) return true;
    const testo = normalizza([r.titolo, r.descrizione, r.categoria, ...(r.tag ?? []), ...(r.ingredienti ?? []).map((i) => i.nome)].join(" "));
    return parole.every((p) => testo.includes(p));
  });
}

function segnaposto(r, classe = "") {
  const iniziale = esc((r.titolo || "?").trim().charAt(0).toUpperCase());
  return `<div class="segnaposto ${classe}" data-colore="${coloreCategoria(r.categoria)}" aria-hidden="true"><span>${iniziale}</span></div>`;
}

function cardRicetta(r) {
  const url = r.foto_path && S.urls[r.foto_path];
  const p = S.pref.mie[r.id];
  const t = tempoTotale(r);
  return `
  <a class="card" href="#/ricetta/${r.id}">
    <div class="card-foto">
      ${url ? `<img src="${esc(url)}" alt="" loading="lazy">` : segnaposto(r)}
      ${r.categoria ? `<span class="pill" data-colore="${coloreCategoria(r.categoria)}">${esc(r.categoria)}</span>` : ""}
      <span class="card-segni">${p?.preferita ? `<span class="segno cuore" title="Preferita">${ICONE.cuore}</span>` : ""}${r.privata ? `<span class="segno" title="Privata">${ICONE.lucchetto}</span>` : ""}</span>
    </div>
    <div class="card-corpo">
      <h3>${esc(r.titolo)}</h3>
      <p class="card-meta">
        ${t ? `<span>${ICONE.orologio}${minuti(t)}</span>` : ""}
        ${r.difficolta ? `<span>${puntini(r.difficolta)}${DIFFICOLTA[r.difficolta]}</span>` : ""}
      </p>
      ${(r.tag ?? []).length ? `<p class="card-tag">${r.tag.slice(0, 3).map((x) => `<span>${esc(x)}</span>`).join("")}</p>` : ""}
    </div>
  </a>`;
}

const puntini = (n) => `<i class="puntini" aria-hidden="true">${[1, 2, 3].map((i) => `<b class="${i <= n ? "pieno" : ""}"></b>`).join("")}</i>`;

// ---------------------------------------------------------------------
//  SCHEDA RICETTA
// ---------------------------------------------------------------------
async function vistaRicetta(id) {
  vista.innerHTML = `<div class="caricamento">Apro la ricetta…</div>`;
  const r = await DB.ricetta(id);
  if (!r) { vista.innerHTML = `<div class="vuoto"><h2>Ricetta non trovata</h2><p>Forse è stata eliminata o è privata.</p><a class="btn" href="#/">Torna alle ricette</a></div>`; return; }
  const urls = await DB.urlFoto([r.foto_path, ...(r.foto_originali ?? [])].filter(Boolean));
  const pr = S.pref.mie[r.id] ?? {};
  const media = S.pref.medie[r.id];
  const mia = r.autore_id === S.io.id;
  const puoModificare = mia || (S.io.is_admin && !r.privata);
  if (!S.familiari.length) S.familiari = await DB.familiari().catch(() => []);
  const autore = S.familiari.find((f) => f.id === r.autore_id)?.nome ?? "un familiare";
  const base = r.porzioni || 1;
  let porzioni = base;

  vista.innerHTML = `
  <article class="scheda">
    <div class="scheda-barra">
      <a class="btn-icona" href="#/" aria-label="Torna alle ricette">${ICONE.indietro}</a>
      <div class="scheda-azioni">
        <button class="btn-icona ${pr.preferita ? "attivo" : ""}" data-azione="preferita" aria-pressed="${!!pr.preferita}" aria-label="Preferita">${ICONE.cuore}</button>
        <a class="btn-icona" href="#/stampa/${r.id}/a4" aria-label="Stampa">${ICONE.stampa}</a>
        ${puoModificare ? `<a class="btn-icona" href="#/modifica/${r.id}" aria-label="Modifica">${ICONE.matita}</a>` : ""}
      </div>
    </div>

    <header class="scheda-testa">
      <div class="scheda-foto">${urls[r.foto_path] ? `<img src="${esc(urls[r.foto_path])}" alt="${esc(r.titolo)}">` : segnaposto(r, "grande")}</div>
      <div class="scheda-intro">
        <p class="occhiello">
          ${r.categoria ? `<span class="pill" data-colore="${coloreCategoria(r.categoria)}">${esc(r.categoria)}</span>` : ""}
          ${r.privata ? `<span class="pill neutro">${ICONE.lucchetto} Privata</span>` : ""}
        </p>
        <h1>${esc(r.titolo)}</h1>
        ${r.descrizione ? `<p class="descrizione">${esc(r.descrizione)}</p>` : ""}
        <dl class="dati">
          ${r.tempo_prep ? `<div><dt>Preparazione</dt><dd>${minuti(r.tempo_prep)}</dd></div>` : ""}
          ${r.tempo_cottura ? `<div><dt>Cottura</dt><dd>${minuti(r.tempo_cottura)}</dd></div>` : ""}
          ${r.tempo_riposo ? `<div><dt>Riposo</dt><dd>${minuti(r.tempo_riposo)}</dd></div>` : ""}
          ${r.difficolta ? `<div><dt>Difficoltà</dt><dd>${puntini(r.difficolta)}${DIFFICOLTA[r.difficolta]}</dd></div>` : ""}
          ${r.costo ? `<div><dt>Costo</dt><dd>${"€".repeat(r.costo)} <span class="tenue">${COSTO[r.costo]}</span></dd></div>` : ""}
        </dl>
        <div class="voto" role="group" aria-label="Il tuo voto">
          ${[1, 2, 3, 4, 5].map((v) => `<button data-voto="${v}" class="${(pr.voto ?? 0) >= v ? "pieno" : ""}" aria-label="${v} su 5">${ICONE.stella}</button>`).join("")}
          <span class="tenue">${media ? `media famiglia ${media.media.toFixed(1).replace(".", ",")} (${media.n})` : "vota la ricetta"}</span>
        </div>
        ${(r.tag ?? []).length ? `<p class="tag-lista">${r.tag.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</p>` : ""}
      </div>
    </header>

    <div class="scheda-corpo">
      <section class="ingredienti carta">
        <div class="sez-testa">
          <h2>Ingredienti</h2>
          <div class="porzioni" role="group" aria-label="Porzioni">
            <button data-azione="porzioni-meno" aria-label="Meno porzioni">−</button>
            <span><b id="n-porzioni">${porzioni}</b> ${ICONE.persone}</span>
            <button data-azione="porzioni-piu" aria-label="Più porzioni">+</button>
          </div>
        </div>
        <ul id="lista-ingredienti" class="lista-ingredienti"></ul>
        <button class="btn largo" data-azione="alla-spesa">${ICONE.carrello} Aggiungi alla lista della spesa</button>
      </section>

      <section class="procedimento">
        <div class="sez-testa">
          <h2>Procedimento</h2>
          <label class="interruttore" title="Lo schermo non si spegne mentre cucini">
            <input type="checkbox" id="schermo-acceso"><span>Schermo acceso</span>
          </label>
        </div>
        <ol class="passi">${(r.passi ?? []).map((p) => `<li><p>${esc(p)}</p></li>`).join("")}</ol>
        ${r.note ? `<div class="note carta"><h3>Note e varianti</h3><p>${esc(r.note).replace(/\n/g, "<br>")}</p></div>` : ""}
      </section>
    </div>

    <footer class="scheda-fonte carta">
      <h3>Origine</h3>
      <p>${ICONE[r.fonte_tipo === "video" ? "video" : r.fonte_tipo === "foto" ? "foto" : r.fonte_tipo === "web" ? "link" : r.fonte_tipo === "testo" ? "testo" : "matita"]}
        <span>${esc(FONTI[r.fonte_tipo] ?? "")}${r.fonte_autore ? ` · ${esc(r.fonte_autore)}` : ""}${r.lingua_originale && r.lingua_originale !== "it" ? ` · tradotta da ${esc(r.lingua_originale.toUpperCase())}` : ""}</span></p>
      ${r.fonte_url ? `<p><a class="link-fonte" href="${esc(r.fonte_url)}" target="_blank" rel="noopener">${ICONE.link}<span>${esc(r.fonte_url)}</span></a></p>` : ""}
      ${(r.foto_originali ?? []).length ? `<div class="originali">${r.foto_originali.map((p) => urls[p] ? `<a href="${esc(urls[p])}" target="_blank" rel="noopener"><img src="${esc(urls[p])}" alt="Foto originale degli appunti" loading="lazy"></a>` : "").join("")}</div>` : ""}
      ${r.testo_originale ? `<details><summary>Trascrizione originale</summary><pre>${esc(r.testo_originale)}</pre></details>` : ""}
      <p class="tenue piccolo">Aggiunta da ${esc(mia ? "te" : autore)} il ${dataBreve(r.creata_il)}${r.aggiornata_il && r.aggiornata_il.slice(0, 10) !== r.creata_il.slice(0, 10) ? ` · modificata il ${dataBreve(r.aggiornata_il)}` : ""}</p>
      <div class="riga-azioni">
        <a class="btn" href="#/stampa/${r.id}/a4">${ICONE.stampa} Stampa A4</a>
        <a class="btn" href="#/stampa/${r.id}/a5">${ICONE.stampa} Scheda A5</a>
        ${puoModificare ? `<a class="btn" href="#/modifica/${r.id}">${ICONE.matita} Modifica</a>` : ""}
        ${puoModificare ? `<button class="btn pericolo" data-azione="elimina">${ICONE.cestino} Elimina</button>` : ""}
      </div>
      <div class="conferma" id="conferma-elimina" hidden>
        <p>Eliminare definitivamente “${esc(r.titolo)}”? Le foto collegate verranno cancellate.</p>
        <button class="btn pericolo" data-azione="elimina-si">Sì, elimina</button>
        <button class="btn" data-azione="elimina-no">Annulla</button>
      </div>
    </footer>
  </article>`;

  const disegnaIngredienti = () => {
    const f = porzioni / base;
    $("#n-porzioni").textContent = porzioni;
    $("#lista-ingredienti").innerHTML = (r.ingredienti ?? []).map((i, k) => {
      if (i.sezione) return `<li class="sezione">${esc(i.sezione)}</li>`;
      const x = rigaIngrediente(i, f);
      return `<li><label><input type="checkbox" id="ing-${k}"><span class="qta">${esc(x.qta)}</span><span class="nome">${esc(x.nome)}${x.nota ? ` <small>${esc(x.nota)}</small>` : ""}</span></label></li>`;
    }).join("");
  };
  disegnaIngredienti();

  $("#schermo-acceso").addEventListener("change", (e) => e.target.checked ? tieniSchermo() : rilasciaSchermo());

  vista.onclick = async (e) => {
    const az = e.target.closest("[data-azione]")?.dataset.azione;
    const voto = e.target.closest("[data-voto]")?.dataset.voto;
    if (voto) {
      const v = Number(voto) === pr.voto ? null : Number(voto);
      pr.voto = v; S.pref.mie[r.id] = { ...pr };
      $$("[data-voto]").forEach((b) => b.classList.toggle("pieno", (v ?? 0) >= Number(b.dataset.voto)));
      DB.impostaPreferenza(r.id, { preferita: !!pr.preferita, voto: v }).then(() => DB.preferenze()).then((p) => (S.pref = p)).catch((er) => toast(er.message, "errore"));
    }
    if (az === "preferita") {
      pr.preferita = !pr.preferita; S.pref.mie[r.id] = { ...pr };
      const b = e.target.closest("[data-azione]"); b.classList.toggle("attivo", pr.preferita); b.setAttribute("aria-pressed", pr.preferita);
      toast(pr.preferita ? "Aggiunta alle preferite" : "Tolta dalle preferite");
      DB.impostaPreferenza(r.id, { preferita: pr.preferita, voto: pr.voto ?? null }).catch((er) => toast(er.message, "errore"));
    }
    if (az === "porzioni-meno" && porzioni > 1) { porzioni--; disegnaIngredienti(); }
    if (az === "porzioni-piu" && porzioni < 99) { porzioni++; disegnaIngredienti(); }
    if (az === "alla-spesa") await aggiungiAllaSpesa(r, porzioni / base);
    if (az === "elimina") $("#conferma-elimina").hidden = false;
    if (az === "elimina-no") $("#conferma-elimina").hidden = true;
    if (az === "elimina-si") {
      try { await DB.eliminaRicetta(r); S.ricette = S.ricette.filter((x) => x.id !== r.id); toast("Ricetta eliminata"); vai("#/"); }
      catch (er) { toast(er.message, "errore"); }
    }
  };
}

async function aggiungiAllaSpesa(r, fattore) {
  const attuale = await DB.spesa();
  const nuove = [];
  for (const i of r.ingredienti ?? []) {
    if (i.sezione || !i.nome) continue;
    const q = i.quantita != null ? Math.round(i.quantita * fattore * 100) / 100 : null;
    const unita = i.unita === "q.b." ? "" : (i.unita || "");
    const uguale = attuale.find((v) => !v.fatto && normalizza(v.voce) === normalizza(i.nome) && (v.unita || "") === unita);
    if (uguale) {
      if (q != null && uguale.quantita != null) await DB.aggiornaSpesa(uguale.id, { quantita: Math.round((Number(uguale.quantita) + q) * 100) / 100 });
      continue;
    }
    if (nuove.some((v) => normalizza(v.voce) === normalizza(i.nome) && v.unita === unita)) continue;
    nuove.push({ voce: i.nome, quantita: q, unita, ricetta_id: r.id.startsWith("demo") ? null : r.id, ricetta_titolo: r.titolo });
  }
  if (nuove.length) await DB.aggiungiSpesa(nuove);
  toast(`Lista della spesa aggiornata con “${r.titolo}”`);
}

// ---------------------------------------------------------------------
//  NUOVA RICETTA: scelta della fonte
// ---------------------------------------------------------------------
function vistaNuova(modo) {
  const tessere = [
    { id: "link", icona: "video", titolo: "Da un link", testo: "YouTube, TikTok, Facebook, Instagram o un sito di ricette", colore: "accent" },
    { id: "foto", icona: "foto", titolo: "Da foto", testo: "Appunti a mano, pagine di libri, screenshot", colore: "plum" },
    { id: "testo", icona: "testo", titolo: "Da testo", testo: "Incolla un messaggio, una mail, una nota", colore: "sky" },
    { id: "scrivi", icona: "matita", titolo: "Scrivo io", testo: "Compila la scheda campo per campo", colore: "basil" },
  ];
  vista.innerHTML = `
  <section class="nuova">
    <h1>Aggiungi una ricetta</h1>
    <p class="tenue">Scegli da dove arriva. GNAM la legge, la traduce se serve e prepara la scheda: tu la controlli e la salvi.</p>
    <div class="tessere">
      ${tessere.map((t) => `<a class="tessera" data-colore="${t.colore}" href="${t.id === "scrivi" ? "#/scrivi" : "#/nuova/" + t.id}" aria-current="${modo === t.id}">
        <span class="tessera-icona">${ICONE[t.icona]}</span><span><b>${t.titolo}</b><small>${t.testo}</small></span></a>`).join("")}
    </div>
    <div id="pannello"></div>
  </section>`;
  if (modo) pannelloAcquisizione(modo);
}

function pannelloAcquisizione(modo) {
  const p = $("#pannello");
  if (modo === "link") {
    p.innerHTML = `
    <form class="carta pannello" id="f-acq" novalidate>
      <h2>Incolla il link</h2>
      <label for="url">Indirizzo del video o della pagina</label>
      <input id="url" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=…" required>
      <label class="spunta"><input type="checkbox" id="salva-foto" checked> Usa l'immagine del video o della pagina come foto del piatto</label>
      <details class="video-locale">
        <summary>Il link non basta? Carica il video</summary>
        <p class="piccolo">TikTok, Facebook e Instagram spesso non lasciano leggere il video. Scaricalo sul telefono e caricalo qui (massimo 18 MB, circa un minuto): GNAM ascolterà la ricetta.</p>
        <input type="file" id="video" accept="video/*">
      </details>
      <button class="btn primario largo" type="submit">Leggi la ricetta</button>
    </form>`;
  } else if (modo === "foto") {
    p.innerHTML = `
    <form class="carta pannello" id="f-acq" novalidate>
      <h2>Fotografa o scegli le immagini</h2>
      <p class="piccolo">Fino a 8 foto della stessa ricetta, nell'ordine giusto. Anche la calligrafia della nonna.</p>
      <label class="zona-file" for="foto">
        ${ICONE.foto}<span><b>Scatta o scegli le foto</b><small>JPG, PNG o HEIC dal telefono</small></span>
        <input type="file" id="foto" accept="image/*" multiple>
      </label>
      <div class="anteprime" id="anteprime"></div>
      <label class="spunta"><input type="checkbox" id="tieni-originali" checked> Conserva le foto originali nella scheda</label>
      <button class="btn primario largo" type="submit">Leggi la ricetta</button>
    </form>`;
    let files = [];
    $("#foto").addEventListener("change", (e) => {
      files = [...files, ...e.target.files].slice(0, 8);
      $("#anteprime").innerHTML = files.map((f, i) => `<figure><img src="${URL.createObjectURL(f)}" alt="Foto ${i + 1}"><figcaption>${i + 1}</figcaption></figure>`).join("");
      e.target.value = "";
    });
    p.dataset.files = "";
    p._files = () => files;
  } else if (modo === "testo") {
    p.innerHTML = `
    <form class="carta pannello" id="f-acq" novalidate>
      <h2>Incolla il testo</h2>
      <label for="testo">Testo della ricetta, anche disordinato o in un'altra lingua</label>
      <textarea id="testo" rows="10" placeholder="Torta di mele della zia&#10;3 uova, 200 g di zucchero…"></textarea>
      <button class="btn primario largo" type="submit">Prepara la scheda</button>
    </form>`;
  }

  $("#f-acq").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = ev.submitter;
    let richiesta;
    S.fotoOriginali = [];
    try {
      if (modo === "link") {
        const url = $("#url").value.trim();
        const video = $("#video")?.files?.[0];
        if (video) {
          if (video.size > 18 * 1024 * 1024) return toast("Il video supera 18 MB: accorcialo o usa una qualità più bassa.", "errore");
          richiesta = { modo: "video_file", url: url || null, video: { mime: video.type || "video/mp4", dati: await blobBase64(video) } };
        } else {
          if (!/^https?:\/\/\S+$/i.test(url)) return toast("Incolla un link completo, che inizi con https://", "errore");
          richiesta = { modo: "link", url, salva_foto: $("#salva-foto").checked };
        }
      } else if (modo === "foto") {
        const files = $("#pannello")._files();
        if (!files.length) return toast("Aggiungi almeno una foto.", "errore");
        occupato(btn, true, "Preparo le foto…");
        const piccole = await Promise.all(files.map((f) => comprimiImmagine(f)));
        if ($("#tieni-originali").checked) S.fotoOriginali = piccole;
        richiesta = { modo: "immagini", immagini: await Promise.all(piccole.map(async (b) => ({ mime: "image/jpeg", dati: await blobBase64(b) }))) };
      } else {
        const testo = $("#testo").value.trim();
        if (testo.length < 15) return toast("Il testo è troppo corto.", "errore");
        richiesta = { modo: "testo", testo };
      }
      occupato(btn, true, "GNAM sta leggendo…");
      mostraLettura(true);
      const out = await DB.ia(richiesta);
      S.bozza = { privata: false, ...out.bozza };
      S.esito = { completezza: out.completezza, avvisi: out.avvisi ?? [] };
      if (out.completezza === "insufficiente") {
        toast("In questo materiale non ho trovato una ricetta completa: controlla gli avvisi.", "errore");
      }
      vai("#/scrivi");
    } catch (e) {
      toast(e.message, "errore");
    } finally {
      occupato(btn, false); mostraLettura(false);
    }
  });
}

function mostraLettura(on) {
  let el = $("#lettura");
  if (on && !el) {
    el = document.createElement("div"); el.id = "lettura";
    el.innerHTML = `<div class="lettura-box"><img src="img/logo.svg" alt="" width="84" height="84"><p><b>GNAM sta leggendo la ricetta</b></p><p class="piccolo">Per un video può servire fino a un minuto.</p></div>`;
    document.body.append(el);
  } else if (!on && el) el.remove();
}

// ---------------------------------------------------------------------
//  EDITOR (nuova o modifica)
// ---------------------------------------------------------------------
async function vistaEditor(id) {
  let r;
  if (id) {
    r = await DB.ricetta(id);
    if (!r) return vai("#/");
    S.esito = null; S.fotoOriginali = [];
  } else {
    r = S.bozza ?? { titolo: "", tag: [], ingredienti: [{ quantita: null, unita: "g", nome: "", nota: "" }], passi: [""], fonte_tipo: "manuale", privata: false, porzioni: 4 };
  }
  const urls = await DB.urlFoto([r.foto_path].filter(Boolean));
  let fotoPath = r.foto_path ?? null;
  let fotoNuova = null;
  const tagScelti = new Set(r.tag ?? []);
  const tagCustom = [...tagScelti].filter((t) => !TAG_BASE.includes(t));

  vista.innerHTML = `
  <form class="editor" id="f-ricetta" novalidate>
    <div class="editor-testa">
      <a class="btn-icona" href="${id ? "#/ricetta/" + id : "#/nuova"}" aria-label="Annulla">${ICONE.indietro}</a>
      <h1>${id ? "Modifica ricetta" : "Nuova ricetta"}</h1>
    </div>

    ${S.esito && !id ? `<div class="avviso" data-livello="${esc(S.esito.completezza)}">
      <b>${S.esito.completezza === "completa" ? "Scheda pronta: controllala prima di salvare." : S.esito.completezza === "parziale" ? "Scheda incompleta: completa i campi mancanti." : "Non ho trovato una ricetta completa."}</b>
      ${S.esito.avvisi.length ? `<ul>${S.esito.avvisi.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
    </div>` : ""}

    <section class="carta campo-gruppo">
      <div class="foto-editor">
        <div class="foto-anteprima" id="foto-anteprima">${urls[fotoPath] ? `<img src="${esc(urls[fotoPath])}" alt="">` : segnaposto(r)}</div>
        <div>
          <label class="btn" for="foto-piatto">${ICONE.foto} ${fotoPath ? "Cambia foto" : "Aggiungi foto del piatto"}</label>
          <input type="file" id="foto-piatto" accept="image/*" hidden>
          <button type="button" class="btn-testo" data-azione="togli-foto" ${fotoPath ? "" : "hidden"}>Togli foto</button>
        </div>
      </div>
      <label for="titolo">Titolo</label>
      <input id="titolo" required maxlength="200" value="${esc(r.titolo)}" placeholder="Es. Parmigiana di melanzane">
      <label for="descrizione">Breve descrizione</label>
      <textarea id="descrizione" rows="2" maxlength="400" placeholder="Due righe per capire che piatto è">${esc(r.descrizione ?? "")}</textarea>
      <div class="griglia-campi">
        <div><label for="categoria">Categoria</label>
          <select id="categoria"><option value="">—</option>${CATEGORIE.map((c) => `<option ${r.categoria === c.nome ? "selected" : ""}>${c.nome}</option>`).join("")}</select></div>
        <div><label for="porzioni">Porzioni</label><input id="porzioni" type="number" min="1" max="99" inputmode="numeric" value="${r.porzioni ?? ""}"></div>
        <div><label for="tempo_prep">Preparazione (min)</label><input id="tempo_prep" type="number" min="0" inputmode="numeric" value="${r.tempo_prep ?? ""}"></div>
        <div><label for="tempo_cottura">Cottura (min)</label><input id="tempo_cottura" type="number" min="0" inputmode="numeric" value="${r.tempo_cottura ?? ""}"></div>
        <div><label for="tempo_riposo">Riposo / lievitazione (min)</label><input id="tempo_riposo" type="number" min="0" inputmode="numeric" value="${r.tempo_riposo ?? ""}"></div>
      </div>
      <div class="griglia-campi due">
        <fieldset><legend>Difficoltà</legend><div class="segmentato">
          ${[1, 2, 3].map((v) => `<label><input type="radio" name="difficolta" value="${v}" ${r.difficolta === v ? "checked" : ""}><span>${DIFFICOLTA[v]}</span></label>`).join("")}</div></fieldset>
        <fieldset><legend>Costo</legend><div class="segmentato">
          ${[1, 2, 3].map((v) => `<label><input type="radio" name="costo" value="${v}" ${r.costo === v ? "checked" : ""}><span>${COSTO[v]}</span></label>`).join("")}</div></fieldset>
      </div>
    </section>

    <section class="carta campo-gruppo">
      <h2>Tag</h2>
      <div class="chips" id="tag-chips">
        ${[...TAG_BASE, ...tagCustom].map((t) => `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="${tagScelti.has(t)}">${esc(t)}</button>`).join("")}
      </div>
      <div class="riga-input">
        <input id="nuovo-tag" placeholder="Aggiungi un tag (es. Ricetta di zia Rosa)" maxlength="40" aria-label="Nuovo tag">
        <button type="button" class="btn" data-azione="aggiungi-tag">Aggiungi</button>
      </div>
    </section>

    <section class="carta campo-gruppo">
      <h2>Ingredienti</h2>
      <p class="piccolo tenue">Lascia vuota la quantità e scegli “q.b.” per “quanto basta”. Usa le sezioni per dividere, per esempio, impasto e farcitura.</p>
      <datalist id="unita-lista">${UNITA.map((u) => `<option value="${u}">`).join("")}</datalist>
      <ul class="righe-ingredienti" id="righe-ingredienti"></ul>
      <div class="riga-azioni">
        <button type="button" class="btn" data-azione="aggiungi-ingrediente">${ICONE.piu} Ingrediente</button>
        <button type="button" class="btn" data-azione="aggiungi-sezione">${ICONE.piu} Sezione</button>
      </div>
    </section>

    <section class="carta campo-gruppo">
      <h2>Procedimento</h2>
      <ol class="righe-passi" id="righe-passi"></ol>
      <button type="button" class="btn" data-azione="aggiungi-passo">${ICONE.piu} Passo</button>
    </section>

    <section class="carta campo-gruppo">
      <h2>Note, fonte e visibilità</h2>
      <label for="note">Note e varianti</label>
      <textarea id="note" rows="3" placeholder="Consigli, sostituzioni, come conservarla">${esc(r.note ?? "")}</textarea>
      <div class="griglia-campi">
        <div><label for="fonte_tipo">Fonte</label><select id="fonte_tipo">${Object.entries(FONTI).map(([k, v]) => `<option value="${k}" ${r.fonte_tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div><label for="fonte_autore">Autore o sito</label><input id="fonte_autore" value="${esc(r.fonte_autore ?? "")}" placeholder="Es. Nonna Lina"></div>
      </div>
      <label for="fonte_url">Link al video o alla pagina</label>
      <input id="fonte_url" type="url" value="${esc(r.fonte_url ?? "")}" placeholder="https://…">
      ${r.testo_originale ? `<details><summary>Trascrizione originale</summary><pre>${esc(r.testo_originale)}</pre></details>` : ""}
      ${S.fotoOriginali.length ? `<p class="piccolo">${S.fotoOriginali.length} foto originali verranno salvate con la ricetta.</p>` : ""}
      <label class="spunta grande"><input type="checkbox" id="privata" ${r.privata ? "checked" : ""}> ${ICONE.lucchetto} Ricetta privata: la vedo solo io</label>
    </section>

    <div class="editor-piede">
      <a class="btn" href="${id ? "#/ricetta/" + id : "#/"}">Annulla</a>
      <button class="btn primario" type="submit">Salva ricetta</button>
    </div>
  </form>`;

  // --- ingredienti
  const ulI = $("#righe-ingredienti");
  const rigaI = (i = {}) => {
    const li = document.createElement("li");
    if (i.sezione !== undefined) {
      li.className = "riga-sezione";
      li.innerHTML = `<input class="i-sezione" value="${esc(i.sezione)}" placeholder="Nome sezione (es. Per la farcitura)" aria-label="Nome sezione">
        <span class="sposta"><button type="button" data-azione="su" aria-label="Sposta su">${ICONE.su}</button><button type="button" data-azione="giu" aria-label="Sposta giù">${ICONE.giu}</button></span>
        <button type="button" class="btn-icona piccola" data-azione="rimuovi" aria-label="Rimuovi">${ICONE.x}</button>`;
    } else {
      li.className = "riga-ingrediente";
      li.innerHTML = `<input class="i-qta" type="number" step="any" min="0" inputmode="decimal" value="${i.quantita ?? ""}" placeholder="Q.tà" aria-label="Quantità">
        <input class="i-unita" list="unita-lista" value="${esc(i.unita ?? "")}" placeholder="unità" aria-label="Unità">
        <input class="i-nome" value="${esc(i.nome ?? "")}" placeholder="Ingrediente" aria-label="Ingrediente">
        <input class="i-nota" value="${esc(i.nota ?? "")}" placeholder="Nota (facoltativa)" aria-label="Nota">
        <span class="sposta"><button type="button" data-azione="su" aria-label="Sposta su">${ICONE.su}</button><button type="button" data-azione="giu" aria-label="Sposta giù">${ICONE.giu}</button></span>
        <button type="button" class="btn-icona piccola" data-azione="rimuovi" aria-label="Rimuovi">${ICONE.x}</button>`;
    }
    return li;
  };
  (r.ingredienti?.length ? r.ingredienti : [{}]).forEach((i) => ulI.append(rigaI(i)));

  // --- passi
  const olP = $("#righe-passi");
  const rigaP = (t = "") => {
    const li = document.createElement("li");
    li.innerHTML = `<textarea class="p-testo" rows="2" placeholder="Descrivi questo passaggio" aria-label="Passo">${esc(t)}</textarea>
      <span class="sposta"><button type="button" data-azione="su" aria-label="Sposta su">${ICONE.su}</button><button type="button" data-azione="giu" aria-label="Sposta giù">${ICONE.giu}</button></span>
      <button type="button" class="btn-icona piccola" data-azione="rimuovi" aria-label="Rimuovi">${ICONE.x}</button>`;
    return li;
  };
  (r.passi?.length ? r.passi : [""]).forEach((p) => olP.append(rigaP(p)));

  // --- foto del piatto
  $("#foto-piatto").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    fotoNuova = await comprimiImmagine(f, 1400);
    $("#foto-anteprima").innerHTML = `<img src="${URL.createObjectURL(fotoNuova)}" alt="">`;
    $("[data-azione=togli-foto]").hidden = false;
  });

  vista.onclick = (e) => {
    const b = e.target.closest("[data-azione], [data-tag]");
    if (!b) return;
    if (b.dataset.tag) { const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", on); on ? tagScelti.add(b.dataset.tag) : tagScelti.delete(b.dataset.tag); return; }
    const az = b.dataset.azione, li = b.closest("li");
    if (az === "aggiungi-ingrediente") { const n = rigaI({ unita: "g" }); ulI.append(n); $(".i-nome", n).focus(); }
    if (az === "aggiungi-sezione") { const n = rigaI({ sezione: "" }); ulI.append(n); $(".i-sezione", n).focus(); }
    if (az === "aggiungi-passo") { const n = rigaP(); olP.append(n); $("textarea", n).focus(); }
    if (az === "rimuovi" && li) li.remove();
    if (az === "su" && li?.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
    if (az === "giu" && li?.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
    if (az === "togli-foto") { fotoNuova = null; fotoPath = null; $("#foto-anteprima").innerHTML = segnaposto(r); b.hidden = true; }
    if (az === "aggiungi-tag") aggiungiTag();
  };
  const aggiungiTag = () => {
    const t = $("#nuovo-tag").value.trim().replace(/\s+/g, " ");
    if (!t) return;
    const nome = t.charAt(0).toUpperCase() + t.slice(1);
    tagScelti.add(nome);
    if (!$(`[data-tag="${CSS.escape(nome)}"]`)) $("#tag-chips").insertAdjacentHTML("beforeend", `<button type="button" class="chip" data-tag="${esc(nome)}" aria-pressed="true">${esc(nome)}</button>`);
    else $(`[data-tag="${CSS.escape(nome)}"]`).setAttribute("aria-pressed", "true");
    $("#nuovo-tag").value = "";
  };
  $("#nuovo-tag").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); aggiungiTag(); } });

  $("#f-ricetta").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const titolo = $("#titolo").value.trim();
    if (!titolo) { $("#titolo").focus(); return toast("Dai un titolo alla ricetta.", "errore"); }
    const num = (sel) => { const v = $(sel).value; return v === "" ? null : Math.max(0, Math.round(Number(v))); };
    const ingredienti = $$("#righe-ingredienti > li").map((li) => {
      if (li.classList.contains("riga-sezione")) { const s = $(".i-sezione", li).value.trim(); return s ? { sezione: s } : null; }
      const nome = $(".i-nome", li).value.trim(); if (!nome) return null;
      const q = $(".i-qta", li).value;
      const unita = $(".i-unita", li).value.trim();
      return { quantita: q === "" ? null : Number(q), unita: q === "" && !unita ? "q.b." : unita, nome, nota: $(".i-nota", li).value.trim() };
    }).filter(Boolean);
    const passi = $$(".p-testo").map((t) => t.value.trim()).filter(Boolean);
    const btn = ev.submitter; occupato(btn, true, "Salvo…");
    try {
      if (fotoNuova) {
        if (r.foto_path && r.foto_path !== fotoPath) { /* già tolta */ }
        fotoPath = await DB.caricaFoto(fotoNuova, "piatti");
      }
      if (r.foto_path && r.foto_path !== fotoPath && id) DB.eliminaFoto(r.foto_path).catch(() => {});
      const originali = [...(r.foto_originali ?? [])];
      for (const b of S.fotoOriginali) originali.push(await DB.caricaFoto(b, "appunti"));
      const dati = {
        id: id || undefined,
        titolo,
        descrizione: $("#descrizione").value.trim() || null,
        categoria: $("#categoria").value || null,
        tag: [...tagScelti],
        porzioni: num("#porzioni") || null,
        tempo_prep: num("#tempo_prep"), tempo_cottura: num("#tempo_cottura"), tempo_riposo: num("#tempo_riposo"),
        difficolta: Number($("[name=difficolta]:checked")?.value) || null,
        costo: Number($("[name=costo]:checked")?.value) || null,
        ingredienti, passi,
        note: $("#note").value.trim() || null,
        fonte_tipo: $("#fonte_tipo").value,
        fonte_url: $("#fonte_url").value.trim() || null,
        fonte_autore: $("#fonte_autore").value.trim() || null,
        lingua_originale: r.lingua_originale ?? "it",
        testo_originale: r.testo_originale ?? null,
        foto_path: fotoPath,
        foto_originali: originali,
        privata: $("#privata").checked,
      };
      if (!id) delete dati.id;
      const salvata = await DB.salvaRicetta(dati);
      S.bozza = null; S.esito = null; S.fotoOriginali = [];
      S.caricato = false;
      toast("Ricetta salvata");
      vai("#/ricetta/" + salvata.id);
    } catch (e) {
      toast(e.message, "errore");
    } finally { occupato(btn, false); }
  });
}

// ---------------------------------------------------------------------
//  STAMPA (anteprima + stampa / PDF)
// ---------------------------------------------------------------------
async function vistaStampa(id, formato) {
  const r = await DB.ricetta(id);
  if (!r) return vai("#/");
  const urls = await DB.urlFoto([r.foto_path].filter(Boolean));
  const a5 = formato === "a5";
  vista.innerHTML = `
  <section class="stampa-controlli">
    <a class="btn-icona" href="#/ricetta/${r.id}" aria-label="Torna alla ricetta">${ICONE.indietro}</a>
    <div class="segmentato" role="group" aria-label="Formato">
      <a href="#/stampa/${r.id}/a4" aria-pressed="${!a5}">A4 con foto</a>
      <a href="#/stampa/${r.id}/a5" aria-pressed="${a5}">Scheda A5</a>
    </div>
    <button class="btn primario" data-azione="stampa">${ICONE.stampa} Stampa o salva PDF</button>
    <p class="piccolo tenue">Per il PDF scegli “Salva come PDF” come stampante.</p>
  </section>
  <div class="foglio-cornice">
    <article class="foglio ${a5 ? "a5" : "a4"}">
      <header class="foglio-testa">
        <div>
          <p class="foglio-cat">${esc(r.categoria ?? "")}</p>
          <h1>${esc(r.titolo)}</h1>
          ${r.descrizione ? `<p class="foglio-descr">${esc(r.descrizione)}</p>` : ""}
        </div>
        <img class="foglio-logo" src="img/logo.svg" alt="GNAM" width="40" height="40">
      </header>
      ${!a5 && urls[r.foto_path] ? `<img class="foglio-foto" src="${esc(urls[r.foto_path])}" alt="">` : ""}
      <p class="foglio-dati">
        ${[r.porzioni && `${r.porzioni} porzioni`, r.tempo_prep && `Prep. ${minuti(r.tempo_prep)}`, r.tempo_cottura && `Cottura ${minuti(r.tempo_cottura)}`,
          r.tempo_riposo && `Riposo ${minuti(r.tempo_riposo)}`, r.difficolta && DIFFICOLTA[r.difficolta], r.costo && `Costo ${COSTO[r.costo].toLowerCase()}`].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("")}
      </p>
      <div class="foglio-corpo">
        <section class="foglio-ingr">
          <h2>Ingredienti</h2>
          <ul>${(r.ingredienti ?? []).map((i) => {
            if (i.sezione) return `<li class="sezione">${esc(i.sezione)}</li>`;
            const x = rigaIngrediente(i); return `<li><b>${esc(x.qta)}</b> ${esc(x.nome)}${x.nota ? ` <i>(${esc(x.nota)})</i>` : ""}</li>`;
          }).join("")}</ul>
        </section>
        <section class="foglio-passi">
          <h2>Procedimento</h2>
          <ol>${(r.passi ?? []).map((p) => `<li>${esc(p)}</li>`).join("")}</ol>
          ${r.note ? `<h3>Note</h3><p>${esc(r.note)}</p>` : ""}
        </section>
      </div>
      <footer class="foglio-piede">
        <span>${(r.tag ?? []).map(esc).join(" · ")}</span>
        <span>${r.fonte_autore ? esc(r.fonte_autore) : ""}${r.fonte_url ? ` · ${esc(r.fonte_url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60))}` : ""}</span>
      </footer>
    </article>
  </div>`;
  impostaPagina(a5 ? "A5" : "A4");
  vista.onclick = (e) => {
    if (e.target.closest("[data-azione=stampa]")) {
      if (DB.demo && window.self !== window.top) return toast("In questa anteprima la stampa è disattivata: funziona nell'app pubblicata.", "errore");
      window.print();
    }
  };
}

function impostaPagina(formato) {
  let st = $("#stile-pagina");
  if (!st) { st = document.createElement("style"); st.id = "stile-pagina"; document.head.append(st); }
  st.textContent = `@page { size: ${formato}; margin: ${formato === "A5" ? "10mm" : "14mm"}; }`;
}

// ---------------------------------------------------------------------
//  LISTA DELLA SPESA
// ---------------------------------------------------------------------
async function vistaSpesa() {
  vista.innerHTML = `
  <section class="spesa">
    <div class="titolo-riga"><h1>Lista della spesa</h1><button class="btn" data-azione="copia">${ICONE.copia} Copia</button></div>
    <p class="tenue">Condivisa da tutta la famiglia. Aggiungi gli ingredienti da una ricetta o scrivili qui.</p>
    <form class="riga-input carta" id="f-voce" novalidate>
      <input id="voce" placeholder="Es. 1 kg di farina" aria-label="Nuova voce" autocomplete="off">
      <button class="btn primario" type="submit">Aggiungi</button>
    </form>
    <ul class="lista-spesa carta" id="lista-spesa"></ul>
    <div class="riga-azioni" id="azioni-spesa"></div>
    <div class="conferma" id="conferma-svuota" hidden>
      <p>Svuotare tutta la lista? L'operazione vale per tutta la famiglia.</p>
      <button class="btn pericolo" data-azione="svuota-si">Sì, svuota</button>
      <button class="btn" data-azione="svuota-no">Annulla</button>
    </div>
  </section>`;
  let voci = [];
  const disegna = async () => {
    voci = await DB.spesa();
    const ordinate = [...voci].sort((a, b) => (a.fatto - b.fatto) || a.voce.localeCompare(b.voce, "it"));
    $("#lista-spesa").innerHTML = ordinate.length ? ordinate.map((v) => `
      <li class="${v.fatto ? "fatto" : ""}">
        <label><input type="checkbox" data-id="${v.id}" ${v.fatto ? "checked" : ""}>
          <span class="qta">${esc([formattaQuantita(v.quantita, v.unita), v.unita].filter(Boolean).join(" "))}</span>
          <span class="nome">${esc(v.voce)}${v.ricetta_titolo ? `<small>${esc(v.ricetta_titolo)}</small>` : ""}</span></label>
        <button class="btn-icona piccola" data-togli="${v.id}" aria-label="Togli ${esc(v.voce)}">${ICONE.x}</button>
      </li>`).join("") : `<li class="vuoto-lista">La lista è vuota. Apri una ricetta e tocca “Aggiungi alla lista della spesa”.</li>`;
    const fatte = voci.filter((v) => v.fatto).length;
    $("#azioni-spesa").innerHTML = voci.length ? `
      ${fatte ? `<button class="btn" data-azione="togli-fatte">Togli le ${fatte} spuntate</button>` : ""}
      <button class="btn pericolo" data-azione="svuota">Svuota lista</button>` : "";
  };
  await disegna();

  $("#f-voce").addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = $("#voce").value.trim(); if (!t) return;
    const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|l|pz|cucchiai|cucchiaini|confezioni?|bottiglie?)?\s+(?:di\s+)?(.+)$/i);
    const voce = m ? { voce: m[3], quantita: Number(m[1].replace(",", ".")), unita: (m[2] || "").toLowerCase().replace("gr", "g") } : { voce: t, quantita: null, unita: "" };
    await DB.aggiungiSpesa([voce]); $("#voce").value = ""; disegna();
  });
  vista.onchange = async (e) => {
    const id = e.target.dataset.id; if (!id) return;
    await DB.aggiornaSpesa(id, { fatto: e.target.checked }); disegna();
  };
  vista.onclick = async (e) => {
    const t = e.target.closest("[data-togli]")?.dataset.togli;
    if (t) { await DB.eliminaSpesa([t]); return disegna(); }
    const az = e.target.closest("[data-azione]")?.dataset.azione;
    if (az === "togli-fatte") { await DB.eliminaSpesa(voci.filter((v) => v.fatto).map((v) => v.id)); disegna(); }
    if (az === "svuota") $("#conferma-svuota").hidden = false;
    if (az === "svuota-no") $("#conferma-svuota").hidden = true;
    if (az === "svuota-si") { await DB.eliminaSpesa(voci.map((v) => v.id)); $("#conferma-svuota").hidden = true; disegna(); }
    if (az === "copia") {
      const testo = voci.filter((v) => !v.fatto).map((v) => `• ${[formattaQuantita(v.quantita, v.unita), v.unita].filter(Boolean).join(" ")} ${v.voce}`.replace(/\s+/g, " ")).join("\n");
      if (!testo) return toast("Non c'è niente da copiare.");
      try { await navigator.clipboard.writeText("Lista della spesa\n" + testo); toast("Lista copiata: incollala in WhatsApp o nelle note"); }
      catch { toast("Copia non riuscita: tieni premuto sul testo per copiarlo.", "errore"); }
    }
  };
}

// ---------------------------------------------------------------------
//  FAMIGLIA E PROFILO
// ---------------------------------------------------------------------
async function vistaFamiglia() {
  S.familiari = await DB.familiari();
  const admin = S.io.is_admin;
  vista.innerHTML = `
  <section class="famiglia">
    <h1>Famiglia</h1>
    <form class="carta pannello" id="f-nome" novalidate>
      <h2>Il tuo profilo</h2>
      <label for="mio-nome">Nome visibile agli altri</label>
      <div class="riga-input"><input id="mio-nome" value="${esc(S.io.nome ?? "")}" maxlength="40"><button class="btn" type="submit">Salva</button></div>
      <p class="piccolo tenue">${esc(S.io.email ?? "")}${admin ? " · amministratore" : ""}</p>
    </form>

    <div class="carta pannello">
      <h2>Chi usa GNAM</h2>
      <ul class="familiari">
        ${S.familiari.map((f) => `<li>
          <span class="avatar" data-colore="${["accent", "basil", "plum", "sky", "lemon"][f.nome?.length % 5 || 0]}">${esc((f.nome || f.email || "?").charAt(0).toUpperCase())}</span>
          <span class="chi"><b>${esc(f.nome || "—")}${f.id === S.io.id ? " (tu)" : ""}</b><small>${esc(f.email ?? "")}</small></span>
          ${f.is_admin ? `<span class="pill neutro">Amministratore</span>` : ""}
          ${admin && f.id !== S.io.id ? `<button class="btn-testo" data-admin="${f.id}" data-valore="${!f.is_admin}">${f.is_admin ? "Togli ruolo" : "Rendi amministratore"}</button>` : ""}
        </li>`).join("")}
      </ul>
    </div>

    ${admin ? `<form class="carta pannello" id="f-invito" novalidate>
      <h2>Invita un familiare</h2>
      <p class="piccolo tenue">Riceverà un'email con il link per entrare. Solo le persone invitate possono accedere.</p>
      <div class="griglia-campi due">
        <div><label for="inv-nome">Nome</label><input id="inv-nome" maxlength="40" placeholder="Es. Giulia"></div>
        <div><label for="inv-email">Email</label><input id="inv-email" type="email" inputmode="email" placeholder="nome@esempio.it"></div>
      </div>
      <button class="btn primario" type="submit">Manda l'invito</button>
    </form>` : ""}

    <div class="carta pannello">
      <h2>Installa sul telefono</h2>
      <p><b>iPhone:</b> apri GNAM in Safari, tocca Condividi e poi “Aggiungi alla schermata Home”.<br>
      <b>Android:</b> apri GNAM in Chrome, tocca il menu ⋮ e poi “Installa app”.</p>
    </div>

    <button class="btn largo" data-azione="esci">Esci da GNAM</button>
    ${DB.demo ? `<p class="piccolo tenue centrato">Modalità dimostrativa: i dati sono salvati solo in questo browser.</p>` : ""}
  </section>`;

  $("#f-nome").addEventListener("submit", async (e) => {
    e.preventDefault();
    const n = $("#mio-nome").value.trim(); if (!n) return;
    try { await DB.cambiaNome(n); S.io.nome = n; aggiornaChrome("famiglia"); toast("Nome aggiornato"); vistaFamiglia(); }
    catch (er) { toast(er.message, "errore"); }
  });
  $("#f-invito")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#inv-email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Scrivi un indirizzo email valido.", "errore");
    const btn = e.submitter; occupato(btn, true, "Invio…");
    try { await DB.invita(email, $("#inv-nome").value.trim()); toast(`Invito mandato a ${email}`); e.target.reset(); }
    catch (er) { toast(er.message, "errore"); }
    occupato(btn, false);
  });
  vista.onclick = async (e) => {
    const a = e.target.closest("[data-admin]");
    if (a) { try { await DB.impostaAdmin(a.dataset.admin, a.dataset.valore === "true"); toast("Ruolo aggiornato"); vistaFamiglia(); } catch (er) { toast(er.message, "errore"); } }
    if (e.target.closest("[data-azione=esci]")) { await DB.esci(); S.io = null; S.caricato = false; vai("#/accedi"); }
  };
}

// ---------------------------------------------------------------------
//  Utilità d'interfaccia
// ---------------------------------------------------------------------
function occupato(btn, on, testo) {
  if (!btn) return;
  if (on) { btn.dataset.testo ??= btn.innerHTML; btn.disabled = true; if (testo) btn.textContent = testo; btn.classList.add("occupato"); }
  else { btn.disabled = false; if (btn.dataset.testo) btn.innerHTML = btn.dataset.testo; delete btn.dataset.testo; btn.classList.remove("occupato"); }
}

let blocco = null;
async function tieniSchermo() {
  try { blocco = await navigator.wakeLock?.request("screen"); if (!blocco) throw 0; toast("Lo schermo resterà acceso mentre cucini"); }
  catch { toast("Questo dispositivo non permette di tenere lo schermo acceso.", "errore"); const c = $("#schermo-acceso"); if (c) c.checked = false; }
}
function rilasciaSchermo() { blocco?.release?.().catch(() => {}); blocco = null; }

function registraServiceWorker() {
  if (!("serviceWorker" in navigator) || DB.demo && window.self !== window.top) return;
  navigator.serviceWorker.register("sw.js").catch(() => { /* non disponibile in questo contesto */ });
}

// Clic globali (presenti in più viste)
document.addEventListener("click", async (e) => {
  const az = e.target.closest("[data-azione]")?.dataset.azione;
  if (az === "entra-demo") { S.io = await DB.entraDemo(); S.caricato = false; vai("#/"); }
  if (az === "cambia-email") { $("#f-codice").hidden = true; $("#f-email").hidden = false; }
  if (az === "azzera-filtri") { S.filtri = { q: "", cat: "", tag: "", solo: "" }; vistaRicettario(); }
});

avvia();
