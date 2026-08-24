/* ==========================================================================
   TraceMark — interactive case study
   Organized as small init functions. No framework.
   ========================================================================== */
"use strict";

/* ---------- shared helpers ---------- */

const DATA = window.TRACEMARK_DATA;
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* Optional real HMAC via Web Crypto; falls back to a deterministic hash so the
   demo always works (HTTP + older browsers). Fixed fictional demo secrets only. */
async function hmacBit(secret, id) {
  const message = "tracemark/demo-bit/v1:" + id;
  if (window.crypto && crypto.subtle) {
    try {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
      return new Uint8Array(sig)[0] & 1;
    } catch (_) { /* fall through to hash */ }
  }
  let h = 5381;
  const s = secret + ":" + message;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h & 1;
}

/* ==========================================================================
   1. HERO — animated transformation demo
   ========================================================================== */

const HERO_EXAMPLES = [
  {
    id: "hero-serial",
    from: "We reviewed revenue, expenses and liabilities.",
    to: "We reviewed revenue, expenses, and liabilities.",
    highlight: ", and liabilities.",
    note: "One keyed bit inserts the Oxford comma.",
    bit: 1
  },
  {
    id: "hero-contraction",
    from: "We do not believe the forecast is realistic.",
    to: "We don't believe the forecast is realistic.",
    highlight: "don't",
    note: "Another bit chooses the contracted form.",
    bit: 0
  },
  {
    id: "hero-quote",
    from: "He said \"forecast\" is unrealistic.",
    to: "He said \u201cforecast\u201d is unrealistic.",
    highlight: "\u201cforecast\u201d",
    note: "A third bit picks curly quotes.",
    bit: 1
  }
];

let heroPlaying = false;
let heroIndex = 0;

async function playHeroExample(i, quick) {
  const ex = HERO_EXAMPLES[i];
  const sentence = $("#hero-sentence");
  const bits = $("#keyline-bits");
  const note = $("#hero-note");

  sentence.innerHTML = "";
  note.textContent = "";
  bits.innerHTML = HERO_EXAMPLES.map(() => "\u00b7").join("&nbsp;");
  await delay(quick ? 0 : 250);

  // reveal key bits one at a time
  if (!prefersReduced && !quick) {
    for (let b = 0; b < HERO_EXAMPLES.length; b++) {
      bits.innerHTML = HERO_EXAMPLES.slice(0, b + 1).map((e) => e.bit).join("&nbsp;");
      await delay(340);
    }
  } else {
    bits.innerHTML = HERO_EXAMPLES.map((e) => e.bit).join("&nbsp;");
  }

  sentence.textContent = ex.from;
  await delay(quick ? 0 : 600);

  // transform with highlight
  const idx = ex.to.indexOf(ex.highlight);
  const pre = ex.to.slice(0, idx);
  const hl = ex.to.slice(idx, idx + ex.highlight.length);
  const post = ex.to.slice(idx + ex.highlight.length);
  sentence.innerHTML = "";
  if (pre) sentence.appendChild(document.createTextNode(pre));
  const mark = document.createElement("span");
  mark.className = "hl";
  mark.textContent = hl;
  sentence.appendChild(mark);
  if (post) sentence.appendChild(document.createTextNode(post));

  note.textContent = ex.note;
}

function initHeroDemo() {
  if (prefersReduced) {
    const ex = HERO_EXAMPLES[0];
    $("#keyline-bits").innerHTML = HERO_EXAMPLES.map((e) => e.bit).join("&nbsp;");
    const s = $("#hero-sentence");
    s.innerHTML = "";
    const idx = ex.to.indexOf(ex.highlight);
    s.append(ex.to.slice(0, idx));
    const m = document.createElement("span");
    m.className = "hl";
    m.textContent = ex.highlight;
    s.appendChild(m);
    s.append(ex.to.slice(idx + ex.highlight.length));
    $("#hero-note").textContent = ex.note;
    return;
  }

  $("#hero-replay").addEventListener("click", async () => {
    if (heroPlaying) return;
    heroPlaying = true;
    $("#hero-replay").disabled = true;
    heroIndex = (heroIndex + 1) % HERO_EXAMPLES.length;
    await playHeroExample(heroIndex, false);
    heroPlaying = false;
    $("#hero-replay").disabled = false;
  });

  playHeroExample(heroIndex, false);
}
function replayHeroDemo() { $("#hero-replay").click(); }

/* ==========================================================================
   2. ARCHITECTURE — stage-by-stage walkthrough
   ========================================================================== */

async function runArchitectureAnimation() {
  const stages = $$("#pipeline .stage");
  const caption = $("#pipeline-caption");
  const texts = [
    "Employee holds a secret fingerprint key.",
    "The application sends the request through TraceMark.",
    "The LLM generates text — untouched.",
    "TraceMark finds safe linguistic choices and picks bits.",
    "Fingerprinted response ships to the application."
  ];
  let done = false;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(async (entry) => {
      if (entry.isIntersecting && !done && !prefersReduced) {
        done = true;
        for (let i = 0; i < stages.length; i++) {
          stages.forEach((s) => s.classList.remove("hot"));
          stages[i].classList.add("hot");
          caption.textContent = texts[i];
          await delay(650);
        }
        caption.textContent = "Post-generation only — the model provider is never touched.";
      }
    });
  }, { threshold: 0.4 });
  io.observe($("#pipeline"));
}
function initArchitectureAnimation() { runArchitectureAnimation(); }

/* ==========================================================================
   3. FINGERPRINT DEMO — Employee A / B
   ========================================================================== */

const oppElements = () => $$("#demo-text .opp");

async function renderFingerprintDemo(employeeKey) {
  const emp = DATA.demoEmployees[employeeKey];
  const bits = [];
  const ops = oppElements();
  // compute all bits first
  const bitFor = [];
  for (const el of ops) {
    bitFor.push(await hmacBit(emp.secret, el.dataset.opp));
  }
  const strip = $("#bits-strip");
  const showBits = $("#show-bits").checked;
  strip.textContent = showBits ? bitFor.map((b) => b).join(" ") : "";

  for (let i = 0; i < ops.length; i++) {
    const el = ops[i];
    const one = bitFor[i] === 1;
    el.dataset.chosen = one ? "1" : "0";
    if (one) {
      el.classList.add("flipped");
      el.innerHTML = el.dataset.one + '<span class="opp-badge">' + el.dataset.type + "</span>";
    } else {
      el.classList.remove("flipped");
      el.innerHTML = el.dataset.zero;
    }
    bits.push(bitFor[i]);
  }

  // keep the "copied document" in the detection story consistent
  const docCopied = $("#doc-copied");
  if (docCopied) docCopied.textContent = demoPlainText();
}

/* Build plain text from the demo paragraph (badges excluded). */
function demoPlainText() {
  const root = $("#demo-text");
  let out = "";
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue;
    } else if (node.classList && node.classList.contains("opp")) {
      out += node.dataset.chosen === "1" ? node.dataset.one : node.dataset.zero;
    }
  }
  return out;
}

function initFingerprintDemo() {
  const empA = $("#emp-a");
  const empB = $("#emp-b");
  const showBits = $("#show-bits");

  async function select(aBtn, bBtn, key) {
    aBtn.classList.add("seg-on");
    aBtn.setAttribute("aria-pressed", "true");
    bBtn.classList.remove("seg-on");
    bBtn.setAttribute("aria-pressed", "false");
    await renderFingerprintDemo(key);
  }

  empA.addEventListener("click", () => select(empA, empB, "a"));
  empB.addEventListener("click", () => select(empB, empA, "b"));
  showBits.addEventListener("change", () => {
    const key = empA.classList.contains("seg-on") ? "a" : "b";
    renderFingerprintDemo(key);
  });

  renderFingerprintDemo("a");
}

/* ==========================================================================
   4. DETECTOR — forensic walkthrough
   ========================================================================== */

const DET_SCORES = {
  a: [
    { id: "Employee 104", s: 0.48 },
    { id: "Employee 827", s: 0.52 },
    { id: "Employee 4827", s: 0.94, match: true },
    { id: "Employee 9301", s: 0.49 },
    { id: "Employee 3120", s: 0.51 }
  ],
  b: [
    { id: "Employee 104", s: 0.51 },
    { id: "Employee 827", s: 0.63 },
    { id: "Employee 211", s: 0.91, match: true },
    { id: "Employee 9301", s: 0.48 },
    { id: "Employee 3120", s: 0.55 }
  ]
};

let scanRunning = false;

async function runDetectorAnimation() {
  const empKey = $("#emp-a").classList.contains("seg-on") ? "a" : "b";
  const detector = $("#detector");
  const observed = $("#det-observed");
  const result = $("#det-result");
  const scores = DET_SCORES[empKey];

  detector.classList.add("on");
  result.innerHTML = "";

  // observed bits from the demo fingerprint (in visible paragraph order)
  const emp = DATA.demoEmployees[empKey];
  const oppIds = oppElements().map((el) => el.dataset.opp);
  const obs = [];
  for (const id of oppIds) obs.push(await hmacBit(emp.secret, id));

  observed.textContent = "\u00b7 ".repeat(8).trim();
  if (!prefersReduced) {
    for (let i = 0; i < obs.length; i++) {
      observed.textContent = obs.slice(0, i + 1).join(" ") + " \u00b7".repeat(7 - i);
      await delay(110);
    }
  }
  observed.textContent = obs.join(" ");

  // candidate bars — strongest last
  const container = $("#det-cands");
  container.innerHTML = "";
  const sorted = [...scores].sort((x, y) => (x.match ? 1 : 0) - (y.match ? 1 : 0));
  const bars = sorted.map((c) => {
    const row = document.createElement("div");
    row.className = "cand-row" + (c.match ? " match" : "");
    row.innerHTML =
      '<span class="cand-id">' + c.id + '</span>' +
      '<span class="cand-bar-track"><span class="cand-bar"></span></span>' +
      '<span class="cand-pct">0%</span>';
    container.appendChild(row);
    return { c, row, bar: row.querySelector(".cand-bar"), pct: row.querySelector(".cand-pct") };
  });

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const target = b.c.s * 100;
    if (!prefersReduced) {
      await delay(320);
      b.bar.style.width = target + "%";
    } else {
      b.bar.style.width = target + "%";
    }
    b.pct.textContent = Math.round(target) + "%";
  }

  const best = scores.find((s) => s.match);
  result.innerHTML =
    '<div class="det-best">Best statistical match: ' + best.id + '</div>' +
    '<div class="det-distinction">' +
      '<div class="mono" style="color:var(--muted-2);font-size:0.7rem;letter-spacing:0.18em;margin-bottom:8px">WHAT TRACEMARK ASKS</div>' +
      '<p class="q" style="color:var(--muted-2);font-size:0.86rem;margin-bottom:6px">It does not ask: "Was this written by AI?"</p>' +
      '<p class="q"><strong>It asks: "Does this text match one of our secret fingerprints?"</strong></p>' +
    '</div>';
}

function initDetectorDemo() {
  $("#scan-btn").addEventListener("click", async () => {
    if (scanRunning) return;
    scanRunning = true;
    $("#scan-btn").disabled = true;
    await runDetectorAnimation();
    scanRunning = false;
    $("#scan-btn").disabled = false;
    $("#scan-btn").textContent = "RESCAN";
  });
}

/* ==========================================================================
   5. RESEARCH COUNTERS + CAPACITY BARS
   ========================================================================== */

function animateCount(el, target, dur) {
  if (prefersReduced) { el.textContent = target.toLocaleString(); return; }
  const t0 = performance.now();
  function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function initResearchCounters() {
  if (prefersReduced) {
    $("#counter-docs").textContent = DATA.totalDocuments.toLocaleString();
    $$(".corpus-num").forEach((el) => {
      el.textContent = parseInt(el.dataset.count, 10).toLocaleString();
    });
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCount($("#counter-docs"), DATA.totalDocuments, 1400);
        $$(".corpus-num").forEach((el) => {
          animateCount(el, parseInt(el.dataset.count, 10), 900);
        });
        io.disconnect();
      }
    });
  }, { threshold: 0.35 });
  io.observe($("#counter-docs"));
}

function renderOpportunityDensity() {
  const synth = DATA.opportunityDensity.synthetic;
  const bars = $$("#density-bars .bar-fill");
  const finalWidths = {
    "13.4": 100,
    "1.25": (DATA.opportunityDensity.enron / synth) * 100,
    "1.96": (DATA.opportunityDensity.hc3 / synth) * 100
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        bars.forEach((b) => {
          b.style.width = (prefersReduced ? finalWidths[b.dataset.w] : 0) + "%";
          requestAnimationFrame(() => {
            if (!prefersReduced) b.style.width = finalWidths[b.dataset.w] + "%";
          });
        });
        io.disconnect();
      }
    });
  }, { threshold: 0.4 });
  io.observe($("#density-bars"));
}

/* ==========================================================================
   6. ATTRIBUTION EXPLORER
   ========================================================================== */

function fmtN(v) { return v.toLocaleString("en-US"); }

function updateAttributionResult(words, candidates) {
  const pct = DATA.attribution[words][candidates];
  $("#exp-words").textContent = fmtN(words);
  $("#exp-cands").textContent = fmtN(candidates);
  $("#exp-value").textContent = Math.round(pct * 100) + "%";
  $("#exp-fill").style.width = (prefersReduced ? pct * 100 : 0) + "%";
  requestAnimationFrame(() => {
    if (!prefersReduced) $("#exp-fill").style.width = pct * 100 + "%";
  });
}

function initAttributionExplorer() {
  const wordsSeg = $("#words-seg");
  const candsSeg = $("#cands-seg");
  let words = 1500;
  let candidates = 10000;

  function bind(container, cb) {
    container.querySelectorAll(".seg").forEach((btn) => {
      btn.addEventListener("click", () => {
        container.querySelectorAll(".seg").forEach((b) => b.classList.remove("seg-on"));
        btn.classList.add("seg-on");
        cb(parseInt(btn.dataset.value, 10));
      });
    });
  }
  bind(wordsSeg, (v) => { words = v; updateAttributionResult(words, candidates); });
  bind(candsSeg, (v) => { candidates = v; updateAttributionResult(words, candidates); });

  updateAttributionResult(words, candidates);
}

/* ==========================================================================
   7. SCROLL REVEALS + META
   ========================================================================== */

function initScrollAnimations() {
  if (prefersReduced || !("IntersectionObserver" in window)) {
    $$(".section").forEach((s) => {
      s.classList.remove("reveal-pending");
      s.classList.add("visible");
    });
    return;
  }
  $$(".section").forEach((s) => s.classList.add("reveal-pending"));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.remove("reveal-pending");
        entry.target.classList.add("visible");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.18 });
  $$(".section").forEach((s) => io.observe(s));
}

function applyReducedMotionMode() {
  if (prefersReduced) {
    // final states set immediately
    $$(".section").forEach((s) => {
      s.classList.remove("reveal-pending");
      s.classList.add("visible");
    });
    const synth = DATA.opportunityDensity.synthetic;
    $$("#density-bars .bar-fill").forEach((b) => {
      const widths = { "13.4": 100, "1.25": (1.25 / synth) * 100, "1.96": (1.96 / synth) * 100 };
      b.style.width = widths[b.dataset.w] + "%";
    });
  }
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
  applyReducedMotionMode();
  initScrollAnimations();
  initHeroDemo();
  initArchitectureAnimation();
  initFingerprintDemo();
  initDetectorDemo();
  initResearchCounters();
  renderOpportunityDensity();
  initAttributionExplorer();
});
