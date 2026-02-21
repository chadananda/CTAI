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

export function translationCompleteEmail({ workTitle, translationId, origin, pdfUrls, sponsorName }) {
  const viewUrl = `${origin}/translations/${translationId}`;
  const pdfSection = pdfUrls ? `
        <h3 style="color: #333; font-size: 16px; margin-top: 20px;">Download PDFs</h3>
        <ul style="padding-left: 20px;">
          ${pdfUrls.sbsPara ? `<li><a href="${pdfUrls.sbsPara}" style="color: #b8860b;">Side-by-side (paragraph)</a></li>` : ''}
          ${pdfUrls.sbsSent ? `<li><a href="${pdfUrls.sbsSent}" style="color: #b8860b;">Side-by-side (sentence)</a></li>` : ''}
          ${pdfUrls.sbsNotes ? `<li><a href="${pdfUrls.sbsNotes}" style="color: #b8860b;">Side-by-side with notes</a></li>` : ''}
        </ul>` : `
        <p>Three PDF formats are available for download:</p>
        <ul style="padding-left: 20px;">
          <li>Side-by-side by paragraph</li>
          <li>Side-by-side by sentence</li>
          <li>Side-by-side with translator notes</li>
        </ul>`;
  return {
    subject: `Translation complete: ${workTitle || 'Untitled'}`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h1 style="color: #b8860b; font-size: 24px;">Your sponsored translation is ready</h1>
        <p>${sponsorName ? sponsorName + ', your' : 'Your'} translation of <strong>"${workTitle || 'your text'}"</strong> is complete.</p>
        <p>Three AI translators deliberated and converged on a final rendering, reviewed for fidelity to the source.</p>
        <p><a href="${viewUrl}" style="color: #b8860b;">View the full translation</a></p>
        ${pdfSection}
        <p style="margin-top: 20px;">This translation is now part of the public domain &mdash; a permanent gift to the community.</p>
        <p style="color: #999; font-size: 12px;">Print-on-demand coming soon on Amazon.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999;">CTAI &mdash; Committee Translation AI<br/>ctai.info</p>
      </div>
    `,
  };
}

export async function sendBatchEmail({ apiKey, recipients, subject, html, from = 'CTAI <noreply@ctai.info>' }) {
  const results = [];
  // Resend batch API: up to 100 emails per call
  for (let i = 0; i < recipients.length; i += 100) {
    const batch = recipients.slice(i, i + 100);
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(batch.map(r => ({
        from,
        to: [r.email],
        subject,
        html: html.replace('{{name}}', r.name || 'Friend')
          .replace('{{unsubscribe_url}}', r.unsubscribeUrl || '#'),
      }))),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`Resend batch error: ${err.slice(0, 200)}`);
    } else {
      results.push(await res.json());
    }
  }
  return results;
}

export function digestEmailHtml({ newTranslations, popular, origin }) {
  const newSection = newTranslations.length ? `
    <h2 style="color: #b8860b; font-size: 18px; margin-top: 24px;">New This Week</h2>
    <ul style="padding-left: 20px;">
      ${newTranslations.map(t => `<li><a href="${origin}/translations/${t.id}" style="color: #b8860b;">${t.work_title}</a> &mdash; ${t.style} translation</li>`).join('\n      ')}
    </ul>` : '';
  const popularSection = popular.length ? `
    <h2 style="color: #b8860b; font-size: 18px; margin-top: 24px;">Most Popular</h2>
    <ul style="padding-left: 20px;">
      ${popular.map(t => `<li><a href="${origin}/translations/${t.id}" style="color: #b8860b;">${t.work_title}</a> &mdash; ${t.view_count.toLocaleString()} views</li>`).join('\n      ')}
    </ul>` : '';
  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h1 style="color: #b8860b; font-size: 24px;">CTAI Weekly Digest</h1>
      <p>Hi {{name}}, here's what's new in the world of committee translations.</p>
      ${newSection}
      ${popularSection}
      ${!newTranslations.length && !popular.length ? '<p>No new translations this week, but stay tuned!</p>' : ''}
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
      <p style="font-size: 12px; color: #999;">
        CTAI &mdash; Committee Translation AI<br/>ctai.info<br/>
        <a href="{{unsubscribe_url}}" style="color: #999;">Unsubscribe from weekly digest</a>
      </p>
    </div>
  `;
}
