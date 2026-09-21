#!/usr/bin/env node
// prepares real book page images into books/<subjectId>/<page>.png
// usage:
//   node prepare-books.js <subjectId> <sourceDirOrPdf>
// copies/renames images numerically, or renders a PDF page-by-page (needs pdfjs-dist + @napi-rs/canvas)

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
  let sharp = null;
  try { sharp = require('sharp'); } catch {}
  if (sharp) {
    await sharp(inFile, { failOn: 'none' }).png().toFile(outFile);
    return;
  }
  const ext = path.extname(inFile).toLowerCase();
  if (ext !== '.png') {
    throw new Error('No "sharp" available; only PNG sources can be copied as-is. Run: npm i sharp');
  }
  fs.copyFileSync(inFile, outFile);
}

async function renderPdf(pdfFile) {
  let pdfjs, cv;
  try { pdfjs = require('pdfjs-dist/legacy/build/pdf.js'); } catch { pdfjs = require('pdfjs-dist'); }
  try { cv = require('@napi-rs/canvas'); } catch {}
  if (!cv) throw new Error('PDF rendering needs @napi-rs/canvas. Run: npm i pdfjs-dist @napi-rs/canvas');
  const buf = fs.readFileSync(pdfFile);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const startHint = pageFromName(path.basename(pdfFile));
  let count = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 2.0 });
    const canvas = cv.createCanvas(Math.floor(vp.width), Math.floor(vp.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const num = startHint ? startHint + (p - 1) : p;
    fs.writeFileSync(path.join(destDir, num + '.png'), canvas.toBuffer('image/png'));
    count++;
  }
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
      await convertImage(path.join(srcPath, files[i]), path.join(destDir, page + '.png'));
      console.log('  ', page + '.png  <-  ' + files[i]);
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