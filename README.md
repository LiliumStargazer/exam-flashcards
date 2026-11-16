# Exam Flashcards — Ripasso esami

https://liliumstargazer.github.io/exam-flashcards/

Flashcard per preparare esami orali e scritti a risposta aperta. Per ogni domanda scrivi (o dici) la tua risposta, poi spunti i **concetti chiave** che hai espresso: il programma calcola la copertura, segna la domanda come *sicura*, *parziale* o *da rifare* e ti ripropone per prime quelle più deboli.

Funziona da telefono e da computer, senza account e senza server: è un sito statico pubblicato con GitHub Pages.

## Cosa contiene

```
index.html          la pagina
style.css           la grafica (modalità chiara e scura automatica)
app.js              la logica di interfaccia e valutazione
grading.js          rubriche essenziali, calcolo dei punteggi e ripasso
judge.js            controlli deterministici e verifica delle evidenze API
mazzi/indice.json   l’elenco dei mazzi disponibili
mazzi/*.json        un file per materia (un “mazzo”)
```

Il mazzo incluso è **Computer Forensics** (75 schede: 73 domande del riassunto discorsivo più 2 varianti/esercizi, con risposte modello).

## Pubblicarlo con GitHub Pages

1. Nel repository vai su **Settings → Pages**.
2. In **Build and deployment** scegli *Source: Deploy from a branch*, branch `main`, cartella `/ (root)`, e salva.
3. Dopo un paio di minuti il sito è online su `https://<tuo-utente>.github.io/exam-flashcards/`.
4. Dal telefono apri l’indirizzo e aggiungilo alla schermata Home (Safari: Condividi → Aggiungi a Home; Chrome: menu → Aggiungi a schermata Home).

## Come si usa

- **Studia**: scrivi la risposta, poi *Mostra i concetti chiave*, spunta quelli che hai espresso e *Salva e vai avanti*. Sotto c’è sempre la risposta modello completa.
  La copertura si calcola sui soli concetti **essenziali**. Risposta al 100% in un giorno = **da consolidare**; due risposte al 100% in giorni distinti = **sicura**; dal 45% al 99% = parziale; sotto il 45% = da rifare. Un errore essenziale segnalato dal modello limita il voto a 39%.
- **Definizioni**: nel filtro Argomento trovi **Solo definizioni (tutti gli argomenti)**, per iniziare il ripasso dai concetti di base.
- **Ripasso**: la modalità **Prima le più deboli** ripresenta le domande non consolidate e, dopo almeno 7 giorni, quelle già sicure.
- **Mappa**: un quadratino per domanda, colorato in base al risultato; la striscia gialla indica le domande ad alta priorità. Toccandolo apri la domanda.
- **Andamento**: totali per priorità e argomento, elenco delle domande da ripassare.
- **Impostazioni**: mazzi, progressi, valutazione automatica.

### Progressi

Sono salvati nel browser del dispositivo. Per passarli da un dispositivo all’altro usa *Esporta i progressi* (scarica un file JSON) e *Importa i progressi* sull’altro: per ogni domanda viene tenuto il risultato più recente.

## Valutazione delle risposte

Il programma funziona interamente con **regole JavaScript e API remote**: non scarica o avvia modelli AI locali nel browser o sul PC.

- **Comandi Linux** (schede 14, 15, 75): vengono riconosciuti e controllati con regole deterministiche quando la sintassi è inequivocabile. Il programma **non esegue mai** i comandi. Risposte in forma non standard ricadono sulla valutazione via API, se attiva.
- **Risposte aperte**: richiedono un servizio API configurato in **Impostazioni** (Groq, Gemini, OpenRouter, DeepSeek o un servizio compatibile OpenAI). Il nuovo valore predefinito per chi non ha già una configurazione è Groq con `openai/gpt-oss-120b`. Una configurazione esistente nel browser resta invariata.
- **Verifica per affermazioni**: il modello esamina tutti i concetti, assegnando per ciascuno `supported`, `partial`, `contradicted` o `absent`. Ogni giudizio diverso da `absent` deve riportare una citazione del testo scritto dallo studente; il programma ne verifica la corrispondenza letterale prima di assegnare punti.
- **Punteggio**: viene sempre calcolato da `grading.js`, non dal modello. Un concetto essenziale contraddetto limita la copertura al 39%; gli approfondimenti facoltativi non penalizzano.
- **JSON strutturato**: per i modelli Groq GPT-OSS 20B e 120B viene richiesto JSON Schema rigoroso, dove supportato dal provider. Gli altri provider ricevono istruzioni JSON testuali e la risposta viene comunque validata prima dell'uso.
- **Trasparenza**: per ogni concetto si mostrano la citazione e una spiegazione sintetica. Il docente AI può ancora sbagliare: puoi controllare e modificare le spunte.

**Privacy e costi:** le chiavi restano nel browser e vengono inviate solo al servizio che scegli. Non pubblicarle nel repository. Il piano gratuito e i limiti dipendono dal provider. Le risposte scritte vengono inviate al provider per la correzione. L'app è un sito statico, non necessita di un server applicativo.

## Test automatici

Con Node.js >= 18: `node --test tests/*.test.cjs`. I test controllano integrità del mazzo, rubrica delle domande brevi, penalità per errori concettuali e ripetizione in giorni differenti.

## Aggiungere una materia

Crea un file `mazzi/<id>.json` e aggiungilo a `mazzi/indice.json`:

```json
[
  { "file": "computer-forensics.json", "titolo": "Computer Forensics" },
  { "file": "diritto-privato.json", "titolo": "Diritto privato" }
]
```

In alternativa **trascina il file JSON** in qualsiasi punto della pagina, oppure toccalo nel riquadro *Impostazioni → Mazzi* per sceglierlo dal dispositivo (resta salvato solo in quel browser). Allo stesso modo puoi trascinare anche il file dei progressi esportato.

### Formato del mazzo

```json
{
  "id": "diritto-privato",
  "titolo": "Diritto privato",
  "descrizione": "Facoltativa: docente, anno, note.",
  "legenda_priorita": { "3": "★★★ chiesta spesso", "2": "★★ chiesta", "1": "★ mai chiesta" },
  "argomenti": { "A": "Fonti del diritto", "B": "Contratti" },
  "domande": [
    {
      "n": 1,
      "argomento": "A",
      "priorita": 3,
      "fonti": "Appello 12/06/2025",
      "domanda": "Testo della domanda, parola per parola come nella fonte",
      "varianti": [ { "fonte": "Appello 03/02/2026", "testo": "Altra formulazione della stessa domanda" } ],
      "concetti": [
        "Primo concetto chiave, una frase breve",
        "Secondo concetto chiave"
      ],
      "essenziali": [0],
      "tipo": "definizione",
      "risposta": "Risposta modello in **Markdown**: paragrafi, elenchi, tabelle e codice sono supportati."
    }
  ]
}
```

| Campo | Obbligatorio | Note |
|---|---|---|
| `id` | sì | minuscole, numeri e trattini; identifica il mazzo e i suoi progressi |
| `titolo` | sì | nome mostrato nel menu |
| `descrizione` | no | riga sotto il menu |
| `legenda_priorita` | no | etichette delle priorità |
| `argomenti` | no | codice → nome dell’argomento, usato per filtri e statistiche |
| `domande[].n` | sì | numero intero univoco |
| `domande[].domanda` | sì | testo della domanda |
| `domande[].concetti` | sì | da 3 a 7 concetti, ognuno verificabile da solo |
| `domande[].essenziali` | no | Indici a partire da 0 dei concetti indispensabili; se manca, tutti i concetti sono essenziali |
| `domande[].tipo` | no | `definizione` attiva il filtro trasversale delle definizioni |
| `domande[].risposta` | sì | risposta modello in Markdown |
| `domande[].argomento` | no | uno dei codici di `argomenti` |
| `domande[].priorita` | no | 3 = alta, 2 = media, 1 = bassa (predefinita 2) |
| `domande[].fonti` | no | dove è uscita la domanda |
| `domande[].varianti` | no | altre formulazioni della stessa domanda (`fonte`, `testo`), mostrate sotto la domanda |

### Generare un mazzo con un assistente AI

Allega slide, appunti e domande d’esame e usa questo prompt:

```
Crea un mazzo di flashcard in formato JSON per l’esame di <MATERIA>, seguendo esattamente
lo schema qui sotto. Per ogni domanda d’esame che ti fornisco:
- scrivi una risposta modello discorsiva, completa ma senza ridondanze, in Markdown;
- estrai da 3 a 7 concetti chiave: frasi brevi, ciascuna verificabile da sola, che uno studente
  deve esprimere per dare una risposta completa;
- assegna la priorità: 3 se la domanda è uscita più volte, 2 se è uscita una volta, 1 se non è mai uscita;
- raggruppa le domande in argomenti (codici A, B, C… con un nome);
- usa come "domanda" il testo originale, parola per parola; se la stessa domanda è uscita con parole diverse, metti le altre formulazioni in "varianti";
- indica in "fonti" gli appelli in cui la domanda è uscita.
Usa i materiali del corso come fonte principale e segnala nella risposta le parti integrate
da fonti esterne. Restituisci SOLO il JSON valido, senza testo prima o dopo.

Schema: <incolla qui l’esempio “Formato del mazzo” di questo README>
```

Controlla il risultato importandolo dal dispositivo: se il file ha errori di formato, il programma li elenca.

## Privacy

Non c’è alcun server: domande, risposte, progressi e chiavi restano nel tuo browser. Le uniche richieste esterne sono i caratteri (Google Fonts), le librerie per il Markdown (cdnjs), il modello di similarità (jsDelivr e Hugging Face, solo se attivi il controllo automatico) e il servizio di valutazione che scegli tu, solo quando premi *Valuta con il modello*.

## Calibrazione e interfaccia (2026-11-16)

Le rubriche distinguono i nuclei essenziali dagli approfondimenti: per la domanda sulle cinque fasi del trattamento del dato i dettagli tecnici aggiuntivi non sono necessari per riconoscere la fase come corretta o parzialmente corretta. Il modello riceve una guida specifica che distingue le omissioni dagli errori sostanziali. Dopo una valutazione il pulsante torna a **Rivaluta la risposta**; l'animazione termina e cambiare testo/domanda invalida le risposte API precedenti. Il punteggio non può essere garantito a priori: dipende dalla classificazione del modello.
