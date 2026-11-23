// Invented signup responses and roster records. No API calls or credentials.
const assert = require('node:assert/strict');
const Model = require('../model.js');
const PC = require('../planning-center.js');
const Registrations = require('../pc-registrations.js');
const resource = (type, id, attributes, relationships) => ({ type, id, attributes, relationships });
const link = (type, id) => ({ data: { type, id } });
const attendee = (id, person, status = {}) => resource('Attendee', id, { active: true, canceled: false, waitlisted: false, ...status }, {
  person: link('Person', person),
  registration: link('Registration', '100'),
  selection_type: link('SelectionType', '200'),
  emergency_contact: link('EmergencyContact', '300'),
});
const early = { data: [attendee('1', '10')], included: [
  resource('Person', '10', { first_name: 'Pat', last_name: 'Test', unused: 'ignored' }),
  resource('SelectionType', '200', { name: 'Sparks' }),
  resource('EmergencyContact', '300', { name: 'A. Test', phone_number: '555-010-1000' }),
] };
const late = { data: [attendee('2', '11', { canceled: true })], included: [
  resource('Person', '11', { first_name: 'Terry', last_name: null }),
] };
const registration = { data: [resource('Registration', '100', {}, { registrant_contact: link('Person', '21') })], included: [
  resource('Person', '21', { first_name: 'Adult', last_name: 'Test' }),
] };
const org = { data: resource('Organization', '900', { name: 'TEST Organization' }) };
const scope = { organizationId: '900', signupId: '12' };
const mk = ({ latePage = late, lateStatus = 200 } = {}) => {
  const requests = [];
  const client = PC.createClient({ accessToken: 'TEST-token', fetch: async target => {
    const url = new URL(target);
    requests.push(url);
    const endpoint = url.pathname.split('/').pop();
    if (endpoint === 'v2') return new Response(JSON.stringify(org));
    if (endpoint === 'registrations') return new Response(JSON.stringify(registration));
    assert.equal(endpoint, 'attendees');
    if (url.searchParams.has('offset')) return new Response(JSON.stringify(latePage), { status: lateStatus });
    url.searchParams.set('offset', '100');
    return new Response(JSON.stringify({ ...early, links: { next: url.href } }));
  } });
  return { client, requests };
};

async function main() {
  const wrongOrg = mk();
  assert.deepEqual(await Registrations.readSignup(wrongOrg.client, { ...scope, organizationId: '901' }), { status: 'unavailable', reason: 'wrong-organization' });
  assert.equal(wrongOrg.requests.length, 1);

  const failure = mk({ lateStatus: 403 });
  assert.deepEqual(await Registrations.readSignup(failure.client, scope), { status: 'unavailable', reason: 'permission-denied' });
  assert.equal(failure.requests.length, 3);
  const duplicate = mk({ latePage: early });
  assert.deepEqual(await Registrations.readSignup(duplicate.client, scope), { status: 'unavailable', reason: 'duplicate-remote-identity' });

  const good = mk();
  const snapshot = await Registrations.readSignup(good.client, scope);
  assert.equal(snapshot.status, 'complete');
  assert.equal(good.requests.length, 4);
  assert.deepEqual(snapshot.attendees.map(r => [r.attendeeId, r.registrationId, r.registrantPersonId, r.status]), [
    ['1', '100', '10', 'active'], ['2', '100', '11', 'canceled'],
  ]);
  assert.equal(snapshot.registrations[0].contactPersonId, '21');
  assert.deepEqual(snapshot.attendees[0].fields.emergencyContact, { status: 'value', value: 'A. Test - 555-010-1000' });
  assert.deepEqual(snapshot.attendees[1].fields.lastName, { status: 'blank' });
  assert.deepEqual(snapshot.attendees[1].fields.selection, { status: 'unavailable' });
  assert(!JSON.stringify(snapshot).includes('unused'));

  const master = { pcExport: { header: ['untouched'] }, people: [
    { [Model.X.ID]: 'frozen-pat', [Model.C.FIRST]: 'Patrick', [Model.C.LAST]: 'Test', [Model.C.EMERG]: 'Stored - 555-010-5000', [Model.C.ROOM]: 'Assignment', ['ov:' + Model.C.FIRST]: 'Pending' },
    { [Model.X.ID]: 'frozen-terry', [Model.C.FIRST]: 'Terry', [Model.C.LAST]: 'Test', [Model.C.SELECTION]: 'Cubbies', [Model.X.ACTIVE]: '1' },
  ] };
  const links = [
    { ...scope, attendeeId: '1', id: 'frozen-pat' },
    { ...scope, attendeeId: '2', id: 'frozen-terry' },
    { ...scope, organizationId: '901', attendeeId: '2', id: 'wrong-local' },
  ];
  const before = JSON.stringify(master);
  const preview = Registrations.preview(master, snapshot, { ...scope, links });
  assert.equal(preview.rows[0].id, 'frozen-pat');
  assert(preview.rows[0].changes.some(x => x.column === Model.C.FIRST && x.to === 'Pat'));
  assert(!preview.rows[0].changes.some(x => x.column === Model.C.ROOM));
  assert.deepEqual(preview.rows[1].changes, [{ column: Model.C.LAST, from: 'Test', to: '', status: 'blank' }]);
  assert.equal(JSON.stringify(master), before);
  assert.equal(Registrations.preview(master, snapshot, { ...scope, signupId: '13', links }).reason, 'wrong-signup');
  assert(Registrations.preview(master, snapshot, scope).rows.every(r => r.identity === 'unlinked' && !r.changes.length));

  const conflict = Registrations.preview(master, snapshot, { ...scope, links: [links[0], { ...links[1], id: 'frozen-pat' }] });
  assert(conflict.rows.every(r => r.identity === 'ambiguous' && !r.changes.length));
  console.log('Mocked Registrations scope, source coverage and roster preview tests passed.');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
