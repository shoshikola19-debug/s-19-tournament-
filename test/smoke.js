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
    // NOTE: seed LW 1v1 (id 1) carries room S19LW1V1, but its reveal time
    // (2026-11-18 18:40) has passed, so its roomId is visible now — the
    // hidden-before-reveal check below uses a fresh future match instead.
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

    // room hidden before reveal: fresh future match with a room set
    const mkRoom = await req('POST', '/api/tournaments', { title: 'Room Test', category: 'br', subcategory: 'Solo', mode: 'solo', matchType: 'battle_royale', matchDate: '2026-11-19', matchTime: '20:00', prizePool: 800, entryFee: 20, perKillPrize: 10, roomId: 'TESTROOM1', roomPassword: 'testpass' }, ownerToken);
    assert.strictEqual(mkRoom.status, 200, 'create room-test match: ' + JSON.stringify(mkRoom.data));
    const list2 = await req('GET', '/api/tournaments');
    const rt = list2.data.tournaments.find((t) => t.id === mkRoom.data.id);
    assert.strictEqual(rt.roomId, '', 'room hidden before reveal');
    assert.strictEqual(rt.hasRoom, true, 'hasRoom true when room set');
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

    // admin payment-requests list: new deposit shows up with player details,
    // non-admin gets 403, reject credits nothing, approve credits, double review rejected
    const dep2 = await req('POST', '/api/deposit', { amount: 150, method: 'bkash', senderNumber: '01906502081', trxId: 'PENDTX001' }, ownerToken);
    assert.strictEqual(dep2.status, 200, 'second deposit request created');
    const pend = await req('GET', '/api/admin/transactions', null, ownerToken);
    assert.strictEqual(pend.status, 200, 'admin list: ' + JSON.stringify(pend.data));
    const row = pend.data.requests.find((r) => r.id === dep2.data.id);
    assert.ok(row, 'pending deposit in admin list');
    assert.strictEqual(row.username, 'bijoy', 'list shows username');
    assert.strictEqual(row.amount, 150, 'list shows amount');
    assert.strictEqual(row.method, 'bkash', 'list shows method');
    assert.strictEqual(row.trxId, 'PENDTX001', 'list shows TrxID');
    const regNa = await req('POST', '/api/register', { username: 'plainuser', email: 'plain@example.com', phone: '+8801910000001', password: 'test1234' });
    assert.strictEqual(regNa.status, 200, 'non-admin user register');
    const pendNoAuth = await req('GET', '/api/admin/transactions', null, regNa.data.token);
    assert.strictEqual(pendNoAuth.status, 403, 'non-admin cannot list payment requests');
    const rej = await req('POST', `/api/transactions/${dep2.data.id}/review`, { approve: false }, ownerToken);
    assert.strictEqual(rej.status, 200, 'reject deposit');
    me = await req('GET', '/api/me', null, ownerToken);
    assert.strictEqual(me.data.wallet.depositBalance, 200, 'reject credits nothing');
    const dblRev = await req('POST', `/api/transactions/${dep2.data.id}/review`, { approve: true }, ownerToken);
    assert.strictEqual(dblRev.status, 400, 'second review rejected');
    const dep3 = await req('POST', '/api/deposit', { amount: 50, method: 'bkash', senderNumber: '01906502081', trxId: 'PENDTX002' }, ownerToken);
    assert.strictEqual(dep3.status, 200, 'third deposit request created');
    const ok3 = await req('POST', `/api/transactions/${dep3.data.id}/review`, { approve: true }, ownerToken);
    assert.strictEqual(ok3.status, 200, 'approve third deposit');
    me = await req('GET', '/api/me', null, ownerToken);
    assert.strictEqual(me.data.wallet.depositBalance, 250, 'approve credits 50');
    const pendAfter = await req('GET', '/api/admin/transactions', null, ownerToken);
    assert.ok(!pendAfter.data.requests.some((r) => r.id === dep3.data.id), 'approved request leaves the pending list');
    const book = await req('POST', '/api/tournaments/2/book', { slotNumber: 1, playerName: 'bijoy' }, ownerToken);
    assert.strictEqual(book.status, 200, 'book slot: ' + JSON.stringify(book.data));
    const dbl = await req('POST', '/api/tournaments/2/book', { slotNumber: 1, playerName: 'bijoy' }, ownerToken);
    assert.strictEqual(dbl.status, 400, 'double-take of slot 1 rejected');
    me = await req('GET', '/api/me', null, ownerToken);
    assert.strictEqual(me.data.wallet.depositBalance, 230, 'fee 20 charged');

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

    // transfer balance: Winning -> Deposit only (deposit 230, winning 260 here)
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
    assert.strictEqual(me.data.wallet.depositBalance, 330, 'deposit 230+100=330, got ' + me.data.wallet.depositBalance);
    const trAgain = await req('POST', '/api/transfer-balance', { amount: 161 }, ownerToken);
    assert.strictEqual(trAgain.status, 400, 'transfer above remaining winning rejected');

    // withdraw below minimum + from deposit refused; daily spin wheel
    const wdBad = await req('POST', '/api/withdraw', { amount: 50, method: 'bkash', accountNumber: '01906502081' }, ownerToken);
    assert.strictEqual(wdBad.status, 400, 'withdraw below 100 refused');
    // daily spin wheel: state, one spin per day, won pass saved on profile
    const spinState0 = await req('GET', '/api/daily-spin', null, ownerToken);
    assert.strictEqual(spinState0.status, 200, 'daily-spin state');
    assert.strictEqual(spinState0.data.canSpin, true, 'can spin first time');
    assert.deepStrictEqual(spinState0.data.passes, { br: 0, cs: 0, lw: 0, all: 0 }, 'no passes yet');
    assert.ok(spinState0.data.nextSpinAt > Date.now(), 'next spin is in the future');
    const spin = await req('POST', '/api/daily-spin', {}, ownerToken);
    assert.strictEqual(spin.status, 200, 'daily spin: ' + JSON.stringify(spin.data));
    assert.ok(Number.isInteger(spin.data.segment) && spin.data.segment >= 0 && spin.data.segment < 8, 'segment 0-7');
    assert.ok(['br', 'cs', 'lw', 'all', 'none'].includes(spin.data.prize), 'prize is a segment type');
    assert.strictEqual(spin.data.canSpin, false, 'no second spin today');
    const meSpin = await req('GET', '/api/me', null, ownerToken);
    const totalPasses = Object.values(meSpin.data.profile.passes).reduce((a, b) => a + b, 0);
    if (spin.data.prize === 'none') {
      assert.strictEqual(totalPasses, 0, 'no prize = no pass');
    } else {
      assert.strictEqual(totalPasses, 1, 'won exactly one pass');
      assert.strictEqual(meSpin.data.profile.passes[spin.data.prize], 1, 'pass is for the won category');
    }
    const spin2 = await req('POST', '/api/daily-spin', {}, ownerToken);
    assert.strictEqual(spin2.status, 400, 'second spin same day refused');
    const spinState1 = await req('GET', '/api/daily-spin', null, ownerToken);
    assert.strictEqual(spinState1.data.canSpin, false, 'state says cannot spin again today');

    // free pass join: BR pass -> fee 0 and pass spent; no pass -> rejected;
    // normal join still charges; All pass works on any category; category
    // pass is spent before an All pass; cancelling returns the pass
    const setPasses = (br, cs, lw, all) => server.execSync(
      `sqlite3 "${DB}" "UPDATE profiles SET br_passes=${br}, cs_passes=${cs}, lw_passes=${lw}, all_passes=${all} WHERE id=1"`);
    const passesOf = async () => (await req('GET', '/api/me', null, ownerToken)).data.profile.passes;
    setPasses(1, 0, 0, 0);
    const bookPass = await req('POST', `/api/tournaments/${mk30.data.id}/book`, { slotNumber: 1, playerName: 'bijoy', usePass: true }, ownerToken);
    assert.strictEqual(bookPass.status, 200, 'BR pass join: ' + JSON.stringify(bookPass.data));
    assert.strictEqual(bookPass.data.usedPass, 'br', 'used the BR pass');
    me = await req('GET', '/api/me', null, ownerToken);
    assert.strictEqual(me.data.wallet.depositBalance, 330, 'pass join charges no fee');
    assert.deepStrictEqual(me.data.profile.passes, { br: 0, cs: 0, lw: 0, all: 0 }, 'BR pass spent');
    const bookNoPass = await req('POST', `/api/tournaments/${mkDef.data.id}/book`, { slotNumber: 1, playerName: 'bijoy', usePass: true }, ownerToken);
    assert.strictEqual(bookNoPass.status, 400, 'usePass with no pass rejected');
    const bookPaid = await req('POST', `/api/tournaments/${mkDef.data.id}/book`, { slotNumber: 1, playerName: 'bijoy' }, ownerToken);
    assert.strictEqual(bookPaid.status, 200, 'normal join without pass: ' + JSON.stringify(bookPaid.data));
    me = await req('GET', '/api/me', null, ownerToken);
    assert.strictEqual(me.data.wallet.depositBalance, 310, 'normal join still charges fee 20');
    setPasses(0, 0, 0, 1);
    const bookAll = await req('POST', `/api/tournaments/${mk2.data.id}/book`, { slotNumber: 1, playerName: 'bijoy', usePass: true }, ownerToken);
    assert.strictEqual(bookAll.status, 200, 'All pass join on CS match: ' + JSON.stringify(bookAll.data));
    assert.strictEqual(bookAll.data.usedPass, 'all', 'All pass used on a CS match');
    assert.deepStrictEqual(await passesOf(), { br: 0, cs: 0, lw: 0, all: 0 }, 'All pass spent');
    const cancelPass = await req('POST', `/api/bookings/${bookAll.data.id}/cancel`, {}, ownerToken);
    assert.strictEqual(cancelPass.status, 200, 'cancel pass booking');
    assert.deepStrictEqual(await passesOf(), { br: 0, cs: 0, lw: 0, all: 1 }, 'pass returned on cancel');
    setPasses(1, 0, 0, 1);
    // Fresh BR match: mkDef already has the owner's paid booking above, and
    // one profile can only hold one slot per match, so the category-first
    // check needs its own match.
    const mkCat = await req('POST', '/api/tournaments', { title: 'BR Solo — Cat First', category: 'br', subcategory: 'Solo', mode: 'solo', matchType: 'battle_royale', matchDate: '2026-11-20', matchTime: '23:00', prizePool: 800, entryFee: 20, totalSlots: 48, perKillPrize: 10 }, ownerToken);
    assert.strictEqual(mkCat.status, 200, 'cat-first match created: ' + JSON.stringify(mkCat.data));
    const bookCatFirst = await req('POST', `/api/tournaments/${mkCat.data.id}/book`, { slotNumber: 1, playerName: 'bijoy', usePass: true }, ownerToken);
    assert.strictEqual(bookCatFirst.status, 200, 'category+all pass join: ' + JSON.stringify(bookCatFirst.data));
    assert.strictEqual(bookCatFirst.data.usedPass, 'br', 'category pass spent before All pass');
    assert.deepStrictEqual(await passesOf(), { br: 0, cs: 0, lw: 0, all: 1 }, 'All pass kept');

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
    // password trimming: a trailing space typed at register must not make the
    // correct password show "Wrong password" at login
    const regTrim = await req('POST', '/api/register', { username: 'trimuser', email: 'trim@example.com', phone: '+8801912345681', password: 'pass1234 ' });
    assert.strictEqual(regTrim.status, 200, 'register with trailing-space password: ' + JSON.stringify(regTrim.data));
    const loginTrim = await req('POST', '/api/login', { emailOrUsername: 'trimuser', password: 'pass1234' });
    assert.strictEqual(loginTrim.status, 200, 'login without the space works after trimmed register');
    const loginTrimSpace = await req('POST', '/api/login', { emailOrUsername: 'trimuser', password: 'pass1234 ' });
    assert.strictEqual(loginTrimSpace.status, 200, 'login with the space also works');
    // legacy account: password stored WITH a trailing space (registered
    // before trimming) — login WITHOUT the space must still work
    const regLegacy = await req('POST', '/api/register', { username: 'legacyuser', email: 'legacy@example.com', phone: '+8801912345682', password: 'legacy99' });
    assert.strictEqual(regLegacy.status, 200, 'legacy user register');
    const crypto = require('crypto');
    const legacySalt = crypto.randomBytes(16).toString('hex');
    const legacyHash = crypto.scryptSync('legacy99 ', legacySalt, 64).toString('hex');
    server.execSync(`sqlite3 "${DB}" "UPDATE profiles SET password_hash = '${legacyHash}', password_salt = '${legacySalt}' WHERE username = 'legacyuser'"`);
    const legacyLogin = await req('POST', '/api/login', { emailOrUsername: 'legacyuser', password: 'legacy99' });
    assert.strictEqual(legacyLogin.status, 200, 'legacy space-stored password logs in without the space: ' + JSON.stringify(legacyLogin.data));
    const legacyWrong = await req('POST', '/api/login', { emailOrUsername: 'legacyuser', password: 'legacy98' });
    assert.strictEqual(legacyWrong.status, 400, 'legacy account still rejects a truly wrong password');
    // forgot password by phone: code requested by phone must verify with the
    // email identifier too, and the message must not claim an email was sent
    // when there is no SMTP (code goes to Support / admin panel instead)
    const regRx = await req('POST', '/api/register', { username: 'resetx', email: 'resetx@example.com', phone: '+8801912345683', password: 'OldPass99' });
    assert.strictEqual(regRx.status, 200, 'resetx register');
    const ownerReLogin = await req('POST', '/api/login', { emailOrUsername: 'shoshikola19@gmail.com', password: 'newpass99' });
    assert.strictEqual(ownerReLogin.status, 200, 'owner re-login for reset list');
    const rxReq = await req('POST', '/api/forgot-password/request', { emailOrPhone: '+8801912345683' });
    assert.strictEqual(rxReq.status, 200, 'reset request by phone: ' + JSON.stringify(rxReq.data));
    assert.strictEqual(rxReq.data.channel, 'admin', 'no SMTP in test env: phone reset goes to admin channel');
    assert.ok(/Support/.test(rxReq.data.message || ''), 'phone reset message tells the player to ask Support, not to check email');
    const rxList = await req('GET', '/api/admin/reset-requests', null, ownerReLogin.data.token);
    const rxRow = (rxList.data.requests || []).find((r) => r.contact === '+8801912345683');
    assert.ok(rxRow && rxRow.code, 'phone reset code visible to admin');
    const rxVerifyEmail = await req('POST', '/api/forgot-password/verify', { emailOrPhone: 'resetx@example.com', code: rxRow.code, newPassword: ' NewPass99 ' });
    assert.strictEqual(rxVerifyEmail.status, 200, 'code requested by phone verifies with email identifier: ' + JSON.stringify(rxVerifyEmail.data));
    const rxLoginNew = await req('POST', '/api/login', { emailOrUsername: 'resetx', password: 'NewPass99' });
    assert.strictEqual(rxLoginNew.status, 200, 'new password (trimmed) logs in after cross-identifier reset');
    const rxLoginOld = await req('POST', '/api/login', { emailOrUsername: 'resetx', password: 'OldPass99' });
    assert.strictEqual(rxLoginOld.status, 400, 'old password rejected after reset');

    // ---- app settings + players (admin) ----
    // ownerToken died in the forgot-password test above (sessions wiped);
    // re-login with the new password set there.
    const ownerLogin2 = await req('POST', '/api/login', { emailOrUsername: 'shoshikola19@gmail.com', password: 'newpass99' });
    assert.strictEqual(ownerLogin2.status, 200, 'owner re-login after reset: ' + JSON.stringify(ownerLogin2.data));
    const ownerToken2 = ownerLogin2.data.token;
    const cfg0 = await req('GET', '/api/app-config');
    assert.strictEqual(cfg0.status, 200, 'app-config public');
    assert.strictEqual(cfg0.data.config.appName, 'S_19 TOURNAMENT', 'default app name');
    assert.strictEqual(cfg0.data.config.withdrawMin, 100, 'default withdraw min 100');
    assert.strictEqual(cfg0.data.config.spinEnabled, true, 'spin on by default');
    const setNoAuth = await req('GET', '/api/settings', null, regNa.data.token);
    assert.strictEqual(setNoAuth.status, 403, 'non-admin cannot read settings');
    const setPutNoAuth = await req('PUT', '/api/settings', { appName: 'HACK' }, regNa.data.token);
    assert.strictEqual(setPutNoAuth.status, 403, 'non-admin cannot change settings');
    const setBad = await req('PUT', '/api/settings', { withdrawMin: -5 }, ownerToken2);
    assert.strictEqual(setBad.status, 400, 'bad withdraw min rejected');
    const setBad2 = await req('PUT', '/api/settings', { withdrawStart: 1200, withdrawEnd: 600 }, ownerToken2);
    assert.strictEqual(setBad2.status, 400, 'start after end rejected');
    const set = await req('PUT', '/api/settings', { appName: 'S_19 TEST', noticeRules: 'Rule one.\nRule two.', bannerTitle: 'TEST BANNER', bannerSubtitle: 'Test subtitle', withdrawMin: 200, withdrawStart: 0, withdrawEnd: 1439, spinEnabled: false }, ownerToken2);
    assert.strictEqual(set.status, 200, 'admin saves settings: ' + JSON.stringify(set.data));
    assert.strictEqual(set.data.settings.appName, 'S_19 TEST', 'saved app name');
    assert.strictEqual(set.data.settings.withdrawMin, 200, 'saved withdraw min');
    const cfg1 = await req('GET', '/api/app-config');
    assert.strictEqual(cfg1.data.config.appName, 'S_19 TEST', 'app-config shows new name');
    assert.strictEqual(cfg1.data.config.noticeRules, 'Rule one.\nRule two.', 'app-config shows new notice');
    assert.strictEqual(cfg1.data.config.bannerTitle, 'TEST BANNER', 'app-config shows new banner');
    // withdraw honors the new minimum (owner winning is 160; 150 < 200 -> min error)
    const wdMin = await req('POST', '/api/withdraw', { amount: 150, method: 'bkash', accountNumber: '01906502081' }, ownerToken2);
    assert.strictEqual(wdMin.status, 400, 'withdraw below new min refused');
    assert.ok(/200/.test(wdMin.data.error), 'min error names 200, got: ' + wdMin.data.error);
    // spin disabled: POST rejected even though the owner already spun today (disabled checked first)
    const spinOff = await req('POST', '/api/daily-spin', {}, ownerToken2);
    assert.strictEqual(spinOff.status, 400, 'spin disabled rejected');
    assert.ok(/disabled/i.test(spinOff.data.error), 'disabled message, got: ' + spinOff.data.error);
    const spinStateOff = await req('GET', '/api/daily-spin', null, ownerToken2);
    assert.strictEqual(spinStateOff.data.spinEnabled, false, 'spin state says disabled');
    assert.strictEqual(spinStateOff.data.canSpin, false, 'cannot spin while disabled');
    // restore defaults so nothing later sees the test values
    const setBack = await req('PUT', '/api/settings', { appName: 'S_19 TOURNAMENT', noticeRules: 'নিজের স্লট নম্বর মনে রাখবেন।', bannerTitle: 'S_19 TOURNAMENT', bannerSubtitle: 'PLAY WIN ENJOY — Daily BR • CS • Lone Wolf matches. Win real Taka prizes!', withdrawMin: 100, withdrawStart: 600, withdrawEnd: 1290, spinEnabled: true }, ownerToken2);
    assert.strictEqual(setBack.status, 200, 'settings restored');

    // players list + ban/unban (plainuser = regNa, token still valid)
    me = await req('GET', '/api/me', null, ownerToken2);
    const players = await req('GET', '/api/admin/players', null, ownerToken2);
    assert.strictEqual(players.status, 200, 'admin players list');
    const plain = players.data.players.find((p) => p.username === 'plainuser');
    assert.ok(plain, 'plainuser in players list');
    assert.strictEqual(plain.banned, false, 'not banned yet');
    assert.ok(typeof plain.depositBalance === 'number' && typeof plain.winningBalance === 'number', 'balances in list');
    const playersNoAuth = await req('GET', '/api/admin/players', null, regNa.data.token);
    assert.strictEqual(playersNoAuth.status, 403, 'non-admin cannot list players');
    const banOwner = await req('POST', `/api/admin/players/${me.data.profile.id}/ban`, { banned: true }, ownerToken2);
    assert.strictEqual(banOwner.status, 400, 'cannot ban the owner');
    const banNoAuth = await req('POST', `/api/admin/players/${plain.id}/ban`, { banned: true }, regNa.data.token);
    assert.strictEqual(banNoAuth.status, 403, 'non-admin cannot ban');
    const ban = await req('POST', `/api/admin/players/${plain.id}/ban`, { banned: true }, ownerToken2);
    assert.strictEqual(ban.status, 200, 'ban player: ' + JSON.stringify(ban.data));
    const banLogin = await req('POST', '/api/login', { emailOrUsername: 'plain@example.com', password: 'test1234' });
    assert.strictEqual(banLogin.status, 403, 'banned login rejected');
    assert.strictEqual(banLogin.data.error, 'This account is banned', 'ban message');
    const banJoin = await req('POST', '/api/tournaments/2/book', { slotNumber: 2, playerName: 'plainuser' }, regNa.data.token);
    assert.strictEqual(banJoin.status, 403, 'banned join rejected');
    const unban = await req('POST', `/api/admin/players/${plain.id}/ban`, { banned: false }, ownerToken2);
    assert.strictEqual(unban.status, 200, 'unban player');
    const unbanLogin = await req('POST', '/api/login', { emailOrUsername: 'plain@example.com', password: 'test1234' });
    assert.strictEqual(unbanLogin.status, 200, 'login works after unban: ' + JSON.stringify(unbanLogin.data));

    // payment info + landing page + manifest
    const pay = await req('GET', '/api/payment-info');
    assert.strictEqual(pay.data.bkashNumber, '01906502081', 'bKash number seeded');
    // payment settings: empty boxes must never wipe saved numbers (admin
    // panel bug) — PUT skips empty/missing fields, only non-empty changes
    const setNagad = await req('PUT', '/api/payment-info', { nagadNumber: '01812345678' }, ownerToken2);
    assert.strictEqual(setNagad.status, 200, 'save nagad number: ' + JSON.stringify(setNagad.data));
    const pay2 = await req('GET', '/api/payment-info');
    assert.strictEqual(pay2.data.nagadNumber, '01812345678', 'nagad number saved');
    assert.strictEqual(pay2.data.bkashNumber, '01906502081', 'bkash untouched by partial save');
    const emptySave = await req('PUT', '/api/payment-info', { bkashNumber: '', nagadNumber: '', rocketNumber: '' }, ownerToken2);
    assert.strictEqual(emptySave.status, 200, 'empty save accepted');
    const pay3 = await req('GET', '/api/payment-info');
    assert.strictEqual(pay3.data.bkashNumber, '01906502081', 'empty bkash box does not wipe saved bKash');
    assert.strictEqual(pay3.data.nagadNumber, '01812345678', 'empty nagad box does not wipe saved Nagad');
    const changeBk = await req('PUT', '/api/payment-info', { bkashNumber: '01999999999' }, ownerToken2);
    assert.strictEqual(changeBk.status, 200, 'change bkash number');
    const pay4 = await req('GET', '/api/payment-info');
    assert.strictEqual(pay4.data.bkashNumber, '01999999999', 'new bkash number replaces old one');
    assert.strictEqual(pay4.data.nagadNumber, '01812345678', 'missing nagad field leaves Nagad alone');
    const page = await fetch('http://127.0.0.1:3101/');
    assert.strictEqual(page.status, 200, 'landing serves');
    assert.ok((await page.text()).includes('S_19 TOURNAMENT'), 'landing has title');
    // new UI: banner carousel, category cards, chat fab, bell, step dots,
    // team boxes, Match Full, tutorial, Remember Me, Forgot, results tabs,
    // support modal + animations must be present in served files
    const appJs = await (await fetch('http://127.0.0.1:3101/app.js')).text();
    for (const s of ['banner-carousel', 'banner-room-rules', 'cat-card', 'chat-fab', 'bell-btn', 'step-dot', 'team-box', 'Match Full', 'openTutorial', 'Remember Me', 'Forgot Password', 'resultTab', 'openSupport', 'VERSION 1.0.0', 'live-badge', 'TOPUP BALANCE', 'TOTAL WON', 'goAuth', 'Switch Account', 'Logged out', 'isStandalone', 'cat-arrow', 'Join Telegram Channel', 'backHome', 'openCategory', 'openSub', 'sub-card', 'shield-tile', 'shield-label', 'help-contact', 'Need any Help', 'Diamond Topup', 'page-head', 'backToHome', 'backToCategory', 'joinFlowOf', 'playerNames', 'Matches Live', 'Clash Squad', 'Lone Wolf 1V1', 'Lose To Win', 'BR E-Sports PRO League', 'dl-btn', 'hadToken', '5000 - (Date.now() - splashStart)', '__s19AppInstalled', 'App already installed? Uninstall the old S_19 TOUR app first, then tap Download again.', 'Already have the old app? Uninstall it first, then install again to get the latest version.', "profile.isAdmin) items.push(['admin', 'gear', 'Admin']", 'Admin gets a separate Admin tab', 'ad-prize1', 'em-prize1', 'Match Prizes', '1st Prize', '2nd Prize', 'prize1', 'avatar-ring', 'avatar-img', 'avatar-cam', 'uploadAvatar', 'copyS19Id', 'profile-tiles', 'profile-tile', 'menu-list', 'menu-row', 'BDT', 'Edit Profile', 'Daily Spin', 'All Rules', 'Leaderboard', 'wallet-hero', 'Available Balance', 'DEPOSITED', 'WINNING', 'Transfer Balance', 'openTransfer', 'transfer-balance', 'Transfer to Deposit', 'BKASH &amp; NAGAD', 'Proceed to Payment', '10 - 1000', 'minimum of 10 Taka', 'maximum of 1000', 'Transaction History', 'openTxHistory', 'How to add money?', 'openHowToAddMoney', 'How to join a match?', 'How to withdraw?', 'openHowToWithdraw', 'Nagad number not added yet', 'Nagad number will be added later', 'depPickGateway', 'depPickMethod', 'depCheck', 'depStep2', 'match-head', 'match-date', 'fmtDateTime', 'tile-ic', 'reg-row', 'join-btn', 'tutorial-pill', 'ad-slots', 'em-slots', 'Total Slots', 'adSlotsDefault', 'SLOT_DEFAULTS', 'Email / Username / Phone', 'Email, username or phone number', 'already exists', 'already taken', 'Send Code', 'Resend Code', 'Enter Reset Code', 'forgot-password/request', 'forgot-password/verify', 'Password Reset Requests', 'reset-requests', 'cancelReset', 'doForgotSend', 'doForgotVerify', 'topupHTML', 'topupSoon', 'Top-up coming soon', 'FREE FIRE TOPUP BD SERVER', 'INDONESIA SERVER', 'UID TOPUP', 'Level Up Pass', 'Weekly Lite', 'Weekly & Monthly', 'topup-grid', 'topup-card', 'topup-banner', 'TOPUP_PACKS_BD', 'TOPUP_PACKS_ID', 'daily-spin', 'spin-wheel', 'Spin Now', 'Next Spin in', 'Use free pass', 'SPIN_SEGMENTS', 'openSpin', 'doSpin', 'passForMatch', 'spin-counters', 'spin-head', 'spin-hub', 'spin-countdown', 'You won a free', 'Better luck tomorrow', 'spinState', 'usedPass', 'Payment Requests', 'admin/transactions', 'reviewTx', 'payreq', 'Verify this TrxID', 'Fake TrxIDs must be rejected', 'I verified this transaction', 'toggleApproveBtn', 'payInfo.bkashNumber', 'payInfo.nagadNumber', 'payInfo.rocketNumber', 'App Settings', 'saveAppSettings', 'Players', 'toggleBan', 'app-config', 'loadAppConfig', 'noticeRules', 'withdrawInfoText', 'Daily Spin is currently disabled', 'Daily Spin is off', 'togglePw', 'pw-wrap', 'pw-eye', 'err.status', "return 'network'", 'unauthorized']) {
      assert.ok(appJs.includes(s), 'app.js missing: ' + s);
    }
    // Download button is always rendered on the landing page now — it is
    // never hidden for a missing beforeinstallprompt or after install.
    assert.ok(!appJs.includes('__s19Install && !window.__s19AppInstalled'), 'Download button must not be conditionally hidden');
    assert.ok(!appJs.includes('topup-order') && !appJs.includes('/api/topup'), 'topup is display-only: no order endpoint');
    const css = await (await fetch('http://127.0.0.1:3101/styles.css')).text();
    for (const s of ['@keyframes pageIn', '@keyframes cardIn', 'splashPulse', 'splashSpin', '.spinner', '.chat-fab', '.banner-carousel', 'prefers-reduced-motion', '.shield-tile', '.shield-label', '.help-row', '.help-contact', '.page-head', '.squad-box', '.sub-card', '.avatar-ring', '.avatar-img', '.avatar-cam', '.profile-tiles', '.profile-tile', '.menu-list', '.menu-row', '.edit-pill', '.id-pill', '.wallet-hero', '.wallet-tiles', '.wallet-tile', '.wallet-actions', '.wallet-btn', '.wallet-btn-blue', '.wallet-btn-green', '.wallet-btn-purple', '.addmoney-hero', '.addmoney-ic', '.dep-note', '.gw-pills', '.gw-pill', '.amt-box', '.btn-proceed', '.match-head', '.match-date', '.tile-ic', '.reg-row', '.join-btn', '.tutorial-pill', '.topup-banner', '.topup-grid', '.topup-card', '.topup-tile', '.topup-head', '.topup-badge', '.topup-sec', '.spin-wheel', '.spin-label', '.spin-pointer', '.spin-hub', '.spin-counters', '.spin-head', '.spin-countdown', '.spin-btn', 'user-select:none', '-webkit-touch-callout:none', '-webkit-tap-highlight-color:transparent', '.payreq', '.payreq-amt', '.verify-row']) {
      assert.ok(css.includes(s), 'styles.css missing: ' + s);
    }
    assert.ok(/input,select,textarea\{[^}]*font-size:16px/.test(css), 'input font stays 16px (no auto-zoom on focus)');
    assert.ok(/body\{[^}]*user-select:none/.test(css), 'body text selection disabled');
    assert.ok(css.includes('*,*::before,*::after{-webkit-user-select:none!important;user-select:none!important'), 'global no-select rule on every element');
    assert.ok(/input,select,textarea\{[^}]*user-select:text!important/.test(css), 'inputs keep text selection');
    assert.ok(/body\{[^}]*font-size:13px/.test(css), 'body font is 13px (smaller text)');
    assert.ok(/\.avatar-ring\{[^}]*animation:spin 8s linear infinite/.test(css), 'avatar ring spins 8s linear (ZVY-style rotating dashed ring)');
    assert.ok(/\.match\{[^}]*border-radius:18px/.test(css), 'match card has round 18px corners like the ZVY card screenshot');
    assert.ok(/\.match\{[^}]*border:2px solid/.test(css), 'match card has a thick red border like the ZVY card screenshot');
    assert.ok(/\.join-btn\{[^}]*padding:15px;font-size:16px/.test(css), 'Join Now is big and thick (15px padding, 16px font)');
    assert.ok(/\.join-btn\{[^}]*border-radius:18px/.test(css), 'Join Now is round (18px radius)');
    assert.ok(/\.row3 \.btn\{[^}]*padding:14px 4px;font-size:13px/.test(css), 'Slots/Room/Prizes are thick round red buttons (14px padding, 13px font)');
    assert.ok(/\.row3 \.btn\{[^}]*border-radius:16px/.test(css), 'Slots/Room/Prizes are round (16px radius)');
    assert.ok(/\.tile\{[^}]*border-radius:14px/.test(css), 'info tiles are round (14px radius)');
    assert.ok(/\.tile-ic\{[^}]*width:34px;height:34px/.test(css), 'tile icon circles are 34px like the ZVY card');
    assert.ok(/\.regbar\{height:6px/.test(css), 'registration bar is thin and green like the ZVY card');
    assert.ok(/\.avatar-ring\{[^}]*border:3px dashed/.test(css), 'avatar ring is a red dashed circle');
    assert.ok(/\.avatar-ring\{[^}]*pointer-events:none/.test(css), 'avatar ring never blocks clicks (camera button stays clickable)');
    assert.ok(!/\.avatar-img\{[^}]*border:3px dashed/.test(css), 'avatar image itself is static — only the ring spins');
    assert.ok(appJs.includes('noCopy') && appJs.includes("addEventListener('contextmenu'") && appJs.includes("addEventListener('selectstart'"), 'long-press copy blocked outside inputs');
    const man = await fetch('http://127.0.0.1:3101/manifest.webmanifest');
    assert.strictEqual(man.status, 200, 'manifest serves');
    const sw = await (await fetch('http://127.0.0.1:3101/sw.js')).text();
    assert.ok(sw.includes('s19-tournament-v17'), 'sw cache bumped to v17 so phones fetch the new shell');
    const idx = await (await fetch('http://127.0.0.1:3101/')).text();
    assert.ok(idx.includes('appinstalled'), 'index tracks install state (Download button stays visible)');
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
