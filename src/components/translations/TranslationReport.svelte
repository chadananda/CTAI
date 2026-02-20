<script>
let { translation, phases = [] } = $props();
let totalCost = $derived(phases.reduce((s, p) => s + (p.cost_usd || 0), 0));
let totalTokens = $derived(phases.reduce((s, p) => s + (p.tokens_in || 0) + (p.tokens_out || 0), 0));
let roundCount = $derived(Math.max(...phases.filter(p => p.phase === 'render_round').map(p => p.round), 0));
</script>

<div class="space-y-6">
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="bg-ink-800/40 rounded-lg p-4 border border-ink-700/40">
      <div class="text-xs font-mono text-ink-500 mb-1">Phases</div>
      <div class="text-2xl font-semibold text-ink-200">{phases.length}</div>
    </div>
    <div class="bg-ink-800/40 rounded-lg p-4 border border-ink-700/40">
      <div class="text-xs font-mono text-ink-500 mb-1">Deliberation Rounds</div>
      <div class="text-2xl font-semibold text-ink-200">{roundCount}</div>
    </div>
    <div class="bg-ink-800/40 rounded-lg p-4 border border-ink-700/40">
      <div class="text-xs font-mono text-ink-500 mb-1">Total Tokens</div>
      <div class="text-2xl font-semibold text-ink-200">{totalTokens.toLocaleString()}</div>
    </div>
    <div class="bg-ink-800/40 rounded-lg p-4 border border-ink-700/40">
      <div class="text-xs font-mono text-ink-500 mb-1">Cost</div>
      <div class="text-2xl font-semibold text-ink-200">${totalCost.toFixed(2)}</div>
    </div>
  </div>

  <div>
    <h3 class="text-sm font-mono text-ink-400 mb-3">Pipeline Phases</h3>
    <div class="space-y-1">
      {#each phases as phase}
        <div class="flex items-center justify-between py-2 px-3 bg-ink-800/30 rounded text-sm">
          <span class="text-ink-300">{phase.phase}{phase.agent_role ? ` (${phase.agent_role})` : ''}</span>
          <div class="flex items-center gap-4 text-xs text-ink-500">
            {#if phase.round > 0}<span>Round {phase.round}</span>{/if}
            <span>{(phase.tokens_in + phase.tokens_out).toLocaleString()} tok</span>
            <span>${phase.cost_usd?.toFixed(3)}</span>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
