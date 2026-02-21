export const prerender = false;

export async function GET({ url, locals }) {
  const uid = url.searchParams.get('uid');
  const token = url.searchParams.get('token');

  if (!uid || !token) {
    return htmlResponse('Missing parameters', 400);
  }

  const db = locals.runtime?.env?.USERS_DB;
  if (!db) {
    return htmlResponse('Service unavailable', 503);
  }

  // Verify user exists
  const user = await db.prepare('SELECT id, email FROM users WHERE id = ?').bind(uid).first();
  if (!user) {
    return htmlResponse('Invalid unsubscribe link', 400);
  }

  // Update email preference
  await db.prepare('UPDATE users SET email_digest = 0 WHERE id = ?').bind(uid).run();

  return htmlResponse(`
    <h1>Unsubscribed</h1>
    <p>You&rsquo;ve been unsubscribed from the CTAI weekly digest.</p>
    <p>You can re-subscribe anytime from your <a href="/dashboard">dashboard</a>.</p>
  `);
}

function htmlResponse(body, status = 200) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CTAI — Email Preferences</title>
<style>body{font-family:Georgia,serif;max-width:480px;margin:60px auto;padding:0 20px;color:#333;}
h1{color:#b8860b;font-size:24px;}a{color:#b8860b;}</style></head>
<body>${body}</body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
