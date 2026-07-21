# LLM setup — free path first

Deep-Skim talks to any **OpenAI-compatible** Chat Completions endpoint:

```
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}   # when required
```

**Default for this build: Google Gemini free tier**  
`https://generativelanguage.googleapis.com/v1beta/openai/` · `gemini-3.5-flash`

## Important: chat subscriptions ≠ API

| Subscription | Works in Deep-Skim? |
|--------------|---------------------|
| **Claude Pro / Max** | **No** — covers claude.ai + official Claude Code, not third-party apps |
| **SuperGrok** | **No** — chat product only; API is separate at console.x.ai |
| **Gemini free API key** | **Yes** |
| **Groq free API key** | **Yes** |
| **Ollama (local)** | **Yes** — no key |
| **Claude via OpenRouter / Anthropic API** | **Yes, but paid** (separate from Claude Pro) |

---

## Free option A — Gemini (recommended free cloud)

1. Open [Google AI Studio → API key](https://aistudio.google.com/apikey).
2. Create a key (free tier; check current rate limits in AI Studio).
3. Deep-Skim → **Settings** → **Use free Gemini defaults**.
4. Paste key → tick cloud acknowledgment → **Save** → **Test connection**.
5. Generate a deep-skim from a ready PDF.

| Field | Value |
|--------|--------|
| Provider | Google Gemini (free tier) |
| Base URL | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| Model | `gemini-3.5-flash` (alt: `gemini-3.1-flash-lite`; avoid `gemini-2.5-flash` on new keys) |
| API key | from AI Studio |

Privacy: extracted text goes to Google for that request. PDFs stay in your browser.

---

## Free option B — Groq

1. Key: [https://console.groq.com/keys](https://console.groq.com/keys)
2. Provider: **Groq (free tier)**
3. Model: `llama-3.3-70b-versatile` (or another free Groq model)
4. Base URL: `https://api.groq.com/openai/v1`

Very fast; rate limits on free tier. Fine for one skim/week if you stay under limits.

---

## Free option C — Ollama (local · private)

```bash
ollama pull llama3.2   # or qwen2.5:14b / mistral-small for better quality
OLLAMA_ORIGINS="http://localhost:8080,http://127.0.0.1:8080" ollama serve
```

Settings → **Use Ollama** (no API key). Text never leaves the machine.

---

## Free option D — OpenRouter free models

1. Key: [https://openrouter.ai/keys](https://openrouter.ai/keys)
2. Provider: OpenRouter
3. Model: `openrouter/free` or any model id ending in `:free` from their catalog

---

## Low-cost option — DeepSeek (recommended if free tier feels weak)

DeepSeek is OpenAI-compatible and usually excellent for **claims, stress-tests, and non-generic structure**. Pricing is typically far below frontier US APIs; check the platform for any signup balance.

1. Key: [https://platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
2. Settings → **Use DeepSeek** (or provider **DeepSeek**)
3. Defaults:

| Field | Value |
|--------|--------|
| Base URL | `https://api.deepseek.com/v1` |
| Model | `deepseek-v4-flash` (fast/cheap) or `deepseek-v4-pro` (higher quality) |
| API key | from DeepSeek platform |

Docs: [api-docs.deepseek.com](https://api-docs.deepseek.com/)

---

## Low-cost option — Kimi / Moonshot (long context)

Kimi is strong when extracts are long (large `maxContextChars`). OpenAI-compatible.

1. Key via [platform.kimi.ai](https://platform.kimi.ai) / Moonshot console  
2. Settings → **Use Kimi**

| Field | Value |
|--------|--------|
| Base URL | `https://api.moonshot.ai/v1` |
| Model | `kimi-k2.5` (or current Kimi model id from their docs) |
| API key | Moonshot / Kimi key |

If your region uses the CN endpoint, set Base URL to `https://api.moonshot.cn/v1` instead (Custom or edit the field after picking Kimi).

Also available on OpenRouter as e.g. `moonshotai/kimi-k2.5`.

---

## Paid options (optional later)

### Grok API

Not covered by SuperGrok. Needs [console.x.ai](https://console.x.ai) key + API credits (check console for any free-credit / data-sharing offers).

### Claude quality

Claude Pro **does not** feed Deep-Skim. Options:

1. **OpenRouter** + `anthropic/claude-…` (pay-per-token), or  
2. **Anthropic API** billing + LiteLLM/custom proxy (native Anthropic API is not OpenAI-shaped; use a gateway).

### OpenAI

`https://api.openai.com/v1` + paid key.

---

## Substantial condensed reading + multipass

Deep-Skim aims for a **condensed reading** you can study — not a thin abstract:

| Source | Target notes (approx.) |
|--------|-------------------------|
| ~200pp book | **10–20 pages** |
| ~500pp book | **25–50 pages** |

§2 is the main reading (claim blocks with mechanism/evidence). Counts for quotes, models, and recall scale with source size (`src/generation/depth.js`).

### Long books — multipass (map → staged reduce)

When extract length **> Max source characters** (default 120 000) and multipass is on:

1. **Map** — dense cards per chunk (claims + mechanisms, many verbatim candidates, local narrative).
2. **Staged reduce** — three writes: **A** §1–2 · **B** §3–4 · **C** §5–8, then assemble.

Medium single-pass jobs also use staged A/B/C when the depth estimator says the target is ≥ ~10 note-pages.

| Setting | Default | Role |
|---------|---------|------|
| Multipass for long books | on | Master switch |
| Map chunk size | 55 000 chars | Source text per map call |
| Max map passes | 12 | Cap free-tier cost/time |
| Max source characters | 120 000 | Single-pass window **and** multipass trigger |

Progress: `Multipass map n/N` → `writing part A/B/C`. Tags: `multipass`, `maps×N`. Model: `… · multipass×6 · staged×3`.

**Tradeoff:** more API calls and time; far more argumentative flesh. On free-tier 429s, lower max maps or wait (auto-retry helps).

---

## Multi-week projects (long books · save tokens)

For ~**200+ page** works, prefer a **multi-week project** instead of one full-book multipass:

1. Open the document → **Start multi-week project** (or accept the prompt when generating).
2. App splits pages into weekly bands (~200 pp/week by default — Settings).
3. **Generate week N** sends **only that page band** to the model.
4. When all weeks are done → **Generate full synthesis** from weekly notes (still no full-PDF re-send).

| Benefit | How |
|---------|-----|
| Token savings | Week band ≪ whole book |
| Pacing | One substantial skim per calendar week |
| Coverage | Each band gets its own §1–§9 + long-reads |
| Synthesis | Merge week notes at the end |

Sidebar → **Projects** tracks progress. Weekly skims stay in Summaries with tags `week-N` / `multi-week`.

---

## Privacy model

| Data | Where it lives |
|------|----------------|
| PDF bytes, extractions, summaries, quizzes | Browser IndexedDB |
| API keys | Browser IndexedDB |
| Deep-Skim server | None |
| Cloud free tiers | Extracted text leaves for generation |
| Ollama | Stays local |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Want free | Gemini, Groq, or Ollama presets |
| Claude sub doesn’t work | Expected — use free Gemini or paid Claude API |
| Save blocked: API key | Cloud presets need a key |
| Save blocked: acknowledgment | Tick the cloud checkbox |
| 401 | Bad key |
| 404 / “no longer available to new users” | **Model** blocked/wrong (key can still be fine). Settings → `gemini-3.5-flash` → Save |
| Generate fails but Test connection OK | Test only hits `/models`; generation uses the selected model id |
| 429 | Free-tier rate limit — wait or lower `maxContextChars` |
| CORS / Failed to fetch | Ollama: set `OLLAMA_ORIGINS`; cloud: try another browser or local proxy |
| Old model still saved | Click **Use free Gemini** and Save (refreshes default model) |

Keys never leave your browser except as `Authorization` to the endpoint you configure.
