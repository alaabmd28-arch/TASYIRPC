'use strict';
/*
 * طباعة الإيصال الحراري على الحاسوب.
 * في أندرويد كان التطبيق يرسل صورة PNG بعرض 384px (58mm) أو 576px (80mm) إلى طابعة بلوتوث.
 * هنا نرسل نفس الصورة إلى أي طابعة مثبّتة في النظام (USB / شبكة / بلوتوث / COM) عبر تعريفها.
 */

const DPI = 203; // دقة الطابعات الحرارية الشائعة؛ 384px ≈ 48mm و576px ≈ 72mm

/** يقرأ عرض/ارتفاع PNG من ترويسته (IHDR) دون فك الصورة. */
function pngSize(b64) {
  const head = Buffer.from(String(b64).slice(0, 48), 'base64');
  if (head.length < 24 || head.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  const w = head.readUInt32BE(16);
  const h = head.readUInt32BE(20);
  if (!w || !h || w > 4000 || h > 20000) throw new Error('bad PNG size');
  return { w, h };
}

const imageWidthMm = (W) => (W / DPI) * 25.4;

function receiptHtml(b64, W) {
  const mm = imageWidthMm(W).toFixed(2);
  return (
    '<!doctype html><meta charset="utf-8">' +
    '<style>@page{margin:0}html,body{margin:0;padding:0;background:#fff}' +
    `img{display:block;width:${mm}mm;height:auto}</style>` +
    `<img src="data:image/png;base64,${b64}">`
  );
}

/** حجم الصفحة بالميكرون: عرض الورق 58/80mm وارتفاع على قدر الإيصال. */
function pageSizeMicrons(W, w, h) {
  const paperMm = W > 400 ? 80 : 58;
  const heightMm = Math.max(30, Math.ceil((h / w) * imageWidthMm(W)) + 6);
  return { width: paperMm * 1000, height: heightMm * 1000 };
}

module.exports = { pngSize, receiptHtml, pageSizeMicrons, imageWidthMm };
