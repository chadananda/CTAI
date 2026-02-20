<script>
import SourceInput from './SourceInput.svelte';
import CostEstimate from './CostEstimate.svelte';
import StyleSelector from './StyleSelector.svelte';
import JobProgress from './JobProgress.svelte';
let sourceText = $state('');
let lang = $state('ar');
let style = $state('literary');
let estimate = $state(null);
let estimateLoading = $state(false);
let jobId = $state(null);
let submitting = $state(false);
let error = $state(null);
async function getEstimate() {
  if (!sourceText.trim()) return;
  estimateLoading = true;
  error = null;
  try {
    const res = await fetch('/api/translate/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: sourceText, lang }),
    });
    if (!res.ok) throw new Error('Failed to estimate cost');
    estimate = await res.json();
  } catch (err) {
    error = err.message;
  } finally {
    estimateLoading = false;
  }
}
async function startTranslation() {
  submitting = true;
  error = null;
  try {
    // Create checkout session
    const checkoutRes = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'translation',
        amount: estimate.totalCost,
        description: `CTAI Translation (${lang === 'ar' ? 'Arabic' : 'Persian'}, ${style})`,
      }),
    });
    if (!checkoutRes.ok) throw new Error('Failed to create checkout');
    const { url } = await checkoutRes.json();
    // Redirect to Stripe Checkout
    window.location.href = url;
  } catch (err) {
    error = err.message;
    submitting = false;
  }
}
let canEstimate = $derived(sourceText.trim().length > 20);
let canSubmit = $derived(estimate && !submitting);
</script>

{#if jobId}
  <JobProgress {jobId} />
{:else}
  <div class="space-y-6">
    <SourceInput bind:value={sourceText} bind:lang={lang} />
    <StyleSelector bind:value={style} />

    {#if error}
      <div class="bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-red-300 text-sm">{error}</div>
    {/if}

    <div class="flex items-center gap-4">
      <button
        type="button"
        onclick={getEstimate}
        disabled={!canEstimate || estimateLoading}
        class="px-4 py-2 text-sm font-mono bg-ink-800 border border-ink-700 text-ink-300 rounded-lg hover:border-ink-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {estimateLoading ? 'Estimating...' : 'Estimate Cost'}
      </button>

      {#if estimate}
        <button
          type="button"
          onclick={startTranslation}
          disabled={!canSubmit}
          class="px-4 py-2 text-sm font-mono bg-gold-400/10 border border-gold-500/40 text-gold-400 rounded-lg hover:bg-gold-400/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Redirecting to payment...' : `Pay $${estimate.totalCost.toFixed(2)} & Translate`}
        </button>
      {/if}
    </div>

    <CostEstimate {estimate} loading={estimateLoading} />
  </div>
{/if}
