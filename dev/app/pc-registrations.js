(this.AwanaVersions = this.AwanaVersions || {})['pc-registrations.js'] = '1.0.0';
// Read-only N71 pilot. Keep projected API fields and identity links separate from captured CSV records.
(function (root) {
  const Model = root.Model || (typeof require !== 'undefined' ? require('./model.js') : null);
  const VERSION = '2025-05-01', PATH = '/registrations/v2';
  const FIELD_COLUMNS = { firstName: Model.C.FIRST, lastName: Model.C.LAST, selection: Model.C.SELECTION, emergencyContact: Model.C.EMERG };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const validId = id => typeof id === 'string' && /^\d{1,40}$/.test(id);
  const unavailable = reason => ({ status: 'unavailable', reason });
  const field = (attributes, key) => {
    if (!has(attributes, key)) return { status: 'unavailable' };
    const value = attributes[key];
    if (value === null || value === '') return { status: 'blank' };
    return typeof value === 'string' && value.trim() ? { status: 'value', value } : { status: 'unavailable' };
  };
  const attr = resource => (resource && resource.attributes) || {};
  const related = (record, key) => record.relationships && record.relationships[key] && record.relationships[key].data;
  function association(record, key, included) {
    const link = related(record, key);
    return link && included.find(r => r && r.type === link.type && r.id === link.id);
  }
  const relationId = (record, key) => {
    const link = related(record, key);
    return link && validId(link.id) ? link.id : '';
  };

  function attendeeStatus(attributes) {
    const { canceled, waitlisted, active } = attributes;
    if (canceled === true) return 'canceled';
    if (waitlisted === true) return 'waitlisted';
    if (active === true && canceled === false && waitlisted === false) return 'active';
    if (active === false && canceled === false && waitlisted === false) return 'inactive';
    return 'unknown';
  }
  function emergencyField(resource) {
    const name = field(attr(resource), 'name'), phone = field(attr(resource), 'phone_number');
    if (name.status === 'unavailable' || phone.status === 'unavailable') return { status: 'unavailable' };
    if (name.status === 'blank' && phone.status === 'blank') return { status: 'blank' };
    return { status: 'value', value: (name.value || '') + (phone.value ? ' - ' + phone.value : '') };
  }
  function projectAttendee(record, included) {
    if (!record || record.type !== 'Attendee' || !validId(record.id)) throw new Error('Invalid attendee response.');
    const person = attr(association(record, 'person', included));
    const selection = attr(association(record, 'selection_type', included));
    return {
      attendeeId: record.id,
      // This is the Registrations link. Prove parity before accepting it as a cross-product person ID.
      registrantPersonId: relationId(record, 'person'),
      registrationId: relationId(record, 'registration'),
      status: attendeeStatus(attr(record)),
      fields: {
        firstName: field(person, 'first_name'), lastName: field(person, 'last_name'),
        selection: field(selection, 'name'), emergencyContact: emergencyField(association(record, 'emergency_contact', included)),
      },
    };
  }
  function projectRegistration(record, included) {
    if (!record || record.type !== 'Registration' || !validId(record.id)) throw new Error('Invalid registration response.');
    const contact = attr(association(record, 'registrant_contact', included));
    return {
      registrationId: record.id, contactPersonId: relationId(record, 'registrant_contact'),
      firstName: field(contact, 'first_name'), lastName: field(contact, 'last_name'),
    };
  }
  async function readOrganization(client, { signal } = {}) {
    const result = await client.read(PATH, { version: VERSION, signal, project: doc => {
      const entry = Array.isArray(doc.data) && doc.data.length === 1 ? doc.data[0] : doc.data;
      return entry && entry.type === 'Organization' && validId(entry.id) ?
        { id: entry.id, name: attr(entry).name || '' } : null;
    } });
    if (result.status !== 'complete') return result;
    return result.data ? result : unavailable('organization-unverified');
  }
  async function readSignup(client, { organizationId, signupId, signal }) {
    if (!validId(organizationId) || !validId(signupId)) return unavailable('signup-unverified');
    const organization = await readOrganization(client, { signal });
    if (organization.status !== 'complete') return organization;
    if (organization.data.id !== organizationId) return unavailable('wrong-organization');
    const path = PATH + '/signups/' + signupId;
    const attendees = await client.readPages(path + '/attendees?include=person,registration,selection_type,emergency_contact&per_page=100',
      { version: VERSION, signal, project: projectAttendee });
    if (attendees.status !== 'complete') return attendees;
    const registrations = await client.readPages(path + '/registrations?include=registrant_contact&per_page=100',
      { version: VERSION, signal, project: projectRegistration });
    if (registrations.status !== 'complete') return registrations;
    if (new Set(attendees.rows.map(row => row.attendeeId)).size !== attendees.rows.length ||
        new Set(registrations.rows.map(row => row.registrationId)).size !== registrations.rows.length) {
      return unavailable('duplicate-remote-identity');
    }
    return { status: 'complete', organizationId, signupId, attendees: attendees.rows, registrations: registrations.rows };
  }

  // An unavailable field supplies no proposal. An explicit blank is visible for review and never applied here.
  function reviewFields(person, fields) {
    return Object.entries(FIELD_COLUMNS).flatMap(([key, column]) => {
      const next = fields[key];
      if (!next || next.status === 'unavailable') return [];
      const from = person && person[column] != null ? person[column] : '';
      const to = next.status === 'value' ? next.value : '';
      return from === to ? [] : [{ column, from, to, status: next.status }];
    });
  }
  function preview(master, snapshot, { organizationId, signupId, links = [] }) {
    if (snapshot.status !== 'complete') return unavailable(snapshot.reason || 'incomplete-signup');
    if (!validId(organizationId) || !validId(signupId) || snapshot.organizationId !== organizationId || snapshot.signupId !== signupId) {
      return unavailable('wrong-signup');
    }
    const attendanceLinks = new Map();
    links.filter(link => link.organizationId === organizationId && link.signupId === signupId).forEach(link => {
      const ids = attendanceLinks.get(link.attendeeId) || new Set();
      if (link.id) ids.add(link.id);
      attendanceLinks.set(link.attendeeId, ids);
    });
    const peopleById = new Map();
    master.people.forEach(person => {
      const id = person[Model.X.ID], records = peopleById.get(id) || [];
      records.push(person); peopleById.set(id, records);
    });
    const report = snapshot.attendees.map(attendee => {
      const ids = attendanceLinks.get(attendee.attendeeId) || new Set();
      const id = ids.size === 1 ? [...ids][0] : '';
      const people = (id && peopleById.get(id)) || [];
      const identity = ids.size > 1 || people.length > 1 ? 'ambiguous' :
        people.length === 1 ? 'matched' : id ? 'missing-local-record' : 'unlinked';
      return { attendeeId: attendee.attendeeId, registrationStatus: attendee.status, identity,
        ...(identity === 'matched' ? { id } : {}), fields: attendee.fields,
        changes: identity === 'matched' ? reviewFields(people[0], attendee.fields) : [] };
    });
    // Two attendee rows aiming at one local roster record need review even when each link alone is unique.
    const counts = new Map();
    report.forEach(row => { if (row.id) counts.set(row.id, (counts.get(row.id) || 0) + 1); });
    report.forEach(row => {
      if (counts.get(row.id) > 1) { row.identity = 'ambiguous'; delete row.id; row.changes = []; }
    });
    return { status: 'complete', organizationId, signupId, rows: report };
  }

  const api = { VERSION, readOrganization, readSignup, preview };
  if (typeof module !== 'undefined') module.exports = api; else root.PcRegistrations = api;
})(this);
