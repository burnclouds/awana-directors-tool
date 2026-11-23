(this.AwanaVersions = this.AwanaVersions || {})['planning-center-identity.js'] = '1.0.0';
// Identity links come from confirmed roster review, never from a name match.
(function (root) {
  function relations(links, organizationId) {
    const byPerson = new Map(), byLocal = new Map();
    const add = (index, key, value) => {
      const items = index.get(key) || new Set();
      items.add(value); index.set(key, items);
    };
    (links || []).forEach(link => {
      if (link.organizationId !== organizationId || !link.personId || !link.id) return;
      add(byPerson, link.personId, link.id);
      add(byLocal, link.id, link.personId);
    });
    return { byPerson, byLocal };
  }
  function resolve(links, { organizationId, personId }) {
    if (!organizationId || !personId) return { status: 'unmatched' };
    const { byPerson, byLocal } = relations(links, organizationId), ids = byPerson.get(personId);
    if (!ids) return { status: 'unmatched' };
    if (ids.size > 1) return { status: 'ambiguous' };
    const [id] = ids;
    return byLocal.get(id).size === 1 ? { status: 'matched', id } : { status: 'ambiguous' };
  }
  function localIds(links, { organizationId }) {
    if (!organizationId) return [];
    const { byPerson, byLocal } = relations(links, organizationId);
    return [...byLocal].flatMap(([id, personIds]) => {
      const [personId] = personIds;
      return personIds.size === 1 && byPerson.get(personId).size === 1 ? [id] : [];
    });
  }
  const api = { resolve, localIds };
  if (typeof module !== 'undefined') module.exports = api; else root.PlanningCenterIdentity = api;
})(this);
