<script>
  let query = $state('');
  let results = $state([]);
  let loading = $state(false);
  let debounceTimer;
  let activeIndex = $state('phrases');

  async function doSearch() {
    if (!query.trim()) { results = []; return; }
    loading = true;
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&index=${activeIndex}`);
      const data = await res.json();
      results = data.hits || [];
    } catch {
      results = [];
    } finally {
      loading = false;
    }
  }

  function onInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, 300);
  }
</script>

<div class="w-full">
  <div class="relative">
    <input
      type="text"
      bind:value={query}
      oninput={onInput}
      placeholder="Search translations and sacred texts..."
      aria-label="Search translations and sacred texts"
      class="w-full px-5 py-4 rounded-xl border border-ink-700/50 bg-ink-850 text-ink-200
             placeholder:text-ink-600 focus:outline-none focus:border-gold-500/40 focus:ring-1
             focus:ring-gold-500/20 text-base font-serif transition-all"
    />
    {#if loading}
      <div class="absolute right-4 top-1/2 -translate-y-1/2">
        <div class="w-5 h-5 border-2 border-ink-700 border-t-gold-500 rounded-full animate-spin"></div>
      </div>
    {/if}
  </div>

  <div class="flex gap-2 mt-3 justify-center">
    <button
      class="px-3 py-1.5 text-xs font-mono tracking-wide rounded-md transition-all {activeIndex === 'phrases'
        ? 'bg-ink-800 text-gold-400 border border-gold-500/20' : 'text-ink-500 hover:text-ink-300 border border-transparent hover:bg-ink-800/50'}"
      onclick={() => { activeIndex = 'phrases'; if (query.trim()) doSearch(); }}
    >Translation Pairs</button>
    <button
      class="px-3 py-1.5 text-xs font-mono tracking-wide rounded-md transition-all {activeIndex === 'concepts'
        ? 'bg-ink-800 text-gold-400 border border-gold-500/20' : 'text-ink-500 hover:text-ink-300 border border-transparent hover:bg-ink-800/50'}"
      onclick={() => { activeIndex = 'concepts'; if (query.trim()) doSearch(); }}
    >Source Texts</button>
  </div>

  {#if results.length > 0}
    <div class="mt-6 space-y-3" role="status" aria-live="polite">
      {#each results as hit}
        {#if activeIndex === 'phrases'}
          <a href={hit.url} class="block p-5 bg-ink-850 rounded-xl border border-ink-700/40
                                    hover:border-gold-500/30 transition-all text-left group">
            <div class="flex items-center justify-between mb-3">
              <span class="text-[10px] text-ink-500 font-mono tracking-wider uppercase">{hit.work} &middot; &sect;{hit.pair_index}</span>
              <span class="text-gold-500/0 group-hover:text-gold-500/60 transition-all text-xs font-mono">&rarr;</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <p class="font-arabic text-ink-300 leading-loose" dir="rtl" lang="ar">{hit.source_text.length > 200 ? hit.source_text.slice(0, 200) + '...' : hit.source_text}</p>
              <p class="text-ink-200 leading-relaxed">{hit.translation.length > 200 ? hit.translation.slice(0, 200) + '...' : hit.translation}</p>
            </div>
          </a>
        {:else}
          <a href={hit.url} class="block p-5 bg-ink-850 rounded-xl border border-ink-700/40
                                    hover:border-gold-500/30 transition-all text-left group">
            <div class="flex items-center justify-between mb-3">
              <span class="text-[10px] text-ink-500 font-mono tracking-wider uppercase">{hit.work} &middot; {hit.author}</span>
              <span class="text-gold-500/0 group-hover:text-gold-500/60 transition-all text-xs font-mono">&rarr;</span>
            </div>
            <p class="font-arabic text-ink-300 leading-loose" dir={hit.language === 'ar' ? 'rtl' : 'ltr'} lang={hit.language === 'ar' ? 'ar' : undefined}>{hit.text.length > 300 ? hit.text.slice(0, 300) + '...' : hit.text}</p>
          </a>
        {/if}
      {/each}
    </div>
  {:else if query.trim() && !loading}
    <p class="mt-6 text-ink-500 text-sm text-center font-mono">No results found.</p>
  {/if}
</div>
