<script>
  let { term } = $props();
  let expanded = $state(false);

  function slugify(phrase) {
    return phrase.toLowerCase().trim().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
</script>

<div class="border-l border-gold-500/30 pl-4 py-2">
  <button
    class="w-full text-left group"
    onclick={() => expanded = !expanded}
  >
    <span class="font-arabic text-lg text-gold-300" dir="rtl">{term.term}</span>
    {#if term.transliteration}
      <span class="text-ink-400 text-sm ml-2 font-mono text-xs">({term.transliteration})</span>
    {/if}
    {#if term.se_rendering}
      <a href="/concordance/english/{slugify(term.se_rendering)}/" class="text-gold-400 text-sm ml-1 hover:text-gold-300 transition-colors">&mdash; &ldquo;{term.se_rendering}&rdquo;</a>
    {/if}
    <span class="text-ink-600 text-xs ml-2 group-hover:text-ink-400 transition-colors">
      {expanded ? '&#9660;' : '&#9654;'}
    </span>
  </button>

  {#if expanded}
    <div class="mt-2 space-y-2 text-sm">
      {#if term.literal}
        <p class="text-ink-500">Literal: &ldquo;{term.literal}&rdquo;</p>
      {/if}
      {#if term.note}
        <p class="text-ink-300 leading-relaxed">{term.note}</p>
      {/if}
      {#if term.cross_refs?.length}
        <div class="mt-2">
          <p class="text-ink-500 text-xs font-mono tracking-wider uppercase mb-1">Also rendered as:</p>
          <div class="space-y-1.5 mb-2">
            {#each term.cross_refs.slice(0, 3) as ref}
              <a href="/examples/{ref.work}/{ref.para}/"
                 class="flex items-baseline gap-2 text-sm px-2 py-1 rounded
                        bg-ink-800/60 border border-ink-700/30
                        hover:border-gold-500/30 hover:bg-ink-800 transition-all group">
                <span class="font-mono text-xs text-ink-500 shrink-0">{ref.work} &sect;{ref.para}</span>
                {#if ref.snippet}
                  <span class="text-gold-400/80 group-hover:text-gold-300">&ldquo;{ref.snippet}&rdquo;</span>
                {/if}
              </a>
            {/each}
          </div>
          {#if term.cross_refs.length > 3}
            <div class="flex flex-wrap gap-1.5">
              {#each term.cross_refs.slice(3) as ref}
                <a href="/examples/{ref.work}/{ref.para}/"
                   class="text-xs bg-ink-800 text-ink-400 px-2 py-0.5 rounded border border-ink-700/40
                          hover:border-gold-500/30 hover:text-gold-400 transition-all font-mono">
                  {ref.work} &sect;{ref.para}
                </a>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
