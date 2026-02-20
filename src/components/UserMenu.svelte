<script>
import { onMount } from 'svelte';

let { clientId = '' } = $props();

let user = $state(null);
let loading = $state(true);
let dropdownOpen = $state(false);
let gsiReady = $state(false);
let gsiInitialized = false;
let buttonRendered = false;
let signinBtnEl;

async function checkAuth() {
	try {
		const res = await fetch('/api/auth/me');
		if (res.ok) {
			const data = await res.json();
			user = data.user;
		}
	} catch (err) {
		// Treat as logged out
	} finally {
		loading = false;
	}
}

async function handleCredential(response) {
	try {
		const res = await fetch('/api/auth/google', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ credential: response.credential }),
		});
		if (res.ok) {
			const data = await res.json();
			user = data.user;
			dropdownOpen = false;
		}
	} catch (err) {
		console.error('Login failed:', err);
	}
}

function loadGsi() {
	if (!clientId || document.querySelector('script[src*="accounts.google.com/gsi"]')) return;
	const script = document.createElement('script');
	script.src = 'https://accounts.google.com/gsi/client';
	script.async = true;
	script.onload = () => { gsiReady = true; };
	document.head.appendChild(script);
}

function initGsi() {
	if (!clientId || !window.google?.accounts || gsiInitialized) return;
	window.google.accounts.id.initialize({
		client_id: clientId,
		callback: handleCredential,
		use_fedcm_for_prompt: true,
	});
	gsiInitialized = true;
}

function renderSignInButton() {
	if (!window.google?.accounts || buttonRendered || !signinBtnEl) return;
	initGsi();
	window.google.accounts.id.renderButton(signinBtnEl, {
		theme: 'filled_black',
		size: 'large',
		text: 'signin_with',
		shape: 'pill',
	});
	buttonRendered = true;
}

function handleSignInClick(e) {
	e.preventDefault();
	e.stopPropagation();
	if (!window.google?.accounts) {
		if (!gsiReady) {
			window.location.href = '/dashboard';
			return;
		}
		// Script loaded but not ready — wait briefly
		const check = setInterval(() => {
			if (window.google?.accounts) {
				clearInterval(check);
				tryOneTap();
			}
		}, 50);
		setTimeout(() => { clearInterval(check); window.location.href = '/dashboard'; }, 3000);
		return;
	}
	tryOneTap();
}

function tryOneTap() {
	initGsi();
	try {
		window.google.accounts.id.prompt((notification) => {
			// If One Tap can't show (cooldown, dismissed, etc.), fall back to button dropdown
			if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
				showButtonFallback();
			}
		});
	} catch {
		showButtonFallback();
	}
}

function showButtonFallback() {
	dropdownOpen = true;
	requestAnimationFrame(() => renderSignInButton());
}

function handleSignInHover() {
	if (!gsiReady && !user) loadGsi();
	if (window.google?.accounts && !user) initGsi();
}

async function logout() {
	try {
		await fetch('/api/auth/logout', { method: 'POST' });
		user = null;
		gsiInitialized = false;
		buttonRendered = false;
		dropdownOpen = false;
	} catch (err) {
		console.error('Logout failed:', err);
	}
}

function toggleDropdown() {
	dropdownOpen = !dropdownOpen;
}

onMount(() => {
	checkAuth().then(() => {
		if (!user) loadGsi();
	});
});

// Close dropdown on outside click
function onDocClick(e) {
	if (dropdownOpen && !e.target.closest('[data-usermenu]')) {
		dropdownOpen = false;
	}
}

onMount(() => {
	document.addEventListener('click', onDocClick);
	return () => document.removeEventListener('click', onDocClick);
});
</script>

<span class="contents">
{#if !loading}
	{#if user}
		<div class="relative" data-usermenu>
			<button
				onclick={toggleDropdown}
				class="flex items-center justify-center w-6 h-6 rounded-full overflow-hidden border border-ink-700 hover:border-ink-500 transition-colors"
				aria-label="User menu"
			>
				{#if user.picture}
					<img
						src={user.picture}
						alt={user.name}
						referrerpolicy="no-referrer"
						class="w-full h-full object-cover"
					/>
				{:else}
					<span class="text-xs font-mono text-ink-300 bg-ink-800">
						{user.name?.[0]?.toUpperCase() || '?'}
					</span>
				{/if}
			</button>
			{#if dropdownOpen}
				<div class="absolute right-0 mt-2 w-40 bg-ink-800 border border-ink-700 rounded-lg shadow-xl p-1 z-50">
					<a
						href="/dashboard"
						class="block px-3 py-2 text-xs font-mono text-ink-300 hover:bg-ink-700/50 rounded"
					>
						Dashboard
					</a>
					<a
						href="/try"
						class="block px-3 py-2 text-xs font-mono text-ink-300 hover:bg-ink-700/50 rounded"
					>
						Try it
					</a>
					{#if user.isAdmin}
						<a
							href="/admin"
							class="block px-3 py-2 text-xs font-mono text-ink-300 hover:bg-ink-700/50 rounded"
						>
							Admin
						</a>
					{/if}
					<div class="h-px bg-ink-700 my-1"></div>
					<button
						onclick={logout}
						class="w-full text-left px-3 py-2 text-xs font-mono text-ink-300 hover:bg-ink-700/50 rounded"
					>
						Sign Out
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="relative" data-usermenu>
			<button
				onclick={handleSignInClick}
				onmouseenter={handleSignInHover}
				class="flex items-center justify-center w-6 h-6 rounded-full border border-ink-700 hover:border-ink-500 transition-colors text-ink-500 hover:text-ink-300 cursor-pointer"
				aria-label="Sign in"
			>
				<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
				</svg>
			</button>
			{#if dropdownOpen}
				<div class="absolute right-0 mt-2 rounded-xl shadow-xl z-50 overflow-hidden">
					<div bind:this={signinBtnEl} class="[&_iframe]:!rounded-xl"></div>
				</div>
			{/if}
		</div>
	{/if}
{/if}
</span>
