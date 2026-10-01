/**
 * 共用核心：狀態、後端呼叫、畫面工具、對話框、路由。
 * 其他檔案透過 window.App 共用。
 */
(function () {
  'use strict';

  var App = window.App = {
    cfg: window.APP_CONFIG,
    state: { profile: null, units: [], googleReady: false, installPrompt: null },
    routes: []
  };

  var TOKEN_KEY = 'pt_session';

  // ---------- 小工具 ----------

  App.$ = function (id) { return document.getElementById(id); };

  /** 把使用者輸入的文字轉成安全的 HTML（避免被當成程式碼執行）。 */
  App.esc = function (value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  App.showView = function (viewId) {
    document.querySelectorAll('.view').forEach(function (el) { el.hidden = el.id !== viewId; });
  };

  App.toast = function (text) {
    var el = App.$('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(App.toast._t);
    App.toast._t = setTimeout(function () { el.hidden = true; }, 2500);
  };

  App.getToken = function () {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  };
  App.setToken = function (t) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* 無痕模式等 */ }
  };

  /** 呼叫後端。失敗時丟出 { code, message }。 */
  App.api = function (action, payload) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 30000);
    return fetch(App.cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, token: App.getToken(), payload: payload || {} }),
      signal: controller.signal
    })
      .then(function (res) { return res.json(); })
      .catch(function () {
        throw { code: 'NETWORK', message: '連線失敗，請確認網路後再試一次。' };
      })
      .then(function (json) {
        clearTimeout(timer);
        if (!json || !json.ok) {
          var err = (json && json.error) || { code: 'SERVER_ERROR', message: '系統發生錯誤，請稍後再試。' };
          if (/^(SESSION_|NOT_MEMBER|MEMBER_DISABLED)/.test(err.code) && App.onSessionLost) App.onSessionLost(err);
          throw err;
        }
        return json.data;
      });
  };

  /** 按鈕執行中：停用並改文字，結束後恢復。 */
  App.busy = function (button, promise, busyText) {
    var original = button.textContent;
    button.disabled = true;
    button.textContent = busyText || '處理中…';
    return promise.finally(function () {
      button.disabled = false;
      button.textContent = original;
    });
  };

  App.unitName = function (id) {
    var u = App.state.units.filter(function (x) { return x.id === id; })[0];
    return u ? u.name + (u.active ? '' : '（已停用）') : id;
  };

  App.initial = function (name) {
    return (String(name || '?').trim().charAt(0) || '?').toUpperCase();
  };

  // ---------- 對話框 ----------

  function openModal(html) {
    var root = App.$('modal');
    root.innerHTML = '<div class="modal-backdrop"></div><div class="modal-box" role="dialog" aria-modal="true">' + html + '</div>';
    root.hidden = false;
    return root;
  }

  function closeModal() {
    var root = App.$('modal');
    root.hidden = true;
    root.innerHTML = '';
  }

  /** 確認框：回傳 Promise<boolean>。 */
  App.confirm = function (opts) {
    return new Promise(function (resolve) {
      var root = openModal(
        '<h2>' + App.esc(opts.title) + '</h2>' +
        (opts.message ? '<p class="modal-text">' + App.esc(opts.message) + '</p>' : '') +
        '<div class="modal-actions">' +
        '<button class="btn btn-secondary" data-act="cancel" type="button">取消</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger-solid' : 'btn-primary') + '" data-act="ok" type="button">' + App.esc(opts.okText || '確定') + '</button>' +
        '</div>'
      );
      root.querySelector('[data-act="ok"]').onclick = function () { closeModal(); resolve(true); };
      root.querySelector('[data-act="cancel"]').onclick = function () { closeModal(); resolve(false); };
      root.querySelector('.modal-backdrop').onclick = function () { closeModal(); resolve(false); };
    });
  };

  /** 輸入框：回傳 Promise<string|null>（取消為 null）。 */
  App.prompt = function (opts) {
    return new Promise(function (resolve) {
      var root = openModal(
        '<h2>' + App.esc(opts.title) + '</h2>' +
        '<form class="modal-form">' +
        '<input class="input" name="value" maxlength="' + (opts.maxLength || 50) + '" value="' + App.esc(opts.value || '') + '" placeholder="' + App.esc(opts.placeholder || '') + '" autocomplete="off">' +
        '<div class="modal-actions">' +
        '<button class="btn btn-secondary" data-act="cancel" type="button">取消</button>' +
        '<button class="btn btn-primary" type="submit">' + App.esc(opts.okText || '確定') + '</button>' +
        '</div></form>'
      );
      var input = root.querySelector('input');
      input.focus();
      input.select();
      root.querySelector('form').onsubmit = function (e) {
        e.preventDefault();
        var v = input.value.trim();
        if (!v) { input.focus(); return; }
        closeModal();
        resolve(v);
      };
      root.querySelector('[data-act="cancel"]').onclick = function () { closeModal(); resolve(null); };
      root.querySelector('.modal-backdrop').onclick = function () { closeModal(); resolve(null); };
    });
  };

  // ---------- 路由（網址 # 後面的部分決定顯示哪一頁）----------

  /** 註冊頁面：pattern 例如 '/admin/members/:id'；tab 為底部分頁列要亮起的分頁。 */
  App.route = function (pattern, opts) {
    var keys = [];
    var regex = new RegExp('^' + pattern.replace(/:(\w+)/g, function (_, k) { keys.push(k); return '([^/]+)'; }) + '$');
    App.routes.push({ regex: regex, keys: keys, opts: opts });
  };

  App.go = function (path, replace) {
    var hash = '#' + path;
    if (replace) location.replace(hash);
    else location.hash = hash;
  };

  App.render = function () {
    if (!App.state.profile) return;
    var path = location.hash.replace(/^#/, '') || '/home';
    var match = null;
    App.routes.some(function (r) {
      var m = path.match(r.regex);
      if (!m) return false;
      var params = {};
      r.keys.forEach(function (k, i) { params[k] = decodeURIComponent(m[i + 1]); });
      match = { route: r, params: params };
      return true;
    });
    if (!match || (match.route.opts.admin && !App.state.profile.isAdmin)) {
      App.go('/home', true);
      return;
    }
    renderTabbar(match.route.opts.tab);
    var page = App.$('page');
    page.innerHTML = '';
    window.scrollTo(0, 0);
    match.route.opts.render(page, match.params);
  };

  window.addEventListener('hashchange', App.render);

  // ---------- 底部分頁列（SPEC 5.1）----------

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    projects: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    todos: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
    overview: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };

  var TABS = [
    { id: 'home', label: '首頁', path: '/home' },
    { id: 'projects', label: '專案', path: '/projects' },
    { id: 'todos', label: '公共待辦', path: '/todos' },
    { id: 'overview', label: '總覽', path: '/overview', admin: true },
    { id: 'history', label: '歷史', path: '/history' }
  ];

  function renderTabbar(activeTab) {
    var nav = App.$('tabbar');
    nav.innerHTML = TABS.filter(function (t) { return !t.admin || App.state.profile.isAdmin; }).map(function (t) {
      return '<a class="tab' + (t.id === activeTab ? ' active' : '') + '" href="#' + t.path + '"' +
        (t.id === activeTab ? ' aria-current="page"' : '') + '>' +
        '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[t.id] + '</svg>' +
        '<span>' + t.label + '</span></a>';
    }).join('');
  }

  // ---------- 共用畫面片段 ----------

  /** 頁首：主分頁顯示標題；子頁面另有返回鍵。 */
  App.topbar = function (opts) {
    if (opts.back) {
      return '<header class="topbar topbar-sub">' +
        '<a class="btn-back" href="#' + opts.back + '">‹ ' + App.esc(opts.backLabel || '返回') + '</a>' +
        '<div class="topbar-title">' + App.esc(opts.title) + '</div>' +
        '<span class="topbar-spacer"></span></header>';
    }
    return '<header class="topbar"><div class="topbar-title-main">' + App.esc(opts.title) + '</div></header>';
  };

  App.loadingHtml = '<div class="page-loading"><div class="spinner" aria-hidden="true"></div><p class="muted">載入中…</p></div>';

  App.errorHtml = function (err) {
    return '<div class="alert" role="alert">' + App.esc(err.message || '發生錯誤') + '</div>';
  };

  /** 尚未開放的分頁 */
  App.placeholder = function (title, stage, text) {
    return function (page) {
      page.innerHTML = App.topbar({ title: title }) +
        '<main class="content"><div class="card empty">' +
        '<h2>' + App.esc(title) + '：第 ' + stage + ' 階段開放</h2>' +
        '<p class="muted">' + App.esc(text) + '</p></div></main>';
    };
  };
})();
