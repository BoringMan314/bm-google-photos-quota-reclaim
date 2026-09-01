import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { log, opStart, opEnd, isStopRequested } from '../lib/sse.mjs';
import { DOWNLOADS_DIR, GPTH_OUT_DIR, resolveGpth } from '../lib/config.mjs';

const execFileAsync = promisify(execFile);

const SKIP_EXT = new Set(['.json', '.html', '.htm', '.txt', '.md', '.url']);

export function gpthStatus() {
  const g = resolveGpth();
  let version = null;
  if (g.versionFile) {
    try { version = fs.readFileSync(g.versionFile, 'utf8').trim() || null; } catch {}
  }
  return { found: g.found, version, path: g.path, dir: g.dir };
}

export async function pickFolder() {
  if (process.platform !== 'win32') throw new Error('Folder picker is only available on Windows');
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$f = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$f.Description = 'Select Google Takeout folder (extracted Takeout, or a folder of ZIP files)'",
    '$f.ShowNewFolderButton = $false',
    'if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($f.SelectedPath) }',
  ].join('; ');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    windowsHide: false,
    timeout: 0,
    maxBuffer: 1024 * 1024,
  });
  const selected = String(stdout || '').trim();
  return { path: selected || null };
}

function collectMediaFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      collectMediaFiles(full, acc);
      continue;
    }
    const ext = path.extname(name).toLowerCase();
    if (SKIP_EXT.has(ext)) continue;
    if (name.startsWith('.')) continue;
    acc.push(full);
  }
  return acc;
}

function copyIntoDownloads(files) {
  if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  let copied = 0;
  for (const src of files) {
    fs.copyFileSync(src, path.join(DOWNLOADS_DIR, path.basename(src)));
    copied++;
  }
  return copied;
}

function runGpth(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-interactive',
      '--input', inputPath,
      '--output', outputPath,
      '--albums', 'nothing',
      '--divide-to-dates', '0',
      '--keep-input',
      '--write-exif',
    ];
    const g = resolveGpth();
    if (!g.found) throw new Error('gpth.exe not found');
    log(`Running ${g.path} ${args.join(' ')}`);
    const child = spawn(g.path, args, {
      cwd: g.dir,
      windowsHide: true,
    });
    const flush = (buf, level = 'info') => {
      for (const line of String(buf).split(/\r?\n/)) {
        const t = line.trim();
        if (t) log(t, level);
      }
    };
    child.stdout.on('data', d => flush(d, 'info'));
    child.stderr.on('data', d => flush(d, 'warn'));
    const killer = setInterval(() => {
      if (isStopRequested()) {
        try { child.kill(); } catch {}
      }
    }, 500);
    child.on('error', err => {
      clearInterval(killer);
      reject(err);
    });
    child.on('close', code => {
      clearInterval(killer);
      if (isStopRequested()) {
        reject(new Error('Stopped by user'));
        return;
      }
      if (code !== 0) {
        reject(new Error(`gpth exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

export async function gpthProcessStep({ inputPath } = {}) {
  opStart('gpth-process');
  try {
    const st = gpthStatus();
    if (!st.found) throw new Error(`gpth.exe not found. Run UpdateGooglePhotosTakeoutHelperNeo.bat`);
    if (!inputPath || typeof inputPath !== 'string') throw new Error('inputPath required');
    const input = path.resolve(inputPath.trim());
    if (!fs.existsSync(input)) throw new Error(`Input not found: ${input}`);

    if (fs.existsSync(GPTH_OUT_DIR)) fs.rmSync(GPTH_OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(GPTH_OUT_DIR, { recursive: true });
    if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

    log(`GPTH ${st.version || ''} → ${input}`, 'info');
    await runGpth(input, GPTH_OUT_DIR);

    const files = collectMediaFiles(GPTH_OUT_DIR);
    log(`Found ${files.length} media files. Copying to downloads/...`);
    const copied = copyIntoDownloads(files);
    try { fs.rmSync(GPTH_OUT_DIR, { recursive: true, force: true }); } catch {}

    const summary = `Processed ${copied} files into downloads/.`;
    log(summary, 'success');
    opEnd('gpth-process', true, summary);
    return { ok: true, copied };
  } catch (err) {
    log(`GPTH failed: ${err.message}`, 'error');
    opEnd('gpth-process', false, err.message);
    return { ok: false, error: err.message };
  }
}
