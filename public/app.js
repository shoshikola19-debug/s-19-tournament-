// S_19 TOURNAMENT — client app (single-page, black + red, English UI)
'use strict';
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const app = $('#app');
const modalRoot = $('#modal-root');
let lang = localStorage.getItem('s19lang') || 'en';
let token = localStorage.getItem('s19token') || '';
let profile = null, wallet = null, tournaments = [], adminTournaments = [];
let view = 'landing', category = 'br', subcategory = 'Solo', myFilter = 'all';
let selectedMatch = null, selectedSlot = 0;

const L = {
  en: { hero: 'Daily Free Fire tournaments — BR, CS and Lone Wolf. Book your slot, play the custom room, and win real Taka prizes straight to your wallet.',
    download: 'DOWNLOAD FOR ANDROID', open: 'OPEN APP', how: 'HOW TO GET STARTED', why: 'WHY PLAY HERE',
    s1t: 'Download the App', s1: 'Tap "Download For Android". No Play Store and no big file — the app installs straight from your browser in a few seconds.',
    s2t: 'Tap "Install"', s2: 'When your browser shows the install box for S_19 Tournament, tap "Install" to add the app.',
    s3t: 'Allow Install Permission', s3: 'If your phone asks for permission, tap Allow so the S_19 Tournament icon can be placed on your home screen.',
    s4t: 'Install & Register', s4: 'Open S_19 Tournament from your home screen — it opens full-screen like a normal app. Create your account with a username, email, phone number and password, add your Free Fire in-game name and UID — and you are ready to play.',
    f1: 'Customer Support 24/7', f2: 'Daily Tournaments', f3: 'Play to Earn',
    faqT: 'FREQUENTLY ASKED QUESTIONS',
    faq: [['How do I join a match?', 'Register, add money to your wallet, pick a match, book a free slot and join with your exact in-game name.'],
      ['When do I get the room ID and password?', 'Room ID and password appear in Room Details 5 minutes before the match starts.'],
      ['How do I get my winnings?', 'Winnings go to your Winning Balance. Withdrawals (minimum ৳100) are open 10:00 AM – 9:30 PM Dhaka time.'],
      ['Can I withdraw my deposit money?', 'No — only Winning Balance can be withdrawn. Deposit Balance is only for entry fees.'],
      ['What if a match is cancelled?', 'You get a full refund of your entry fee.']],
    about: 'About', privacy: 'Privacy Policy', terms: 'Terms and Conditions', refund: 'Refund Policy' },
  bn: { hero: 'প্রতিদিনের Free Fire টুর্নামেন্ট — BR, CS আর Lone Wolf। স্লট বুক করো, কাস্টম রুমে খেলো, আর আসল টাকা প্রাইজ জেতো সরাসরি তোমার ওয়ালেটে।',
    download: 'অ্যান্ড্রয়েডের জন্য ডাউনলোড', open: 'অ্যাপ খুলুন', how: 'কীভাবে শুরু করবেন', why: 'কেন এখানে খেলবেন',
    s1t: 'অ্যাপটি ডাউনলোড করুন', s1: '"Download For Android" চাপুন। প্লে স্টোর লাগবে না, বড় ফাইলও না — ব্রাউজার থেকেই কয়েক সেকেন্ডে ইনস্টল হবে।',
    s2t: '"Install" চাপুন', s2: 'ব্রাউজার S_19 Tournament-এর ইনস্টল বক্স দেখালে "Install" চাপুন।',
    s3t: 'ইনস্টল অনুমতি দিন', s3: 'ফোন অনুমতি চাইলে Allow চাপুন, যাতে হোম স্ক্রিনে আইকন বসে।',
    s4t: 'ইনস্টল ও রেজিস্টার', s4: 'হোম স্ক্রিন থেকে S_19 Tournament খুলুন — আসল অ্যাপের মতো ফুল স্ক্রিনে খুলবে। ইউজারনেম, ইমেইল, ফোন নম্বর আর পাসওয়ার্ড দিয়ে অ্যাকাউন্ট বানান, গেমের নাম আর UID দিন — খেলা শুরু।',
    f1: 'কাস্টমার সাপোর্ট ২৪/৭', f2: 'প্রতিদিন টুর্নামেন্ট', f3: 'খেলে টাকা আয়',
    faqT: 'সচরাচর জিজ্ঞাসা',
    faq: [['ম্যাচে জয়েন করবো কীভাবে?', 'রেজিস্টার করুন, ওয়ালেটে টাকা জমা দিন, ম্যাচ বেছে ফ্রি স্লট বুক করুন আর গেমের আসল নাম দিয়ে জয়েন করুন।'],
      ['রুম আইডি আর পাসওয়ার্ড কখন পাবো?', 'ম্যাচ শুরুর ৫ মিনিট আগে Room Details-এ দেখাবে।'],
      ['জেতা টাকা কীভাবে পাবো?', 'জেতা টাকা Winning Balance-এ যাবে। তোলা যাবে (সর্বনিম্ন ১০০ টাকা) সকাল ১০টা – রাত ৯:৩০ (ঢাকা সময়)।'],
      ['জমা দেওয়া টাকা কি তোলা যাবে?', 'না — শুধু Winning Balance তোলা যাবে। Deposit Balance শুধু এন্ট্রি ফি-র জন্য।'],
      ['ম্যাচ বাতিল হলে কী হবে?', 'এন্ট্রি ফি পুরোটা ফেরত পাবেন।']],
    about: 'আমাদের সম্পর্কে', privacy: 'প্রাইভেসি পলিসি', terms: 'শর্তাবলি', refund: 'রিফান্ড নীতি' },
};
const t = (k) => (L[lang] && L[lang][k]) || L.en[k] || k;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function toast(msg) {
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3200);
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDate(d) { return d; }
function matchStartMs(m) {
  const [y, mo, da] = m.matchDate.split('-').map(Number);
  const [h, mi] = m.matchTime.split(':').map(Number);
  return Date.UTC(y, mo - 1, da, h - 6, mi);
}
function countdownText(m) {
  const diff = matchStartMs(m) - Date.now();
  if (m.status === 'live') return '● LIVE NOW';
  if (m.status === 'finished') return 'Match Finished';
  if (m.status === 'cancelled') return 'Match Cancelled';
  if (m.status === 'closed') return 'Entries Closed';
  if (diff <= 0) return 'Match Started';
  const s = Math.floor(diff / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return `Starts in: ${hh ? hh + ' Hour ' : ''}${mm} Minute ${ss} Second`;
}
function roomOpen(m) {
  if (m.status === 'live' || m.status === 'finished') return true;
  return Date.now() >= matchStartMs(m) - 5 * 60 * 1000;
}
function openModal(html) {
  modalRoot.innerHTML = `<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="sheet">${html}</div></div>`;
}
function closeModal() { modalRoot.innerHTML = ''; }
window.closeModal = closeModal;

// ---------- landing ----------
function landingHTML() {
  const activePlayers = new Set(tournaments.flatMap((m) => m.bookings.map((b) => b.profile_id))).size;
  const faq = t('faq').map(([q, a]) => `<div class="card"><b>${esc(q)}</b><p class="muted" style="margin-top:6px">${esc(a)}</p></div>`).join('');
  return `<div class="wrap" style="position:relative">
  <div class="lang-toggle"><button class="${lang === 'en' ? 'on' : ''}" onclick="setLang('en')">EN</button><button class="${lang === 'bn' ? 'on' : ''}" onclick="setLang('bn')">বাং</button></div>
  <div class="hero">
    <img class="logo" src="/logo.webp" alt="S_19 Tournament logo" onerror="this.src='/icon-512.png'">
    <h1>S_19 <b>TOURNAMENT</b></h1>
    <div class="tagline">PLAY WIN ENJOY</div>
    <p class="muted" style="margin-top:10px">${esc(t('hero'))}</p>
    <div style="display:flex;gap:10px;margin-top:18px">
      <button class="btn" onclick="downloadApp()">⬇ ${esc(t('download'))}</button>
      <button class="btn-ghost" onclick="goApp()">▶ ${esc(t('open'))}</button>
    </div>
    <div class="stats">
      <div class="stat"><b>${activePlayers}</b><span>ACTIVE PLAYERS</span></div>
      <div class="stat"><b>${tournaments.length}</b><span>TOURNAMENTS</span></div>
      <div class="stat"><b>৳0</b><span>DAILY EARNING</span></div>
      <div class="stat"><b>24/7</b><span>SUPPORT</span></div>
    </div>
  </div>
  <h2 class="center" style="margin-top:26px">${esc(t('how'))}</h2>
  <div class="steps card">
    <div class="step"><div class="n">1</div><div><b>${esc(t('s1t'))}</b><p class="muted">${esc(t('s1'))}</p></div></div>
    <div class="step"><div class="n">2</div><div><b>${esc(t('s2t'))}</b><p class="muted">${esc(t('s2'))}</p></div></div>
    <div class="step"><div class="n">3</div><div><b>${esc(t('s3t'))}</b><p class="muted">${esc(t('s3'))}</p></div></div>
    <div class="step"><div class="n">4</div><div><b>${esc(t('s4t'))}</b><p class="muted">${esc(t('s4'))}</p></div></div>
  </div>
  <h2 class="center" style="margin-top:26px">${esc(t('why'))}</h2>
  <div class="stats" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat"><b>🎧</b><span>${esc(t('f1'))}</span></div>
    <div class="stat"><b>📅</b><span>${esc(t('f2'))}</span></div>
    <div class="stat"><b>🏆</b><span>${esc(t('f3'))}</span></div>
  </div>
  <h2 class="center" style="margin-top:26px">${esc(t('faqT'))}</h2>
  ${faq}
  <div class="card center">
    <p><a href="#" onclick="showPolicy('about');return false">${esc(t('about'))}</a> · <a href="#" onclick="showPolicy('privacy');return false">${esc(t('privacy'))}</a> · <a href="#" onclick="showPolicy('terms');return false">${esc(t('terms'))}</a> · <a href="#" onclick="showPolicy('refund');return false">${esc(t('refund'))}</a></p>
    <p class="muted" style="margin-top:10px">We never ask for your bKash, Nagad or Rocket PIN, OTP or card CVV. Players must be 18+.</p>
  </div></div>`;
}
window.setLang = (l) => { lang = l; localStorage.setItem('s19lang', l); render(); };
window.goApp = () => { view = token ? 'play' : 'login'; render(); };
window.downloadApp = async () => {
  if (window.__s19Install) {
    try { await window.__s19Install.prompt(); return; } catch (e) {}
  }
  openModal(`<h2>ADD TO HOME SCREEN</h2>
    <p class="muted">Your browser did not show the install box, so add the app by hand — it takes only a few seconds:</p>
    <div class="card"><b>Chrome (Android)</b><p class="muted">Tap the ⋮ menu at the top right, tap "Install app" or "Add to Home screen", then tap Add.</p></div>
    <div class="card"><b>Samsung Internet</b><p class="muted">Tap the ☰ menu, tap "Add page to", choose "Home screen", then tap Add.</p></div>
    <div class="card"><b>iPhone (Safari)</b><p class="muted">Tap the Share button, scroll down and tap "Add to Home Screen", then tap Add.</p></div>
    <p class="green" style="margin-top:12px">✓ After adding, open S_19 Tournament from your home screen — it opens full-screen, just like a real app.</p>
    <button class="btn" style="margin-top:14px" onclick="closeModal()">GOT IT</button>`);
};
window.showPolicy = (kind) => {
  const bodies = {
    about: `<p>S_19 Tournament is a Free Fire tournament platform by S_19. Daily BR, CS and Lone Wolf custom-room matches with real Taka prizes, paid to your Winning Balance.</p>`,
    privacy: `<p>We store only what the app needs: your username, email, phone, in-game name and UID, your bookings, results and wallet transactions. We never ask for your bKash, Nagad or Rocket PIN, OTP or card CVV. We never share your data with anyone else.</p>`,
    terms: `<p>Players must be 18+. Only the registered player may play in a match they joined — inviting an unregistered player means a permanent ban. Every match is hack-checked. The admin's decision is final. Deposit Balance can never be withdrawn — only Winning Balance can. Minimum withdrawal ৳100, withdrawals open 10:00 AM – 9:30 PM Dhaka time.</p>`,
    refund: `<p>Full refund when a match is cancelled, its time is changed, or room details are not given. No refund for joining late, a wrong name/UID, cheating, or after joining a 1v1 match. Entry fees are refunded in full when a booking is rejected or a match is cancelled.</p>`,
  };
  openModal(`<h2>${esc(kind.toUpperCase())}</h2><div style="line-height:1.7;font-size:14px;margin-top:10px">${bodies[kind] || ''}</div><button class="btn" style="margin-top:16px" onclick="closeModal()">Close</button>`);
};

// ---------- auth ----------
function authHTML() {
  const isLogin = view === 'login';
  return `<div class="wrap"><div class="hero">
    <img class="logo" src="/logo.webp" alt="logo" onerror="this.src='/icon-512.png'">
    <h1>${isLogin ? 'Welcome Back' : 'Create Account'}</h1>
    <p class="muted">${isLogin ? 'Login to your S_19 Tournament account' : 'Join S_19 Tournament and start playing'}</p></div>
  <div class="card">
    ${isLogin ? '' : `<div class="field"><label>Username</label><input id="f-username" placeholder="Your username"></div>`}
    <div class="field"><label>Email</label><input id="f-email" type="email" placeholder="you@example.com"></div>
    ${isLogin ? '' : `<div class="field"><label>Phone (+88)</label><input id="f-phone" placeholder="+8801XXXXXXXXX"></div>`}
    <div class="field"><label>Password</label><input id="f-password" type="password" placeholder="••••••••"></div>
    ${isLogin ? '' : `<div class="field"><label>Confirm Password</label><input id="f-password2" type="password" placeholder="••••••••"></div>`}
    <div id="auth-err"></div>
    <button class="btn" style="margin-top:16px" onclick="${isLogin ? 'doLogin()' : 'doRegister()'}">${isLogin ? 'Login' : 'Register'}</button>
    <p class="center muted" style="margin-top:14px">${isLogin ? "Don't have an account? " : 'Already have an account? '}
      <a href="#" onclick="view='${isLogin ? 'register' : 'login'}';render();return false">${isLogin ? 'Sign Up' : 'Login'}</a></p>
    <p class="center"><a href="#" onclick="view='landing';render();return false">← Back to home</a></p>
  </div></div>`;
}
window.doLogin = async () => {
  try {
    const d = await api('/api/login', { method: 'POST', body: JSON.stringify({ emailOrUsername: $('#f-email').value.trim(), password: $('#f-password').value }) });
    token = d.token; localStorage.setItem('s19token', token);
    await loadMe(); showNotice();
  } catch (e) { $('#auth-err').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};
window.doRegister = async () => {
  const pw = $('#f-password').value, pw2 = $('#f-password2').value;
  if (pw !== pw2) { $('#auth-err').innerHTML = '<div class="err">Passwords do not match</div>'; return; }
  try {
    const d = await api('/api/register', { method: 'POST', body: JSON.stringify({ username: $('#f-username').value.trim(), email: $('#f-email').value.trim(), phone: $('#f-phone').value.trim(), password: pw }) });
    token = d.token; localStorage.setItem('s19token', token);
    await loadMe(); showNotice();
  } catch (e) { $('#auth-err').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};
function showNotice() {
  openModal(`<div class="center"><img class="logo" src="/logo.webp" onerror="this.src='/icon-512.png'"><h2 style="margin-top:8px">Welcome Notice</h2></div>
  <ol class="notice-bn">
    <li>নিজের স্লট নম্বর মনে রাখবেন।</li>
    <li>Room Details থেকে পাওয়া ID ও Password দিয়ে কাস্টম রুমে ঢুকবেন।</li>
    <li>Observer থেকে নিজের স্লটে যাবেন।</li>
    <li>স্লটে সমস্যা হলে গেমে মেসেজ না দিয়ে Voice On করে হোস্টকে জানাবেন।</li>
    <li>শৃঙ্খলা বজায় রাখবেন, চিৎকার করবেন না।</li>
    <li>ID ও Password নেওয়ার সময় থেকে ম্যাচ শুরু পর্যন্ত স্ক্রিন রেকর্ড বাধ্যতামূলক — ভিডিও প্রমাণ না থাকলে রিফান্ড দেওয়া হবে না।</li>
  </ol>
  <button class="btn" style="margin-top:14px" onclick="closeModal();view='play';render()">ACCEPT &amp; PROCEED</button>`);
}
async function loadMe() {
  try { const d = await api('/api/me'); profile = d.profile; wallet = d.wallet; }
  catch (e) { token = ''; localStorage.removeItem('s19token'); profile = null; }
}
async function loadTournaments() {
  try { tournaments = (await api('/api/tournaments')).tournaments; } catch (e) { tournaments = []; }
}

// ---------- play / matches ----------
const SUBS = { br: ['Solo', 'Duo', 'Esports PRO'], cs: ['4v4', '1v1', 'Headshot Only'], lw: ['1v1', '2v2', 'Lose To Win', 'Headshot Only'] };
const LW1V1_RULES = ['সন্দেহজনক User কে কোনো নোটিশ ছাড়াই BAN করা হবে।', 'ম্যাচে অ্যাডমিন পান দেওয়া থেকে শুরু করে ম্যাচ স্টার্ট হওয়া পর্যন্ত ভিডিও করা লাগবে এবং অ্যাডমিন যদি ভিডিও চায় দেখাতে হবে।', 'জয়েন করার সময় আপনার নাম দিয়ে জয়েন করলে কিক দেওয়া হবে, কোনো প্রকার রিফান্ড এবং Winning Reward দেওয়া হবে না।', '৫০ লেভেলের কম Free Fire আইডি দিয়ে ম্যাচ জয়েন করলে, ম্যাচ থেকে কিক দেওয়া হলে কোনো প্রকার REFUND দেওয়া হবে না।', 'ম্যাচ জয়েন করার পর কোনো ধরনের রিফান্ড করা হবে না।', 'কোনো প্লেয়ার অন্য অ্যাপ থেকে ব্যান থাকলে আমাদের অ্যাপ থেকেও ব্যান করা হবে।', 'ম্যাচ সময়ের ৪/৫ মিনিট আগে Room-এ ঢুকতে হবে, ID ও Password পেয়ে যাবেন।', 'ম্যাচ শুরু হওয়ার ২/৩ মিনিট আগে কাস্টম জয়েন করতে না পারলে কোনো প্রকার Refund পাবেন না।', 'আমাদের অ্যাপে Notification-এ Room ID ও Password দেওয়া হয় না।', 'ম্যাচে রেকর্ড ভিডিও এবং Screenshot দিতে না পারলে সে ম্যাচে কোনো প্রকার Refund অথবা Reward দেওয়া হবে না।', 'ম্যাচ জিতলে কোনো সমস্যা হলে ম্যাচ শেষ হওয়ার সর্বোচ্চ ৫/১০ মিনিটের মধ্যে জানাতে হবে।', '১ভি১ ম্যাচে জয়েন করার পর আর কোনো Refund-এর ব্যবস্থা নেই।', '১ভি১ ম্যাচে কোনো ধরনের Teaming, ইমোট ব্যবহার, লাফালাফি, Zone অথবা Bomb মেরে নিজে মারা যাওয়া সম্পূর্ণ নিষিদ্ধ। এমনটি করলে Entry Fee বাজেয়াপ্ত করা হবে এবং ম্যাচটি বাতিল করা হবে।', '১ভি১ ম্যাচে শুধুমাত্র নির্ধারিত দুইজন প্লেয়ার খেলবে। অন্য কোনো প্লেয়ার অংশগ্রহণ করতে পারবে না।', 'ম্যাচ "WINNINGS"-এর টাকা ম্যাচ শেষ হওয়ার ৩০ মিনিটের মধ্যে Account-এ Add দেওয়া হবে।', 'যেকোনো সমস্যা বা সহযোগিতার ক্ষেত্রে আমাদের SUPPORT-এ যোগাযোগ করতে হবে।', '🔴 "S_19 TOURNAMENT ADMIN"-এর সিদ্ধান্তই চূড়ান্ত সিদ্ধান্ত 🔴'];

function topbarHTML() {
  return `<div class="topbar"><img class="logo-sm" src="/logo.webp" onerror="this.src='/icon-192.png'">
  <div><b>S_19 <span class="red">TOURNAMENT</span></b><div class="muted" style="font-size:11px">WELCOME BACK, ${esc(profile ? profile.username.toUpperCase() : 'PLAYER')} ${profile && profile.isAdmin ? '<span class="admin-badge">ADMIN</span>' : ''}</div></div>
  <div class="sp"></div><span class="chip">৳${wallet ? wallet.depositBalance + wallet.winningBalance : 0}</span></div>`;
}
function bottomnavHTML() {
  const items = [['play', '🎮', 'Play'], ['mymatches', '📋', 'My Matches'], ['results', '🏆', 'Results'], ['wallet', '👛', 'Wallet'], ['profile', '👤', 'Profile']];
  return `<div class="bottomnav">${items.map(([v, ic, lb]) => `<button class="${view === v ? 'on' : ''}" onclick="view='${v}';render()"><span class="ic">${ic}</span>${lb}</button>`).join('')}</div>`;
}
function matchCard(m) {
  const taken = m.bookings.filter((b) => b.status === 'pending' || b.status === 'approved').length;
  const pct = Math.round((taken / m.totalSlots) * 100);
  const isLW1v1 = m.category === 'lw' && m.subcategory === '1v1';
  const rulesLine = (m.category === 'br' || m.category === 'lw')
    ? `<p class="rules-line">🚫 ম্যাচে জয়েন করার আগে রুলস পড়ে নেন। রুলস ভঙ্গ করলে রিওয়ার্ড দেওয়া হবে না &amp; রিফান্ড পাবেন না</p>` : '';
  return `<div class="card match">
    <span class="badge">#${m.id}</span>
    <h3 style="cursor:pointer" onclick="${isLW1v1 ? `showLW1v1Rules(${m.id})` : ''}">${esc(m.title)}</h3>
    <div class="mid">📅 ${esc(m.matchDate)} ${esc(m.matchTime)} · ${esc(m.subcategory)} · ${esc(m.mode)} · ${esc(m.matchType)}</div>
    ${rulesLine}
    <div class="tiles">
      <div class="tile"><span>PRIZE</span><b class="gold">${m.prizePool} TK</b></div>
      <div class="tile"><span>TYPE</span><b>${esc(m.subcategory)}</b></div>
      <div class="tile"><span>FEE</span><b>${m.entryFee} TK</b></div>
      <div class="tile"><span>KILL</span><b>${m.perKillPrize} TK</b></div>
      <div class="tile"><span>MAP</span><b>${esc(m.map)}</b></div>
      <div class="tile"><span>POV</span><b>${esc(m.pov)}</b></div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:13px"><span>👥 Registration</span><b>${taken}/${m.totalSlots}</b></div>
    <div class="regbar"><i style="width:${pct}%"></i></div>
    <button class="btn" style="margin-top:12px" ${m.status !== 'upcoming' ? 'disabled' : ''} onclick="openSlots(${m.id})">🚀 Join Now</button>
    <div class="row3">
      <button class="btn-ghost" onclick="openSlots(${m.id})">👥 Slots</button>
      <button class="btn-ghost" onclick="openRoom(${m.id})">🚪 Room</button>
      <button class="btn-ghost" onclick="openPrizes(${m.id})">🏆 Prizes</button>
    </div>
    <div class="countdown" data-cd="${m.id}" data-start="${matchStartMs(m)}" data-status="${m.status}">${esc(countdownText(m))}</div>
  </div>`;
}
function playHTML() {
  const list = tournaments.filter((m) => m.category === category && m.subcategory === subcategory);
  return `${topbarHTML()}<div class="wrap">
  <div class="card center" style="background:linear-gradient(135deg,#2a0d0d,#161616)">📢 <b>Need any Help? Customer Support</b><br><span class="muted">Tap Profile → Support, or message the admin.</span></div>
  <div class="tabs">
    <button class="${category === 'br' ? 'on' : ''}" onclick="category='br';subcategory='Solo';render()">BR MATCHES (${tournaments.filter((m) => m.category === 'br').length})</button>
    <button class="${category === 'cs' ? 'on' : ''}" onclick="category='cs';subcategory='4v4';render()">CS MATCHES (${tournaments.filter((m) => m.category === 'cs').length})</button>
    <button class="${category === 'lw' ? 'on' : ''}" onclick="category='lw';subcategory='1v1';render()">LW MATCHES (${tournaments.filter((m) => m.category === 'lw').length})</button>
  </div>
  <div class="subtabs">${SUBS[category].map((s) => `<button class="${subcategory === s ? 'on' : ''}" onclick="subcategory='${s}';render()">${s}</button>`).join('')}</div>
  ${list.length ? list.map(matchCard).join('') : '<div class="card center muted">No matches in this list yet.</div>'}
  </div>${bottomnavHTML()}`;
}
window.showLW1v1Rules = (id) => {
  const m = tournaments.find((x) => x.id === id);
  openModal(`<h2>Match Instructions and Rules</h2>
  <div class="warn">⚠ You will get the custom ID password 2 to 4 minutes before the match starts in the Room Details Button.</div>
  <button class="btn" style="margin-top:12px" onclick="toast('Tutorial video is coming soon — contact Support for help')">▶ Watch tutorial For Join</button>
  <h3 style="margin-top:16px">S_19 TOURNAMENT Lw 1v1 Match Rules &amp; Conditions</h3>
  <div class="tiles" style="grid-template-columns:1fr 1fr">
    <div class="tile"><span>Round</span><b>9</b></div><div class="tile"><span>All Gun Allow</span><b class="green">✔ Yes</b></div>
    <div class="tile"><span>Limited Ammo</span><b class="green">✔ Yes</b></div><div class="tile"><span>Gun Attributes</span><b class="red">❌ No</b></div>
    <div class="tile"><span>Character Skill</span><b class="red">❌ No</b></div><div class="tile"><span>Throwables</span><b class="green">✔ Allow</b></div>
  </div>
  <ol class="rulelist">${LW1V1_RULES.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
  <button class="btn" style="margin-top:14px" onclick="closeModal()">Close</button>`);
};
window.openPrizes = (id) => {
  const m = tournaments.find((x) => x.id === id);
  const isBR = m.category === 'br' && (m.subcategory === 'Solo' || m.subcategory === 'Duo');
  const rows = isBR
    ? [[1, '1st Winner', 90], [2, '2nd Position', 70], [3, '3rd Position', 40], [4, '4th Position', 30], [5, '5th Position', 20]]
        .map(([n, lb, v]) => `<div class="prize-tile"><span>${n} ${lb}</span><b>${v}</b></div>`).join('')
    : `<div class="prize-tile"><span>Winner Prize</span><b>${m.prizePool} TK</b></div>`;
  openModal(`<h2>🏆 Match Prizes</h2><div class="prizegrid">${rows}
    <div class="prize-tile"><span>💀 Per Kill</span><b>${m.perKillPrize}</b></div></div>
    <div class="totalbar"><span>🏆 Total Prize</span><span>${m.prizePool} TK</span></div>
    <button class="btn" style="margin-top:14px" onclick="closeModal()">Close</button>`);
};
window.openRoom = (id) => {
  const m = tournaments.find((x) => x.id === id);
  if (!m.hasRoom) return openModal(`<h2>Room Details</h2><p class="muted" style="margin-top:10px">Room ID &amp; Password have not been added by the host yet.</p><button class="btn" style="margin-top:14px" onclick="closeModal()">Close</button>`);
  if (!roomOpen(m)) return openModal(`<h2>Room Details</h2><div class="warn">⚠ You will get the custom ID password 2 to 4 minutes before the match starts in the Room Details Button.</div><div class="countdown" data-cd="${m.id}" data-start="${matchStartMs(m)}" data-status="${m.status}">${esc(countdownText(m))}</div><button class="btn" style="margin-top:14px" onclick="closeModal()">Close</button>`);
  openModal(`<h2>Room Details</h2>
  <div class="kv"><span>Room ID</span><b>${esc(m.roomId)}</b></div>
  <div class="kv"><span>Password</span><b>${esc(m.roomPassword)}</b></div>
  <button class="btn" style="margin-top:14px" onclick="navigator.clipboard&&navigator.clipboard.writeText('${esc(m.roomId)}');toast('Room ID copied')">Copy Room ID</button>
  <button class="btn-ghost" style="margin-top:8px" onclick="closeModal()">Close</button>`);
};
window.openSlots = (id) => {
  selectedMatch = tournaments.find((x) => x.id === id);
  selectedSlot = 0;
  const taken = new Set(selectedMatch.bookings.filter((b) => b.status === 'pending' || b.status === 'approved').map((b) => b.slot_number));
  const myBooking = selectedMatch.bookings.find((b) => profile && b.profile_id === profile.id && (b.status === 'pending' || b.status === 'approved'));
  const grid = Array.from({ length: selectedMatch.totalSlots }, (_, i) => {
    const n = i + 1;
    return `<button class="slot ${taken.has(n) ? 'taken' : ''}" ${taken.has(n) ? 'disabled' : ''} onclick="selectSlot(${n},this)">${n}</button>`;
  }).join('');
  openModal(`<h2>Select a Slot</h2>
  <p class="muted center">Step 1 — pick a free slot · Step 2 — enter your in-game name · Step 3 — agree to the rules · Step 4 — confirm</p>
  ${myBooking ? `<div class="okmsg">You already booked slot ${myBooking.slot_number} (${myBooking.status}).</div>` : ''}
  <div class="slotgrid">${grid}</div>
  <div id="slot-err"></div>
  <button class="btn" style="margin-top:16px" onclick="proceedJoin()">PROCEED</button>`);
};
window.selectSlot = (n, el) => {
  selectedSlot = n;
  $$('.slot').forEach((s) => s.classList.remove('sel'));
  el.classList.add('sel');
};
window.proceedJoin = () => {
  if (!selectedSlot) { $('#slot-err').innerHTML = '<div class="err">Pick a slot first</div>'; return; }
  openModal(`<h2>Enter Player Name</h2>
  <p class="muted">Join only with your own registered in-game name. Only the registered player may play — inviting an unregistered player means a permanent ban.</p>
  <div class="field"><label>Player Name (exact in-game name)</label><input id="f-playername" value="${esc(profile ? profile.ign : '')}"></div>
  <label style="display:flex;gap:8px;margin-top:14px;font-size:14px"><input type="checkbox" id="f-agree" style="width:auto"> I have read the match rules</label>
  <div id="join-err"></div>
  <button class="btn" style="margin-top:16px" onclick="confirmJoin()">I Agree and Confirm</button>`);
};
window.confirmJoin = async () => {
  if (!$('#f-agree').checked) { $('#join-err').innerHTML = '<div class="err">Tick the rules box first</div>'; return; }
  try {
    await api(`/api/tournaments/${selectedMatch.id}/book`, { method: 'POST', body: JSON.stringify({ slotNumber: selectedSlot, playerName: $('#f-playername').value.trim() }) });
    await loadTournaments(); await loadMe();
    openModal(`<h2>✅ Join Group</h2>
    <p style="line-height:1.7;margin-top:10px">You booked <b>slot ${selectedSlot}</b> in <b>${esc(selectedMatch.title)}</b>. Your booking is pending owner approval.</p>
    <div class="warn">⚠ You will get the custom ID password 2 to 4 minutes before the match starts in the Room Details Button. Stay in the Join Group screen and wait.</div>
    <button class="btn" style="margin-top:14px" onclick="closeModal();view='mymatches';render()">Go to My Matches</button>`);
  } catch (e) { $('#join-err').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};

// ---------- my matches / results ----------
function myMatchesHTML() {
  const mine = [];
  tournaments.forEach((m) => m.bookings.filter((b) => profile && b.profile_id === profile.id).forEach((b) => mine.push({ m, b })));
  return `${topbarHTML()}<div class="wrap"><h2 style="margin-top:14px">My Matches</h2>
  ${mine.length ? mine.map(({ m, b }) => `<div class="card"><b>${esc(m.title)}</b> <span class="badge">#${m.id}</span>
    <div class="muted" style="margin-top:6px">${esc(m.matchDate)} ${esc(m.matchTime)} · Slot ${b.slot_number} · ${esc(b.status)}</div>
    <div class="row3" style="grid-template-columns:1fr 1fr"><button class="btn-ghost" onclick="openRoom(${m.id})">🚪 Room Details</button>
    ${b.status === 'pending' ? `<button class="btn-ghost" onclick="cancelBooking(${b.id})">Cancel</button>` : ''}</div></div>`).join('')
    : '<div class="card center muted">You have not joined any match yet.</div>'}
  </div>${bottomnavHTML()}`;
}
window.cancelBooking = async (id) => {
  try { await api(`/api/bookings/${id}/cancel`, { method: 'POST' }); await loadTournaments(); render(); toast('Booking cancelled'); }
  catch (e) { toast(e.message); }
};
function resultsHTML() {
  const rows = [];
  tournaments.forEach((m) => m.results.forEach((r) => rows.push({ m, r })));
  return `${topbarHTML()}<div class="wrap"><h2 style="margin-top:14px">Results</h2>
  ${rows.length ? rows.map(({ m, r }) => `<div class="card"><b>${esc(m.title)}</b><div class="kv"><span>${esc(r.player_name)}</span><b>#${r.placement} · ${r.kills} kills · ${r.points} pts · ৳${r.prize}</b></div></div>`).join('')
    : '<div class="card center muted">No results published yet.</div>'}
  <h2 style="margin-top:20px">Leaderboard</h2><div id="lb"></div></div>${bottomnavHTML()}`;
}
async function loadLeaderboard() {
  try {
    const d = await api('/api/leaderboard');
    const el = $('#lb');
    if (el) el.innerHTML = d.standings.length
      ? d.standings.map((s, i) => `<div class="card"><div class="kv"><span>${i + 1}. ${esc(s.player_name)}</span><b>${s.points} pts · ${s.wins} wins · ${s.kills} kills</b></div></div>`).join('')
      : '<div class="card center muted">No standings yet.</div>';
  } catch (e) {}
}

// ---------- wallet ----------
function walletHTML() {
  const tx = wallet ? wallet.transactions : [];
  return `${topbarHTML()}<div class="wrap"><h2 style="margin-top:14px">Wallet</h2>
  <div class="card"><div class="kv"><span>💰 Deposit Balance</span><b>৳${wallet ? wallet.depositBalance : 0}</b></div>
  <div class="kv"><span>🏆 Winning Balance</span><b>৳${wallet ? wallet.winningBalance : 0}</b></div>
  <div class="kv"><span>Total topped up</span><b>৳${wallet ? wallet.topupTotal : 0}</b></div></div>
  <div style="display:flex;gap:10px;margin-top:14px"><button class="btn" onclick="openDeposit()">+ Add Money</button><button class="btn-ghost" onclick="openWithdraw()">Withdraw</button></div>
  <h3 style="margin-top:20px">Transactions</h3>
  ${tx.length ? tx.map((x) => `<div class="card"><div class="kv"><span>${esc(x.type)} · ${esc(x.method || '')} ${esc(x.trx_id || '')}</span><b>৳${x.amount} · ${esc(x.status)}</b></div><div class="muted">${esc(x.note || '')} · ${esc(x.created_at.slice(0, 10))}</div></div>`).join('')
    : '<div class="card center muted">No transactions yet.</div>'}
  </div>${bottomnavHTML()}`;
}
window.openDeposit = () => {
  openModal(`<h2>Add Money</h2>
  <p class="muted">Step 1 — pick an amount</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
    ${[100, 200, 500, 1000].map((a) => `<button class="btn-ghost btn-sm" onclick="depAmount=${a};$('#dep-amt').value=${a}">${a}</button>`).join('')}
  </div>
  <div class="field"><label>Amount (৳)</label><input id="dep-amt" type="number" value="100"></div>
  <div class="field"><label>Method</label><select id="dep-method"><option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="rocket">Rocket</option></select></div>
  <div id="dep-pay"></div>
  <button class="btn" style="margin-top:14px" onclick="depStep2()">Next — Send Money</button>`);
  window.depAmount = 100;
};
window.depStep2 = async () => {
  const amt = Number($('#dep-amt').value);
  const method = $('#dep-method').value;
  const info = await api('/api/payment-info');
  const num = method === 'bkash' ? info.bkashNumber : method === 'nagad' ? info.nagadNumber : info.rocketNumber;
  $('#dep-pay').innerHTML = `<div class="card"><b>Send ৳${amt} to this ${method} number:</b>
    <div style="font-size:22px;font-weight:800;margin:8px 0">${esc(num || 'Not set yet')}</div>
    <button class="btn-ghost btn-sm" onclick="navigator.clipboard&&navigator.clipboard.writeText('${esc(num)}');toast('Number copied')">Copy number</button>
    <p class="muted" style="margin-top:8px">Send Money from your ${method} app, then paste the TrxID below.</p></div>
  <div class="field"><label>Your sender number</label><input id="dep-sender" placeholder="01XXXXXXXXX"></div>
  <div class="field"><label>TrxID (8–12 letters/digits)</label><input id="dep-trx" placeholder="e.g. 9HX7K2LM1P"></div>
  <div id="dep-err"></div>`;
  document.querySelector('.sheet .btn').outerHTML = `<button class="btn" style="margin-top:14px" onclick="depVerify('${method}',${amt})">Verify</button>`;
};
window.depVerify = async (method, amt) => {
  try {
    await api('/api/deposit', { method: 'POST', body: JSON.stringify({ amount: amt, method, senderNumber: $('#dep-sender').value.trim(), trxId: $('#dep-trx').value.trim() }) });
    await loadMe();
    openModal(`<h2>Request Sent</h2><p style="line-height:1.7;margin-top:10px">Your deposit request is <b>pending</b>. Money will be added only after the owner approves it — nothing is credited yet.</p><button class="btn" style="margin-top:14px" onclick="closeModal();render()">OK</button>`);
  } catch (e) { const el = $('#dep-err'); if (el) el.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};
window.openWithdraw = () => {
  openModal(`<h2>Withdraw</h2><p class="muted">Only Winning Balance can be withdrawn. Minimum ৳100. Open 10:00 AM – 9:30 PM Dhaka time.</p>
  <div class="field"><label>Amount (৳)</label><input id="wd-amt" type="number" placeholder="100"></div>
  <div class="field"><label>Method</label><select id="wd-method"><option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="rocket">Rocket</option></select></div>
  <div class="field"><label>Your account number</label><input id="wd-acc" placeholder="01XXXXXXXXX"></div>
  <div id="wd-err"></div>
  <button class="btn" style="margin-top:14px" onclick="doWithdraw()">Request Withdraw</button>`);
};
window.doWithdraw = async () => {
  try {
    await api('/api/withdraw', { method: 'POST', body: JSON.stringify({ amount: Number($('#wd-amt').value), method: $('#wd-method').value, accountNumber: $('#wd-acc').value.trim() }) });
    await loadMe(); closeModal(); render(); toast('Withdraw request sent');
  } catch (e) { $('#wd-err').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};

// ---------- profile / admin ----------
function profileHTML() {
  const played = tournaments.reduce((n, m) => n + m.bookings.filter((b) => profile && b.profile_id === profile.id).length, 0);
  return `${topbarHTML()}<div class="wrap"><div class="card center">
    <img class="logo" src="/logo.webp" onerror="this.src='/icon-192.png'">
    <h2 style="margin-top:8px">${esc(profile ? profile.username : '')}</h2>
    <p class="muted">S_19 ID #${profile ? profile.accountId : ''} · IGN ${esc(profile ? profile.ign : '')} · UID ${esc(profile ? profile.uid : '—')}</p>
    <p style="margin-top:8px">Total Matches: <b>${played}</b> · Wallet: <b>৳${wallet ? wallet.depositBalance + wallet.winningBalance : 0}</b></p></div>
  <div class="card">
    <button class="btn-ghost" style="margin-top:8px" onclick="editProfile()">✏️ Edit Profile (IGN / UID)</button>
    <button class="btn-ghost" style="margin-top:8px" onclick="dailySpin()">🎡 Daily Spin ${profile && profile.spunToday ? '(done today)' : ''}</button>
    <button class="btn-ghost" style="margin-top:8px" onclick="view='results';render()">🏆 Leaderboard</button>
    <button class="btn-ghost" style="margin-top:8px" onclick="showNotice()">📜 All Rules</button>
    <button class="btn-ghost" style="margin-top:8px" onclick="devProfile()">👨‍💻 Developer Profile</button>
    ${profile && profile.isAdmin ? `<button class="btn" style="margin-top:8px" onclick="view='admin';render()">⚙️ Admin Panel</button>` : ''}
    <button class="btn-ghost" style="margin-top:8px" onclick="logout()">🚪 Logout</button>
  </div></div>${bottomnavHTML()}`;
}
window.editProfile = () => {
  openModal(`<h2>Edit Profile</h2>
  <div class="field"><label>In-game name</label><input id="pf-ign" value="${esc(profile.ign)}"></div>
  <div class="field"><label>Free Fire UID</label><input id="pf-uid" value="${esc(profile.uid)}"></div>
  <div id="pf-err"></div>
  <button class="btn" style="margin-top:14px" onclick="saveProfile()">Save</button>`);
};
window.saveProfile = async () => {
  try { const d = await api('/api/profile', { method: 'POST', body: JSON.stringify({ ign: $('#pf-ign').value.trim(), uid: $('#pf-uid').value.trim() }) }); profile = d.profile; closeModal(); render(); toast('Profile saved'); }
  catch (e) { $('#pf-err').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};
window.dailySpin = async () => {
  try { const d = await api('/api/spin', { method: 'POST' }); await loadMe(); openModal(`<h2>🎡 Daily Spin</h2><div class="spinwheel"><span>৳${d.prize}</span></div><p class="center">You won <b>৳${d.prize}</b>!</p><button class="btn" style="margin-top:14px" onclick="closeModal();render()">OK</button>`); }
  catch (e) { toast(e.message); }
};
window.devProfile = () => openModal(`<h2>Developer Profile</h2><div class="card center"><img class="logo" src="/logo.webp" onerror="this.src='/icon-512.png'"><p style="margin-top:10px"><b>S_19</b></p><p class="muted">Voice of Bijoy · S_19 Tournament · S_19 CHAT BOOK · BR 19</p></div><button class="btn" style="margin-top:14px" onclick="closeModal()">Close</button>`);
window.logout = () => { token = ''; localStorage.removeItem('s19token'); profile = null; wallet = null; view = 'landing'; render(); };

async function adminHTML() {
  const d = await api('/api/tournaments/admin');
  adminTournaments = d.tournaments;
  const pendTx = wallet ? [] : [];
  return `${topbarHTML()}<div class="wrap"><h2 style="margin-top:14px">Admin Panel</h2>
  <div class="card"><h3>Create custom room</h3>
    <div class="field"><label>Room name</label><input id="ad-title" maxlength="160" placeholder="e.g. BR Solo — Evening"></div>
    <div class="field"><label>Lobby</label><select id="ad-cat" onchange="adSub()"><option value="br">BR</option><option value="cs">CS</option><option value="lw">LW</option></select></div>
    <div class="field"><label>Subcategory</label><select id="ad-sub"></select></div>
    <div class="field"><label>Date</label><input id="ad-date" type="date" value="2026-11-20"></div>
    <div class="field"><label>Time</label><input id="ad-time" type="time" value="18:00"></div>
    <div class="field"><label>Prize (TK)</label><input id="ad-prize" type="number" value="800"></div>
    <div class="field"><label>Entry fee (TK)</label><input id="ad-fee" type="number" value="20"></div>
    <div class="field"><label>Per kill (TK)</label><input id="ad-kill" type="number" value="10"></div>
    <div class="field"><label>Room ID</label><input id="ad-roomid" placeholder="optional"></div>
    <div class="field"><label>Room password</label><input id="ad-roompw" placeholder="optional"></div>
    <div id="ad-err"></div>
    <button class="btn" style="margin-top:12px" onclick="createMatch()">Create Room</button></div>
  <h3 style="margin-top:20px">Matches (${adminTournaments.length})</h3>
  ${adminTournaments.map((m) => `<div class="card"><b>${esc(m.title)}</b> <span class="badge">#${m.id}</span>
    <div class="muted">${esc(m.matchDate)} ${esc(m.matchTime)} · ${esc(m.status)} · ${m.bookings.filter((b) => b.status === 'pending' || b.status === 'approved').length}/${m.totalSlots} booked · Room: ${m.roomId || '—'}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
      <button class="btn-ghost btn-sm" onclick="setStatus(${m.id},'live')">Start live</button>
      <button class="btn-ghost btn-sm" onclick="setStatus(${m.id},'closed')">Close entries</button>
      <button class="btn-ghost btn-sm" onclick="setStatus(${m.id},'upcoming')">Reopen</button>
      <button class="btn-ghost btn-sm" onclick="setStatus(${m.id},'finished')">Mark finished</button>
      <button class="btn-ghost btn-sm" onclick="cancelMatch(${m.id})">Cancel</button>
      <button class="btn-ghost btn-sm" onclick="editMatch(${m.id})">Edit</button>
      <button class="btn-ghost btn-sm" onclick="deleteMatch(${m.id})">Delete</button>
    </div>
    ${m.bookings.filter((b) => b.status === 'pending').map((b) => `<div class="kv"><span>Slot ${b.slot_number} · ${esc(b.player_name)} (pending)</span><span><button class="btn-ghost btn-sm" onclick="reviewBooking(${b.id},true)">Approve</button> <button class="btn-ghost btn-sm" onclick="reviewBooking(${b.id},false)">Reject</button></span></div>`).join('')}
  </div>`).join('')}
  <div class="card"><h3>Publish result</h3>
    <div class="field"><label>Match</label><select id="rs-match">${adminTournaments.map((m) => `<option value="${m.id}">${esc(m.title)} — ${esc(m.matchDate)}</option>`).join('')}</select></div>
    <div class="field"><label>Player name</label><input id="rs-player" placeholder="in-game name"></div>
    <div class="field"><label>Placement (1-5)</label><input id="rs-place" type="number" value="1"></div>
    <div class="field"><label>Kills</label><input id="rs-kills" type="number" value="0"></div>
    <button class="btn" style="margin-top:12px" onclick="publishResult()">Publish Result</button></div>
  <div class="card"><h3>Payment settings</h3>
    <div class="field"><label>bKash number</label><input id="pay-bkash" placeholder="01XXXXXXXXX"></div>
    <div class="field"><label>Nagad number</label><input id="pay-nagad" placeholder="01XXXXXXXXX"></div>
    <div class="field"><label>Rocket number</label><input id="pay-rocket" placeholder="01XXXXXXXXX"></div>
    <button class="btn" style="margin-top:12px" onclick="savePayment()">Save Payment Numbers</button></div>
  </div>${bottomnavHTML()}`;
}
window.adSub = () => {
  const c = $('#ad-cat').value;
  $('#ad-sub').innerHTML = SUBS[c].map((s) => `<option>${s}</option>`).join('');
};
window.createMatch = async () => {
  try {
    await api('/api/tournaments', { method: 'POST', body: JSON.stringify({
      title: $('#ad-title').value.trim(), category: $('#ad-cat').value, subcategory: $('#ad-sub').value,
      mode: $('#ad-sub').value === 'Duo' || $('#ad-sub').value === '2v2' ? 'duo' : ($('#ad-sub').value === '4v4' || $('#ad-sub').value === 'Esports PRO' || $('#ad-sub').value === 'Headshot Only' ? 'squad' : 'solo'),
      matchType: $('#ad-cat').value === 'br' ? 'battle_royale' : $('#ad-cat').value === 'cs' ? 'clash_squad' : 'lone_wolf',
      matchDate: $('#ad-date').value, matchTime: $('#ad-time').value,
      prizePool: Number($('#ad-prize').value), entryFee: Number($('#ad-fee').value),
      perKillPrize: Number($('#ad-kill').value), roomId: $('#ad-roomid').value.trim(), roomPassword: $('#ad-roompw').value.trim(),
    }) });
    await loadTournaments(); render(); toast('Room created');
  } catch (e) { $('#ad-err').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};
window.setStatus = async (id, st) => { await api(`/api/tournaments/${id}/status`, { method: 'POST', body: JSON.stringify({ status: st }) }); render(); };
window.cancelMatch = async (id) => { if (confirm('Cancel this match? Entry fees will be refunded.')) { await api(`/api/tournaments/${id}/cancel`, { method: 'POST' }); await loadTournaments(); render(); } };
window.deleteMatch = async (id) => { if (confirm('Delete this match? Entry fees will be refunded.')) { await api(`/api/tournaments/${id}`, { method: 'DELETE' }); await loadTournaments(); render(); } };
window.reviewBooking = async (id, ok) => { await api(`/api/bookings/${id}/review`, { method: 'POST', body: JSON.stringify({ approve: ok }) }); render(); };
window.editMatch = (id) => {
  const m = adminTournaments.find((x) => x.id === id);
  openModal(`<h2>Edit Match #${id}</h2>
  <div class="field"><label>Date</label><input id="em-date" type="date" value="${m.matchDate}"></div>
  <div class="field"><label>Time</label><input id="em-time" type="time" value="${m.matchTime}"></div>
  <div class="field"><label>Prize</label><input id="em-prize" type="number" value="${m.prizePool}"></div>
  <div class="field"><label>Entry fee</label><input id="em-fee" type="number" value="${m.entryFee}"></div>
  <div class="field"><label>Room ID</label><input id="em-roomid" value="${esc(m.roomId)}"></div>
  <div class="field"><label>Room password</label><input id="em-roompw" value="${esc(m.roomPassword)}"></div>
  <button class="btn" style="margin-top:14px" onclick="saveEditMatch(${id})">Save</button>`);
};
window.saveEditMatch = async (id) => {
  await api(`/api/tournaments/${id}`, { method: 'PUT', body: JSON.stringify({ matchDate: $('#em-date').value, matchTime: $('#em-time').value, prizePool: Number($('#em-prize').value), entryFee: Number($('#em-fee').value), roomId: $('#em-roomid').value, roomPassword: $('#em-roompw').value }) });
  closeModal(); await loadTournaments(); render();
};
window.publishResult = async () => {
  try {
    const mid = Number($('#rs-match').value);
    const m = adminTournaments.find((x) => x.id === mid);
    const bk = m.bookings.find((b) => b.player_name === $('#rs-player').value.trim());
    await api('/api/results', { method: 'POST', body: JSON.stringify({ tournamentId: mid, profileId: bk ? bk.profile_id : 0, playerName: $('#rs-player').value.trim(), placement: Number($('#rs-place').value), kills: Number($('#rs-kills').value) }) });
    await loadTournaments(); render(); toast('Result published');
  } catch (e) { toast(e.message); }
};
window.savePayment = async () => {
  await api('/api/payment-info', { method: 'PUT', body: JSON.stringify({ bkashNumber: $('#pay-bkash').value.trim(), nagadNumber: $('#pay-nagad').value.trim(), rocketNumber: $('#pay-rocket').value.trim() }) });
  toast('Payment numbers saved');
};

// ---------- render / init ----------
function render() {
  if (view === 'landing') app.innerHTML = landingHTML();
  else if (view === 'login' || view === 'register') app.innerHTML = authHTML();
  else if (view === 'play') app.innerHTML = playHTML();
  else if (view === 'mymatches') app.innerHTML = myMatchesHTML();
  else if (view === 'results') { app.innerHTML = resultsHTML(); loadLeaderboard(); }
  else if (view === 'wallet') app.innerHTML = walletHTML();
  else if (view === 'profile') app.innerHTML = profileHTML();
  else if (view === 'admin') { adminHTML().then((h) => { app.innerHTML = h; adSub(); }); return; }
  if (view === 'admin') return;
  if (view === 'play' || view === 'mymatches') { /* countdowns tick below */ }
}
setInterval(() => {
  $$('[data-cd]').forEach((el) => {
    const m = tournaments.find((x) => x.id === Number(el.dataset.cd));
    if (m) el.textContent = countdownText(m);
  });
}, 1000);

(async () => {
  await loadTournaments();
  if (token) { await loadMe(); if (profile) view = 'play'; }
  render();
})();
