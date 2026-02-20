export const prerender = false;
export async function GET({ locals, url }) {
  try {
    const db = locals.runtime?.env?.USERS_DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'Database unavailable' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      });
    }
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
    const offset = Number(url.searchParams.get('offset')) || 0;
    const translations = await db.prepare(
      `SELECT id, source_lang, style, work_title, commissioned_by, published_at, view_count
       FROM published_translations ORDER BY published_at DESC LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();
    const total = await db.prepare('SELECT COUNT(*) as count FROM published_translations').first();
    return new Response(JSON.stringify({
      translations: translations.results,
      total: total?.count || 0,
      limit, offset,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
