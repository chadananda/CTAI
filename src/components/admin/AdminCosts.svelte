<script>
let data = $state(null);
let loading = $state(true);
let error = $state('');
let selectedJobId = $state(null);
let jobCalls = $state(null);

async function loadData() {
  try {
    loading = true;
    error = '';
    const res = await fetch('/api/admin/cost-analysis');
    if (!res.ok) throw new Error('Failed to load cost data');
    data = await res.json();
  } catch (e) {
    error = e.message;
  } finally {
    loading = false;
  }
}

async function drillIntoJob(jobId) {
  selectedJobId = jobId;
  try {
    const res = await fetch(`/api/admin/cost-analysis?jobId=${jobId}`);
    if (!res.ok) throw new Error('Failed to load job details');
    const d = await res.json();
    jobCalls = d.jobCalls;
  } catch (e) {
    error = e.message;
  }
}

function formatCost(cost) {
  return `$${(cost ?? 0).toFixed(4)}`;
}

function formatDuration(ms) {
  if (!ms) return '-';
  return ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function formatTokens(n) {
  if (!n) return '0';
  return n > 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

$effect(() => { loadData(); });
</script>

<div>
  {#if loading}
    <div class="text-center text-ink-400 py-12">Loading...</div>
  {:else if error}
    <div class="text-center text-red-400 py-12">{error}</div>
  {:else if data}
    <!-- Totals -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      <div class="p-4 bg-ink-800/40 rounded-lg">
        <div class="text-[10px] font-mono text-ink-500 uppercase tracking-wider mb-1">Total API Calls</div>
        <div class="text-xl text-ink-200">{data.totals?.total_calls ?? 0}</div>
      </div>
      <div class="p-4 bg-ink-800/40 rounded-lg">
        <div class="text-[10px] font-mono text-ink-500 uppercase tracking-wider mb-1">Total Cost</div>
        <div class="text-xl text-ink-200">{formatCost(data.totals?.total_cost)}</div>
      </div>
      <div class="p-4 bg-ink-800/40 rounded-lg">
        <div class="text-[10px] font-mono text-ink-500 uppercase tracking-wider mb-1">Tokens In</div>
        <div class="text-xl text-ink-200">{formatTokens(data.totals?.total_tokens_in)}</div>
      </div>
      <div class="p-4 bg-ink-800/40 rounded-lg">
        <div class="text-[10px] font-mono text-ink-500 uppercase tracking-wider mb-1">Tokens Out</div>
        <div class="text-xl text-ink-200">{formatTokens(data.totals?.total_tokens_out)}</div>
      </div>
    </div>

    <!-- By Phase -->
    <h2 class="text-lg font-serif text-ink-200 mb-3">Cost by Phase</h2>
    <div class="overflow-x-auto mb-8">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="text-[10px] font-mono text-ink-500 uppercase tracking-wider border-b border-ink-700">
            <th class="pb-3 pr-4">Phase</th>
            <th class="pb-3 pr-4">Calls</th>
            <th class="pb-3 pr-4">Tokens In</th>
            <th class="pb-3 pr-4">Tokens Out</th>
            <th class="pb-3 pr-4">Total Cost</th>
            <th class="pb-3 pr-4">Avg Cost</th>
            <th class="pb-3">Avg Duration</th>
          </tr>
        </thead>
        <tbody>
          {#each data.byPhase as row}
            <tr class="border-b border-ink-800/40">
              <td class="py-3 pr-4 text-ink-200 font-mono text-xs">{row.phase}</td>
              <td class="py-3 pr-4 text-ink-300">{row.calls}</td>
              <td class="py-3 pr-4 text-ink-300">{formatTokens(row.total_tokens_in)}</td>
              <td class="py-3 pr-4 text-ink-300">{formatTokens(row.total_tokens_out)}</td>
              <td class="py-3 pr-4 text-ink-200">{formatCost(row.total_cost)}</td>
              <td class="py-3 pr-4 text-ink-300">{formatCost(row.avg_cost)}</td>
              <td class="py-3 text-ink-300">{formatDuration(row.avg_duration)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Recent Jobs -->
    <h2 class="text-lg font-serif text-ink-200 mb-3">Recent Jobs</h2>
    <div class="overflow-x-auto mb-8">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="text-[10px] font-mono text-ink-500 uppercase tracking-wider border-b border-ink-700">
            <th class="pb-3 pr-4">Job</th>
            <th class="pb-3 pr-4">Status</th>
            <th class="pb-3 pr-4">API Calls</th>
            <th class="pb-3 pr-4">Actual Cost</th>
            <th class="pb-3 pr-4">Duration</th>
            <th class="pb-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {#each data.recentJobs as job}
            <tr
              class="border-b border-ink-800/40 cursor-pointer hover:bg-ink-800/20"
              onclick={() => drillIntoJob(job.id)}
            >
              <td class="py-3 pr-4 text-ink-200 text-xs">{job.work_title || job.id.slice(0, 8)}</td>
              <td class="py-3 pr-4">
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-ink-700/60 text-ink-300">{job.status}</span>
              </td>
              <td class="py-3 pr-4 text-ink-300">{job.api_calls ?? 0}</td>
              <td class="py-3 pr-4 text-ink-200">{formatCost(job.actual_cost_usd)}</td>
              <td class="py-3 pr-4 text-ink-300">{formatDuration(job.total_duration)}</td>
              <td class="py-3 text-ink-400 text-xs">{job.created_at ? new Date(job.created_at).toLocaleDateString() : '-'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Job Drill-down -->
    {#if selectedJobId && jobCalls}
      <h2 class="text-lg font-serif text-ink-200 mb-3">
        Calls for Job <span class="font-mono text-sm text-ink-400">{selectedJobId.slice(0, 12)}</span>
        <button onclick={() => { selectedJobId = null; jobCalls = null; }} class="ml-3 text-xs text-ink-500 hover:text-ink-300">[close]</button>
      </h2>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="text-[10px] font-mono text-ink-500 uppercase tracking-wider border-b border-ink-700">
              <th class="pb-3 pr-4">Phase</th>
              <th class="pb-3 pr-4">Role</th>
              <th class="pb-3 pr-4">Model</th>
              <th class="pb-3 pr-4">Prompt</th>
              <th class="pb-3 pr-4">Response</th>
              <th class="pb-3 pr-4">Tokens In</th>
              <th class="pb-3 pr-4">Tokens Out</th>
              <th class="pb-3 pr-4">Cost</th>
              <th class="pb-3">Duration</th>
            </tr>
          </thead>
          <tbody>
            {#each jobCalls as call}
              <tr class="border-b border-ink-800/40">
                <td class="py-2 pr-4 text-ink-200 font-mono text-xs">{call.phase}</td>
                <td class="py-2 pr-4 text-ink-300 text-xs">{call.agent_role ?? '-'}</td>
                <td class="py-2 pr-4 text-ink-400 text-xs">{call.model}</td>
                <td class="py-2 pr-4 text-ink-300 text-xs">{formatTokens(call.prompt_chars)}c</td>
                <td class="py-2 pr-4 text-ink-300 text-xs">{formatTokens(call.response_chars)}c</td>
                <td class="py-2 pr-4 text-ink-300">{formatTokens(call.tokens_in)}</td>
                <td class="py-2 pr-4 text-ink-300">{formatTokens(call.tokens_out)}</td>
                <td class="py-2 pr-4 text-ink-200">{formatCost(call.cost_usd)}</td>
                <td class="py-2 text-ink-300">{formatDuration(call.duration_ms)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>
