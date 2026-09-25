import { useState, useEffect, useCallback } from "react";

const CONFIG = {
  appName: "STONKS",
  headline: "Explore ways to understand stocks like never before",
  subline: ".",
  placeholder: "Ask Questions Regarding Stocks...",
  buttonLabel: "ask AI",
  quickPrompts: [],
  nav: [
    { label: "Home", href: "#home" },
    { label: "AI Analysis", href: "#ai" },
    { label: "Portfolio", href: "#portfolio" },
  ],

  systemPrompt: "You are a helpful stock assistant. Keep answers concise and useful.",

  jsonMode: true,
  schemaHint: '{ "title": string, "brief": string, "points": string[] }',
};


const GROQ_API_KEY = import.meta.env.GROQ_API_KEY;
const GROQ_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];

const INDIAN_STOCK_API_KEY = "sk-live-DPNFi4VVOo0VEKFwOcFfUOTPjoWYLprQY7aA5KCP";
const INDIAN_STOCK_API_BASE = "https://stock.indianapi.in";


let cachedStockData = null;

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

      if (!res.ok) {
        error = data?.error?.message || `Request failed (${res.status})`;
        console.error(`Groq error [${model}]:`, error);
        continue; 
      }

      const raw = data?.choices?.[0]?.message?.content?.trim();
      if (!raw) {
        error = "The AI returned an empty response.";
        continue;
      }

      const cleaned = raw.replace(/```json|```/g, "").trim();

      try {
        return { ok: true, data: JSON.parse(cleaned) };
      } catch {
        return { ok: true, data: cleaned };
      }
    } catch (err) {
      console.error("AI call failed:", err); 
    }
  }

  return { ok: false, error };
}

function buildPrompt(userText) {
  const format = CONFIG.jsonMode
    ? `Respond ONLY with valid JSON matching this shape, no extra text, no markdown fences: ${CONFIG.schemaHint}`
    : "Respond in plain text.";
  const context = cachedStockData
    ? `\n\nCurrent Indian market data (JSON, may be partial — use it if relevant): ${JSON.stringify(cachedStockData)}`
    : "";
  return `${CONFIG.systemPrompt}${context}\n\n${format}\n\nRequest: ${userText}`;
}


function normalizeStock(raw) {
  const priceRaw =
    raw.price ??
    raw.last_price ??
    raw.close_price ??
    raw.ltp ??
    raw.currentPrice?.NSE ??
    raw.currentPrice?.BSE;
  const changeRaw =
    raw.percent_change ??
    raw.net_change ??
    raw.change ??
    raw.change_percent ??
    raw.percentChange;
  const price = priceRaw !== undefined && priceRaw !== null ? Number(priceRaw) : null;
  const change = changeRaw !== undefined && changeRaw !== null ? Number(changeRaw) : null;

  return {
    name:
      raw.company_name ||
      raw.companyName ||
      raw.name ||
      raw.ticker_id ||
      raw.symbol ||
      "Unknown",
    price,
    change: Number.isNaN(change) ? null : change,
  };
}

async function fetchTrendingStocks() {
  if (!INDIAN_STOCK_API_KEY) {
    return { ok: false, error: "IndianAPI key not set. Edit INDIAN_STOCK_API_KEY in the config block." };
  }

  try {
    const res = await fetch(`${INDIAN_STOCK_API_BASE}/trending`, {
      headers: { "X-Api-Key": INDIAN_STOCK_API_KEY },
    });

    if (!res.ok) {
      let detail = `Request failed (${res.status})`;
      try {
        const errBody = await res.json();
        detail = errBody?.message || errBody?.error || detail;
      } catch {
      
      }
      return { ok: false, error: detail };
    }

    const data = await res.json();
    cachedStockData = data;
    const gainersRaw = data?.trending_stocks?.top_gainers || data?.top_gainers || [];
    const losersRaw = data?.trending_stocks?.top_losers || data?.top_losers || [];

    return {
      ok: true,
      gainers: gainersRaw.map(normalizeStock),
      losers: losersRaw.map(normalizeStock),
    };
  } catch (err) {
    console.error("Stock fetch failed:", err); 
    return { ok: false, error: "Could not reach the stock API. Check your connection and try again." };
  }
}

async function fetchStockByName(name) {
  if (!INDIAN_STOCK_API_KEY) {
    return { ok: false, error: "IndianAPI key not set. Edit INDIAN_STOCK_API_KEY in the config block." };
  }

  try {
    const res = await fetch(`${INDIAN_STOCK_API_BASE}/stock?name=${encodeURIComponent(name)}`, {
      headers: { "X-Api-Key": INDIAN_STOCK_API_KEY },
    });

    if (!res.ok) {
      let detail = `Request failed (${res.status})`;
      try {
        const errBody = await res.json();
        detail = errBody?.message || errBody?.error || detail;
      } catch {
     
      }
      return { ok: false, error: detail };
    }

    const data = await res.json();
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return { ok: false, error: `No stock found for "${name}".` };
    }

    const stock = normalizeStock(Array.isArray(data) ? data[0] : data);
    return { ok: true, stock };
  } catch (err) {
    console.error("Stock search failed:", err);
    return { ok: false, error: "Could not reach the stock API. Check your connection and try again." };
  }
}

function StockRow({ stock }) {
  const up = (stock.change ?? 0) >= 0;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b-2 border-ink/10 py-2 last:border-b-0">
      <div className="min-w-0 flex-1 basis-40">
        <div className="truncate font-bold">{stock.name}</div>
      </div>
      <div className="shrink-0 whitespace-nowrap text-right">
        {stock.price !== null && (
          <div className="font-mono-nb font-bold">₹{stock.price.toLocaleString("en-IN")}</div>
        )}
        {stock.change !== null && (
          <div className={`font-mono-nb text-sm font-bold ${up ? "text-green-700" : "text-red-700"}`}>
            {up ? "▲" : "▼"} {Math.abs(stock.change).toFixed(2)}%
          </div>
        )}
      </div>
    </li>
  );
}


function StockChart({ gainers, losers, searched }) {
  const bars = [
    ...gainers.slice(0, 5),
    ...losers.slice(0, 5),
    ...searched,
  ].filter((s) => s.change !== null);
  if (bars.length === 0) return null;

  const width = 700;
  const height = 220;
  const padding = { top: 16, right: 12, bottom: 46, left: 12 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const maxAbs = Math.max(1, ...bars.map((s) => Math.abs(s.change)));
  const barW = plotW / bars.length;
  const zeroY = padding.top + plotH / 2;
  const scale = (plotH / 2) / maxAbs;

  return (
    <div className="nb-box bg-paper mb-4 overflow-x-auto p-4" style={{ boxShadow: "var(--shadow-sm)" }}>
      <h3 className="mb-2 text-xl">% change — gainers vs losers</h3>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ minWidth: 480 }}
        role="img"
        aria-label="Bar chart of percent change for top gainers and losers"
      >
        
        <line x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY} stroke="var(--ink)" strokeWidth="2" />

        {bars.map((s, i) => {
          const barHeight = Math.abs(s.change) * scale;
          const x = padding.left + i * barW + barW * 0.15;
          const w = barW * 0.7;
          const up = s.change >= 0;
          const y = up ? zeroY - barHeight : zeroY;
          const label = s.name;

          return (
            <g key={`${label}-${i}`}>
              <rect
                x={x}
                y={y}
                width={w}
                height={Math.max(barHeight, 1)}
                fill={up ? "#15803d" : "#b91c1c"}
                stroke="var(--ink)"
                strokeWidth="2"
              />
              <text
                x={x + w / 2}
                y={zeroY + 16}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="var(--ink)"
              >
                {label.length > 10 ? `${label.slice(0, 10)}…` : label}
              </text>
              <text
                x={x + w / 2}
                y={up ? y - 4 : y + barHeight + 12}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="var(--ink)"
              >
                {up ? "+" : ""}
                {s.change.toFixed(1)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function StockBanner() {
  const [state, setState] = useState({ loading: true, ok: false, gainers: [], losers: [], error: null });
  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searched, setSearched] = useState([]); 

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const result = await fetchTrendingStocks();
    if (result.ok) {
      setState({ loading: false, ok: true, gainers: result.gainers, losers: result.losers, error: null });
    } else {
      setState((s) => ({ ...s, loading: false, ok: false, error: result.error }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runSearch() {
    const name = query.trim();
    if (!name || searchLoading) return;
    setSearchLoading(true);
    setSearchError(null);

    const result = await fetchStockByName(name);
    if (result.ok) {
      setSearched((prev) => [result.stock, ...prev.filter((s) => s.name !== result.stock.name)]);
      setQuery("");
    } else {
      setSearchError(result.error);
    }
    setSearchLoading(false);
  }

  function removeSearched(name) {
    setSearched((prev) => prev.filter((s) => s.name !== name));
  }

  return (
    <section className="mx-auto max-w-5xl px-4 pt-10">
      <div className="nb-box overflow-hidden" style={{ boxShadow: "var(--shadow)" }}>
        <div className="bg-primary flex flex-wrap items-center justify-between gap-3 p-5" style={{ borderBottom: "var(--bw) solid var(--ink)" }}>
          <div>
            <span className="nb-tag">Live market</span>
            <h2 className="mt-3 text-3xl sm:text-4xl">What's moving today</h2>
            <p className="mt-2 max-w-3xl text-lg font-medium">
              Trending NSE/BSE movers, pulled live from the Indian Stock Market API.
            </p>
          </div>
          <button className="nb-btn nb-btn-ink shrink-0" onClick={load} disabled={state.loading}>
            {state.loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="p-5">
 
          <div className="nb-box bg-secondary mb-4 p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="nb-input"
                value={query}
                placeholder="Search any stock, e.g. Tata Motors"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                aria-label="Search for a stock"
              />
              <button
                className="nb-btn nb-btn-primary sm:w-40"
                onClick={runSearch}
                disabled={searchLoading || !query.trim()}
              >
                {searchLoading ? "Searching..." : "Search"}
              </button>
            </div>
            {searchError && (
              <div className="nb-box bg-paper mt-3 p-3 font-bold">{searchError}</div>
            )}
            {searched.length > 0 && (
              <ul className="mt-3">
                {searched.map((s) => (
                  <li key={s.name} className="flex items-center gap-2">
                    <div className="flex-1">
                      <StockRow stock={s} />
                    </div>
                    <button
                      className="nb-btn !px-3 !py-1 text-sm"
                      onClick={() => removeSearched(s.name)}
                      aria-label={`Remove ${s.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {state.loading && (
            <div className="nb-box bg-accent p-5 text-center font-bold">
              Fetching live prices<span className="nb-cursor">▌</span>
            </div>
          )}

          {!state.loading && !state.ok && (
            <>
              <div className="nb-box bg-secondary p-4 font-bold">{state.error || "Couldn't load market data."}</div>
              {searched.length > 0 && <StockChart gainers={[]} losers={[]} searched={searched} />}
            </>
          )}

          {!state.loading && state.ok && (
            <>
              <StockChart gainers={state.gainers} losers={state.losers} searched={searched} />
              <div className="grid gap-4 sm:grid-cols-2">
              <div className="nb-box bg-paper p-4" style={{ boxShadow: "var(--shadow-sm)" }}>
                <h3 className="mb-2 text-xl">Top gainers</h3>
                {state.gainers.length === 0 ? (
                  <p className="font-medium opacity-70">No gainers data right now.</p>
                ) : (
                  <ul>
                    {state.gainers.slice(0, 5).map((s, i) => (
                      <StockRow key={`${s.name}-${i}`} stock={s} />
                    ))}
                  </ul>
                )}
              </div>

              <div className="nb-box bg-paper p-4" style={{ boxShadow: "var(--shadow-sm)" }}>
                <h3 className="mb-2 text-xl">Top losers</h3>
                {state.losers.length === 0 ? (
                  <p className="font-medium opacity-70">No losers data right now.</p>
                ) : (
                  <ul>
                    {state.losers.slice(0, 5).map((s, i) => (
                      <StockRow key={`${s.name}-${i}`} stock={s} />
                    ))}
                  </ul>
                )}
              </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

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

function Navbar() {
  const [open, setOpen] = useState(false);
  const links = (
    <>
      {CONFIG.nav.map((item) => (
        <li key={item.label}>
          <a href={item.href} className="nb-btn w-full sm:w-auto" onClick={() => setOpen(false)}>
            {item.label}
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
  
          <ul className="hidden items-center gap-2 sm:flex">{links}</ul>
         
          <div className="sm:hidden">
            <button className="nb-btn nb-btn-ink" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? "Close" : "Menu"}
            </button>
          </div>
        </div>
        {open && <ul className="mt-3 flex flex-col gap-2 sm:hidden">{links}</ul>}
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-4 pt-14 pb-6">
      <span className="nb-tag">Explore</span>
      <h1 className="mt-4 max-w-3xl break-words text-4xl sm:text-7xl">{CONFIG.headline}</h1>
      <p className="mt-4 max-w-xl text-lg font-medium">{CONFIG.subline}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href="#ai" className="nb-btn nb-btn-primary">Start now</a>
        <a href="#features" className="nb-btn nb-btn-secondary">See features</a>
      </div>
    </section>
  );
}

const TOP_IMAGE = {
  src: "https://media1.tenor.com/m/9ClrP6PgrCUAAAAd/mine-count.gif",
  alt: "Stock market chart",
};

function TopImage() {
  return (
    <section className="mx-auto max-w-5xl px-4 pt-10">
      <div className="nb-box overflow-hidden" style={{ boxShadow: "var(--shadow)" }}>
        <img
          src={TOP_IMAGE.src}
          alt={TOP_IMAGE.alt}
          referrerPolicy="no-referrer"
          className="block h-64 w-full object-cover sm:h-96"
          style={{ borderBottom: "var(--bw) solid var(--ink)" }}
        />   
      </div>
    </section>
  );
}

function StocksExplainer() {
  const topics = [
    [
      "What's a stock?",
      "A stock is a small slice of ownership in a company. Buy one and you own a tiny piece of that business — its profits, its losses, all of it.",
    ],
    [
      "NSE vs BSE",
      "India's two big exchanges. The National Stock Exchange and Bombay Stock Exchange are where these ownership slices actually get bought and sold every trading day.",
    ],
    [
      "Gainers & losers",
      "\"Top gainers\" rose the most today, \"top losers\" fell the most. It's a snapshot of the day's trading, not a verdict on whether the company is good or bad.",
    ],
    [
      "% change",
      "How much a stock's price moved versus yesterday's closing price. +2% means it's up 2% since the last close; -2% means it's down.",
    ],
  ];

  return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      <span className="nb-tag">Learn</span>
      <h2 className="mt-3 mb-6 text-4xl">Stocks, explained</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        {topics.map(([t, d], i) => (
          <div key={t} className={`nb-box p-5 ${COLORS[i % COLORS.length]}`}>
            <h3 className="text-2xl">{t}</h3>
            <p className="mt-2 font-medium">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Portfolio() {
  return (
    <section id="portfolio" className="mx-auto max-w-5xl px-4 py-10">
      <span className="nb-tag">Coming soon</span>
      <h2 className="mt-3 mb-4 text-4xl">Your portfolio</h2>
      <div className="nb-box bg-paper p-6 text-center font-bold">
        Holdings tracking isn't built yet — for now, use the search bar above the live market
        data to look up any stock.
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
  const [results, setResults] = useState([]); 

  async function run(text = input) {
    const q = text.trim();
    if (!q || loading) return;
    setInput("");
    setLoading(true);

    try {
      const result = await askAI(buildPrompt(q));
      setResults((r) => [{ id: Date.now(), q, ...result }, ...r]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="ai" className="mx-auto max-w-5xl px-4 py-10">

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
    ["Safe", "bg-accent", "Our AI collects no data"],
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

export default function App() {
  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <Navbar />
      <main>
        <div id="home">
          
          <StocksExplainer />
        </div>
        <StockBanner />
        <Hero /> 
        <AIPanel />
        <Portfolio />
        <Features />
        <TopImage />
      </main>
      <footer id="about" className="bg-ink mt-10 px-4 py-6 text-center font-mono-nb text-sm">
        STONKS · Calcutta Boys' School
      </footer>
    </div>
  );
}

