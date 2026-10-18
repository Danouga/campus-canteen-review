const allowedTags = new Set(['P', 'DIV', 'H2', 'H3', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'IMG']);
const imagePattern = /^(?:data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+|\/api\/media\/[a-f0-9]{64})$/i;

export function sanitizeRichHtml(source) {
  const parsed = new DOMParser().parseFromString(String(source || ''), 'text/html');
  const output = document.createElement('div');
  const copy = (node, parent) => {
    if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(node.textContent || '')); return; }
    if (node.nodeType !== Node.ELEMENT_NODE || ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(node.tagName)) return;
    if (!allowedTags.has(node.tagName)) { [...node.childNodes].forEach((child) => copy(child, parent)); return; }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') || '';
      if (src.length <= 1_300_000 && imagePattern.test(src)) {
        const image = document.createElement('img'); image.src = src; image.alt = '帖子图片'; image.loading = 'lazy'; image.decoding = 'async';
        parent.append(image);
      }
      return;
    }
    const safe = document.createElement(node.tagName === 'DIV' ? 'p' : node.tagName.toLowerCase());
    [...node.childNodes].forEach((child) => copy(child, safe));
    parent.append(safe);
  };
  [...parsed.body.childNodes].forEach((node) => copy(node, output));
  return output.innerHTML;
}

export function plainTextFromRichHtml(source) {
  const safe = document.createElement('div');
  safe.innerHTML = sanitizeRichHtml(source);
  return (safe.textContent || '').trim();
}
