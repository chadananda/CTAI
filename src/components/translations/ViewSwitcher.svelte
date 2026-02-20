<script>
let { view = $bindable('report') } = $props();
const views = [
  { id: 'report', label: 'Report' },
  { id: 'phrases', label: 'Phrase Study' },
  { id: 'reader', label: 'Reader' },
];
</script>

<div class="flex border-b border-ink-700/60 mb-6">
  {#each views as v}
    <button
      type="button"
      onclick={() => view = v.id}
      class="px-4 py-2 text-sm font-mono transition-colors -mb-px {view === v.id ? 'text-gold-400 border-b-2 border-gold-400' : 'text-ink-500 hover:text-ink-300'}"
    >
      {v.label}
    </button>
  {/each}
</div>
