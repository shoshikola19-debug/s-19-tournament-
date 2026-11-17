// S_19 Tournament — standalone server for Render (free tier)
// Express + SQLite (local) or Postgres/Neon (DATABASE_URL).
// Rebuilt from the Muse artifact es-19-tturnaamentt so the app lives on
// its own domain (https://s-19-tournament.onrender.com) and Chrome can
// install it as a separate app. Data seeded from data/seed.json — the
// exact export of the artifact (10 tournaments, owner profile, wallet,
// payment info). Nothing invented.
'use strict';
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const OWNER_EMAIL = 'shoshikola19@gmail.com';
const DEPOSIT_MIN = 10;
const DEPOSIT_MAX = 1000;
const ROOM_REVEAL_MINUTES = 5;

// ---- time helpers (Asia/Dhaka is UTC+6, no DST) ----
function dhakaNow() { return new Date(Date.now() + 6 * 60 * 60 * 1000); }
function dhakaDateStr(d = dhakaNow()) { return d.toISOString().slice(0, 10); }
function dhakaTimeStr(d = dhakaNow()) { return d.toISOString().slice(11, 16); }
function matchStartMs(t) {
  const [y, mo, da] = t.match_date.split('-').map(Number);
  const [h, mi] = t.match_time.split(':').map(Number);
  return Date.UTC(y, mo - 1, da, h - 6, mi);
}
function roomRevealed(t) {
  if (t.status === 'live' || t.status === 'finished') return true;
  return Date.now() >= matchStartMs(t) - ROOM_REVEAL_MINUTES * 60 * 1000;
}
function matchStarted(t) { return Date.now() >= matchStartMs(t); }

// ---- app settings (admin-editable in the Admin Panel, stored in the
// settings key-value table next to the payment numbers) ----
const APP_SETTING_DEFAULTS = {
  app_name: 'S_19 TOURNAMENT',
  notice_rules: 'নিজের স্লট নম্বর মনে রাখবেন।\nRoom Details থেকে পাওয়া ID ও Password দিয়ে কাস্টম রুমে ঢুকবেন।\nObserver থেকে নিজের স্লটে যাবেন।\nস্লটে সমস্যা হলে গেমে মেসেজ না দিয়ে Voice On করে হোস্টকে জানাবেন।\n⚠ শৃঙ্খলা বজায় রাখবেন — অযথা ভয়েস অন করে চিল্লাচিল্লি বা বিশৃঙ্খলা করবেন না। এটি টুর্নামেন্টের পরিবেশ নষ্ট করে।\n📹 ভিডিও রেকর্ড (Screen Record) বাধ্যতামূলক: আইডি-পাসওয়ার্ড নেওয়া থেকে শুরু করে ম্যাচ স্টার্ট হওয়া পর্যন্ত পুরো সময়টা ভিডিও করে রাখবেন। ভিডিও প্রমাণ ছাড়া কোনো প্রকার রিফান্ড (Refund) দাবি করলে তা গ্রহণযোগ্য হবে না।',
  banner_title: 'S_19 TOURNAMENT',
  banner_subtitle: 'PLAY WIN ENJOY — Daily BR • CS • Lone Wolf matches. Win real Taka prizes!',
  withdraw_min: '100',
  withdraw_start: '600', // 10:00 AM, minutes from midnight (Dhaka)
  withdraw_end: '1290', // 9:30 PM
  spin_enabled: '1',
};
function parseIntSetting(v, fallback) {
  const n = Number(v);
  return Number.isInteger(n) ? n : fallback;
}
async function getAppSettings() {
  const rows = await db.all('SELECT key, value FROM settings');
  const s = { ...APP_SETTING_DEFAULTS };
  for (const r of rows) if (r.key in s) s[r.key] = r.value;
  return {
    appName: String(s.app_name || 'S_19 TOURNAMENT'),
    noticeRules: String(s.notice_rules || ''),
    bannerTitle: String(s.banner_title || 'S_19 TOURNAMENT'),
    bannerSubtitle: String(s.banner_subtitle || ''),
    withdrawMin: parseIntSetting(s.withdraw_min, 100),
    withdrawStart: parseIntSetting(s.withdraw_start, 600),
    withdrawEnd: parseIntSetting(s.withdraw_end, 1290),
    spinEnabled: s.spin_enabled !== '0',
  };
}
function fmtClock(mins) {
  const m = Math.max(0, Math.min(1439, Number(mins) || 0));
  const h = Math.floor(m / 60), mm = m % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}

// ---- passwords / sessions ----
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return { salt, hash };
}

// ---- phone normalization ----
// One number = one account. Stored form is '+8801XXXXXXXXX'; login accepts
// +880..., 880..., 01..., 1... (10 digits), spaces/dashes — all compared on
// the last 11 digits, so the same number always finds the same account.
function normalizePhone(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (!d) return null;
  let tail = d;
  if (tail.length === 13 && tail.startsWith('880')) tail = tail.slice(2);
  else if (tail.length === 12 && tail.startsWith('88')) tail = tail.slice(2);
  else if (tail.length === 10 && tail.startsWith('1')) tail = '0' + tail;
  if (!/^01[3-9]\d{8}$/.test(tail)) return null;
  return tail;
}
function canonicalPhone(v) {
  const n = normalizePhone(v);
  return n ? '+880' + n.slice(1) : null;
}
async function findProfileByPhone(v) {
  const n = normalizePhone(v);
  if (!n) return null;
  const rows = await db.all('SELECT * FROM profiles');
  return rows.find((r) => normalizePhone(r.phone) === n) || null;
}
async function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ ok: false, error: 'Login required' });
  const s = await db.get('SELECT profile_id FROM sessions WHERE token = ?', [token]);
  if (!s) return res.status(401).json({ ok: false, error: 'Session expired, login again' });
  req.profileId = s.profile_id;
  req.profile = await db.get('SELECT * FROM profiles WHERE id = ?', [s.profile_id]);
  next();
}
async function adminAuth(req, res, next) {
  await auth(req, res, async () => {
    if (req.profile.email !== OWNER_EMAIL) {
      return res.status(403).json({ ok: false, error: 'Only the owner can do this' });
    }
    next();
  });
}

// Wallet math (computed from transactions, like the artifact).
// Processed oldest-first: deposits/refunds/entries move the Deposit
// Balance, prizes/spins move the Winning Balance, and a withdrawal
// takes from Winning first, any remainder from Deposit. (That is how
// the artifact's own seeded history nets out: deposits 100+100,
// withdraw 200 -> deposit 0, winning 0, topup 200.) In normal flow a
// withdrawal is capped at the Winning Balance, so the remainder path
// never triggers for real requests.
async function walletFor(profileId) {
  const tx = await db.all(
    "SELECT * FROM wallet_tx WHERE profile_id = ? ORDER BY created_at DESC, id DESC", [profileId]);
  const ordered = [...tx].sort((a, b) =>
    (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id));
  let deposit = 0, winning = 0, topupTotal = 0;
  for (const t of ordered) {
    if (t.type === 'deposit' && t.status === 'approved') { deposit += t.amount; topupTotal += t.amount; }
    else if (t.type === 'refund' && t.status === 'approved') deposit += t.amount;
    else if (t.type === 'entry' && t.status === 'approved') deposit += t.amount; // stored negative
    else if ((t.type === 'prize' || t.type === 'spin') && t.status === 'approved') winning += t.amount;
    // Transfer Balance: Winning -> Deposit (approved instantly, internal move).
    else if (t.type === 'transfer_out' && t.status === 'approved') winning += t.amount; // stored negative
    else if (t.type === 'transfer_in' && t.status === 'approved') deposit += t.amount;
    else if (t.type === 'withdraw') {
      // Pending withdrawals hold the amount immediately; approved ones are final.
      if (t.status === 'pending' || t.status === 'approved') {
        let rest = -t.amount; // t.amount is stored negative
        const fromWinning = Math.min(winning, rest);
        winning -= fromWinning; rest -= fromWinning;
        deposit -= rest;
      }
    }
  }
  return { depositBalance: deposit, winningBalance: winning, topupTotal, transactions: tx };
}

// ---- slot defaults (defaults only; the admin may set any totalSlots 2–100) ----
function defaultSlots(category, subcategory) {
  const key = category + '/' + subcategory;
  const map = {
    'br/Solo': 48, 'br/Duo': 50, 'br/Esports PRO': 50,
    'cs/4v4': 8, 'cs/1v1': 2, 'cs/Headshot Only': 8,
    'lw/1v1': 2, 'lw/2v2': 4, 'lw/Lose To Win': 2, 'lw/Headshot Only': 8,
  };
  return map[key] ?? null;
}
function validSlots(n) { return Number.isInteger(n) && n >= 2 && n <= 100; }
const BR_SPLIT = { 1: 90, 2: 70, 3: 40, 4: 30, 5: 20 }; // BR Solo/Duo prize split

// ---- seed from data/seed.json (exact artifact export) ----
async function seed() {
  const count = await db.get('SELECT COUNT(*) AS n FROM tournaments');
  if (count && count.n > 0) return;
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'seed.json'), 'utf8'));
  const now = new Date().toISOString();
  const p = seed.profile;
  await db.run(
    'INSERT INTO profiles (id, account_id, username, email, phone, ign, uid, password_hash, password_salt, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [1, p.accountId, p.username, p.email, p.phone, p.ign, p.uid, null, null, now]);
  for (const t of seed.tournaments) {
    await db.run(
      'INSERT INTO tournaments (id, title, category, subcategory, mode, match_type, map, pov, match_date, match_time, total_slots, entry_fee, prize_pool, per_kill_prize, per_kill_points, room_id, room_password, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [t.id, t.title, t.category, t.subcategory, t.mode, t.matchType, t.map, t.pov, t.matchDate, t.matchTime, t.totalSlots, t.entryFee, t.prizePool, t.perKillPrize, t.perKillPoints, t.roomId, t.roomPassword, t.status]);
  }
  for (const w of seed.walletTransactions) {
    await db.run(
      'INSERT INTO wallet_tx (id, profile_id, type, amount, method, account_number, trx_id, note, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [w.id, 1, w.type, w.type === 'withdraw' ? -Math.abs(w.amount) : w.amount, w.method, w.accountNumber, w.trxId || '', w.note, w.status, w.createdAt]);
  }
  const pay = seed.paymentInfo;
  for (const [k, v] of Object.entries({ bkash: pay.bkashNumber, nagad: pay.nagadNumber, rocket: pay.rocketNumber, groupLink: pay.groupLink })) {
    await db.run('INSERT INTO settings (key, value) VALUES (?,?)', [k, v || '']);
  }
  if (db.getEngine() === 'postgres') {
    for (const tbl of ['profiles', 'tournaments', 'wallet_tx']) {
      await db.run(`SELECT setval(pg_get_serial_sequence('${tbl}','id'), (SELECT MAX(id) FROM ${tbl}))`);
    }
  }
  console.log('Seeded from data/seed.json: 10 tournaments, owner profile, wallet history.');
}

// ---- public helpers ----
function publicTournament(t, bookings, results, reveal) {
  return {
    id: t.id, title: t.title, category: t.category, subcategory: t.subcategory,
    mode: t.mode, matchType: t.match_type, map: t.map, pov: t.pov,
    matchDate: t.match_date, matchTime: t.match_time, totalSlots: t.total_slots,
    entryFee: t.entry_fee, prizePool: t.prize_pool, perKillPrize: t.per_kill_prize,
    prize1: t.prize1 || 0, prize2: t.prize2 || 0, prize3: t.prize3 || 0,
    prize4: t.prize4 || 0, prize5: t.prize5 || 0,
    perKillPoints: t.per_kill_points, status: t.status,
    hasRoom: !!(t.room_id && t.room_password),
    roomId: reveal ? t.room_id : '', roomPassword: reveal ? t.room_password : '',
    roomRevealed: reveal, bookings, results,
  };
}
async function loadTournaments(revealAll) {
  const rows = await db.all('SELECT * FROM tournaments ORDER BY match_date, match_time, id');
  const out = [];
  for (const t of rows) {
    const bookings = await db.all('SELECT * FROM bookings WHERE tournament_id = ? ORDER BY slot_number', [t.id]);
    const results = await db.all('SELECT * FROM results WHERE tournament_id = ? ORDER BY placement', [t.id]);
    out.push(publicTournament(t, bookings, results, revealAll ? true : roomRevealed(t)));
  }
  return out;
}

app.get('/api/health', (req, res) => res.json({ ok: true, engine: db.getEngine() }));

// ---- auth ----
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, phone } = req.body || {};
    // Passwords are trimmed on every side: a phone keyboard easily adds a
    // trailing space while typing, and that stored space made the correct
    // password show "Wrong password" at login.
    const password = String((req.body || {}).password || '').trim();
    if (!username || !email || !phone || !password || password.length < 4) {
      return res.status(400).json({ ok: false, error: 'Username, email, phone and a 4+ character password are required' });
    }
    const phoneCanon = canonicalPhone(phone);
    if (!phoneCanon) {
      return res.status(400).json({ ok: false, error: 'Phone must be a Bangladeshi number starting +8801' });
    }
    const byEmail = await db.get('SELECT * FROM profiles WHERE LOWER(email) = LOWER(?)', [email]);
    if (byEmail && byEmail.password_hash) {
      return res.status(400).json({ ok: false, error: 'An account already exists with this email. Please login instead.' });
    }
    const byUsername = await db.get('SELECT * FROM profiles WHERE LOWER(username) = LOWER(?)', [username]);
    if (byUsername && byUsername.password_hash) {
      return res.status(400).json({ ok: false, error: 'This username is already taken. Please choose another one.' });
    }
    // One number = one account: a phone already on an active account cannot
    // open a second one — login with it instead.
    const byPhone = await findProfileByPhone(phoneCanon);
    if (byPhone && byPhone.password_hash) {
      return res.status(400).json({ ok: false, error: 'An account already exists with this number. Please login instead.' });
    }
    const existing = byEmail || byUsername;
    if (byPhone && !byPhone.password_hash && (!existing || byPhone.id !== existing.id)) {
      return res.status(400).json({ ok: false, error: 'This phone number belongs to another account — login with its email instead' });
    }
    const { salt, hash } = hashPassword(String(password));
    let profileId;
    if (existing) {
      // Owner restore: the seeded profile has no password yet; setting it here activates it.
      await db.run('UPDATE profiles SET password_hash = ?, password_salt = ?, phone = ? WHERE id = ?',
        [hash, salt, phoneCanon, existing.id]);
      profileId = existing.id;
    } else {
      const maxAcc = await db.get('SELECT MAX(account_id) AS m FROM profiles');
      const accountId = (maxAcc && maxAcc.m) ? maxAcc.m + 1 : 100001;
      profileId = await db.insert(
        'INSERT INTO profiles (account_id, username, email, phone, ign, uid, password_hash, password_salt, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [accountId, username, email, phoneCanon, username, '', hash, salt, new Date().toISOString()]);
    }
    const token = crypto.randomBytes(32).toString('hex');
    await db.run('INSERT INTO sessions (token, profile_id, created_at) VALUES (?,?,?)',
      [token, profileId, new Date().toISOString()]);
    const profile = await db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
    res.json({ ok: true, token, profile: safeProfile(profile) });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body || {};
    if (!emailOrUsername || !password) {
      return res.status(400).json({ ok: false, error: 'Email / username / phone and password are required' });
    }
    const id = String(emailOrUsername).trim();
    // Email or username (case-insensitive), or phone in any format
    // (+880..., 880..., 01..., spaces/dashes) — all find the same account.
    let p = await db.get('SELECT * FROM profiles WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)', [id, id]);
    if (!p) p = await findProfileByPhone(id);
    if (!p || !p.password_hash) return res.status(400).json({ ok: false, error: 'No account found — register first' });
    // Trimmed first (see register). Also try the exact typed password and
    // one-space variants: an account created before trimming may have a
    // trailing/leading space stored, and its owner types the password
    // without the space — that must still log in, not show "Wrong password".
    const rawPw = String(password);
    const pw = rawPw.trim();
    const candidates = [...new Set([pw, rawPw, pw + ' ', ' ' + pw])];
    let ok = false;
    for (const c of candidates) {
      if (hashPassword(c, p.password_salt).hash === p.password_hash) { ok = true; break; }
    }
    if (!ok) return res.status(400).json({ ok: false, error: 'Wrong password' });
    if (p.banned) return res.status(403).json({ ok: false, error: 'This account is banned' });
    const token = crypto.randomBytes(32).toString('hex');
    await db.run('INSERT INTO sessions (token, profile_id, created_at) VALUES (?,?,?)',
      [token, p.id, new Date().toISOString()]);
    res.json({ ok: true, token, profile: safeProfile(p) });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// ---- forgot password: 6-digit code, 10 min expiry, 5 attempts, 60s resend cooldown ----
// The plain code is NEVER logged. It is emailed when SMTP is configured;
// otherwise it is stored (code_plain) so the admin can relay it via Support —
// admin-only, auto-deleted on use/expiry. Only the sha256 hash is used to verify.
const RESET_TTL_MS = 10 * 60 * 1000;
const RESET_RESEND_MS = 60 * 1000;
let mailTransport; // undefined = not checked yet, null = not configured
function getMailTransport() {
  if (mailTransport !== undefined) return mailTransport;
  mailTransport = null;
  try {
    const nodemailer = require('nodemailer');
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      mailTransport = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    } else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      mailTransport = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      });
    }
  } catch (e) { mailTransport = null; }
  return mailTransport;
}
async function sendResetCodeEmail(to, code) {
  const t = getMailTransport();
  if (!t) return false;
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.GMAIL_USER || process.env.SMTP_USER,
      to,
      subject: 'S_19 TOURNAMENT — Password Reset Code',
      text: `Your S_19 TOURNAMENT password reset code is: ${code}\n\nIt expires in 10 minutes. If you did not ask for this, ignore this email.`,
    });
    return true;
  } catch (e) { console.error('reset email failed:', e.message); return false; }
}
// Show where the code went without exposing the full address.
function maskEmail(e) {
  const [u, d] = String(e || '').split('@');
  if (!u || !d) return e;
  return u.slice(0, 1) + '***@' + d;
}

app.post('/api/forgot-password/request', async (req, res) => {
  try {
    const raw = String((req.body || {}).emailOrPhone || '').trim();
    if (!raw) return res.status(400).json({ ok: false, error: 'Enter your email or phone number' });
    const isEmail = raw.includes('@');
    const identifier = isEmail ? raw.toLowerCase() : normalizePhone(raw);
    if (!identifier) return res.status(400).json({ ok: false, error: 'Enter a valid email or Bangladeshi phone number' });
    const p = isEmail
      ? await db.get('SELECT * FROM profiles WHERE LOWER(email) = LOWER(?)', [raw])
      : await findProfileByPhone(raw);
    if (!p || !p.password_hash) {
      // Don't reveal whether the account exists.
      return res.json({ ok: true, message: 'If an account exists for this email or phone, a reset code has been sent.' });
    }
    const now = Date.now();
    const prev = await db.get('SELECT * FROM password_resets WHERE identifier = ? ORDER BY id DESC', [identifier]);
    if (prev && now - prev.last_sent_at < RESET_RESEND_MS) {
      const wait = Math.ceil((RESET_RESEND_MS - (now - prev.last_sent_at)) / 1000);
      return res.status(429).json({ ok: false, error: `Please wait ${wait} seconds before requesting another code.`, retryAfter: wait });
    }
    await db.run('DELETE FROM password_resets WHERE identifier = ?', [identifier]);
    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const contact = isEmail ? raw.toLowerCase() : canonicalPhone(raw);
    let channel = 'admin';
    let emailed = false;
    if (isEmail) {
      emailed = await sendResetCodeEmail(contact, code);
      if (emailed) channel = 'email';
    } else if (p.email) {
      // No SMS gateway: a phone request sends the code to the account's
      // registered email instead of leaving the player with no code.
      emailed = await sendResetCodeEmail(p.email.toLowerCase(), code);
      if (emailed) channel = 'email';
    }
    await db.run('INSERT INTO password_resets (identifier, contact, channel, code_hash, code_plain, expires_at, attempts_left, last_sent_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [identifier, contact, channel, codeHash, emailed ? '' : code, now + RESET_TTL_MS, 5, now, new Date().toISOString()]);
    return res.json({
      ok: true, channel,
      message: emailed
        ? `Reset code sent to your email (${maskEmail(isEmail ? contact : p.email.toLowerCase())}). It expires in 10 minutes.`
        : 'No SMS available — your reset code is with Support. Ask the admin for the code, then enter it below.',
    });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.post('/api/forgot-password/verify', async (req, res) => {
  try {
    const { emailOrPhone, code } = req.body || {};
    const newPassword = String((req.body || {}).newPassword || '').trim();
    if (!emailOrPhone || !code || !newPassword || newPassword.length < 4) {
      return res.status(400).json({ ok: false, error: 'Code and a 4+ character new password are required' });
    }
    const raw = String(emailOrPhone).trim();
    const id0 = raw.includes('@') ? raw.toLowerCase() : normalizePhone(raw);
    if (!id0) return res.status(400).json({ ok: false, error: 'Enter a valid email or phone number' });
    // The code may have been requested with the account's other identifier
    // (phone vs email) — try both, so a code requested by phone also works
    // when the player types their email here, and vice versa.
    const pPre = raw.includes('@')
      ? await db.get('SELECT * FROM profiles WHERE LOWER(email) = LOWER(?)', [raw])
      : await findProfileByPhone(raw);
    const candidates = [id0];
    if (pPre) {
      const e2 = String(pPre.email || '').toLowerCase();
      if (e2 && !candidates.includes(e2)) candidates.push(e2);
      const ph2 = normalizePhone(pPre.phone);
      if (ph2 && !candidates.includes(ph2)) candidates.push(ph2);
    }
    let row = null;
    for (const c of candidates) {
      row = await db.get('SELECT * FROM password_resets WHERE identifier = ? ORDER BY id DESC', [c]);
      if (row) break;
    }
    if (!row) return res.status(400).json({ ok: false, error: 'No reset code found. Please request a new code.' });
    const now = Date.now();
    if (now > row.expires_at) {
      await db.run('DELETE FROM password_resets WHERE id = ?', [row.id]);
      return res.status(400).json({ ok: false, error: 'This code has expired. Please request a new code.' });
    }
    if (row.attempts_left <= 0) {
      await db.run('DELETE FROM password_resets WHERE id = ?', [row.id]);
      return res.status(400).json({ ok: false, error: 'Too many wrong attempts. Please request a new code.' });
    }
    const hash = crypto.createHash('sha256').update(String(code).trim()).digest('hex');
    if (hash !== row.code_hash) {
      const left = row.attempts_left - 1;
      if (left <= 0) {
        await db.run('DELETE FROM password_resets WHERE id = ?', [row.id]);
        return res.status(400).json({ ok: false, error: 'Wrong code. No attempts left — please request a new code.' });
      }
      await db.run('UPDATE password_resets SET attempts_left = ? WHERE id = ?', [left, row.id]);
      return res.status(400).json({ ok: false, error: `Wrong code. ${left} attempt${left === 1 ? '' : 's'} left.`, attemptsLeft: left });
    }
    const p = row.identifier.includes('@')
      ? await db.get('SELECT * FROM profiles WHERE LOWER(email) = LOWER(?)', [row.identifier])
      : await findProfileByPhone(row.identifier);
    if (!p) {
      await db.run('DELETE FROM password_resets WHERE id = ?', [row.id]);
      return res.status(400).json({ ok: false, error: 'No account found. Please request a new code.' });
    }
    const { salt, hash: pwHash } = hashPassword(String(newPassword));
    await db.run('UPDATE profiles SET password_hash = ?, password_salt = ? WHERE id = ?', [pwHash, salt, p.id]);
    await db.run('DELETE FROM sessions WHERE profile_id = ?', [p.id]);
    await db.run('DELETE FROM password_resets WHERE id = ?', [row.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// Admin-only: pending reset requests (code shown only when email is not
// configured, so Support can relay it to the player).
app.get('/api/admin/reset-requests', adminAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM password_resets WHERE expires_at <= ?', [Date.now()]);
    const rows = await db.all('SELECT * FROM password_resets ORDER BY created_at DESC');
    res.json({
      ok: true,
      requests: rows.map((r) => ({
        id: r.id, contact: r.contact, channel: r.channel,
        code: r.code_plain || '', attemptsLeft: r.attempts_left,
        expiresAt: r.expires_at, createdAt: r.created_at,
      })),
    });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});
app.delete('/api/admin/reset-requests/:id', adminAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM password_resets WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// Admin-only: pending payment requests (deposits + withdrawals) — the
// list the Admin Panel approves/rejects. Without this, a deposit sat
// pending forever and the admin never saw it.
app.get('/api/admin/transactions', adminAuth, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT w.*, p.username, p.account_id FROM wallet_tx w
       LEFT JOIN profiles p ON p.id = w.profile_id
       WHERE w.status = 'pending' AND w.type IN ('deposit', 'withdraw')
       ORDER BY w.created_at DESC, w.id DESC`);
    res.json({
      ok: true,
      requests: rows.map((r) => ({
        id: r.id, type: r.type, amount: r.amount, method: r.method || '',
        accountNumber: r.account_number || '', trxId: r.trx_id || '',
        note: r.note || '', createdAt: r.created_at,
        username: r.username || '', accountId: r.account_id ?? null,
      })),
    });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// ---- app settings ----
// Public display config — what every player sees (app name, notice rules,
// banner, spin on/off, withdraw limits). The admin-only GET/PUT below
// manage the same values; ordinary users can never read or change the
// admin settings endpoint itself.
app.get('/api/app-config', async (req, res) => {
  try { res.json({ ok: true, config: await getAppSettings() }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});
app.get('/api/settings', adminAuth, async (req, res) => {
  try { res.json({ ok: true, settings: await getAppSettings() }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});
app.put('/api/settings', adminAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const updates = {};
    if (b.appName !== undefined) {
      const v = String(b.appName).trim();
      if (!v || v.length > 60) return res.status(400).json({ ok: false, error: 'App name must be 1–60 characters' });
      updates.app_name = v;
    }
    if (b.noticeRules !== undefined) {
      const v = String(b.noticeRules);
      if (v.length > 5000) return res.status(400).json({ ok: false, error: 'Notice is too long (max 5000 characters)' });
      updates.notice_rules = v;
    }
    if (b.bannerTitle !== undefined) {
      const v = String(b.bannerTitle).trim();
      if (v.length > 120) return res.status(400).json({ ok: false, error: 'Banner title is too long (max 120 characters)' });
      updates.banner_title = v;
    }
    if (b.bannerSubtitle !== undefined) {
      const v = String(b.bannerSubtitle).trim();
      if (v.length > 200) return res.status(400).json({ ok: false, error: 'Banner subtitle is too long (max 200 characters)' });
      updates.banner_subtitle = v;
    }
    if (b.withdrawMin !== undefined) {
      const n = Number(b.withdrawMin);
      if (!Number.isInteger(n) || n < 0 || n > 100000) return res.status(400).json({ ok: false, error: 'Minimum withdrawal must be 0–100000' });
      updates.withdraw_min = String(n);
    }
    if (b.withdrawStart !== undefined || b.withdrawEnd !== undefined) {
      const cur = await getAppSettings();
      const st = b.withdrawStart !== undefined ? Number(b.withdrawStart) : cur.withdrawStart;
      const en = b.withdrawEnd !== undefined ? Number(b.withdrawEnd) : cur.withdrawEnd;
      if (!Number.isInteger(st) || st < 0 || st > 1439 || !Number.isInteger(en) || en < 0 || en > 1439 || st >= en) {
        return res.status(400).json({ ok: false, error: 'Withdrawal window must be within a day, start before end' });
      }
      updates.withdraw_start = String(st);
      updates.withdraw_end = String(en);
    }
    if (b.spinEnabled !== undefined) updates.spin_enabled = b.spinEnabled ? '1' : '0';
    for (const [k, v] of Object.entries(updates)) {
      await db.run('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, v]);
    }
    res.json({ ok: true, settings: await getAppSettings() });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// ---- players (Admin Panel: list + Ban/Unban) ----
app.get('/api/admin/players', adminAuth, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM profiles ORDER BY id ASC');
    const players = [];
    for (const p of rows) {
      const w = await walletFor(p.id);
      players.push({
        id: p.id, username: p.username, accountId: p.account_id,
        phone: p.phone || '', email: p.email || '',
        banned: !!p.banned, isAdmin: p.email === OWNER_EMAIL,
        depositBalance: w.depositBalance, winningBalance: w.winningBalance,
      });
    }
    res.json({ ok: true, players });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});
app.post('/api/admin/players/:id/ban', adminAuth, async (req, res) => {
  try {
    const p = await db.get('SELECT * FROM profiles WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ ok: false, error: 'Player not found' });
    if (p.email === OWNER_EMAIL) return res.status(400).json({ ok: false, error: 'Cannot ban the owner' });
    const banned = !!(req.body || {}).banned;
    await db.run('UPDATE profiles SET banned = ? WHERE id = ?', [banned ? 1 : 0, p.id]);
    res.json({ ok: true, banned });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

function safeProfile(p) {
  if (!p) return null;
  return {
    id: p.id, accountId: p.account_id, username: p.username, email: p.email,
    phone: p.phone, ign: p.ign, uid: p.uid, avatar: p.avatar || '',
    isAdmin: p.email === OWNER_EMAIL,
    spunToday: p.last_spin_date === dhakaDateStr(),
    passes: {
      br: p.br_passes || 0, cs: p.cs_passes || 0,
      lw: p.lw_passes || 0, all: p.all_passes || 0,
    },
  };
}

// A booking made with a free pass: if it is later cancelled / rejected /
// the match is cancelled or deleted, the pass goes back to the player.
async function returnPass(profileId, usedPass) {
  const col = { br: 'br_passes', cs: 'cs_passes', lw: 'lw_passes', all: 'all_passes' }[usedPass];
  if (!col) return;
  await db.run(`UPDATE profiles SET ${col} = ${col} + 1 WHERE id = ?`, [profileId]);
}

app.get('/api/me', auth, async (req, res) => {
  const w = await walletFor(req.profileId);
  res.json({ ok: true, profile: safeProfile(req.profile), wallet: w });
});

app.post('/api/profile', auth, async (req, res) => {
  const { ign, uid, username } = req.body || {};
  if (uid && !/^\d{5,12}$/.test(String(uid))) {
    return res.status(400).json({ ok: false, error: 'Free Fire UID must be 5–12 digits' });
  }
  await db.run('UPDATE profiles SET ign = ?, uid = ?, username = ? WHERE id = ?',
    [ign || req.profile.ign, uid ?? req.profile.uid, username || req.profile.username, req.profileId]);
  const p = await db.get('SELECT * FROM profiles WHERE id = ?', [req.profileId]);
  res.json({ ok: true, profile: safeProfile(p) });
});

// Change profile avatar — client sends a downscaled JPEG data URL (<= 200 KB).
app.post('/api/profile/avatar', auth, async (req, res) => {
  const { avatar } = req.body || {};
  if (typeof avatar !== 'string' || !avatar.startsWith('data:image/') || avatar.length > 200000) {
    return res.status(400).json({ ok: false, error: 'Invalid avatar image' });
  }
  await db.run('UPDATE profiles SET avatar = ? WHERE id = ?', [avatar, req.profileId]);
  const p = await db.get('SELECT * FROM profiles WHERE id = ?', [req.profileId]);
  res.json({ ok: true, profile: safeProfile(p) });
});

// ---- tournaments ----
app.get('/api/tournaments', async (req, res) => {
  res.json({ ok: true, tournaments: await loadTournaments(false) });
});
app.get('/api/tournaments/admin', adminAuth, async (req, res) => {
  res.json({ ok: true, tournaments: await loadTournaments(true) });
});

app.post('/api/tournaments', adminAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const def = defaultSlots(b.category, b.subcategory);
    if (def == null) return res.status(400).json({ ok: false, error: 'Unknown category/subcategory' });
    const slots = b.totalSlots == null ? def : Number(b.totalSlots);
    if (!validSlots(slots)) return res.status(400).json({ ok: false, error: 'Total slots must be 2–100' });
    if (!b.title || String(b.title).length > 160) {
      return res.status(400).json({ ok: false, error: 'Title: must be 160 characters or fewer' });
    }
    const id = await db.insert(
      'INSERT INTO tournaments (title, category, subcategory, mode, match_type, map, pov, match_date, match_time, total_slots, entry_fee, prize_pool, prize1, prize2, prize3, prize4, prize5, per_kill_prize, per_kill_points, room_id, room_password, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [b.title, b.category, b.subcategory, b.mode || 'solo', b.matchType || 'battle_royale',
       b.map || 'Bermuda', b.pov || 'TPP', b.matchDate, b.matchTime, slots,
       b.entryFee || 0, b.prizePool || 0,
       Number(b.prize1) || 0, Number(b.prize2) || 0, Number(b.prize3) || 0,
       Number(b.prize4) || 0, Number(b.prize5) || 0,
       b.perKillPrize || 0, b.perKillPoints || 0,
       b.roomId || '', b.roomPassword || '', 'upcoming']);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.put('/api/tournaments/:id', adminAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const t = await db.get('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
    if (!t) return res.status(404).json({ ok: false, error: 'Match not found' });
    // Admin-set slots (2–100); never forced back to the category default.
    // Reducing below the already-booked count would break bookings, so reject it.
    let slots = t.total_slots;
    if (b.totalSlots != null) {
      slots = Number(b.totalSlots);
      if (!validSlots(slots)) return res.status(400).json({ ok: false, error: 'Total slots must be 2–100' });
      const booked = await db.get("SELECT COUNT(*) AS n FROM bookings WHERE tournament_id = ? AND status IN ('pending','approved')", [t.id]);
      const bookedN = booked ? booked.n : 0;
      if (slots < bookedN) return res.status(400).json({ ok: false, error: `Cannot reduce slots below ${bookedN} booked slot(s)` });
    }
    await db.run(
      'UPDATE tournaments SET title=?, category=?, subcategory=?, mode=?, match_type=?, map=?, pov=?, match_date=?, match_time=?, total_slots=?, entry_fee=?, prize_pool=?, prize1=?, prize2=?, prize3=?, prize4=?, prize5=?, per_kill_prize=?, per_kill_points=?, room_id=?, room_password=? WHERE id=?',
      [b.title ?? t.title, b.category ?? t.category, b.subcategory ?? t.subcategory,
       b.mode ?? t.mode, b.matchType ?? t.match_type, b.map ?? t.map, b.pov ?? t.pov,
       b.matchDate ?? t.match_date, b.matchTime ?? t.match_time, slots,
       b.entryFee ?? t.entry_fee, b.prizePool ?? t.prize_pool,
       b.prize1 ?? t.prize1, b.prize2 ?? t.prize2, b.prize3 ?? t.prize3,
       b.prize4 ?? t.prize4, b.prize5 ?? t.prize5,
       b.perKillPrize ?? t.per_kill_prize, b.perKillPoints ?? t.per_kill_points,
       b.roomId ?? t.room_id, b.roomPassword ?? t.room_password, t.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.delete('/api/tournaments/:id', adminAuth, async (req, res) => {
  const t = await db.get('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
  if (!t) return res.status(404).json({ ok: false, error: 'Match not found' });
  const active = await db.all("SELECT * FROM bookings WHERE tournament_id = ? AND status = 'approved'", [t.id]);
  for (const bk of active) {
    const fee = t.entry_fee;
    if (fee > 0) {
      await db.run("INSERT INTO wallet_tx (profile_id, type, amount, note, status, created_at) VALUES (?,?,?,?, 'approved', ?)",
        [bk.profile_id, 'refund', fee, 'Refund: match deleted', new Date().toISOString()]);
    }
    if (bk.used_pass) await returnPass(bk.profile_id, bk.used_pass);
  }
  await db.run('DELETE FROM bookings WHERE tournament_id = ?', [t.id]);
  await db.run('DELETE FROM results WHERE tournament_id = ?', [t.id]);
  await db.run('DELETE FROM tournaments WHERE id = ?', [t.id]);
  res.json({ ok: true });
});

app.post('/api/tournaments/:id/status', adminAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!['upcoming', 'live', 'closed', 'finished'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Invalid status' });
  }
  await db.run('UPDATE tournaments SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ ok: true });
});

app.post('/api/tournaments/:id/cancel', adminAuth, async (req, res) => {
  const t = await db.get('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
  if (!t) return res.status(404).json({ ok: false, error: 'Match not found' });
  const active = await db.all("SELECT * FROM bookings WHERE tournament_id = ? AND status IN ('pending','approved')", [t.id]);
  for (const bk of active) {
    if (t.entry_fee > 0) {
      await db.run("INSERT INTO wallet_tx (profile_id, type, amount, note, status, created_at) VALUES (?,?,?,?, 'approved', ?)",
        [bk.profile_id, 'refund', t.entry_fee, 'Refund: match cancelled', new Date().toISOString()]);
    }
    if (bk.used_pass) await returnPass(bk.profile_id, bk.used_pass);
    await db.run("UPDATE bookings SET status = 'rejected' WHERE id = ?", [bk.id]);
  }
  await db.run("UPDATE tournaments SET status = 'cancelled' WHERE id = ?", [t.id]);
  res.json({ ok: true });
});

// ---- bookings (join a match) ----
app.post('/api/tournaments/:id/book', auth, async (req, res) => {
  try {
    if (req.profile.banned) return res.status(403).json({ ok: false, error: 'This account is banned' });
    const t = await db.get('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
    if (!t) return res.status(404).json({ ok: false, error: 'Match not found' });
    if (t.status !== 'upcoming') return res.status(400).json({ ok: false, error: 'This match is not open for joining' });
    if (matchStarted(t)) return res.status(400).json({ ok: false, error: 'Match already started' });
    const { slotNumber, playerName, squadNames, usePass } = req.body || {};
    const slot = Number(slotNumber);
    if (!slot || slot < 1 || slot > t.total_slots) {
      return res.status(400).json({ ok: false, error: 'Pick a free slot number' });
    }
    // Squad names (optional): squad leader lists up to 3 teammates.
    let squad = [];
    if (squadNames !== undefined && squadNames !== null) {
      if (!Array.isArray(squadNames)) {
        return res.status(400).json({ ok: false, error: 'Squad names must be a list' });
      }
      squad = squadNames.map((n) => String(n).trim()).filter(Boolean);
      if (squad.length > 3) {
        return res.status(400).json({ ok: false, error: 'A squad has at most 3 teammates besides you' });
      }
      if (squad.some((n) => n.length > 40)) {
        return res.status(400).json({ ok: false, error: 'Squad names must be 40 characters or fewer' });
      }
    }
    if (!req.profile.uid) {
      return res.status(400).json({ ok: false, error: 'Add your Free Fire UID in Edit Profile first' });
    }
    if (playerName && playerName !== req.profile.ign && playerName !== req.profile.username) {
      return res.status(400).json({ ok: false, error: 'Join only with your own registered in-game name' });
    }
    const taken = await db.get(
      "SELECT id FROM bookings WHERE tournament_id = ? AND slot_number = ? AND status IN ('pending','approved')",
      [t.id, slot]);
    if (taken) return res.status(400).json({ ok: false, error: 'That slot is already taken' });
    const mine = await db.get(
      "SELECT id FROM bookings WHERE tournament_id = ? AND profile_id = ? AND status IN ('pending','approved')",
      [t.id, req.profileId]);
    if (mine) return res.status(400).json({ ok: false, error: 'You already booked a slot in this match' });
    // Free pass (won on the Daily Spin wheel): the category pass first,
    // otherwise an All pass. Entry fee becomes ৳0 and the pass is spent.
    let usedPass = '';
    if (usePass) {
      const p = await db.get('SELECT * FROM profiles WHERE id = ?', [req.profileId]);
      const catCol = { br: 'br_passes', cs: 'cs_passes', lw: 'lw_passes' }[t.category];
      if (catCol && (p[catCol] || 0) > 0) {
        usedPass = t.category;
        await db.run(`UPDATE profiles SET ${catCol} = ${catCol} - 1 WHERE id = ?`, [req.profileId]);
      } else if ((p.all_passes || 0) > 0) {
        usedPass = 'all';
        await db.run('UPDATE profiles SET all_passes = all_passes - 1 WHERE id = ?', [req.profileId]);
      } else {
        return res.status(400).json({ ok: false, error: 'No free pass for this match — spin the Daily Spin wheel to win one' });
      }
    }
    const w = await walletFor(req.profileId);
    if (!usedPass && t.entry_fee > w.depositBalance) {
      return res.status(400).json({ ok: false, error: 'Not enough Deposit Balance — add money first' });
    }
    if (!usedPass && t.entry_fee > 0) {
      await db.run("INSERT INTO wallet_tx (profile_id, type, amount, note, status, created_at) VALUES (?,?,?,?,'approved',?)",
        [req.profileId, 'entry', -t.entry_fee, 'Entry fee: ' + t.title, new Date().toISOString()]);
    }
    const id = await db.insert(
      "INSERT INTO bookings (tournament_id, profile_id, slot_number, player_name, squad_names, used_pass, status, created_at) VALUES (?,?,?,?,?,?, 'pending',?)",
      [t.id, req.profileId, slot, playerName || req.profile.ign, JSON.stringify(squad), usedPass, new Date().toISOString()]);
    res.json({ ok: true, id, usedPass });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.post('/api/bookings/:id/cancel', auth, async (req, res) => {
  const bk = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  if (!bk || bk.profile_id !== req.profileId) return res.status(404).json({ ok: false, error: 'Booking not found' });
  if (bk.status === 'cancelled') return res.json({ ok: true });
  const t = await db.get('SELECT * FROM tournaments WHERE id = ?', [bk.tournament_id]);
  if (t && t.entry_fee > 0 && bk.status === 'approved') {
    await db.run("INSERT INTO wallet_tx (profile_id, type, amount, note, status, created_at) VALUES (?,?,?,?, 'approved', ?)",
      [req.profileId, 'refund', t.entry_fee, 'Refund: booking cancelled', new Date().toISOString()]);
  }
  // A booking made with a free pass gives the pass back on cancel.
  if (bk.used_pass) await returnPass(req.profileId, bk.used_pass);
  await db.run("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [bk.id]);
  res.json({ ok: true });
});

app.post('/api/bookings/:id/review', adminAuth, async (req, res) => {
  const bk = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  if (!bk) return res.status(404).json({ ok: false, error: 'Booking not found' });
  const approve = !!req.body.approve;
  if (!approve && bk.status === 'approved') {
    const t = await db.get('SELECT * FROM tournaments WHERE id = ?', [bk.tournament_id]);
    if (t && t.entry_fee > 0) {
      await db.run("INSERT INTO wallet_tx (profile_id, type, amount, note, status, created_at) VALUES (?,?,?,?, 'approved', ?)",
        [bk.profile_id, 'refund', t.entry_fee, 'Refund: join rejected', new Date().toISOString()]);
    }
    if (bk.used_pass) await returnPass(bk.profile_id, bk.used_pass);
  }
  await db.run('UPDATE bookings SET status = ? WHERE id = ?', [approve ? 'approved' : 'rejected', bk.id]);
  res.json({ ok: true });
});

// ---- wallet: deposit / withdraw ----
function validTrx(trx) { return typeof trx === 'string' && /^[A-Za-z0-9]{8,12}$/.test(trx); }

app.post('/api/deposit', auth, async (req, res) => {
  try {
    const { amount, method, senderNumber, trxId } = req.body || {};
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt < DEPOSIT_MIN || amt > DEPOSIT_MAX) {
      return res.status(400).json({ ok: false, error: `Deposit must be ৳${DEPOSIT_MIN} – ৳${DEPOSIT_MAX}` });
    }
    if (!['bkash', 'nagad', 'rocket'].includes(method)) return res.status(400).json({ ok: false, error: 'Pick bKash, Nagad or Rocket' });
    // The owner must have set the number for this method (Nagad/Rocket not added yet).
    const numRow = await db.get('SELECT value FROM settings WHERE key = ?', [method]);
    if (!numRow || !String(numRow.value || '').trim()) {
      const label = method === 'bkash' ? 'bKash' : method === 'nagad' ? 'Nagad' : 'Rocket';
      return res.status(400).json({ ok: false, error: `${label} number not added yet — send via bKash for now` });
    }
    if (!validTrx(trxId)) {
      return res.status(400).json({ ok: false, error: 'Wrong TrxID — it must be 8–12 letters or digits' });
    }
    const dup = await db.get('SELECT id FROM wallet_tx WHERE UPPER(trx_id) = ? AND type = ?', [trxId.toUpperCase(), 'deposit']);
    if (dup) return res.status(400).json({ ok: false, error: 'This TrxID was already used' });
    const id = await db.insert(
      "INSERT INTO wallet_tx (profile_id, type, amount, method, account_number, trx_id, note, status, created_at) VALUES (?,?,?,?,?,?,?,'pending',?)",
      [req.profileId, 'deposit', amt, method, senderNumber || '', trxId.toUpperCase(), 'Deposit request', new Date().toISOString()]);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const { amount, method, accountNumber } = req.body || {};
    const amt = Number(amount);
    const s = await getAppSettings();
    if (!amt || amt < s.withdrawMin) {
      return res.status(400).json({ ok: false, error: 'Minimum withdrawal is ৳' + s.withdrawMin });
    }
    const now = dhakaNow();
    const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (mins < s.withdrawStart || mins > s.withdrawEnd) {
      return res.status(400).json({ ok: false, error: `Withdrawals are open ${fmtClock(s.withdrawStart)} – ${fmtClock(s.withdrawEnd)} (Dhaka time)` });
    }
    const w = await walletFor(req.profileId);
    if (amt > w.winningBalance) {
      return res.status(400).json({ ok: false, error: 'Only Winning Balance can be withdrawn' });
    }
    const id = await db.insert(
      "INSERT INTO wallet_tx (profile_id, type, amount, method, account_number, trx_id, note, status, created_at) VALUES (?,?,?,?,?,?,'pending',?)",
      [req.profileId, 'withdraw', -amt, method || 'bkash', accountNumber || '', '', 'Withdraw request', new Date().toISOString()]);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// ---- transfer: Winning Balance -> Deposit Balance (to pay entry fees) ----
// One-way only: Deposit can never move back to Winning (it cannot be withdrawn).
app.post('/api/transfer-balance', auth, async (req, res) => {
  try {
    const amt = Number((req.body || {}).amount);
    if (!Number.isInteger(amt) || amt <= 0) {
      return res.status(400).json({ ok: false, error: 'Enter an amount to transfer' });
    }
    const w = await walletFor(req.profileId);
    if (amt > w.winningBalance) {
      return res.status(400).json({ ok: false, error: 'Not enough Winning Balance to transfer' });
    }
    const now = new Date().toISOString();
    await db.run("INSERT INTO wallet_tx (profile_id, type, amount, note, status, created_at) VALUES (?, 'transfer_out', ?, 'Transfer: Winning → Deposit', 'approved', ?)",
      [req.profileId, -amt, now]);
    await db.run("INSERT INTO wallet_tx (profile_id, type, amount, note, status, created_at) VALUES (?, 'transfer_in', ?, 'Transfer: Winning → Deposit', 'approved', ?)",
      [req.profileId, amt, now]);
    const after = await walletFor(req.profileId);
    res.json({ ok: true, depositBalance: after.depositBalance, winningBalance: after.winningBalance });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.post('/api/transactions/:id/review', adminAuth, async (req, res) => {
  const tx = await db.get('SELECT * FROM wallet_tx WHERE id = ?', [req.params.id]);
  if (!tx) return res.status(404).json({ ok: false, error: 'Request not found' });
  if (tx.status !== 'pending') return res.status(400).json({ ok: false, error: 'Already reviewed' });
  await db.run('UPDATE wallet_tx SET status = ? WHERE id = ?', [req.body.approve ? 'approved' : 'rejected', tx.id]);
  res.json({ ok: true });
});

// ---- results & leaderboard ----
app.post('/api/results', adminAuth, async (req, res) => {
  try {
    const { tournamentId, profileId, playerName, placement, kills } = req.body || {};
    const t = await db.get('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!t) return res.status(404).json({ ok: false, error: 'Match not found' });
    const place = Number(placement) || 0;
    const k = Number(kills) || 0;
    let prize = req.body.prize != null ? Number(req.body.prize) : 0;
    if (req.body.prize == null) {
      // Admin-set rank prize wins; BR Solo/Duo falls back to the 90/70/40/30/20 split.
      const rankPrize = [0, t.prize1, t.prize2, t.prize3, t.prize4, t.prize5][place] || 0;
      if (rankPrize > 0) prize = rankPrize + k * t.per_kill_prize;
      else if (t.category === 'br' && (t.subcategory === 'Solo' || t.subcategory === 'Duo')) {
        prize = (BR_SPLIT[place] || 0) + k * t.per_kill_prize;
      }
    }
    const placePoints = place === 1 ? 10 : place === 2 ? 8 : place === 3 ? 6 : place === 4 ? 4 : place === 5 ? 2 : 0;
    const points = placePoints + k * t.per_kill_points;
    const existing = await db.get('SELECT * FROM results WHERE tournament_id = ? AND profile_id = ?', [tournamentId, profileId]);
    if (existing) {
      await db.run('UPDATE results SET placement=?, kills=?, points=?, prize=? WHERE id=?',
        [place, k, points, prize, existing.id]);
      if (prize > 0 && !existing.prize_paid && profileId) {
        await db.run("INSERT INTO wallet_tx (profile_id, type, amount, note, status, created_at) VALUES (?,?,?,?,'approved',?)",
          [profileId, 'prize', prize, 'Prize: ' + t.title, new Date().toISOString()]);
        await db.run('UPDATE results SET prize_paid = 1 WHERE id = ?', [existing.id]);
      }
      return res.json({ ok: true, id: existing.id });
    }
    const id = await db.insert(
      'INSERT INTO results (tournament_id, profile_id, player_name, placement, kills, points, prize, prize_paid, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [tournamentId, profileId || 0, playerName || '', place, k, points, prize, 0, new Date().toISOString()]);
    if (prize > 0 && profileId) {
      await db.run("INSERT INTO wallet_tx (profile_id, type, amount, note, status, created_at) VALUES (?,?,?,?,'approved',?)",
        [profileId, 'prize', prize, 'Prize: ' + t.title, new Date().toISOString()]);
      await db.run('UPDATE results SET prize_paid = 1 WHERE id = ?', [id]);
    }
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.delete('/api/results/:id', adminAuth, async (req, res) => {
  const r = await db.get('SELECT * FROM results WHERE id = ?', [req.params.id]);
  if (!r) return res.status(404).json({ ok: false, error: 'Result not found' });
  if (r.prize_paid) return res.status(400).json({ ok: false, error: 'Prize already paid — edit it instead' });
  await db.run('DELETE FROM results WHERE id = ?', [r.id]);
  res.json({ ok: true });
});

app.get('/api/leaderboard', async (req, res) => {
  const rows = await db.all(
    `SELECT r.profile_id, r.player_name,
       COUNT(*) AS matches, SUM(CASE WHEN r.placement = 1 THEN 1 ELSE 0 END) AS wins,
       SUM(r.kills) AS kills, SUM(r.points) AS points
     FROM results r GROUP BY r.profile_id, r.player_name ORDER BY points DESC, wins DESC`);
  res.json({ ok: true, standings: rows });
});

// ---- daily spin wheel: win a free match pass (BR / CS / LW / All) ----
// Wheel segments, clockwise from the top (matches the conic-gradient):
// CS, No Prize, LW, No Prize, All, No Prize, BR, No Prize.
const SPIN_SEGMENTS = ['cs', 'none', 'lw', 'none', 'all', 'none', 'br', 'none'];
const SPIN_PRIZE_LABEL = { br: 'BR Match', cs: 'CS Match', lw: 'LW Match', all: 'All Match', none: 'No Prize' };
// Weighted draw: No Prize 50%, BR / CS / LW / All 12.5% each.
function drawSpinPrize() {
  const r = Math.random();
  if (r < 0.5) return 'none';
  if (r < 0.625) return 'br';
  if (r < 0.75) return 'cs';
  if (r < 0.875) return 'lw';
  return 'all';
}
function nextSpinAtMs() {
  const d = dhakaNow();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, -6, 0, 0);
}
function spinState(p) {
  const spun = p.last_spin_date === dhakaDateStr();
  return getAppSettings().then((s) => ({
    ok: true, canSpin: !spun && s.spinEnabled, spunToday: spun,
    spinEnabled: s.spinEnabled,
    nextSpinAt: nextSpinAtMs(),
    passes: { br: p.br_passes || 0, cs: p.cs_passes || 0, lw: p.lw_passes || 0, all: p.all_passes || 0 },
  }));
}
app.get('/api/daily-spin', auth, async (req, res) => {
  res.json(await spinState(req.profile));
});
app.post('/api/daily-spin', auth, async (req, res) => {
  const s = await getAppSettings();
  if (!s.spinEnabled) {
    return res.status(400).json({ ok: false, error: 'Daily Spin is currently disabled' });
  }
  if (req.profile.last_spin_date === dhakaDateStr()) {
    return res.status(400).json({ ok: false, error: 'You already spun today — come back tomorrow' });
  }
  const prize = drawSpinPrize();
  const segIdx = prize === 'none'
    ? [1, 3, 5, 7][Math.floor(Math.random() * 4)]
    : SPIN_SEGMENTS.indexOf(prize);
  const col = { br: 'br_passes', cs: 'cs_passes', lw: 'lw_passes', all: 'all_passes' }[prize];
  const now = Date.now();
  if (col) await db.run(`UPDATE profiles SET ${col} = ${col} + 1 WHERE id = ?`, [req.profileId]);
  await db.run('UPDATE profiles SET last_spin_date = ?, last_spin_at = ? WHERE id = ?',
    [dhakaDateStr(), now, req.profileId]);
  const p = await db.get('SELECT * FROM profiles WHERE id = ?', [req.profileId]);
  res.json({ ...(await spinState(p)), segment: segIdx, prize, prizeLabel: SPIN_PRIZE_LABEL[prize] });
});

// ---- payment info ----
app.get('/api/payment-info', async (req, res) => {
  const rows = await db.all('SELECT key, value FROM settings');
  const info = { bkashNumber: '', nagadNumber: '', rocketNumber: '', groupLink: '' };
  for (const r of rows) {
    if (r.key === 'bkash') info.bkashNumber = r.value;
    if (r.key === 'nagad') info.nagadNumber = r.value;
    if (r.key === 'rocket') info.rocketNumber = r.value;
    if (r.key === 'groupLink') info.groupLink = r.value;
  }
  res.json({ ok: true, ...info });
});
app.put('/api/payment-info', adminAuth, async (req, res) => {
  const b = req.body || {};
  for (const [k, v] of Object.entries({ bkash: b.bkashNumber, nagad: b.nagadNumber, rocket: b.rocketNumber, groupLink: b.groupLink })) {
    // Empty / missing field = leave the saved number alone, never wipe it.
    // Only a non-empty value changes what's stored.
    if (typeof v === 'string' && v.trim() !== '') {
      await db.run('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, v.trim()]);
    }
  }
  res.json({ ok: true });
});

// ---- SPA fallback (everything else serves the app) ----
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Unknown API' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

(async () => {
  await db.init();
  await seed();
  app.listen(PORT, () => console.log(`S_19 Tournament live on port ${PORT} (db: ${db.getEngine()})`));
})();
