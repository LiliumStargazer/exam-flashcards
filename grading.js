/* Regole di valutazione condivise tra browser e test Node.js. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ExamGrading = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function essentialIndices(q) {
    const all = q.concetti.map((_, i) => i);
    if (!Array.isArray(q.essenziali) || !q.essenziali.length) return all;
    const valid = [...new Set(q.essenziali)].filter(i => Number.isInteger(i) && i >= 0 && i < all.length);
    return valid.length ? valid : all;
  }
  function normalizeEvaluation(raw, q) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.covered) || !Array.isArray(raw.partial) ||
        !Array.isArray(raw.errors) || typeof raw.critical_error !== "boolean" || typeof raw.feedback !== "string") {
      throw new Error("il modello non ha restituito tutti i campi della valutazione. Riprova o scegli un altro modello.");
    }
    const indices = a => [...new Set(a.map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < q.concetti.length))];
    const covered = indices(raw.covered);
    return {
      covered,
      partial: indices(raw.partial).filter(i => !covered.includes(i)),
      errors: raw.errors.map(String).filter(Boolean).slice(0, 5),
      critical_error: raw.critical_error,
      feedback: raw.feedback.slice(0, 1200)
    };
  }
  function computeScore(q, covered, partial = [], criticalError = false) {
    const required = essentialIndices(q);
    if (!required.length) return 0;
    const full = new Set(covered);
    const half = new Set(partial);
    let points = 0;
    required.forEach(i => { if (full.has(i)) points += 1; else if (half.has(i)) points += 0.5; });
    const score = Math.round(100 * points / required.length);
    return criticalError ? Math.min(score, 39) : score;
  }
  function studyDay(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function nextProgress(score, previous = null, ts = Date.now()) {
    const s = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    const old = previous || {};
    const day = studyDay(ts);
    const priorDays = Number.isInteger(old.goodDays) && old.goodDays >= 0 ? old.goodDays : old.st === "ok" ? 1 : 0;
    const goodDays = s === 100 ? (old.lastSuccessDay === day ? Math.max(1, priorDays) : priorDays + 1) : 0;
    const st = s === 100 && goodDays >= 2 ? "ok" : s >= 45 ? "part" : "ko";
    return {
      s, st, t: ts, k: (Number(old.k) || 0) + 1,
      goodDays, lastSuccessDay: s === 100 ? day : null
    };
  }
  function progressLabel(record) {
    if (!record) return "Mai fatta";
    if (record.st === "ok") return "Sicura";
    if (record.st === "part" && record.s === 100) return "Da consolidare";
    if (record.st === "part") return "Parziale";
    return "Da rifare";
  }
  function isReviewDue(record, now = Date.now()) {
    return !!(record && record.st === "ok" && Number.isFinite(record.t) && now - record.t >= 7 * 86400000);
  }
  return { essentialIndices, normalizeEvaluation, computeScore, studyDay, nextProgress, progressLabel, isReviewDue };
});
