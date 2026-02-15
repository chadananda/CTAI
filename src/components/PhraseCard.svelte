<script>
  let { phrase, compact = false } = $props();
</script>

<a href={phrase.url}
   class="block p-5 bg-white rounded-lg border border-stone-200
          hover:border-gold-400 hover:shadow-sm transition-all">
  <div class="flex items-center justify-between mb-3">
    <span class="text-xs text-stone-400">{phrase.work} &middot; &sect;{phrase.pair_index}</span>
    {#if phrase.source_lang}
      <span class="text-[10px] uppercase tracking-wider text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
        {phrase.source_lang}
      </span>
    {/if}
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div dir="rtl" class="font-arabic text-stone-700 leading-loose text-right {compact ? 'line-clamp-3' : ''}">
      {phrase.source_text}
    </div>
    <div class="text-stone-800 leading-relaxed {compact ? 'line-clamp-3' : ''}">
      {phrase.translation}
    </div>
  </div>
</a>
