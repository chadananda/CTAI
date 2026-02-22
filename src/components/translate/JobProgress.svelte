<script>
import { onMount } from 'svelte';
let { jobId } = $props();
let job = $state(null);
let blocks = $state([]);
let phases = $state([]);
let error = $state(null);
let polling = $state(true);
let showCelebration = $state(false);
let statusDetail = $state(null);
let isAdmin = $state(false);
// Block status labels
const blockStatusLabels = {
  pending: 'Pending',
  researching: 'Researching',
  translating: 'Translating',
  deliberating: 'Deliberating',
  converging: 'Converging',
  complete: 'Complete',
  failed: 'Failed'
};
// Get block display label with deliberation round if applicable
function getBlockLabel(block) {
  if (block.status === 'deliberating' && block.delibRound > 0) {
    return `Deliberation R${block.delibRound}`;
  }
  return blockStatusLabels[block.status] || 'Pending';
}
// Poll for job updates
async function poll() {
  try {
    const res = await fetch(`/api/translate/${jobId}`);
    if (!res.ok) throw new Error('Failed to load job');
    const data = await res.json();
    job = data.job;
    blocks = data.blocks || [];
    phases = data.phases || [];
    statusDetail = data.job?.statusDetail || null;
    isAdmin = data.job?.isAdmin || false;
    if (job.status === 'complete') {
      polling = false;
      showCelebration = true;
      setTimeout(() => { showCelebration = false; }, 3000);
    } else if (job.status === 'failed') {
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
// Derived values
let segmentationComplete = $derived(job?.totalBlocks > 0);
let segmentationStatus = $derived.by(() => {
  if (!job) return 'Waiting...';
  if (job.status === 'pending' || job.status === 'paid') return 'Preparing...';
  if (job.status !== 'segmenting' || !statusDetail) {
    return job.status === 'segmenting' ? 'In progress...' : 'Complete';
  }
  const d = statusDetail;
  if (d.pass === 'phrases' && d.status !== 'complete') {
    return d.totalWindows > 1 ? `Phrases: chunk ${d.window}/${d.totalWindows}...` : 'Phrases...';
  }
  if (d.pass === 'phrases' && d.status === 'complete') {
    return `Phrases: ${d.phraseCount} found`;
  }
  if (d.pass === 'sentences') {
    return `Sentences: ${d.sentenceCount} found (${d.phraseCount} phrases)`;
  }
  if (d.pass === 'complete') {
    return `Segmented: ${d.paragraphCount} paragraphs, ${d.sentenceCount} sentences, ${d.phraseCount} phrases`;
  }
  return 'In progress...';
});
let segmentationCostLine = $derived.by(() => {
  if (!isAdmin || !statusDetail || !statusDetail.tokensIn) return null;
  const d = statusDetail;
  const tokIn = d.tokensIn.toLocaleString();
  const tokOut = d.tokensOut.toLocaleString();
  const cost = d.cost.toFixed(4);
  return `\u21b3 ${tokIn} in / ${tokOut} out \u00b7 $${cost}`;
});
let allBlocksComplete = $derived(blocks.length > 0 && blocks.every(b => b.status === 'complete'));
let assemblyStatus = $derived(
  !job ? 'Waiting for blocks' :
  job.status === 'assembling' ? 'Assembling text' :
  job.status === 'reviewing' ? 'Final review' :
  job.status === 'complete' ? 'Complete' :
  'Waiting for blocks'
);
let assemblyActive = $derived(job?.status === 'assembling' || job?.status === 'reviewing');
let assemblyComplete = $derived(job?.status === 'complete');
// Progress calculation
let totalSteps = $derived(
  (segmentationComplete ? 1 : 0) +
  (job?.totalBlocks || 0) +
  (allBlocksComplete ? 1 : 0)
);
let completedSteps = $derived(
  (segmentationComplete ? 1 : 0) +
  blocks.filter(b => b.status === 'complete').length +
  (assemblyComplete ? 1 : 0)
);
let progress = $derived(totalSteps > 0 ? (completedSteps / totalSteps * 100) : 0);
// Cost display
let costDisplay = $derived(
  `$${(job?.actualCost || 0).toFixed(2)} of ~$${(job?.estimatedCost || 0).toFixed(2)} estimated`
);
// Time estimate
let timeEstimate = $derived.by(() => {
  if (!job?.startedAt || progress === 0 || progress >= 100) return null;
  const elapsed = Date.now() - new Date(job.startedAt).getTime();
  const totalEstimated = (elapsed / progress) * 100;
  const remaining = totalEstimated - elapsed;
  const minutes = Math.ceil(remaining / 60000);
  return minutes > 0 ? `≈ ${minutes} min remaining` : '< 1 min remaining';
});
</script>

<div class="bg-ink-800 border border-ink-700 rounded-lg p-6 space-y-4 relative overflow-hidden">
  {#if showCelebration}
    <div class="absolute inset-0 pointer-events-none z-10">
      <div class="confetti-particle" style="left: 20%; animation-delay: 0s;"></div>
      <div class="confetti-particle" style="left: 40%; animation-delay: 0.1s;"></div>
      <div class="confetti-particle" style="left: 60%; animation-delay: 0.2s;"></div>
      <div class="confetti-particle" style="left: 80%; animation-delay: 0.3s;"></div>
      <div class="confetti-particle" style="left: 30%; animation-delay: 0.15s;"></div>
      <div class="confetti-particle" style="left: 70%; animation-delay: 0.25s;"></div>
    </div>
  {/if}

  {#if error}
    <div class="bg-red-900/20 border border-red-700/40 rounded-lg p-4 text-red-300 text-sm">
      {error}
    </div>
  {/if}

  {#if job}
    <!-- Title -->
    <div>
      <h3 class="text-ink-200 font-medium mb-2">
        {job.status === 'complete' ? 'Translation Complete' : job.status === 'failed' ? 'Translation Failed' : `Translating "${job.workTitle || 'Document'}"`}
      </h3>

      <!-- Progress bar -->
      <div class="w-full bg-ink-700 rounded-full h-2 mb-1">
        <div
          class="h-2 rounded-full transition-all duration-500 {job.status === 'failed' ? 'bg-red-500' : job.status === 'complete' ? 'bg-emerald-500' : 'bg-gold-400'}"
          style="width: {progress}%"
        ></div>
      </div>
      <div class="text-right text-xs text-ink-400 font-mono">
        {Math.round(progress)}%
      </div>
    </div>

    <!-- Phase list -->
    <div class="space-y-2">
      <!-- Segmentation phase -->
      <div class="flex items-center gap-3 py-1.5 px-2 rounded {!segmentationComplete && job.status === 'segmenting' ? 'bg-ink-700/40' : ''}">
        {#if segmentationComplete}
          <svg class="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        {:else if job.status === 'segmenting'}
          <div class="w-4 h-4 shrink-0 border-2 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
        {:else}
          <div class="w-4 h-4 shrink-0 rounded-full border border-ink-600 bg-ink-600/20"></div>
        {/if}
        <span class="text-sm flex-1 {segmentationComplete ? 'text-ink-400' : job.status === 'segmenting' ? 'text-gold-400' : 'text-ink-500'}">
          Segmentation
        </span>
        <span class="text-xs text-ink-500">
          {segmentationStatus}
        </span>
      </div>
      {#if segmentationCostLine}
        <div class="flex items-center gap-3 py-0.5 px-2 pl-9">
          <span class="text-xs text-ink-500 font-mono">{segmentationCostLine}</span>
        </div>
      {/if}

      <!-- Block phases -->
      {#if job.totalBlocks > 0}
        {#each blocks as block}
          {@const isActive = block.status !== 'pending' && block.status !== 'complete' && block.status !== 'failed'}
          {@const isComplete = block.status === 'complete'}
          {@const isFailed = block.status === 'failed'}
          <div class="flex items-center gap-3 py-1.5 px-2 rounded {isActive ? 'bg-ink-700/40' : ''}">
            {#if isComplete}
              <svg class="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            {:else if isFailed}
              <svg class="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            {:else if isActive}
              <div class="w-4 h-4 shrink-0 border-2 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
            {:else}
              <div class="w-4 h-4 shrink-0 rounded-full border border-ink-600 bg-ink-600/20"></div>
            {/if}
            <span class="text-sm flex-1 {isComplete ? 'text-ink-400' : isFailed ? 'text-red-400' : isActive ? 'text-gold-400' : 'text-ink-500'}">
              Block {block.index + 1} of {job.totalBlocks}
            </span>
            <span class="text-xs text-ink-500">
              {getBlockLabel(block)}
            </span>
          </div>
        {/each}
      {/if}

      <!-- Assembly & Review phase -->
      {#if segmentationComplete}
        <div class="flex items-center gap-3 py-1.5 px-2 rounded {assemblyActive ? 'bg-ink-700/40' : ''}">
          {#if assemblyComplete}
            <svg class="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          {:else if assemblyActive}
            <div class="w-4 h-4 shrink-0 border-2 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
          {:else}
            <div class="w-4 h-4 shrink-0 rounded-full border border-ink-600 bg-ink-600/20"></div>
          {/if}
          <span class="text-sm flex-1 {assemblyComplete ? 'text-ink-400' : assemblyActive ? 'text-gold-400' : 'text-ink-500'}">
            Assembly & Review
          </span>
          <span class="text-xs text-ink-500">
            {assemblyStatus}
          </span>
        </div>
      {/if}
    </div>

    <!-- Cost and time estimate -->
    <div class="flex items-center justify-between pt-2 border-t border-ink-700">
      <span class="text-xs text-ink-400 font-mono">
        {costDisplay}
      </span>
      {#if timeEstimate}
        <span class="text-xs text-ink-400 font-mono">
          {timeEstimate}
        </span>
      {/if}
    </div>

    <!-- Completion message -->
    {#if job.status === 'complete'}
      <div class="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-4">
        <p class="text-sm text-emerald-300 mb-2">Translation completed successfully!</p>
        <a href="/translations/{jobId}" class="text-xs text-gold-400 hover:text-gold-300 underline">
          View translation →
        </a>
      </div>
    {:else if job.status !== 'failed'}
      <p class="text-xs text-ink-500 text-center italic pt-2">
        You can close this page. We'll email you when it's done.
      </p>
    {/if}

    <!-- Error message -->
    {#if job.status === 'failed' && job.errorMessage}
      <div class="bg-red-900/20 border border-red-700/40 rounded-lg p-4">
        <p class="text-sm text-red-300 font-medium mb-1">Translation failed</p>
        <p class="text-xs text-red-400">{job.errorMessage}</p>
      </div>
    {/if}
  {:else}
    <div class="flex items-center justify-center py-8">
      <div class="w-6 h-6 border-2 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
      <span class="ml-3 text-sm text-ink-400">Loading job details...</span>
    </div>
  {/if}
</div>

<style>
@keyframes confetti-fall {
  0% {
    transform: translateY(-100%) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(720deg);
    opacity: 0;
  }
}
.confetti-particle {
  position: absolute;
  top: 0;
  width: 8px;
  height: 8px;
  background: linear-gradient(45deg, #fbbf24, #f59e0b);
  animation: confetti-fall 3s ease-out forwards;
}
.confetti-particle:nth-child(2n) {
  background: linear-gradient(45deg, #10b981, #059669);
}
.confetti-particle:nth-child(3n) {
  background: linear-gradient(45deg, #3b82f6, #2563eb);
}
</style>
