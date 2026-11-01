/* Ripasso esami — flashcard con valutazione dei concetti chiave.
   Mazzi: file JSON in /mazzi (elencati in mazzi/indice.json) o importati dal dispositivo.
   Progressi: localStorage del browser (esportabili/importabili). */
(function () {
"use strict";

/* ---------- utilità ---------- */
const $ = id => document.getElementById(id);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast("Memoria del browser piena: esporta i progressi"); return false; } }
};
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600); }
function md(text) {
  const src = String(text || "");
  if (window.marked && window.DOMPurify) {
    try { return DOMPurify.sanitize(marked.parse(src)); } catch (e) { /* fallback sotto */ }
  }
  return "<p>" + esc(src).replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>") + "</p>";
}
const stLabel = st => st === "ok" ? "Sicura" : st === "part" ? "Parziale" : st === "ko" ? "Da rifare" : "Mai fatta";
const statusFor = s => s >= 80 ? "ok" : s >= 45 ? "part" : "ko";
const stars = p => p >= 3 ? "★★★" : p === 2 ? "★★" : "★";

/* ---------- chiavi di memoria ---------- */
const K = {
  imported: "ef-mazzi-importati-v1",
  lastDeck: "ef-ultimo-mazzo-v1",
  progress: id => "ef-progressi-" + id,
  drafts: id => "ef-bozze-" + id,
  settings: "ef-impostazioni-v1"
};
const DEFAULT_SETTINGS = {
  simOn: false, simHigh: 0.62, simLow: 0.50,
  llmOn: false, llmPreset: "gemini", llmBase: "https://generativelanguage.googleapis.com/v1beta/openai", llmModel: "gemini-2.5-flash", llmFallback: "", llmKey: ""
};
const PRESETS = {
  gemini: { nome: "Google Gemini (piano gratuito)", base: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash", chiave: "https://aistudio.google.com/apikey", come: "Accedi con un account Google su Google AI Studio e premi “Create API key”." },
  groq: { nome: "Groq (piano gratuito)", base: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", chiave: "https://console.groq.com/keys", come: "Registrati sulla console di Groq e crea una chiave in “API Keys”." },
  openrouter: { nome: "OpenRouter (anche DeepSeek gratuito)", base: "https://openrouter.ai/api/v1", model: "", chiave: "https://openrouter.ai/keys", come: "Registrati su OpenRouter e crea una chiave. Poi premi “Mostra i modelli disponibili”: quelli con “:free” nel nome sono gratuiti (cerca “deepseek” per i modelli DeepSeek)." },
  deepseek: { nome: "DeepSeek ufficiale (a pagamento, economico)", base: "https://api.deepseek.com", model: "deepseek-chat", chiave: "https://platform.deepseek.com/api_keys", come: "Crea una chiave sulla piattaforma DeepSeek e ricarica un piccolo credito: l’API ufficiale non ha un piano gratuito." },
  ollama: { nome: "Ollama sul tuo computer", base: "http://localhost:11434/v1", model: "qwen2.5:7b", chiave: "", come: "Nessuna chiave: installa Ollama, scarica il modello e avvialo con OLLAMA_ORIGINS=*. Funziona solo dal computer su cui gira." },
  custom: { nome: "Altro (compatibile OpenAI)", base: "", model: "", chiave: "", come: "Inserisci indirizzo, modello e chiave del servizio che preferisci." }
};
let settings = Object.assign({}, DEFAULT_SETTINGS, LS.get(K.settings, {}));
/* Ogni servizio ha la sua configurazione (indirizzo, modello, riserva, chiave).
   I campi llmBase/llmModel/llmFallback/llmKey contengono sempre quella del servizio selezionato. */
function svcDefaults(name) { const p = PRESETS[name] || {}; return { base: p.base || "", model: p.model || "", fallback: "", key: "" }; }
function storeActiveService() {
  settings.services = settings.services || {};
  settings.services[settings.llmPreset] = { base: settings.llmBase || "", model: settings.llmModel || "", fallback: settings.llmFallback || "", key: settings.llmKey || "" };
}
function loadService(name) {
  settings.services = settings.services || {};
  const c = Object.assign(svcDefaults(name), settings.services[name] || {});
  settings.llmPreset = name; settings.llmBase = c.base; settings.llmModel = c.model; settings.llmFallback = c.fallback; settings.llmKey = c.key;
}
if (!settings.services) { settings.services = {}; storeActiveService(); }   // migrazione: le impostazioni già salvate vanno al servizio in uso
else loadService(settings.llmPreset);
function saveSettings() { storeActiveService(); LS.set(K.settings, settings); }
function hasKey(name) { const c = (settings.services || {})[name]; return !!(c && c.key); }

/* ---------- stato ---------- */
let decks = [];          // [{id, titolo, source:'repo'|'locale', file?, data?}]
let deck = null;         // mazzo attivo (dati)
let QS = [], byN = new Map(), SECS = [];
let progress = {}, drafts = {};
let cur = null, revealed = false, evalResult = null, randSeed = Math.random();

/* ---------- validazione mazzo ---------- */
function validateDeck(d) {
  const errs = [];
  if (!d || typeof d !== "object") return ["Il file non contiene un oggetto JSON."];
  if (!d.id || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(d.id)) errs.push("Campo “id” mancante o non valido (solo minuscole, numeri e trattini).");
  if (!d.titolo) errs.push("Campo “titolo” mancante.");
  if (!Array.isArray(d.domande) || !d.domande.length) errs.push("Campo “domande” mancante o vuoto.");
  else {
    const seen = new Set();
    d.domande.forEach((q, i) => {
      const where = "Domanda in posizione " + (i + 1);
      if (!Number.isInteger(q.n)) errs.push(where + ": “n” deve essere un numero intero.");
      else if (seen.has(q.n)) errs.push(where + ": numero " + q.n + " ripetuto."); else seen.add(q.n);
      if (!q.domanda) errs.push(where + ": testo della domanda mancante.");
      if (!Array.isArray(q.concetti) || !q.concetti.length) errs.push(where + ": servono almeno un concetto chiave.");
      if (typeof q.risposta !== "string") errs.push(where + ": “risposta” deve essere testo (Markdown).");
      if (q.varianti != null && (!Array.isArray(q.varianti) || q.varianti.some(v => !v || typeof v.testo !== "string"))) errs.push(where + ": “varianti” deve essere un elenco di oggetti con “testo”.");
    });
  }
  return errs.slice(0, 8);
}

/* ---------- caricamento mazzi ---------- */
async function loadDeckList() {
  decks = [];
  try {
    const r = await fetch("mazzi/indice.json", { cache: "no-cache" });
    if (r.ok) {
      const list = await r.json();
      list.forEach(x => decks.push({ id: x.file.replace(/\.json$/, ""), titolo: x.titolo || x.file, source: "repo", file: "mazzi/" + x.file }));
    }
  } catch (e) { /* aperto da file locale o rete assente */ }
  const imp = LS.get(K.imported, {});
  Object.values(imp).forEach(d => {
    const i = decks.findIndex(x => x.id === d.id);
    const entry = { id: d.id, titolo: d.titolo + " (importato)", source: "locale", data: d };
    if (i >= 0) decks.splice(i + 1, 0, Object.assign(entry, { id: d.id + "@locale" })); else decks.push(entry);
  });
  const sel = $("deckSel"); sel.innerHTML = "";
  decks.forEach(d => { const o = document.createElement("option"); o.value = d.id; o.textContent = d.titolo; sel.appendChild(o); });
  if (!decks.length) {
    $("deckTitle").textContent = "Nessun mazzo disponibile";
    $("card").innerHTML = '<div class="empty">Nessun mazzo trovato. Vai in Impostazioni e importa un file JSON, oppure aggiungi un mazzo nella cartella <b>mazzi</b> del repository.</div>';
    return;
  }
  const last = LS.get(K.lastDeck, null);
  const pick = decks.find(d => d.id === last) || decks[0];
  sel.value = pick.id;
  await openDeck(pick.id);
}
async function openDeck(id) {
  const meta = decks.find(d => d.id === id); if (!meta) return;
  let data = meta.data;
  if (!data) {
    try { const r = await fetch(meta.file, { cache: "no-cache" }); data = await r.json(); }
    catch (e) { toast("Impossibile leggere il mazzo " + meta.titolo); return; }
  }
  const errs = validateDeck(data);
  if (errs.length) { $("card").innerHTML = '<div class="empty"><p class="err">Il mazzo contiene errori:</p><p>' + errs.map(esc).join("<br>") + "</p></div>"; return; }
  deck = data; deck._key = id;
  LS.set(K.lastDeck, id);
  QS = deck.domande.slice().sort((a, b) => a.n - b.n).map(q => Object.assign({ priorita: 2, argomento: "", fonti: "" }, q));
  byN = new Map(QS.map(q => [q.n, q]));
  const args = deck.argomenti || {};
  SECS = [...new Set(QS.map(q => q.argomento).filter(Boolean))].map(k => [k, args[k] || k]);
  progress = LS.get(K.progress(id), {}); drafts = LS.get(K.drafts(id), {});
  cur = null; revealed = false; evalResult = null; skipped.clear();
  $("deckTitle").textContent = deck.titolo + " — " + QS.length + (QS.length === 1 ? " domanda" : " domande");
  $("deckDesc").textContent = deck.descrizione || "";
  buildFilters(); renderLegend(); renderMap(); showView("study"); renderCard();
}

/* ---------- filtri, ordinamento ---------- */
function prioLabel(p) { const l = deck.legenda_priorita || {}; return l[String(p)] || (stars(p) + (p >= 3 ? " alta" : p === 2 ? " media" : " bassa")); }
function buildFilters() {
  const fp = $("fPrio"); fp.innerHTML = '<option value="all">Tutte</option>';
  [...new Set(QS.map(q => q.priorita))].sort((a, b) => b - a).forEach(p => { const o = document.createElement("option"); o.value = p; o.textContent = "Solo " + stars(p); fp.appendChild(o); });
  const fs = $("fSec"); fs.innerHTML = '<option value="all">Tutti</option>';
  SECS.forEach(([k, v]) => { const o = document.createElement("option"); o.value = k; o.textContent = (k.length <= 3 ? k + ". " : "") + v; fs.appendChild(o); });
}
function filtered() {
  const p = $("fPrio").value, s = $("fSec").value;
  return QS.filter(q => (p === "all" || String(q.priorita) === p) && (s === "all" || q.argomento === s));
}
function weakness(q) {
  const r = progress[q.n];
  if (!r) return 1000 + q.priorita * 50;
  const base = r.st === "ko" ? 600 : r.st === "part" ? 400 : 100;
  const age = Math.min(99, (Date.now() - (r.t || 0)) / 86400000);
  return base + q.priorita * 25 + age - (r.k || 0);
}
function ordered() {
  const list = filtered(), o = $("fOrder").value;
  if (o === "seq") return list.slice().sort((a, b) => a.n - b.n);
  if (o === "rand") { const h = n => Math.sin(n * 12.9898 + randSeed * 78.233) * 43758.5453 % 1; return list.slice().sort((a, b) => h(a.n) - h(b.n)); }
  return list.slice().sort((a, b) => weakness(b) - weakness(a) || a.n - b.n);
}
const skipped = new Map(); // domande saltate in questa sessione: tornano in fondo alla coda
function pickNext() {
  const list = ordered(); if (!list.length) return null;
  if ($("fOrder").value === "weak") {
    const fresh = list.filter(q => q.n !== cur && !skipped.has(q.n));
    if (fresh.length) return fresh[0];
    const others = list.filter(q => q.n !== cur).sort((a, b) => (skipped.get(a.n) || 0) - (skipped.get(b.n) || 0));
    if (others.length) { skipped.clear(); return others[0]; }
    return list[0];
  }
  const i = list.findIndex(q => q.n === cur);
  return list[(i + 1) % list.length];
}

/* ---------- mappa ---------- */
function renderLegend() {
  const hasHigh = QS.some(q => q.priorita >= 3);
  $("legend").innerHTML =
    '<span><i style="background:var(--ok)"></i>Sicura</span><span><i style="background:var(--part)"></i>Parziale</span>' +
    '<span><i style="background:var(--ko)"></i>Da rifare</span><span><i style="background:var(--none)"></i>Mai fatta</span>' +
    (hasHigh ? '<span><i style="background:var(--none);box-shadow:inset 0 -4px 0 var(--tag)"></i>' + esc(prioLabel(3)) + "</span>" : "");
}
function renderMap() {
  if (!deck) return;
  const fs = new Set(filtered().map(q => q.n));
  const box = $("sectors"); box.innerHTML = "";
  let done = 0, ok = 0;
  QS.forEach(q => {
    const r = progress[q.n];
    const b = document.createElement("button");
    b.className = "sec" + (q.priorita >= 3 ? " p3" : "") + (r ? " " + r.st : "") + (q.n === cur ? " cur" : "") + (fs.has(q.n) ? "" : " dim");
    b.textContent = q.n;
    b.setAttribute("aria-label", "Domanda " + q.n + ": " + stLabel(r && r.st));
    b.addEventListener("click", () => { showView("study"); openQ(q.n); });
    box.appendChild(b);
    if (r) { done++; if (r.st === "ok") ok++; }
  });
  $("mapCount").textContent = done + " / " + QS.length;
  $("mapPct").textContent = ok ? ok + " sicure" : "";
}

/* ---------- scheda domanda ---------- */
function openQ(n) { cur = n; revealed = false; evalResult = null; renderCard(); renderMap(); $("card").scrollIntoView({ block: "nearest" }); }
function evalAvailable() { return settings.simOn || (settings.llmOn && settings.llmKey !== "" || (settings.llmOn && settings.llmPreset === "ollama")); }
function renderCard() {
  const card = $("card");
  if (!deck) return;
  if (cur == null || !byN.has(cur)) { const nx = pickNext(); if (!nx) { card.innerHTML = '<div class="empty">Nessuna domanda con questi filtri. Cambia priorità o argomento.</div>'; return; } cur = nx.n; renderMap(); }
  const q = byN.get(cur), r = progress[q.n];
  const secName = (SECS.find(s => s[0] === q.argomento) || [null, ""])[1];
  card.innerHTML = `
   <div class="tagline"><span class="num">Domanda ${q.n}</span>
     <span class="prio p${q.priorita >= 3 ? 3 : 2}">${esc(prioLabel(q.priorita))}</span>
     ${q.fonti ? `<span>Fonte: ${esc(q.fonti)}</span>` : ""}
     <span class="state ${r ? r.st : ""}">${r ? stLabel(r.st) + ", " + r.s + "%" : ""}</span></div>
   <div class="cbody">
     <h2 class="q">${esc(q.domanda)}</h2>
     ${Array.isArray(q.varianti) && q.varianti.length ? `<div class="variants"><p class="note">Formulata anche così:</p>${q.varianti.map(v => `<blockquote><span class="src">${esc(v.fonte || "")}</span>${esc(v.testo || "")}</blockquote>`).join("")}</div>` : ""}
     ${secName ? `<div class="secname">${q.argomento.length <= 3 ? esc(q.argomento) + ". " : ""}${esc(secName)}</div>` : ""}
     <label for="ans" class="hint" style="display:block;margin:0 0 6px">Scrivi la tua risposta come all’esame (oppure rispondi a voce e scopri la risposta).</label>
     <textarea id="ans" placeholder="La tua risposta…">${esc(drafts[q.n] || "")}</textarea>
     <div class="hint" id="aiHint"></div>
     <div class="actions">
       ${settings.simOn ? '<button class="btn" id="bSim">Controlla i concetti</button>' : ""}
       ${settings.llmOn ? '<button class="btn" id="bLlm">Valuta con il modello</button>' : ""}
       <button class="btn ${evalAvailable() ? "ghost" : ""}" id="bShow">Mostra i concetti chiave</button>
       <button class="btn ghost" id="bSkip">Salta</button>
     </div>
     ${(!settings.simOn && !settings.llmOn) ? '<p class="note" style="margin:10px 0 0">Vuoi che la risposta venga valutata in automatico? <button class="linkbtn" id="bGoSet">Attiva la valutazione nelle Impostazioni</button></p>' : ""}
     <div class="progressbar" id="pbar" hidden><i></i></div>
     <div id="after"></div>
   </div>`;
  const ta = $("ans");
  ta.addEventListener("input", () => { drafts[q.n] = ta.value; LS.set(K.drafts(deck._key), drafts); updateEvalBtns(); });
  $("bShow").addEventListener("click", () => reveal());
  $("bSkip").addEventListener("click", () => { skipped.set(q.n, Date.now()); const nx = pickNext(); if (nx) openQ(nx.n); });
  if ($("bSim")) $("bSim").addEventListener("click", runSimilarity);
  if ($("bLlm")) $("bLlm").addEventListener("click", runLlm);
  if ($("bGoSet")) $("bGoSet").addEventListener("click", () => { showView("set"); const el = $("boxEval"); if (el) el.scrollIntoView({ block: "start" }); });
  updateEvalBtns();
  if (revealed) reveal(true);
}
function updateEvalBtns() {
  const len = (($("ans") || {}).value || "").trim().length;
  ["bSim", "bLlm"].forEach(id => { const b = $(id); if (b) b.disabled = len < 20; });
  const any = $("bSim") || $("bLlm");
  $("aiHint").textContent = any ? (len < 20 ? "Per la valutazione automatica scrivi almeno qualche frase." : "") : "";
}
function reveal(keep) {
  revealed = true;
  const q = byN.get(cur);
  const after = $("after");
  after.innerHTML = `
    <div class="fb" id="fb" hidden></div>
    <div class="check"><h2>Concetti chiave: spunta quelli che hai espresso</h2>
      <div id="concepts"></div>
      <div class="score"><span>Copertura: <b id="pct">0%</b> <span id="pctLab"></span></span>
        <span class="actions"><button class="btn" id="bSave">Salva e vai avanti</button></span></div>
    </div>
    <div class="model"><details><summary>Leggi la risposta modello</summary><div class="answer">${md(q.risposta)}</div></details></div>`;
  after.querySelectorAll(".answer table").forEach(t => { const w = document.createElement("div"); w.className = "tablewrap"; t.parentNode.insertBefore(w, t); w.appendChild(t); });
  const box = $("concepts");
  q.concetti.forEach((c, i) => {
    const lab = document.createElement("label"); lab.className = "concept"; lab.htmlFor = "c" + i;
    const inp = document.createElement("input"); inp.type = "checkbox"; inp.id = "c" + i;
    const span = document.createElement("span"); span.textContent = c;
    lab.appendChild(inp); lab.appendChild(span);
    if (evalResult) {
      if (evalResult.covered.includes(i)) { inp.checked = true; lab.classList.add("on"); }
      else if (evalResult.partial.includes(i)) { lab.classList.add("half"); const w = document.createElement("span"); w.className = "why"; w.textContent = "Accennato solo in parte"; span.appendChild(w); }
    }
    inp.addEventListener("change", () => { lab.classList.toggle("on", inp.checked); calc(); });
    box.appendChild(lab);
  });
  if (evalResult) renderFb();
  $("bSave").addEventListener("click", save);
  $("bShow").hidden = true;
  calc();
}
function calc() {
  const q = byN.get(cur);
  const boxes = [...document.querySelectorAll("#concepts input")];
  let n = boxes.filter(b => b.checked).length;
  if (evalResult) n += 0.5 * evalResult.partial.filter(i => boxes[i] && !boxes[i].checked).length;
  const s = Math.round(100 * n / q.concetti.length);
  $("pct").textContent = s + "%";
  const st = statusFor(s);
  $("pctLab").textContent = "(" + stLabel(st) + ")";
  $("pctLab").style.color = "var(--" + st + ")";
  return s;
}
function save() {
  try {
    const q = byN.get(cur), s = calc(), st = statusFor(s), old = progress[q.n];
    progress[q.n] = { s, st, t: Date.now(), k: ((old && old.k) || 0) + 1 };
    skipped.delete(q.n);
    LS.set(K.progress(deck._key), progress);
    toast("Salvato: " + stLabel(st) + " (" + s + "%)");
    renderMap();
    const nx = pickNext(); if (nx) openQ(nx.n);
  } catch (e) { toast("Errore nel salvataggio: ricarica la pagina e riprova"); }
}
function renderFb() {
  const fb = $("fb"); if (!fb || !evalResult) return;
  fb.hidden = false; fb.innerHTML = "";
  const h = document.createElement("h2"); h.textContent = evalResult.title; fb.appendChild(h);
  if (evalResult.feedback) { const p = document.createElement("p"); p.textContent = evalResult.feedback; fb.appendChild(p); }
  if (evalResult.errors && evalResult.errors.length) {
    const p = document.createElement("p"); p.textContent = "Imprecisioni da correggere:"; fb.appendChild(p);
    const ul = document.createElement("ul"); evalResult.errors.forEach(e => { const li = document.createElement("li"); li.textContent = e; ul.appendChild(li); }); fb.appendChild(ul);
  }
  const p2 = document.createElement("p"); p2.className = "note"; p2.textContent = "Le spunte sono già impostate: correggile se non sei d’accordo, poi salva."; fb.appendChild(p2);
}

/* ---------- valutazione 1: similarità nel browser (gratuita, offline dopo il primo download) ---------- */
let extractorPromise = null;
const SIM_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
function getExtractor(onProgress) {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const T = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
      T.env.allowLocalModels = false;
      return T.pipeline("feature-extraction", SIM_MODEL, { quantized: true, progress_callback: onProgress });
    })();
    extractorPromise.catch(() => { extractorPromise = null; });
  }
  return extractorPromise;
}
function chunks(text) {
  const sents = text.replace(/\s+/g, " ").split(/(?<=[.;:!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 3);
  const out = new Set(sents);
  for (let i = 0; i < sents.length - 1; i++) out.add(sents[i] + " " + sents[i + 1]);
  sents.forEach(s => { if (s.length > 120) s.split(/,\s+/).filter(x => x.length > 15).forEach(x => out.add(x)); });
  if (!out.size) out.add(text.trim());
  return [...out].slice(0, 80);
}
async function runSimilarity() {
  const q = byN.get(cur), txt = ($("ans").value || "").trim();
  if (txt.length < 20) return;
  const b = $("bSim"); b.disabled = true; b.innerHTML = '<span class="spin"></span>Controllo…';
  const pbar = $("pbar"), bar = pbar.querySelector("i");
  try {
    const ex = await getExtractor(p => {
      if (p && p.status === "progress" && typeof p.progress === "number") { pbar.hidden = false; bar.style.width = Math.round(p.progress) + "%"; $("aiHint").textContent = "Primo avvio: scarico il modello di valutazione (circa 120 MB, una volta sola)…"; }
    });
    pbar.hidden = true;
    const parts = chunks(txt);
    const emb = async arr => (await ex(arr, { pooling: "mean", normalize: true })).tolist();
    const [ce, pe] = [await emb(q.concetti), await emb(parts)];
    const covered = [], partial = [];
    ce.forEach((c, i) => {
      let best = 0; pe.forEach(p => { let d = 0; for (let k = 0; k < c.length; k++) d += c[k] * p[k]; if (d > best) best = d; });
      if (best >= settings.simHigh) covered.push(i); else if (best >= settings.simLow) partial.push(i);
    });
    evalResult = { title: "Controllo automatico dei concetti", covered, partial, errors: [],
      feedback: "Ho confrontato il significato delle tue frasi con ciascun concetto chiave. Questo controllo non riconosce le affermazioni sbagliate: verifica tu le spunte." };
    reveal(true);
  } catch (e) {
    pbar.hidden = true; b.disabled = false; b.textContent = "Controlla i concetti";
    $("aiHint").textContent = "Il controllo automatico non è riuscito (serve la connessione al primo avvio). Usa le spunte manuali.";
  }
}

/* ---------- valutazione 2: modello linguistico con chiave personale (API compatibile OpenAI) ---------- */
function buildPrompt(q, txt) {
  return `Sei un docente universitario che corregge una risposta d'esame scritta da uno studente.
Materia: ${deck.titolo}.
Valuta SOLO se i concetti chiave sono espressi nella risposta, anche con parole diverse. Non premiare frasi vaghe.

Domanda: ${q.domanda}${Array.isArray(q.varianti) && q.varianti.length ? "\nAltre formulazioni della stessa domanda: " + q.varianti.map(v => v.testo).join(" / ") : ""}

Concetti chiave (indice: testo):
${q.concetti.map((c, i) => i + ": " + c).join("\n")}

Risposta modello (riferimento):
${String(q.risposta).slice(0, 6000)}

Risposta dello studente:
"""${txt.slice(0, 5000)}"""

Rispondi SOLO con JSON valido, senza altro testo, in questo formato:
{"covered":[indici dei concetti espressi in modo corretto e sufficiente],"partial":[indici accennati in modo incompleto],"errors":["affermazioni errate o imprecise presenti nella risposta, max 4, in italiano"],"feedback":"2-3 frasi in italiano, dirette e concrete: cosa va bene e cosa manca"}`;
}
function parseJsonLoose(t) {
  const s = String(t || "").replace(/```json|```/g, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("risposta non in formato JSON");
  return JSON.parse(s.slice(a, b + 1));
}
function llmHeaders() {
  const h = { "Content-Type": "application/json" };
  if (settings.llmKey) h["Authorization"] = "Bearer " + settings.llmKey;
  return h;
}
function serverDetail(body) {
  try {
    let j = JSON.parse(body); if (Array.isArray(j)) j = j[0];
    const e = (j && (j.error || j)) || {};
    const m = e.message || e.msg || (typeof e === "string" ? e : "");
    if (m) return String(m).slice(0, 220);
  } catch (e) { /* non JSON */ }
  return String(body || "").replace(/\s+/g, " ").slice(0, 220);
}
function isDailyLimit(body) { return /per ?day|perday|daily|requests per day|RPD/i.test(String(body || "")); }
function explainHttp(status, body) {
  const b = String(body || "").toLowerCase();
  return explainHttpBase(status, body, b) + (serverDetail(body) ? " [HTTP " + status + ": " + serverDetail(body) + "]" : " [HTTP " + status + "]");
}
function explainHttpBase(status, body, b) {
  if (status === 401 || status === 403) return "chiave non valida o senza permessi: ricopiala dal sito del servizio.";
  if (status === 404 || (status === 400 && /model/.test(b) && /(not found|not exist|invalid|unknown|unsupported)/.test(b))) return "modello inesistente: premi “Mostra i modelli disponibili” e scegline uno dall’elenco.";
  if (status === 429) {
    if (isDailyLimit(body)) return "hai raggiunto il limite giornaliero gratuito di questo modello. Si azzera intorno alle 9 del mattino (ora italiana); nel frattempo scegli un altro modello (ognuno ha un limite proprio) o un altro servizio. Cambiare chiave non serve se è nello stesso progetto.";
    return "troppe richieste in poco tempo: aspetta un minuto e riprova, oppure usa un altro modello.";
  }
  if (status === 503 || status === 502) return "il modello è sovraccarico in questo momento (non dipende da te): scegli un modello più leggero (es. flash-lite), imposta un modello di riserva o riprova più tardi.";
  if (status === 500) return "errore interno del servizio: riprova tra poco o scegli un altro modello.";
  if (status === 400) return "richiesta rifiutata dal servizio.";
  return "errore del servizio.";
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let lastModelUsed = "";
async function callLlm(prompt, onRetry) {
  if (!settings.llmModel) throw new Error("manca il nome del modello: premi “Mostra i modelli disponibili” nelle Impostazioni.");
  try { const t = await callLlmModel(prompt, settings.llmModel, onRetry); lastModelUsed = settings.llmModel; return t; }
  catch (e) {
    const fb = (settings.llmFallback || "").trim();
    if (fb && fb !== settings.llmModel && e.retryable) {
      if (onRetry) onRetry("riserva");
      try { const t = await callLlmModel(prompt, fb, null); lastModelUsed = fb; return t; }
      catch (e2) { throw new Error("modello principale: " + e.message + " Modello di riserva: " + e2.message); }
    }
    throw e;
  }
}
async function callLlmModel(prompt, model, onRetry) {
  const base = settings.llmBase.replace(/\/+$/, "");
  if (!base) throw new Error("manca l’indirizzo API nelle Impostazioni.");
  const waits = [2500, 6000];
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(base + "/chat/completions", {
        method: "POST", headers: llmHeaders(),
        body: JSON.stringify({ model, temperature: 0, messages: [{ role: "user", content: prompt }] })
      });
    } catch (e) {
      throw new Error("il browser non è riuscito a contattare il servizio (rete assente, indirizzo errato o servizio che non accetta richieste da una pagina web).");
    }
    if (r.ok) {
      const j = await r.json();
      return (((j.choices || [])[0] || {}).message || {}).content || "";
    }
    let body = ""; try { body = await r.text(); } catch (e) {}
    // 503/502: sovraccarico temporaneo, ha senso riprovare. 429: limite raggiunto, riprovare consuma solo altre richieste.
    if ((r.status === 503 || r.status === 502) && attempt < waits.length) {
      if (onRetry) onRetry(attempt + 1);
      await sleep(waits[attempt]);
      continue;
    }
    const err = new Error(explainHttp(r.status, body));
    err.retryable = [429, 500, 502, 503].includes(r.status);
    throw err;
  }
}
async function listModels() {
  const base = settings.llmBase.replace(/\/+$/, "");
  let r;
  try { r = await fetch(base + "/models", { headers: llmHeaders() }); }
  catch (e) { throw new Error("il browser non è riuscito a contattare il servizio."); }
  let body = ""; if (!r.ok) { try { body = await r.text(); } catch (e) {} throw new Error(explainHttp(r.status, body)); }
  const j = await r.json();
  const arr = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : [];
  return arr.map(m => String(m.id || m.name || "").replace(/^models\//, "")).filter(Boolean).sort();
}
async function runLlm() {
  const q = byN.get(cur), txt = ($("ans").value || "").trim();
  if (txt.length < 20) return;
  if (!settings.llmKey && settings.llmPreset !== "ollama") { $("aiHint").textContent = "Inserisci la chiave del modello in Impostazioni."; return; }
  const b = $("bLlm"); b.disabled = true; b.innerHTML = '<span class="spin"></span>Sto valutando…';
  try {
    const r = parseJsonLoose(await callLlm(buildPrompt(q, txt), n => { $("aiHint").textContent = n === "riserva" ? "Modello principale occupato: provo il modello di riserva…" : "Servizio occupato, nuovo tentativo (" + n + ")…"; }));
    const idx = a => Array.isArray(a) ? a.map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < q.concetti.length) : [];
    const cov = idx(r.covered);
    evalResult = { title: "Valutazione del modello" + (lastModelUsed ? " (" + lastModelUsed + ")" : ""), covered: cov, partial: idx(r.partial).filter(i => !cov.includes(i)),
      errors: Array.isArray(r.errors) ? r.errors.map(String).slice(0, 4) : [], feedback: typeof r.feedback === "string" ? r.feedback : "" };
    reveal(true);
  } catch (e) {
    b.disabled = false; b.textContent = "Valuta con il modello";
    $("aiHint").textContent = "Valutazione non riuscita: " + (e.message || "errore sconosciuto") + " Nel frattempo puoi usare le spunte.";
  }
}

/* ---------- andamento ---------- */
function renderStats() {
  const el = $("stats"); if (!deck) { el.innerHTML = ""; return; }
  const cnt = { ok: 0, part: 0, ko: 0, none: 0 };
  QS.forEach(q => { const r = progress[q.n]; cnt[r ? r.st : "none"]++; });
  const bars = list => { const c = { ok: 0, part: 0, ko: 0 }; list.forEach(q => { const r = progress[q.n]; if (r) c[r.st]++; }); const t = list.length || 1;
    return `<div class="track">${["ok", "part", "ko"].map(k => c[k] ? `<i style="width:${100 * c[k] / t}%;background:var(--${k})"></i>` : "").join("")}</div><span class="mono" style="font-size:.8rem">${c.ok}/${list.length}</span>`; };
  const prios = [...new Set(QS.map(q => q.priorita))].sort((a, b) => b - a);
  const weak = QS.filter(q => progress[q.n] && progress[q.n].st !== "ok").sort((a, b) => weakness(b) - weakness(a));
  el.innerHTML = `
   <div class="box"><h2>Situazione generale</h2><div class="big">
     <div><b style="color:var(--ok)">${cnt.ok}</b><span>Sicure</span></div>
     <div><b style="color:var(--part)">${cnt.part}</b><span>Parziali</span></div>
     <div><b style="color:var(--ko)">${cnt.ko}</b><span>Da rifare</span></div>
     <div><b>${cnt.none}</b><span>Mai fatte</span></div></div></div>
   ${prios.length > 1 ? `<div class="box"><h2>Per priorità</h2>${prios.map(p => `<div class="bar"><span>${esc(prioLabel(p))}</span>${bars(QS.filter(q => q.priorita === p))}</div>`).join("")}</div>` : ""}
   ${SECS.length ? `<div class="box"><h2>Per argomento</h2>${SECS.map(([k, v]) => `<div class="bar"><span>${k.length <= 3 ? esc(k) + ". " : ""}${esc(v)}</span>${bars(QS.filter(q => q.argomento === k))}</div>`).join("")}</div>` : ""}
   <div class="box"><h2>Da ripassare</h2>${weak.length ? `<ul class="weak">${weak.map(q => `<li><button data-n="${q.n}"><span class="mono">${q.n}</span><span>${esc(q.domanda)} <span style="color:var(--${progress[q.n].st});font-weight:700">(${progress[q.n].s}%)</span></span></button></li>`).join("")}</ul>` : '<p style="margin:0;color:var(--ink-soft)">Nessuna domanda parziale o da rifare.</p>'}</div>`;
  el.querySelectorAll(".weak button").forEach(b => b.addEventListener("click", () => { showView("study"); openQ(+b.dataset.n); }));
}

/* ---------- impostazioni ---------- */
function renderSettings() {
  const el = $("settings");
  const imp = LS.get(K.imported, {});
  el.innerHTML = `
  <div class="box set"><h2>Mazzi</h2>
    <p>I mazzi della cartella <b>mazzi</b> del sito sono sempre disponibili. Puoi anche importare un file JSON dal dispositivo: resterà salvato in questo browser.</p>
    <div class="dropzone" id="dropzone" role="button" tabindex="0" aria-label="Carica il file delle domande">
      <b>Trascina qui il file delle domande (.json)</b>
      <span>oppure tocca per sceglierlo dal dispositivo. Puoi trascinare il file anche in qualsiasi punto della pagina.</span>
    </div>
    ${Object.keys(imp).length ? `<ul class="decklist">${Object.values(imp).map(d => `<li><span>${esc(d.titolo)} <span class="note">(${d.domande.length} ${d.domande.length === 1 ? "domanda" : "domande"})</span></span><button class="btn ghost danger" data-del="${esc(d.id)}">Rimuovi</button></li>`).join("")}</ul>` : ""}
  </div>
  <div class="box set"><h2>Progressi</h2>
    <p>I progressi sono salvati in questo browser. Per passarli su un altro dispositivo esportali qui e importali dall’altro.</p>
    <div class="row"><button class="btn" id="bExp">Esporta i progressi</button><button class="btn ghost" id="bImp">Importa i progressi</button>
    <button class="btn ghost danger" id="bReset">Cancella i progressi di questa materia</button></div>
  </div>
  <div class="box set"><h2>Controllo automatico gratuito</h2>
    <p>Un piccolo modello che gira nel browser confronta il significato delle tue frasi con i concetti chiave e li pre-spunta. Al primo uso scarica circa 120 MB (poi resta in memoria e funziona anche offline). Non riconosce le affermazioni sbagliate.</p>
    <label class="switch"><input type="checkbox" id="sSim" ${settings.simOn ? "checked" : ""}>Attiva il controllo automatico</label>
    <div class="row">
      <label class="field">Soglia “concetto espresso” (0–1)<input type="number" step="0.01" min="0.3" max="0.95" id="sHigh" value="${settings.simHigh}"></label>
      <label class="field">Soglia “accennato” (0–1)<input type="number" step="0.01" min="0.2" max="0.9" id="sLow" value="${settings.simLow}"></label>
    </div>
    <p class="note">Se spunta troppo poco abbassa le soglie, se spunta troppo alzale.</p>
  </div>
  <div class="box set" id="boxEval"><h2>Valutazione con un modello linguistico (facoltativa)</h2>
    <p>Valutazione più precisa, che segnala anche gli errori. Usa un servizio esterno con la tua chiave personale: i piani gratuiti hanno limiti giornalieri e possono usare i testi inviati per migliorare i loro modelli. La chiave resta salvata solo in questo browser.</p>
    <label class="switch"><input type="checkbox" id="sLlm" ${settings.llmOn ? "checked" : ""}>Attiva la valutazione con il modello</label>
    <label class="field">Servizio<select id="sPreset">${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}" ${settings.llmPreset === k ? "selected" : ""}>${esc(v.nome)}${hasKey(k) ? " — chiave salvata" : ""}</option>`).join("")}</select></label>
    <p class="note">Ogni servizio ricorda la sua chiave, il suo indirizzo e i suoi modelli: cambiando servizio i campi qui sotto mostrano i valori salvati per quello.</p>
    <div class="row">
      <label class="field">Indirizzo API<input type="text" id="sBase" value="${esc(settings.llmBase)}" autocomplete="off"></label>
      <label class="field">Modello<input type="text" id="sModel" value="${esc(settings.llmModel)}" autocomplete="off" list="modelList" placeholder="Nome del modello"></label>
    </div>
    <label class="field">Modello di riserva (facoltativo: usato se il principale è sovraccarico)<input type="text" id="sFallback" value="${esc(settings.llmFallback || "")}" autocomplete="off" list="modelList" placeholder="Es. un modello flash-lite"></label>
    <datalist id="modelList"></datalist>
    <div class="row"><button class="btn ghost" id="bModels">Mostra i modelli disponibili</button><span class="note" id="modelsOut"></span></div>
    <div id="modelPick"></div>
    <p class="note" id="keyHow"></p>
    <label class="field">Chiave API<input type="password" id="sKey" value="${esc(settings.llmKey)}" autocomplete="off" placeholder="Incolla qui la tua chiave"></label>
    <div class="row"><button class="btn ghost" id="bTest">Prova la connessione</button></div>
    <p class="note" id="testOut"></p>
  </div>`;
  const dz = $("dropzone");
  dz.onclick = () => $("fileDeck").click();
  dz.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("fileDeck").click(); } };
  const showHow = () => {
    const p = PRESETS[$("sPreset").value] || {};
    const el = $("keyHow"); el.textContent = "";
    if (p.come) el.append(document.createTextNode(p.come + " "));
    if (p.chiave) { const a = document.createElement("a"); a.href = p.chiave; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Apri la pagina delle chiavi"; el.append(a); }
  };
  el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
    const all = LS.get(K.imported, {}); delete all[b.dataset.del]; LS.set(K.imported, all); toast("Mazzo rimosso"); loadDeckList().then(renderSettings);
  });
  $("bExp").onclick = exportProgress;
  $("bImp").onclick = () => $("fileProg").click();
  $("bReset").onclick = () => {
    if (!deck || !confirm("Cancellare tutti i risultati di “" + deck.titolo + "”? L’operazione non si può annullare.")) return;
    progress = {}; LS.set(K.progress(deck._key), progress); renderMap(); toast("Progressi cancellati");
  };
  const upd = () => {
    settings.simOn = $("sSim").checked;
    settings.simHigh = Math.min(0.95, Math.max(0.3, parseFloat($("sHigh").value) || DEFAULT_SETTINGS.simHigh));
    settings.simLow = Math.min(settings.simHigh, Math.max(0.2, parseFloat($("sLow").value) || DEFAULT_SETTINGS.simLow));
    settings.llmOn = $("sLlm").checked; settings.llmBase = $("sBase").value.trim(); settings.llmModel = $("sModel").value.trim(); settings.llmFallback = $("sFallback").value.trim(); settings.llmKey = $("sKey").value.trim();
    saveSettings();
  };
  ["sSim", "sHigh", "sLow", "sLlm", "sBase", "sModel", "sFallback", "sKey"].forEach(id => $(id).addEventListener("change", upd));
  $("sKey").addEventListener("change", () => { const o = $("sPreset").selectedOptions[0]; if (o) o.textContent = PRESETS[o.value].nome + (hasKey(o.value) ? " — chiave salvata" : ""); });
  $("sPreset").addEventListener("change", () => {
    upd();                                   // salva i campi del servizio che si sta lasciando
    loadService($("sPreset").value);         // carica quelli del nuovo servizio (o i valori predefiniti)
    $("sBase").value = settings.llmBase; $("sModel").value = settings.llmModel; $("sFallback").value = settings.llmFallback; $("sKey").value = settings.llmKey;
    saveSettings(); showHow(); $("modelPick").innerHTML = ""; $("modelsOut").textContent = ""; $("testOut").textContent = "";
    [...$("sPreset").options].forEach(o => { o.textContent = PRESETS[o.value].nome + (hasKey(o.value) ? " — chiave salvata" : ""); });
  });
  showHow();
  $("bTest").onclick = async () => {
    upd(); const out = $("testOut"); out.className = "note"; out.textContent = "Provo…";
    try {
      const t = await callLlm('Rispondi solo con il JSON {"ok":true}', n => { out.textContent = n === "riserva" ? "Modello principale occupato: provo il modello di riserva…" : "Servizio occupato, nuovo tentativo (" + n + ")…"; });
      parseJsonLoose(t); out.textContent = "Connessione riuscita con " + lastModelUsed + ": la valutazione è pronta.";
    } catch (e) { out.className = "note err"; out.textContent = "Non riuscita: " + (e.message || "errore sconosciuto"); }
  };
  $("bModels").onclick = async () => {
    upd(); const out = $("modelsOut"), pick = $("modelPick"); out.textContent = "Chiedo l’elenco…"; pick.innerHTML = "";
    try {
      let list = await listModels();
      const sel = $("sPreset").value;
      if (sel === "gemini") {
        list = list.filter(m => /(gemini|gemma)/i.test(m) && !/(embedding|image|tts|audio|live|vision|nano)/i.test(m));
        // Gemma per primi: nel piano gratuito hanno limiti giornalieri molto più alti
        list.sort((a, b) => (/gemma/i.test(b) - /gemma/i.test(a)) || a.localeCompare(b));
      }
      if (sel === "openrouter") list = list.filter(m => /:free$/.test(m));
      if (!list.length) { out.textContent = "Nessun modello trovato."; return; }
      out.textContent = list.length + (sel === "openrouter" ? " modelli gratuiti" : " modelli") + ": scegline uno.";
      const dl = $("modelList"); dl.innerHTML = ""; list.forEach(m => { const o = document.createElement("option"); o.value = m; dl.appendChild(o); });
      const s = document.createElement("select"); s.setAttribute("aria-label", "Scegli il modello");
      const o0 = document.createElement("option"); o0.value = ""; o0.textContent = "Scegli un modello…"; s.appendChild(o0);
      list.forEach(m => { const o = document.createElement("option"); o.value = m; o.textContent = m + (/gemma/i.test(m) ? " — limiti gratuiti alti" : ""); if (m === settings.llmModel) o.selected = true; s.appendChild(o); });
      s.onchange = () => { if (s.value) { $("sModel").value = s.value; upd(); toast("Modello principale: " + s.value); } };
      const l1 = document.createElement("label"); l1.className = "field"; l1.textContent = "Modello principale"; l1.appendChild(s); pick.appendChild(l1);
      const s2 = s.cloneNode(true); s2.firstChild.textContent = "Nessun modello di riserva"; s2.value = settings.llmFallback || ""; s2.setAttribute("aria-label", "Scegli il modello di riserva");
      s2.onchange = () => { $("sFallback").value = s2.value; upd(); toast(s2.value ? "Modello di riserva: " + s2.value : "Nessun modello di riserva"); };
      const l2 = document.createElement("label"); l2.className = "field"; l2.textContent = "Modello di riserva"; l2.appendChild(s2); pick.appendChild(l2);
    } catch (e) { out.textContent = "Elenco non disponibile: " + (e.message || "errore") + " Puoi scrivere il nome del modello a mano."; }
  };
}
function exportProgress() {
  const all = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("ef-progressi-")) all[k.replace("ef-progressi-", "")] = LS.get(k, {}); }
  const blob = new Blob([JSON.stringify({ tipo: "exam-flashcards-progressi", data: new Date().toISOString(), progressi: all }, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "progressi-flashcards-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Progressi esportati");
}
function importProgressData(j) {
    Object.entries(j.progressi).forEach(([id, p]) => {
      const mine = LS.get(K.progress(id), {});
      Object.entries(p).forEach(([n, v]) => { if (!mine[n] || (mine[n].t || 0) < (v.t || 0)) mine[n] = v; });
      LS.set(K.progress(id), mine);
    });
    if (deck) progress = LS.get(K.progress(deck._key), {});
    renderMap(); toast("Progressi importati (tenuti i risultati più recenti)");
}
async function importDeckData(d) {
    const errs = validateDeck(d);
    if (errs.length) { alert("Il mazzo non è valido:\n\n" + errs.join("\n")); return; }
    const all = LS.get(K.imported, {}); all[d.id] = d;
    if (!LS.set(K.imported, all)) return;
    toast("Mazzo “" + d.titolo + "” importato");
    await loadDeckList();
    const key = decks.find(x => x.source === "locale" && x.data && x.data.id === d.id);
    if (key) { $("deckSel").value = key.id; await openDeck(key.id); }
    if (!$("viewSet").hidden) renderSettings();
}
async function importFile(f, expect) {
  if (!f) return;
  if (!/\.json$/i.test(f.name) && f.type !== "application/json") { alert("Serve un file .json (il file delle domande o dei progressi)."); return; }
  let j;
  try { j = JSON.parse(await f.text()); } catch (err) { alert("Il file “" + f.name + "” non è un JSON valido."); return; }
  if (j && j.tipo === "exam-flashcards-progressi" && typeof j.progressi === "object") { importProgressData(j); return; }
  if (expect === "progress") { toast("File di progressi non valido"); return; }
  await importDeckData(j);
}
$("fileProg").addEventListener("change", async e => { const f = e.target.files[0]; e.target.value = ""; await importFile(f, "progress"); });
$("fileDeck").addEventListener("change", async e => { const f = e.target.files[0]; e.target.value = ""; await importFile(f, "deck"); });

/* trascinamento di file in qualsiasi punto della pagina */
(function () {
  let depth = 0;
  const ov = $("dropOverlay");
  const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  window.addEventListener("dragenter", e => { if (!hasFiles(e)) return; e.preventDefault(); depth++; ov.hidden = false; const dz = $("dropzone"); if (dz) dz.classList.add("over"); });
  window.addEventListener("dragover", e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  window.addEventListener("dragleave", e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) { ov.hidden = true; const dz = $("dropzone"); if (dz) dz.classList.remove("over"); } });
  window.addEventListener("drop", async e => {
    if (!hasFiles(e)) return; e.preventDefault(); depth = 0; ov.hidden = true;
    const dz = $("dropzone"); if (dz) dz.classList.remove("over");
    const files = [...e.dataTransfer.files];
    for (const f of files) await importFile(f, "deck");
  });
})();

/* ---------- viste ---------- */
function showView(v) {
  [["study", "tabStudy", "viewStudy"], ["stats", "tabStats", "viewStats"], ["set", "tabSet", "viewSet"]].forEach(([name, tab, view]) => {
    $(tab).setAttribute("aria-selected", String(name === v)); $(view).hidden = name !== v;
  });
  if (v === "stats") renderStats();
  if (v === "set") renderSettings();
}
$("tabStudy").addEventListener("click", () => { showView("study"); if (!revealed) renderCard(); });
$("tabStats").addEventListener("click", () => showView("stats"));
$("tabSet").addEventListener("click", () => showView("set"));
$("deckSel").addEventListener("change", e => openDeck(e.target.value));
["fPrio", "fSec", "fOrder"].forEach(id => $(id).addEventListener("change", () => {
  randSeed = Math.random(); renderMap();
  if (!filtered().some(q => q.n === cur)) { cur = null; revealed = false; evalResult = null; }
  renderCard();
}));

loadDeckList();
})();
