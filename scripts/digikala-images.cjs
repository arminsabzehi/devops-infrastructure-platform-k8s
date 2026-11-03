#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');

const MANIFEST = process.env.MANIFEST || '/tmp/digikala-products.json';
const WORKDIR = process.env.IMAGE_WORKDIR || '/tmp/novamarket-digikala-images';
const API = 'https://api.digikala.com';
const headers = {
  'User-Agent': 'NovaMarket-Lab-Image-Importer/1.0',
  'Accept': 'application/json',
  'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8'
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function json(url) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + url);
  return r.json();
}
function productsFromSearch(j) {
  return j?.data?.products || j?.data?.widget?.data?.products || [];
}
function imagesOf(p) {
  const out = [];
  const add = x => {
    if (typeof x === 'string' && /^https:\/\//i.test(x)) out.push(x);
    else if (x && typeof x === 'object') {
      for (const k of ['url', 'src', 'webp_url', 'webp']) {
        if (typeof x[k] === 'string' && /^https:\/\//i.test(x[k])) { out.push(x[k]); break; }
      }
    }
  };
  const x = p?.images;
  if (Array.isArray(x)) x.forEach(add);
  else if (x && typeof x === 'object') {
    ['main', 'image', 'main_image', 'list'].forEach(k => {
      if (Array.isArray(x[k])) x[k].forEach(add); else add(x[k]);
    });
  }
  if (!out.length) add(p?.image || p?.image_url || p?.thumbnail);
  return [...new Set(out)];
}
function candidate(p) {
  const id = p?.id || p?.product_id;
  const title = p?.title_fa || p?.title || p?.name;
  const image = imagesOf(p)[0];
  if (!id || !title || !image) return null;
  return {
    digikalaProductId: String(id),
    title: String(title),
    productUrl: 'https://www.digikala.com/product/dkp-' + id + '/',
    imageUrl: image
  };
}
async function readManifest() {
  return JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
}
async function discover(items) {
  const all = [];
  for (const item of items) {
    try {
      const j = await json(API + '/v1/search/?q=' + encodeURIComponent(item.query));
      const candidates = productsFromSearch(j).map(candidate).filter(Boolean).slice(0, 10);
      all.push({ ...item, candidates });
      console.log(item.slug + ': ' + candidates.length + ' candidate(s)');
    } catch (e) {
      all.push({ ...item, candidates: [], error: e.message });
      console.error(item.slug + ': ' + e.message);
    }
    await sleep(900);
  }
  const output = path.join(path.dirname(MANIFEST), 'digikala-candidates.json');
  await fs.writeFile(output, JSON.stringify(all, null, 2) + '\n');
  console.log('Candidate file: ' + output);
  console.log('No MinIO or database changes were made. Select the correct product ID for each slug in the manifest.');
}
async function download(items) {
  const missing = items.filter(x => !x.digikalaProductId);
  if (missing.length) throw new Error('Select Digikala IDs for all ' + missing.length + ' remaining products in the manifest first.');
  await fs.mkdir(WORKDIR, { recursive: true });
  const report = [];
  for (const item of items) {
    const j = await json(API + '/v2/product/' + encodeURIComponent(item.digikalaProductId) + '/');
    const p = j?.data?.product || j?.data || j?.product || j;
    const urls = imagesOf(p);
    if (!urls.length) throw new Error('No image URL in Digikala detail response for ' + item.slug);
    const r = await fetch(urls[0], { headers, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('Image HTTP ' + r.status + ' for ' + item.slug);
    const type = (r.headers.get('content-type') || '').toLowerCase();
    if (!type.startsWith('image/')) throw new Error('Non-image response for ' + item.slug + ': ' + type);
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length < 5000) throw new Error('Image too small for ' + item.slug + ': ' + bytes.length);
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const file = path.join(WORKDIR, item.slug + '.' + ext);
    await fs.writeFile(file, bytes);
    report.push({ slug: item.slug, digikalaProductId: String(item.digikalaProductId), title: p?.title_fa || p?.title || item.query, sourceUrl: urls[0], file, contentType: type, bytes: bytes.length });
    console.log('Downloaded ' + item.slug + ' (' + bytes.length + ' bytes)');
    await sleep(500);
  }
  await fs.writeFile(path.join(WORKDIR, 'download-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Downloaded ' + report.length + ' images. Review them before import.');
}
function loadModule(name) {
  const req = createRequire(path.join(process.cwd(), 'package.json'));
  return req(name);
}
async function importImages(items, apply) {
  const report = JSON.parse(await fs.readFile(path.join(WORKDIR, 'download-report.json'), 'utf8'));
  if (report.length !== items.length) throw new Error('Download report does not match manifest size.');
  const pg = loadModule('pg');
  const Minio = loadModule('minio');
  const Pool = pg.Pool;
  const Client = Minio.Client;
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) throw new Error('S3_ENDPOINT is missing in catalog container environment.');
  const [endPoint, portText] = endpoint.split(':');
  const useSSL = String(process.env.S3_USE_SSL).toLowerCase() === 'true';
  const bucket = process.env.S3_BUCKET || 'novamarket';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const mc = new Client({
    endPoint, port: Number(portText || (useSSL ? 443 : 80)), useSSL,
    accessKey: process.env.S3_ACCESS_KEY, secretKey: process.env.S3_SECRET_KEY
  });
  try {
    const slugs = items.map(x => x.slug);
    const { rows } = await pool.query('SELECT id, slug, image FROM products WHERE slug = ANY($1::text[])', [slugs]);
    const bySlug = new Map(rows.map(x => [x.slug, x]));
    const missing = slugs.filter(x => !bySlug.has(x));
    if (missing.length) throw new Error('DB products not found: ' + missing.join(', '));
    const ids = rows.map(x => x.id);
    const galleries = await pool.query(
      'SELECT product_id, id, url, sort_order FROM product_images WHERE product_id = ANY($1::int[]) ORDER BY product_id, sort_order, id',
      [ids]
    );
    const backup = {
      createdAt: new Date().toISOString(),
      products: rows,
      productImages: galleries.rows
    };
    const backupFile = path.join(WORKDIR, 'database-image-backup-' + Date.now() + '.json');
    await fs.writeFile(backupFile, JSON.stringify(backup, null, 2) + '\n');
    console.log('DB image backup written: ' + backupFile);
    if (!apply) {
      console.log('DRY RUN: validated ' + report.length + ' products. No MinIO or DB changes. Re-run with --apply to commit.');
      return;
    }
    if (!await mc.bucketExists(bucket)) throw new Error('MinIO bucket does not exist: ' + bucket);
    const prepared = [];
    for (const item of report) {
      const product = bySlug.get(item.slug);
      const key = 'products/' + product.id + '/main.' + path.extname(item.file).slice(1);
      prepared.push({ ...item, id: product.id, key });
    }
    for (const item of prepared) {
      const body = await fs.readFile(item.file);
      await mc.putObject(bucket, item.key, body, body.length, {
        'Content-Type': item.contentType,
        'Cache-Control': 'public, max-age=86400'
      });
      console.log('Uploaded ' + item.key);
    }
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      for (const item of prepared) {
        await db.query('UPDATE products SET image=$1 WHERE id=$2', [item.key, item.id]);
        const primary = await db.query(
          'SELECT id FROM product_images WHERE product_id=$1 ORDER BY sort_order, id LIMIT 1 FOR UPDATE',
          [item.id]
        );
        if (primary.rowCount) {
          await db.query('UPDATE product_images SET url=$1 WHERE id=$2', [item.key, primary.rows[0].id]);
        } else {
          await db.query('INSERT INTO product_images(product_id,url,sort_order) VALUES($1,$2,0)', [item.id, item.key]);
        }
      }
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    } finally {
      db.release();
    }
    console.log('Imported ' + prepared.length + ' images. Additional gallery rows were preserved.');
  } finally {
    await pool.end();
  }
}
(async () => {
  const mode = process.argv[2] || 'discover';
  const items = await readManifest();
  if (mode === 'discover') await discover(items);
  else if (mode === 'download') await download(items);
  else if (mode === 'import') await importImages(items, process.argv.includes('--apply'));
  else throw new Error('Usage: digikala-images.cjs [discover|download|import [--apply]]');
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
