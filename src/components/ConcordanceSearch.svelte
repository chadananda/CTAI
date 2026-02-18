<script>
  let query = $state('');
  let focused = $state(false);
  let index = $state(null);
  let loading = $state(false);
  let selectedIdx = $state(-1);

  // Detect Arabic/Persian input (Unicode range)
  function isArabic(text) {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
  }

  async function loadIndex() {
    if (index || loading) return;
    loading = true;
    try {
      const res = await fetch('/_concordance-index.json');
      index = await res.json();
    } catch {
      index = { en: [], roots: [] };
    }
    loading = false;
  }

  const filtered = $derived.by(() => {
    if (!index || query.length < 2) return { en: [], roots: [] };
    const q = query.toLowerCase().trim();
    const arabic = isArabic(q);

    if (arabic) {
      // Search roots by Arabic script
      const roots = index.roots
        .filter(r => r[0].includes(q))
        .slice(0, 12);
      return { en: [], roots };
    }

    // Search English entries + root transliterations
    const en = index.en
      .filter(r => r[0].toLowerCase().includes(q))
      .slice(0, 12);
    const roots = index.roots
      .filter(r => r[1].toLowerCase().includes(q) || r[2].toLowerCase().includes(q))
      .slice(0, 6);
    return { en, roots };
  });

  const hasResults = $derived(filtered.en.length > 0 || filtered.roots.length > 0);

  function handleKeydown(e) {
    if (!hasResults) return;
    const total = filtered.en.length + filtered.roots.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % total;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = selectedIdx <= 0 ? total - 1 : selectedIdx - 1;
    } else if (e.key === 'Enter' && selectedIdx >= 0) {
      e.preventDefault();
      const url = selectedIdx < filtered.en.length
        ? `/concordance/english/${filtered.en[selectedIdx][1]}/`
        : `/concordance/root/${encodeURIComponent(filtered.roots[selectedIdx - filtered.en.length][1])}/`;
      window.location.href = url;
    } else if (e.key === 'Escape') {
      focused = false;
      e.target.blur();
    }
  }

  function handleFocus() {
    focused = true;
    loadIndex();
  }

  // Reset selection when query changes
  $effect(() => {
    query;
    selectedIdx = -1;
  });
</script>

<div class="relative w-full max-w-2xl mx-auto">
  <div class="relative">
    <input
      type="text"
      bind:value={query}
      onfocus={handleFocus}
      onblur={() => setTimeout(() => focused = false, 200)}
      onkeydown={handleKeydown}
      placeholder="Search English words, phrases, or Arabic roots..."
      class="w-full px-4 py-3 pl-10 bg-ink-800/60 border border-ink-700/60 rounded-lg
             text-ink-200 placeholder:text-ink-500 text-sm
             focus:outline-none focus:border-gold-400/50 focus:ring-1 focus:ring-gold-400/20
             transition-all"
    />
    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    {#if loading}
      <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-500">Loading...</span>
    {/if}
  </div>

  {#if focused && hasResults && query.length >= 2}
    <div class="absolute z-50 mt-1 w-full bg-ink-800 border border-ink-700/60 rounded-lg shadow-xl overflow-hidden max-h-[400px] overflow-y-auto">
      {#if filtered.en.length > 0}
        <div class="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-ink-500 bg-ink-800/80 sticky top-0">
          English
        </div>
        {#each filtered.en as entry, i}
          <a
            href="/concordance/english/{entry[1]}/"
            class="flex items-center justify-between px-3 py-2 text-sm hover:bg-ink-700/50 transition-colors
                   {selectedIdx === i ? 'bg-ink-700/50' : ''}"
          >
            <span class="text-ink-200">{entry[0]}</span>
            <span class="text-[10px] text-ink-500 font-mono ml-2 whitespace-nowrap">
              {entry[2]} occ · {entry[3]} {entry[3] === 1 ? 'root' : 'roots'}
            </span>
          </a>
        {/each}
      {/if}

      {#if filtered.roots.length > 0}
        <div class="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-ink-500 bg-ink-800/80 sticky top-0">
          Arabic/Persian Roots
        </div>
        {#each filtered.roots as entry, i}
          <a
            href="/concordance/root/{encodeURIComponent(entry[1])}/"
            class="flex items-center justify-between px-3 py-2 text-sm hover:bg-ink-700/50 transition-colors
                   {selectedIdx === filtered.en.length + i ? 'bg-ink-700/50' : ''}"
          >
            <span>
              <span class="text-ink-200 font-arabic" dir="rtl" lang="ar">{entry[0]}</span>
              <span class="text-ink-400 ml-2">({entry[1]})</span>
              <span class="text-ink-500 ml-1 text-xs">— {entry[2]}</span>
            </span>
            <span class="text-[10px] text-ink-500 font-mono ml-2 whitespace-nowrap">
              {entry[3]} occ · {entry[4]} renderings
            </span>
          </a>
        {/each}
      {/if}
    </div>
  {/if}
</div>
