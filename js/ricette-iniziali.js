// Ricette iniziali di GNAM (dai link salvati da Fabio).
// Ingredienti e dosi come da fonte; procedimento riscritto con parole nostre.
// Usate dalla modalità dimostrativa e dallo script SQL 02_ricette_iniziali.sql.

export const RICETTE_INIZIALI = [
  {
    titolo: "Olive nere al forno",
    descrizione: "Olive fresche sbollentate e infornate con aglio, origano e un filo d'olio: si raggrinziscono e diventano uno stuzzichino amarognolo perfetto per l'aperitivo.",
    categoria: "Antipasto",
    tag: ["Aperitivo", "Al forno", "Vegano", "Della tradizione", "Economico", "Autunno"],
    porzioni: 6,
    tempo_prep: 10,
    tempo_cottura: 40,
    tempo_riposo: null,
    difficolta: 1,
    costo: 1,
    ingredienti: [
      { quantita: 1, unita: "kg", nome: "olive nere grandi", nota: "fresche, sane e mature" },
      { quantita: 4, unita: "cucchiai", nome: "olio extravergine d'oliva", nota: "circa 3-4" },
      { quantita: 5, unita: "spicchi", nome: "aglio", nota: "4 o 5" },
      { quantita: null, unita: "q.b.", nome: "origano secco", nota: "" },
      { quantita: null, unita: "q.b.", nome: "peperoncino secco", nota: "facoltativo" },
      { quantita: null, unita: "q.b.", nome: "sale", nota: "" },
      { quantita: null, unita: "q.b.", nome: "pepe", nota: "" }
    ],
    passi: [
      "Lava bene le olive. Porta a bollore una pentola d'acqua, tuffaci le olive e lasciale cuocere 5 minuti.",
      "Scolale e asciugale con cura usando uno strofinaccio pulito.",
      "In una ciotola condiscile con l'olio, mescolando finché sono tutte lucide.",
      "Stendile su una teglia coperta di carta forno; aggiungi sale, pepe, origano, gli spicchi d'aglio e, se ti piace, il peperoncino.",
      "Cuoci in forno statico a 160 °C per circa 40 minuti, girandole ogni tanto perché si insaporiscano in modo uniforme. Sono pronte quando la buccia è raggrinzita.",
      "Lasciale raffreddare e servile all'aperitivo."
    ],
    note: "Si trovano fresche al mercato in autunno. In frigo, in un contenitore ermetico, durano qualche giorno; coperte d'olio in un vasetto durano di più. Controllale in forno perché non si secchino troppo.",
    fonte_tipo: "web",
    fonte_url: "https://www.cucchiaio.it/ricetta/olive-nere-al-forno/",
    fonte_autore: "Il Cucchiaio d'Argento"
  },
  {
    titolo: "Focaccia pugliese con patate",
    descrizione: "La focaccia barese della rosticceria: impasto morbido con patata lessa e semola, pomodorini e origano sopra, fondo croccante d'olio.",
    categoria: "Pane e lievitati",
    tag: ["Al forno", "Vegano", "Della tradizione", "Si prepara prima", "Economico"],
    porzioni: 4,
    tempo_prep: 40,
    tempo_cottura: 30,
    tempo_riposo: 240,
    difficolta: 2,
    costo: 1,
    ingredienti: [
      { sezione: "Per l'impasto" },
      { quantita: 1, unita: "pz", nome: "patata", nota: "da circa 200 g" },
      { quantita: 200, unita: "g", nome: "farina di grano tenero tipo 0", nota: "" },
      { quantita: 300, unita: "g", nome: "semola di grano duro rimacinata", nota: "" },
      { quantita: 12, unita: "g", nome: "lievito di birra fresco", nota: "oppure 4 g di lievito secco" },
      { quantita: 300, unita: "ml", nome: "acqua", nota: "tiepida d'inverno, fresca d'estate" },
      { quantita: 4, unita: "cucchiai", nome: "olio extravergine d'oliva", nota: "3-4 cucchiai" },
      { quantita: null, unita: "q.b.", nome: "sale", nota: "" },
      { sezione: "Per la farcitura" },
      { quantita: 10, unita: "pz", nome: "pomodorini ciliegia", nota: "anche di più, a piacere" },
      { quantita: 1, unita: "pizzico", nome: "origano", nota: "" },
      { quantita: null, unita: "q.b.", nome: "olio extravergine d'oliva", nota: "anche per la teglia" },
      { quantita: null, unita: "q.b.", nome: "sale", nota: "" }
    ],
    passi: [
      "Lessa la patata, sbucciala e schiacciala con lo schiacciapatate o con una forchetta: è il segreto per un impasto morbido che si conserva bene.",
      "Sciogli il lievito in un po' dell'acqua. In una ciotola capiente unisci patata, semola, farina, lievito sciolto, olio e sale.",
      "Aggiungi il resto dell'acqua poco alla volta e impasta a mano finché ottieni una massa morbida ed elastica.",
      "Copri la ciotola con un canovaccio o una coperta e lascia lievitare al caldo per circa 4 ore, finché l'impasto è ben cresciuto.",
      "Ungi abbondantemente una teglia tonda di alluminio da 28-30 cm, bordi compresi. Adagia l'impasto, giralo per ungere entrambi i lati e allargalo con i polpastrelli.",
      "Distribuisci sopra i pomodorini tagliati a metà, poi condisci con olio, sale e origano. Non serve una seconda lievitazione.",
      "Cuoci in forno statico preriscaldato a 220 °C, abbassando a 200 °C, per circa 30 minuti, finché la superficie è dorata.",
      "Sforna e lascia intiepidire fuori dal forno, a temperatura ambiente."
    ],
    note: "Con il caldo serve meno lievito e la lievitazione è più rapida. Con il lievito istantaneo in polvere ne bastano 14-15 g e l'impasto va subito in teglia. Ottima farcita con provolone e mortadella.",
    fonte_tipo: "web",
    fonte_url: "https://www.puglia.com/focaccia-pugliese/",
    fonte_autore: "Puglia.com"
  },
  {
    titolo: "Patate alla calabrisella al forno",
    descrizione: "Spicchi di patate, cipolle bianche e datterini al forno con salvia, origano e rosmarino: un contorno rustico che va bene caldo o tiepido.",
    categoria: "Contorno",
    tag: ["Al forno", "Vegano", "Senza glutine", "Della tradizione", "Economico"],
    porzioni: 4,
    tempo_prep: 15,
    tempo_cottura: 25,
    tempo_riposo: 30,
    difficolta: 1,
    costo: 1,
    ingredienti: [
      { quantita: 1, unita: "kg", nome: "patate", nota: "a spicchi" },
      { quantita: 2, unita: "pz", nome: "cipolle bianche grandi", nota: "" },
      { quantita: 300, unita: "g", nome: "pomodorini datterini", nota: "" },
      { quantita: null, unita: "q.b.", nome: "salvia, origano e rosmarino", nota: "freschi o secchi" },
      { quantita: null, unita: "q.b.", nome: "olio extravergine d'oliva", nota: "abbondante" },
      { quantita: null, unita: "q.b.", nome: "sale", nota: "" },
      { quantita: null, unita: "q.b.", nome: "pepe", nota: "" }
    ],
    passi: [
      "Sbuccia le cipolle e affettale non troppo sottili. Mettile a bagno in acqua fredda per circa 30 minuti, così diventano più delicate, poi scolale e asciugale con carta da cucina.",
      "Sbuccia le patate e tagliale a spicchi di media grandezza, così non si sfaldano in cottura. Sciacquale e asciugale molto bene con un canovaccio.",
      "Lava i datterini e tagliali in quattro.",
      "In una ciotola grande unisci patate, cipolle e pomodorini. Condisci con molto olio, sale, pepe e le erbe, e mescola bene con le mani perché si insaporisca tutto.",
      "Stendi le verdure in un solo strato in una teglia ampia, senza ammassarle.",
      "Cuoci in forno statico preriscaldato a 200 °C per circa 25 minuti, finché sono dorate. Controlla la cottura delle patate con una forchetta e servi calde o a temperatura ambiente."
    ],
    note: "L'ammollo evita che le cipolle brucino prima che le patate siano cotte. Asciugare bene le patate le rende più croccanti.",
    fonte_tipo: "web",
    fonte_url: "https://www.piuricette.it/patate-alla-calabrisella-al-forno/",
    fonte_autore: "Imma Bartolo · Più Ricette"
  }
];
