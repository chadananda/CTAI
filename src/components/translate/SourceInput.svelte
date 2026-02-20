<script>
let { value = $bindable(''), lang = $bindable('ar'), onsubmit } = $props();
let charCount = $derived(value.length);
// Simple language detection: Arabic has more Arabic-specific chars, Persian has specific chars like گ چ پ ژ
let detectedLang = $derived(() => {
  if (!value) return 'ar';
  const persianChars = (value.match(/[گچپژکی]/g) || []).length;
  return persianChars > 3 ? 'fa' : 'ar';
});
$effect(() => {
  if (value.length > 10) lang = detectedLang();
});
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between">
    <label for="source-text" class="text-sm font-mono text-ink-400">Source Text</label>
    <div class="flex items-center gap-3">
      <select bind:value={lang} class="bg-ink-800 border border-ink-700 text-ink-300 text-xs font-mono rounded px-2 py-1">
        <option value="ar">Arabic</option>
        <option value="fa">Persian</option>
      </select>
      <span class="text-xs text-ink-500 font-mono">{charCount.toLocaleString()} chars</span>
    </div>
  </div>
  <textarea
    id="source-text"
    bind:value={value}
    dir="rtl"
    class="w-full h-48 bg-ink-800/60 border border-ink-700/60 rounded-lg p-4 text-ink-200 font-arabic text-lg leading-relaxed resize-y focus:outline-none focus:border-gold-500/40 placeholder-ink-600"
    placeholder={lang === 'ar' ? 'الصق النص العربي هنا...' : 'متن فارسی را اینجا قرار دهید...'}
  ></textarea>
</div>
