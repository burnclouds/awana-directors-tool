(this.AwanaVersions = this.AwanaVersions || {})['planning-center.js'] = '1.0.0';
// Planning Center public OAuth and paginated API reads. Callers choose the product scope and project each page.
(function (root) {
  const ORIGIN = 'https://api.planningcenteronline.com';
  const REQUEST = { credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' };

  const unavailable = reason => ({ status: 'unavailable', reason });
  const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const aborted = signal => signal && signal.aborted;
  function failure(response) {
    if (response.status === 401) return unavailable('authorization-expired');
    if (response.status === 403) return unavailable('permission-denied');
    if (response.status === 429) {
      const raw = response.headers.get('Retry-After') || '';
      return Object.assign(unavailable('rate-limited'), { retryAfter: /^(?:\d+|\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT)$/.test(raw) ? raw : '' });
    }
    return unavailable('request-failed');
  }

  async function authorize({ clientId, redirectUri, scopes, crypto = globalThis.crypto }) {
    const redirect = new URL(redirectUri);
    if (!clientId || redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.search || redirect.hash) {
      throw new Error('A public client ID and exact HTTPS callback are required.');
    }
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const url = new URL('/oauth/authorize', ORIGIN);
    url.search = new URLSearchParams({
      client_id: clientId, redirect_uri: redirect.href, scope: scopes.join(' '),
      response_type: 'code', code_challenge: base64url(new Uint8Array(hash)), code_challenge_method: 'S256', state,
    });
    return { url: url.href, pending: { clientId, redirectUri: redirect.href, state, verifier } };
  }

  async function exchange({ pending, callback, fetch = globalThis.fetch, signal }) {
    if (!pending || aborted(signal)) return unavailable('canceled');
    let url;
    try { url = new URL(callback); } catch { return unavailable('invalid-callback'); }
    const states = url.searchParams.getAll('state'), codes = url.searchParams.getAll('code');
    if (url.hash || url.username || url.password || url.origin + url.pathname !== pending.redirectUri ||
        states.length !== 1 || !pending.state || states[0] !== pending.state) return unavailable('invalid-callback');
    if (url.searchParams.has('error')) {
      pending.state = ''; pending.verifier = '';
      return unavailable('authorization-denied');
    }
    if (codes.length !== 1 || !codes[0]) return unavailable('invalid-callback');

    const body = new URLSearchParams({
      grant_type: 'authorization_code', client_id: pending.clientId, redirect_uri: pending.redirectUri,
      code_verifier: pending.verifier, code: codes[0],
    });
    // An attempt consumes the state, including on a network error. Start a new authorization to try again.
    pending.state = ''; pending.verifier = '';
    try {
      const response = await fetch(ORIGIN + '/oauth/token', { ...REQUEST, method: 'POST', body, signal });
      if (aborted(signal)) return unavailable('canceled');
      if (!response.ok) return failure(response);
      const token = await response.json();
      if (aborted(signal)) return unavailable('canceled');
      if (!token || typeof token.access_token !== 'string' || !token.access_token || String(token.token_type).toLowerCase() !== 'bearer') {
        return unavailable('invalid-response');
      }
      return { status: 'complete', accessToken: token.access_token };
    } catch { return unavailable(aborted(signal) ? 'canceled' : 'request-failed'); }
  }

  // A pagination link may change only pagination parameters on the originally requested collection.
  function collection(url) {
    const query = new URLSearchParams(url.search);
    query.delete('offset'); query.delete('per_page'); query.sort();
    return url.origin + url.pathname + '?' + query;
  }
  function apiUrl(path, from = ORIGIN) {
    const url = new URL(path, from);
    if (url.origin !== ORIGIN || url.username || url.password || url.hash || !/^\/(registrations|check-ins|people|current)\/v2(?:\/|$)/.test(url.pathname)) {
      throw new Error('Invalid Planning Center API endpoint.');
    }
    return url;
  }
  function createClient({ accessToken, fetch = globalThis.fetch }) {
    const headers = version => ({
      Authorization: 'Bearer ' + accessToken, Accept: 'application/vnd.api+json',
      ...(version ? { 'X-PCO-API-Version': version } : {}),
    });
    async function read(path, { version, signal, project }) {
      if (aborted(signal)) return unavailable('canceled');
      if (!accessToken) return unavailable('authorization-required');
      let url;
      try { url = apiUrl(path); } catch { return unavailable('invalid-endpoint'); }
      try {
        const response = await fetch(url.href, { ...REQUEST, headers: headers(version), signal });
        if (aborted(signal)) return unavailable('canceled');
        if (!response.ok) return failure(response);
        const doc = await response.json();
        if (aborted(signal)) return unavailable('canceled');
        if (!doc || !Object.prototype.hasOwnProperty.call(doc, 'data') || (doc.errors && doc.errors.length)) {
          return unavailable('invalid-response');
        }
        try { return { status: 'complete', data: project(doc) }; }
        catch { return unavailable('invalid-response'); }
      } catch { return unavailable(aborted(signal) ? 'canceled' : 'request-failed'); }
    }
    async function readPages(path, { version, signal, project }) {
      if (aborted(signal)) return unavailable('canceled');
      if (!accessToken) return unavailable('authorization-required');
      let first;
      try { first = apiUrl(path); } catch { return unavailable('invalid-endpoint'); }
      let page = first, expectedTotal;
      const scope = collection(first), rows = [];
      while (page) {
        if (aborted(signal)) return unavailable('canceled');
        const offsets = page.searchParams.getAll('offset');
        if (collection(page) !== scope || offsets.length > 1 || (offsets[0] || '0') !== String(rows.length)) {
          return unavailable('invalid-pagination');
        }
        const result = await read(page.href, { version, signal, project: doc => doc });
        if (result.status !== 'complete') return result;
        const doc = result.data;
        if (!Array.isArray(doc.data) || (doc.included !== undefined && !Array.isArray(doc.included))) return unavailable('invalid-response');
        const total = doc.meta && doc.meta.total_count;
        if (Number.isSafeInteger(total) && total >= 0) {
          if (expectedTotal !== undefined && expectedTotal !== total) return unavailable('incomplete-pagination');
          expectedTotal = total;
        }
        try { doc.data.forEach(resource => rows.push(project(resource, doc.included || []))); }
        catch { return unavailable('invalid-response'); }
        const link = doc.links && doc.links.next;
        const next = link && typeof link === 'object' ? link.href : link;
        if (link == null) break;
        if (typeof next !== 'string' || !next || !doc.data.length) return unavailable('invalid-pagination');
        try { page = apiUrl(next, page.href); }
        catch { return unavailable('invalid-pagination'); }
      }
      if (expectedTotal !== undefined && expectedTotal !== rows.length) return unavailable('incomplete-pagination');
      return { status: 'complete', rows };
    }
    return { read, readPages };
  }
  const api = { authorize, exchange, createClient };
  if (typeof module !== 'undefined') module.exports = api; else root.PlanningCenter = api;
})(this);
