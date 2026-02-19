<script>
  let {
    paragraphs = [],
    sections = [],
    hasSections = false,
    workSlug = '',
    sourceLang = 'ar',
    accentColor = 'text-gold-300',
  } = $props();

  let query = $state('');

  const filtered = $derived.by(() => {
    if (!query || query.length < 2) return null; // null = show all (no filter)
    const q = query.toLowerCase();
    return new Set(
      paragraphs
        .filter(p => p.translation.toLowerCase().includes(q) || p.source_text.includes(q))
        .map(p => p.pair_index)
    );
  });

  const matchCount = $derived(filtered ? filtered.size : paragraphs.length);

  function descSlug(p) {
    return p.page_slug ? `${p.pair_index}-${p.page_slug}` : p.pair_index;
  }

  function snippet(text, maxLen = 200) {
    return text.replace(/\n/g, ' ').slice(0, maxLen);
  }

  function highlightMatch(text, q) {
    if (!q || q.length < 2) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return before + '<mark class="bg-gold-500/30 text-gold-200 rounded px-0.5">' + match + '</mark>' + after;
  }

  // For sectioned view: check if a section has any matching paragraphs
  function sectionVisible(paras) {
    if (!filtered) return true;
    return paras.some(p => filtered.has(p.pair_index));
  }
</script>

<!-- Search box -->
<div class="relative mb-4">
  <div class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  </div>
  <input
    bind:value={query}
    type="search"
    placeholder="Find paragraph by keyword…"
    class="w-full bg-ink-900/60 border border-ink-700/40 rounded-lg pl-10 pr-36 py-2.5 text-sm text-ink-200
           placeholder:text-ink-600 focus:outline-none focus:border-gold-500/40 focus:ring-1 focus:ring-gold-500/20
           [&::-webkit-search-cancel-button]:mr-1"
  />
  {#if query.length >= 2}
    <span class="absolute right-9 top-1/2 -translate-y-1/2 text-xs text-ink-500 font-mono pointer-events-none">
      {matchCount} of {paragraphs.length}
    </span>
  {/if}
</div>

<!-- Paragraph list -->
{#if hasSections}
  <div class="space-y-1">
    {#each sections as [sectionId, paras], sectionIndex}
      {#if sectionVisible(paras)}
        {@const visibleParas = filtered ? paras.filter(p => filtered.has(p.pair_index)) : paras}
        {@const firstSnippet = snippet(paras[0].translation, 120)}
        <details class="group/section" open={!filtered && sectionIndex < 5 || !!filtered}>
          <summary class="cursor-pointer list-none [&::-webkit-details-marker]:hidden marker:hidden
                          flex items-baseline gap-3 px-4 py-3 rounded-lg
                          hover:bg-ink-800/40 transition-colors select-none">
            <span class={`font-mono text-xs ${accentColor} shrink-0 w-10 text-right`}>{sectionId}</span>
            <span class="text-sm text-ink-300 truncate flex-1">{firstSnippet}&hellip;</span>
            {#if paras.length > 1}
              <span class="text-xs text-ink-600 font-mono shrink-0">
                {filtered ? `${visibleParas.length}/` : ''}{paras.length}&para;
              </span>
            {/if}
            <span class="text-ink-600 text-xs group-open/section:rotate-90 transition-transform duration-150">&#x25B6;</span>
          </summary>

          <div class="ml-4 pl-10 border-l border-ink-700/30 space-y-2 pb-4">
            {#each visibleParas as p}
              <a href={`/models/${workSlug}/${descSlug(p)}/`}
                 class="block rounded-lg border border-ink-700/30 hover:border-gold-500/30
                        bg-ink-800/20 hover:bg-ink-800/40 transition-all overflow-hidden">
                <div class="grid grid-cols-1 md:grid-cols-2">
                  <div dir="rtl" lang={sourceLang} class="font-arabic text-base text-ink-400 leading-relaxed p-3 line-clamp-2 text-right border-b md:border-b-0 md:border-r border-ink-700/20">
                    {p.source_text.slice(0, 200)}
                  </div>
                  <div class="text-sm text-ink-300 leading-relaxed p-3 line-clamp-2">
                    {#if filtered && query.length >= 2}
                      {@html highlightMatch(snippet(p.translation), query)}
                    {:else}
                      {snippet(p.translation)}
                    {/if}
                  </div>
                </div>
              </a>
            {/each}
          </div>
        </details>
      {/if}
    {/each}
  </div>
{:else}
  <div class="space-y-2">
    {#each paragraphs as p}
      {#if !filtered || filtered.has(p.pair_index)}
        <a href={`/models/${workSlug}/${descSlug(p)}/`}
           class="flex items-start gap-3 rounded-lg border border-ink-700/30 hover:border-gold-500/30
                  bg-ink-800/20 hover:bg-ink-800/40 transition-all overflow-hidden">
          <span class={`font-mono text-xs ${accentColor} shrink-0 w-10 text-right pt-3 pl-3`}>{p.pair_index}</span>
          <div class="grid grid-cols-1 md:grid-cols-2 flex-1 min-w-0">
            <div dir="rtl" lang={sourceLang} class="font-arabic text-base text-ink-400 leading-relaxed p-3 line-clamp-2 text-right border-b md:border-b-0 md:border-r border-ink-700/20">
              {p.source_text.slice(0, 200)}
            </div>
            <div class="text-sm text-ink-300 leading-relaxed p-3 line-clamp-2">
              {#if filtered && query.length >= 2}
                {@html highlightMatch(snippet(p.translation), query)}
              {:else}
                {snippet(p.translation)}
              {/if}
            </div>
          </div>
        </a>
      {/if}
    {/each}
  </div>
{/if}

{#if filtered && matchCount === 0}
  <p class="text-center text-ink-500 py-8 text-sm">
    No paragraphs match &ldquo;{query}&rdquo;
  </p>
{/if}
