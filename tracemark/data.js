/*
 * TraceMark — central benchmark data.
 * Single source of truth for every number on this page.
 * All values come from the V2 research sprint results
 * (github.com/colesnic/trace-mark · benchmarks/results/v2/).
 */
window.TRACEMARK_DATA = {
  totalDocuments: 518531,

  corpora: {
    enron: 415671,
    hc3: 85431,
    newsgroups: 17429
  },

  opportunityDensity: {
    synthetic: 13.4,
    enron: 1.25,
    hc3: 1.96
  },

  medianEnronOpportunities: 1,

  enronThresholdReachRate: 0.036,

  // Share of observed watermark capacity contributed by each rule (Enron sample).
  channelShare: {
    apostrophes: 0.42,
    quotes: 0.33
  },

  opportunityIdCollisionRate: 0.11,

  authorStyleMeanMatch: 0.500,

  matchPhi: -0.01,

  adjustedSignificantFalsePositiveRate: 0.0027,

  // Measured attribution accuracy (correct employee, adjusted p < 0.05,
  // >= 20 opportunities) by document length x candidate population.
  attribution: {
    500:  { 10: 0.06, 100: 0.06, 1000: 0.06, 10000: 0.07 },
    1000: { 10: 0.29, 100: 0.27, 1000: 0.26, 10000: 0.28 },
    1500: { 10: 0.70, 100: 0.70, 1000: 0.66, 10000: 0.60 },
    2000: { 10: 0.86, 100: 0.86, 1000: 0.85, 10000: 0.80 }
  },

  // Fictional demo identities only — never real employee names.
  demoEmployees: {
    a: { label: "Employee A", secret: "tracemark-demo-employee-a" },
    b: { label: "Employee B", secret: "tracemark-demo-employee-b" }
  }
};
