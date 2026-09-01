import fs from 'fs';
import { execSync, exec } from 'child_process';
import { ADB_PATH, ADB_EXE, ADB_DOWNLOAD_URL, ADB_LOCK_FILE } from './config.mjs';

const PIXEL1_CODENAMES = new Set(['sailfish', 'marlin']);
let selectedSerial = null;

function adbRaw(cmd, timeout = 30000) {
  if (!fs.existsSync(ADB_PATH)) {
    throw new Error(`ADB binary not found at ${ADB_PATH}. Download Platform Tools from ${ADB_DOWNLOAD_URL} and place ${ADB_EXE} in the adb/ folder.`);
  }
  return execSync(`"${ADB_PATH}" ${cmd}`, { encoding: 'utf8', timeout }).trim();
}

function adbRawAsync(cmd, timeout = 60000) {
  if (!fs.existsSync(ADB_PATH)) {
    return Promise.reject(new Error(`ADB binary not found at ${ADB_PATH}. Download Platform Tools from ${ADB_DOWNLOAD_URL} and place ${ADB_EXE} in the adb/ folder.`));
  }
  return new Promise((resolve, reject) => {
    exec(`"${ADB_PATH}" ${cmd}`, { encoding: 'utf8', timeout }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout.trim());
    });
  });
}

export function parseAdbDevices(text) {
  const devices = [];
  for (const line of (text || '').split(/\r?\n/)) {
    const m = line.match(/^(\S+)\s+(device|unauthorized|offline|no permissions)(?:\s+(.*))?$/);
    if (!m) continue;
    const serial = m[1];
    const state = m[2];
    const rest = m[3] || '';
    const model = (rest.match(/model:(\S+)/) || [])[1]?.replace(/_/g, ' ') || '';
    const product = (rest.match(/product:(\S+)/) || [])[1] || '';
    const device = (rest.match(/device:(\S+)/) || [])[1] || '';
    const isPixel1 = PIXEL1_CODENAMES.has(device) || PIXEL1_CODENAMES.has(product);
    devices.push({
      serial,
      state,
      model,
      product,
      device,
      isPixel1,
      ready: state === 'device',
    });
  }
  return devices;
}

export function listAdbDevices() {
  try {
    return parseAdbDevices(adbRaw('devices -l'));
  } catch {
    return [];
  }
}

function readAdbLock() {
  try {
    if (!fs.existsSync(ADB_LOCK_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(ADB_LOCK_FILE, 'utf8'));
    return data?.serial || null;
  } catch {
    return null;
  }
}

export function getLockedSerial() {
  return readAdbLock();
}

export function lockAdbSerial(serial) {
  if (!serial) return;
  fs.writeFileSync(ADB_LOCK_FILE, JSON.stringify({
    serial,
    lockedAt: new Date().toISOString(),
  }, null, 2));
}

export function clearAdbLock() {
  try {
    if (fs.existsSync(ADB_LOCK_FILE)) fs.unlinkSync(ADB_LOCK_FILE);
  } catch {}
}

function resolveSelected(devices = listAdbDevices()) {
  const ready = devices.filter(d => d.ready);
  const locked = readAdbLock();
  if (locked && ready.some(d => d.serial === locked)) {
    selectedSerial = locked;
    return selectedSerial;
  }
  if (selectedSerial && ready.some(d => d.serial === selectedSerial)) return selectedSerial;
  if (ready.length === 1) {
    selectedSerial = ready[0].serial;
    return selectedSerial;
  }
  const pixel1 = ready.filter(d => d.isPixel1);
  if (pixel1.length === 1) {
    selectedSerial = pixel1[0].serial;
    return selectedSerial;
  }
  if (selectedSerial && !ready.some(d => d.serial === selectedSerial)) selectedSerial = null;
  return selectedSerial;
}

export function getSelectedSerial() {
  return resolveSelected();
}

export function setSelectedSerial(serial) {
  const devices = listAdbDevices();
  const locked = readAdbLock();
  const lockedConnected = locked && devices.some(d => d.serial === locked && d.ready);
  if (lockedConnected && serial && serial !== locked) {
    throw new Error('ADB device is locked to the phone used for Trash + Reupload. Run Cleanup or Reset first.');
  }
  if (!serial) {
    if (lockedConnected) {
      throw new Error('ADB device is locked to the phone used for Trash + Reupload. Run Cleanup or Reset first.');
    }
    selectedSerial = null;
    return getAdbStatus();
  }
  const found = devices.find(d => d.serial === serial);
  if (!found) throw new Error(`ADB device not found: ${serial}`);
  if (!found.ready) throw new Error(`ADB device is ${found.state}: ${serial}`);
  selectedSerial = serial;
  return getAdbStatus();
}

export function getAdbStatus() {
  const devices = listAdbDevices();
  const selected = resolveSelected(devices);
  const current = devices.find(d => d.serial === selected) || null;
  const locked = readAdbLock();
  return {
    devices,
    selected,
    current,
    connected: !!selected,
    locked,
    matchesLock: !locked || selected === locked,
  };
}

function withSerial(cmd) {
  const serial = getSelectedSerial();
  if (!serial) throw new Error('No ADB device selected. Plug in the Pixel 1 or choose a device.');
  return `-s "${serial}" ${cmd}`;
}

export function adb(cmd) {
  return adbRaw(withSerial(cmd));
}

export function adbAsync(cmd) {
  return adbRawAsync(withSerial(cmd));
}

export function checkAdb() {
  return !!getSelectedSerial();
}

export function safeName(name) {
  return name.replace(/[ /\\?%*:|"<>]/g, '_');
}
