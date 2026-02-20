export const prerender = false;
import { requireAdmin } from '../../../../../lib/admin.js';

const VALID_TIERS = ['free', 'pro', 'admin'];

export async function PATCH({ locals, params, request }) {
  const authCheck = requireAdmin(locals);
  if (!authCheck.authorized) {
    return new Response(JSON.stringify({ error: authCheck.error }), {
      status: authCheck.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const db = locals.runtime.env.USERS_DB;
  const { id } = params;
  try {
    const body = await request.json();
    const { tier } = body;
    // Validate tier
    if (!tier || !VALID_TIERS.includes(tier)) {
      return new Response(JSON.stringify({ error: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // Update user tier
    await db.prepare("UPDATE users SET tier = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(tier, id)
      .run();
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
