// Token Launch Radar — dashboard logic. No network, no fetch: window.RADAR
// (written by main.ts from the same board) is the whole dataset.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) {
    document.getElementById('rows').innerHTML =
      '<tr><td colspan="9">No radar data loaded.</td></tr>';
    return;
  }

  var $ = function (id) { return document.getElementById(id); };
  var rows = D.rows.slice();
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });
  var maxImplied = rows.length ? rows[0].implied_value_usd : 1;

  /** $1,234,567,890 -> $1.23B; $45,600,000 -> $45.60M. */
  function money(n) {
    if (n === null || n === undefined) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }

  function pct(v) {
    if (v === null || v === undefined) return '—';
    var s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    return '<span class="' + (v >= 0 ? 'pos' : 'neg') + '">' + s + '</span>';
  }

  function ageText(d) {
    if (d === null || d === undefined) return '—';
    if (d < 365) return d + 'd';
    return (d / 365).toFixed(1) + 'y';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Header facts.
  $('asof').textContent = D.as_of;
  $('asof2').textContent = D.as_of;
  $('modelver').textContent = D.model_version;
  var mv2 = document.querySelector('.modelver2');
  if (mv2) mv2.textContent = D.model_version;
  $('counts').textContent =
    D.board_size + ' pre-token protocols ranked · ' + D.watchlist_size +
    ' on the $50M watchlist · ' + D.early_size + ' found below the floor · ' +
    D.live_size + ' already trading, kept apart';
  $('formula').innerHTML =
    'implied value = TVL × <code>' + D.model.base_multiple +
    '</code> × (1 + clamped 7-day change × <code>' + D.model.growth_weight +
    '</code>) × maturity (log age, floor <code>' + D.model.maturity_floor +
    '</code>) × breadth (1 + <code>' + D.model.breadth_step +
    '</code> per extra chain, max +' + (D.model.breadth_step * D.model.breadth_cap * 100) +
    '%) — model <code>' + D.model_version + '</code>.';

  // Filter options, most common first.
  function fillSelect(el, values) {
    var counts = {};
    values.forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
    Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v + ' (' + counts[v] + ')';
      el.appendChild(o);
    });
  }
  fillSelect($('cat'), rows.map(function (r) { return r.category || 'Uncategorised'; }));
  fillSelect($('chain'), rows.reduce(function (acc, r) {
    r.chains.forEach(function (c) { acc.push(c); });
    return acc;
  }, []));

  var sortKey = 'rank';
  var sortDir = 1;

  function filtered() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('cat').value;
    var chain = $('chain').value;
    var out = rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (cat && (r.category || 'Uncategorised') !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      return true;
    });
    var key = sortKey;
    out.sort(function (a, b) {
      var d = 0;
      if (key === 'rank') d = a.rank - b.rank;
      else if (key === 'implied') d = a.implied_value_usd - b.implied_value_usd;
      else if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'growth') d = (a.change_7d || 0) - (b.change_7d || 0);
      else if (key === 'age') d = (a.age_days || 0) - (b.age_days || 0);
      else if (key === 'name') d = a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      if (d === 0) d = a.rank - b.rank;
      return key === 'rank' ? d * sortDir : -d * sortDir;
    });
    return out;
  }

  function render() {
    var list = filtered();
    var html = list.map(function (r) {
      var share = Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100));
      return '<tr data-slug="' + esc(r.slug) + '"' + (selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td>' + r.rank + '</td>' +
        '<td><span class="nm">' + esc(r.name) + '</span><br><span class="sl">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ') || '—') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td class="num"><span class="bar" style="width:' + share + 'px"></span><span class="barp">' + share + '%</span></td>' +
        '</tr>';
    }).join('');
    $('rows').innerHTML = html;
    $('empty').hidden = list.length > 0;
    $('shown').textContent = list.length + ' of ' + rows.length + ' shown';
  }

  // Detail view: model breakdown plus the farm plan.
  var selected = null;
  function showDetail(slug) {
    var r = bySlug[slug];
    if (!r) { hideDetail(); return; }
    selected = slug;
    $('detail').hidden = false;
    $('d-name').textContent = '#' + r.rank + ' ' + r.name;
    $('d-meta').textContent =
      (r.category || 'Uncategorised') + ' · ' + (r.chains.join(', ') || 'no chain listed') +
      ' · TVL ' + money(r.tvl_usd) + ' · 7d ' + (r.change_7d === null ? 'unreported' : ((r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%')) +
      ' · tracked since ' + (r.listed_at || 'unknown') + ' · records no token';
    var base = r.tvl_usd * D.model.base_multiple;
    $('d-model').innerHTML =
      cell('Base value', money(Math.round(base)), 'TVL × ' + D.model.base_multiple) +
      cell('Growth', '×' + r.growth_multiplier.toFixed(2), '7-day change') +
      cell('Maturity', '×' + r.maturity_multiplier.toFixed(2), ageText(r.age_days) + ' old') +
      cell('Breadth', '×' + r.breadth_multiplier.toFixed(2), r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's')) +
      cell('Implied value', money(r.implied_value_usd), 'rank #' + r.rank + ' of ' + rows.length);
    $('d-steps').innerHTML = r.farm_steps.map(function (s) {
      return '<li>' + esc(s) + '</li>';
    }).join('');
    function cell(k, v, n) {
      return '<div class="model-cell"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div><div class="n">' + esc(n) + '</div></div>';
    }
    render();
    $('detail').scrollIntoView({ block: 'nearest' });
  }
  function hideDetail() {
    selected = null;
    $('detail').hidden = true;
    render();
  }
  $('d-close').addEventListener('click', function () {
    history.replaceState(null, '', location.pathname + location.search);
    hideDetail();
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    location.hash = 'detail=' + tr.getAttribute('data-slug');
  });

  // Sorting: click a header, or use the sort select.
  document.querySelectorAll('#board thead th[data-k]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
      $('sort').value = sortKey;
      render();
    });
  });
  $('sort').addEventListener('change', function () {
    sortKey = $('sort').value; sortDir = 1; render();
  });
  ['q', 'cat', 'chain'].forEach(function (id) {
    $(id).addEventListener('input', render);
    $(id).addEventListener('change', render);
  });

  // Live-token table, kept apart from the ranked board.
  $('liverows').innerHTML = D.live.map(function (p) {
    return '<tr><td><span class="nm">' + esc(p.name) + '</span><br><span class="sl">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num"><b>' + money(p.mcap_usd) + '</b></td>' +
      '<td class="num">' + pct(p.change_7d) + '</td></tr>';
  }).join('');

  // Hash routing, so a filtered or detail view is a link: #detail=<slug>, #cat=<name>, #q=<text>.
  function applyHash() {
    var h = location.hash.replace(/^#/, '');
    var params = {};
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0]) params[kv[0]] = decodeURIComponent(kv[1] || '');
    });
    if (params.cat) {
      var opt = Array.prototype.slice.call($('cat').options).filter(function (o) { return o.value === params.cat; })[0];
      if (opt) $('cat').value = params.cat;
    }
    if (params.q !== undefined) $('q').value = params.q;
    render();
    if (params.detail) showDetail(params.detail);
    else hideDetail();
  }
  window.addEventListener('hashchange', applyHash);
  applyHash();
})();
