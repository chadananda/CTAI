<script>
let file = $state(null);
let message = $state('');
let email = $state('');
let submitting = $state(false);
let success = $state(false);
let error = $state(null);
async function submit() {
  if (!file) return;
  submitting = true;
  error = null;
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('message', message);
    formData.append('email', email);
    const res = await fetch('/api/donate/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Upload failed');
    }
    success = true;
  } catch (err) {
    error = err.message;
  } finally {
    submitting = false;
  }
}
function handleFileChange(e) {
  file = e.target.files[0] || null;
}
let canSubmit = $derived(!!file && !submitting);
</script>

<div class="bg-ink-800/40 border border-ink-700/40 rounded-lg p-6">
  <h3 class="text-lg font-semibold text-ink-100 mb-2">Submit a Document for Translation</h3>
  <p class="text-sm text-ink-400 mb-4">
    Have an Arabic or Persian text you'd like CTAI to translate? Upload it here and we'll review it for inclusion in our translation catalog.
  </p>

  {#if success}
    <div class="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-4 text-emerald-300 text-sm">
      Document submitted successfully. We'll review it and reach out if we need more information.
    </div>
  {:else}
    <div class="space-y-4">
      <div>
        <label for="doc-file" class="block text-xs text-ink-500 mb-1">Document file (.txt, .md, or .pdf)</label>
        <input
          id="doc-file"
          type="file"
          accept=".txt,.md,.pdf"
          onchange={handleFileChange}
          class="block w-full text-sm text-ink-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-ink-700 file:text-sm file:font-mono file:bg-ink-800 file:text-ink-300 hover:file:border-ink-500 file:cursor-pointer file:transition-colors"
        />
      </div>

      <div>
        <label for="doc-email" class="block text-xs text-ink-500 mb-1">Your email (optional, for follow-up)</label>
        <input
          id="doc-email"
          type="email"
          bind:value={email}
          placeholder="your@email.com"
          class="w-full px-3 py-2 text-sm bg-ink-800 border border-ink-700 rounded-lg text-ink-300 placeholder:text-ink-600 focus:border-gold-500/40 focus:outline-none"
        />
      </div>

      <div>
        <label for="doc-message" class="block text-xs text-ink-500 mb-1">Message (optional)</label>
        <textarea
          id="doc-message"
          bind:value={message}
          rows="3"
          placeholder="Any context about this document — title, author, language, why you'd like it translated..."
          class="w-full px-3 py-2 text-sm bg-ink-800 border border-ink-700 rounded-lg text-ink-300 placeholder:text-ink-600 focus:border-gold-500/40 focus:outline-none resize-none"
        ></textarea>
      </div>

      {#if error}
        <div class="text-sm text-red-400">{error}</div>
      {/if}

      <button
        type="button"
        onclick={submit}
        disabled={!canSubmit}
        class="px-4 py-2 text-sm font-mono bg-ink-800 border border-ink-700 text-ink-300 rounded-lg hover:border-ink-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? 'Uploading...' : 'Submit Document'}
      </button>
    </div>
  {/if}
</div>
