import fs from 'fs';
import path from 'path';
import { connectCdp } from '../lib/cdp.mjs';
import { getTokens, callRpc } from '../lib/rpc.mjs';
import { readManifest, writeManifest, manifestStats } from '../lib/manifest.mjs';
import { log, opStart, opEnd, isStopRequested, broadcast } from '../lib/sse.mjs';
import { DOWNLOADS_DIR } from '../lib/config.mjs';

const DELAY_MS = 400;
const SAVE_EVERY = 10;

function findHttpsUrl(obj, depth = 0) {
  if (depth > 8 || obj == null) return null;
  if (typeof obj === 'string' && obj.startsWith('https://')) return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findHttpsUrl(item, depth + 1);
      if (found) return found;
    }
  } else if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      const found = findHttpsUrl(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function getDownloadUrl(cdp, tokens, mediaKey) {
  const payload = await callRpc(cdp, 'pLFTfd', [[mediaKey], [1]], tokens);
  return findHttpsUrl(payload);
}

async function getCookieHeader(cdp) {
  const result = await cdp.send('Network.getCookies', {
    urls: [
      'https://photos.google.com',
      'https://video-downloads.googleusercontent.com',
      'https://lh3.googleusercontent.com',
      'https://lh4.googleusercontent.com',
      'https://lh5.googleusercontent.com',
      'https://lh6.googleusercontent.com',
    ],
  });
  const cookies = result?.cookies ?? [];
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

function uniqueNameMap(manifest) {
  const counts = new Map();
  for (const item of manifest) {
    const name = item.filename || `${item.mediaKey}.bin`;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return function getUniqueName(item) {
    const filename = item.filename || `${item.mediaKey}.bin`;
    const safeName = filename.replace(/[/\\?%*:|"<>]/g, '_');
    if ((counts.get(filename) || 0) > 1) {
      const ext = safeName.includes('.') ? safeName.slice(safeName.lastIndexOf('.')) : '';
      const base = safeName.includes('.') ? safeName.slice(0, safeName.lastIndexOf('.')) : safeName;
      return `${base}_${String(item.mediaKey).slice(-8)}${ext}`;
    }
    return safeName;
  };
}

async function downloadOne(url, cookieHeader, userAgent) {
  const resp = await fetch(url, {
    headers: {
      Cookie: cookieHeader,
      'User-Agent': userAgent,
    },
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

export async function downloadStep() {
  opStart('download');
  let cdp;
  try {
    cdp = await connectCdp();
    if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    const manifest = readManifest();
    const getUniqueName = uniqueNameMap(manifest);
    const pending = manifest.filter(item => {
      if (!item.mediaKey || !item.consumesQuota) return false;
      if (item.downloaded && item.downloadedAs && fs.existsSync(item.downloadedAs)) return false;
      return true;
    });

    const quota = manifest.filter(i => i.consumesQuota).length;
    const publishStats = () => broadcast('stats', { stats: manifestStats(manifest) });
    publishStats();

    log(`Already downloaded: ${manifest.filter(i => i.downloaded).length}/${quota}. Remaining: ${pending.length}`);
    if (pending.length === 0) {
      const summary = 'All quota items already downloaded.';
      log(summary, 'success');
      opEnd('download', true, summary);
      return { ok: true, downloaded: 0 };
    }

    let tokens = await getTokens(cdp);
    const userAgent = (await cdp.evaluate('navigator.userAgent')) || 'Mozilla/5.0';
    let cookieHeader = await getCookieHeader(cdp);
    if (!cookieHeader) throw new Error('No Google Photos cookies — sign in first');

    let downloaded = 0;
    let errors = 0;

    for (const item of pending) {
      if (isStopRequested()) {
        log('Download stopped by user.', 'warn');
        break;
      }

      const safeName = getUniqueName(item);
      const outPath = path.join(DOWNLOADS_DIR, safeName);
      log(safeName);

      try {
        const url = await getDownloadUrl(cdp, tokens, item.mediaKey);
        if (!url) {
          log(`  skip: no download URL`, 'warn');
          errors++;
          continue;
        }
        const buffer = await downloadOne(url, cookieHeader, userAgent);
        fs.writeFileSync(outPath, buffer);
        item.downloaded = true;
        item.downloadedAs = outPath;
        item.downloadedBytes = buffer.length;
        item.downloadedAt = new Date().toISOString();
        downloaded++;
        publishStats();
        const totalNow = manifest.filter(i => i.downloaded).length;
        const mb = (buffer.length / 1024 / 1024).toFixed(2);
        const warnSize = item.sizeBytes && Math.abs(buffer.length - item.sizeBytes) > 1024;
        log(`  [${totalNow}/${quota}] OK ${mb} MB${warnSize ? ` (expected ${(item.sizeBytes / 1024 / 1024).toFixed(2)} MB)` : ''}`, 'success');
      } catch (err) {
        log(`  FAIL: ${err.message}`, 'error');
        errors++;
        if (/401|WIZ_global_data/i.test(err.message)) {
          try {
            tokens = await getTokens(cdp);
            cookieHeader = await getCookieHeader(cdp);
            log('Refreshed auth tokens.', 'warn');
          } catch {
            log('Auth expired. Stopping.', 'error');
            break;
          }
        }
      }

      if (downloaded > 0 && downloaded % SAVE_EVERY === 0) writeManifest(manifest);
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    writeManifest(manifest);
    const totalDl = manifest.filter(i => i.downloaded).length;
    const summary = `Downloaded ${downloaded}. Errors: ${errors}. Total downloaded: ${totalDl}/${quota}.`;
    log(summary, errors && !downloaded ? 'error' : 'success');
    opEnd('download', downloaded > 0 || pending.length === 0 || isStopRequested(), summary);
    return { ok: true, downloaded, errors };
  } catch (err) {
    log(`Download failed: ${err.message}`, 'error');
    opEnd('download', false, err.message);
    return { ok: false, error: err.message };
  } finally {
    cdp?.close();
  }
}
