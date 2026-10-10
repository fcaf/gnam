# GNAM · Guida all'installazione

**GNAM — Gusti Nostri, Archivio Multimediale**
Tempo totale: circa 45 minuti, una volta sola. Tutto con piani gratuiti.

Servono quattro servizi:

| Servizio | A cosa serve | Account |
|---|---|---|
| **Supabase** | database delle ricette, foto, accessi, funzioni server | già ce l'hai |
| **Google AI Studio** | chiave Gemini per leggere video, foto e testi | il tuo account Google |
| **Gmail** (o Brevo) | spedire le email di accesso | il tuo account Google |
| **GitHub Pages** | pubblicare l'app su `https://fcaf.github.io/gnam/` | `fcaf` |

Contenuto della cartella:

```
gnam/
├── index.html, manifest.webmanifest, sw.js   ← l'app
├── css/  js/  img/                            ← stile, codice, logo e icone
├── js/config.js                               ← QUI vanno i due valori di Supabase
├── supabase/01_schema.sql                     ← database e regole di sicurezza
├── supabase/02_ricette_iniziali.sql           ← le prime 3 ricette
└── supabase/functions/gnam-ai, invita-utente  ← funzioni server
```

---

## 1. Supabase: database e sicurezza

1. Vai su [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
   Nome `gnam`, regione **Central EU (Frankfurt)**, scegli una password del database e conservala.
2. Quando il progetto è pronto: menu **SQL Editor** → **New query** → incolla tutto il file
   `supabase/01_schema.sql` → **Run**. Deve comparire *Success*.
3. Menu **Authentication → Sign In / Providers**:
   - **Email**: attivo.
   - **Allow new users to sign up**: **disattivato**. Così entra solo chi inviti tu.
4. Menu **Authentication → URL Configuration**:
   - **Site URL**: `https://fcaf.github.io/gnam/`
   - **Redirect URLs**: aggiungi `https://fcaf.github.io/gnam/`
5. Menu **Project Settings → API** (o **API Keys**): copia
   - **Project URL** (es. `https://abcdefgh.supabase.co`)
   - la chiave **anon public** (o **publishable**). Non usare mai la *service_role* / *secret*.

## 2. Email di accesso (obbligatorio)

Il servizio email incluso in Supabase spedisce **solo agli indirizzi del team del progetto** e
al massimo 2 email l'ora: la tua famiglia non riceverebbe nulla. Serve un server di posta tuo,
gratuito. Il più semplice è Gmail.

1. Sul tuo account Google attiva la **verifica in due passaggi** (se non c'è già).
2. Vai su [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords),
   crea una password per app chiamata `GNAM` e copia i 16 caratteri.
3. Supabase → **Authentication → Emails → SMTP Settings** → **Enable custom SMTP**:

   | Campo | Valore |
   |---|---|
   | Sender email | `f.caffio@gmail.com` |
   | Sender name | `GNAM` |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | `f.caffio@gmail.com` |
   | Password | la password per app di 16 caratteri |

4. Supabase → **Authentication → Emails → Templates**. Sostituisci due modelli.

   **Magic Link** — oggetto: `Il tuo accesso a GNAM`
   ```html
   <h2>Ciao!</h2>
   <p>Tocca qui per entrare in GNAM:</p>
   <p><a href="{{ .ConfirmationURL }}">Entra in GNAM</a></p>
   <p>Se usi GNAM installato sul telefono, inserisci invece questo codice:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>Il codice scade dopo un'ora.</p>
   ```

   **Invite user** — oggetto: `Sei invitato nel ricettario GNAM`
   ```html
   <h2>Benvenuto in GNAM</h2>
   <p>Ti hanno invitato nel ricettario di famiglia.</p>
   <p><a href="{{ .ConfirmationURL }}">Accetta l'invito ed entra</a></p>
   <p>Le volte successive entrerai con la tua email dalla pagina di accesso.</p>
   ```

> **Perché il codice?** Su iPhone l'app installata e Safari hanno memorie separate: il link
> apre Safari, il codice invece si digita direttamente nell'app. Così l'accesso funziona sempre.

> **Alternativa a Gmail:** [Brevo](https://www.brevo.com) (300 email al giorno gratis):
> host `smtp-relay.brevo.com`, porta `587`, credenziali da *Settings → SMTP & API*.

## 3. Chiave Gemini (lettura di video, foto e testi)

**L'abbonamento Gemini Pro non si usa per le app**: Google tiene separati l'abbonamento
personale e le API per sviluppatori. Serve una chiave API, che è gratuita.

1. Vai su [aistudio.google.com](https://aistudio.google.com) con il tuo account Google.
2. **Get API key** → **Create API key** → copia la chiave.
3. **Non** collegare un account di fatturazione: così resti nel piano gratuito e non paghi nulla.
   Se superi i limiti giornalieri, GNAM ti avvisa di riprovare più tardi.

Nota sulla riservatezza: nel piano gratuito Google può usare i contenuti inviati per
migliorare i suoi servizi. Per ricette va bene; evita foto con documenti o dati personali.

## 4. Funzioni server su Supabase

Ripeti per le due funzioni, **gnam-ai** e **invita-utente**:

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nome: esattamente `gnam-ai` (poi `invita-utente`).
3. Cancella il codice di esempio e incolla il contenuto di
   `supabase/functions/<nome>/index.ts` → **Deploy function**.

Poi **Edge Functions → Secrets** → aggiungi:

| Nome | Valore |
|---|---|
| `GEMINI_API_KEY` | la chiave del punto 3 |
| `GNAM_URL` | `https://fcaf.github.io/gnam/` |
| `GEMINI_MODEL` | facoltativo; lascia vuoto per usare `gemini-flash-latest` |

Se più avanti una lettura dà errore *Invalid JWT*: apri la funzione → **Details** → disattiva
**Enforce JWT verification** (o *Verify JWT*) e salva. Le funzioni controllano comunque da sole
che chi le chiama sia un familiare autenticato.

## 5. Pubblicazione su GitHub Pages

1. Su [github.com/new](https://github.com/new): nome repository `gnam`, **Public**, crea.
2. Nella pagina del repository: **Add file → Upload files**. Trascina **il contenuto** della
   cartella `gnam` (non la cartella stessa): `index.html`, `css`, `js`, `img`, `supabase`, ecc.
   → **Commit changes**.
3. Apri `js/config.js` nel repository → icona matita → incolla i due valori del punto 1.5:
   ```js
   window.GNAM_CONFIG = {
     supabaseUrl: "https://abcdefgh.supabase.co",
     supabaseAnonKey: "eyJhbGciOi... oppure sb_publishable_...",
   };
   ```
   → **Commit changes**.
4. **Settings → Pages** → *Source*: **Deploy from a branch**, branch **main**, cartella **/ (root)** → **Save**.
5. Dopo un paio di minuti l'app è su **https://fcaf.github.io/gnam/**.

## 6. Primo accesso e ricette iniziali

1. Le iscrizioni sono chiuse, quindi crea il tuo utente: Supabase → **Authentication → Users →
   Add user → Send invitation** con la tua email. Apri l'email e accetta.
   *Il primo utente diventa automaticamente amministratore.*
2. Apri GNAM, scrivi la tua email, inserisci il codice o tocca il link.
3. Supabase → **SQL Editor** → incolla `supabase/02_ricette_iniziali.sql` → **Run**.
   Nel ricettario compaiono olive nere al forno, focaccia pugliese e patate alla calabrisella.
4. In GNAM → **Famiglia → Invita un familiare** per gli altri due componenti.
5. Prova l'importazione con i due link che mancano (il secondo `share.google` e il reel Facebook).
   Per il reel: se GNAM legge solo la didascalia, scarica il video e usa **Carica il video**.

## 7. Installare sul telefono

- **iPhone**: apri il sito in **Safari** → Condividi → **Aggiungi alla schermata Home**.
- **Android**: apri il sito in **Chrome** → menu ⋮ → **Installa app**.

---

## Limiti dei piani gratuiti

| Servizio | Limite | Cosa succede |
|---|---|---|
| Supabase | il progetto si mette in pausa dopo 7 giorni senza alcun uso | dalla dashboard: **Restore project**; i dati restano |
| Supabase | 500 MB di database, 1 GB di foto | migliaia di ricette: le foto vengono ridotte prima del caricamento |
| Gemini | richieste al giorno limitate | messaggio "quota esaurita": riprova più tardi |
| Video caricati | circa 18 MB | per video più lunghi usa il link YouTube o accorcia il video |
| Gmail SMTP | circa 500 email al giorno | più che sufficiente per una famiglia |

## Problemi frequenti

| Sintomo | Soluzione |
|---|---|
| "Questa email non è abilitata" | invita la persona da **Famiglia** o da Supabase → Authentication → Users |
| L'email non arriva | controlla lo spam e le impostazioni SMTP del punto 2 |
| Il link apre il sito ma non entra nell'app installata | usa il codice a 6 cifre dell'email |
| "Il servizio di lettura non risponde" | verifica che la funzione si chiami esattamente `gnam-ai` e che il segreto `GEMINI_API_KEY` ci sia |
| Errore Gemini 404 sul modello | imposta il segreto `GEMINI_MODEL` con un modello disponibile in AI Studio |
| Dopo un aggiornamento vedo la versione vecchia | chiudi e riapri l'app; su computer ricarica con Ctrl+F5 |
| Voglio aggiornare l'app | carica i file nuovi su GitHub con *Upload files*: sostituiscono i vecchi |
