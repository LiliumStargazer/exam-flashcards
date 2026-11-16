const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const J = require('../judge.js');
const G = require('../grading.js');
const deck = JSON.parse(fs.readFileSync(path.join(__dirname, '../mazzi/computer-forensics.json'), 'utf8'));
const q = n => deck.domande.find(item => item.n === n);
const v = (index, status, evidence = '', explanation = '') => ({index, status, evidence, explanation});
function raw(question, changes = {}, issues = []) {
  return {
    concepts: question.concetti.map((_, index) => changes[index] || v(index, 'absent')),
    issues,
    feedback: 'Valutazione motivata'
  };
}
test('valutazione per singola affermazione con citazioni letterali', () => {
  const question = q(19);
  const answer = "L'impronta non cambia: il nome non entra nel contenuto del file.";
  const result = J.normalize(raw(question, {
    0: v(0, 'supported', "L'impronta non cambia"),
    1: v(1, 'supported', 'il nome non entra nel contenuto del file')
  }), question, answer);
  assert.deepEqual(result.covered, [0, 1]);
  assert.equal(result.critical_error, false);
  assert.equal(G.computeScore(question, result.covered, result.partial, result.critical_error), 100);
});
test('contraddizione essenziale produce errore critico e tetto al punteggio', () => {
  const question = q(19);
  const answer = "Quando rinomino il file, il suo hash cambia.";
  const result = J.normalize(raw(question, {0: v(0, 'contradicted', "il suo hash cambia", 'La rinomina non altera il contenuto.') }), question, answer);
  assert.equal(result.critical_error, true);
  assert.deepEqual(result.contradicted, [0]);
  assert.equal(G.computeScore(question, [0, 1], [], result.critical_error), 39);
});
test('nessuna contraddizione per un concetto semplicemente mancante', () => {
  const question = q(19);
  const answer = 'La funzione di hash produce una stringa.';
  const result = J.normalize(raw(question), question, answer);
  assert.deepEqual(result.covered, []);
  assert.deepEqual(result.contradicted, []);
  assert.equal(result.critical_error, false);
});
test('rifiuta prove testuali inventate, incomplete o duplicate', () => {
  const question = q(19), answer = 'L’hash non cambia.';
  assert.throws(() => J.normalize(raw(question, {0:v(0,'supported','frase inesistente')}), question, answer), /citazione|cita la risposta/);
  const truncated = raw(question);
  truncated.concepts.pop();
  assert.throws(() => J.normalize(truncated, question, answer), /tutti i concetti/);
  const duplicated = raw(question);
  duplicated.concepts[1].index = 0;
  assert.throws(() => J.normalize(duplicated, question, answer), /indici/);
  assert.throws(() => J.normalize(raw(question, {}, [{description:'sbagliato',evidence:'nessuna prova',critical:true}]), question, answer), /citazione|cita la risposta/);
});
test('una contraddizione su un approfondimento non è automaticamente critica', () => {
  const question = q(19), answer = 'L’hash di un file resta uguale, ma non esiste signature analysis.';
  const result = J.normalize(raw(question, {3:v(3,'contradicted','non esiste signature analysis','La signature analysis esiste.')}), question, answer);
  assert.equal(result.critical_error, false);
  assert.deepEqual(result.errors, ['La signature analysis esiste.']);
});
test('errore ulteriore citato come critical in issues viene segnalato', () => {
  const question = q(19), answer = "Il file contiene dati e l'hash puo cambiare senza alcuna ragione.";
  const result = J.normalize(raw(question, {}, [{description:'Errore fondamentale aggiuntivo',evidence:"l'hash puo cambiare senza alcuna ragione",critical:true}]), question, answer);
  assert.equal(result.critical_error, true);
});
test('JSON Schema rigoroso solo con modelli Groq GPT-OSS compatibili', () => {
  assert.equal(J.schemaFor('groq', 'openai/gpt-oss-120b').type, 'json_schema');
  assert.equal(J.schemaFor('groq', 'openai/gpt-oss-20b').json_schema.strict, true);
  assert.equal(J.schemaFor('gemini', 'gemini-2.5-flash'), null);
  assert.equal(J.schemaFor('groq', 'llama-3.3-70b-versatile'), null);
  assert.equal(J.GROQ_FORMAT.json_schema.schema.additionalProperties, false);
});
test('comando dd corretto senza API; ordine invertito respinto', () => {
  let result = J.evaluateRules(q(14), 'dd if=/dev/sdd3 of=/dev/sdg2');
  assert.equal(result.source, 'rules');
  assert.deepEqual(result.covered, [0]);
  result = J.evaluateRules(q(14), 'dd if=/dev/sdg2 of=/dev/sdd3');
  assert.equal(result.critical_error, true);
  assert.deepEqual(result.contradicted, [0]);
});
test('wiping e immagine: espressioni supportate e incomplete', () => {
  assert.equal(J.evaluateRules(q(15), 'sudo dd if=/dev/zero of=/dev/sda bs=1M').covered.length, 1);
  const a = J.evaluateRules(q(75), 'mount /dev/sdg1 /mnt/hdesterno\ndd if=/dev/sdd of=/mnt/hdesterno/reperto.dd');
  assert.deepEqual(a.covered, [0, 1]);
  const b = J.evaluateRules(q(75), 'mount /dev/sdg1 /mnt/hdesterno');
  assert.deepEqual(b.covered, [0]);
  assert.equal(b.critical_error, false);
});
test('script sospetti o risposte discorsive non passano per le regole', () => {
  assert.equal(J.evaluateRules(q(14), 'dd if=/dev/sdd3 of=/dev/sdg2; echo ok'), null);
  assert.equal(J.evaluateRules(q(14), 'Ho usato dd e ho copiato la partizione.'), null);
  assert.equal(J.evaluateRules(q(17), 'Una funzione hash è deterministica.'), null);
  assert.equal(J.parseDd('dd if=/dev/zero of=/dev/sda status=progress').of, '/dev/sda');
});

test('i nuclei delle cinque fasi possono ricevere punteggio parziale senza errore critico', () => {
  const question = q(9);
  const answer = 'identificazione: si provvede a identificare i componenti che contengono i dati.\\nacquisizione: si effettuano delle copie con software forensi e write blocker.\\nvalutazione: si analizzano i dati cercando di capirne la compatibilità con il reato.\\npresentazione: si espongono i dati in modo comprensibile.';
  const result = J.normalize(raw(question, {
    0: v(0, 'supported', 'identificare i componenti che contengono i dati'),
    1: v(1, 'partial', 'si effettuano delle copie con software forensi e write blocker'),
    3: v(3, 'partial', 'compatibilità con il reato'),
    4: v(4, 'supported', 'si espongono i dati in modo comprensibile')
  }), question, answer);
  assert.deepEqual(result.covered, [0, 4]);
  assert.deepEqual(result.partial, [1, 3]);
  assert.equal(result.critical_error, false);
  assert.equal(G.computeScore(question, result.covered, result.partial, result.critical_error), 60);
});
