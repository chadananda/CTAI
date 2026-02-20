<script>
let amount = $state(25);
let message = $state('');
let submitting = $state(false);
let error = $state(null);
const presets = [10, 25, 50, 100];
async function donate() {
  if (amount < 1) return;
  submitting = true;
  error = null;
  try {
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'donation', amount, description: 'CTAI Donation' }),
    });
    if (!res.ok) throw new Error('Failed to create checkout');
    const { url } = await res.json();
    window.location.href = url;
  } catch (err) {
    error = err.message;
    submitting = false;
  }
}
</script>

<div class="bg-ink-800/40 border border-ink-700/40 rounded-lg p-6">
  <h3 class="text-lg font-semibold text-ink-100 mb-4">General Donation</h3>
  <p class="text-sm text-ink-400 mb-4">Support the general translation fund. Donations help cover infrastructure costs and fund translations of works that haven't found individual sponsors.</p>

  <div class="flex gap-2 mb-4">
    {#each presets as preset}
      <button
        type="button"
        onclick={() => amount = preset}
        class="px-3 py-1.5 text-sm font-mono rounded-lg border transition-colors {amount === preset ? 'border-gold-500/60 bg-gold-400/10 text-gold-400' : 'border-ink-700 text-ink-400 hover:border-ink-500'}"
      >${preset}</button>
    {/each}
    <input
      type="number"
      bind:value={amount}
      min="1"
      class="w-20 px-2 py-1.5 text-sm font-mono bg-ink-800 border border-ink-700 rounded-lg text-ink-300 text-center"
    />
  </div>

  {#if error}
    <div class="text-sm text-red-400 mb-3">{error}</div>
  {/if}

  <button
    type="button"
    onclick={donate}
    disabled={submitting || amount < 1}
    class="px-4 py-2 text-sm font-mono bg-gold-400/10 border border-gold-500/40 text-gold-400 rounded-lg hover:bg-gold-400/20 transition-colors disabled:opacity-40"
  >
    {submitting ? 'Redirecting...' : `Donate $${amount}`}
  </button>
</div>
