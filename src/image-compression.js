const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function asDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('图片读取失败。'));
    reader.readAsDataURL(blob);
  });
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function imageAsDataUrl(file, maxBytes = 900_000) {
  if (!acceptedTypes.has(file?.type)) throw new Error('请上传 JPG、PNG 或 WebP 图片。');
  if (file.size <= maxBytes) return asDataUrl(file);

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('图片无法读取，请换一张重试。');
  }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('当前浏览器无法压缩图片。'); }
  let scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const quality = Math.max(0.55, 0.86 - (attempt % 3) * 0.12);
      const blob = await toBlob(canvas, 'image/webp', quality);
      if (!blob) throw new Error('图片压缩失败，请重试。');
      if (blob.size <= maxBytes && acceptedTypes.has(blob.type)) return asDataUrl(blob);
      scale *= 0.78;
    }
  } finally {
    bitmap.close();
  }
  throw new Error('图片仍超过 900KB，请换一张尺寸更小的图片。');
}
