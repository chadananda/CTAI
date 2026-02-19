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
  <section class="mt-8 pt-6 border-t border-ink-700/40">
    <h3 class="text-xs font-mono tracking-wider text-ink-500 uppercase mb-4">Cross-References</h3>
    <p class="text-xs text-ink-600 mb-4">Terms in this paragraph also appear in:</p>

    <div class="space-y-3">
      {#each grouped() as group}
        <div>
          <span class="font-arabic text-gold-300" dir="rtl">{group.term}</span>
          {#if group.transliteration}
            <span class="text-ink-500 text-xs font-mono ml-1">({group.transliteration})</span>
          {/if}
          <span class="text-ink-600 text-xs">:</span>
          <span class="ml-2 inline-flex flex-wrap gap-1">
            {#each group.refs.slice(0, 12) as ref}
              <a href="/models/{ref.work}/{ref.para}"
                 class="text-xs bg-ink-800 text-ink-400 px-2 py-0.5 rounded border border-ink-700/40
                        hover:border-gold-500/30 hover:text-gold-400 transition-all font-mono">
                {ref.work} &sect;{ref.para}
              </a>
            {/each}
            {#if group.refs.length > 12}
              <span class="text-xs text-ink-600 font-mono">&hellip; +{group.refs.length - 12} more</span>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  </section>
{/if}
