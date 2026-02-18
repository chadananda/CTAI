<script>
  const ABBR = {
    'Will and Testament': 'W&T',
    'Epistle to the Son of the Wolf': 'ESW',
    'Fire Tablet': 'Fire',
    'Gleanings': 'GWB',
    'Kitab-i-\'Ahd': 'Ahd',
    'Kitab-i-Iqan': 'KIQ',
    'Prayers and Meditations': 'P&M',
    'Tablet of Ahmad': 'Ahmad',
    'Tablet of Carmel': 'Carmel',
    'Tablet of the Holy Mariner': 'Mariner',
    'The Hidden Words': 'HW',
    'Hidden Words': 'HW',
    'Kitáb-i-Íqán': 'KIQ',
    'Kitáb-i-Qán': 'KIQ',
  };

  const EXAMPLES = [
    { arabic: 'قَلْبًا جَيِّدًا حَسَنًا مُنيرًا', hint: 'a pure, kindly and radiant heart' },
    { arabic: 'مطلع أمر الله', hint: 'the Dayspring of God\'s Cause' },
    { arabic: 'مُلْكًا دائِمًا باقِيًا أَزَلًا قَدِيمًا', hint: 'a sovereignty ancient, imperishable and everlasting' },
    { arabic: 'إنّ الإنصافَ و العدلَ', hint: 'equity and justice' },
    { arabic: 'عرفان حقيقی', hint: 'true recognition' },
    { arabic: 'سراج الهدى', hint: 'the lamp of guidance' },
    { arabic: 'بحر العلم', hint: 'the ocean of knowledge' },
    { arabic: 'مقام محمود', hint: 'the exalted station' },
    { arabic: 'ميثاق الله', hint: 'the Covenant of God' },
    { arabic: 'نار الحبّ', hint: 'the fire of love' },
    { arabic: 'ظهور الحقّ', hint: 'the manifestation of Truth' },
    { arabic: 'صراط المستقيم', hint: 'the straight path' },
    { arabic: 'كلمة الله', hint: 'the Word of God' },
    { arabic: 'روح الإيمان', hint: 'the spirit of faith' },
    { arabic: 'أفق الأعلى', hint: 'the Most Exalted Horizon' },
    { arabic: 'مظهر ظهور', hint: 'the Manifestation' },
    { arabic: 'تجلّی الأسماء', hint: 'the effulgence of Names' },
    { arabic: 'يوم القيامة', hint: 'the Day of Resurrection' },
    { arabic: 'سلطان الرسل', hint: 'the King of Messengers' },
    { arabic: 'فردوس الأعلى', hint: 'the Most Exalted Paradise' },
  ];

  const INITIAL_ROWS = 10;
  const samples = [...EXAMPLES].sort(() => Math.random() - 0.5).slice(0, 5);

  let query = $state('');
  let result = $state(null);
  let loading = $state(false);
  let filtering = $state(false);
  let error = $state('');
  let showLegend = $state(false);
  let useRelevance = $state(false);
  let expandedTerms = $state({});
  let debounceTimer = null;

  async function search(phrase) {
    phrase = (phrase ?? query).trim();
    if (!phrase) { result = null; return; }

    query = phrase;
    loading = true;
    error = '';
    expandedTerms = {};

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      result = await res.json();

      // Apply relevance filter if enabled
      if (useRelevance && result?.terms?.length) {
        await applyRelevanceFilter(phrase, result);
      }
    } catch (err) {
      error = err.message || 'Search failed';
    } finally {
      loading = false;
    }
  }

  async function applyRelevanceFilter(phrase, data) {
    filtering = true;
    try {
      const res = await fetch('/api/relevance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase, terms: data.terms }),
      });
      if (!res.ok) return; // silently fall back to unfiltered
      const filtered = await res.json();
      if (filtered.terms) {
        result = { ...data, terms: filtered.terms, filtered: true };
      }
    } catch {
      // silently fall back to unfiltered results
    } finally {
      filtering = false;
    }
  }

  function visibleRows(term, idx) {
    if (expandedTerms[idx]) return term.rows || [];
    return (term.rows || []).slice(0, INITIAL_ROWS);
  }

  function slugify(phrase) {
    return phrase.toLowerCase().trim().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function boldWord(text, word) {
    if (!word || !text) return esc(text || '');
    const escaped = esc(text);
    const target = esc(word);
    // Case-insensitive for English, exact for Arabic
    const idx = escaped.indexOf(target);
    if (idx === -1) {
      const lower = escaped.toLowerCase().indexOf(target.toLowerCase());
      if (lower === -1) return escaped;
      return escaped.slice(0, lower) + '<strong class="font-semibold text-gold-200">' + escaped.slice(lower, lower + target.length) + '</strong>' + escaped.slice(lower + target.length);
    }
    return escaped.slice(0, idx) + '<strong class="font-semibold text-gold-200">' + escaped.slice(idx, idx + target.length) + '</strong>' + escaped.slice(idx + target.length);
  }

  function onInput() {
    clearTimeout(debounceTimer);
    const phrase = query.trim();
    if (!phrase) { result = null; return; }
    debounceTimer = setTimeout(() => search(phrase), 250);
  }

  function onKeydown(e) {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      search();
    }
  }

  async function toggleFilter() {
    if (result?.filtered) {
      const saved = useRelevance;
      useRelevance = false;
      await search(query);
      useRelevance = saved;
    } else if (result?.terms?.length) {
      await applyRelevanceFilter(query, result);
    }
  }
</script>

<div class="w-full">
  <!-- Search input -->
  <div class="bg-ink-850 rounded-xl border border-ink-700/40 p-4">
    <div class="flex gap-2">
      <div class="relative flex-1">
        <input
          type="text"
          bind:value={query}
          oninput={onInput}
          onkeydown={onKeydown}
          placeholder="ادخل كلمة أو عبارة..."
          aria-label="Search Jafar dictionary"
          class="w-full bg-ink-900 border border-ink-700/60 rounded-lg px-4 py-2.5 pl-9 text-gold-200 font-arabic text-lg placeholder:text-ink-500 focus:outline-none focus:border-gold-500/40 transition-colors"
          dir="rtl"
          disabled={loading}
        />
        {#if query.trim()}
          <button
            onclick={() => { query = ''; result = null; error = ''; clearTimeout(debounceTimer); }}
            class="absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-ink-700/60 text-ink-400 hover:bg-ink-600 hover:text-ink-200 transition-colors"
            aria-label="Clear search"
          >
            <svg class="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M2 2l8 8M10 2l-8 8"/>
            </svg>
          </button>
        {/if}
      </div>
      <button
        onclick={() => search()}
        disabled={loading || !query.trim()}
        class="px-5 py-2 rounded-lg text-xs font-mono tracking-wide transition-all shrink-0
          {loading || !query.trim()
            ? 'bg-ink-800 text-ink-500 cursor-not-allowed'
            : 'bg-gold-500/15 text-gold-400 border border-gold-500/30 hover:bg-gold-500/25'}"
      >
        {#if loading}
          <span class="inline-flex items-center gap-2">
            <span class="w-3 h-3 border border-gold-400/60 border-t-transparent rounded-full animate-spin"></span>
            Searching...
          </span>
        {:else}
          Search
        {/if}
      </button>
    </div>

    <!-- Relevance toggle + example phrases -->
    {#if !result && !loading}
      <div class="mt-3 pt-2.5 border-t border-ink-800/40">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] text-ink-500 font-mono tracking-wider uppercase">Try a phrase</span>
          <label class="flex items-center gap-1.5 cursor-pointer select-none">
            <span class="text-[10px] text-ink-500 font-mono">AI relevance filter</span>
            <button
              onclick={() => useRelevance = !useRelevance}
              class="relative w-7 h-4 rounded-full transition-colors {useRelevance ? 'bg-gold-500/40' : 'bg-ink-700'}"
              role="switch"
              aria-checked={useRelevance}
            >
              <span class="absolute top-0.5 left-0.5 w-3 h-3 rounded-full transition-transform {useRelevance ? 'translate-x-3 bg-gold-400' : 'bg-ink-500'}"></span>
            </button>
          </label>
        </div>
        <div class="flex flex-wrap gap-1.5">
          {#each samples as ex}
            <button
              onclick={() => search(ex.arabic)}
              class="group text-left rounded-lg border border-ink-700/40 bg-ink-900 hover:border-ink-600/60 px-2.5 py-1.5 transition-all"
            >
              <span class="font-arabic text-sm text-gold-300 block leading-relaxed" dir="rtl" lang="ar">{ex.arabic}</span>
              <span class="text-[10px] text-ink-400 font-mono block mt-0.5 group-hover:text-ink-300 transition-colors">{ex.hint}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Error -->
  {#if error}
    <div class="mt-4 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm font-mono">
      {error}
    </div>
  {/if}

  <!-- Filtering indicator -->
  {#if filtering}
    <div class="mt-3 flex items-center gap-2 text-[11px] text-gold-400/70 font-mono">
      <span class="w-3 h-3 border border-gold-400/60 border-t-transparent rounded-full animate-spin"></span>
      Filtering for relevance...
    </div>
  {/if}

  <!-- Results -->
  {#if result}
    <div class="mt-4 bg-ink-850 rounded-xl border border-ink-700/40 overflow-hidden animate-fade-up" style="animation-duration: 0.3s" role="status" aria-live="polite">
      <!-- Header -->
      <div class="bg-ink-950 px-4 py-3 border-b border-ink-800/60 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div>
            <p class="font-arabic text-lg text-gold-200 text-left" dir="rtl" lang="ar">{result.phrase}</p>
            <p class="text-[10px] text-ink-300 font-mono mt-0.5">
              {result.terms?.length || 0} terms analyzed{result.filtered ? ' (filtered)' : ''}
            </p>
          </div>
          {#if result && !filtering}
            <button
              onclick={toggleFilter}
              class="text-[10px] font-mono px-2 py-0.5 rounded border transition-all
                {result.filtered
                  ? 'border-ink-600 text-ink-400 hover:text-ink-300 hover:border-ink-500'
                  : 'border-gold-500/30 text-gold-400/70 hover:text-gold-400 hover:border-gold-500/50'}"
            >
              {result.filtered ? 'show all' : 'filter'}
            </button>
          {/if}
        </div>
        <button onclick={() => result = null} class="text-ink-500 hover:text-ink-300 transition-colors text-xs font-mono px-2 py-1 rounded hover:bg-ink-800">close</button>
      </div>

      <!-- Concordance -->
      <div class="p-4 space-y-5">
        {#each result.terms || [] as term, termIdx}
          <div>
            <!-- Term heading -->
            <div class="flex items-baseline gap-2 pb-1.5 border-b border-ink-700/50 mb-2">
              <span class="font-arabic text-gold-200 text-base" dir="rtl" lang="ar">{term.word}</span>
              <span class="text-ink-300 font-mono text-[10px]">{term.transliteration}</span>
              <span class="text-ink-400 font-mono text-[10px]">{term.root}</span>
              <span class="text-ink-300 text-[10px]">&mdash; {term.meaning || term.basic_meaning}</span>
              <span class="ml-auto text-[10px] text-ink-400 font-mono">{term.rows?.length || 0} hits</span>
            </div>

            <!-- Rows — compact single-line -->
            <div class="space-y-0.5">
              {#each visibleRows(term, termIdx) as row}
                <div class="flex items-baseline gap-1.5 text-[11px] leading-relaxed py-0.5 hover:bg-ink-800/30 px-1 -mx-1 rounded transition-colors">
                  <a href="/concordance/english/{slugify(row.en)}/" class="text-gold-100 font-semibold shrink-0 hover:text-gold-200 transition-colors">{row.en}</a>
                  <span class="text-ink-500 shrink-0">{row.ref},</span>
                  <p class="text-ink-200 flex-1 truncate">{@html boldWord(row.tr, row.en)}</p>
                  <p class="font-arabic text-ink-400 shrink-0 text-[12px] max-w-[40%] truncate text-right" dir="rtl" lang="ar">{@html boldWord(row.src, row.form)}</p>
                </div>
              {/each}
            </div>

            <!-- Show more / less -->
            {#if (term.rows?.length || 0) > INITIAL_ROWS}
              <button
                onclick={() => expandedTerms = { ...expandedTerms, [termIdx]: !expandedTerms[termIdx] }}
                class="mt-1.5 text-[10px] font-mono text-gold-400/80 hover:text-gold-300 transition-colors"
              >
                {expandedTerms[termIdx]
                  ? '\u25B2 show fewer'
                  : `\u25BC show ${(term.rows?.length || 0) - INITIAL_ROWS} more`}
              </button>
            {/if}

            <!-- Similar roots — clickable, showing shared renderings -->
            {#if term.similar?.length}
              <div class="mt-2">
                <span class="text-[10px] text-ink-400 font-mono">also rendered as:</span>
                <div class="flex flex-wrap gap-1 mt-1">
                  {#each term.similar as s}
                    <button
                      onclick={() => search(s.sample_form || s.root.replace(/-/g, ''))}
                      class="group inline-flex items-baseline gap-1 rounded border border-ink-700/40 bg-ink-900 hover:border-ink-600/60 px-2 py-0.5 transition-all text-[10px]"
                    >
                      <span class="font-arabic text-gold-300 group-hover:text-gold-200" lang="ar">{s.root}</span>
                      <span class="text-ink-300 group-hover:text-ink-200">{s.shared?.join(', ')}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/each}

        <!-- Legend toggle -->
        <div class="pt-2 border-t border-ink-800/40">
          <button onclick={() => showLegend = !showLegend}
            aria-expanded={showLegend}
            aria-label="Toggle abbreviations legend"
            class="text-[10px] text-ink-400 font-mono hover:text-ink-300 transition-colors">
            {showLegend ? '\u25BC' : '\u25B6'} Abbreviations
          </button>
          {#if showLegend}
            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[9px] font-mono text-ink-400">
              {#each Object.entries(ABBR).filter(([k, v], i, a) => a.findIndex(([, v2]) => v2 === v) === i) as [full, short]}
                <span><span class="text-ink-400">{short}</span> {full}</span>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
