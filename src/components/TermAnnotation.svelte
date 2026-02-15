<script>
  let { term } = $props();
  let expanded = $state(false);
</script>

<div class="border-l-2 border-gold-300 pl-4 py-2">
  <button
    class="w-full text-left group"
    onclick={() => expanded = !expanded}
  >
    <span class="font-arabic text-lg text-stone-800" dir="rtl">{term.term}</span>
    {#if term.transliteration}
      <span class="text-stone-500 text-sm ml-2">({term.transliteration})</span>
    {/if}
    {#if term.se_rendering}
      <span class="text-gold-700 text-sm ml-1">&mdash; &ldquo;{term.se_rendering}&rdquo;</span>
    {/if}
    <span class="text-stone-400 text-xs ml-2 group-hover:text-stone-600 transition-colors">
      {expanded ? '&#9660;' : '&#9654;'}
    </span>
  </button>

  {#if expanded}
    <div class="mt-2 space-y-2 text-sm">
      {#if term.literal}
        <p class="text-stone-500">Literal: &ldquo;{term.literal}&rdquo;</p>
      {/if}
      {#if term.note}
        <p class="text-stone-700 leading-relaxed">{term.note}</p>
      {/if}
      {#if term.cross_refs?.length}
        <div class="mt-2">
          <p class="text-stone-500 text-xs uppercase tracking-wider mb-1">Also appears in:</p>
          <div class="flex flex-wrap gap-1.5">
            {#each term.cross_refs as ref}
              <a href="/corpus/{ref.work}/{ref.para}"
                 class="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded hover:bg-gold-100 hover:text-gold-800 transition-colors">
                {ref.work} &sect;{ref.para}
              </a>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
