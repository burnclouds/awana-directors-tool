(this.AwanaVersions = this.AwanaVersions || {})['intake.js'] = '1.1.0';
// Rules for new registrations, shared by the Planning Center export check (validate.js) and the To do page (todo.js).
// Pure helpers: dates and ages, grades, which group a child belongs in, and whether a name or email looks wrong.
// Grade-to-group follows how this club runs: Pre-K = Cubbies, Kindergarten to 2nd = Sparks, 3rd to 6th = T&T (Puggles are chosen on the registration form).
(function (root) {
  // Birthdates arrive as M/D/YYYY from Planning Center; yyyy-mm-dd is accepted too. null when blank or not a real calendar date.
  function parseBirthdate(s) {
    s = String(s || '').trim();
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s), y, mo, d;
    if (m) { mo = +m[1]; d = +m[2]; y = +m[3]; } else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; } else return null;
    const t = new Date(Date.UTC(y, mo - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? { y, m: mo, d } : null;
  }
  // Whole years on a reference day ('YYYY-MM-DD').
  function ageOn(b, ref) {
    const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ref || ''); if (!b || !r) return null;
    return +r[1] - b.y - ((+r[2] < b.m || (+r[2] === b.m && +r[3] < b.d)) ? 1 : 0);
  }

  // -1 Pre-K, 0 Kindergarten, 1 to 12; null when blank or unrecognised.
  function parseGrade(s) {
    s = String(s || '').trim().toLowerCase();
    if (!s) return null;
    if (/^(pre-?k|pre-?school|prek)/.test(s)) return -1;
    if (/^(k|kg|kindergarten)\b/.test(s)) return 0;
    const m = /^(\d{1,2})(st|nd|rd|th)?\b/.exec(s);
    return m && +m[1] >= 1 && +m[1] <= 12 ? +m[1] : null;
  }
  const PUGGLES = /^puggles/i, VOLUNTEER = /volunteer/i;
  // 'Puggles' | 'Cubbies' | 'Sparks' | 'T&T' | 'Volunteers' | 'Older' (past 6th grade: no program here) | '' (cannot tell).
  function suggestGroup(selection, grade) {
    if (VOLUNTEER.test(selection || '')) return 'Volunteers';
    if (PUGGLES.test(selection || '')) return 'Puggles';
    const g = parseGrade(grade);
    if (g === null) return '';
    return g < 0 ? 'Cubbies' : g <= 2 ? 'Sparks' : g <= 6 ? 'T&T' : 'Older';
  }
  // Is a class group acceptable for this registration? Pre-K children sit in Puggles or Cubbies depending on age.
  function classFits(selection, grade, have) {
    const want = suggestGroup(selection, grade);
    return !want || want === 'Older' || want === have || (parseGrade(grade) === -1 && (have === 'Puggles' || have === 'Cubbies'));
  }
  // Does the grade make sense for the age? Pre-K is anything before Kindergarten, so any age up to 5 fits (a baby or toddler is fine); otherwise the usual age for the grade is grade + 5, give or take two.
  const gradeFitsAge = (grade, age) => { const g = parseGrade(grade); return g === null || age === null || (g < 0 ? age <= 5 : Math.abs(age - (g + 5)) <= 2); };

  // Several addresses may share one box, separated by ; or ,. Spaces inside an address are a mistake, not a separator.
  const emails = s => String(s || '').split(/[;,]+/).map(x => x.trim()).filter(Boolean);
  const validEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  // What is odd about a name as typed, or '' when nothing is.
  function oddName(s) {
    s = String(s == null ? '' : s);
    if (!s.trim()) return '';
    if (s !== s.trim() || /\s{2,}/.test(s)) return 'has extra spaces';
    const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letters.length > 1 && letters === letters.toLowerCase()) return 'is all lower case';
    if (letters.length > 3 && letters === letters.toUpperCase()) return 'is all capitals';
    return '';
  }

  const api = { parseBirthdate, ageOn, parseGrade, suggestGroup, classFits, gradeFitsAge, emails, validEmail, oddName };
  if (typeof module !== 'undefined') module.exports = api; else root.Intake = api;
})(this);
