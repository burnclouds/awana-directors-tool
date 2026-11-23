(this.AwanaVersions = this.AwanaVersions || {})['planning-center-identity.js'] = '1.0.0';
// Identity links come from confirmed roster review, never from a name match.
(function (root) {
  function resolve(links, { organizationId, personId }) {
    if (!organizationId || !personId) return { status: 'unmatched' };
    const ids = new Set(links.filter(link => link.organizationId === organizationId && link.personId === personId && link.id).map(link => link.id));
    if (!ids.size) return { status: 'unmatched' };
    if (ids.size > 1) return { status: 'ambiguous' };
    return { status: 'matched', id: [...ids][0] };
  }
  const api = { resolve };
  if (typeof module !== 'undefined') module.exports = api; else root.PlanningCenterIdentity = api;
})(this);
