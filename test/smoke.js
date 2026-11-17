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
    const bad = await req('POST', '/api/deposit', { amount: 100, method: 'bkash', senderNumber: '01906502081', trxId: 'abc' }, ownerToken);
    assert.strictEqual(bad.status, 400, 'bad trx rejected');
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

    // publish result: 1st place, 7 kills -> prize 90 + 7*10 = 160 to winning
    const res = await req('POST', '/api/results', { tournamentId: 2, profileId: me.data.profile.id, playerName: 'bijoy', placement: 1, kills: 7 }, ownerToken);
    assert.strictEqual(res.status, 200, 'publish result');
    me = await req('GET', '/api/me', null, ownerToken);
    assert.strictEqual(me.data.wallet.winningBalance, 160, 'prize 160 to winning, got ' + me.data.wallet.winningBalance);

    // withdraw below minimum + from deposit refused; spin works once
    const wdBad = await req('POST', '/api/withdraw', { amount: 50, method: 'bkash', accountNumber: '01906502081' }, ownerToken);
    assert.strictEqual(wdBad.status, 400, 'withdraw below 100 refused');
    const spin = await req('POST', '/api/spin', {}, ownerToken);
    assert.strictEqual(spin.status, 200, 'daily spin');
    const spin2 = await req('POST', '/api/spin', {}, ownerToken);
    assert.strictEqual(spin2.status, 400, 'second spin same day refused');

    // payment info + landing page + manifest
    const pay = await req('GET', '/api/payment-info');
    assert.strictEqual(pay.data.bkashNumber, '01906502081', 'bKash number seeded');
    const page = await fetch('http://127.0.0.1:3101/');
    assert.strictEqual(page.status, 200, 'landing serves');
    assert.ok((await page.text()).includes('S_19 TOURNAMENT'), 'landing has title');
    const man = await fetch('http://127.0.0.1:3101/manifest.webmanifest');
    assert.strictEqual(man.status, 200, 'manifest serves');
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
