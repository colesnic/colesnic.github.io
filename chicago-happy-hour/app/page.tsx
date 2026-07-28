"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/lib/search";

interface Message {
  role: "user" | "assistant";
  content: string;
  results?: SearchResult[];
  degraded?: boolean;
}

const SUGGESTIONS = [
  "Cheap drinks open right now near me",
  "Rooftop cocktails in River North",
  "$1 oysters in the West Loop",
  "Dog-friendly patio with frozen margaritas",
  "Sports bar with wing deals tonight",
];

const DAY_LABELS: Record<string, string> = {
  Mon: "Mon",
  Tue: "Tue",
  Wed: "Wed",
  Thu: "Thu",
  Fri: "Fri",
  Sat: "Sat",
  Sun: "Sun",
};

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  const ampm = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${ampm}` : `${hour12}:${String(m).padStart(2, "0")}${ampm}`;
}

function ResultCard({ r }: { r: SearchResult }) {
  const mapsQuery = encodeURIComponent(`${r.name} ${r.address} Chicago`);
  return (
    <a
      className="card"
      href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
      target="_blank"
      rel="noreferrer"
    >
      <div className="card-head">
        <span className="card-name">{r.name}</span>
        <span className="card-price">{"$".repeat(r.priceLevel)}</span>
      </div>
      <div className="card-meta">
        <span>{r.neighborhood}</span>
        {r.distanceMiles != null && (
          <span className="dot">· {r.distanceMiles.toFixed(1)} mi</span>
        )}
        {r.openAtQueryTime && <span className="open-badge">Open now</span>}
      </div>
      <div className="card-hours">
        {r.days.map((d) => DAY_LABELS[d]).join(" ")} · {formatTime(r.start)}–
        {formatTime(r.end)}
      </div>
      <ul className="card-deals">
        {r.deals.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
      <div className="card-vibe">{r.vibe}</div>
    </a>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locStatus, setLocStatus] = useState<
    "idle" | "loading" | "on" | "denied"
  >("idle");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  function requestLocation() {
    if (locStatus === "on") {
      setCoords(null);
      setLocStatus("idle");
      return;
    }
    if (!navigator.geolocation) {
      setLocStatus("denied");
      return;
    }
    setLocStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus("on");
      },
      () => setLocStatus("denied"),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          location: coords,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply ?? "Something went wrong.",
          results: data.results ?? [],
          degraded: data.degraded,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I couldn't reach the finder just now. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">Chicago Happy Hour</span>
        </div>
        <button
          className={`loc-btn ${locStatus === "on" ? "on" : ""}`}
          onClick={requestLocation}
          type="button"
        >
          {locStatus === "loading"
            ? "Locating…"
            : locStatus === "on"
              ? "📍 Using your location"
              : locStatus === "denied"
                ? "Location off"
                : "📍 Use my location"}
        </button>
      </header>

      <div className="scroll" ref={scrollRef}>
        {empty ? (
          <div className="hero">
            <h1>What are you in the mood for?</h1>
            <p>
              Tell me what you want — a neighborhood, a drink, a vibe, a budget —
              and I&apos;ll find a happy hour for it.
            </p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="thread">
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="bubble">{m.content}</div>
                {m.results && m.results.length > 0 && (
                  <div className="results">
                    {m.results.map((r) => (
                      <ResultCard key={r.id} r={r} />
                    ))}
                  </div>
                )}
                {m.degraded && (
                  <div className="degraded-note">
                    Running in offline mode (no AI key configured) — showing a
                    keyword match.
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="msg assistant">
                <div className="bubble typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. wine bar in Logan Square before 6"
          aria-label="Message"
        />
        <button type="submit" disabled={loading || !input.trim()}>
          ↑
        </button>
      </form>

      <footer className="foot">
        Sample data for demo purposes — always confirm details with the venue.
      </footer>
    </main>
  );
}
