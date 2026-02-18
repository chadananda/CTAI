#!/usr/bin/env bash
set -euo pipefail

# ── CTAI Deploy Script ──
# Builds the Astro site, migrates D1 database, deploys to Cloudflare Pages
# Usage: ./scripts/deploy.sh [--skip-audit] [--skip-d1]

SKIP_AUDIT=false
SKIP_D1=false
for arg in "$@"; do
  case $arg in
    --skip-audit) SKIP_AUDIT=true ;;
    --skip-d1) SKIP_D1=true ;;
  esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "\n${GREEN}▸ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

# ── Pre-flight checks ──
step "Pre-flight checks"
command -v wrangler >/dev/null 2>&1 || fail "wrangler CLI not found. Install: npm i -g wrangler"
command -v npx >/dev/null 2>&1 || fail "npx not found"

# Verify jafar.db exists
if [ ! -f "data/jafar.db" ]; then
  fail "data/jafar.db not found. Run: npm run build-jafar"
fi
echo "  jafar.db: $(du -h data/jafar.db | cut -f1)"

# ── Security audit ──
if [ "$SKIP_AUDIT" = false ]; then
  step "Security audit — scanning for secrets"

  # Check for common secret patterns in tracked files
  SECRETS_FOUND=false

  # Check .env files aren't tracked
  if git ls-files --error-unmatch .env 2>/dev/null; then
    fail ".env is tracked by git! Remove it: git rm --cached .env"
  fi

  # Scan for hardcoded API keys/tokens in source files
  if grep -rn --include='*.js' --include='*.ts' --include='*.astro' --include='*.svelte' \
    -E '(sk-ant-|sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|ghp_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9\-]{20,})' \
    src/ scripts/ 2>/dev/null; then
    fail "Potential secrets found in source files! Remove them before deploying."
  fi

  # Check for sensitive files that shouldn't be deployed
  for f in .env .env.local .env.production credentials.json; do
    if [ -f "$f" ] && git ls-files --error-unmatch "$f" 2>/dev/null; then
      fail "$f is tracked by git!"
    fi
  done

  echo "  No secrets detected in source files"

  # ── SEO audit ──
  step "SEO audit — checking critical pages"

  # Check that key pages have meta titles and descriptions
  SEO_ISSUES=0

  # Check index page for title and meta description
  if ! grep -q '<title' src/layouts/Base.astro 2>/dev/null; then
    warn "Base layout missing <title> tag"
    SEO_ISSUES=$((SEO_ISSUES + 1))
  fi

  if ! grep -q 'meta.*description' src/layouts/Base.astro 2>/dev/null; then
    warn "Base layout missing meta description"
    SEO_ISSUES=$((SEO_ISSUES + 1))
  fi

  # Check for sitemap
  if ! grep -q 'sitemap' astro.config.mjs 2>/dev/null && ! [ -f "public/sitemap.xml" ]; then
    warn "No sitemap configured — consider adding @astrojs/sitemap"
    SEO_ISSUES=$((SEO_ISSUES + 1))
  fi

  # Check for robots.txt
  if ! [ -f "public/robots.txt" ]; then
    warn "No robots.txt found"
    SEO_ISSUES=$((SEO_ISSUES + 1))
  fi

  # Check for Open Graph tags
  if ! grep -q 'og:title\|og:description\|og:image' src/layouts/Base.astro 2>/dev/null; then
    warn "Missing Open Graph meta tags in Base layout"
    SEO_ISSUES=$((SEO_ISSUES + 1))
  fi

  if [ $SEO_ISSUES -gt 0 ]; then
    warn "$SEO_ISSUES SEO issues found (non-blocking)"
  else
    echo "  SEO checks passed"
  fi

  # ── npm audit ──
  step "Dependency audit"
  npm audit --production 2>/dev/null || warn "npm audit found vulnerabilities (review manually)"
fi

# ── Build Astro site ──
step "Building Astro site (prebuild + astro build)"
npm run build
echo "  Build output: $(du -sh dist | cut -f1)"

# ── D1 Database migration ──
if [ "$SKIP_D1" = false ]; then
  step "Migrating Jafar DB to Cloudflare D1"

  # Check if D1 database exists
  DB_ID=$(grep 'database_id' wrangler.toml | head -1 | sed 's/.*= *"\(.*\)".*/\1/')
  if [ -z "$DB_ID" ]; then
    echo "  Creating D1 database..."
    CREATE_OUTPUT=$(wrangler d1 create ctai-jafar 2>&1)
    echo "$CREATE_OUTPUT"
    NEW_ID=$(echo "$CREATE_OUTPUT" | grep -o '[0-9a-f-]\{36\}' | head -1)
    if [ -n "$NEW_ID" ]; then
      # Update wrangler.toml with the new database ID
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/database_id = \"\"/database_id = \"$NEW_ID\"/" wrangler.toml
      else
        sed -i "s/database_id = \"\"/database_id = \"$NEW_ID\"/" wrangler.toml
      fi
      echo "  Updated wrangler.toml with database_id: $NEW_ID"
    else
      fail "Could not extract D1 database ID from creation output"
    fi
  fi

  # Export schema + data from local SQLite and import into D1
  echo "  Exporting local jafar.db..."
  sqlite3 data/jafar.db .dump > tmp/jafar-d1-dump.sql

  echo "  Importing into D1 (this may take a moment)..."
  # D1 needs the dump split into individual statements for large imports
  # First drop existing tables if they exist
  wrangler d1 execute ctai-jafar --command "DROP TABLE IF EXISTS occurrences; DROP TABLE IF EXISTS roots;" 2>/dev/null || true

  # Import the dump
  wrangler d1 execute ctai-jafar --file tmp/jafar-d1-dump.sql

  echo "  D1 migration complete"

  # Verify
  ROOTS_COUNT=$(wrangler d1 execute ctai-jafar --command "SELECT COUNT(*) as c FROM roots;" --json 2>/dev/null | grep -o '"c":[0-9]*' | head -1 | cut -d: -f2)
  OCC_COUNT=$(wrangler d1 execute ctai-jafar --command "SELECT COUNT(*) as c FROM occurrences;" --json 2>/dev/null | grep -o '"c":[0-9]*' | head -1 | cut -d: -f2)
  echo "  D1 verified: ${ROOTS_COUNT:-?} roots, ${OCC_COUNT:-?} occurrences"

  # ── Users DB migration ──
  step "Migrating Users DB to Cloudflare D1"

  # Check if ctai-users D1 database ID is set
  USERS_DB_ID=$(grep -A2 'USERS_DB' wrangler.toml | grep 'database_id' | sed 's/.*= *"\(.*\)".*/\1/')
  if [ -z "$USERS_DB_ID" ]; then
    echo "  Creating ctai-users D1 database..."
    CREATE_OUTPUT=$(wrangler d1 create ctai-users 2>&1)
    echo "$CREATE_OUTPUT"
    NEW_ID=$(echo "$CREATE_OUTPUT" | grep -o '[0-9a-f-]\{36\}' | head -1)
    if [ -n "$NEW_ID" ]; then
      warn "Add database_id = \"$NEW_ID\" for USERS_DB in wrangler.toml"
    else
      warn "Could not extract D1 database ID for ctai-users"
    fi
  fi

  # Apply schema (idempotent — uses IF NOT EXISTS)
  if [ -f "scripts/init-users-db.sql" ]; then
    echo "  Applying users DB schema..."
    wrangler d1 execute ctai-users --file scripts/init-users-db.sql
    echo "  Users DB schema applied"
  fi
fi

# ── Deploy to Cloudflare Pages ──
step "Deploying to Cloudflare Pages"
wrangler pages deploy dist --project-name ctai

step "Deploy complete!"
echo "  Site: https://ctai.info"
echo "  Dashboard: https://dash.cloudflare.com"
