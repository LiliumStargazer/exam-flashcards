# Exam Flashcards — Ripasso esami

Flashcard per preparare esami orali e scritti a risposta aperta. Per ogni domanda scrivi (o dici) la tua risposta, poi spunti i **concetti chiave** che hai espresso: il programma calcola la copertura, segna la domanda come *sicura*, *parziale* o *da rifare* e ti ripropone per prime quelle più deboli.

Funziona da telefono e da computer, senza account e senza server: è un sito statico pubblicato con GitHub Pages.

## Cosa contiene

```
index.html          la pagina
style.css           la grafica (modalità chiara e scura automatica)
app.js              la logica
mazzi/indice.json   l’elenco dei mazzi disponibili
mazzi/*.json        un file per materia (un “mazzo”)
```

Il mazzo incluso è **Computer Forensics** (73 domande d’esame con risposte modello).

## Pubblicarlo con GitHub Pages

1. Nel repository vai su **Settings → Pages**.
2. In **Build and deployment** scegli *Source: Deploy from a branch*, branch `main`, cartella `/ (root)`, e salva.
3. Dopo un paio di minuti il sito è online su `https://<tuo-utente>.github.io/exam-flashcards/`.
4. Dal telefono apri l’indirizzo e aggiungilo alla schermata Home (Safari: Condividi → Aggiungi a Home; Chrome: menu → Aggiungi a schermata Home).

## Come si usa

- **Studia**: scrivi la risposta, poi *Mostra i concetti chiave*, spunta quelli che hai espresso e *Salva e vai avanti*. Sotto c’è sempre la risposta modello completa.
  Copertura ≥ 80% = sicura, ≥ 45% = parziale, sotto = da rifare.
- **Mappa**: un quadratino per domanda, colorato in base al risultato; la striscia gialla indica le domande ad alta priorità. Toccandolo apri la domanda.
- **Andamento**: totali per priorità e argomento, elenco delle domande da ripassare.
- **Impostazioni**: mazzi, progressi, valutazione automatica.

### Progressi

Sono salvati nel browser del dispositivo. Per passarli da un dispositivo all’altro usa *Esporta i progressi* (scarica un file JSON) e *Importa i progressi* sull’altro: per ogni domanda viene tenuto il risultato più recente.

## Valutazione automatica (facoltativa)

Le spunte manuali bastano e non costano nulla. In più ci sono due aiuti, attivabili in **Impostazioni**:

1. **Controllo automatico gratuito.** Un modello di similarità multilingue (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, eseguito con Transformers.js) gira direttamente nel browser: confronta il significato delle frasi della tua risposta con ogni concetto chiave e pre-spunta quelli presenti. Al primo uso scarica circa 120 MB, poi resta in memoria e funziona anche offline. **Non riconosce le affermazioni sbagliate**: dice solo se un concetto sembra presente. Le soglie si regolano nelle impostazioni (se spunta troppo poco abbassale, se spunta troppo alzale).
2. **Modello linguistico con chiave personale.** Attivalo in *Impostazioni → Valutazione con un modello linguistico*: scegli il servizio, segui il link per creare la chiave, incollala e premi *Prova la connessione*. Da quel momento sotto ogni risposta compare il pulsante **Valuta con il modello**.
   Più preciso e segnala anche gli errori. Funziona con qualsiasi servizio con API *compatibile OpenAI*; sono preimpostati Google Gemini, Groq, OpenRouter e Ollama (sul tuo computer). Crei una chiave gratuita sul sito del servizio e la incolli nelle impostazioni; resta salvata solo nel tuo browser.
   - I piani gratuiti hanno limiti giornalieri e possono usare i testi inviati per migliorare i loro modelli: leggi le condizioni del servizio.
   - I nomi dei modelli cambiano nel tempo: premi *Mostra i modelli disponibili* per scegliere dall’elenco aggiornato del servizio.
   - Se il servizio è sovraccarico (errore 503) o hai superato un limite (429) il programma riprova da solo un paio di volte; se continua, riprova più tardi o scegli un altro modello.
   - **DeepSeek**: l’API ufficiale è a pagamento; i modelli DeepSeek gratuiti si usano tramite OpenRouter (quelli con “:free” nel nome).
   - Alcuni servizi non accettano richieste direttamente da una pagina web (errore di rete o CORS): in quel caso prova un altro servizio. Per Ollama avvia il server con `OLLAMA_ORIGINS=*` e usa la pagina dal computer su cui gira.

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
      "domanda": "Testo della domanda",
      "concetti": [
        "Primo concetto chiave, una frase breve",
        "Secondo concetto chiave"
      ],
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
| `domande[].risposta` | sì | risposta modello in Markdown |
| `domande[].argomento` | no | uno dei codici di `argomenti` |
| `domande[].priorita` | no | 3 = alta, 2 = media, 1 = bassa (predefinita 2) |
| `domande[].fonti` | no | dove è uscita la domanda |

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
- indica in "fonti" gli appelli in cui la domanda è uscita.
Usa i materiali del corso come fonte principale e segnala nella risposta le parti integrate
da fonti esterne. Restituisci SOLO il JSON valido, senza testo prima o dopo.

Schema: <incolla qui l’esempio “Formato del mazzo” di questo README>
```

Controlla il risultato importandolo dal dispositivo: se il file ha errori di formato, il programma li elenca.

## Privacy

Non c’è alcun server: domande, risposte, progressi e chiavi restano nel tuo browser. Le uniche richieste esterne sono i caratteri (Google Fonts), le librerie per il Markdown (cdnjs), il modello di similarità (jsDelivr e Hugging Face, solo se attivi il controllo automatico) e il servizio di valutazione che scegli tu, solo quando premi *Valuta con il modello*.
