# Auth Stack Setup — Google OAuth + Cloudflare D1/KV

Internal operator guide for deploying the CTAI auth system.

## Architecture

- **Cloudflare Workers** (Astro SSR) — API routes + middleware
- **D1** (`ctai-users`) — users, API keys (hashed), usage logs
- **KV** (`SESSIONS`) — session tokens with 7-day TTL
- **Google One Tap** — ID token flow (no authorization code, no client secret needed at runtime)

No external auth platforms. Google's signed JWT is verified with Web Crypto API in Workers (~50 lines).

## 1. Google Cloud OAuth Client

### What gcloud can and can't do

The `gcloud` CLI **cannot** create standard Web Application OAuth clients. This is a [known limitation since 2016](https://issuetracker.google.com/issues/35907249) that Google has never fixed. `gcloud iap oauth-clients` only creates IAP-specific clients, which won't work for One Tap.

So: CLI for project/API setup, console for the OAuth client itself.

### Project and APIs (CLI)

```bash
# Install gcloud if needed: https://cloud.google.com/sdk/docs/install
# Then authenticate:
gcloud auth login

# Create project (or skip if reusing existing)
gcloud projects create ctai-prod --name="CTAI" 2>/dev/null || true
gcloud config set project ctai-prod

# Verify you're in the right project
gcloud config get-value project
# → ctai-prod

# Enable required APIs
gcloud services enable people.googleapis.com
gcloud services enable oauth2.googleapis.com

# Verify they're enabled
gcloud services list --enabled --filter="NAME:(people OR oauth2)"
# Should show both
```

### OAuth consent screen (Console — required before creating a client)

Google forces you to configure the consent screen before creating any OAuth client. Go directly to:

```
https://console.cloud.google.com/auth/branding?project=ctai-prod
```

If that URL 404s (Google reshuffles these constantly), try the old path:

```
https://console.cloud.google.com/apis/credentials/consent?project=ctai-prod
```

Or just search "OAuth consent" in the console search bar.

On the branding/consent page:

1. **App name**: `CTAI`
2. **User support email**: your Google email
3. **Authorized domains**: `ctai.info`
4. **Developer contact email**: your email
5. Save

Then find the **Publishing status** section. It will say "Testing" — click **Publish App**. For One Tap with basic scopes (email, profile, openid), Google does **not** require app verification. You just click publish and it's live.

### Create the OAuth client (Console)

Go directly to the client creation page:

```
https://console.cloud.google.com/auth/clients/create?project=ctai-prod
```

Fallback URL if Google moved it:

```
https://console.cloud.google.com/apis/credentials/oauthclient?project=ctai-prod
```

Fill in:

| Field | Value |
|-------|-------|
| Application type | **Web application** |
| Name | `CTAI Web Client` |
| Authorized JavaScript origins | `http://localhost` |
| | `http://localhost:4321` |
| | `https://ctai.info` |
| Authorized redirect URIs | *(leave empty)* |

Click **Create**.

Copy the **Client ID** immediately — it looks like:
```
123456789012-abcdefghijklmnop.apps.googleusercontent.com
```

You'll also see a Client Secret. We don't use it (One Tap uses the ID token flow), but save it somewhere secure anyway.

### Gotchas

- **Client secrets are masked after creation** (since June 2025). You can only see the full secret at creation time.
- **Inactive clients auto-delete** after 6 months with no token exchanges. Google sends a warning email and gives a 30-day restoration window.
- **FedCM is mandatory** for new One Tap integrations (since Aug 2025). Our Dashboard.svelte already sets `use_fedcm_for_prompt: true`. Without it, One Tap silently fails in Chrome — no error, no prompt, nothing.
- **`http://localhost` must be added as a separate origin** from `http://localhost:4321`. Google treats bare localhost and localhost-with-port as different origins, and One Tap needs the bare one during local dev.
- **One Tap only works on HTTPS** in production. localhost is exempt for development.

## 2. Store the Client ID

```bash
# Local dev — append to .env
cat >> .env << 'EOF'
GOOGLE_CLIENT_ID=123456789012-xxx.apps.googleusercontent.com
PUBLIC_GOOGLE_CLIENT_ID=123456789012-xxx.apps.googleusercontent.com
EOF

# Production — add as Cloudflare Pages secret
wrangler pages secret put GOOGLE_CLIENT_ID
# Paste the client ID when prompted
```

`PUBLIC_GOOGLE_CLIENT_ID` is exposed to client-side Svelte code (Astro's `PUBLIC_` prefix convention). `GOOGLE_CLIENT_ID` is used server-side in the JWT verification endpoint.

## 3. Cloudflare D1 (Users Database)

```bash
# Create the database
wrangler d1 create ctai-users
```

Output looks like:
```
✅ Successfully created DB 'ctai-users' in region WNAM
Created your new D1 database.

[[d1_databases]]
binding = "USERS_DB"
database_name = "ctai-users"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "USERS_DB"
database_name = "ctai-users"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # ← paste here
```

Apply the schema:

```bash
wrangler d1 execute ctai-users --file scripts/init-users-db.sql
```

Verify:

```bash
wrangler d1 execute ctai-users --command "SELECT name FROM sqlite_master WHERE type='table';" --json
# Should show: users, api_keys, usage_log
```

## 4. Cloudflare KV (Sessions)

```bash
wrangler kv namespace create SESSIONS
```

Output looks like:
```
🌀 Creating namespace "SESSIONS"
✅ Success!
Add the following to your configuration file in your kv_namespaces array:
[[kv_namespaces]]
binding = "SESSIONS"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Copy the `id` into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SESSIONS"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"   # ← paste here
```

## 5. Deploy

The deploy script handles everything:

```bash
npm run deploy
```

It runs `wrangler d1 execute ctai-users --file scripts/init-users-db.sql` automatically (the schema uses `IF NOT EXISTS` so it's idempotent).

## 6. Verify

```bash
# 1. Visit /dashboard — Google One Tap should appear
open https://ctai.info/dashboard

# 2. Sign in — check the user was created
wrangler d1 execute ctai-users --command "SELECT id, email, tier FROM users;" --json

# 3. Create API key from dashboard, then test it:
curl -s -X POST https://ctai.info/api/research \
  -H "Authorization: Bearer ctai_your-key" \
  -H "Content-Type: application/json" \
  -d '{"phrase": "كتاب الإيقان"}' | python3 -m json.tool | head -20

# 4. Check usage was logged
wrangler d1 execute ctai-users --command "SELECT service, COUNT(*) as n FROM usage_log GROUP BY service;" --json

# 5. Revoke the key from dashboard, then verify 401:
curl -s -X POST https://ctai.info/api/research \
  -H "Authorization: Bearer ctai_your-key" \
  -H "Content-Type: application/json" \
  -d '{"phrase": "test"}' | python3 -m json.tool
# Should return: { "error": "Invalid or revoked API key" }
```

## How it works internally

### One Tap flow

1. User visits `/dashboard` → Google Identity Services script loads
2. `google.accounts.id.initialize()` with our Client ID + FedCM flag
3. Google shows One Tap prompt (browser controls position under FedCM)
4. User clicks → Google returns signed JWT to our `handleCredential` callback
5. Frontend POSTs JWT to `POST /api/auth/google`
6. Server fetches Google's public keys from `googleapis.com/oauth2/v3/certs` (cached 1hr)
7. Verifies RSA-256 signature via `crypto.subtle.verify`
8. Checks claims: `iss` = `accounts.google.com`, `aud` = our Client ID, `exp` > now
9. Upserts user in D1 by `google_id`
10. Creates session token (`crypto.randomUUID`), stores in KV with 7-day TTL
11. Sets `ctai_session` cookie (HttpOnly, Secure, SameSite=Lax)

### API key flow

1. Client sends `Authorization: Bearer ctai_xxx`
2. Middleware hashes key with SHA-256
3. Looks up hash in `api_keys` table (joined with `users`)
4. If found and not revoked → `locals.user` is set, request proceeds
5. `last_used` timestamp updated on the key

### Usage logging

Every API call through middleware is logged to `usage_log`. Research logs `cost_usd = 0`. Relevance captures `response.usage` from Anthropic and calculates:

```
cost = (input_tokens × $0.80 + output_tokens × $4.00) / 1,000,000
```

Logging is fire-and-forget (`.catch()`) — a failed log never blocks the API response.
