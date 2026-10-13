'use strict';
/*
 * قفل PIN للنسخة المكتبية (يقابل PinActivity في نسخة أندرويد).
 * - لا يُخزَّن PIN نفسه أبدًا، بل مشتقّ PBKDF2-SHA256 مع ملح عشوائي.
 * - مفتاح الاسترجاع يُعرض مرة واحدة عند التفعيل ويُخزَّن مشتقّه فقط.
 * - تأخير تصاعدي بعد 5 محاولات خاطئة متتالية.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بلا 0/O/1/I لتفادي اللبس
const ITER = 150000;

const derive = (secret, salt) =>
  crypto.pbkdf2Sync(String(secret), Buffer.from(salt, 'hex'), ITER, 32, 'sha256');

function randomKey(len = 16) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

const normKey = (k) => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

class Security {
  constructor(file, now = () => Date.now()) {
    this.file = file;
    this.now = now;
    this.data = this._load();
    this.fails = 0;
    this.blockedUntil = 0;
  }

  _load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (d && typeof d === 'object') return d;
    } catch (_) { /* أول تشغيل أو ملف تالف */ }
    return { on: false, timeout: 60 };
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  info() {
    const t = Number.isInteger(this.data.timeout) ? this.data.timeout : 60;
    return { on: !!this.data.on, timeout: t };
  }

  /** يفعّل PIN جديدًا (أو يغيّره) ويعيد مفتاح الاسترجاع، أو '' عند الفشل. */
  setup(pin) {
    if (!/^\d{4,6}$/.test(String(pin))) return '';
    const salt = crypto.randomBytes(16).toString('hex');
    const rsalt = crypto.randomBytes(16).toString('hex');
    const key = randomKey(16);
    this.data = {
      on: true,
      timeout: this.info().timeout,
      salt,
      hash: derive(pin, salt).toString('hex'),
      rsalt,
      rhash: derive(key, rsalt).toString('hex'),
    };
    this._save();
    this.fails = 0;
    this.blockedUntil = 0;
    return key;
  }

  _eq(secret, salt, hashHex) {
    if (!salt || !hashHex) return false;
    const a = derive(secret, salt);
    const b = Buffer.from(hashHex, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /** تحقق بسيط (يُستعمل من شاشة الإعدادات بعد فتح التطبيق). */
  verify(pin) {
    return !!this.data.on && this._eq(pin, this.data.salt, this.data.hash);
  }

  _throttled() {
    const left = Math.ceil((this.blockedUntil - this.now()) / 1000);
    return left > 0 ? left : 0;
  }

  _fail() {
    this.fails += 1;
    if (this.fails >= 5) {
      const step = Math.min(this.fails - 5, 4); // 30s, 60s, 120s, 240s, 300s
      this.blockedUntil = this.now() + Math.min(30 * 2 ** step, 300) * 1000;
    }
  }

  /** فتح القفل من شاشة القفل مع تأخير ضد التخمين. */
  unlock(pin) {
    const wait = this._throttled();
    if (wait) return { ok: false, wait };
    if (this.verify(pin)) {
      this.fails = 0;
      return { ok: true, wait: 0 };
    }
    this._fail();
    return { ok: false, wait: this._throttled() };
  }

  disable(pin) {
    if (!this.verify(pin)) return false;
    this.data = { on: false, timeout: this.info().timeout };
    this._save();
    return true;
  }

  /** نسيت PIN: مفتاح الاسترجاع يلغي PIN (ثم يفعّل المستخدم PIN جديدًا). */
  recover(key) {
    const wait = this._throttled();
    if (wait) return { ok: false, wait };
    if (this.data.on && this._eq(normKey(key), this.data.rsalt, this.data.rhash)) {
      this.data = { on: false, timeout: this.info().timeout };
      this._save();
      this.fails = 0;
      return { ok: true, wait: 0 };
    }
    this._fail();
    return { ok: false, wait: this._throttled() };
  }

  setTimeoutSec(sec) {
    const s = Number(sec);
    if (!Number.isFinite(s) || s < 0 || s > 86400) return;
    this.data.timeout = Math.floor(s);
    this._save();
  }
}

module.exports = { Security, randomKey, normKey };
