<script>
import { onMount } from 'svelte';

let translations = $state(null);
let payments = $state(null);
let visitors = $state(null);
let searchConsole = $state(null);
let costModel = $state(null);
let loading = $state(true);

onMount(async () => {
  const [tRes, pRes, vRes, scRes, cmRes] = await Promise.allSettled([
    fetch('/api/admin/analytics/translations').then(r => r.json()),
    fetch('/api/admin/analytics/payments').then(r => r.json()),
    fetch('/api/admin/analytics/visitors').then(r => r.json()),
    fetch('/api/admin/analytics/search-console').then(r => r.json()),
    fetch('/api/admin/cost-model').then(r => r.json()),
  ]);
  if (tRes.status === 'fulfilled') translations = tRes.value;
  if (pRes.status === 'fulfilled') payments = pRes.value;
  if (vRes.status === 'fulfilled') visitors = vRes.value;
  if (scRes.status === 'fulfilled') searchConsole = scRes.value;
  if (cmRes.status === 'fulfilled') costModel = cmRes.value;
  loading = false;
});

let calibrating = $state(false);
async function autoCalibrate() {
  calibrating = true;
  try {
    const res = await fetch('/api/admin/cost-model', { method: 'POST' });
    const data = await res.json();
    if (data.calibrated) costModel = { ...costModel, model: data.calibrated };
  } finally {
    calibrating = false;
  }
}
</script>

{#if loading}
  <div class="grid grid-cols-2 gap-6 animate-pulse">
    {#each Array(4) as _}
      <div class="h-64 bg-ink-800/40 rounded-lg"></div>
    {/each}
  </div>
{:else}
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Translation Activity -->
    <div class="bg-ink-800/40 border border-ink-700/40 rounded-lg p-6">
      <h3 class="text-sm font-mono text-ink-400 mb-4">Translation Activity</h3>
      {#if translations?.stats}
        <div class="flex gap-4 mb-4">
          {#each translations.stats as s}
            <div class="text-center">
              <div class="text-xl font-semibold text-ink-200">{s.count}</div>
              <div class="text-xs text-ink-500">{s.status}</div>
            </div>
          {/each}
        </div>
      {/if}
      {#if translations?.jobs?.length}
        <div class="space-y-1 max-h-48 overflow-y-auto">
          {#each translations.jobs as job}
            <div class="flex items-center justify-between py-1.5 text-xs">
              <span class="text-ink-300 truncate max-w-[200px]">{job.work_title || job.id.slice(0, 8)}</span>
              <div class="flex items-center gap-3 text-ink-500">
                <span>{job.status}</span>
                <span>${job.actual_cost_usd?.toFixed(2) || '0.00'}</span>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-ink-500">No translation jobs yet.</p>
      {/if}
    </div>

    <!-- Revenue -->
    <div class="bg-ink-800/40 border border-ink-700/40 rounded-lg p-6">
      <h3 class="text-sm font-mono text-ink-400 mb-4">Revenue</h3>
      {#if payments}
        <div class="text-3xl font-semibold text-gold-400 mb-3">${payments.totalRevenue?.toFixed(2) || '0.00'}</div>
        {#if payments.byType?.length}
          <div class="flex gap-4 mb-4">
            {#each payments.byType as t}
              <div class="text-center">
                <div class="text-lg font-semibold text-ink-200">${t.total.toFixed(0)}</div>
                <div class="text-xs text-ink-500">{t.type} ({t.count})</div>
              </div>
            {/each}
          </div>
        {/if}
        {#if payments.payments?.length}
          <div class="space-y-1 max-h-48 overflow-y-auto">
            {#each payments.payments.slice(0, 10) as p}
              <div class="flex items-center justify-between py-1.5 text-xs">
                <span class="text-ink-300">{p.document_title || p.type}</span>
                <span class="text-ink-500">${p.amount_usd.toFixed(2)}</span>
              </div>
            {/each}
          </div>
        {/if}
      {:else}
        <p class="text-xs text-ink-500">No payment data available.</p>
      {/if}
    </div>

    <!-- Visitors -->
    <div class="bg-ink-800/40 border border-ink-700/40 rounded-lg p-6">
      <h3 class="text-sm font-mono text-ink-400 mb-4">Visitor Geography (30d)</h3>
      {#if visitors?.geo?.length}
        <div class="space-y-1 max-h-64 overflow-y-auto">
          {#each visitors.geo.slice(0, 20) as country}
            <div class="flex items-center justify-between py-1">
              <span class="text-sm text-ink-300">{country.country}</span>
              <div class="flex items-center gap-2">
                <div class="w-24 bg-ink-700 rounded-full h-1.5">
                  <div class="h-1.5 rounded-full bg-gold-400" style="width: {Math.min(100, (country.count / (visitors.geo[0]?.count || 1)) * 100)}%"></div>
                </div>
                <span class="text-xs text-ink-500 w-8 text-right">{country.count}</span>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-ink-500">{visitors?.error || 'No visitor data available.'}</p>
      {/if}
    </div>

    <!-- Search Console -->
    <div class="bg-ink-800/40 border border-ink-700/40 rounded-lg p-6">
      <h3 class="text-sm font-mono text-ink-400 mb-4">Organic Search (28d)</h3>
      {#if searchConsole?.rows?.length}
        <div class="flex gap-4 mb-3">
          <div>
            <div class="text-lg font-semibold text-ink-200">{searchConsole.totals.clicks}</div>
            <div class="text-xs text-ink-500">clicks</div>
          </div>
          <div>
            <div class="text-lg font-semibold text-ink-200">{searchConsole.totals.impressions.toLocaleString()}</div>
            <div class="text-xs text-ink-500">impressions</div>
          </div>
        </div>
        <div class="space-y-1 max-h-48 overflow-y-auto">
          {#each searchConsole.rows as row}
            <div class="flex items-center justify-between py-1 text-xs">
              <span class="text-ink-300 truncate max-w-[200px]">{row.query}</span>
              <div class="flex items-center gap-3 text-ink-500">
                <span>{row.clicks}c</span>
                <span>{row.impressions}i</span>
                <span>#{row.position}</span>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-ink-500">{searchConsole?.error || 'No search data available.'}</p>
      {/if}
    </div>

    <!-- Cost Model -->
    <div class="bg-ink-800/40 border border-ink-700/40 rounded-lg p-6 lg:col-span-2">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-mono text-ink-400">Cost Model</h3>
        <button
          onclick={autoCalibrate}
          disabled={calibrating}
          class="px-3 py-1 text-xs font-mono bg-gold-400/10 border border-gold-500/40 text-gold-400 rounded hover:bg-gold-400/20 transition-colors disabled:opacity-40"
        >
          {calibrating ? 'Calibrating...' : 'Auto-Calibrate from Jobs'}
        </button>
      </div>
      {#if costModel?.model}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <div class="text-xs text-ink-500 mb-1">Segmentation</div>
            <div class="text-lg font-mono text-ink-200">${costModel.model.costs?.segmentation?.toFixed(2)}</div>
          </div>
          <div>
            <div class="text-xs text-ink-500 mb-1">Research</div>
            <div class="text-lg font-mono text-ink-200">${costModel.model.costs?.research?.toFixed(2)}</div>
          </div>
          <div>
            <div class="text-xs text-ink-500 mb-1">Translation</div>
            <div class="text-lg font-mono text-ink-200">${costModel.model.costs?.translation?.toFixed(2)}</div>
          </div>
          <div>
            <div class="text-xs text-ink-500 mb-1">Assembly</div>
            <div class="text-lg font-mono text-ink-200">${costModel.model.costs?.assembly?.toFixed(2)}</div>
          </div>
        </div>
        <div class="flex items-center gap-4 text-xs text-ink-500">
          <span>Cushion: {costModel.model.cushion}x</span>
          <span>Jobs sampled: {costModel.model.jobsSampled || 0}</span>
          {#if costModel.model.lastCalibrated}
            <span>Last calibrated: {new Date(costModel.model.lastCalibrated).toLocaleDateString()}</span>
          {/if}
        </div>
        {#if costModel.actuals}
          <div class="mt-3 pt-3 border-t border-ink-700/40 text-xs text-ink-500">
            Accuracy: estimated ${costModel.actuals.totalEstimated} vs actual ${costModel.actuals.totalActual}
            ({costModel.actuals.accuracy}% ratio from {costModel.actuals.jobCount} jobs)
          </div>
        {/if}
      {:else}
        <p class="text-xs text-ink-500">Using default cost model (no calibration data yet).</p>
      {/if}
    </div>
  </div>
{/if}
