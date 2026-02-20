<script>
let { paragraphs = [] } = $props();
</script>

<article class="prose prose-invert prose-gold max-w-3xl mx-auto">
  {#each paragraphs as para}
    <p class="text-ink-200 leading-relaxed text-lg mb-6">{para.translation}</p>
  {/each}
</article>
