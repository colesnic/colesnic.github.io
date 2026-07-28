// Chicago happy-hour dataset.
//
// The canonical data lives in data/happy-hours.json so it can be shared between
// the app (this module) and the database seed script (scripts/seed.mjs).
//
// This data is illustrative and meant to demonstrate the app. Details (times,
// deals, prices) change often — always confirm with the venue before you go.
// Coordinates are approximate neighborhood-level locations, good enough for
// "near me" distance sorting.

import data from "../data/happy-hours.json";

export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface HappyHour {
  id: string;
  name: string;
  neighborhood: string;
  address: string;
  lat: number;
  lng: number;
  /** Days the happy hour runs. */
  days: Day[];
  /** Start time, 24h "HH:MM". */
  start: string;
  /** End time, 24h "HH:MM". */
  end: string;
  /** Short bullet deals. */
  deals: string[];
  /** Searchable tags: drink types, food, atmosphere. */
  categories: string[];
  /** One-line vibe description. */
  vibe: string;
  /** 1 = $, 2 = $$, 3 = $$$. */
  priceLevel: 1 | 2 | 3;
}

export const HAPPY_HOURS: HappyHour[] = data as HappyHour[];
