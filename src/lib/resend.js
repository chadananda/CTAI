// Resend email integration — direct fetch, Workers-compatible
const RESEND_API = 'https://api.resend.com/emails';

export async function sendEmail({ apiKey, to, subject, html, from = 'CTAI <noreply@ctai.info>' }) {
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

export function translationCompleteEmail({ workTitle, translationId, origin }) {
  const viewUrl = `${origin}/translations/${translationId}`;
  return {
    subject: `Your CTAI translation is complete: ${workTitle || 'Untitled'}`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h1 style="color: #b8860b; font-size: 24px;">Translation Complete</h1>
        <p>Your committee translation of <strong>${workTitle || 'your text'}</strong> is ready.</p>
        <p>Three AI translators deliberated and converged on a final rendering, reviewed for fidelity to the source.</p>
        <p><a href="${viewUrl}" style="color: #b8860b;">View your translation</a></p>
        <p>Three PDF formats are available for download:</p>
        <ul>
          <li>Side-by-side by paragraph</li>
          <li>Side-by-side by sentence</li>
          <li>Side-by-side with translator notes</li>
        </ul>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999;">CTAI — Committee Translation AI<br/>ctai.info</p>
      </div>
    `,
  };
}
