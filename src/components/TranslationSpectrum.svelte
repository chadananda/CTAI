<script>
  /** @type {{ segments: Array<{label: string, count: number, highlighted?: boolean}> }} */
  let { segments } = $props();

  const total = $derived(segments.reduce((sum, s) => sum + s.count, 0));

  // Color palette for segments
  const colors = [
    'bg-gold-400', 'bg-amber-500', 'bg-orange-500', 'bg-rose-400',
    'bg-violet-400', 'bg-blue-400', 'bg-emerald-400', 'bg-teal-400',
  ];
</script>

{#if segments.length > 0 && total > 0}
  <div class="space-y-1.5">
    <div class="flex h-2.5 rounded-full overflow-hidden bg-ink-800/60">
      {#each segments as seg, i}
        {@const pct = (seg.count / total) * 100}
        <div
          class="{colors[i % colors.length]} {seg.highlighted ? 'opacity-100' : 'opacity-50'}
                 transition-all"
          style="width: {Math.max(pct, 1.5)}%"
          title="{seg.label}: {seg.count} ({pct.toFixed(0)}%)"
        ></div>
      {/each}
    </div>
    <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
      {#each segments.slice(0, 6) as seg, i}
        {@const pct = (seg.count / total) * 100}
        <span class="flex items-center gap-1">
          <span class="inline-block w-2 h-2 rounded-sm {colors[i % colors.length]} {seg.highlighted ? 'opacity-100' : 'opacity-50'}"></span>
          <span class="{seg.highlighted ? 'text-ink-200' : 'text-ink-500'}">{seg.label}</span>
          <span class="text-ink-600">{pct.toFixed(0)}%</span>
        </span>
      {/each}
      {#if segments.length > 6}
        <span class="text-ink-600">+{segments.length - 6} more</span>
      {/if}
    </div>
  </div>
{/if}
