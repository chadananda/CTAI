export const prerender = false;
export async function GET({ params, locals }) {
  try {
    const { id } = params;
    const db = locals.runtime?.env?.USERS_DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'Database unavailable' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      });
    }
    const translation = await db.prepare(
      'SELECT * FROM published_translations WHERE id = ?'
    ).bind(id).first();
    if (!translation) {
      return new Response(JSON.stringify({ error: 'Translation not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }
    // Increment view count
    await db.prepare(
      'UPDATE published_translations SET view_count = view_count + 1 WHERE id = ?'
    ).bind(id).run();
    return new Response(JSON.stringify({
      translation: {
        ...translation,
        output: translation.output_json ? JSON.parse(translation.output_json) : null,
        output_json: undefined,
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
