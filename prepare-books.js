#!/usr/bin/env node
// prepares real book page images into books/<subjectId>/<page>.jpg
// usage:
//   node prepare-books.js <subjectId> <sourceDirOrPdf>
// copies/renames images to compressed JPEG, or renders a PDF page-by-page (needs pdfjs-dist + @napi-rs/canvas + sharp)

const fs = require('fs');
const path = require('path');

const subject = process.argv[2];
const src = process.argv[3];
if (!subject || !src) {
  console.log('usage: node prepare-books.js <subjectId> <sourceDirOrPdf>');
  process.exit(1);
}
if (!/^[a-z]+$/.test(subject)) {
  console.log('subjectId must be lowercase letters, e.g. arabic, math');
  process.exit(1);
}

const root = path.resolve(__dirname);
const destDir = path.join(root, 'books', subject);
fs.mkdirSync(destDir, { recursive: true });

const srcPath = path.resolve(process.cwd(), src);
const EXT = '.jpg';
const QUALITY = 82;

function toLatinDigits(s) {
  return String(s).replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660));
}
function pageFromName(name) {
  const n = toLatinDigits(name).replace(/\..+$/, '');
  const m = n.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
function sortableBase(name) {
  const n = toLatinDigits(name).replace(/\..+$/, '');
  const m = n.match(/(\d+)/);
  if (!m) return name.toLowerCase();
  return n.replace(m[1], parseInt(m[1], 10).toString().padStart(6, '0')).toLowerCase();
}

async function convertImage(inFile, outFile) {
  const sharp = require('sharp');
  await sharp(inFile, { failOn: 'none' }).rotate().jpeg({ quality: QUALITY, chromaSubsampling: '4:2:0' }).toFile(outFile);
}

async function renderPdf(pdfFile) {
  let pdfjs, cv;
  try { pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); } catch {}
  if (!pdfjs) throw new Error('PDF renders need pdfjs-dist. Run: npm i pdfjs-dist');
  try { cv = await import('@napi-rs/canvas'); } catch {}
  if (!cv) throw new Error('PDF renders need @napi-rs/canvas. Run: npm i @napi-rs/canvas');
  const sharp = require('sharp');
  const buf = fs.readFileSync(pdfFile);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), disableWorker: true }).promise;
  const startHint = pageFromName(path.basename(pdfFile));
  let count = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 2.0 });
    const canvas = cv.createCanvas(Math.floor(vp.width), Math.floor(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const png = canvas.toBuffer('image/png');
    const num = startHint ? startHint + (p - 1) : p;
    await sharp(png).jpeg({ quality: QUALITY, chromaSubsampling: '4:2:0' }).toFile(path.join(destDir, num + EXT));
    count++;
    if (typeof page.cleanup === 'function') page.cleanup();
  }
  if (typeof doc.destroy === 'function') { try { await doc.destroy(); } catch {} }
  return count;
}

(async () => {
  const st = fs.statSync(srcPath);
  if (st.isDirectory()) {
    const extOk = /\.(png|jpe?g|webp|bmp)$/i;
    const files = fs.readdirSync(srcPath).filter(f => extOk.test(f));
    if (!files.length) { console.log('no raster images found in', srcPath); process.exit(1); }
    files.sort((a, b) => sortableBase(a) < sortableBase(b) ? -1 : 1);
    const allNumbered = files.every(f => pageFromName(f) != null);
    for (let i = 0; i < files.length; i++) {
      const page = allNumbered ? pageFromName(files[i]) : i + 1;
      await convertImage(path.join(srcPath, files[i]), path.join(destDir, page + EXT));
      console.log('  ', page + EXT, '<-', files[i]);
    }
    console.log('done:', files.length, 'pages ->', path.relative(root, destDir));
  } else if (/\.pdf$/i.test(srcPath)) {
    const n = await renderPdf(srcPath);
    console.log('done:', n, 'pdf pages rendered ->', path.relative(root, destDir));
  } else {
    console.log('source must be a folder of images or a pdf file');
    process.exit(1);
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });