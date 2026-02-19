<script>
  import { onMount } from 'svelte';

  let {
    workTitle = '',
    workSlug = '',
    paraIndex = 1,
    totalParas = 1,
    prevSnippet = '',
    nextSnippet = '',
    prevUrl = null,
    nextUrl = null,
    position = 'top',
  } = $props();

  let searchIndex = $state([]);
  let query = $state('');
  let searchOpen = $state(false);
  let inputEl = $state(null);

  onMount(() => {
    const el = document.getElementById('search-index');
    if (el) searchIndex = JSON.parse(el.textContent);
  });

  const results = $derived.by(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return searchIndex
      .filter(p => p.t.toLowerCase().includes(q))
      .slice(0, 12);
  });

  function toggleSearch() {
    searchOpen = !searchOpen;
    query = '';
    if (searchOpen) {
      // Focus input after render
      requestAnimationFrame(() => inputEl?.focus());
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      searchOpen = false;
      query = '';
    }
  }

  function highlightMatch(text, q) {
    if (!q || q.length < 2) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return text.slice(0, idx) + '<mark class="bg-gold-500/30 text-gold-200 rounded px-0.5">' + text.slice(idx, idx + q.length) + '</mark>' + text.slice(idx + q.length);
  }
</script>

<nav aria-label="{position === 'top' ? 'Page' : 'Bottom page'} navigation"
     class="border border-ink-700/40 rounded-lg bg-ink-800/30 p-3">

  <!-- Top row: prev / position + search / next -->
  <div class="flex items-center gap-2">
    <!-- Prev -->
    {#if prevUrl}
      <a href={prevUrl} rel="prev"
         class="flex items-center gap-1.5 px-3 py-2 rounded-md bg-ink-800/60 border border-ink-700/40
                hover:border-gold-500/30 hover:bg-ink-800 transition-all group shrink-0"
         title={prevSnippet}>
        <span class="text-gold-400 group-hover:text-gold-300 text-sm">&larr;</span>
        <span class="text-xs text-ink-400 group-hover:text-ink-300 hidden sm:inline max-w-[120px] truncate">{prevSnippet || `§${paraIndex - 1}`}</span>
        <span class="text-xs text-ink-400 group-hover:text-ink-300 sm:hidden">Prev</span>
      </a>
    {:else}
      <span class="px-3 py-2 text-xs text-ink-600 shrink-0">&larr; Prev</span>
    {/if}

    <!-- Center: position + search toggle -->
    <div class="flex-1 flex items-center justify-center gap-2 min-w-0">
      <a href={`/models/${workSlug}/`}
         class="text-xs text-ink-400 hover:text-gold-400 transition-colors font-mono truncate hidden md:inline"
         title="View all paragraphs">
        {workTitle}
      </a>
      <span class="text-xs text-ink-500 font-mono shrink-0">
        §{paraIndex}<span class="text-ink-600">/{totalParas}</span>
      </span>
      <button onclick={toggleSearch}
              class="p-1.5 rounded-md text-ink-500 hover:text-gold-400 hover:bg-ink-800/60 transition-all"
              title="Search within this work"
              aria-expanded={searchOpen}
              aria-label="Search within this work">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    </div>

    <!-- Next -->
    {#if nextUrl}
      <a href={nextUrl} rel="next"
         class="flex items-center gap-1.5 px-3 py-2 rounded-md bg-ink-800/60 border border-ink-700/40
                hover:border-gold-500/30 hover:bg-ink-800 transition-all group shrink-0"
         title={nextSnippet}>
        <span class="text-xs text-ink-400 group-hover:text-ink-300 hidden sm:inline max-w-[120px] truncate">{nextSnippet || `§${paraIndex + 1}`}</span>
        <span class="text-xs text-ink-400 group-hover:text-ink-300 sm:hidden">Next</span>
        <span class="text-gold-400 group-hover:text-gold-300 text-sm">&rarr;</span>
      </a>
    {:else}
      <span class="px-3 py-2 text-xs text-ink-600 shrink-0">Next &rarr;</span>
    {/if}
  </div>

  <!-- Search panel (collapsible) -->
  {#if searchOpen}
    <div class="mt-3 border-t border-ink-700/30 pt-3" onkeydown={handleKeydown}>
      <div class="relative">
        <input
          bind:this={inputEl}
          bind:value={query}
          type="search"
          placeholder="Search within {workTitle}…"
          class="w-full bg-ink-900/60 border border-ink-700/40 rounded-md px-3 py-2 text-sm text-ink-200
                 placeholder:text-ink-600 focus:outline-none focus:border-gold-500/40 focus:ring-1 focus:ring-gold-500/20"
          aria-label="Search paragraphs in this work"
        />
        {#if query.length >= 2}
          <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-600 font-mono">
            {results.length}{results.length === 12 ? '+' : ''} found
          </span>
        {/if}
      </div>

      {#if results.length > 0}
        <ul class="mt-2 space-y-1 max-h-64 overflow-y-auto" role="listbox">
          {#each results as r}
            <li>
              <a href="/models/{workSlug}/{r.s || r.i}/"
                 class="flex items-baseline gap-2 px-3 py-2 rounded-md text-sm
                        hover:bg-ink-800/60 hover:border-gold-500/20 transition-all
                        {r.i === paraIndex ? 'bg-gold-500/10 border border-gold-500/20' : 'border border-transparent'}"
                 role="option"
                 aria-selected={r.i === paraIndex}>
                <span class="font-mono text-xs text-ink-500 shrink-0">§{r.i}</span>
                <span class="text-ink-300 truncate">{@html highlightMatch(r.t, query)}</span>
              </a>
            </li>
          {/each}
        </ul>
      {:else if query.length >= 2}
        <p class="mt-2 text-xs text-ink-600 text-center py-2">No paragraphs match &ldquo;{query}&rdquo;</p>
      {/if}
    </div>
  {/if}
</nav>
