<script>
let stats = $state(null);
let users = $state([]);
let loading = $state(true);
let error = $state('');

async function loadData() {
  try {
    loading = true;
    error = '';
    const [statsRes, usersRes] = await Promise.all([
      fetch('/api/admin/stats'),
      fetch('/api/admin/users')
    ]);
    if (!statsRes.ok || !usersRes.ok) throw new Error('Failed to load admin data');
    stats = await statsRes.json();
    const usersData = await usersRes.json();
    users = usersData.users;
  } catch (e) {
    error = e.message;
  } finally {
    loading = false;
  }
}

async function updateTier(userId, newTier) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/tier`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: newTier })
    });
    if (!res.ok) throw new Error('Failed to update tier');
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) users[userIndex].tier = newTier;
  } catch (e) {
    error = e.message;
  }
}

$effect(() => {
  loadData();
});

function formatCost(cost) {
  return `$${cost?.toFixed(4) ?? '0.0000'}`;
}

function getInitial(name) {
  return name?.charAt(0).toUpperCase() ?? '?';
}
</script>

<div class="p-6">
  <h1 class="text-2xl font-serif text-ink-200 mb-6">Admin Dashboard</h1>

  {#if loading}
    <div class="text-center text-ink-400 py-12">Loading...</div>
  {:else if error}
    <div class="text-center text-red-400 py-12">{error}</div>
  {:else}
    <!-- Stats Row -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      <div class="p-4 bg-ink-800/40 rounded-lg">
        <div class="text-[10px] font-mono text-ink-500 uppercase tracking-wider mb-1">Total Users</div>
        <div class="text-xl text-ink-200">{stats?.userCount ?? 0}</div>
      </div>
      <div class="p-4 bg-ink-800/40 rounded-lg">
        <div class="text-[10px] font-mono text-ink-500 uppercase tracking-wider mb-1">Monthly Requests</div>
        <div class="text-xl text-ink-200">{stats?.monthly?.reduce((sum, s) => sum + s.requests, 0) ?? 0}</div>
      </div>
      <div class="p-4 bg-ink-800/40 rounded-lg">
        <div class="text-[10px] font-mono text-ink-500 uppercase tracking-wider mb-1">Monthly Cost</div>
        <div class="text-xl text-ink-200">{formatCost(stats?.monthly?.reduce((sum, s) => sum + s.cost, 0) ?? 0)}</div>
      </div>
      <div class="p-4 bg-ink-800/40 rounded-lg">
        <div class="text-[10px] font-mono text-ink-500 uppercase tracking-wider mb-1">Services Active</div>
        <div class="text-xl text-ink-200">{stats?.monthly?.length ?? 0}</div>
      </div>
    </div>

    <!-- Users Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="text-[10px] font-mono text-ink-500 uppercase tracking-wider border-b border-ink-700">
            <th class="pb-3 pr-4">User</th>
            <th class="pb-3 pr-4">Email</th>
            <th class="pb-3 pr-4">Tier</th>
            <th class="pb-3 pr-4">Joined</th>
            <th class="pb-3 pr-4">Requests</th>
            <th class="pb-3">Cost</th>
          </tr>
        </thead>
        <tbody>
          {#each users as user}
            <tr class="border-b border-ink-800/40">
              <td class="py-3 pr-4">
                <div class="flex items-center gap-2">
                  {#if user.picture}
                    <img src={user.picture} alt={user.name} class="w-6 h-6 rounded-full" referrerpolicy="no-referrer" />
                  {:else}
                    <div class="w-6 h-6 rounded-full bg-ink-700 flex items-center justify-center text-ink-300 text-xs">
                      {getInitial(user.name)}
                    </div>
                  {/if}
                  <span class="text-ink-200">{user.name ?? 'Unknown'}</span>
                </div>
              </td>
              <td class="py-3 pr-4 text-ink-300">{user.email}</td>
              <td class="py-3 pr-4">
                <select
                  value={user.tier}
                  onchange={(e) => updateTier(user.id, e.target.value)}
                  class="bg-ink-800 text-ink-300 text-xs font-mono border border-ink-700 rounded px-2 py-1"
                >
                  <option value="free">free</option>
                  <option value="pro">pro</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td class="py-3 pr-4 text-ink-300">{new Date(user.created_at).toLocaleDateString()}</td>
              <td class="py-3 pr-4 text-ink-300">{user.monthly_requests ?? 0}</td>
              <td class="py-3 text-ink-300">{formatCost(user.monthly_cost)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
