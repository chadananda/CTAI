<script>
  let {
    alignment = [],
    source_text = '',
    translation = '',
    source_lang = 'ar',
    terms = [],
    workSlug = '',
  } = $props();

  let activeIdx = $state(-1);

  const hasAlignment = alignment && alignment.length > 0;
  const hasTerms = terms && terms.length > 0;

  function slugify(phrase) {
    return phrase.toLowerCase().trim().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // ── InteractiveText logic ──

  // Build segments by finding phrases at their exact positions in the text.
  // No trimming — preserves original spacing and punctuation attachment.
  // Find phrase in text only at word boundaries (not inside other words)
  const BOUNDARY = /[\s,.:;!?'"()\[\]{}\u060C\u061B\u061F\u200C\u200D\u2014\u2013\u2018\u2019\u201C\u201D]/;
  function findWhole(text, phrase, startFrom = 0) {
    let pos = startFrom;
    while (pos <= text.length - phrase.length) {
      const idx = text.indexOf(phrase, pos);
      if (idx === -1) return -1;
      const before = idx > 0 ? text[idx - 1] : '';
      const after = idx + phrase.length < text.length ? text[idx + phrase.length] : '';
      if ((!before || BOUNDARY.test(before)) && (!after || BOUNDARY.test(after))) return idx;
      pos = idx + 1;
    }
    return -1;
  }

  function buildSegments(text, alignmentArr, field) {
    if (!alignmentArr?.length) return [{ text, idx: -1 }];
    // Find all phrases at word boundaries in the full text
    const found = [];
    for (let i = 0; i < alignmentArr.length; i++) {
      const phrase = alignmentArr[i][field];
      if (!phrase) continue;
      const pos = findWhole(text, phrase);
      if (pos === -1) continue;
      found.push({ pos, len: phrase.length, text: phrase, idx: i });
    }
    if (found.length === 0) return [{ text, idx: -1 }];
    // Sort by position, remove overlaps (keep earlier match)
    found.sort((a, b) => a.pos - b.pos);
    const clean = [found[0]];
    for (let i = 1; i < found.length; i++) {
      const prev = clean[clean.length - 1];
      if (found[i].pos >= prev.pos + prev.len) clean.push(found[i]);
    }
    // Build segments covering the full text — no trimming
    const segments = [];
    let cursor = 0;
    for (const f of clean) {
      if (f.pos > cursor) {
        segments.push({ text: text.slice(cursor, f.pos), idx: -1 });
      }
      segments.push({ text: f.text, idx: f.idx });
      cursor = f.pos + f.len;
    }
    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor), idx: -1 });
    }
    return segments;
  }

  function phraseClass(idx) {
    if (activeIdx === idx) return 'cursor-pointer rounded transition-colors duration-150 bg-gold-500/20 text-gold-200';
    return 'cursor-pointer rounded transition-colors duration-150 text-ink-200';
  }

  const sourceSegments = $derived(hasAlignment ? buildSegments(source_text, alignment, 'ar') : []);
  const transSegments = $derived(hasAlignment ? buildSegments(translation, alignment, 'en') : []);

  // ── TermCloud logic ──

  const cloudData = $derived.by(() => {
    const counts = new Map();
    for (const t of terms) {
      const refCount = (t.cross_refs?.length || 0) + 1;
      counts.set(t.term, {
        term: t.term,
        transliteration: t.transliteration,
        literal: t.literal,
        count: refCount,
        se_rendering: t.se_rendering,
      });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  });

  function fontSize(count, max) {
    const min_size = 0.75;
    const max_size = 1.5;
    if (max <= 1) return 1;
    const ratio = Math.log(count + 1) / Math.log(max + 1);
    return min_size + ratio * (max_size - min_size);
  }

  // ── CrossRefLinks logic ──

  const crossRefGroups = $derived.by(() => {
    const map = new Map();
    for (const t of terms) {
      if (!t.cross_refs?.length) continue;
      const key = t.term;
      if (!map.has(key)) map.set(key, { term: t.term, transliteration: t.transliteration, refs: [] });
      for (const ref of t.cross_refs) {
        const id = `${ref.work}-${ref.para}`;
        const existing = map.get(key).refs;
        if (!existing.some(r => `${r.work}-${r.para}` === id)) {
          existing.push(ref);
        }
      }
    }
    return [...map.values()].filter(g => g.refs.length > 0);
  });

</script>

<!-- Side-by-side source + translation -->
{#if hasAlignment}
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
    <div class="bg-ink-800/40 rounded-lg border border-ink-700/40 p-6">
      <h2 class="text-xs uppercase tracking-wider text-ink-500 mb-3">
        Source ({source_lang === 'ar' ? 'Arabic' : 'Persian'})
      </h2>
      <div dir="rtl" lang={source_lang} class="font-arabic text-xl leading-loose text-right">
        {#each sourceSegments as seg, i}
          {#if seg.idx >= 0}
            <span
              class={phraseClass(seg.idx)}
              tabindex="0"
              onmouseenter={() => activeIdx = seg.idx}
              onmouseleave={() => activeIdx = -1}
              onfocus={() => activeIdx = seg.idx}
              onblur={() => activeIdx = -1}
            >{seg.text}</span>
          {:else}
            <span class="text-ink-400">{seg.text}</span>
          {/if}
        {/each}
      </div>
    </div>

    <div class="bg-ink-800/40 rounded-lg border border-ink-700/40 p-6">
      <h2 class="text-xs uppercase tracking-wider text-ink-500 mb-3">Translation</h2>
      <div class="text-lg leading-relaxed">
        {#each transSegments as seg, i}
          {#if seg.idx >= 0}
            <span
              class={phraseClass(seg.idx)}
              tabindex="0"
              onmouseenter={() => activeIdx = seg.idx}
              onmouseleave={() => activeIdx = -1}
              onfocus={() => activeIdx = seg.idx}
              onblur={() => activeIdx = -1}
            >{seg.text}</span>
          {:else}
            <span class="text-ink-400">{seg.text}</span>
          {/if}
        {/each}
      </div>
    </div>
  </div>
{:else}
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
    <div class="bg-ink-800/40 rounded-lg border border-ink-700/40 p-6">
      <h2 class="text-xs uppercase tracking-wider text-ink-500 mb-3">
        Source ({source_lang === 'ar' ? 'Arabic' : 'Persian'})
      </h2>
      <div dir="rtl" lang={source_lang} class="font-arabic text-xl leading-loose text-ink-200 text-right">
        {source_text}
      </div>
    </div>
    <div class="bg-ink-800/40 rounded-lg border border-ink-700/40 p-6">
      <h2 class="text-xs uppercase tracking-wider text-ink-500 mb-3">Translation</h2>
      <div class="text-lg leading-relaxed text-ink-200">
        {translation}
      </div>
    </div>
  </div>
{/if}

<!-- Term cloud -->
{#if cloudData.length > 0}
  <section aria-label="Key terms" class="mb-8">
    <h2 class="text-xs font-mono tracking-wider text-ink-500 uppercase mb-3">Key Terms</h2>
    <div class="flex flex-wrap gap-2 items-baseline">
      {#each cloudData as item}
        <span
          class="inline-flex items-baseline gap-1 bg-ink-800/60 border border-ink-700/40
                 rounded-full px-3 py-1 hover:border-gold-500/30 hover:bg-ink-800
                 transition-all cursor-default group"
          style="font-size: {fontSize(item.count, cloudData[0]?.count || 1)}rem"
          title="{item.transliteration}: {item.literal} — {item.count} occurrences across corpus"
        >
          <span class="font-arabic text-gold-300 group-hover:text-gold-200" dir="rtl" lang="ar">{item.term}</span>
          {#if item.se_rendering}
            <a href="/concordance/english/{slugify(item.se_rendering)}/" class="text-ink-500 text-xs font-mono hover:text-gold-400 transition-colors">{item.se_rendering}</a>
          {/if}
          <span class="text-ink-600 text-xs">({item.count})</span>
        </span>
      {/each}
    </div>
  </section>
{/if}

<!-- Term annotations — always in DOM for SEO, <details> for no-JS collapse -->
{#if hasTerms}
  <section aria-label="Translation notes" class="mb-10">
    <h2 class="text-sm font-semibold text-ink-400 uppercase tracking-wider mb-4">
      Translation Notes
    </h2>
    <div class="space-y-3">
      {#each terms as term}
        <details class="border-l border-gold-500/30 pl-4 py-2 group/detail">
          <summary class="cursor-pointer list-none w-full text-left select-none
                          [&::-webkit-details-marker]:hidden marker:hidden">
            <span class="font-arabic text-lg text-gold-300" dir="rtl" lang="ar">{term.term}</span>
            {#if term.transliteration}
              <span class="text-ink-400 ml-2 font-mono text-xs">({term.transliteration})</span>
            {/if}
            {#if term.se_rendering}
              <a href="/concordance/english/{slugify(term.se_rendering)}/" class="text-gold-400 text-sm ml-1 hover:text-gold-300 transition-colors">&mdash; &ldquo;{term.se_rendering}&rdquo;</a>
            {/if}
            <span class="text-ink-600 text-xs ml-2 group-hover/detail:text-ink-400 transition-colors
                         group-open/detail:rotate-90 inline-block transition-transform duration-150">&#x25B6;</span>
          </summary>

          <div class="mt-2 ml-4 space-y-2 text-sm">
            {#if term.literal}
              <p class="text-ink-500">Literal: &ldquo;{term.literal}&rdquo;</p>
            {/if}
            {#if term.note}
              <p class="text-ink-300 leading-relaxed">{term.note}</p>
            {/if}
            {#if term.cross_refs?.length}
              <div class="mt-2">
                <p class="text-ink-500 text-xs font-mono tracking-wider uppercase mb-1">Also rendered as:</p>
                <div class="space-y-1.5">
                  {#each term.cross_refs as ref}
                    <a href="/models/{ref.work}/{ref.para}/"
                       class="flex items-baseline gap-2 text-sm px-2 py-1 rounded
                              bg-ink-800/60 border border-ink-700/30
                              hover:border-gold-500/30 hover:bg-ink-800 transition-all group">
                      <span class="font-mono text-xs text-ink-500 shrink-0">{ref.work} &sect;{ref.para}</span>
                      {#if ref.snippet}
                        <span class="text-gold-400/80 group-hover:text-gold-300">&ldquo;{ref.snippet}&rdquo;</span>
                      {/if}
                    </a>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </details>
      {/each}
    </div>
  </section>
{/if}

<!-- Cross-references -->
{#if crossRefGroups.length > 0}
  <section aria-label="Cross-references" class="mt-8 pt-6 border-t border-ink-700/40">
    <h2 class="text-xs font-mono tracking-wider text-ink-500 uppercase mb-4">Cross-References</h2>
    <p class="text-xs text-ink-600 mb-4">Terms in this paragraph also appear in:</p>

    <div class="space-y-3">
      {#each crossRefGroups as group}
        <div>
          <span class="font-arabic text-gold-300" dir="rtl" lang="ar">{group.term}</span>
          {#if group.transliteration}
            <span class="text-ink-500 text-xs font-mono ml-1">({group.transliteration})</span>
          {/if}
          <span class="text-ink-600 text-xs">:</span>
          <span class="ml-2 inline-flex flex-wrap gap-1">
            {#each group.refs.slice(0, 12) as ref}
              <a href="/models/{ref.work}/{ref.para}/"
                 class="text-xs bg-ink-800 text-ink-400 px-2 py-0.5 rounded border border-ink-700/40
                        hover:border-gold-500/30 hover:text-gold-400 transition-all font-mono">
                {ref.work} &sect;{ref.para}{#if ref.snippet} &mdash; <span class="text-gold-400/70">&ldquo;{ref.snippet}&rdquo;</span>{/if}
              </a>
            {/each}
            {#if group.refs.length > 12}
              <span class="text-xs text-ink-600 font-mono">&hellip; +{group.refs.length - 12} more</span>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  </section>
{/if}
