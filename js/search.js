/**
 * 搜尋（SPEC 6.11）：手機版從首頁右上角放大鏡進入。
 * 送出才搜尋（每次查詢要問後端，避免邊打字邊送出）。
 */
(function () {
  'use strict';
  var App = window.App;
  var esc = App.esc;

  App.route('/search', {
    tab: 'home',
    noFab: true,
    render: function (page) {
      page.innerHTML = App.topbar({ title: '搜尋', back: '/home', backLabel: '首頁' }) +
        '<main class="content">' +
        '<form class="card inline-form" id="search-form">' +
        '<input class="input" name="q" type="search" maxlength="50" placeholder="標題、說明、專案目標或編號（例：T-021、021）" autocomplete="off" value="' + esc(App.state.lastSearch || '') + '">' +
        '<button class="btn btn-primary" type="submit" id="search-btn">搜尋</button></form>' +
        '<div id="search-results"></div></main>';
      var form = App.$('search-form');
      form.onsubmit = function (e) {
        e.preventDefault();
        var q = form.q.value.trim();
        if (!q) { form.q.focus(); return; }
        App.state.lastSearch = q;
        form.q.blur();
        App.$('search-results').innerHTML = App.loadingHtml;
        App.busy(App.$('search-btn'), App.api('search', { q: q }), '…').then(function (data) {
          var box = App.$('search-results');
          if (box) box.innerHTML = resultsHtml(data);
        }).catch(function (err) {
          var box = App.$('search-results');
          if (box) box.innerHTML = App.errorHtml(err);
        });
      };
      if (App.state.lastSearch) form.onsubmit(new Event('submit'));
      else form.q.focus();
    }
  });

  function resultsHtml(data) {
    if (!data.results.length) return '<div class="card empty"><p class="muted">找不到符合的項目。（不含備註內容與已刪除的項目）</p></div>';
    var open = data.results.filter(function (r) { return !r.done; });
    var done = data.results.filter(function (r) { return r.done; });
    var row = function (r) {
      var href = r.kind === 'project' ? '#/projects/' + encodeURIComponent(r.id) : '#/tasks/' + encodeURIComponent(r.id);
      var status = r.kind === 'project' ? '<span class="tag tag-paused">' + esc(r.status) + '</span>' : App.statusBadge(r.status);
      return '<a class="task-row" href="' + href + '"><span class="task-main">' +
        '<span class="task-title">' + (r.hasNew ? App.dot() : '') + '<span class="task-id">' + esc(r.id) + '</span> ' + esc(r.title) + '</span>' +
        '<span class="task-sub">' + status + (r.tag ? ' <span class="tag tag-paused">' + esc(r.tag) + '</span>' : '') +
        ' <span>' + esc(r.place) + '</span></span></span></a>';
    };
    return (open.length ? '<h3 class="section-title">未完成（' + open.length + '）</h3><div class="card list">' + open.map(row).join('') + '</div>' : '') +
      (done.length ? '<h3 class="section-title">已完成・已結案（' + done.length + '）</h3><div class="card list">' + done.map(row).join('') + '</div>' : '') +
      (data.total > data.results.length ? '<p class="hint center">只顯示前 ' + data.results.length + ' 筆，請輸入更精確的文字。</p>' : '');
  }
})();
