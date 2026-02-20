export const prerender = false;

export async function POST({ request, locals }) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const message = formData.get('message') || '';
    const email = formData.get('email') || '';
    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    // Check file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File too large (max 10MB)' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const env = locals.runtime?.env;
    const bucket = env?.TRANSLATIONS_BUCKET;
    const resendKey = env?.RESEND_API_KEY;
    // Store file in R2 if available
    let r2Key = null;
    if (bucket) {
      r2Key = `donations/${Date.now()}-${file.name}`;
      const arrayBuffer = await file.arrayBuffer();
      await bucket.put(r2Key, arrayBuffer, {
        httpMetadata: { contentType: file.type },
        customMetadata: { email, message: message.slice(0, 500) },
      });
    }
    // Email notification to admin
    if (resendKey) {
      const body = [
        `New document submitted for translation review.`,
        ``,
        `File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
        email ? `Submitter email: ${email}` : 'No email provided',
        message ? `Message: ${message}` : 'No message',
        r2Key ? `R2 key: ${r2Key}` : 'R2 upload skipped',
      ].join('\n');
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'CTAI <noreply@ctai.dev>',
          to: ['admin@ctai.dev'],
          subject: `Document submission: ${file.name}`,
          text: body,
        }),
      });
    }
    return new Response(JSON.stringify({ success: true, r2Key }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
