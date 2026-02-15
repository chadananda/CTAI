<script>
  let { terms = [] } = $props();

  // Deduplicate cross-refs across all terms, grouped by term root
  const grouped = $derived(() => {
    const map = new Map();
    for (const t of terms) {
      if (!t.cross_refs?.length) continue;
      const key = t.term;
      if (!map.has(key)) map.set(key, { term: t.term, transliteration: t.transliteration, refs: [] });
      for (const ref of t.cross_refs) {
        const id = `${ref.work}-${ref.para}`;
        const existing = map.get(key).refs;
        if (!existing.some(r => `${r.work}-${r.para}` === id)) {
          existing.push(ref);
        }
      }
    }
    return [...map.values()].filter(g => g.refs.length > 0);
  });
</script>

{#if grouped().length > 0}
  <section class="mt-8 pt-6 border-t border-stone-200">
    <h3 class="text-sm font-semibold text-stone-600 uppercase tracking-wider mb-4">Cross-References</h3>
    <p class="text-xs text-stone-400 mb-4">Terms in this paragraph also appear in:</p>

    <div class="space-y-3">
      {#each grouped() as group}
        <div>
          <span class="font-arabic text-stone-700" dir="rtl">{group.term}</span>
          {#if group.transliteration}
            <span class="text-stone-500 text-xs ml-1">({group.transliteration})</span>
          {/if}
          <span class="text-stone-400 text-xs">:</span>
          <span class="ml-2 inline-flex flex-wrap gap-1">
            {#each group.refs.slice(0, 12) as ref}
              <a href="/corpus/{ref.work}/{ref.para}"
                 class="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded
                        hover:bg-gold-100 hover:text-gold-800 transition-colors">
                {ref.work} &sect;{ref.para}
              </a>
            {/each}
            {#if group.refs.length > 12}
              <span class="text-xs text-stone-400">&hellip; +{group.refs.length - 12} more</span>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  </section>
{/if}
