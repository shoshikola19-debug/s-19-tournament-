// Smoke test: boots the server on a temp port with a fresh SQLite DB
// and exercises the whole money/slot loop. Run: npm test
'use strict';
const fs = require('fs');
const path = require('path');
process.env.PORT = '3101';
const DB = path.join(__dirname, '..', 'data', 's19-tournament.db');
try { fs.unlinkSync(DB); } catch (e) {}
const server = require('child_process');
const assert = require('assert');

function req(method, p, body, token) {
  return fetch('http://127.0.0.1:3101' + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
}

(async () => {
  const child = server.spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(String(d)));
  child.stderr.on('data', (d) => logs.push(String(d)));
  try {
    // wait for boot
    for (let i = 0; i < 40; i++) {
      try { const h = await req('GET', '/api/health'); if (h.data.ok) break; } catch (e) {}
      await new Promise((r) => setTimeout(r, 250));
    }
    const health = await req('GET', '/api/health');
    assert.strictEqual(health.data.ok, true, 'health');
    assert.strictEqual(health.data.engine, 'sqlite', 'sqlite engine locally');

    const list = await req('GET', '/api/tournaments');
    assert.strictEqual(list.data.tournaments.length, 10, '10 seeded tournaments, got ' + list.data.tournaments.length);
    const lw = list.data.tournaments.find((t) => t.id === 1);
    assert.strictEqual(lw.roomId, '', 'room hidden before reveal');
    assert.strictEqual(lw.hasRoom, true, 'hasRoom true for LW 1v1');
    const br = list.data.tournaments.find((t) => t.id === 2);
    assert.strictEqual(br.prizePool, 800, 'BR Solo prize 800');
    assert.strictEqual(br.totalSlots, 48, 'BR Solo 48 slots');

    // owner restore: seeded profile has no password; register sets it
    const reg = await req('POST', '/api/register', { username: 'bijoy', email: 'shoshikola19@gmail.com', phone: '+8801906502081', password: 'test1234' });
    assert.strictEqual(reg.status, 200, 'owner register: ' + JSON.stringify(reg.data));
    assert.strictEqual(reg.data.profile.isAdmin, true, 'owner is admin');
    const ownerToken = reg.data.token;

    // profile + UID, then deposit request (bad trx rejected, good one pending)
    await req('POST', '/api/profile', { ign: 'bijoy', uid: '4813953777' }, ownerToken);
    // avatar: invalid rejected, valid data URL saved and returned in /api/me
    const avBad = await req('POST', '/api/profile/avatar', { avatar: 'not-an-image' }, ownerToken);
    assert.strictEqual(avBad.status, 400, 'bad avatar rejected');
    const av = await req('POST', '/api/profile/avatar', { avatar: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }, ownerToken);
    assert.strictEqual(av.status, 200, 'avatar saved: ' + JSON.stringify(av.data));
    assert.ok(av.data.profile.avatar.startsWith('data:image/'), 'avatar returned in profile');
    const meAv = await req('GET', '/api/me', null, ownerToken);
    assert.ok(meAv.data.profile.avatar.startsWith('data:image/'), 'avatar present in /api/me');
    const bad = await req('POST', '/api/deposit', { amount: 100, method: 'bkash', senderNumber: '01906502081', trxId: 'abc' }, ownerToken);
    assert.strictEqual(bad.status, 400, 'bad trx rejected');
    // deposit limits 10–1000 (server-enforced); Nagad/Rocket blocked — no number set yet
    const dep9 = await req('POST', '/api/deposit', { amount: 9, method: 'bkash', senderNumber: '01906502081', trxId: 'LOWAMT001' }, ownerToken);
    assert.strictEqual(dep9.status, 400, 'deposit 9 rejected');
    const dep1001 = await req('POST', '/api/deposit', { amount: 1001, method: 'bkash', senderNumber: '01906502081', trxId: 'HIGHAMT01' }, ownerToken);
    assert.strictEqual(dep1001.status, 400, 'deposit 1001 rejected');
    const depNagad = await req('POST', '/api/deposit', { amount: 100, method: 'nagad', senderNumber: '01906502081', trxId: 'NAGAD0001' }, ownerToken);
    assert.strictEqual(depNagad.status, 400, 'nagad deposit blocked without number');
    const depRocket = await req('POST', '/api/deposit', { amount: 100, method: 'rocket', senderNumber: '01906502081', trxId: 'ROCKET001' }, ownerToken);
    assert.strictEqual(depRocket.status, 400, 'rocket deposit blocked without number');
    const dep = await req('POST', '/api/deposit', { amount: 200, method: 'bkash', senderNumber: '01906502081', trxId: 'TESTTRX01' }, ownerToken);
    assert.strictEqual(dep.status, 200, 'deposit request created');
    const dup = await req('POST', '/api/deposit', { amount: 200, method: 'bkash', senderNumber: '01906502081', trxId: 'testtrx01' }, ownerToken);
    assert.strictEqual(dup.status, 400, 'duplicate trx (case-insensitive) rejected');
    let me = await req('GET', '/api/me', null, ownerToken);
    assert.strictEqual(me.data.wallet.depositBalance, 0, 'nothing credited before approval');

    // admin approves deposit -> balance 200; book BR Solo slot 1 (fee 20)
    const ok = await req('POST', `/api/transactions/${dep.data.id}/review`, { approve: true }, ownerToken);
    assert.strictEqual(ok.status, 200, 'approve deposit');
    me = await req('GET', '/api/me', null, ownerToken);
    assert.strictEqual(me.data.wallet.depositBalance, 200, 'deposit credited on approval');
    const book = await req('POST', '/api/tournaments/2/book', { slotNumber: 1, playerName: 'bijoy' }, ownerToken);
    assert.strictEqual(book.status, 200, 'book slot: ' + JSON.stringify(book.data));
    const dbl = await req('POST', '/api/tournaments/2/book', { slotNumber: 1, playerName: 'bijoy' }, ownerToken);
    assert.strictEqual(dbl.status, 400, 'double-take of slot 1 rejected');
    me = await req('GET', '/api/me', null, ownerToken);
    assert.strictEqual(me.data.wallet.depositBalance, 180, 'fee 20 charged');

    // squad join: second user books CS 4v4 slot 1 with 3 teammates; names are stored
    const reg2 = await req('POST', '/api/register', { username: 'squadmate', email: 'squad@example.com', phone: '+8801912345678', password: 'test1234' });
    assert.strictEqual(reg2.status, 200, 'second user register: ' + JSON.stringify(reg2.data));
    const tok2 = reg2.data.token;
    await req('POST', '/api/profile', { ign: 'squadmate', uid: '1234567890' }, tok2);
    const sq = await req('POST', '/api/tournaments/5/book', { slotNumber: 1, playerName: 'squadmate', squadNames: ['mate1', 'mate2', 'mate3'] }, tok2);
    assert.strictEqual(sq.status, 200, 'squad book CS 4v4: ' + JSON.stringify(sq.data));
    const sqBad = await req('POST', '/api/tournaments/5/book', { slotNumber: 2, playerName: 'squadmate', squadNames: ['a', 'b', 'c', 'd'] }, tok2);
    assert.strictEqual(sqBad.status, 400, '4 squad names rejected');
    const afterSq = await req('GET', '/api/tournaments');
    const cs44 = afterSq.data.tournaments.find((t) => t.id === 5);
    const sqBk = cs44.bookings.find((b) => b.slot_number === 1);
    assert.ok(sqBk && JSON.parse(sqBk.squad_names || '[]').join(',') === 'mate1,mate2,mate3', 'squad names stored on booking');

    // publish result: 1st place, 7 kills -> prize 90 + 7*10 = 160 to winning
    const res = await req('POST', '/api/results', { tournamentId: 2, profileId: me.data.profile.id, playerName: 'bijoy', placement: 1, kills: 7 }, ownerToken);
    assert.strictEqual(res.status, 200, 'publish result');
    me = await req('GET', '/api/me', null, ownerToken);
    assert.strictEqual(me.data.wallet.winningBalance, 160, 'prize 160 to winning, got ' + me.data.wallet.winningBalance);

    // rank prizes: admin creates a BR Solo match with 1st-5th set, edits one,
    // and the result payout uses the admin-set rank prize
    const mk = await req('POST', '/api/tournaments', { title: 'BR Solo — Rank Test', category: 'br', subcategory: 'Solo', mode: 'solo', matchType: 'battle_royale', matchDate: '2026-11-20', matchTime: '19:00', prizePool: 800, entryFee: 20, prize1: 90, prize2: 70, prize3: 40, prize4: 30, prize5: 20, perKillPrize: 10 }, ownerToken);
    assert.strictEqual(mk.status, 200, 'create match with rank prizes: ' + JSON.stringify(mk.data));
    const rankList = await req('GET', '/api/tournaments');
    const rankM = rankList.data.tournaments.find((t) => t.id === mk.data.id);
    assert.strictEqual(rankM.prize1, 90, 'prize1 returned');
    assert.strictEqual(rankM.prize5, 20, 'prize5 returned');
    const upd = await req('PUT', `/api/tournaments/${mk.data.id}`, { prize1: 100 }, ownerToken);
    assert.strictEqual(upd.status, 200, 'edit rank prize: ' + JSON.stringify(upd.data));
    const rankList2 = await req('GET', '/api/tournaments');
    assert.strictEqual(rankList2.data.tournaments.find((t) => t.id === mk.data.id).prize1, 100, 'prize1 updated to 100');
    // 1st place, 0 kills on the rank match -> 100 (admin-set), not the 90 fallback
    const res2 = await req('POST', '/api/results', { tournamentId: mk.data.id, profileId: me.data.profile.id, playerName: 'bijoy', placement: 1, kills: 0 }, ownerToken);
    assert.strictEqual(res2.status, 200, 'publish rank result');
    me = await req('GET', '/api/me', null, ownerToken);
    assert.strictEqual(me.data.wallet.winningBalance, 260, 'winning 160 fallback + 100 rank prize, got ' + me.data.wallet.winningBalance);
    // match created without rank prizes: fields default to 0 (fallback still applies in popup/results)
    const mk2 = await req('POST', '/api/tournaments', { title: 'CS 1v1 — No Rank', category: 'cs', subcategory: '1v1', mode: 'solo', matchType: 'clash_squad', matchDate: '2026-11-20', matchTime: '20:00', prizePool: 100, entryFee: 10, perKillPrize: 0 }, ownerToken);
    assert.strictEqual(mk2.status, 200, 'create match without rank prizes');
    const noRank = (await req('GET', '/api/tournaments')).data.tournaments.find((t) => t.id === mk2.data.id);
    assert.strictEqual(noRank.prize1, 0, 'prize1 defaults 0');
    assert.strictEqual(noRank.prize5, 0, 'prize5 defaults 0');

    // transfer balance: Winning -> Deposit only (deposit 180, winning 260 here)
    const trBad = await req('POST', '/api/transfer-balance', { amount: 500 }, ownerToken);
    assert.strictEqual(trBad.status, 400, 'transfer more than winning rejected');
    const trZero = await req('POST', '/api/transfer-balance', { amount: 0 }, ownerToken);
    assert.strictEqual(trZero.status, 400, 'transfer 0 rejected');
    const trNeg = await req('POST', '/api/transfer-balance', { amount: -50 }, ownerToken);
    assert.strictEqual(trNeg.status, 400, 'transfer negative rejected');
    const tr = await req('POST', '/api/transfer-balance', { amount: 100 }, ownerToken);
    assert.strictEqual(tr.status, 200, 'transfer 100: ' + JSON.stringify(tr.data));
    me = await req('GET', '/api/me', null, ownerToken);
    assert.strictEqual(me.data.wallet.winningBalance, 160, 'winning 260-100=160, got ' + me.data.wallet.winningBalance);
    assert.strictEqual(me.data.wallet.depositBalance, 280, 'deposit 180+100=280, got ' + me.data.wallet.depositBalance);
    const trAgain = await req('POST', '/api/transfer-balance', { amount: 161 }, ownerToken);
    assert.strictEqual(trAgain.status, 400, 'transfer above remaining winning rejected');

    // withdraw below minimum + from deposit refused; spin works once
    const wdBad = await req('POST', '/api/withdraw', { amount: 50, method: 'bkash', accountNumber: '01906502081' }, ownerToken);
    assert.strictEqual(wdBad.status, 400, 'withdraw below 100 refused');
    const spin = await req('POST', '/api/spin', {}, ownerToken);
    assert.strictEqual(spin.status, 200, 'daily spin');
    const spin2 = await req('POST', '/api/spin', {}, ownerToken);
    assert.strictEqual(spin2.status, 400, 'second spin same day refused');

    // forgot password: reset works, old password stops working
    const fp = await req('POST', '/api/forgot-password', { email: 'shoshikola19@gmail.com', newPassword: 'newpass99' });
    assert.strictEqual(fp.status, 200, 'forgot password: ' + JSON.stringify(fp.data));
    const fpNo = await req('POST', '/api/forgot-password', { email: 'nobody@example.com', newPassword: 'newpass99' });
    assert.strictEqual(fpNo.status, 400, 'forgot with unknown email rejected');
    const oldLogin = await req('POST', '/api/login', { emailOrUsername: 'shoshikola19@gmail.com', password: 'test1234' });
    assert.strictEqual(oldLogin.status, 400, 'old password rejected after reset');
    const newLogin = await req('POST', '/api/login', { emailOrUsername: 'shoshikola19@gmail.com', password: 'newpass99' });
    assert.strictEqual(newLogin.status, 200, 'login with new password works');

    // payment info + landing page + manifest
    const pay = await req('GET', '/api/payment-info');
    assert.strictEqual(pay.data.bkashNumber, '01906502081', 'bKash number seeded');
    const page = await fetch('http://127.0.0.1:3101/');
    assert.strictEqual(page.status, 200, 'landing serves');
    assert.ok((await page.text()).includes('S_19 TOURNAMENT'), 'landing has title');
    // new UI: banner carousel, category cards, chat fab, bell, step dots,
    // team boxes, Match Full, tutorial, Remember Me, Forgot, results tabs,
    // support modal + animations must be present in served files
    const appJs = await (await fetch('http://127.0.0.1:3101/app.js')).text();
    for (const s of ['banner-carousel', 'cat-card', 'chat-fab', 'bell-btn', 'step-dot', 'team-box', 'Match Full', 'openTutorial', 'Remember Me', 'Forgot Password', 'resultTab', 'openSupport', 'VERSION 1.0.0', 'live-badge', 'TOPUP BALANCE', 'TOTAL WON', 'goAuth', 'Switch Account', 'Logged out', 'isStandalone', 'cat-arrow', 'S_19 on Telegram', 'backHome', 'openCategory', 'openSub', 'sub-card', 'shield-tile', 'shield-label', 'help-contact', 'Need any Help', 'Diamond Topup', 'page-head', 'backToHome', 'backToCategory', 'Join with Squad', 'squadNames', 'Matches Live', 'Clash Squad', 'Lone Wolf 1V1', 'Lose To Win', 'BR E-Sports PRO League', 'dl-btn', 'hadToken', '5000 - (Date.now() - splashStart)', '__s19AppInstalled', 'ad-prize1', 'em-prize1', 'Match Prizes', '1st Prize', '2nd Prize', 'prize1', 'avatar-img', 'avatar-cam', 'uploadAvatar', 'copyS19Id', 'profile-tiles', 'profile-tile', 'menu-list', 'menu-row', 'BDT', 'Edit Profile', 'Daily Spin', 'All Rules', 'Leaderboard', 'wallet-hero', 'Available Balance', 'DEPOSITED', 'WINNING', 'Transfer Balance', 'openTransfer', 'transfer-balance', 'Transfer to Deposit', 'BKASH &amp; NAGAD', 'Proceed to Payment', '10 - 1000', 'minimum of 10 Taka', 'maximum of 1000', 'Transaction History', 'openTxHistory', 'How to add money?', 'openHowToAddMoney', 'How to join a match?', 'How to withdraw?', 'openHowToWithdraw', 'Nagad number not added yet', 'Nagad number will be added later', 'depPickGateway', 'depPickMethod', 'depCheck', 'depStep2']) {
      assert.ok(appJs.includes(s), 'app.js missing: ' + s);
    }
    const css = await (await fetch('http://127.0.0.1:3101/styles.css')).text();
    for (const s of ['@keyframes pageIn', '@keyframes cardIn', 'splashPulse', 'splashSpin', '.spinner', '.chat-fab', '.banner-carousel', 'prefers-reduced-motion', '.shield-tile', '.shield-label', '.help-row', '.help-contact', '.page-head', '.squad-box', '.sub-card', '.avatar-img', '.avatar-cam', '.profile-tiles', '.profile-tile', '.menu-list', '.menu-row', '.edit-pill', '.id-pill', '.wallet-hero', '.wallet-tiles', '.wallet-tile', '.wallet-actions', '.wallet-btn', '.wallet-btn-blue', '.wallet-btn-green', '.wallet-btn-purple', '.addmoney-hero', '.addmoney-ic', '.dep-note', '.gw-pills', '.gw-pill', '.amt-box', '.btn-proceed']) {
      assert.ok(css.includes(s), 'styles.css missing: ' + s);
    }
    const man = await fetch('http://127.0.0.1:3101/manifest.webmanifest');
    assert.strictEqual(man.status, 200, 'manifest serves');
    const sw = await (await fetch('http://127.0.0.1:3101/sw.js')).text();
    assert.ok(sw.includes('s19-tournament-v2'), 'sw cache bumped to v2 so phones fetch the new shell');
    const idx = await (await fetch('http://127.0.0.1:3101/')).text();
    assert.ok(idx.includes('appinstalled'), 'index hides Download after install');
    const icon = await fetch('http://127.0.0.1:3101/icon-512.png');
    assert.strictEqual(icon.status, 200, 'icon serves');
    console.log('SMOKE OK — all checks passed');
  } catch (e) {
    console.error('SMOKE FAIL:', e.message);
    console.error(logs.join(''));
    process.exitCode = 1;
  } finally {
    child.kill();
  }
})();
