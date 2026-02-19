<script>
  let { phrase, compact = false } = $props();
</script>

<a href={phrase.url}
   class="block p-5 bg-ink-850 rounded-xl border border-ink-700/40
          hover:border-gold-500/30 transition-all group">
  <div class="flex items-center justify-between mb-3">
    <span class="text-[10px] text-ink-500 font-mono tracking-wider uppercase">{phrase.work} &middot; &sect;{phrase.pair_index}</span>
    <div class="flex items-center gap-2">
      {#if phrase.source_lang}
        <span class="text-[10px] font-mono tracking-wider text-ink-600 bg-ink-800 px-1.5 py-0.5 rounded">
          {phrase.source_lang}
        </span>
      {/if}
      <span class="text-gold-500/0 group-hover:text-gold-500/60 transition-all text-xs font-mono">&rarr;</span>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div dir="rtl" lang="ar" class="font-arabic text-ink-300 leading-loose text-right {compact ? 'line-clamp-3' : ''}">
      {phrase.source_text}
    </div>
    <div class="text-ink-200 leading-relaxed {compact ? 'line-clamp-3' : ''}">
      {phrase.translation}
    </div>
  </div>
</a>
