<script>
import { onMount } from 'svelte';
let { jobId } = $props();
let job = $state(null);
let phases = $state([]);
let error = $state(null);
let polling = $state(true);
const stepLabels = {
  segment_phrases: 'Identifying phrase boundaries',
  segment_sentences: 'Grouping into sentences',
  segment_paras: 'Forming paragraphs',
  segment_join: 'Validating structure',
  research: 'Researching concordance precedents',
  render_round: 'Translators rendering independently',
  critique_round: 'Committee deliberation',
  converge: 'Synthesizing consensus',
  assemble: 'Composing final text',
  review: 'Fidelity review',
};
const allSteps = Object.keys(stepLabels);
async function poll() {
  try {
    const res = await fetch(`/api/translate/${jobId}`);
    if (!res.ok) throw new Error('Failed to load job');
    const data = await res.json();
    job = data.job;
    phases = data.phases || [];
    if (job.status === 'complete' || job.status === 'failed') {
      polling = false;
    }
  } catch (err) {
    error = err.message;
    polling = false;
  }
}
onMount(() => {
  poll();
  const interval = setInterval(() => {
    if (polling) poll();
    else clearInterval(interval);
  }, 3000);
  return () => clearInterval(interval);
});
let completedSteps = $derived(new Set(phases.map(p => p.phase)));
let currentStep = $derived(job?.status ? allSteps.find(s => !completedSteps.has(s)) : null);
let progress = $derived(phases.length / allSteps.length * 100);
</script>

<div class="space-y-4">
  {#if error}
    <div class="bg-red-900/20 border border-red-700/40 rounded-lg p-4 text-red-300 text-sm">{error}</div>
  {/if}

  {#if job}
    <div class="flex items-center justify-between mb-2">
      <span class="text-sm font-mono text-ink-400">
        {job.status === 'complete' ? 'Translation Complete' : job.status === 'failed' ? 'Translation Failed' : 'Translating...'}
      </span>
      <span class="text-xs text-ink-500">${job.actualCost?.toFixed(2) || '0.00'} spent</span>
    </div>

    <div class="w-full bg-ink-800 rounded-full h-2">
      <div
        class="h-2 rounded-full transition-all duration-500 {job.status === 'failed' ? 'bg-red-500' : job.status === 'complete' ? 'bg-emerald-500' : 'bg-gold-400'}"
        style="width: {progress}%"
      ></div>
    </div>

    <div class="space-y-1 mt-4">
      {#each allSteps as step}
        {@const done = completedSteps.has(step)}
        {@const active = step === currentStep && job.status !== 'complete' && job.status !== 'failed'}
        <div class="flex items-center gap-3 py-1.5 px-2 rounded {active ? 'bg-ink-800/60' : ''}">
          {#if done}
            <svg class="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          {:else if active}
            <div class="w-4 h-4 shrink-0 border-2 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
          {:else}
            <div class="w-4 h-4 shrink-0 rounded-full border border-ink-700"></div>
          {/if}
          <span class="text-xs {done ? 'text-ink-500' : active ? 'text-gold-400' : 'text-ink-600'}">{stepLabels[step]}</span>
        </div>
      {/each}
    </div>

    {#if job.status === 'failed' && job.errorMessage}
      <div class="bg-red-900/20 border border-red-700/40 rounded-lg p-3 mt-3">
        <p class="text-xs text-red-400">{job.errorMessage}</p>
      </div>
    {/if}

    {#if job.delibRound > 0}
      <p class="text-xs text-ink-500 mt-2">Deliberation round {job.delibRound} of 3</p>
    {/if}
  {/if}
</div>
