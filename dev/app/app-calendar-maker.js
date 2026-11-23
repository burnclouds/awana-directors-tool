(this.AwanaVersions = this.AwanaVersions || {})['app-calendar-maker.js'] = '1.0.0';
// Calendar maker owns a temporary form and preview. The live calendar changes only on Apply.
(function () {
  const App = window.App, C = window.Calendar, S = window.Season, Safety = window.CalendarSafety;
  const $ = id => document.getElementById(id), esc = App.esc;
  const panel = $('calMaker'), opener = $('btnCalMake');
  let file, preview;

  function close() {
    file = preview = undefined;
    panel.hidden = true;
    panel.innerHTML = '';
    opener.setAttribute('aria-expanded', 'false');
  }
  function breakRow(b) {
    b = b || {};
    return '<div class="bar" data-cal-break><label>Break name <input data-name value="' + esc(b.name || '') + '"></label>' +
      '<label>From <input type="date" data-from value="' + esc(b.from || '') + '"></label>' +
      '<label>Through <input type="date" data-to value="' + esc(b.to || '') + '"></label>' +
      '<button type="button" data-remove>Remove break</button></div>';
  }
  function defaultDates(day) {
    const nights = C.sort(C.nights(App.calendar).filter(r => S.isRealDate(r.Date)));
    const cutoff = App.season.config.carriedThrough;
    const current = S.isRealDate(cutoff) ? nights.filter(r => r.Date > cutoff) : nights;
    const dates = current.length ? current.map(row => row.Date) : C.shiftWeeks(nights.map(row => ({ Date: row.Date })), 52).map(row => row.Date);
    if (dates.length && (!S.isRealDate(cutoff) || dates[0] > cutoff)) return [dates[0], dates.at(-1)];
    const next = new Date(App.today() + 'T12:00:00Z');
    next.setUTCDate(next.getUTCDate() + (day - next.getUTCDay() + 7) % 7);
    return [next.toISOString().slice(0, 10), ''];
  }
  function open() {
    if (!App.season) { App.flash('Open or start a data file first.', 'warn'); return; }
    file = App.season;
    const cfg = file.config, day = Number.isInteger(cfg.clubDay) ? cfg.clubDay : 3;
    const [first, last] = defaultDates(day);
    const useSaved = Array.isArray(cfg.breaks) && (!cfg.breaks.length || cfg.breaks.some(b => b && b.from <= last && b.to >= first));
    const breaks = useSaved ? cfg.breaks : C.recommendBreaks(first, last);
    panel.innerHTML = '<h3 id="calMakerTitle">Make calendar</h3><form id="calMakerForm">' +
      '<div class="bar"><label>Club meets on <select name="weekday">' + C.DAYS.map((name, i) =>
        '<option value="' + i + '"' + (day === i ? ' selected' : '') + '>' + esc(name) + '</option>').join('') + '</select></label>' +
      '<label>First club night <input name="first" type="date" value="' + esc(first) + '" required></label>' +
      '<label>Last club night <input name="last" type="date" value="' + esc(last) + '" required></label></div>' +
      '<fieldset><legend>Planned breaks</legend><div id="calMakerBreaks">' + breaks.map(breakRow).join('') + '</div>' +
      '<div class="bar"><button type="button" data-add>Add break</button><button type="button" data-recommend>Suggest breaks</button>' +
      '<label><input name="easter" type="checkbox"' + (cfg.easterFlag === false ? '' : ' checked') + '> Flag Easter week</label></div></fieldset>' +
      '<div class="bar"><button type="submit">Preview calendar</button><button type="button" data-close>Cancel</button></div>' +
      '<div id="calMakerNotice" role="status"></div></form><div id="calMakerPreview" hidden></div>';
    panel.hidden = false;
    opener.setAttribute('aria-expanded', 'true');
    $('calMakerForm').elements.first.focus();
  }
  opener.addEventListener('click', () => { if (panel.hidden) open(); else close(); });

  function inputs() {
    const f = $('calMakerForm').elements, day = Number(f.weekday.value), first = f.first.value, last = f.last.value;
    if (C.weekday(first) !== day || C.weekday(last) !== day) throw new Error('Choose first and last dates that fall on ' + C.DAYS[day] + '.');
    return { day, first, last, easterFlag: f.easter.checked,
      breaks: [...panel.querySelectorAll('[data-cal-break]')].map(row => ({
        name: row.querySelector('[data-name]').value.trim(), from: row.querySelector('[data-from]').value, to: row.querySelector('[data-to]').value
      })) };
  }
  function previewList(title, items, display) {
    return items.length ? '<details><summary>' + esc(title) + ' (' + items.length + ')</summary><ul>' +
      items.map(item => '<li>' + esc(display(item)) + '</li>').join('') + '</ul></details>' : '';
  }
  const reasons = row => row.date + ' · ' + Object.keys(row.reasons).join(', ');
  function showPreview(input) {
    const result = Safety.propose(file, App.calendar, input, App.today());
    preview = { input, result };
    const box = $('calMakerPreview'), nights = [...new Set(C.nights(result.rows).map(row => row.Date))].sort();
    const quarterOptions = C.QUARTERS.slice(1).map(q => '<label>' + q + ' starts <select data-start="' + q + '">' +
      '<option value="">No start</option>' + nights.slice(1).map(d => '<option value="' + esc(d) + '"' +
        (result.starts[q] === d ? ' selected' : '') + '>' + esc(d) + '</option>').join('') + '</select></label>').join('');
    box.innerHTML = '<h4>Calendar preview</h4><div class="bar">' + quarterOptions + '</div><p>' +
      C.QUARTERS.map(q => q + ' ' + C.nights(result.rows, q).length).join(' · ') + ' club nights</p>' +
      (result.archived.length ? '<p>' + result.archived.length + ' dates from the closed season leave the active calendar.</p>' : '') +
      previewList('Dates to add', result.added, d => d) + previewList('Existing dates kept', result.kept, reasons) +
      previewList('Dates to review in the existing file', result.existing, r => r.date + ' · ' + r.reason) +
      previewList('Changes that would affect recorded activity or locked quarters', result.blocks, reasons) +
      '<details><summary>View proposed dates</summary><div class="scroll"><table class="roster"><thead><tr><th>Date</th><th>Quarter</th><th>Schedule</th></tr></thead><tbody>' +
      result.rows.map(r => '<tr><td>' + esc(r.Date) + '</td><td>' + esc(r.Quarter || '') + '</td><td>' +
        esc([r.Type === 'Event' ? 'Event' : C.isNight(r) ? 'Club night' : 'No club', r.Holiday, r.Theme].filter(Boolean).join(' · ')) +
        '</td></tr>').join('') + '</tbody></table></div></details>' +
      '<p><button type="button" class="primary" data-apply' + (result.blocks.length ? ' disabled' : '') + '>Apply calendar</button></p>';
    box.hidden = false;
  }
  function showError(err) { $('calMakerNotice').textContent = err.message; }

  panel.addEventListener('submit', e => {
    e.preventDefault();
    if (file !== App.season) { close(); return; }
    $('calMakerNotice').textContent = '';
    $('calMakerPreview').hidden = true;
    try { showPreview(inputs()); } catch (err) { showError(err); }
  });
  panel.addEventListener('input', e => {
    if (!e.target.closest('#calMakerForm')) return;
    preview = undefined;
    $('calMakerPreview').hidden = true;
  });
  panel.addEventListener('change', e => {
    if (!e.target.hasAttribute('data-start') || !preview) return;
    const starts = Object.fromEntries([...panel.querySelectorAll('[data-start]')].map(t => [t.dataset.start, t.value]));
    $('calMakerNotice').textContent = '';
    try { showPreview(Object.assign({}, preview.input, { starts })); }
    catch (err) {
      e.target.value = preview.result.starts[e.target.dataset.start] || '';
      showError(err);
    }
  });
  panel.addEventListener('click', e => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-close')) { close(); opener.focus(); return; }
    if (button.hasAttribute('data-apply')) {
      const saved = preview, opened = file;
      if (!saved) return;
      App.commitScope(() => {
        if (App.season !== opened || file !== opened || preview !== saved) return;
        try {
          const fresh = Safety.propose(opened, App.calendar, saved.input, App.today());
          if (JSON.stringify(fresh) !== JSON.stringify(saved.result)) {
            showPreview(saved.input);
            $('calMakerNotice').textContent = 'The calendar or club records changed. Review the new preview before applying.';
            return;
          }
          if (fresh.blocks.length) return;
          const { day, breaks, easterFlag } = saved.input;
          const settings = { clubDay: day, breaks, easterFlag };
          close();
          if (App.applyCalendarProposal(fresh.rows, settings)) App.done('Calendar applied. Use Undo to restore the previous calendar.');
          else App.flash('The calendar already matches this preview.', 'info');
          opener.focus();
        } catch (err) { if (!panel.hidden) showError(err); }
      });
      return;
    }
    if (button.hasAttribute('data-add')) $('calMakerBreaks').insertAdjacentHTML('beforeend', breakRow());
    else if (button.hasAttribute('data-remove')) button.closest('[data-cal-break]').remove();
    else if (button.hasAttribute('data-recommend')) {
      const f = $('calMakerForm').elements;
      $('calMakerBreaks').innerHTML = C.recommendBreaks(f.first.value, f.last.value).map(breakRow).join('');
    } else return;
    preview = undefined;
    $('calMakerPreview').hidden = true;
  });
  App.onRefresh.push(() => { if (file && file !== App.season) close(); });
})();
