<script>
  let { terms = [], workSlug = '' } = $props();

  // Build cloud data from terms cross_refs — count how many times each root appears
  const cloudData = $derived(() => {
    const counts = new Map();
    for (const t of terms) {
      const refCount = (t.cross_refs?.length || 0) + 1; // +1 for current paragraph
      counts.set(t.term, {
        term: t.term,
        transliteration: t.transliteration,
        literal: t.literal,
        count: refCount,
        se_rendering: t.se_rendering,
      });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  });

  function fontSize(count, max) {
    const min_size = 0.75;
    const max_size = 1.5;
    if (max <= 1) return 1;
    const ratio = Math.log(count + 1) / Math.log(max + 1);
    return min_size + ratio * (max_size - min_size);
  }
</script>

{#if cloudData().length > 0}
  <section class="mb-8">
    <h3 class="text-xs font-mono tracking-wider text-ink-500 uppercase mb-3">Key Terms</h3>
    <div class="flex flex-wrap gap-2 items-baseline">
      {#each cloudData() as item}
        {@const maxCount = cloudData()[0]?.count || 1}
        <span
          class="inline-flex items-baseline gap-1 bg-ink-800/60 border border-ink-700/40
                 rounded-full px-3 py-1 hover:border-gold-500/30 hover:bg-ink-800
                 transition-all cursor-default group"
          style="font-size: {fontSize(item.count, maxCount)}rem"
          title="{item.transliteration}: {item.literal} — {item.count} occurrences across corpus"
        >
          <span class="font-arabic text-gold-300 group-hover:text-gold-200" dir="rtl">{item.term}</span>
          <span class="text-ink-500 text-xs font-mono">{item.se_rendering}</span>
          <span class="text-ink-600 text-xs">({item.count})</span>
        </span>
      {/each}
    </div>
  </section>
{/if}
