import { useState } from "react";

/* ============================================================
   CHANGE ONLY THIS BLOCK WHEN THE TOPIC IS ANNOUNCED
   ============================================================ */
const CONFIG = {
  appName: "HACKBOX",
  headline: "Ask anything. Get answers instantly.",
  subline: "An AI tool built in under two hours.",
  placeholder: "Type here and hit Enter...",
  buttonLabel: "Generate",
  quickPrompts: ["Give me 3 ideas", "Explain it simply", "Make a plan", "Surprise me"],
  nav: ["Home", "Features", "About"],

  // Who the AI is / what it does for this topic
  systemPrompt: "You are a helpful assistant. Keep answers concise and useful.",

  // true  -> AI must reply with JSON, page renders it as cards (best for lists, plans, quizzes, recipes...)
  // false -> AI replies in plain text
  jsonMode: true,
  // Describe the JSON shape you want (only used when jsonMode = true). Examples:
  //   '{ "title": string, "summary": string, "steps": string[] }'
  //   '[ { "name": string, "description": string } ]'
  schemaHint: '{ "title": string, "summary": string, "points": string[] }',
};

/* ============================================================
   GROQ CONFIG
   ------------------------------------------------------------
   Paste your (new, rotated) key below. Never commit this file with
   a real key, screen-share this block, or publish it publicly.
   ============================================================ */
const GROQ_API_KEY = "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";
const GROQ_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];

/* ============================================================
   AI FUNCTION
   Never throws. Returns { ok: true, data } or { ok: false, error }.
   ============================================================ */
async function askAI(promptText) {
  if (!GROQ_API_KEY) {
    return { ok: false, error: "Groq API key not set. Edit GROQ_API_KEY in the config block." };
  }

  let error = "Could not reach the AI. Check your connection and try again.";

  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: promptText }],
        }),
      });
      const data = await res.json();

      // Errors (bad key, bad model, rate limit) have an "error" field and no "choices"
      if (!res.ok) {
        error = data?.error?.message || `Request failed (${res.status})`;
        console.error(`Groq error [${model}]:`, error);
        continue; // try the next model
      }

      const raw = data?.choices?.[0]?.message?.content?.trim();
      if (!raw) {
        error = "The AI returned an empty response.";
        continue;
      }

      // Strip markdown code fences if the model adds them
      const cleaned = raw.replace(/```json|```/g, "").trim();

      // Try to parse as JSON; fall back to raw text if it's not JSON
      try {
        return { ok: true, data: JSON.parse(cleaned) };
      } catch {
        return { ok: true, data: cleaned };
      }
    } catch (err) {
      console.error("AI call failed:", err); // network / CORS
    }
  }

  return { ok: false, error };
}

function buildPrompt(userText) {
  const format = CONFIG.jsonMode
    ? `Respond ONLY with valid JSON matching this shape, no extra text, no markdown fences: ${CONFIG.schemaHint}`
    : "Respond in plain text.";
  return `${CONFIG.systemPrompt}\n\n${format}\n\nRequest: ${userText}`;
}

/* ============================================================
   UNIVERSAL RENDERER — shows string / array / object / nested JSON
   ============================================================ */
const COLORS = ["bg-primary", "bg-secondary", "bg-accent", "bg-paper"];
const prettyKey = (k) => k.replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
const isPrimitive = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);

function Value({ data }) {
  if (isPrimitive(data)) return <span className="whitespace-pre-wrap">{String(data)}</span>;

  if (Array.isArray(data)) {
    if (data.every(isPrimitive)) {
      return (
        <ul className="ml-1 flex flex-col gap-2">
          {data.map((d, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-bold">■</span>
              <span>{String(d)}</span>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {data.map((d, i) => (
          <div key={i} className={`nb-box p-4 ${COLORS[i % COLORS.length]}`} style={{ boxShadow: "var(--shadow-sm)" }}>
            <Value data={d} />
          </div>
        ))}
      </div>
    );
  }

  // object
  return (
    <div className="flex flex-col gap-3">
      {Object.entries(data).map(([k, v]) => (
        <div key={k}>
          <div className="font-mono-nb mb-1 text-xs font-bold">{prettyKey(k)}</div>
          <Value data={v} />
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   PAGE COMPONENTS
   ============================================================ */
function Navbar() {
  const [open, setOpen] = useState(false);
  const links = (
    <>
      {CONFIG.nav.map((item) => (
        <li key={item}>
          <a href={`#${item.toLowerCase()}`} className="nb-btn w-full sm:w-auto" onClick={() => setOpen(false)}>
            {item}
          </a>
        </li>
      ))}
      <li>
        <a href="#ai" className="nb-btn nb-btn-ink w-full sm:w-auto" onClick={() => setOpen(false)}>Try it</a>
      </li>
    </>
  );

  return (
    <header className="bg-primary sticky top-0 z-10" style={{ borderBottom: "var(--bw) solid var(--ink)" }}>
      <nav className="mx-auto max-w-5xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <a href="#" className="min-w-0 truncate text-2xl font-bold tracking-tight">{CONFIG.appName}</a>
          {/* desktop links */}
          <ul className="hidden items-center gap-2 sm:flex">{links}</ul>
          {/* mobile menu button (wrapper hides it on desktop) */}
          <div className="sm:hidden">
            <button className="nb-btn nb-btn-ink" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? "Close" : "Menu"}
            </button>
          </div>
        </div>
        {/* mobile dropdown */}
        {open && <ul className="mt-3 flex flex-col gap-2 sm:hidden">{links}</ul>}
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section id="home" className="mx-auto max-w-5xl px-4 pt-14 pb-6">
      <span className="nb-tag">Built with Groq</span>
      <h1 className="mt-4 max-w-3xl break-words text-4xl sm:text-7xl">{CONFIG.headline}</h1>
      <p className="mt-4 max-w-xl text-lg font-medium">{CONFIG.subline}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href="#ai" className="nb-btn nb-btn-primary">Start now</a>
        <a href="#features" className="nb-btn nb-btn-secondary">See features</a>
      </div>
    </section>
  );
}

function ResultCard({ item, onClear }) {
  const { q, ok, data, error } = item;
  const copyText = typeof data === "string" ? data : JSON.stringify(data, null, 2);

  return (
    <article className="nb-box overflow-hidden">
      <div className="bg-ink flex items-center justify-between gap-3 px-4 py-2">
        <span className="font-mono-nb min-w-0 truncate text-sm font-bold">{q}</span>
        <div className="flex shrink-0 gap-2">
          {ok && (
            <button className="nb-btn !px-3 !py-1 text-sm" onClick={() => navigator.clipboard?.writeText(copyText)}>
              Copy
            </button>
          )}
          <button className="nb-btn nb-btn-secondary !px-3 !py-1 text-sm" onClick={onClear}>
            Delete
          </button>
        </div>
      </div>
      <div className="min-w-0 break-words p-5 [overflow-wrap:anywhere]">
        {!ok ? (
          <p className="bg-secondary nb-box p-3 font-bold" style={{ boxShadow: "var(--shadow-sm)" }}>
            {error || "The AI request failed. Try again."}
          </p>
        ) : (
          <Value data={data} />
        )}
      </div>
    </article>
  );
}

function AIPanel() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]); // newest first

  async function run(text = input) {
    const q = text.trim();
    if (!q || loading) return;
    setInput("");
    setLoading(true);

    // finally guarantees the button never gets stuck on "Thinking..."
    try {
      const result = await askAI(buildPrompt(q));
      setResults((r) => [{ id: Date.now(), q, ...result }, ...r]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="ai" className="mx-auto max-w-5xl px-4 py-10">
      {/* input bar */}
      <div className="nb-box bg-secondary p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="nb-input"
            value={input}
            placeholder={CONFIG.placeholder}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            aria-label="Your request"
          />
          <button className="nb-btn nb-btn-primary sm:w-40" onClick={() => run()} disabled={loading || !input.trim()}>
            {loading ? "Thinking..." : CONFIG.buttonLabel}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {CONFIG.quickPrompts.map((q) => (
            <button key={q} className="nb-chip" onClick={() => run(q)} disabled={loading}>{q}</button>
          ))}
          {results.length > 0 && (
            <button className="nb-btn ml-auto !px-3 !py-1 text-sm" onClick={() => setResults([])}>
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* results */}
      <div className="mt-8 flex flex-col gap-6" aria-live="polite">
        {loading && (
          <div className="nb-box bg-accent p-5 font-bold">
            The AI is working<span className="nb-cursor">▌</span>
          </div>
        )}
        {!loading && results.length === 0 && (
          <div className="nb-box p-6 text-center font-bold">
            Nothing yet. Type a request above or pick a quick prompt.
          </div>
        )}
        {results.map((item) => (
          <ResultCard
            key={item.id}
            item={item}
            onClear={() => setResults((r) => r.filter((x) => x.id !== item.id))}
          />
        ))}
      </div>
    </section>
  );
}

function Features() {
  const items = [
    ["Fast", "bg-primary", "Ask once and get a structured answer."],
    ["Free", "bg-secondary", "Groq's OSS models, no backend needed."],
    ["Flexible", "bg-accent", "Edit the config block to fit any topic."],
  ];
  return (
    <section id="features" className="mx-auto max-w-5xl px-4 py-10">
      <h2 className="mb-6 text-4xl">Features</h2>
      <div className="grid gap-5 sm:grid-cols-3">
        {items.map(([t, c, d]) => (
          <div key={t} className={`nb-box p-5 ${c}`}>
            <h3 className="text-2xl">{t}</h3>
            <p className="mt-2 font-medium">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   BANNER — paste any image link below to change the photo/text
   ============================================================ */
const BANNER = {
  image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSYPuIJnxF4XoyDRmKS6zYA5ZdwmFDgewtvoa_oqSfH6w&s=10",
  alt: "Website banner",
  title: "What is this website?",
  text: "HACKBOX is an AI-powered tool that turns your questions into clear, structured answers in seconds. Type a request, hit Generate, and get ideas, plans and explanations as neat cards you can copy or delete. No sign-up, no waiting.",
};

function Banner() {
  return (
    <section className="mx-auto max-w-5xl px-4 pt-10">
      <figure className="nb-box overflow-hidden" style={{ boxShadow: "var(--shadow)" }}>
        <img
          src={BANNER.image}
          alt={BANNER.alt}
          referrerPolicy="no-referrer"
          className="block h-64 w-full object-cover sm:h-96"
          style={{ borderBottom: "var(--bw) solid var(--ink)" }}
        />
        <figcaption className="bg-primary p-5">
          <span className="nb-tag">About</span>
          <h2 className="mt-3 text-3xl sm:text-4xl">{BANNER.title}</h2>
          <p className="mt-2 max-w-3xl text-lg font-medium">{BANNER.text}</p>
        </figcaption>
      </figure>
    </section>
  );
}

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Banner />
        <Hero />
        <AIPanel />
        <Features />
      </main>
      <footer id="about" className="bg-ink mt-10 px-4 py-6 text-center font-mono-nb text-sm">
        {CONFIG.appName} · Calcutta Boys' School
      </footer>
    </>
  );
}