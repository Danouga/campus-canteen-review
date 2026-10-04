import { createHash } from 'node:crypto';

const imageDataUrl = /data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+/gi;

// Replace embedded image bytes with stable same-origin URLs before persisting app state.
export function extractMedia(payload) {
  const media = new Map();
  const state = payload.replace(imageDataUrl, (dataUrl, subtype) => {
    const mime = `image/${subtype.toLowerCase()}`;
    const body = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    if (!body.length) throw new Error('图片数据无效。');
    const hash = createHash('sha256').update(mime).update(body).digest('hex');
    if (!media.has(hash)) media.set(hash, { hash, mime, body });
    return `/api/media/${hash}`;
  });
  return { payload: state, media: [...media.values()] };
}
