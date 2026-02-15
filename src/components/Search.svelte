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

<div class="w-full max-w-2xl mx-auto">
  <div class="relative">
    <input
      type="text"
      bind:value={query}
      oninput={onInput}
      placeholder="Search translations and sacred texts..."
      class="w-full px-5 py-3.5 rounded-lg border border-stone-300 bg-white text-stone-800
             placeholder:text-stone-400 focus:outline-none focus:border-gold-500 focus:ring-2
             focus:ring-gold-200 text-base font-serif transition-all"
    />
    {#if loading}
      <div class="absolute right-4 top-1/2 -translate-y-1/2">
        <div class="w-5 h-5 border-2 border-stone-300 border-t-gold-500 rounded-full animate-spin"></div>
      </div>
    {/if}
  </div>

  <div class="flex gap-2 mt-3 justify-center">
    <button
      class="px-3 py-1 text-xs rounded-full transition-colors {activeIndex === 'phrases'
        ? 'bg-gold-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}"
      onclick={() => { activeIndex = 'phrases'; if (query.trim()) doSearch(); }}
    >Translation Pairs</button>
    <button
      class="px-3 py-1 text-xs rounded-full transition-colors {activeIndex === 'concepts'
        ? 'bg-gold-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}"
      onclick={() => { activeIndex = 'concepts'; if (query.trim()) doSearch(); }}
    >Source Texts</button>
  </div>

  {#if results.length > 0}
    <div class="mt-6 space-y-4">
      {#each results as hit}
        {#if activeIndex === 'phrases'}
          <a href={hit.url} class="block p-5 bg-white rounded-lg border border-stone-200
                                    hover:border-gold-400 hover:shadow-sm transition-all text-left">
            <div class="text-xs text-stone-400 mb-2">{hit.work} &middot; Paragraph {hit.pair_index}</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <p class="font-arabic text-stone-700 leading-relaxed" dir="rtl">{hit.source_text.length > 200 ? hit.source_text.slice(0, 200) + '...' : hit.source_text}</p>
              <p class="text-stone-800 leading-relaxed">{hit.translation.length > 200 ? hit.translation.slice(0, 200) + '...' : hit.translation}</p>
            </div>
          </a>
        {:else}
          <a href={hit.url} class="block p-5 bg-white rounded-lg border border-stone-200
                                    hover:border-gold-400 hover:shadow-sm transition-all text-left">
            <div class="text-xs text-stone-400 mb-2">{hit.work} &middot; {hit.author}</div>
            <p class="font-arabic text-stone-700 leading-relaxed" dir={hit.language === 'ar' ? 'rtl' : 'ltr'}>{hit.text.length > 300 ? hit.text.slice(0, 300) + '...' : hit.text}</p>
          </a>
        {/if}
      {/each}
    </div>
  {:else if query.trim() && !loading}
    <p class="mt-6 text-stone-400 text-sm text-center">No results found.</p>
  {/if}
</div>
