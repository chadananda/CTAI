<script>
let { work, translation = null, sponsorship = null } = $props();
let isTranslated = $derived(!!translation);
let fundingProgress = $derived(
  sponsorship ? Math.min(100, (sponsorship.funded_usd / sponsorship.estimated_cost_usd) * 100) : 0
);
</script>

<div class="block p-4 bg-ink-800/40 rounded-lg border border-ink-700/40 hover:border-gold-500/30 transition-colors">
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <div class="font-semibold text-ink-100 text-sm mb-1">{work.title}</div>
      {#if work.title_original}
        <div class="font-arabic text-ink-400 text-sm" dir="rtl">{work.title_original}</div>
      {/if}
    </div>
    {#if isTranslated}
      <span class="text-[10px] uppercase tracking-wider text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded shrink-0">Translated</span>
    {:else}
      <span class="text-[10px] uppercase tracking-wider text-ink-500 bg-ink-700 px-1.5 py-0.5 rounded shrink-0">Untranslated</span>
    {/if}
  </div>

  <div class="flex items-center gap-2 mt-2">
    <span class="text-[10px] uppercase tracking-wider text-ink-500 bg-ink-700 px-1.5 py-0.5 rounded">{work.language === 'ar' ? 'Arabic' : 'Persian'}</span>
    {#if work.se_translation}
      <span class="text-[10px] uppercase tracking-wider text-gold-400 bg-gold-400/10 px-1.5 py-0.5 rounded">SE Corpus</span>
    {/if}
  </div>

  {#if isTranslated}
    <div class="mt-3 flex items-center gap-2">
      <a href={`/translations/${translation.id}`} class="text-xs text-gold-400 hover:text-gold-300 underline underline-offset-2">Read translation</a>
      {#if translation.pdf_sbs_para}
        <span class="text-ink-700">|</span>
        <a href={`/api/translations/${translation.id}/pdf/sbs-para`} class="text-xs text-ink-400 hover:text-ink-300">PDF</a>
      {/if}
    </div>
  {:else}
    {#if sponsorship}
      <div class="mt-3">
        <div class="flex items-center justify-between text-xs mb-1">
          <span class="text-ink-500">${sponsorship.funded_usd.toFixed(0)} of ${sponsorship.estimated_cost_usd.toFixed(0)}</span>
          <span class="text-ink-500">{fundingProgress.toFixed(0)}%</span>
        </div>
        <div class="w-full bg-ink-700 rounded-full h-1.5">
          <div class="h-1.5 rounded-full bg-gold-400 transition-all" style="width: {fundingProgress}%"></div>
        </div>
        <a href="/translations/" class="inline-block mt-2 text-xs text-gold-400 hover:text-gold-300 underline underline-offset-2">
          Sponsor this translation
        </a>
      </div>
    {:else if work.estimated_cost_usd}
      <div class="mt-3">
        <span class="text-xs text-ink-500">Est. cost: ${work.estimated_cost_usd.toFixed(0)}</span>
        <a href="/translations/" class="ml-2 text-xs text-gold-400 hover:text-gold-300 underline underline-offset-2">
          Sponsor translation
        </a>
      </div>
    {/if}
  {/if}
</div>
