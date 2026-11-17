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

    // custom slots: admin sets any totalSlots 2–100; category default only when omitted
    const slotBad1 = await req('POST', '/api/tournaments', { title: 'Bad Slots 1', category: 'br', subcategory: 'Solo', mode: 'solo', matchType: 'battle_royale', matchDate: '2026-11-20', matchTime: '21:00', prizePool: 800, entryFee: 20, totalSlots: 1, perKillPrize: 10 }, ownerToken);
    assert.strictEqual(slotBad1.status, 400, '1 slot rejected');
    const slotBad101 = await req('POST', '/api/tournaments', { title: 'Bad Slots 101', category: 'br', subcategory: 'Solo', mode: 'solo', matchType: 'battle_royale', matchDate: '2026-11-20', matchTime: '21:00', prizePool: 800, entryFee: 20, totalSlots: 101, perKillPrize: 10 }, ownerToken);
    assert.strictEqual(slotBad101.status, 400, '101 slots rejected');
    const mk30 = await req('POST', '/api/tournaments', { title: 'BR Solo — 30 Slots', category: 'br', subcategory: 'Solo', mode: 'solo', matchType: 'battle_royale', matchDate: '2026-11-20', matchTime: '21:00', prizePool: 800, entryFee: 20, totalSlots: 30, perKillPrize: 10 }, ownerToken);
    assert.strictEqual(mk30.status, 200, 'create BR Solo with 30 slots: ' + JSON.stringify(mk30.data));
    assert.strictEqual((await req('GET', '/api/tournaments')).data.tournaments.find((t) => t.id === mk30.data.id).totalSlots, 30, 'custom 30 slots saved');
    const mkDef = await req('POST', '/api/tournaments', { title: 'BR Solo — Default Slots', category: 'br', subcategory: 'Solo', mode: 'solo', matchType: 'battle_royale', matchDate: '2026-11-20', matchTime: '22:30', prizePool: 800, entryFee: 20, perKillPrize: 10 }, ownerToken);
    assert.strictEqual(mkDef.status, 200, 'create without totalSlots');
    assert.strictEqual((await req('GET', '/api/tournaments')).data.tournaments.find((t) => t.id === mkDef.data.id).totalSlots, 48, 'default BR Solo 48 slots');
    // BR Solo 48 -> 30 (seeded id 2, 1 booking) and CS 1v1 2 -> 6 (seeded id 6, no bookings)
    const cut = await req('PUT', '/api/tournaments/2', { totalSlots: 30 }, ownerToken);
    assert.strictEqual(cut.status, 200, 'BR Solo cut 48 -> 30: ' + JSON.stringify(cut.data));
    assert.strictEqual((await req('GET', '/api/tournaments')).data.tournaments.find((t) => t.id === 2).totalSlots, 30, 'BR Solo now 30 slots');
    const raise = await req('PUT', '/api/tournaments/6', { totalSlots: 6 }, ownerToken);
    assert.strictEqual(raise.status, 200, 'CS 1v1 raised 2 -> 6: ' + JSON.stringify(raise.data));
    assert.strictEqual((await req('GET', '/api/tournaments')).data.tournaments.find((t) => t.id === 6).totalSlots, 6, 'CS 1v1 now 6 slots');
    // booked guard: free-entry match, 6 slots, 3 bookings — cannot cut below 3
    const reg3 = await req('POST', '/api/register', { username: 'third', email: 'third@example.com', phone: '+8801911111111', password: 'test1234' });
    assert.strictEqual(reg3.status, 200, 'third user register: ' + JSON.stringify(reg3.data));
    const tok3 = reg3.data.token;
    await req('POST', '/api/profile', { ign: 'third', uid: '9999999999' }, tok3);
    const mkG = await req('POST', '/api/tournaments', { title: 'Guard Test — 6 Slots', category: 'cs', subcategory: '1v1', mode: 'solo', matchType: 'clash_squad', matchDate: '2026-11-20', matchTime: '22:00', prizePool: 100, entryFee: 0, totalSlots: 6, perKillPrize: 0 }, ownerToken);
    assert.strictEqual(mkG.status, 200, 'guard match created');
    const guardBooks = [[ownerToken, 'bijoy', 1], [tok2, 'squadmate', 2], [tok3, 'third', 3]];
    for (const [tk, nm, sl] of guardBooks) {
      const b = await req('POST', `/api/tournaments/${mkG.data.id}/book`, { slotNumber: sl, playerName: nm }, tk);
      assert.strictEqual(b.status, 200, 'guard booking ' + nm + ': ' + JSON.stringify(b.data));
    }
    const cutLow = await req('PUT', `/api/tournaments/${mkG.data.id}`, { totalSlots: 2 }, ownerToken);
    assert.strictEqual(cutLow.status, 400, 'cut below 3 booked rejected');
    const cutEq = await req('PUT', `/api/tournaments/${mkG.data.id}`, { totalSlots: 3 }, ownerToken);
    assert.strictEqual(cutEq.status, 200, 'cut to exactly 3 booked allowed');

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

    // forgot password (code-based): request -> wrong code rejected -> 5 wrong
    // attempts kill the code -> fresh code -> expired rejected -> correct code
    // resets, old password + old token dead, new password works
    const fpUnknown = await req('POST', '/api/forgot-password/request', { emailOrPhone: 'nobody@example.com' });
    assert.strictEqual(fpUnknown.status, 200, 'unknown email gets generic ok (no reveal)');
    const fpReq = await req('POST', '/api/forgot-password/request', { emailOrPhone: 'shoshikola19@gmail.com' });
    assert.strictEqual(fpReq.status, 200, 'forgot request: ' + JSON.stringify(fpReq.data));
    assert.strictEqual(fpReq.data.channel, 'admin', 'no SMTP in tests — code goes to admin panel');
    const fpAgain = await req('POST', '/api/forgot-password/request', { emailOrPhone: 'shoshikola19@gmail.com' });
    assert.strictEqual(fpAgain.status, 429, 'resend within 60s refused');
    const getCode = async () => {
      const rs = await req('GET', '/api/admin/reset-requests', null, ownerToken);
      assert.strictEqual(rs.status, 200, 'admin reset list');
      const row = rs.data.requests.find((r) => r.contact === 'shoshikola19@gmail.com');
      assert.ok(row && /^\d{6}$/.test(row.code), 'admin panel shows the 6-digit code');
      return row;
    };
    const row1 = await getCode();
    const fpNoCode = await req('POST', '/api/forgot-password/verify', { emailOrPhone: 'shoshikola19@gmail.com', code: '123456', newPassword: 'newpass99' });
    assert.strictEqual(fpNoCode.status, 400, 'wrong code rejected');
    assert.ok(/4 attempts left/.test(fpNoCode.data.error), 'attempts drop to 4, got: ' + fpNoCode.data.error);
    for (let i = 0; i < 4; i++) {
      const w = await req('POST', '/api/forgot-password/verify', { emailOrPhone: 'shoshikola19@gmail.com', code: '123456', newPassword: 'newpass99' });
      assert.strictEqual(w.status, 400, 'wrong code #' + (i + 2) + ' rejected');
    }
    const fpDead = await req('POST', '/api/forgot-password/verify', { emailOrPhone: 'shoshikola19@gmail.com', code: row1.code, newPassword: 'newpass99' });
    assert.strictEqual(fpDead.status, 400, 'code dead after 5 wrong attempts');
    const fpReq2 = await req('POST', '/api/forgot-password/request', { emailOrPhone: 'shoshikola19@gmail.com' });
    assert.strictEqual(fpReq2.status, 200, 'fresh code after exhaustion');
    const row2 = await getCode();
    server.execSync(`sqlite3 "${DB}" "UPDATE password_resets SET expires_at = 1 WHERE id = ${row2.id}"`);
    const fpExp = await req('POST', '/api/forgot-password/verify', { emailOrPhone: 'shoshikola19@gmail.com', code: row2.code, newPassword: 'newpass99' });
    assert.strictEqual(fpExp.status, 400, 'expired code rejected');
    assert.ok(/expired/i.test(fpExp.data.error), 'expired message, got: ' + fpExp.data.error);
    const fpReq3 = await req('POST', '/api/forgot-password/request', { emailOrPhone: 'shoshikola19@gmail.com' });
    assert.strictEqual(fpReq3.status, 200, 'fresh code for reset');
    const row3 = await getCode();
    const fpOk = await req('POST', '/api/forgot-password/verify', { emailOrPhone: 'shoshikola19@gmail.com', code: row3.code, newPassword: 'newpass99' });
    assert.strictEqual(fpOk.status, 200, 'correct code resets password: ' + JSON.stringify(fpOk.data));
    const oldLogin = await req('POST', '/api/login', { emailOrUsername: 'shoshikola19@gmail.com', password: 'test1234' });
    assert.strictEqual(oldLogin.status, 400, 'old password rejected after reset');
    const newLogin = await req('POST', '/api/login', { emailOrUsername: 'shoshikola19@gmail.com', password: 'newpass99' });
    assert.strictEqual(newLogin.status, 200, 'login with new password works');
    const meOld = await req('GET', '/api/me', null, ownerToken);
    assert.strictEqual(meOld.status, 401, 'old token dead after reset');

    // login by email / username / phone — one account, any identifier, any case/format
    const regL = await req('POST', '/api/register', { username: 'logintest', email: 'LoginTest@Example.com', phone: '+8801812345678', password: 'pass1234' });
    assert.strictEqual(regL.status, 200, 'login-test user register: ' + JSON.stringify(regL.data));
    const tokL = regL.data.token;
    const meL = await req('GET', '/api/me', null, tokL);
    assert.strictEqual(meL.status, 200, 'login token works for /api/me');
    assert.strictEqual(meL.data.profile.username, 'logintest', 'token belongs to logintest');
    for (const [label, id] of [['email', 'LoginTest@Example.com'], ['email lower', 'logintest@example.com'], ['email upper', 'LOGINTEST@EXAMPLE.COM'], ['username', 'logintest'], ['username case', 'LoginTest'], ['phone +880', '+8801812345678'], ['phone 0', '01812345678'], ['phone 880', '8801812345678'], ['phone spaced', '0181-234 5678']]) {
      const l = await req('POST', '/api/login', { emailOrUsername: id, password: 'pass1234' });
      assert.strictEqual(l.status, 200, 'login by ' + label + ': ' + JSON.stringify(l.data));
      assert.strictEqual(l.data.profile.username, 'logintest', 'login by ' + label + ' returns the same account');
      const me2 = await req('GET', '/api/me', null, l.data.token);
      assert.strictEqual(me2.status, 200, 'token from login by ' + label + ' opens the account');
    }
    // wrong password rejected; unknown phone rejected
    const wrongPw = await req('POST', '/api/login', { emailOrUsername: '01812345678', password: 'wrongpass' });
    assert.strictEqual(wrongPw.status, 400, 'wrong password rejected');
    const noAcc = await req('POST', '/api/login', { emailOrUsername: '01999999999', password: 'pass1234' });
    assert.strictEqual(noAcc.status, 400, 'unknown phone rejected');
    // one number = one account: same phone with a new email is refused; same email, other case, refused
    const dupPhone = await req('POST', '/api/register', { username: 'othername', email: 'other@example.com', phone: '01812345678', password: 'pass1234' });
    assert.strictEqual(dupPhone.status, 400, 'duplicate phone register rejected');
    assert.strictEqual(dupPhone.data.error, 'An account already exists with this number. Please login instead.', 'duplicate phone message in English');
    const dupPhoneFmt = await req('POST', '/api/register', { username: 'othername2', email: 'other2@example.com', phone: '+880 1812-345678', password: 'pass1234' });
    assert.strictEqual(dupPhoneFmt.status, 400, 'duplicate phone in another format rejected');
    assert.strictEqual(dupPhoneFmt.data.error, 'An account already exists with this number. Please login instead.', 'duplicate phone message regardless of format');
    const dupEmailCase = await req('POST', '/api/register', { username: 'another', email: 'LOGINTEST@example.com', phone: '+8801912345679', password: 'pass1234' });
    assert.strictEqual(dupEmailCase.status, 400, 'duplicate email (case-insensitive) rejected');
    assert.strictEqual(dupEmailCase.data.error, 'An account already exists with this email. Please login instead.', 'duplicate email message in English');
    const dupUser = await req('POST', '/api/register', { username: 'logintest', email: 'newuser@example.com', phone: '+8801912345680', password: 'pass1234' });
    assert.strictEqual(dupUser.status, 400, 'duplicate username rejected');
    assert.strictEqual(dupUser.data.error, 'This username is already taken. Please choose another one.', 'duplicate username message in English');

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
    for (const s of ['banner-carousel', 'cat-card', 'chat-fab', 'bell-btn', 'step-dot', 'team-box', 'Match Full', 'openTutorial', 'Remember Me', 'Forgot Password', 'resultTab', 'openSupport', 'VERSION 1.0.0', 'live-badge', 'TOPUP BALANCE', 'TOTAL WON', 'goAuth', 'Switch Account', 'Logged out', 'isStandalone', 'cat-arrow', 'S_19 on Telegram', 'backHome', 'openCategory', 'openSub', 'sub-card', 'shield-tile', 'shield-label', 'help-contact', 'Need any Help', 'Diamond Topup', 'page-head', 'backToHome', 'backToCategory', 'Join with Squad', 'squadNames', 'Matches Live', 'Clash Squad', 'Lone Wolf 1V1', 'Lose To Win', 'BR E-Sports PRO League', 'dl-btn', 'hadToken', '5000 - (Date.now() - splashStart)', '__s19AppInstalled', 'ad-prize1', 'em-prize1', 'Match Prizes', '1st Prize', '2nd Prize', 'prize1', 'avatar-img', 'avatar-cam', 'uploadAvatar', 'copyS19Id', 'profile-tiles', 'profile-tile', 'menu-list', 'menu-row', 'BDT', 'Edit Profile', 'Daily Spin', 'All Rules', 'Leaderboard', 'wallet-hero', 'Available Balance', 'DEPOSITED', 'WINNING', 'Transfer Balance', 'openTransfer', 'transfer-balance', 'Transfer to Deposit', 'BKASH &amp; NAGAD', 'Proceed to Payment', '10 - 1000', 'minimum of 10 Taka', 'maximum of 1000', 'Transaction History', 'openTxHistory', 'How to add money?', 'openHowToAddMoney', 'How to join a match?', 'How to withdraw?', 'openHowToWithdraw', 'Nagad number not added yet', 'Nagad number will be added later', 'depPickGateway', 'depPickMethod', 'depCheck', 'depStep2', 'match-head', 'match-date', 'fmtDateTime', 'tile-ic', 'reg-row', 'join-btn', 'tutorial-pill', 'ad-slots', 'em-slots', 'Total Slots', 'adSlotsDefault', 'SLOT_DEFAULTS', 'Email / Username / Phone', 'Email, username or phone number', 'already exists', 'already taken', 'Send Code', 'Resend Code', 'Enter Reset Code', 'forgot-password/request', 'forgot-password/verify', 'Password Reset Requests', 'reset-requests', 'cancelReset', 'doForgotSend', 'doForgotVerify']) {
      assert.ok(appJs.includes(s), 'app.js missing: ' + s);
    }
    const css = await (await fetch('http://127.0.0.1:3101/styles.css')).text();
    for (const s of ['@keyframes pageIn', '@keyframes cardIn', 'splashPulse', 'splashSpin', '.spinner', '.chat-fab', '.banner-carousel', 'prefers-reduced-motion', '.shield-tile', '.shield-label', '.help-row', '.help-contact', '.page-head', '.squad-box', '.sub-card', '.avatar-img', '.avatar-cam', '.profile-tiles', '.profile-tile', '.menu-list', '.menu-row', '.edit-pill', '.id-pill', '.wallet-hero', '.wallet-tiles', '.wallet-tile', '.wallet-actions', '.wallet-btn', '.wallet-btn-blue', '.wallet-btn-green', '.wallet-btn-purple', '.addmoney-hero', '.addmoney-ic', '.dep-note', '.gw-pills', '.gw-pill', '.amt-box', '.btn-proceed', '.match-head', '.match-date', '.tile-ic', '.reg-row', '.join-btn', '.tutorial-pill']) {
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
