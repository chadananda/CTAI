<script>
let { value = $bindable('literary') } = $props();
const styles = [
  { id: 'literary', label: 'Literary', desc: 'Elevated, majestic prose in the tradition of Shoghi Effendi' },
  { id: 'literal', label: 'Literal', desc: 'Close to source structure, scholarly accuracy' },
  { id: 'technical', label: 'Technical', desc: 'Precise doctrinal terminology, cross-referenced' },
];
</script>

<div class="space-y-2">
  <label class="text-sm font-mono text-ink-400">Translation Style</label>
  <div class="grid grid-cols-3 gap-2">
    {#each styles as style}
      <button
        type="button"
        onclick={() => value = style.id}
        class="p-3 rounded-lg border text-left transition-all {value === style.id ? 'border-gold-500/60 bg-gold-400/5' : 'border-ink-700/40 bg-ink-800/40 hover:border-ink-600'}"
      >
        <div class="text-sm font-semibold {value === style.id ? 'text-gold-400' : 'text-ink-300'}">{style.label}</div>
        <div class="text-xs text-ink-500 mt-1">{style.desc}</div>
      </button>
    {/each}
  </div>
</div>
