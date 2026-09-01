import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PORT = process.env.PORT || 8080;
export const CDP_URL = 'http://127.0.0.1:9222';

export const CHROME_PROFILE_DIR = process.env.CHROME_PROFILE_DIR || path.join(os.tmpdir(), 'Chrome-GPhotos-CDP');
export const CHROME_GUI_PROFILE_DIR = process.env.CHROME_GUI_PROFILE_DIR || path.join(os.tmpdir(), 'Chrome-GPhotos-GUI');
export const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

export const WORK_DIR = process.env.WORK_DIR || path.dirname(path.dirname(__dirname));
export const MANIFEST_FILE = path.join(WORK_DIR, 'manifest.json');
export const DOWNLOADS_DIR = path.join(WORK_DIR, 'downloads');

export const ADB_DIR = path.join(WORK_DIR, 'adb');
export const ADB_EXE = process.platform === 'win32' ? 'adb.exe' : 'adb';
export const ADB_PATH = path.join(ADB_DIR, ADB_EXE);
export const ADB_DOWNLOAD_URL = 'https://developer.android.com/tools/releases/platform-tools';
export const ADB_LOCK_FILE = path.join(WORK_DIR, 'adb-push-lock.json');

export const GPTH_EXE_NAME = process.platform === 'win32' ? 'gpth.exe' : 'gpth';
export const GPTH_OUT_DIR = path.join(WORK_DIR, '_gpth-out');

function firstExisting(paths) {
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

export function resolveGpth() {
  const dirs = [
    path.join(WORK_DIR, 'GooglePhotosTakeoutHelperNeo'),
    path.join(path.dirname(WORK_DIR), 'GooglePhotosTakeoutHelperNeo'),
    path.join(process.cwd(), 'GooglePhotosTakeoutHelperNeo'),
    path.join(process.cwd(), '..', 'GooglePhotosTakeoutHelperNeo'),
  ];
  const exe = firstExisting(dirs.map(d => path.join(d, GPTH_EXE_NAME)));
  const dir = exe ? path.dirname(exe) : path.join(WORK_DIR, 'GooglePhotosTakeoutHelperNeo');
  const versionFile = path.join(dir, 'version.txt');
  return {
    found: !!exe,
    path: exe,
    dir,
    versionFile: fs.existsSync(versionFile) ? versionFile : null,
  };
}

export const GPTH_DIR = path.join(WORK_DIR, 'GooglePhotosTakeoutHelperNeo');
export const GPTH_EXE = path.join(GPTH_DIR, GPTH_EXE_NAME);
export const GPTH_VERSION_FILE = path.join(GPTH_DIR, 'version.txt');
