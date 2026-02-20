<script>
  let { clientId = '' } = $props();

  let user = $state(null);
  let keys = $state([]);
  let usage = $state(null);
  let loading = $state(true);
  let newKey = $state(null);
  let error = $state('');

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      user = data.user;
      if (user) await Promise.all([loadKeys(), loadUsage()]);
    } catch {} finally {
      loading = false;
    }
  }

  async function loadKeys() {
    const res = await fetch('/api/keys');
    const data = await res.json();
    keys = data.keys || [];
  }

  async function loadUsage() {
    const res = await fetch('/api/usage');
    usage = await res.json();
  }

  async function createKey() {
    error = '';
    const res = await fetch('/api/keys', { method: 'POST' });
    if (!res.ok) { error = 'Failed to create key'; return; }
    const data = await res.json();
    newKey = data.key;
    await loadKeys();
  }

  async function revokeKey(id) {
    await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    await loadKeys();
    if (newKey) newKey = null;
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    user = null;
    keys = [];
    usage = null;
    newKey = null;
  }

  function initGoogleOneTap() {
    if (!clientId || !window.google?.accounts) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredential,
      auto_prompt: true,
      use_fedcm_for_prompt: true,
    });
    window.google.accounts.id.renderButton(
      document.getElementById('g-signin-btn'),
      { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill' }
    );
    window.google.accounts.id.prompt();
  }

  async function handleCredential(response) {
    error = '';
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential }),
    });
    if (!res.ok) { error = 'Login failed'; return; }
    const data = await res.json();
    user = data.user;
    await Promise.all([loadKeys(), loadUsage()]);
  }

  function copyKey() {
    if (newKey) navigator.clipboard.writeText(newKey);
  }

  $effect(() => {
    checkAuth();
  });

  $effect(() => {
    if (!loading && !user) {
      // Wait for Google script to load
      const timer = setInterval(() => {
        if (window.google?.accounts) {
          initGoogleOneTap();
          clearInterval(timer);
        }
      }, 100);
      return () => clearInterval(timer);
    }
  });
</script>

{#if loading}
  <div class="flex items-center justify-center py-20">
    <span class="text-ink-500 font-mono text-sm">Loading...</span>
  </div>
{:else if !user}
  <!-- Login -->
  <div class="max-w-md mx-auto py-20 text-center">
    <h1 class="text-2xl font-serif text-ink-200 mb-2">Developer Dashboard</h1>
    <p class="text-ink-500 text-sm mb-8">Sign in to manage API keys and view usage.</p>
    <div id="g-signin-btn" class="flex justify-center"></div>
    {#if error}
      <p class="text-red-400 text-sm mt-4">{error}</p>
    {/if}
  </div>
{:else}
  <!-- Dashboard -->
  <div class="max-w-4xl mx-auto">
    <div class="flex items-center justify-between mb-8">
      <div class="flex items-center gap-3">
        {#if user.picture}
          <img src={user.picture} alt="" class="w-8 h-8 rounded-full" referrerpolicy="no-referrer" />
        {/if}
        <div>
          <span class="text-ink-200 text-sm">{user.name || user.email}</span>
          <span class="ml-2 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded bg-ink-800 text-gold-400">{user.tier}</span>
        </div>
      </div>
      <button onclick={logout} class="text-xs text-ink-500 hover:text-ink-300 font-mono transition-colors">
        Sign out
      </button>
    </div>

    <!-- API Keys -->
    <section class="mb-10">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg text-ink-200 font-serif">API Keys</h2>
        <button onclick={createKey}
          class="px-3 py-1.5 text-xs font-mono bg-gold-400/10 text-gold-400 rounded hover:bg-gold-400/20 transition-colors">
          + New Key
        </button>
      </div>

      {#if newKey}
        <div class="mb-4 p-4 bg-ink-800/60 border border-gold-400/30 rounded-lg">
          <p class="text-xs text-gold-400 font-mono mb-2">Copy your API key now — it won&rsquo;t be shown again:</p>
          <div class="flex items-center gap-2">
            <code class="flex-1 text-sm text-ink-200 font-mono bg-ink-900 px-3 py-2 rounded break-all">{newKey}</code>
            <button onclick={copyKey}
              class="px-3 py-2 text-xs font-mono bg-ink-700 text-ink-300 rounded hover:bg-ink-600 transition-colors">
              Copy
            </button>
          </div>
        </div>
      {/if}

      {#if keys.length === 0}
        <p class="text-ink-500 text-sm">No API keys yet. Create one to get started.</p>
      {:else}
        <div class="space-y-2">
          {#each keys as key}
            <div class="flex items-center justify-between p-3 bg-ink-800/40 rounded-lg">
              <div class="flex items-center gap-3">
                <code class="text-sm font-mono text-ink-300">{key.key_prefix}...</code>
                <span class="text-xs text-ink-500">{key.name}</span>
                {#if key.revoked}
                  <span class="text-[10px] font-mono text-red-400/70 uppercase">revoked</span>
                {/if}
              </div>
              <div class="flex items-center gap-3">
                {#if key.last_used}
                  <span class="text-[10px] text-ink-600 font-mono">Last used: {new Date(key.last_used).toLocaleDateString()}</span>
                {/if}
                {#if !key.revoked}
                  <button onclick={() => revokeKey(key.id)}
                    class="text-xs text-red-400/60 hover:text-red-400 font-mono transition-colors">
                    Revoke
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Usage -->
    <section>
      <h2 class="text-lg text-ink-200 font-serif mb-4">Usage — Current Period</h2>
      {#if usage}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div class="p-4 bg-ink-800/40 rounded-lg">
            <span class="block text-[10px] font-mono text-ink-500 uppercase tracking-wider mb-1">Requests</span>
            <span class="text-xl text-ink-200">{usage.totals.requests.toLocaleString()}</span>
          </div>
          <div class="p-4 bg-ink-800/40 rounded-lg">
            <span class="block text-[10px] font-mono text-ink-500 uppercase tracking-wider mb-1">AI Cost</span>
            <span class="text-xl text-ink-200">${usage.totals.cost.toFixed(4)}</span>
          </div>
          <div class="p-4 bg-ink-800/40 rounded-lg">
            <span class="block text-[10px] font-mono text-ink-500 uppercase tracking-wider mb-1">Tier</span>
            <span class="text-xl text-gold-400">{usage.tier}</span>
          </div>
          <div class="p-4 bg-ink-800/40 rounded-lg">
            <span class="block text-[10px] font-mono text-ink-500 uppercase tracking-wider mb-1">Period Start</span>
            <span class="text-sm text-ink-300">{new Date(usage.period_start).toLocaleDateString()}</span>
          </div>
        </div>

        {#if usage.services.length > 0}
          <div class="space-y-2">
            {#each usage.services as svc}
              <div class="flex items-center justify-between p-3 bg-ink-800/30 rounded-lg">
                <span class="text-sm font-mono text-ink-300">{svc.service}</span>
                <div class="flex items-center gap-6 text-xs font-mono text-ink-500">
                  <span>{svc.requests} req</span>
                  <span>{(svc.total_tokens_in + svc.total_tokens_out).toLocaleString()} tokens</span>
                  <span class="text-ink-300">${svc.total_cost.toFixed(4)}</span>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-ink-500 text-sm">No usage this period.</p>
        {/if}
      {:else}
        <p class="text-ink-500 text-sm">Loading usage data...</p>
      {/if}
    </section>

    {#if error}
      <p class="text-red-400 text-sm mt-6">{error}</p>
    {/if}
  </div>
{/if}
