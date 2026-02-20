<script>
import { onMount } from 'svelte';
let payments = $state([]);
let loading = $state(true);
onMount(async () => {
  try {
    const res = await fetch('/api/billing/history');
    if (res.ok) {
      const data = await res.json();
      payments = data.payments || [];
    }
  } finally {
    loading = false;
  }
});
const typeLabels = { translation: 'Translation', donation: 'Donation', sponsor: 'Sponsorship' };
const statusColors = { completed: 'text-emerald-400', pending: 'text-yellow-400', failed: 'text-red-400', refunded: 'text-ink-500' };
</script>

{#if loading}
  <div class="animate-pulse space-y-2">
    {#each Array(3) as _}
      <div class="h-12 bg-ink-800 rounded"></div>
    {/each}
  </div>
{:else if payments.length === 0}
  <p class="text-ink-500 text-sm">No payments yet.</p>
{:else}
  <div class="space-y-2">
    {#each payments as payment}
      <div class="flex items-center justify-between py-3 px-4 bg-ink-800/40 rounded-lg border border-ink-700/40">
        <div>
          <div class="text-sm text-ink-200">{payment.document_title || typeLabels[payment.type] || payment.type}</div>
          <div class="text-xs text-ink-500">{new Date(payment.created_at).toLocaleDateString()}</div>
        </div>
        <div class="text-right">
          <div class="text-sm font-mono text-ink-200">${payment.amount_usd.toFixed(2)}</div>
          <div class="text-xs {statusColors[payment.status] || 'text-ink-500'}">{payment.status}</div>
        </div>
      </div>
    {/each}
  </div>
{/if}
