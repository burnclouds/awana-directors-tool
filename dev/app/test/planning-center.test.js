// Mocked Planning Center transport and identity checks. No API calls or credentials.
const assert = require('node:assert/strict');
const { webcrypto, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PC = require('../planning-center.js');
const Identity = require('../planning-center-identity.js');

const endpoint = '/registrations/v2/signups/12/attendees?include=person&per_page=100';
const reply = (doc, status = 200, headers = {}) => new Response(JSON.stringify(doc), { status, headers });
const resource = id => ({ type: 'Attendee', id });
const noNetwork = () => { throw new Error('Unexpected request'); };

function checkBrowserLoad() {
  const browser = vm.createContext({ fetch: noNetwork });
  for (const name of ['localStorage', 'sessionStorage', 'XMLHttpRequest', 'navigator']) {
    Object.defineProperty(browser, name, { get: noNetwork });
  }
  for (const file of ['csv.js', 'model.js', 'planning-center.js', 'planning-center-identity.js', 'pc-registrations.js']) {
    const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
    vm.runInContext(source, browser, { filename: file });
  }
  assert.equal(typeof browser.PlanningCenter.createClient, 'function');
  assert.equal(typeof browser.PlanningCenterIdentity.resolve, 'function');
  assert.equal(typeof browser.PcRegistrations.readSignup, 'function');
}

async function main() {
  checkBrowserLoad();
  const opt = { clientId: 'TEST-public-client', redirectUri: 'https://example.invalid/app/callback.html', scopes: ['registrations'], crypto: webcrypto };
  const first = await PC.authorize(opt);
  const second = await PC.authorize(opt);
  const url = new URL(first.url);
  assert.equal(url.origin, 'https://api.planningcenteronline.com');
  assert.equal(url.searchParams.get('scope'), 'registrations');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(first.pending.verifier).digest('base64url'));
  assert.notEqual(first.pending.state, second.pending.state);
  const callback = opt.redirectUri + '?code=TEST-code&state=' + first.pending.state;
  let requests = 0;
  const mockExchange = async (target, init) => {
    requests++;
    assert.equal(target, 'https://api.planningcenteronline.com/oauth/token');
    assert.equal(init.body.get('client_secret'), null);
    assert.ok(init.body.get('code_verifier'));
    assert.equal(init.redirect, 'error');
    return reply({ token_type: 'Bearer', access_token: 'TEST-token', refresh_token: 'ignored' });
  };
  assert.deepEqual(await PC.exchange({ pending: first.pending, callback: callback + '&state=extra', fetch: mockExchange }), { status: 'unavailable', reason: 'invalid-callback' });
  assert.deepEqual(await PC.exchange({ pending: first.pending, callback: callback.replace('/app/', '/other/'), fetch: mockExchange }), { status: 'unavailable', reason: 'invalid-callback' });
  assert.equal(requests, 0);
  assert.deepEqual(await PC.exchange({ pending: first.pending, callback, fetch: mockExchange }), { status: 'complete', accessToken: 'TEST-token' });
  assert.deepEqual(await PC.exchange({ pending: first.pending, callback, fetch: mockExchange }), { status: 'unavailable', reason: 'invalid-callback' });
  assert.equal(requests, 1);

  const next = endpoint + '&offset=1';
  const opts = { version: '2025-05-01', project: (row, included) => [row.id, included.length] };
  let reads = [];
  const client = PC.createClient({ accessToken: 'TEST-token', fetch: async (target, init) => {
    const url = new URL(target);
    reads.push(url);
    assert.equal(url.origin, 'https://api.planningcenteronline.com');
    assert.equal(init.headers.Authorization, 'Bearer TEST-token');
    assert.equal(init.headers['X-PCO-API-Version'], '2025-05-01');
    assert.equal(init.cache, 'no-store');
    return reads.length === 1 ? reply({ data: [resource('1')], included: [{}], links: { next } }) : reply({ data: [resource('2')] });
  } });
  assert.deepEqual(await client.readPages(endpoint, opts), { status: 'complete', rows: [['1', 1], ['2', 0]] });
  assert.equal(reads.length, 2);
  assert.equal(reads[1].searchParams.get('offset'), '1');

  const pageTwoFailed = PC.createClient({ accessToken: 'TEST-token', fetch: async url => new URL(url).searchParams.has('offset') ?
    reply({ errors: [{}] }, 429, { 'Retry-After': '2' }) : reply({ data: [resource('1')], links: { next } }) });
  assert.deepEqual(await pageTwoFailed.readPages(endpoint, opts), { status: 'unavailable', reason: 'rate-limited', retryAfter: '2' });

  for (const invalid of ['https://example.invalid/' + next, next.replace('/12/', '/13/'), next + '&filter=waitlist', endpoint, next.replace('offset=1', 'offset=2')]) {
    let count = 0;
    const client = PC.createClient({ accessToken: 'TEST-token', fetch: async () => {
      count++;
      return reply({ data: [resource('1')], links: { next: invalid } });
    } });
    assert.equal((await client.readPages(endpoint, opts)).status, 'unavailable');
    assert.equal(count, 1);
  }

  const incomplete = PC.createClient({ accessToken: 'TEST-token', fetch: async () => reply({ data: [resource('1')], meta: { total_count: 2 } }) });
  assert.deepEqual(await incomplete.readPages(endpoint, opts), { status: 'unavailable', reason: 'incomplete-pagination' });
  const linkObject = PC.createClient({ accessToken: 'TEST-token', fetch: async url => new URL(url).searchParams.has('offset') ?
    reply({ data: [resource('2')] }) : reply({ data: [resource('1')], links: { next: { href: next } } }) });
  assert.equal((await linkObject.readPages(endpoint, opts)).status, 'complete');

  const controller = new AbortController();
  const aborted = PC.createClient({ accessToken: 'TEST-token', fetch: async () => { controller.abort(); return reply({ data: [resource('1')] }); } });
  assert.deepEqual(await aborted.readPages(endpoint, { ...opts, signal: controller.signal }), { status: 'unavailable', reason: 'canceled' });
  assert.deepEqual(await PC.createClient({ fetch: noNetwork }).readPages(endpoint, opts), { status: 'unavailable', reason: 'authorization-required' });

  const linked = [
    { organizationId: 'church-a', personId: '1', id: 'roster-a' },
    { organizationId: 'church-b', personId: '1', id: 'roster-b' },
    { organizationId: 'church-a', personId: '1', id: 'roster-a' },
  ];
  const target = { organizationId: 'church-a', personId: '1' };
  assert.deepEqual(Identity.resolve(linked, target), { status: 'matched', id: 'roster-a' });
  assert.deepEqual(Identity.resolve(linked, { ...target, organizationId: 'church-c' }), { status: 'unmatched' });
  assert.deepEqual(Identity.resolve(linked.concat({ ...target, id: 'other' }), target), { status: 'ambiguous' });
  assert.deepEqual(Identity.localIds(linked, target), ['roster-a']);
  assert.deepEqual(Identity.localIds(linked.concat({ ...target, id: 'other' }), target), []);
  const reverseConflict = linked.concat({ organizationId: 'church-a', personId: '2', id: 'roster-a' });
  assert.deepEqual(Identity.resolve(reverseConflict, target), { status: 'ambiguous' });
  assert.deepEqual(Identity.localIds(reverseConflict, target), []);
  console.log('Mocked Planning Center OAuth, pagination and identity tests passed.');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
