import sharp from 'sharp';

const ALLOWED_DOMAINS = ['img.komiku.org', 'cdn.komiku.co.id', 'img.komiku.id', 'minio.imgkc1.my.id'];
const DEFAULT_WIDTH = 800;
const DEFAULT_QUALITY = 75;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { url, w, q } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing ?url= param' });
  }

  // Validasi domain
  let parsed;
  try {
    parsed = new URL(decodeURIComponent(url));
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }

  const isAllowed = ALLOWED_DOMAINS.some(
    d => parsed.hostname === d || parsed.hostname.endsWith('.' + d)
  );
  if (!isAllowed) {
    return res.status(403).json({ error: 'Domain not allowed: ' + parsed.hostname });
  }

  const targetWidth = Math.min(Math.max(parseInt(w || DEFAULT_WIDTH), 100), 1200);
  const targetQuality = Math.min(Math.max(parseInt(q || DEFAULT_QUALITY), 10), 90);

  try {
    const imageRes = await fetch(parsed.toString(), {
      headers: {
        'Referer': 'https://komiku.org/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!imageRes.ok) {
      return res.status(imageRes.status).json({ error: 'Failed to fetch image from origin' });
    }

    const buffer = Buffer.from(await imageRes.arrayBuffer());

    const compressed = await sharp(buffer)
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: targetQuality })
      .toBuffer();

    const saved = Math.round((1 - compressed.length / buffer.length) * 100);

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400');
    res.setHeader('X-Original-Size', buffer.length);
    res.setHeader('X-Compressed-Size', compressed.length);
    res.setHeader('X-Saved', saved + '%');

    return res.status(200).send(compressed);

  } catch (err) {
    console.error('[img-proxy] error:', err.message);
    return res.status(500).json({ error: 'Proxy error', detail: err.message });
  }
}
