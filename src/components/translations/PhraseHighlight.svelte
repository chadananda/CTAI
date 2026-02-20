<script>
let { paragraphs = [] } = $props();
let hoveredPhrase = $state(null);
</script>

<div class="space-y-8">
  {#each paragraphs as para, pi}
    <div class="grid grid-cols-2 gap-6">
      <!-- Source (RTL) -->
      <div dir="rtl" class="font-arabic text-lg leading-relaxed text-ink-200">
        {#each para.phrases as phrase, fi}
          <span
            class="cursor-pointer transition-colors px-0.5 rounded {hoveredPhrase === `${pi}-${fi}` ? 'bg-gold-400/20 text-gold-300' : 'hover:bg-ink-800'}"
            onmouseenter={() => hoveredPhrase = `${pi}-${fi}`}
            onmouseleave={() => hoveredPhrase = null}
          >{phrase.source}</span>{' '}
        {/each}
      </div>
      <!-- Translation (LTR) -->
      <div class="text-ink-200 leading-relaxed">
        {#each para.phrases as phrase, fi}
          <span
            class="cursor-pointer transition-colors px-0.5 rounded {hoveredPhrase === `${pi}-${fi}` ? 'bg-gold-400/20 text-gold-300' : 'hover:bg-ink-800'}"
            onmouseenter={() => hoveredPhrase = `${pi}-${fi}`}
            onmouseleave={() => hoveredPhrase = null}
          >{phrase.translation}</span>{' '}
        {/each}
      </div>
    </div>
    {#if pi < paragraphs.length - 1}
      <hr class="border-ink-800" />
    {/if}
  {/each}
</div>
