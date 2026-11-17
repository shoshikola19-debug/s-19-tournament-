// S_19 TOURNAMENT — client app (single-page, black + red, English UI)
'use strict';
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const app = $('#app');
const modalRoot = $('#modal-root');
let lang = localStorage.getItem('s19lang') || 'en';
let token = localStorage.getItem('s19token') || sessionStorage.getItem('s19token') || '';
let resultTab = 'all';
let bannerTimer = null, bannerIdx = 0;
function saveToken(tk, remember) {
  token = tk;
  if (remember) { localStorage.setItem('s19token', tk); sessionStorage.removeItem('s19token'); }
  else { sessionStorage.setItem('s19token', tk); localStorage.removeItem('s19token'); }
}
function clearToken() { token = ''; localStorage.removeItem('s19token'); sessionStorage.removeItem('s19token'); }
let profile = null, wallet = null, tournaments = [], adminTournaments = [];
let view = 'landing', category = 'br', subcategory = 'Solo', myFilter = 'all';
let selectedMatch = null, selectedSlot = 0;
// Daily Spin wheel state (server decides the result; the wheel only animates to it).
let spinState = null, spinRotation = 0, spinBusy = false, spinTimer = null;
const SPIN_SEGMENTS = [
  { key: 'cs', label: 'CS Match', color: '#f39c12' },
  { key: 'none', label: 'No Prize', color: '#37474f' },
  { key: 'lw', label: 'LW Match', color: '#1e88e5' },
  { key: 'none', label: 'No Prize', color: '#37474f' },
  { key: 'all', label: 'All Match', color: '#e53935' },
  { key: 'none', label: 'No Prize', color: '#37474f' },
  { key: 'br', label: 'BR Match', color: '#43a047' },
  { key: 'none', label: 'No Prize', color: '#37474f' },
];

const L = {
  en: { hero: 'Daily Free Fire tournaments — BR, CS and Lone Wolf. Book your slot, play the custom room, and win real Taka prizes straight to your wallet.',
    download: 'DOWNLOAD FOR ANDROID', open: 'OPEN APP', login: 'Login', signup: 'Sign Up', how: 'HOW TO GET STARTED', why: 'WHY PLAY HERE',
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
    download: 'অ্যান্ড্রয়েডের জন্য ডাউনলোড', open: 'অ্যাপ খুলুন', login: 'লগইন', signup: 'সাইন আপ', how: 'কীভাবে শুরু করবেন', why: 'কেন এখানে খেলবেন',
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
function fmtDateTime(m) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, mo, da] = m.matchDate.split('-').map(Number);
  const [h, mi] = m.matchTime.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${da} ${months[mo - 1]} ${y} ${String(h12).padStart(2, '0')}:${String(mi).padStart(2, '0')} ${ap}`;
}
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
window.openSupport = () => openModal(`<h2>🎧 Customer Support</h2>
  <p style="line-height:1.7;margin-top:10px">Our support team is available <b>24/7</b>. For any match problem — slot, room ID/password, refund or reward — contact the admin and mention your <b>S_19 ID</b> and match number.</p>
  <div class="card"><b>Before you write</b><p class="muted">Keep your screen recording ready — from room entry until the match starts. Without video proof, no refund or reward can be given.</p></div>
  <button class="btn" style="margin-top:14px" onclick="closeModal();showNotice(1)">📜 Read All Rules</button>
  <button class="btn-ghost" style="margin-top:8px" onclick="closeModal();view='mymatches';render()">📋 My Matches</button>`);
window.openTutorial = () => openModal(`<h2>▶ Tutorial — How to Join a Match</h2>
  <ol class="rulelist">
    <li><b>Register</b> with your username, email, phone and password, then add your exact Free Fire in-game name and UID in Edit Profile.</li>
    <li><b>Add Money</b> from Wallet — send to the owner's bKash / Nagad / Rocket number, paste the TrxID, and wait for owner approval.</li>
    <li><b>Pick a match</b> from BR, CS or LW, then tap <b>Join Now</b>.</li>
    <li><b>Pick a free slot</b> — taken slots are crossed out. Then enter your exact in-game name.</li>
    <li><b>Tick the rules box</b> and tap <b>I Agree and Confirm</b>. The entry fee is charged from your Deposit Balance.</li>
    <li><b>Wait for approval</b> — check My Matches. Room ID &amp; Password appear in Room Details <b>5 minutes before</b> the match starts.</li>
    <li><b>Enter the room</b> from Observer to your own slot, and keep screen recording on until the match starts.</li>
  </ol>
  <button class="btn" style="margin-top:14px" onclick="closeModal()">Got it</button>`);
window.bannerGo = (i) => {
  bannerIdx = i;
  $$('.car-slide').forEach((s, j) => s.classList.toggle('on', j === i));
  $$('.car-dot').forEach((d, j) => d.classList.toggle('on', j === i));
};
function startBanner() {
  clearInterval(bannerTimer);
  bannerIdx = 0; bannerGo(0);
  bannerTimer = setInterval(() => { const n = $$('.car-slide').length || 2; bannerGo((bannerIdx + 1) % n); }, 4000);
}
function stopBanner() { clearInterval(bannerTimer); }
function isTeamMatch(m) {
  if (!m) return false;
  if (m.category === 'cs' && (m.subcategory === '4v4' || m.subcategory === 'Headshot Only')) return true;
  if (m.category === 'lw' && m.subcategory === '2v2') return true;
  if (m.category === 'br' && (m.subcategory === 'Duo' || m.subcategory === 'Esports PRO')) return true;
  return false;
}
function teamSizeOf(m) {
  if (!m) return 1;
  if (m.category === 'cs' && (m.subcategory === '4v4' || m.subcategory === 'Headshot Only')) return 4;
  if (m.category === 'br' && m.subcategory === 'Esports PRO') return 4;
  if (m.category === 'lw' && m.subcategory === '2v2') return 2;
  if (m.category === 'br' && m.subcategory === 'Duo') return 2;
  return 1;
}
function squadList(b) {
  try { const a = JSON.parse(b.squad_names || '[]'); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
// Category drill-down: home -> category page (sub cards) -> match list.
window.openCategory = (c) => { category = c; view = 'cat'; render(); };
window.goCategory = window.openCategory; // banner + older callers
window.openSub = (c, s) => { category = c; subcategory = s; view = 'list'; render(); };
window.backToHome = () => { view = 'play'; render(); };
window.backToCategory = () => { view = 'cat'; render(); };

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
    <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
      <button id="dl-btn" class="btn" ${(window.__s19Install && !window.__s19AppInstalled) ? '' : 'style="display:none"'} onclick="downloadApp()">⬇ ${esc(t('download'))}</button>
      <button class="btn-ghost" onclick="goApp()">▶ ${esc(t('open'))}</button>
      ${token ? '' : `<button class="btn-ghost" onclick="goAuth('login')">🔑 ${esc(t('login'))}</button>
      <button class="btn" onclick="goAuth('register')">✍️ ${esc(t('signup'))}</button>`}
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
window.goAuth = (v) => { view = (v === 'register') ? 'register' : 'login'; render(); };
// Installed app (PWA standalone) opens straight into the app — no landing page.
function isStandalone() {
  try {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true
      || new URLSearchParams(location.search).get('app') === '1';
  } catch (e) { return false; }
}
window.backHome = () => { view = isStandalone() ? (token ? 'play' : 'login') : 'landing'; render(); };
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
  return `<div class="wrap" style="position:relative"><div class="lang-toggle"><button class="${lang === 'en' ? 'on' : ''}" onclick="setLang('en')">EN</button><button class="${lang === 'bn' ? 'on' : ''}" onclick="setLang('bn')">বাং</button></div><div class="hero">
    <img class="logo" src="/logo.webp" alt="logo" onerror="this.src='/icon-512.png'">
    <h1>${isLogin ? 'Welcome Back' : 'Create Account'}</h1>
    <p class="muted">${isLogin ? 'Login to your S_19 Tournament account' : 'Join S_19 Tournament and start playing'}</p></div>
  <div class="card">
    ${isLogin ? '' : `<div class="field"><label>Username</label><input id="f-username" placeholder="Your username"></div>`}
    ${isLogin ? `<div class="field"><label>Email / Username / Phone</label><input id="f-email" type="text" placeholder="Email, username or phone number"></div>`
    : `<div class="field"><label>Email</label><input id="f-email" type="email" placeholder="you@example.com"></div>`}
    ${isLogin ? '' : `<div class="field"><label>Phone (+88)</label><input id="f-phone" placeholder="+8801XXXXXXXXX"></div>`}
    <div class="field"><label>Password</label><input id="f-password" type="password" placeholder="••••••••"></div>
    ${isLogin ? '' : `<div class="field"><label>Confirm Password</label><input id="f-password2" type="password" placeholder="••••••••"></div>`}
    ${isLogin ? `<label class="remember"><input type="checkbox" id="f-remember" checked> Remember Me</label>` : `<label class="remember"><input type="checkbox" id="f-rules"> I agree to the tournament rules — <a href="#" onclick="showNotice(1);return false">read rules</a></label>`}
    <div id="auth-err"></div>
    <button class="btn" style="margin-top:16px" onclick="${isLogin ? 'doLogin()' : 'doRegister()'}">${isLogin ? 'Login' : 'Register'}</button>
    ${isLogin ? `<p class="center" style="margin-top:12px"><a href="#" onclick="openForgot();return false">Forgot Password?</a></p>` : ''}
    <p class="center muted" style="margin-top:18px;letter-spacing:2px;font-size:11px">VERSION 1.0.0</p>
    <p class="center muted" style="margin-top:14px">${isLogin ? "Don't have an account? " : 'Already have an account? '}
      <a href="#" onclick="goAuth('${isLogin ? 'register' : 'login'}');return false">${isLogin ? 'Sign Up' : 'Login'}</a></p>
    <p class="center"><a href="#" onclick="backHome();return false">← Back to home</a></p>
  </div></div>`;
}
window.doLogin = async () => {
  try {
    const d = await api('/api/login', { method: 'POST', body: JSON.stringify({ emailOrUsername: $('#f-email').value.trim(), password: $('#f-password').value }) });
    saveToken(d.token, $('#f-remember') ? $('#f-remember').checked : true);
    await loadMe(); view = 'play'; showNotice();
  } catch (e) { $('#auth-err').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};
window.doRegister = async () => {
  if (!$('#f-rules').checked) { $('#auth-err').innerHTML = '<div class="err">Tick the rules box to register</div>'; return; }
  const pw = $('#f-password').value, pw2 = $('#f-password2').value;
  if (pw !== pw2) { $('#auth-err').innerHTML = '<div class="err">Passwords do not match</div>'; return; }
  try {
    const d = await api('/api/register', { method: 'POST', body: JSON.stringify({ username: $('#f-username').value.trim(), email: $('#f-email').value.trim(), phone: $('#f-phone').value.trim(), password: pw }) });
    saveToken(d.token, true);
    await loadMe(); view = 'play'; showNotice();
  } catch (e) {
    // Duplicate account? Show the English message in red + a Login link.
    const dup = /already exists|already taken|belongs to another account/i.test(e.message || '');
    $('#auth-err').innerHTML = `<div class="err">${esc(e.message)}${dup ? ` <a href="#" onclick="goAuth('login');return false">Login</a>` : ''}</div>`;
  }
};
let fpContact = '', fpCooldownTimer = null;
window.openForgot = () => {
  fpContact = '';
  openModal(`<h2>Forgot Password</h2>
  <p class="muted">Enter the email or phone number on your account. We will send you a 6-digit reset code.</p>
  <div class="field"><label>Email or Phone</label><input id="fp-contact" type="text" placeholder="Email or phone number"></div>
  <div id="fp-err"></div>
  <button class="btn" style="margin-top:14px" onclick="doForgotSend()">Send Code</button>`);
};
window.doForgotSend = async () => {
  const contact = $('#fp-contact').value.trim();
  if (!contact) { $('#fp-err').innerHTML = '<div class="err">Enter your email or phone number</div>'; return; }
  try {
    const d = await api('/api/forgot-password/request', { method: 'POST', body: JSON.stringify({ emailOrPhone: contact }) });
    fpContact = contact;
    openForgotStep2(d.message || 'Code sent — check your email. If you didn\'t get it, contact Support.');
  } catch (e) { $('#fp-err').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};
function openForgotStep2(note) {
  openModal(`<h2>Enter Reset Code</h2>
  <p class="muted">${esc(note)}</p>
  <div class="field"><label>6-digit code</label><input id="fp-code" type="text" inputmode="numeric" maxlength="6" placeholder="••••••"></div>
  <div class="field"><label>New password (4+ characters)</label><input id="fp-pw" type="password" placeholder="••••••••"></div>
  <div class="field"><label>Confirm new password</label><input id="fp-pw2" type="password" placeholder="••••••••"></div>
  <div id="fp-err"></div>
  <button class="btn" style="margin-top:14px" onclick="doForgotVerify()">Reset Password</button>
  <button class="btn-ghost" style="margin-top:8px" id="fp-resend" onclick="doForgotResend()">Resend Code</button>`);
  startFpCooldown(60);
}
function startFpCooldown(sec) {
  const btn = $('#fp-resend');
  if (!btn) return;
  clearInterval(fpCooldownTimer);
  let left = sec;
  btn.disabled = true;
  btn.textContent = `Resend Code (${left}s)`;
  fpCooldownTimer = setInterval(() => {
    left -= 1;
    const b = $('#fp-resend');
    if (!b) { clearInterval(fpCooldownTimer); return; }
    if (left <= 0) { clearInterval(fpCooldownTimer); b.disabled = false; b.textContent = 'Resend Code'; return; }
    b.textContent = `Resend Code (${left}s)`;
  }, 1000);
}
window.doForgotResend = async () => {
  try {
    const d = await api('/api/forgot-password/request', { method: 'POST', body: JSON.stringify({ emailOrPhone: fpContact }) });
    $('#fp-err').innerHTML = `<div class="okmsg">${esc(d.message || 'Code sent again.')}</div>`;
    startFpCooldown(60);
  } catch (e) {
    $('#fp-err').innerHTML = `<div class="err">${esc(e.message)}</div>`;
    const m = /wait (\d+)/i.exec(e.message || '');
    if (m) startFpCooldown(Number(m[1]));
  }
};
window.doForgotVerify = async () => {
  const pw = $('#fp-pw').value, pw2 = $('#fp-pw2').value;
  if (pw !== pw2) { $('#fp-err').innerHTML = '<div class="err">Passwords do not match</div>'; return; }
  try {
    await api('/api/forgot-password/verify', { method: 'POST', body: JSON.stringify({ emailOrPhone: fpContact, code: $('#fp-code').value.trim(), newPassword: pw }) });
    closeModal(); toast('Password reset — login with your new password'); view = 'login'; render();
  } catch (e) { $('#fp-err').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};
const LW1V1_SHORT = [
  'সন্দেহজনক ইউজারকে কোনো নোটিশ ছাড়াই BAN করা হবে।',
  'অ্যাডমিন রুম দেওয়ার সময় থেকে ম্যাচ শেষ পর্যন্ত স্ক্রিন রেকর্ড বাধ্যতামূলক — ভিডিও দেখাতে না পারলে রিফান্ড / রিওয়ার্ড নেই।',
  'নিজের নামে জয়েন করতে হবে — অন্যের নামে জয়েন করলে কিক, কোনো রিফান্ড নেই।',
  '৫০ লেভেলের কম Free Fire আইডি দিয়ে জয়েন করলে কিক, কোনো রিফান্ড নেই।',
  'জয়েন করার পর কোনো রিফান্ড নেই।',
  'ম্যাচ শুরুর ৪/৫ মিনিট আগে রুমে ঢুকতে হবে; ২/৩ মিনিট আগে জয়েন করতে না পারলে রিফান্ড নেই।',
  '১v১-এ Teaming, ইমোট ব্যবহার, লাফালাফি, Zone বা Bomb দিয়ে নিজে মরা সম্পূর্ণ নিষিদ্ধ — করলে এন্ট্রি ফি বাজেয়াপ্ত হবে আর ম্যাচ বাতিল হবে।',
  'জেতা টাকা ম্যাচ শেষের ৩০ মিনিটের মধ্যে অ্যাকাউন্টে যোগ হবে।',
  '🔴 "S_19 TOURNAMENT ADMIN"-এর সিদ্ধান্তই চূড়ান্ত সিদ্ধান্ত 🔴',
];
function showNotice(stay) {
  modalRoot.innerHTML = `<div class="overlay center" onclick="if(event.target===this)closeModal()"><div class="notice-sheet">
  <div class="center"><img class="logo" src="/logo.webp" onerror="this.src='/icon-512.png'"><h2 style="margin-top:8px;letter-spacing:2px">WELCOME NOTICE</h2></div>
  <div class="notice-scroll" onscroll="noticeScrolled(this)">
    <ol class="notice-bn">
      <li>নিজের স্লট নম্বর মনে রাখবেন।</li>
      <li>Room Details থেকে পাওয়া ID ও Password দিয়ে কাস্টম রুমে ঢুকবেন।</li>
      <li>Observer থেকে নিজের স্লটে যাবেন।</li>
      <li>স্লটে সমস্যা হলে গেমে মেসেজ না দিয়ে Voice On করে হোস্টকে জানাবেন।</li>
      <li>⚠ শৃঙ্খলা বজায় রাখবেন — অযথা ভয়েস অন করে চিল্লাচিল্লি বা বিশৃঙ্খলা করবেন না। এটি টুর্নামেন্টের পরিবেশ নষ্ট করে।</li>
      <li>📹 ভিডিও রেকর্ড (Screen Record) বাধ্যতামূলক: আইডি-পাসওয়ার্ড নেওয়া থেকে শুরু করে ম্যাচ স্টার্ট হওয়া পর্যন্ত পুরো সময়টা ভিডিও করে রাখবেন। ভিডিও প্রমাণ ছাড়া কোনো প্রকার রিফান্ড (Refund) দাবি করলে তা গ্রহণযোগ্য হবে না।</li>
    </ol>
    <h3>🏆 LW 1v1 Match Rules (সংক্ষেপে)</h3>
    <ol class="notice-bn">
      ${LW1V1_SHORT.map((r) => `<li>${esc(r)}</li>`).join('')}
    </ol>
  </div>
  <div class="scroll-hint" id="notice-hint">⌄ Scroll down to continue</div>
  <button id="notice-accept" class="btn btn-readall" style="margin-top:10px" disabled onclick="acceptNotice(${stay ? 1 : 0})">READ ALL TO CONTINUE</button>
  </div></div>`;
}
window.noticeScrolled = (el) => {
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 12) {
    const b = $('#notice-accept');
    if (b && b.disabled) {
      b.disabled = false;
      b.textContent = 'ACCEPT & PROCEED';
      b.classList.remove('btn-readall');
      const h = $('#notice-hint');
      if (h) h.style.visibility = 'hidden';
    }
  }
};
window.acceptNotice = (stay) => {
  closeModal();
  if (!stay) { view = 'play'; render(); }
};
async function loadMe() {
  try { const d = await api('/api/me'); profile = d.profile; wallet = d.wallet; }
  catch (e) { token = ''; localStorage.removeItem('s19token'); sessionStorage.removeItem('s19token'); profile = null; }
}
async function loadTournaments() {
  try { tournaments = (await api('/api/tournaments')).tournaments; } catch (e) { tournaments = []; }
}

// ---------- play / matches ----------
const SUBS = { br: ['Solo', 'Duo', 'Esports PRO'], cs: ['4v4', '1v1', 'Headshot Only'], lw: ['1v1', '2v2', 'Lose To Win', 'Headshot Only'] };
const LW1V1_RULES = ['সন্দেহজনক User কে কোনো নোটিশ ছাড়াই BAN করা হবে।', 'ম্যাচে অ্যাডমিন পান দেওয়া থেকে শুরু করে ম্যাচ স্টার্ট হওয়া পর্যন্ত ভিডিও করা লাগবে এবং অ্যাডমিন যদি ভিডিও চায় দেখাতে হবে।', 'জয়েন করার সময় আপনার নাম দিয়ে জয়েন করলে কিক দেওয়া হবে, কোনো প্রকার রিফান্ড এবং Winning Reward দেওয়া হবে না।', '৫০ লেভেলের কম Free Fire আইডি দিয়ে ম্যাচ জয়েন করলে, ম্যাচ থেকে কিক দেওয়া হলে কোনো প্রকার REFUND দেওয়া হবে না।', 'ম্যাচ জয়েন করার পর কোনো ধরনের রিফান্ড করা হবে না।', 'কোনো প্লেয়ার অন্য অ্যাপ থেকে ব্যান থাকলে আমাদের অ্যাপ থেকেও ব্যান করা হবে।', 'ম্যাচ সময়ের ৪/৫ মিনিট আগে Room-এ ঢুকতে হবে, ID ও Password পেয়ে যাবেন।', 'ম্যাচ শুরু হওয়ার ২/৩ মিনিট আগে কাস্টম জয়েন করতে না পারলে কোনো প্রকার Refund পাবেন না।', 'আমাদের অ্যাপে Notification-এ Room ID ও Password দেওয়া হয় না।', 'ম্যাচে রেকর্ড ভিডিও এবং Screenshot দিতে না পারলে সে ম্যাচে কোনো প্রকার Refund অথবা Reward দেওয়া হবে না।', 'ম্যাচ জিতলে কোনো সমস্যা হলে ম্যাচ শেষ হওয়ার সর্বোচ্চ ৫/১০ মিনিটের মধ্যে জানাতে হবে।', '১ভি১ ম্যাচে জয়েন করার পর আর কোনো Refund-এর ব্যবস্থা নেই।', '১ভি১ ম্যাচে কোনো ধরনের Teaming, ইমোট ব্যবহার, লাফালাফি, Zone অথবা Bomb মেরে নিজে মারা যাওয়া সম্পূর্ণ নিষিদ্ধ। এমনটি করলে Entry Fee বাজেয়াপ্ত করা হবে এবং ম্যাচটি বাতিল করা হবে।', '১ভি১ ম্যাচে শুধুমাত্র নির্ধারিত দুইজন প্লেয়ার খেলবে। অন্য কোনো প্লেয়ার অংশগ্রহণ করতে পারবে না।', 'ম্যাচ "WINNINGS"-এর টাকা ম্যাচ শেষ হওয়ার ৩০ মিনিটের মধ্যে Account-এ Add দেওয়া হবে।', 'যেকোনো সমস্যা বা সহযোগিতার ক্ষেত্রে আমাদের SUPPORT-এ যোগাযোগ করতে হবে।', '🔴 "S_19 TOURNAMENT ADMIN"-এর সিদ্ধান্তই চূড়ান্ত সিদ্ধান্ত 🔴'];

function topbarHTML() {
  const upcomingMine = tournaments.filter((m) => (m.status === 'upcoming' || m.status === 'live') && m.bookings.some((b) => profile && b.profile_id === profile.id && (b.status === 'pending' || b.status === 'approved'))).length;
  return `<div class="topbar"><img class="logo-sm" src="/logo.webp" onerror="this.src='/icon-192.png'">
  <div><b>S_19 <span class="red">TOURNAMENT</span></b><div class="muted" style="font-size:11px">WELCOME BACK, ${esc(profile ? profile.username.toUpperCase() : 'PLAYER')} ${profile && profile.isAdmin ? '<span class="admin-badge">ADMIN</span>' : ''}</div></div>
  <div class="sp"></div>
  ${profile ? `<span class="id-chip">S_19 ID #${profile.accountId}</span>` : ''}
  <button class="bell-btn" onclick="view='mymatches';render()" aria-label="Notifications">🔔${upcomingMine ? `<span class="bell-count">${upcomingMine}</span>` : ''}</button>
  <span class="chip">৳${wallet ? wallet.depositBalance + wallet.winningBalance : 0}</span></div>`;
}
function bottomnavHTML() {
  const items = [['topup', '💎', 'Diamond Topup'], ['results', '📊', 'Results'], ['play', '🎮', 'Play'], ['mymatches', '🏆', 'My Matches'], ['profile', '👤', 'Profile']];
  return `<div class="bottomnav">${items.map(([v, ic, lb]) => `<button class="${view === v ? 'on' : ''}" onclick="view='${v}';render()"><span class="ic">${ic}</span>${lb}</button>`).join('')}</div><button class="chat-fab" onclick="openSupport()" aria-label="Customer Support">💬</button>`;
}
function matchCard(m) {
  const taken = m.bookings.filter((b) => b.status === 'pending' || b.status === 'approved').length;
  const pct = Math.round((taken / m.totalSlots) * 100);
  const full = taken >= m.totalSlots;
  const isLW1v1 = m.category === 'lw' && m.subcategory === '1v1';
  const rulesLine = (m.category === 'br' || m.category === 'lw')
    ? `<p class="rules-line">🚫 ম্যাচে জয়েন করার আগে রুলস পড়ে নেন। রুলস ভঙ্গ করলে রিওয়ার্ড দেওয়া হবে না &amp; রিফান্ড পাবেন না</p>` : '';
  const shield = (SUB_META[m.category] && SUB_META[m.category].shield[m.subcategory]) || 'S_19 TOURNAMENT';
  const tile = (ic, cls, label, val, gold) => `<div class="tile"><span class="tile-ic ${cls}">${ic}</span><span class="tile-txt"><span>${label}</span><b class="${gold ? 'gold' : ''}">${val}</b></span></div>`;
  return `<div class="card match">
    <span class="badge">#${m.id}</span>
    <div class="match-head">
      <span class="shield-tile sm"><img class="shield-logo" src="/logo.webp" alt="" onerror="this.style.display='none'"><span class="shield-label">${esc(shield)}</span></span>
      <div class="match-head-txt">
        <h3 style="cursor:pointer" onclick="${isLW1v1 ? `showLW1v1Rules(${m.id})` : ''}">${esc(m.title)}</h3>
        <div class="match-date">📅 ${esc(fmtDateTime(m))}</div>
      </div>
    </div>
    ${rulesLine}
    <div class="tiles">
      ${tile('🏆', 'ic-gold', 'PRIZE', m.prizePool + ' TK', true)}
      ${tile('👤', 'ic-blue', 'TYPE', esc(m.subcategory), false)}
      ${tile('🪙', 'ic-green', 'FEE', m.entryFee + ' TK', false)}
      ${tile('💀', 'ic-red', 'KILL', m.perKillPrize + ' TK', false)}
      ${tile('🗺️', 'ic-teal', 'MAP', esc(m.map), false)}
      ${tile('👁️', 'ic-purple', 'POV', esc(m.pov), false)}
    </div>
    <div class="reg-row"><span class="reg-label">👥 Registration</span><b>${taken}/${m.totalSlots}</b></div>
    <div class="regbar"><i style="width:${pct}%"></i></div>
    <button class="btn join-btn ${full ? 'btn-full' : ''}" ${m.status !== 'upcoming' || full ? 'disabled' : ''} onclick="openSlots(${m.id})">${full ? 'Match Full' : '🚀 Join Now'}</button>
    <div class="row3">
      <button class="btn" onclick="openSlots(${m.id})">👥 Slots</button>
      <button class="btn" onclick="openRoom(${m.id})">🚪 Room</button>
      <button class="btn" onclick="openPrizes(${m.id})">🏆 Prizes</button>
    </div>
    <div class="countdown" data-cd="${m.id}" data-start="${matchStartMs(m)}" data-status="${m.status}">${esc(countdownText(m))}</div>
  </div>`;
}
function playHTML() {
  return `${topbarHTML()}<div class="wrap">
  <div class="banner-carousel">
    <div class="car-slide on" onclick="openCategory('br')">
      <img class="car-logo" src="/logo.webp" onerror="this.src='/icon-512.png'">
      <div><b>S_19 TOURNAMENT</b><div class="car-sub">PLAY WIN ENJOY — Daily BR • CS • Lone Wolf matches. Win real Taka prizes!</div></div>
    </div>
    <div class="car-slide" onclick="openSupport()">
      <div class="car-ic">🎧</div>
      <div><b>Need any Help?</b><div class="car-sub">Customer Support 24/7 — tap here to contact the admin.</div></div>
    </div>
    <div class="car-slide car-telegram" onclick="openSupport()">
      <div class="car-ic">✈️</div>
      <div><b>S_19 on Telegram</b><div class="car-sub">Match updates &amp; announcements — tap to contact Support.</div></div>
    </div>
    <div class="car-dots"><button class="car-dot on" onclick="bannerGo(0)" aria-label="Slide 1"></button><button class="car-dot" onclick="bannerGo(1)" aria-label="Slide 2"></button><button class="car-dot" onclick="bannerGo(2)" aria-label="Slide 3"></button></div>
  </div>
  <div class="help-row">
    <span class="help-ic">🎧<i class="help-dot"></i></span>
    <span class="help-txt"><b>Need any Help?</b><span>● Customer Support</span></span>
    <button class="help-contact" onclick="openSupport()">Contact ›</button>
  </div>
  <div class="cat-cards">
    ${[['br', 'BR MATCH', 'BR MATCHES', 'Solo • Duo • Esports PRO'], ['cs', 'CS MATCH', 'CS MATCHES', '4v4 • 1v1 • Headshot Only'], ['lw', 'LONE WOLF MATCH', 'LW MATCHES', '1v1 • 2v2 • Lose To Win • Headshot Only']].map(([c, shield, lb, sub]) => { const n = tournaments.filter((m) => m.category === c && m.status === 'upcoming').length; return `<button class="cat-card cat-${c}" onclick="openCategory('${c}')">
      <span class="shield-tile"><img class="shield-logo" src="/logo.webp" alt="" onerror="this.style.display='none'"><span class="shield-label">${shield}</span></span>
      <span class="cat-body"><b class="cat-title">${lb}</b><span class="cat-sub">${sub}</span><span class="live-badge">● ${n} Matches Live</span></span>
      <span class="cat-arrow">›</span>
    </button>`; }).join('')}
  </div>
  </div>${bottomnavHTML()}`;
}
// Category page: big sub-category cards (BR Solo / Duo / Esports PRO …).
// Tap one to open its match list. Display names + shield labels match the reference.
const SUB_META = {
  br: { title: 'BR MATCHES', labels: { Solo: 'BR Solo', Duo: 'BR Duo', 'Esports PRO': 'BR E-Sports PRO League' }, shield: { Solo: 'BR SOLO', Duo: 'BR DUO', 'Esports PRO': 'BR E-SPORTS PRO LEAGUE' } },
  cs: { title: 'CS MATCHES', labels: { '4v4': 'Clash Squad', '1v1': 'CS 1v1', 'Headshot Only': 'CS Headshot Only' }, shield: { '4v4': 'CS 4 VS 4', '1v1': 'CS 1 VS 1', 'Headshot Only': 'CS HEADSHOT' } },
  lw: { title: 'LW MATCHES', labels: { '1v1': 'Lone Wolf 1V1', '2v2': 'Lone Wolf 2V2', 'Lose To Win': 'Lose To Win', 'Headshot Only': 'LW Headshot Only' }, shield: { '1v1': 'LONE WOLF 1 VS 1', '2v2': 'LONE WOLF 2 VS 2', 'Lose To Win': 'LOSE TO WIN', 'Headshot Only': 'LONE WOLF HEADSHOT' } },
};
function categoryHTML() {
  const meta = SUB_META[category];
  const subs = SUBS[category].map((s, i) => {
    const live = tournaments.filter((m) => m.category === category && m.subcategory === s && m.status === 'upcoming').length;
    return `<button class="cat-card sub-card sub-${category} anim-in" style="animation-delay:${i * 70}ms" onclick="openSub('${category}','${esc(s)}')">
      <span class="shield-tile"><img class="shield-logo" src="/logo.webp" alt="" onerror="this.style.display='none'"><span class="shield-label">${meta.shield[s]}</span></span>
      <span class="cat-body"><b class="cat-title">${esc(meta.labels[s])}</b><span class="live-badge">● ${live} Matches Live</span></span>
      <span class="cat-arrow">›</span>
    </button>`;
  }).join('');
  return `${topbarHTML()}<div class="wrap">
  <div class="page-head"><button class="back-arrow" onclick="backToHome()" aria-label="Back">←</button><h2>${meta.title}</h2><span class="head-spacer"></span></div>
  <div class="sub-cards">${subs}</div>
  </div>${bottomnavHTML()}`;
}
// Match list for one sub-category (reached from its category page).
function listHTML() {
  const list = tournaments.filter((m) => m.category === category && m.subcategory === subcategory);
  return `${topbarHTML()}<div class="wrap">
  <div class="page-head"><button class="back-arrow" onclick="backToCategory()" aria-label="Back">←</button><h2>${SUB_META[category].labels[subcategory] || esc(subcategory)}</h2><button class="tutorial-pill" onclick="openTutorial()">▶ Tutorial</button></div>
  <div class="tabs">
    <button class="${category === 'br' ? 'on' : ''}" onclick="openCategory('br')">BR MATCHES (${tournaments.filter((m) => m.category === 'br').length})</button>
    <button class="${category === 'cs' ? 'on' : ''}" onclick="openCategory('cs')">CS MATCHES (${tournaments.filter((m) => m.category === 'cs').length})</button>
    <button class="${category === 'lw' ? 'on' : ''}" onclick="openCategory('lw')">LW MATCHES (${tournaments.filter((m) => m.category === 'lw').length})</button>
  </div>
  <div class="subtabs">${SUBS[category].map((s) => `<button class="${subcategory === s ? 'on' : ''}" onclick="openSub('${category}','${esc(s)}')">${s}</button>`).join('')}</div>
  ${list.length ? list.map((m, i) => `<div class="anim-in" style="animation-delay:${i * 70}ms">${matchCard(m)}</div>`).join('') : '<div class="card center muted">No matches in this list yet.</div>'}
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
  const rankVals = [m.prize1, m.prize2, m.prize3, m.prize4, m.prize5];
  const hasRank = rankVals.some((v) => (v || 0) > 0);
  let rows;
  if (isBR || hasRank) {
    // Admin-set rank prizes win; BR Solo/Duo falls back to 90/70/40/30/20.
    const vals = hasRank ? rankVals : [90, 70, 40, 30, 20];
    const labels = ['1st Winner', '2nd Position', '3rd Position', '4th Position', '5th Position'];
    rows = vals.map((v, i) => `<div class="prize-tile"><span>${i + 1} ${labels[i]}</span><b>${v}</b></div>`).join('');
  } else {
    rows = `<div class="prize-tile"><span>Winner Prize</span><b>${m.prizePool} TK</b></div>`;
  }
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
  const slotBtn = (n) => `<button class="slot ${taken.has(n) ? 'taken' : ''}" ${taken.has(n) ? 'disabled' : ''} onclick="selectSlot(${n},this)">${n}</button>`;
  const teamOf = (label, nums) => `<div class="team-box"><div class="team-title">${label}</div><div class="slotgrid">${nums.map(slotBtn).join('')}</div></div>`;
  const isTeam = isTeamMatch(selectedMatch);
  // Team boxes split the total slots half/half (odd total: Team 1 gets the extra one),
  // so custom slot counts still render correctly.
  const half = Math.ceil(selectedMatch.totalSlots / 2);
  const grid = isTeam
    ? teamOf('Team 1', Array.from({ length: half }, (_, i) => i + 1)) + teamOf('Team 2', Array.from({ length: selectedMatch.totalSlots - half }, (_, i) => half + i + 1))
    : `<div class="slotgrid">${Array.from({ length: selectedMatch.totalSlots }, (_, i) => slotBtn(i + 1)).join('')}</div>`;
  openModal(`<h2>Select a Slot</h2>
  <div class="step-dots"><span class="step-dot on">1</span><span class="step-dot">2</span><span class="step-dot">3</span><span class="step-dot">4</span></div>
  <p class="muted center">Step 1 — pick a free slot · Step 2 — enter your in-game name · Step 3 — agree to the rules · Step 4 — confirm</p>
  ${myBooking ? `<div class="okmsg">You already booked slot ${myBooking.slot_number} (${myBooking.status}).</div>` : ''}
  ${grid}
  <div id="slot-err"></div>
  <button class="btn" style="margin-top:16px" onclick="proceedJoin()">PROCEED</button>`);
};
window.selectSlot = (n, el) => {
  selectedSlot = n;
  $$('.slot').forEach((s) => s.classList.remove('sel'));
  el.classList.add('sel');
};
function passForMatch(m) {
  if (!profile || !profile.passes || !m) return null;
  const cat = m.category;
  if (profile.passes[cat] > 0) return { type: cat, count: profile.passes[cat], label: cat.toUpperCase() + ' Match' };
  if (profile.passes.all > 0) return { type: 'all', count: profile.passes.all, label: 'All Match' };
  return null;
}
window.proceedJoin = () => {
  if (!selectedSlot) { $('#slot-err').innerHTML = '<div class="err">Pick a slot first</div>'; return; }
  const teamSize = teamSizeOf(selectedMatch);
  const squadFields = isTeamMatch(selectedMatch)
    ? `<div class="squad-box"><b>👥 Join with Squad (optional)</b>
      <p class="muted">Playing as a squad? Add your teammates' in-game names — they will be saved with your booking.</p>
      ${Array.from({ length: teamSize - 1 }, (_, i) => `<div class="field"><label>Teammate ${i + 2} in-game name (optional)</label><input id="f-squad-${i + 1}" placeholder="Teammate ${i + 2} name"></div>`).join('')}
    </div>` : '';
  // Free pass won on the Daily Spin wheel: category pass first, else All pass.
  const passInfo = passForMatch(selectedMatch);
  const passBox = passInfo ? `<div class="squad-box"><label style="display:flex;gap:8px;font-size:14px;align-items:flex-start"><input type="checkbox" id="f-usepass" style="width:auto;margin-top:2px"> <span>🎟️ <b>Use free pass</b> — you have ${passInfo.count} ${passInfo.label} pass${passInfo.count > 1 ? 'es' : ''}. Entry fee will be <b>৳0</b>.</span></label></div>` : '';
  openModal(`<h2>Enter Player Name</h2>
  <div class="step-dots"><span class="step-dot done">1</span><span class="step-dot on">2</span><span class="step-dot">3</span><span class="step-dot">4</span></div>
  <p class="muted">Join only with your own registered in-game name. Only the registered player may play — inviting an unregistered player means a permanent ban.</p>
  <div class="field"><label>Player Name (exact in-game name)</label><input id="f-playername" value="${esc(profile ? profile.ign : '')}"></div>
  ${squadFields}
  ${passBox}
  <label style="display:flex;gap:8px;margin-top:14px;font-size:14px"><input type="checkbox" id="f-agree" style="width:auto"> I have read the match rules</label>
  <div id="join-err"></div>
  <button class="btn" style="margin-top:16px" onclick="confirmJoin()">I Agree and Confirm</button>`);
};
window.confirmJoin = async () => {
  if (!$('#f-agree').checked) { $('#join-err').innerHTML = '<div class="err">Tick the rules box first</div>'; return; }
  const squadNames = [];
  if (isTeamMatch(selectedMatch)) {
    for (let i = 1; i < teamSizeOf(selectedMatch); i++) {
      const el = $('#f-squad-' + i);
      if (el && el.value.trim()) squadNames.push(el.value.trim());
    }
  }
  const usePass = !!($('#f-usepass') && $('#f-usepass').checked);
  try {
    const d = await api(`/api/tournaments/${selectedMatch.id}/book`, { method: 'POST', body: JSON.stringify({ slotNumber: selectedSlot, playerName: $('#f-playername').value.trim(), squadNames, usePass }) });
    await loadTournaments(); await loadMe();
    openModal(`<h2>✅ Join Group</h2>
    <p style="line-height:1.7;margin-top:10px">You booked <b>slot ${selectedSlot}</b> in <b>${esc(selectedMatch.title)}</b>. Your booking is pending owner approval.</p>
    ${d.usedPass ? `<p style="line-height:1.7;margin-top:8px">🎟️ Joined free with your <b>${esc(d.usedPass.toUpperCase())} Match</b> pass — no entry fee charged.</p>` : ''}
    ${squadNames.length ? `<p style="line-height:1.7;margin-top:8px">👥 <b>Your squad:</b> ${esc(squadNames.join(', '))}</p>` : ''}
    <div class="warn">⚠ You will get the custom ID password 2 to 4 minutes before the match starts in the Room Details Button. Stay in the Join Group screen and wait.</div>
    <button class="btn" style="margin-top:14px" onclick="closeModal();view='mymatches';render()">Go to My Matches</button>`);
  } catch (e) { $('#join-err').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};

// ---------- my matches / results ----------
function myMatchesHTML() {
  const mine = [];
  tournaments.forEach((m) => m.bookings.filter((b) => profile && b.profile_id === profile.id).forEach((b) => mine.push({ m, b })));
  return `${topbarHTML()}<div class="wrap"><h2 style="margin-top:14px">My Matches</h2>
  ${mine.length ? mine.map(({ m, b }) => { const sq = squadList(b); return `<div class="card"><b>${esc(m.title)}</b> <span class="badge">#${m.id}</span>
    <div class="muted" style="margin-top:6px">${esc(m.matchDate)} ${esc(m.matchTime)} · Slot ${b.slot_number} · ${esc(b.status)}</div>
    ${b.used_pass ? `<div class="muted" style="margin-top:4px">🎟️ Joined with free ${esc(b.used_pass.toUpperCase())} Match pass</div>` : ''}
    ${sq.length ? `<div class="muted" style="margin-top:4px">👥 Squad: ${esc(sq.join(', '))}</div>` : ''}
    <div class="row3" style="grid-template-columns:1fr 1fr"><button class="btn-ghost" onclick="openRoom(${m.id})">🚪 Room Details</button>
    ${b.status === 'pending' ? `<button class="btn-ghost" onclick="cancelBooking(${b.id})">Cancel</button>` : ''}</div></div>`; }).join('')
    : '<div class="card center muted">You have not joined any match yet.</div>'}
  </div>${bottomnavHTML()}`;
}
window.cancelBooking = async (id) => {
  try { await api(`/api/bookings/${id}/cancel`, { method: 'POST' }); await loadTournaments(); render(); toast('Booking cancelled'); }
  catch (e) { toast(e.message); }
};
function resultsHTML() {
  const allRows = [];
  tournaments.forEach((m) => m.results.forEach((r) => allRows.push({ m, r })));
  const tabs = [['all', 'All'], ['br-solo', 'BR Solo'], ['br-duo', 'BR Duo'], ['br-pro', 'BR E-Sports PRO'], ['cs', 'CS'], ['lw', 'LW']];
  const rows = allRows.filter(({ m }) => resultTab === 'all' ? true
    : resultTab === 'br-solo' ? (m.category === 'br' && m.subcategory === 'Solo')
    : resultTab === 'br-duo' ? (m.category === 'br' && m.subcategory === 'Duo')
    : resultTab === 'br-pro' ? (m.category === 'br' && m.subcategory === 'Esports PRO')
    : resultTab === 'cs' ? m.category === 'cs' : m.category === 'lw');
  return `${topbarHTML()}<div class="wrap"><h2 style="margin-top:14px">Results</h2>
  <div class="subtabs">${tabs.map(([v, lb]) => `<button class="${resultTab === v ? 'on' : ''}" onclick="resultTab='${v}';render()">${lb}</button>`).join('')}</div>
  ${rows.length ? rows.map(({ m, r }) => `<div class="card anim-in"><b>${esc(m.title)}</b><div class="kv"><span>${esc(r.player_name)}</span><b>#${r.placement} · ${r.kills} kills · ${r.points} pts · ৳${r.prize}</b></div></div>`).join('')
    : '<div class="card center muted">No results published yet.</div>'}
  <h2 style="margin-top:20px">Leaderboard</h2><div id="lb"><div class="spinner"></div></div></div>${bottomnavHTML()}`;
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
  const dep = wallet ? wallet.depositBalance : 0;
  const win = wallet ? wallet.winningBalance : 0;
  const row = (ic, title, sub, act) => `<button class="menu-row" onclick="${act}">
    <span class="menu-ic">${ic}</span>
    <span class="menu-tx"><b>${title}</b><span>${sub}</span></span>
    <span class="menu-arrow">›</span></button>`;
  return `${topbarHTML()}<div class="wrap">
  <div class="wallet-hero">
    <div class="wallet-hero-top"><span>💰 S_19 TOURNAMENT</span><b>WALLET</b></div>
    <div class="wallet-hero-bal"><span>Available Balance</span><b>৳${dep + win}</b></div>
  </div>
  <div class="wallet-tiles">
    <div class="wallet-tile"><span class="wt-ic">💰</span><span>DEPOSITED</span><b>৳${dep}</b></div>
    <div class="wallet-tile"><span class="wt-ic">🏆</span><span>WINNING</span><b>৳${win}</b></div>
  </div>
  <div class="wallet-actions">
    <button class="wallet-btn wallet-btn-blue" onclick="openDeposit()">+<span>Add Money</span></button>
    <button class="wallet-btn wallet-btn-green" onclick="openWithdraw()">↑<span>Withdraw</span></button>
  </div>
  <button class="wallet-btn wallet-btn-purple" onclick="openTransfer()">⇄<span>Transfer Balance</span></button>
  <div class="menu-list">
    ${row('📋', 'Transaction History', 'View all your transactions', 'openTxHistory()')}
    ${row('❓', 'How to add money?', 'Learn how to deposit money to your wallet', 'openHowToAddMoney()')}
    ${row('🎮', 'How to join a match?', 'Learn how to join ongoing matches', 'openTutorial()')}
    ${row('🚪', 'How to withdraw?', 'Learn how to withdraw your winnings', 'openHowToWithdraw()')}
  </div>
  </div>${bottomnavHTML()}`;
}
window.openTxHistory = () => {
  const tx = wallet ? wallet.transactions : [];
  openModal(`<h2>Transaction History</h2>
  ${tx.length ? tx.map((x) => `<div class="card"><div class="kv"><span>${esc(x.type)} · ${esc(x.method || '')} ${esc(x.trx_id || '')}</span><b>৳${x.amount} · ${esc(x.status)}</b></div><div class="muted">${esc(x.note || '')} · ${esc(x.created_at.slice(0, 10))}</div></div>`).join('')
    : '<div class="card center muted">No transactions yet.</div>'}
  <button class="btn" style="margin-top:14px" onclick="closeModal()">Close</button>`);
};
window.openHowToAddMoney = () => openModal(`<h2>How to add money?</h2>
  <ol class="rulelist">
    <li>Tap <b>+ Add Money</b> in your Wallet.</li>
    <li>Pick <b>BKASH &amp; NAGAD</b> or <b>Rocket</b> and enter an amount (৳10 – ৳1000).</li>
    <li>Tap <b>Proceed to Payment</b> — you will see the owner's number.</li>
    <li>Send Money from your bKash / Nagad / Rocket app to that number.</li>
    <li>Paste your <b>sender number</b> and the <b>TrxID</b>, then tap <b>Verify</b>.</li>
    <li>Your request stays <b>pending</b> until the owner approves it — then the money appears in your Deposit Balance.</li>
  </ol><button class="btn" style="margin-top:14px" onclick="closeModal()">Got it</button>`);
window.openHowToWithdraw = () => openModal(`<h2>How to withdraw?</h2>
  <ol class="rulelist">
    <li>Only your <b>Winning Balance</b> can be withdrawn — Deposit Balance cannot.</li>
    <li>Minimum withdrawal is <b>৳100</b>, open 10:00 AM – 9:30 PM Dhaka time.</li>
    <li>Tap <b>Withdraw</b>, enter the amount and your bKash / Nagad / Rocket number, then send the request.</li>
    <li>The owner approves it and sends the money to your number.</li>
  </ol><button class="btn" style="margin-top:14px" onclick="closeModal()">Got it</button>`);
// Transfer Balance: Winning -> Deposit only (Deposit can never go back).
window.openTransfer = () => {
  openModal(`<h2>Transfer Balance</h2>
  <p class="muted" style="margin-top:8px;line-height:1.6">Move money from your <b>Winning Balance</b> to your <b>Deposit Balance</b> so you can pay entry fees. Deposit Balance can never be moved back or withdrawn.</p>
  <div class="card"><div class="kv"><span>🏆 Winning Balance</span><b>৳${wallet ? wallet.winningBalance : 0}</b></div>
  <div class="kv"><span>💰 Deposit Balance</span><b>৳${wallet ? wallet.depositBalance : 0}</b></div></div>
  <div class="field"><label>Amount to transfer (৳)</label><input id="tr-amt" type="number" placeholder="e.g. 100"></div>
  <div id="tr-err"></div>
  <button class="btn" style="margin-top:14px" onclick="doTransfer()">Transfer to Deposit</button>`);
};
window.doTransfer = async () => {
  const amt = Number($('#tr-amt').value);
  try {
    await api('/api/transfer-balance', { method: 'POST', body: JSON.stringify({ amount: amt }) });
    await loadMe(); closeModal(); render(); toast(`৳${amt} moved to Deposit Balance`);
  } catch (e) { const el = $('#tr-err'); if (el) el.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};
window.openDeposit = async () => {
  const info = await api('/api/payment-info').catch(() => ({ bkashNumber: '', nagadNumber: '', rocketNumber: '' }));
  window.depInfo = info;
  window.depGateway = 'mfs'; // 'mfs' = BKASH & NAGAD, 'rocket' = Rocket
  window.depMethod = 'bkash';
  openModal(`<div class="addmoney-hero"><div class="addmoney-ic">💼</div>
    <h2>Add Money</h2>
    <p class="muted">Enter amount to add to your wallet</p></div>
  <div class="dep-note"><span class="dep-note-ic">ⓘ</span><p>You can deposit a minimum of 10 Taka and a maximum of 1000 Taka. If you send less money, it will not be added, and the money will not be refunded. Send the amount of money you write when sending money.</p></div>
  <h3 style="margin-top:18px">Payment Gateway</h3>
  <div class="gw-pills">
    <button class="gw-pill on" id="gw-mfs" onclick="depPickGateway('mfs')">✓ BKASH &amp; NAGAD</button>
    <button class="gw-pill" id="gw-rocket" onclick="depPickGateway('rocket')">○ Rocket</button>
  </div>
  <div class="gw-sub" id="gw-sub">
    <button class="gw-pill sm on" id="gw-bkash" onclick="depPickMethod('bkash')">bKash</button>
    <button class="gw-pill sm" id="gw-nagad" onclick="depPickMethod('nagad')">Nagad</button>
  </div>
  <h3 style="margin-top:18px">Enter Amount</h3>
  <div class="amt-box"><span>৳</span><input id="dep-amt" type="number" inputmode="numeric" placeholder="10 - 1000" oninput="depCheck()"></div>
  <div id="dep-err"></div>
  <button class="btn btn-proceed" id="dep-proceed" style="margin-top:18px" disabled onclick="depStep2()">Proceed to Payment</button>`);
  depCheck();
};
window.depPickGateway = (g) => {
  window.depGateway = g;
  const mfs = $('#gw-mfs'), rk = $('#gw-rocket'), sub = $('#gw-sub');
  if (mfs) { mfs.classList.toggle('on', g === 'mfs'); mfs.innerHTML = (g === 'mfs' ? '✓ ' : '○ ') + 'BKASH &amp; NAGAD'; }
  if (rk) { rk.classList.toggle('on', g === 'rocket'); rk.innerHTML = (g === 'rocket' ? '✓ ' : '○ ') + 'Rocket'; }
  if (sub) sub.style.display = g === 'mfs' ? 'flex' : 'none';
  if (g === 'rocket') window.depMethod = 'rocket';
  else if (window.depMethod === 'rocket') window.depMethod = 'bkash';
  depCheck();
};
window.depPickMethod = (m) => {
  window.depMethod = m;
  const b = $('#gw-bkash'), n = $('#gw-nagad');
  if (b) b.classList.toggle('on', m === 'bkash');
  if (n) n.classList.toggle('on', m === 'nagad');
  depCheck();
};
window.depCheck = () => {
  const btn = $('#dep-proceed');
  if (!btn) return;
  const raw = $('#dep-amt') ? $('#dep-amt').value : '';
  const amt = Number(raw);
  const info = window.depInfo || {};
  const num = window.depMethod === 'bkash' ? info.bkashNumber : window.depMethod === 'nagad' ? info.nagadNumber : info.rocketNumber;
  const err = $('#dep-err');
  let msg = '';
  if (!num) {
    const name = window.depMethod === 'nagad' ? 'Nagad' : window.depMethod === 'rocket' ? 'Rocket' : 'bKash';
    msg = name + ' number not added yet — send via bKash for now.' + (window.depMethod === 'nagad' ? ' Nagad number will be added later.' : '');
  } else if (raw && (!Number.isInteger(amt) || amt < 10 || amt > 1000)) {
    msg = 'Amount must be ৳10 – ৳1000';
  }
  if (err) err.innerHTML = msg ? `<div class="err">${esc(msg)}</div>` : '';
  btn.disabled = !!msg || !amt;
};
window.depStep2 = async () => {
  const amt = Number($('#dep-amt').value);
  const method = window.depMethod || 'bkash';
  if (!Number.isInteger(amt) || amt < 10 || amt > 1000) { const el = $('#dep-err'); if (el) el.innerHTML = '<div class="err">Amount must be ৳10 – ৳1000</div>'; return; }
  const info = window.depInfo || (await api('/api/payment-info'));
  const num = method === 'bkash' ? info.bkashNumber : method === 'nagad' ? info.nagadNumber : info.rocketNumber;
  if (!num) {
    openModal(`<h2>Add Money</h2><div class="err" style="margin-top:14px">${method === 'nagad' ? 'Nagad number not added yet — send via bKash for now. Nagad number will be added later.' : 'Rocket number not added yet — send via bKash for now.'}</div><button class="btn" style="margin-top:14px" onclick="closeModal()">OK</button>`);
    return;
  }
  openModal(`<h2>Send Money — ${method === 'bkash' ? 'bKash' : method === 'nagad' ? 'Nagad' : 'Rocket'}</h2>
  <div class="card"><b>Send ৳${amt} to this ${method} number:</b>
    <div style="font-size:22px;font-weight:800;margin:8px 0">${esc(num)}</div>
    <button class="btn-ghost btn-sm" onclick="navigator.clipboard&&navigator.clipboard.writeText('${esc(num)}');toast('Number copied')">Copy number</button>
    <p class="muted" style="margin-top:8px">Send Money from your ${method} app, then paste the TrxID below.</p></div>
  <div class="field"><label>Your sender number</label><input id="dep-sender" placeholder="01XXXXXXXXX"></div>
  <div class="field"><label>TrxID (8–12 letters/digits)</label><input id="dep-trx" placeholder="e.g. 9HX7K2LM1P"></div>
  <div id="dep-err"></div>
  <button class="btn" style="margin-top:14px" onclick="depVerify('${method}',${amt})">Verify</button>`);
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

// ---------- diamond topup (display only) ----------
// Shop front: banner + BD / Indonesia server pack cards. Top-up is NOT
// active yet — tapping a pack only shows "Top-up coming soon". No order,
// no payment, no money moves here.
const TOPUP_PACKS_BD = [
  { key: 'uid', name: 'UID TOPUP', bn: 'আইডি কোড টপআপ', ic: '💎', cls: 'tp-uid' },
  { key: 'levelup', name: 'Level Up Pass', bn: 'লেভেল আপ পাস', ic: '🆙', cls: 'tp-level' },
  { key: 'weekly-lite', name: 'Weekly Lite', bn: 'WEEKLY LITE', ic: '📦', cls: 'tp-lite' },
  { key: 'weekly-monthly', name: 'Weekly & Monthly', bn: 'উইকলি মান্থলি', ic: '🗓️', cls: 'tp-wm' },
];
const TOPUP_PACKS_ID = [
  { key: 'uid-id', name: 'UID Topup', bn: 'আইডি কোড টপআপ', ic: '💎', cls: 'tp-uid' },
  { key: 'weekly-id', name: 'Weekly', bn: 'WEEKLY', ic: '📦', cls: 'tp-lite' },
];
function topupHTML() {
  const bal = wallet ? wallet.depositBalance + wallet.winningBalance : 0;
  const card = (p) => `<button class="topup-card" onclick="topupSoon()">
    <span class="topup-tile ${p.cls}"><span class="topup-ic">${p.ic}</span><span class="topup-bn">${esc(p.bn)}</span></span>
    <span class="topup-name">${esc(p.name)}</span></button>`;
  return `<div class="wrap">
  <div class="topup-head">
    <button class="topup-bal" onclick="view='wallet';render()">💰 ৳${bal}</button>
    <button class="topup-lang" onclick="setLang(lang==='en'?'bn':'en')">${lang === 'en' ? 'বাংলা' : 'EN'}</button>
  </div>
  <div class="topup-banner">
    <img class="topup-logo" src="/logo.webp" alt="S_19 Tournament" onerror="this.style.display='none'">
    <div class="topup-banner-txt">
      <div class="topup-badges"><span class="topup-badge">৪৯ টাকায় উইকলি</span><span class="topup-badge">১ টাকায় উইকলি লাইট</span></div>
      <b>সব থেকে কম দামে<br>টপ-আপ করুন মাত্র<br>৫ সেকেন্ডে</b>
    </div>
  </div>
  <h2 class="topup-sec">FREE FIRE TOPUP BD SERVER</h2>
  <div class="topup-grid">${TOPUP_PACKS_BD.map(card).join('')}</div>
  <h2 class="topup-sec">INDONESIA SERVER</h2>
  <div class="topup-grid">${TOPUP_PACKS_ID.map(card).join('')}</div>
  <p class="muted center" style="margin-top:18px">Top-up is coming soon — packs are shown for preview only.</p>
  </div>${bottomnavHTML()}`;
}
window.topupSoon = () => toast('Top-up coming soon');

// ---------- profile / admin ----------
function profileHTML() {
  const played = tournaments.reduce((n, m) => n + m.bookings.filter((b) => profile && b.profile_id === profile.id).length, 0);
  const wins = tournaments.reduce((n, m) => n + m.results.filter((r) => profile && r.profile_id === profile.id && r.placement === 1).length, 0);
  const wonTk = tournaments.reduce((n, m) => n + m.results.filter((r) => profile && r.profile_id === profile.id).reduce((s, r) => s + (r.prize || 0), 0), 0);
  const av = profile && profile.avatar ? profile.avatar : '/logo.webp';
  const menuRow = (ic, title, sub, act) => `<button class="menu-row" onclick="${act}">
    <span class="menu-ic">${ic}</span>
    <span class="menu-tx"><b>${title}</b><span>${sub}</span></span>
    <span class="menu-arrow">›</span></button>`;
  return `${topbarHTML()}<div class="wrap">
  <div class="profile-head">
    <div class="avatar-wrap">
      <img class="avatar-img" src="${esc(av)}" alt="Profile photo" onerror="this.onerror=null;this.src='/logo.webp'">
      <button class="avatar-cam" onclick="document.getElementById('avatar-input').click()" aria-label="Change photo">📷</button>
      <input type="file" id="avatar-input" accept="image/*" style="display:none" onchange="uploadAvatar(this)">
    </div>
    <h2 class="profile-name">${esc(profile ? profile.username : '')}</h2>
    <div class="profile-chips">
      <button class="id-pill" onclick="copyS19Id()">S_19 ID #${profile ? profile.accountId : ''} <span class="copy-ic">📋</span></button>
      <button class="edit-pill" onclick="editProfile()">✏️ Edit Profile</button>
    </div>
    <p class="muted" style="margin-top:10px;font-size:13px">IGN ${esc(profile ? profile.ign : '—')} · UID ${esc(profile ? profile.uid : '—')}</p>
  </div>
  <div class="profile-tiles">
    <div class="profile-tile hot" style="cursor:pointer" onclick="view='wallet';render()"><span>BDT<br>BALANCE</span><b class="red">৳${wallet ? wallet.depositBalance : 0}</b></div>
    <div class="profile-tile" style="cursor:pointer" onclick="view='wallet';render()"><span>TOPUP BALANCE</span><b>৳${wallet ? wallet.winningBalance : 0}</b></div>
    <div class="profile-tile"><span>TOTAL MATCHES</span><b>${played}</b></div>
    <div class="profile-tile"><span>TOTAL WON</span><b>৳${wonTk}</b></div>
  </div>
  <div class="menu-list">
    ${menuRow('👛', 'Wallet', 'Manage payments & withdrawals', "view='wallet';render()")}
    ${menuRow('📖', 'All Rules', 'Check gameplay guidelines', 'showNotice(1)')}
    ${menuRow('🎡', 'Daily Spin', profile && profile.spunToday ? 'Already spun today — come back tomorrow' : 'Spin to win free match passes', 'openSpin()')}
    ${menuRow('📊', 'Leaderboard', 'Top players & your rank', "view='results';render()")}
    ${profile && profile.isAdmin ? menuRow('⚙️', 'Admin Panel', 'Create rooms, approve payments & results', "view='admin';render()") : ''}
    ${menuRow('👨‍💻', 'Developer Profile', 'About S_19', 'devProfile()')}
    ${menuRow('🔄', 'Switch Account', 'Login with another account', 'switchAccount()')}
    ${menuRow('🚪', 'Logout', 'Sign out of this device', 'logout()')}
  </div></div>${bottomnavHTML()}`;
}
window.copyS19Id = () => {
  const id = profile ? String(profile.accountId) : '';
  if (navigator.clipboard) navigator.clipboard.writeText(id).then(() => toast('S_19 ID copied')).catch(() => toast('S_19 ID #' + id));
  else toast('S_19 ID #' + id);
};
window.uploadAvatar = (input) => {
  const f = input.files && input.files[0];
  if (!f) return;
  if (!f.type.startsWith('image/')) { toast('Choose an image file'); return; }
  const rd = new FileReader();
  rd.onload = () => {
    const img = new Image();
    img.onload = async () => {
      // Downscale to 256x256 (cover crop) so the stored data URL stays small.
      const c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      const ctx = c.getContext('2d');
      const s = Math.min(img.width, img.height), sx = (img.width - s) / 2, sy = (img.height - s) / 2;
      ctx.drawImage(img, sx, sy, s, s, 0, 0, 256, 256);
      try {
        const d = await api('/api/profile/avatar', { method: 'POST', body: JSON.stringify({ avatar: c.toDataURL('image/jpeg', 0.85) }) });
        profile = d.profile; render(); toast('Profile photo updated');
      } catch (e) { toast(e.message); }
    };
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
  input.value = '';
};
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
// ---------- daily spin wheel ----------
function stopSpinTimer() { if (spinTimer) { clearInterval(spinTimer); spinTimer = null; } }
function startSpinCountdown() {
  stopSpinTimer();
  const tick = () => {
    const el = $('#spin-countdown');
    if (!el || !spinState) { stopSpinTimer(); return; }
    const ms = spinState.nextSpinAt - Date.now();
    if (ms <= 0) { el.textContent = 'You can spin again — reopen Daily Spin'; stopSpinTimer(); return; }
    const s = Math.floor(ms / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    el.textContent = `Next Spin in ${hh}:${mm}:${ss}`;
  };
  tick();
  spinTimer = setInterval(tick, 1000);
}
window.openSpin = async () => {
  try {
    spinState = await api('/api/daily-spin');
    view = 'spin'; render();
  } catch (e) { toast(e.message); }
};
function spinHTML() {
  if (!spinState) { setTimeout(() => openSpin(), 0); return '<div class="wrap center" style="padding-top:60px"><div class="spinner"></div></div>'; }
  const p = spinState.passes || { br: 0, cs: 0, lw: 0, all: 0 };
  const can = spinState.canSpin;
  const counters = [['BR', p.br, '#43a047'], ['CS', p.cs, '#f39c12'], ['LW', p.lw, '#1e88e5'], ['ALL', p.all, '#e53935']].map(([lb, n, c]) =>
    `<div class="spin-counter"><span class="spin-count" style="color:${c};border-color:${c}">${n}</span><span>${lb}</span></div>`).join('');
  const labels = SPIN_SEGMENTS.map((s, i) => {
    const a = i * 45 + 22.5;
    return `<div class="spin-label" style="transform:rotate(${a}deg)"><span>${s.label}</span></div>`;
  }).join('');
  const grad = SPIN_SEGMENTS.map((s, i) => `${s.color} ${i * 45}deg ${(i + 1) * 45}deg`).join(',');
  return `${topbarHTML()}<div class="wrap">
  <div class="spin-head"><button class="back-arrow" onclick="view='profile';render()" aria-label="Back">←</button><h2>Daily Spin</h2><span class="head-spacer"></span></div>
  <div class="spin-counters">${counters}</div>
  <div class="spin-wheel-wrap">
    <div class="spin-pointer"></div>
    <div id="spin-wheel" class="spin-wheel" style="background:conic-gradient(${grad});transform:rotate(${spinRotation}deg)">${labels}</div>
    <div class="spin-hub">🎯</div>
  </div>
  <p class="muted center" style="margin-top:14px">Spin once a day to win a free match pass. A pass lets you join a match without paying the entry fee.</p>
  <button id="spin-btn" class="btn spin-btn" style="margin-top:16px" ${can ? '' : 'disabled'} onclick="doSpin()">${can ? '🎡 Spin Now' : 'Spun today'}</button>
  ${can ? '' : `<p id="spin-countdown" class="center spin-countdown">Next Spin in --:--:--</p>`}
  </div>${bottomnavHTML()}`;
}
window.doSpin = async () => {
  if (spinBusy || !spinState || !spinState.canSpin) return;
  spinBusy = true;
  const btn = $('#spin-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Spinning...'; }
  try {
    const d = await api('/api/daily-spin', { method: 'POST' });
    spinState = d;
    // Animate the wheel to the server's segment: 5 full turns, then stop
    // with the pointer inside the winning segment (small random jitter).
    const center = d.segment * 45 + 22.5 + (Math.random() * 24 - 12);
    const cur = ((spinRotation % 360) + 360) % 360;
    const delta = (((-center - cur) % 360) + 360) % 360;
    spinRotation = spinRotation + 1800 + delta;
    const wheel = $('#spin-wheel');
    if (wheel) wheel.style.transform = `rotate(${spinRotation}deg)`;
    setTimeout(() => {
      spinBusy = false;
      loadMe();
      render();
      const won = d.prize !== 'none';
      openModal(`<h2>${won ? '🎉 You Won!' : '😕 No Prize'}</h2>
        <p class="center" style="line-height:1.7;margin-top:10px">${won
          ? `You won a free <b>${esc(d.prizeLabel)}</b> pass! Use it from any ${d.prize === 'all' ? 'BR, CS or LW' : d.prize.toUpperCase()} match — tick "Use free pass" when you join.`
          : 'You did not win this time. Better luck tomorrow!'}</p>
        <button class="btn" style="margin-top:14px" onclick="closeModal()">OK</button>`);
    }, 4400);
  } catch (e) {
    spinBusy = false; toast(e.message);
    if (btn) { btn.disabled = false; btn.textContent = '🎡 Spin Now'; }
  }
};
window.devProfile = () => openModal(`<h2>Developer Profile</h2><div class="card center"><img class="logo" src="/logo.webp" onerror="this.src='/icon-512.png'"><p style="margin-top:10px"><b>S_19</b></p><p class="muted">Voice of Bijoy · S_19 Tournament · S_19 CHAT BOOK · BR 19</p></div><button class="btn" style="margin-top:14px" onclick="closeModal()">Close</button>`);
window.logout = () => { clearToken(); profile = null; wallet = null; view = 'login'; render(); toast('Logged out'); };
window.switchAccount = () => { clearToken(); profile = null; wallet = null; view = 'login'; render(); toast('Login with another account, or Sign Up for a new one'); };

async function adminHTML() {
  const d = await api('/api/tournaments/admin');
  adminTournaments = d.tournaments;
  let resets = [];
  try { resets = (await api('/api/admin/reset-requests')).requests || []; } catch (e) {}
  let pendTx = [];
  try { pendTx = (await api('/api/admin/transactions')).requests || []; } catch (e) {}
  return `${topbarHTML()}<div class="wrap"><h2 style="margin-top:14px">Admin Panel</h2>
  <div class="card"><h3>Create custom room</h3>
    <div class="field"><label>Room name</label><input id="ad-title" maxlength="160" placeholder="e.g. BR Solo — Evening"></div>
    <div class="field"><label>Lobby</label><select id="ad-cat" onchange="adSub()"><option value="br">BR</option><option value="cs">CS</option><option value="lw">LW</option></select></div>
    <div class="field"><label>Subcategory</label><select id="ad-sub" onchange="adSlotsDefault()"></select></div>
    <div class="field"><label>Date</label><input id="ad-date" type="date" value="2026-11-20"></div>
    <div class="field"><label>Time</label><input id="ad-time" type="time" value="18:00"></div>
    <div class="field"><label>Prize (TK)</label><input id="ad-prize" type="number" value="800"></div>
    <div class="field"><label>Entry fee (TK)</label><input id="ad-fee" type="number" value="20"></div>
    <div class="field"><label>Per kill (TK)</label><input id="ad-kill" type="number" value="10"></div>
    <div class="field"><label>Total Slots (2–100)</label><input id="ad-slots" type="number" min="2" max="100" value="48"></div>
    <h4 style="margin-top:14px">🏆 Match Prizes (1st – 5th)</h4>
    <div class="field"><label>1st Prize (TK)</label><input id="ad-prize1" type="number" value="90"></div>
    <div class="field"><label>2nd Prize (TK)</label><input id="ad-prize2" type="number" value="70"></div>
    <div class="field"><label>3rd Prize (TK)</label><input id="ad-prize3" type="number" value="40"></div>
    <div class="field"><label>4th Prize (TK)</label><input id="ad-prize4" type="number" value="30"></div>
    <div class="field"><label>5th Prize (TK)</label><input id="ad-prize5" type="number" value="20"></div>
    <div class="field"><label>Room ID</label><input id="ad-roomid" placeholder="optional"></div>
    <div class="field"><label>Room password</label><input id="ad-roompw" placeholder="optional"></div>
    <div id="ad-err"></div>
    <button class="btn" style="margin-top:12px" onclick="createMatch()">Create Room</button></div>
  <div class="card"><h3>💰 Payment Requests (${pendTx.length})</h3>
  ${pendTx.length ? pendTx.map((t) => `<div class="kv"><span><b>${t.type === 'withdraw' ? 'Withdraw' : 'Deposit'}</b> · ৳${Math.abs(t.amount)} · ${esc(t.username)}${t.accountId ? ` (S_19 ID #${t.accountId})` : ''} · ${esc(t.method || '—')} · ${t.type === 'withdraw' ? 'to ' : 'from '}${esc(t.accountNumber || '—')}${t.trxId ? ` · TrxID: <b>${esc(t.trxId)}</b>` : ''} · ${new Date(t.createdAt).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><span><button class="btn-ghost btn-sm" onclick="reviewTx(${t.id},true)">Approve</button> <button class="btn-ghost btn-sm" onclick="reviewTx(${t.id},false)">Reject</button></span></div>`).join('')
    : '<p class="muted">No pending payment requests.</p>'}
  <p class="muted">Approve adds the money to the player's Deposit Balance; Reject adds nothing.</p></div>
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
    ${m.bookings.filter((b) => b.status === 'pending').map((b) => { const sq = squadList(b); return `<div class="kv"><span>Slot ${b.slot_number} · ${esc(b.player_name)} (pending)${sq.length ? ' · 👥 ' + esc(sq.join(', ')) : ''}</span><span><button class="btn-ghost btn-sm" onclick="reviewBooking(${b.id},true)">Approve</button> <button class="btn-ghost btn-sm" onclick="reviewBooking(${b.id},false)">Reject</button></span></div>`; }).join('')}
  </div>`).join('')}
  <div class="card"><h3>Publish result</h3>
    <div class="field"><label>Match</label><select id="rs-match">${adminTournaments.map((m) => `<option value="${m.id}">${esc(m.title)} — ${esc(m.matchDate)}</option>`).join('')}</select></div>
    <div class="field"><label>Player name</label><input id="rs-player" placeholder="in-game name"></div>
    <div class="field"><label>Placement (1-5)</label><input id="rs-place" type="number" value="1"></div>
    <div class="field"><label>Kills</label><input id="rs-kills" type="number" value="0"></div>
    <button class="btn" style="margin-top:12px" onclick="publishResult()">Publish Result</button></div>
  <div class="card"><h3>🔑 Password Reset Requests</h3>
  ${resets.length ? resets.map((r) => `<div class="kv"><span>${esc(r.contact)} · ${esc(r.channel)} · ${r.attemptsLeft} tries left · expires ${new Date(r.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${r.code ? ` · <b>Code: ${esc(r.code)}</b>` : ' · code emailed'}</span><button class="btn-ghost btn-sm" onclick="cancelReset(${r.id})">Cancel</button></div>`).join('')
    : '<p class="muted">No pending reset requests.</p>'}
  <p class="muted">Codes are emailed when SMTP is set up; otherwise the code shows here only for the admin, so Support can share it with the player.</p></div>
  <div class="card"><h3>Payment settings</h3>
    <div class="field"><label>bKash number</label><input id="pay-bkash" placeholder="01XXXXXXXXX"></div>
    <div class="field"><label>Nagad number</label><input id="pay-nagad" placeholder="01XXXXXXXXX"></div>
    <div class="field"><label>Rocket number</label><input id="pay-rocket" placeholder="01XXXXXXXXX"></div>
    <button class="btn" style="margin-top:12px" onclick="savePayment()">Save Payment Numbers</button></div>
  </div>${bottomnavHTML()}`;
}
window.cancelReset = async (id) => {
  try { await api(`/api/admin/reset-requests/${id}`, { method: 'DELETE' }); render(); toast('Reset request cancelled'); }
  catch (e) { toast(e.message); }
};
window.adSub = () => {
  const c = $('#ad-cat').value;
  $('#ad-sub').innerHTML = SUBS[c].map((s) => `<option>${s}</option>`).join('');
  // BR gets the standard 90/70/40/30/20 rank split by default; CS/LW start blank.
  const defs = c === 'br' ? [90, 70, 40, 30, 20] : ['', '', '', '', ''];
  for (let i = 1; i <= 5; i++) { const el = $('#ad-prize' + i); if (el) el.value = defs[i - 1]; }
  adSlotsDefault();
};
// Default slot count for the picked category/subcategory — the admin can
// type any number 2–100 over it. Same defaults as the server.
const SLOT_DEFAULTS = { 'br/Solo': 48, 'br/Duo': 50, 'br/Esports PRO': 50, 'cs/4v4': 8, 'cs/1v1': 2, 'cs/Headshot Only': 8, 'lw/1v1': 2, 'lw/2v2': 4, 'lw/Lose To Win': 2, 'lw/Headshot Only': 8 };
window.adSlotsDefault = () => {
  const el = $('#ad-slots');
  if (el) el.value = SLOT_DEFAULTS[$('#ad-cat').value + '/' + $('#ad-sub').value] ?? 8;
};
window.createMatch = async () => {
  try {
    await api('/api/tournaments', { method: 'POST', body: JSON.stringify({
      title: $('#ad-title').value.trim(), category: $('#ad-cat').value, subcategory: $('#ad-sub').value,
      mode: $('#ad-sub').value === 'Duo' || $('#ad-sub').value === '2v2' ? 'duo' : ($('#ad-sub').value === '4v4' || $('#ad-sub').value === 'Esports PRO' || $('#ad-sub').value === 'Headshot Only' ? 'squad' : 'solo'),
      matchType: $('#ad-cat').value === 'br' ? 'battle_royale' : $('#ad-cat').value === 'cs' ? 'clash_squad' : 'lone_wolf',
      matchDate: $('#ad-date').value, matchTime: $('#ad-time').value,
      prizePool: Number($('#ad-prize').value), entryFee: Number($('#ad-fee').value),
      totalSlots: Number($('#ad-slots').value),
      prize1: Number($('#ad-prize1').value) || 0, prize2: Number($('#ad-prize2').value) || 0,
      prize3: Number($('#ad-prize3').value) || 0, prize4: Number($('#ad-prize4').value) || 0,
      prize5: Number($('#ad-prize5').value) || 0,
      perKillPrize: Number($('#ad-kill').value), roomId: $('#ad-roomid').value.trim(), roomPassword: $('#ad-roompw').value.trim(),
    }) });
    await loadTournaments(); render(); toast('Room created');
  } catch (e) { $('#ad-err').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};
window.setStatus = async (id, st) => { await api(`/api/tournaments/${id}/status`, { method: 'POST', body: JSON.stringify({ status: st }) }); render(); };
window.cancelMatch = async (id) => { if (confirm('Cancel this match? Entry fees will be refunded.')) { await api(`/api/tournaments/${id}/cancel`, { method: 'POST' }); await loadTournaments(); render(); } };
window.deleteMatch = async (id) => { if (confirm('Delete this match? Entry fees will be refunded.')) { await api(`/api/tournaments/${id}`, { method: 'DELETE' }); await loadTournaments(); render(); } };
window.reviewBooking = async (id, ok) => { await api(`/api/bookings/${id}/review`, { method: 'POST', body: JSON.stringify({ approve: ok }) }); render(); };
window.reviewTx = async (id, ok) => {
  try { await api(`/api/transactions/${id}/review`, { method: 'POST', body: JSON.stringify({ approve: ok }) }); render(); toast(ok ? 'Payment approved — balance updated' : 'Payment request rejected'); }
  catch (e) { toast(e.message); }
};
window.editMatch = (id) => {
  const m = adminTournaments.find((x) => x.id === id);
  const booked = (m.bookings || []).filter((b) => b.status === 'pending' || b.status === 'approved').length;
  openModal(`<h2>Edit Match #${id}</h2>
  <div class="field"><label>Date</label><input id="em-date" type="date" value="${m.matchDate}"></div>
  <div class="field"><label>Time</label><input id="em-time" type="time" value="${m.matchTime}"></div>
  <div class="field"><label>Prize</label><input id="em-prize" type="number" value="${m.prizePool}"></div>
  <div class="field"><label>Entry fee</label><input id="em-fee" type="number" value="${m.entryFee}"></div>
  <div class="field"><label>Total Slots (2–100)</label><input id="em-slots" type="number" min="2" max="100" value="${m.totalSlots}"></div>
  ${booked ? `<p class="muted">⚠ ${booked} slot(s) already booked — slots cannot go below ${booked}.</p>` : ''}
  <h4 style="margin-top:14px">🏆 Match Prizes (1st – 5th)</h4>
  <div class="field"><label>1st Prize (TK)</label><input id="em-prize1" type="number" value="${m.prize1 || ''}"></div>
  <div class="field"><label>2nd Prize (TK)</label><input id="em-prize2" type="number" value="${m.prize2 || ''}"></div>
  <div class="field"><label>3rd Prize (TK)</label><input id="em-prize3" type="number" value="${m.prize3 || ''}"></div>
  <div class="field"><label>4th Prize (TK)</label><input id="em-prize4" type="number" value="${m.prize4 || ''}"></div>
  <div class="field"><label>5th Prize (TK)</label><input id="em-prize5" type="number" value="${m.prize5 || ''}"></div>
  <div class="field"><label>Room ID</label><input id="em-roomid" value="${esc(m.roomId)}"></div>
  <div class="field"><label>Room password</label><input id="em-roompw" value="${esc(m.roomPassword)}"></div>
  <div id="em-err"></div>
  <button class="btn" style="margin-top:14px" onclick="saveEditMatch(${id})">Save</button>`);
};
window.saveEditMatch = async (id) => {
  try {
    await api(`/api/tournaments/${id}`, { method: 'PUT', body: JSON.stringify({ matchDate: $('#em-date').value, matchTime: $('#em-time').value, prizePool: Number($('#em-prize').value), entryFee: Number($('#em-fee').value), totalSlots: Number($('#em-slots').value), prize1: Number($('#em-prize1').value) || 0, prize2: Number($('#em-prize2').value) || 0, prize3: Number($('#em-prize3').value) || 0, prize4: Number($('#em-prize4').value) || 0, prize5: Number($('#em-prize5').value) || 0, roomId: $('#em-roomid').value, roomPassword: $('#em-roompw').value }) });
    closeModal(); await loadTournaments(); render();
  } catch (e) { const el = $('#em-err'); if (el) el.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
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

// ---------- splash + render / init ----------
const splashStart = Date.now();
function hideSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const wait = Math.max(0, 5000 - (Date.now() - splashStart));
  setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 500); }, wait);
}
function noticeSeen() { try { return sessionStorage.getItem('s19noticeSeen') === '1'; } catch (e) { return false; } }
function markNoticeSeen() { try { sessionStorage.setItem('s19noticeSeen', '1'); } catch (e) {} }
function render() {
  stopBanner();
  stopSpinTimer();
  if (view === 'landing') app.innerHTML = landingHTML();
  else if (view === 'login' || view === 'register') app.innerHTML = authHTML();
  else if (view === 'play') app.innerHTML = playHTML();
  else if (view === 'cat') app.innerHTML = categoryHTML();
  else if (view === 'list') app.innerHTML = listHTML();
  else if (view === 'spin') { app.innerHTML = spinHTML(); if (spinState && !spinState.canSpin) startSpinCountdown(); }
  else if (view === 'mymatches') app.innerHTML = myMatchesHTML();
  else if (view === 'results') { app.innerHTML = resultsHTML(); loadLeaderboard(); }
  else if (view === 'wallet') app.innerHTML = walletHTML();
  else if (view === 'topup') app.innerHTML = topupHTML();
  else if (view === 'profile') app.innerHTML = profileHTML();
  else if (view === 'admin') { app.innerHTML = '<div class="wrap center" style="padding-top:60px"><div class="spinner"></div><p class="muted" style="margin-top:12px">Loading admin panel...</p></div>'; adminHTML().then((h) => { app.innerHTML = h; adSub(); }); return; }
  if (view === 'admin') return;
  if (view === 'play') startBanner();
}
setInterval(() => {
  $$('[data-cd]').forEach((el) => {
    const m = tournaments.find((x) => x.id === Number(el.dataset.cd));
    if (m) el.textContent = countdownText(m);
  });
}, 1000);

(async () => {
  await loadTournaments();
  const hadToken = !!token;
  if (token) { await loadMe(); if (profile) view = 'play'; }
  // Installed app: skip the landing/download page entirely —
  // splash -> login (logged out) or home (logged in). Browser links keep landing.
  if (view === 'landing' && isStandalone()) view = (token && profile) ? 'play' : 'login';
  // A saved login that stopped working goes to Login, never back to the
  // landing/download page — a logged-in phone never sees Download again.
  if (view === 'landing' && hadToken && !profile) view = 'login';
  render();
  hideSplash();
  // logged-in app open: splash -> Welcome Notice -> home (once per session)
  if (profile && !noticeSeen()) {
    markNoticeSeen();
    setTimeout(() => showNotice(), 600);
  }
})();
