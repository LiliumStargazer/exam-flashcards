/* Verifica per singola affermazione: una chiamata API oppure regole pure per comandi Linux.
   Nessun modello viene eseguito nel browser. Compatibile con Node.js per i test. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ExamJudge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERDICTS = ["supported", "partial", "contradicted", "absent"];
  const SCHEMA = {
    type: "object",
    properties: {
      concepts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            status: { type: "string", enum: VERDICTS },
            evidence: { type: "string" },
            explanation: { type: "string" }
          },
          required: ["index", "status", "evidence", "explanation"],
          additionalProperties: false
        }
      },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            evidence: { type: "string" },
            critical: { type: "boolean" }
          },
          required: ["description", "evidence", "critical"],
          additionalProperties: false
        }
      },
      feedback: { type: "string" }
    },
    required: ["concepts", "issues", "feedback"],
    additionalProperties: false
  };
  const GROQ_FORMAT = {
    type: "json_schema",
    json_schema: { name: "exam_concept_judge", strict: true, schema: SCHEMA }
  };

  function canon(s) {
    return String(s || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("it");
  }
  function isEvidence(answer, quote) {
    const needle = canon(quote);
    return needle.length >= 2 && canon(answer).includes(needle);
  }
  function normalize(raw, question, answer) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.concepts) ||
        !Array.isArray(raw.issues) || typeof raw.feedback !== "string") {
      throw new Error("Valutazione API incompleta: mancano concetti, errori o feedback.");
    }
    if (raw.concepts.length !== question.concetti.length) {
      throw new Error("Valutazione incompleta: il modello non ha controllato tutti i concetti.");
    }
    const seen = new Set(), judgments = [];
    for (const j of raw.concepts) {
      if (!j || !Number.isInteger(j.index) || j.index < 0 || j.index >= question.concetti.length ||
          seen.has(j.index) || !VERDICTS.includes(j.status) ||
          typeof j.evidence !== "string" || typeof j.explanation !== "string") {
        throw new Error("Valutazione API non coerente: indici o stati dei concetti non validi.");
      }
      seen.add(j.index);
      if (j.status !== "absent" && !isEvidence(answer, j.evidence)) {
        throw new Error("Valutazione non verificabile: una citazione non compare nella risposta.");
      }
      judgments.push({
        index: j.index, status: j.status,
        evidence: j.status === "absent" ? "" : j.evidence.trim().slice(0, 450),
        explanation: j.explanation.trim().slice(0, 350)
      });
    }
    judgments.sort((a, b) => a.index - b.index);
    const essential = new Set(Array.isArray(question.essenziali) && question.essenziali.length
      ? question.essenziali : question.concetti.map((_, i) => i));
    const issues = [];
    for (const issue of raw.issues.slice(0, 8)) {
      if (!issue || typeof issue.description !== "string" ||
          typeof issue.evidence !== "string" || typeof issue.critical !== "boolean" ||
          !isEvidence(answer, issue.evidence)) {
        throw new Error("Valutazione non verificabile: un errore segnalato non cita la risposta.");
      }
      issues.push({
        description: issue.description.trim().slice(0, 350),
        evidence: issue.evidence.trim().slice(0, 450),
        critical: issue.critical
      });
    }
    const contradicted = judgments.filter(j => j.status === "contradicted");
    const errors = [
      ...contradicted.map(j => j.explanation || "Concetto contraddetto: " + question.concetti[j.index]),
      ...issues.map(i => i.description)
    ].filter(Boolean).slice(0, 8);
    return {
      covered: judgments.filter(j => j.status === "supported").map(j => j.index),
      partial: judgments.filter(j => j.status === "partial").map(j => j.index),
      contradicted: contradicted.map(j => j.index),
      judgments, issues, errors,
      critical_error: contradicted.some(j => essential.has(j.index)) || issues.some(i => i.critical),
      feedback: raw.feedback.trim().slice(0, 1200),
      source: "api"
    };
  }
  function schemaFor(preset, model) {
    return preset === "groq" && /^openai\/gpt-oss-(20b|120b)$/.test(model) ? GROQ_FORMAT : null;
  }

  // Analisi puramente testuale dei comandi. Non vengono MAI eseguiti.
  function stripCode(s) {
    return String(s || "").trim()
      .replace(/^\x60{3}(?:bash|sh)?\s*\n?/i, "").replace(/\n?\x60{3}\s*$/, "")
      .replace(/^\$\s*/, "").trim();
  }
  function parseDd(s) {
    const cmd = stripCode(s);
    if (cmd.includes("\n") || /[;|&<>]/.test(cmd)) return null;
    const words = cmd.split(/\s+/);
    if (words[0] === "sudo") words.shift();
    if (words.shift() !== "dd" || !words.length) return null;
    const args = {};
    for (const item of words) {
      const m = /^(if|of|bs|status|conv)=(\S+)$/.exec(item);
      if (!m || Object.hasOwn(args, m[1])) return null;
      if (m[1] === "bs" && !/^[1-9]\d*[kKmMgGtT]?$/.test(m[2])) return null;
      if (m[1] === "status" && !["none", "progress"].includes(m[2])) return null;
      if (m[1] === "conv" && !["fsync", "fdatasync", "sync", "noerror,sync"].includes(m[2])) return null;
      args[m[1]] = m[2];
    }
    return args.if && args.of ? { ...args, command: cmd } : null;
  }
  function parseMount(s) {
    const cmd = stripCode(s);
    const m = /^(?:sudo\s+)?mount\s+(\S+)\s+(\S+)$/.exec(cmd);
    return m ? { device: m[1], path: m[2], command: cmd } : null;
  }
  function makeRule(question, answer, states, feedback) {
    const concepts = question.concetti.map((_, index) => {
      const st = states[index] || { status: "absent", evidence: "", explanation: "" };
      return { index, ...st };
    });
    const checked = normalize({ concepts, issues: [], feedback }, question, answer);
    checked.source = "rules";
    return checked;
  }
  function verdict(ok, evidence, right, wrong) {
    return { status: ok ? "supported" : "contradicted", evidence, explanation: ok ? right : wrong };
  }
  function evaluateRules(question, answer) {
    const n = question.n;
    if (n === 14 || n === 15) {
      const dd = parseDd(answer);
      if (!dd) return null;
      const ok = n === 14
        ? dd.if === "/dev/sdd3" && dd.of === "/dev/sdg2"
        : ["/dev/zero", "/dev/urandom"].includes(dd.if) && dd.of === "/dev/sda";
      const reason = n === 14
        ? "La clonazione richiede if=/dev/sdd3 e of=/dev/sdg2, in questo verso."
        : "Il wiping richiesto deve scrivere sul disco /dev/sda usando un flusso di sovrascrittura.";
      return makeRule(question, answer, {
        0: verdict(ok, dd.command, "Sorgente e destinazione corrette.", reason)
      }, ok ? "Comando corretto e sufficiente per la domanda." : reason);
    }
    if (n === 75) {
      const source = stripCode(answer);
      const lines = source.split(/\n+/).map(x => x.trim()).filter(Boolean);
      if (lines.length < 1 || lines.length > 2) return null;
      const kinds = lines.map(line => ({
        line,
        kind: /^(?:sudo\s+)?mount\s/.test(line) ? "mount" : /^(?:sudo\s+)?dd\s/.test(line) ? "dd" : "other"
      }));
      if (kinds.some(x => x.kind === "other") || new Set(kinds.map(x => x.kind)).size !== kinds.length) return null;
      const statuses = {};
      const mountLine = kinds.find(x => x.kind === "mount");
      if (mountLine) {
        const m = parseMount(mountLine.line);
        const ok = !!m && m.device === "/dev/sdg1" && m.path === "/mnt/hdesterno";
        statuses[0] = verdict(ok, mountLine.line, "Disco esterno montato nella cartella corretta.", "Il comando mount deve usare /dev/sdg1 e /mnt/hdesterno.");
      }
      const ddLine = kinds.find(x => x.kind === "dd");
      if (ddLine) {
        const d = parseDd(ddLine.line);
        const ok = !!d && d.if === "/dev/sdd" &&
          /^\/mnt\/hdesterno\/[^/]+$/.test(d.of) && !d.of.includes("..");
        statuses[1] = verdict(ok, ddLine.line, "Immagine creata sul disco esterno da /dev/sdd.", "Il file immagine deve essere creato a partire da /dev/sdd sul disco montato.");
      }
      return makeRule(question, answer, statuses, "Ho verificato i comandi Linux in modo deterministico. I comandi presenti devono avere sorgente e destinazione corrette.");
    }
    return null;
  }
  return { SCHEMA, GROQ_FORMAT, schemaFor, isEvidence, normalize, evaluateRules, parseDd };
});
