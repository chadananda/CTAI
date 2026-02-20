<script>
let { estimate = null, loading = false } = $props();
</script>

{#if loading}
  <div class="bg-ink-800/40 border border-ink-700/40 rounded-lg p-6 animate-pulse">
    <div class="h-4 bg-ink-700 rounded w-1/3 mb-3"></div>
    <div class="h-8 bg-ink-700 rounded w-1/4"></div>
  </div>
{:else if estimate}
  <div class="bg-ink-800/40 border border-ink-700/40 rounded-lg p-6">
    <h3 class="text-sm font-mono text-ink-400 mb-4">Cost Estimate</h3>
    <div class="text-3xl font-semibold text-gold-400 mb-4">${estimate.totalCost.toFixed(2)}</div>
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div class="flex justify-between">
        <span class="text-ink-500">Paragraphs</span>
        <span class="text-ink-300">{estimate.estimatedParagraphs}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-ink-500">Characters</span>
        <span class="text-ink-300">{estimate.charCount.toLocaleString()}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-ink-500">Segmentation</span>
        <span class="text-ink-300">${estimate.breakdown.segmentation.toFixed(2)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-ink-500">Research</span>
        <span class="text-ink-300">${estimate.breakdown.research.toFixed(2)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-ink-500">Translation</span>
        <span class="text-ink-300">${estimate.breakdown.translation.toFixed(2)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-ink-500">Assembly</span>
        <span class="text-ink-300">${estimate.breakdown.assembly.toFixed(2)}</span>
      </div>
    </div>
    <p class="text-xs text-ink-600 mt-3">Includes 50% buffer for retries and variance.</p>
  </div>
{/if}
