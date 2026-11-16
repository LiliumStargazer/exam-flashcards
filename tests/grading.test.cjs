const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../grading.js');
const deck = JSON.parse(fs.readFileSync(path.join(__dirname, '../mazzi/computer-forensics.json'), 'utf8'));
const q = n => deck.domande.find(card => card.n === n);
const at = date => new Date(date).getTime();

test('75 schede: tutte le 73 del PDF e due esercizi, senza numeri mancanti', () => {
  assert.equal(deck.domande.length, 75);
  assert.deepEqual(deck.domande.map(card => card.n), Array.from({ length: 75 }, (_, i) => i + 1));
  for (const card of deck.domande) {
    assert.ok(card.domanda && card.risposta && card.concetti.length);
    assert.ok(Array.isArray(card.essenziali) && card.essenziali.length);
    assert.deepEqual(G.essentialIndices(card), card.essenziali);
  }
});

test('un comando esatto basta nella domanda che chiede SOLO IL COMANDO', () => {
  assert.match(q(14).risposta, /dd if=\/dev\/sdd3 of=\/dev\/sdg2/);
  assert.deepEqual(q(14).essenziali, [0]);
  assert.equal(G.computeScore(q(14), [0]), 100);
  assert.equal(G.computeScore(q(14), []), 0);
});

test('sulla rinomina contano i concetti essenziali, non gli approfondimenti', () => {
  assert.deepEqual(q(19).essenziali, [0, 1]);
  assert.equal(G.computeScore(q(19), [0, 1]), 100);
  assert.equal(G.computeScore(q(19), [0]), 50);
});

test('la scala di Casey verifica ogni livello da C0 a C6', () => {
  assert.ok(q(8).concetti.length >= 8);
  assert.equal(G.computeScore(q(8), q(8).essenziali), 100);
  assert.ok(G.computeScore(q(8), q(8).essenziali.slice(1)) < 100);
});

test('errore essenziale: punteggio limitato a 39', () => {
  assert.equal(G.computeScore(q(19), [0, 1], [], true), 39);
});

test('normalizza indici e rifiuta risposte LLM incomplete', () => {
  const r = G.normalizeEvaluation({
    covered: [0, 0, 1, 999], partial: [1, 2, -1],
    errors: ['errore'], critical_error: false, feedback: 'ok'
  }, q(19));
  assert.deepEqual(r.covered, [0, 1]);
  assert.deepEqual(r.partial, [2]);
  assert.throws(() => G.normalizeEvaluation({ covered: [], partial: [], errors: [], feedback: '' }, q(19)));
});

test('primo 100: da consolidare; secondo 100 in giorno differente: sicura', () => {
  const a = G.nextProgress(100, null, at('2026-11-14T10:00:00Z'));
  const sameDay = G.nextProgress(100, a, at('2026-11-14T15:00:00Z'));
  const later = G.nextProgress(100, sameDay, at('2026-11-16T10:00:00Z'));
  assert.equal(G.progressLabel(a), 'Da consolidare');
  assert.equal(sameDay.goodDays, 1);
  assert.equal(later.goodDays, 2);
  assert.equal(later.st, 'ok');
});

test('una risposta incompleta interrompe la serie di risposte perfette', () => {
  const a = G.nextProgress(100, null, at('2026-11-12T10:00:00Z'));
  const b = G.nextProgress(60, a, at('2026-11-13T10:00:00Z'));
  const c = G.nextProgress(100, b, at('2026-11-16T10:00:00Z'));
  assert.equal(b.goodDays, 0);
  assert.equal(c.st, 'part');
});

test('i progressi legacy restano leggibili', () => {
  const old = { s: 100, st: 'ok', k: 3, t: at('2026-11-12T10:00:00Z') };
  const newer = G.nextProgress(100, old, at('2026-11-16T10:00:00Z'));
  assert.equal(newer.st, 'ok');
  assert.equal(newer.k, 4);
});

test('ripasso settimanale delle domande consolidate', () => {
  const p = G.nextProgress(100, G.nextProgress(100, null, at('2026-10-10T10:00:00Z')), at('2026-10-11T10:00:00Z'));
  assert.equal(G.isReviewDue(p, at('2026-10-18T10:00:00Z')), true);
  assert.equal(G.isReviewDue(p, at('2026-10-15T10:00:00Z')), false);
});

test('filtro trasversale definizioni in tutti gli argomenti', () => {
  for (const n of [1, 6, 16, 17, 28, 29, 34, 39, 45, 57, 68, 69]) {
    assert.equal(q(n).tipo, 'definizione');
  }
});

test('regex del codice fiscale corretta e nuova domanda sulle figure processuali', () => {
  assert.ok(q(35).domanda.includes('[0-9]{2}'));
  assert.ok(!q(35).domanda.includes('{0-9}'));
  assert.ok(q(73).domanda.includes('CTU'));
  assert.ok(q(53).concetti.length === 8);
});

test('fasi del trattamento: il nucleo di ogni fase è separato dagli approfondimenti', () => {
  const card = q(9);
  assert.equal(card.essenziali.length, 5);
  assert.equal(card.concetti.length, 11);
  assert.deepEqual(card.essenziali, [0, 1, 2, 3, 4]);
  assert.ok(card.guida_valutazione.includes('omette'));
  // Esempio reale: identificazione e presentazione corrette,
  // raccolta e valutazione parziali, analisi assente => 60%.
  assert.equal(G.computeScore(card, [0, 4], [1, 3]), 60);
  assert.equal(G.computeScore(card, [0, 4], [1, 3], true), 39);
});

test('limite predefinito Forensics a 700 caratteri', () => {
  assert.equal(deck.max_caratteri, 700);
  assert.equal(G.answerLimit(null, deck), 700);
  assert.equal(G.withinAnswerLimit('a'.repeat(700), q(9), deck), true);
  assert.equal(G.withinAnswerLimit('a'.repeat(701), q(9), deck), false);
});

test('limite modificabile per materia, 0 = illimitato', () => {
  assert.equal(G.answerLimit(null, deck, 450), 450);
  assert.equal(G.answerLimit(null, deck, 0), null);
  assert.equal(G.withinAnswerLimit('a'.repeat(800), q(9), deck, 0), true);
  const otherDeck = {id:'altra-materia',domande:[]};
  assert.equal(G.answerLimit(null, otherDeck), null);
  assert.equal(G.answerLimit(null, otherDeck, 300), 300);
});

test('conteggio comprende spazi e ritorni a capo e non modifica i progressi', () => {
  assert.equal(G.charCount('A B\\nC'.replace('\\n','\n')), 5);
  assert.equal(G.withinAnswerLimit('a'.repeat(701), q(9), deck), false);
  assert.equal(G.computeScore(q(9), [0, 4], [1, 3]), 60);
});
