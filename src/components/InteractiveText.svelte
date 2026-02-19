<script>
  let { alignment = [], source_text = '', translation = '', source_lang = 'ar' } = $props();
  let activeIdx = $state(-1);

  // Build segments: find alignment phrases in text, split into aligned/unaligned parts
  function buildSegments(text, alignmentArr, field) {
    if (!alignmentArr?.length) return [{ text, idx: -1 }];

    const segments = [];
    let remaining = text;

    // Find each alignment phrase in order
    for (let i = 0; i < alignmentArr.length; i++) {
      const phrase = alignmentArr[i][field];
      if (!phrase) continue;

      const pos = remaining.indexOf(phrase);
      if (pos === -1) continue;

      // Add unaligned text before this phrase
      if (pos > 0) {
        const before = remaining.slice(0, pos).trim();
        if (before) segments.push({ text: before, idx: -1 });
      }

      // Add aligned phrase
      segments.push({ text: phrase, idx: i });
      remaining = remaining.slice(pos + phrase.length);
    }

    // Add remaining unaligned text
    const tail = remaining.trim();
    if (tail) segments.push({ text: tail, idx: -1 });

    // If nothing matched, return whole text
    if (segments.length === 0) return [{ text, idx: -1 }];
    return segments;
  }

  function phraseClass(idx) {
    if (activeIdx === idx) return 'cursor-pointer rounded px-0.5 transition-colors duration-150 bg-gold-500/20 text-gold-200';
    return 'cursor-pointer rounded px-0.5 transition-colors duration-150 text-ink-200';
  }

  const sourceSegments = $derived(buildSegments(source_text, alignment, 'ar'));
  const transSegments = $derived(buildSegments(translation, alignment, 'en'));
</script>

<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
  <!-- Source text -->
  <div class="bg-ink-800/40 rounded-lg border border-ink-700/40 p-6">
    <h2 class="text-xs uppercase tracking-wider text-ink-500 mb-3">
      Source ({source_lang === 'ar' ? 'Arabic' : 'Persian'})
    </h2>
    <div dir="rtl" class="font-arabic text-xl leading-loose text-right">
      {#each sourceSegments as seg}
        {#if seg.idx >= 0}
          <span
            class={phraseClass(seg.idx)}
            onmouseenter={() => activeIdx = seg.idx}
            onmouseleave={() => activeIdx = -1}
          >{seg.text}</span>
        {:else}
          <span class="text-ink-400">{seg.text}</span>
        {/if}
        {' '}
      {/each}
    </div>
  </div>

  <!-- Translation -->
  <div class="bg-ink-800/40 rounded-lg border border-ink-700/40 p-6">
    <h2 class="text-xs uppercase tracking-wider text-ink-500 mb-3">Translation</h2>
    <div class="text-lg leading-relaxed">
      {#each transSegments as seg}
        {#if seg.idx >= 0}
          <span
            class={phraseClass(seg.idx)}
            onmouseenter={() => activeIdx = seg.idx}
            onmouseleave={() => activeIdx = -1}
          >{seg.text}</span>
        {:else}
          <span class="text-ink-400">{seg.text}</span>
        {/if}
        {' '}
      {/each}
    </div>
  </div>
</div>
