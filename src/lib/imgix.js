const IMGIX_BASE = 'https://18441963.imgix.net/ctai';

export function coverUrl(slug, { width, format } = {}) {
  const params = new URLSearchParams({ auto: 'format', fit: 'max' });
  if (width) params.set('w', String(width));
  if (format) params.set('fm', format);
  return `${IMGIX_BASE}/${slug}.png?${params}`;
}

export function imgUrl(path, { width, height, format, fit } = {}) {
  const params = new URLSearchParams({ auto: 'format' });
  if (width) params.set('w', String(width));
  if (height) params.set('h', String(height));
  if (format) params.set('fm', format);
  if (fit) params.set('fit', fit);
  return `${IMGIX_BASE}/${path}?${params}`;
}
