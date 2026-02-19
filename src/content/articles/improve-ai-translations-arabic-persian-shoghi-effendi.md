---
title: "How to Improve AI Translations of Arabic and Persian Texts Using Shoghi Effendi's Examples"
date: "2026-02-16"
author: "Chad Jones"
excerpt: "A REST API that gathers relevant examples from Shoghi Effendi's translations to inject into AI context — so your translation pipeline can learn from the Guardian's word choices."
---

If you're building translation tools for Arabic or Persian sacred texts, the CTAI API gives you programmatic access to Jafar — a concordance engine that maps every significant word in Shoghi Effendi's translations to the English rendering he chose, organized by trilateral root, across 2,530 passage pairs from 12 major works.

There's also an optional AI-powered relevance filter that scores and ranks results using Claude Haiku. Both are available via simple REST endpoints.

## Quick start

Three steps to your first API call:

1. **Sign in** at [ctai.info/dashboard](/dashboard) using Google One Tap
2. **Create an API key** from the dashboard — copy it immediately (it's shown once)
3. **Make a request:**

```bash
curl -X POST https://ctai.info/api/research \
  -H "Authorization: Bearer ctai_your-key-here" \
  -H "Content-Type: application/json" \
  -d '{"phrase": "نار الحبّ", "source_lang": "ar"}'
```

That's it. You get back a JSON object with every occurrence of each word, grouped by root, with the English rendering Shoghi Effendi used in each passage.

## What Jafar returns

When you query the research endpoint with an Arabic or Persian phrase, Jafar breaks it into significant words (skipping particles like "و", "في", "از"), looks up each word by its trilateral root, and returns every occurrence across the corpus.

Here's what a response looks like for `نار الحبّ` ("the fire of love"):

```json
{
  "terms": [
    {
      "word": "نار",
      "root": "ن-و-ر",
      "transliteration": "nār",
      "meaning": "fire",
      "rows": [
        {
          "form": "نار",
          "en": "fire",
          "src": "...قد اشتعلت نار الحبّ في...",
          "tr": "...the fire of love hath been kindled within...",
          "ref": "Hidden Words§15"
        },
        {
          "form": "بالنار",
          "en": "by fire",
          "src": "...يمتحن بالنار...",
          "tr": "...tested by fire...",
          "ref": "Kitab-i-Iqan§102"
        }
      ]
    },
    {
      "word": "حبّ",
      "root": "ح-ب-ب",
      "transliteration": "ḥubb",
      "meaning": "love",
      "rows": [
        {
          "form": "الحبّ",
          "en": "love",
          "src": "...نار الحبّ الذي...",
          "tr": "...the fire of love that...",
          "ref": "Hidden Words§15"
        }
      ]
    }
  ]
}
```

Each term includes:
- **word** — the original word from your query
- **root** — the trilateral Arabic root
- **transliteration** and **meaning** — English rendering of the root
- **rows** — every occurrence in the corpus, each with:
  - **form** — the actual morphological form found in the text (may differ from your query due to prefixes, suffixes, broken plurals)
  - **en** — the English word Shoghi Effendi used
  - **src** / **tr** — short excerpts from the source and translation
  - **ref** — the work name and passage index (`Work§123`)

This is a pure database lookup — no AI involved, no token costs. Responses are typically under 100ms.

## Filtering by relevance

A raw concordance search can return dozens of rows per term, including passages where the word appears in a completely different sense. The relevance endpoint fixes this.

Send the original phrase plus the terms you got back from research:

```bash
curl -X POST https://ctai.info/api/relevance \
  -H "Authorization: Bearer ctai_your-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "phrase": "نار الحبّ",
    "terms": [... terms array from /api/research ...]
  }'
```

Claude Haiku scores each row 0–10 for relevance to your original phrase, drops anything below 4, and sorts the rest by score. You get back the same `{ terms }` structure, but filtered to the passages that actually matter.

This endpoint does call the Anthropic API, so it has real costs — roughly $0.001–0.003 per request at current Haiku pricing. More on costs below.

## The two-step pattern

The typical integration calls research first, then optionally relevance:

```javascript
const API_KEY = 'ctai_your-key-here';
const BASE = 'https://ctai.info/api';

async function lookup(phrase, lang = 'ar', filterRelevance = false) {
  const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };

  // Step 1: concordance lookup (free, fast)
  const res = await fetch(`${BASE}/research`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phrase, source_lang: lang }),
  });
  const data = await res.json();

  if (!filterRelevance || !data.terms?.length) return data;

  // Step 2: relevance filter (costs tokens, but much better results)
  const relRes = await fetch(`${BASE}/relevance`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phrase, terms: data.terms }),
  });
  return relRes.json();
}
```

For simple lookups — "what did Shoghi Effendi do with this word?" — step 1 alone is plenty. For research where you're comparing specific usages in context, the relevance filter is worth the fraction-of-a-cent cost.

Here's the same thing in Python:

```python
import requests

API_KEY = "ctai_your-key-here"
BASE = "https://ctai.info/api"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

def lookup(phrase, lang="ar", filter_relevance=False):
    # Step 1: concordance
    res = requests.post(f"{BASE}/research",
        headers=HEADERS,
        json={"phrase": phrase, "source_lang": lang})
    data = res.json()

    if not filter_relevance or not data.get("terms"):
        return data

    # Step 2: relevance filter
    rel = requests.post(f"{BASE}/relevance",
        headers=HEADERS,
        json={"phrase": phrase, "terms": data["terms"]})
    return rel.json()

result = lookup("نار الحبّ", filter_relevance=True)
for term in result["terms"]:
    print(f"{term['word']} ({term['root']}): {len(term['rows'])} occurrences")
    for row in term["rows"][:3]:
        print(f"  {row['form']} → \"{row['en']}\" — {row['ref']}")
```

## Authentication

### API keys (for scripts and integrations)

Generate a key from the [dashboard](/dashboard). Keys look like `ctai_` followed by a UUID:

```
ctai_a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

Pass it as a Bearer token in the `Authorization` header. The key is shown once at creation — copy it before closing the dialog. We store a SHA-256 hash, never the plaintext.

You can create multiple keys (one per project, one per environment, etc.) and revoke any of them independently from the dashboard.

### Session cookies (for browser apps)

If you're building a web app that runs in the browser, you can skip API keys entirely. Have users sign in via Google One Tap on your page (using the CTAI client), and the session cookie handles auth automatically. This is how the CTAI dashboard itself works.

## Tiers and pricing

| Tier | Cost | Rate limit | Services |
|------|------|------------|----------|
| free | $0 | 200 req/day | Jafar concordance |
| pro | $20/mo + usage | 10,000 req/day | All (concordance + relevance + future) |
| enterprise | Custom | Custom | All + priority support |

The free tier is genuinely free. Jafar concordance lookups are pure database queries with no AI cost to us. The rate limit is there to prevent abuse, not to push you toward paid plans.

The pro tier unlocks the relevance filter and future AI-powered services (document segmentation, full translation). You pay the $20 base plus actual AI costs — visible in real time on your dashboard.

## Checking your usage

The usage endpoint returns a breakdown for the current billing period:

```bash
curl https://ctai.info/api/usage \
  -H "Authorization: Bearer ctai_your-key-here"
```

```json
{
  "period_start": "2026-02-01T00:00:00.000Z",
  "services": [
    { "service": "jafar", "requests": 142, "total_tokens_in": 0, "total_tokens_out": 0, "total_cost": 0 },
    { "service": "relevance", "requests": 38, "total_tokens_in": 45200, "total_tokens_out": 12800, "total_cost": 0.0874 }
  ],
  "totals": { "requests": 180, "cost": 0.0874 },
  "tier": "free"
}
```

The dashboard shows the same data in a friendlier format. Every request is logged — even the free ones (for rate limiting).

## Error handling

All error responses are JSON with an `error` field:

```json
{ "error": "Authentication required" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request — missing or invalid `phrase` |
| 401 | No valid API key or session cookie |
| 429 | Rate limit exceeded (not yet enforced, coming soon) |
| 500 | Server error — something broke on our end |

A 401 means either your key is wrong, revoked, or missing. Double-check the `Authorization` header format: `Bearer ctai_...` with a space after "Bearer".

## Endpoint reference

| Method | Path | Auth | Cost | Description |
|--------|------|------|------|-------------|
| POST | `/api/research` | Required | Free | Concordance lookup by phrase |
| POST | `/api/relevance` | Required | ~$0.002/req | AI relevance scoring of concordance results |
| GET | `/api/usage` | Required | Free | Usage stats for current billing period |
| GET | `/api/keys` | Session | Free | List your API keys |
| POST | `/api/keys` | Session | Free | Generate a new API key |
| DELETE | `/api/keys/:id` | Session | Free | Revoke an API key |
| GET | `/api/auth/me` | Optional | Free | Current user info (or null) |
| POST | `/api/auth/google` | None | Free | Google One Tap sign-in |
| POST | `/api/auth/logout` | Session | Free | Sign out |

The key management and auth endpoints use session cookies (browser only). The research, relevance, and usage endpoints accept either session cookies or API keys.

## What's coming

The concordance and relevance filter are the first two services. Planned:

- **Document segmentation** — split a text into translatable units (sentences, clauses, or semantic chunks) suitable for parallel translation
- **Document translation** — full AI translation pipeline using Shoghi Effendi's patterns as a style reference

These will be pro-tier services with per-request AI costs, using the same API key authentication and usage tracking.
