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

  // ---------- 日期（一律以台灣時間的 yyyy-MM-dd 處理）----------

  App.today = function () {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  };

  App.addDays = function (dateStr, n) {
    var p = dateStr.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.toISOString().slice(0, 10);
  };

  App.weekday = function (dateStr) {
    var p = dateStr.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  };

  /** 10/5（一） */
  App.fmtDate = function (dateStr) {
    if (!dateStr) return '';
    var p = String(dateStr).slice(0, 10).split('-').map(Number);
    return p[1] + '/' + p[2] + '（' + '日一二三四五六'.charAt(App.weekday(String(dateStr).slice(0, 10))) + '）';
  };

  /** 9/26 17:06 */
  App.fmtDateTime = function (stamp) {
    if (!stamp) return '';
    var m = String(stamp).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    return m ? Number(m[2]) + '/' + Number(m[3]) + ' ' + m[4] + ':' + m[5] : String(stamp);
  };

  App.copyText = function (text) {
    var done = function () { App.toast('已複製'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { App.toast('無法複製，請長按文字手動複製'); });
    } else {
      App.toast('無法複製，請長按文字手動複製');
    }
  };

  /** 完成進度條（已完成／總數） */
  App.progressHtml = function (done, total) {
    var pct = total ? Math.round(done / total * 100) : 0;
    return '<div class="progress"><div class="progress-bar"><span style="width:' + pct + '%"></span></div>' +
      '<span class="progress-text">' + done + ' / ' + total + '</span></div>';
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
        (opts.noCancel ? '' : '<button class="btn btn-secondary" data-act="cancel" type="button">取消</button>') +
        '<button class="btn ' + (opts.danger ? 'btn-danger-solid' : 'btn-primary') + '" data-act="ok" type="button">' + App.esc(opts.okText || '確定') + '</button>' +
        '</div>'
      );
      root.querySelector('[data-act="ok"]').onclick = function () { closeModal(); resolve(true); };
      if (!opts.noCancel) root.querySelector('[data-act="cancel"]').onclick = function () { closeModal(); resolve(false); };
      root.querySelector('.modal-backdrop').onclick = function () { closeModal(); resolve(false); };
    });
  };

  /** 只有「知道了」的訊息框。 */
  App.alert = function (title, message) {
    return App.confirm({ title: title, message: message, okText: '知道了', noCancel: true });
  };

  /** 輸入框：回傳 Promise<string|null>（取消為 null）。 */
  App.prompt = function (opts) {
    return new Promise(function (resolve) {
      var root = openModal(
        '<h2>' + App.esc(opts.title) + '</h2>' +
        '<form class="modal-form">' +
        (opts.multiline
          ? '<textarea class="input textarea" name="value" rows="5" maxlength="' + (opts.maxLength || 2000) + '" placeholder="' + App.esc(opts.placeholder || '') + '">' + App.esc(opts.value || '') + '</textarea>'
          : '<input class="input" name="value" maxlength="' + (opts.maxLength || 50) + '" value="' + App.esc(opts.value || '') + '" placeholder="' + App.esc(opts.placeholder || '') + '" autocomplete="off">') +
        '<div class="modal-actions">' +
        '<button class="btn btn-secondary" data-act="cancel" type="button">取消</button>' +
        '<button class="btn btn-primary" type="submit">' + App.esc(opts.okText || '確定') + '</button>' +
        '</div></form>'
      );
      var input = root.querySelector('input, textarea');
      input.focus();
      if (!opts.multiline) input.select();
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

  /**
   * 表單對話框：fields 為 [{ name, label, type: text|textarea|date|choice, options, required, value, min, placeholder, hint }]。
   * 回傳 Promise<{ name: value }|null>。
   */
  App.formModal = function (opts) {
    return new Promise(function (resolve) {
      var root = openModal(
        '<h2>' + App.esc(opts.title) + '</h2>' +
        (opts.message ? '<p class="modal-text">' + App.esc(opts.message) + '</p>' : '') +
        '<form class="modal-form form" novalidate>' + opts.fields.map(function (f) {
          var label = '<span class="field-label">' + App.esc(f.label) + (f.required ? ' <em>必填</em>' : '') + '</span>';
          var input;
          if (f.type === 'textarea') {
            input = '<textarea class="input textarea" name="' + f.name + '" rows="3" maxlength="' + (f.maxLength || 500) + '" placeholder="' + App.esc(f.placeholder || '') + '">' + App.esc(f.value || '') + '</textarea>';
          } else if (f.type === 'choice') {
            input = '<div class="segmented" data-choice="' + f.name + '">' + f.options.map(function (o) {
              return '<button type="button" class="seg' + (f.value === o ? ' on' : '') + '" data-value="' + App.esc(o) + '">' + App.esc(o) + '</button>';
            }).join('') + '</div><input type="hidden" name="' + f.name + '" value="' + App.esc(f.value || '') + '">';
          } else {
            input = '<input class="input" name="' + f.name + '" type="' + (f.type === 'date' ? 'date' : 'text') + '"' +
              (f.min ? ' min="' + f.min + '"' : '') + ' maxlength="' + (f.maxLength || 200) + '" value="' + App.esc(f.value || '') + '" placeholder="' + App.esc(f.placeholder || '') + '" autocomplete="off">';
          }
          return '<div class="field" data-field="' + f.name + '">' + label + input + (f.hint ? '<span class="field-hint">' + App.esc(f.hint) + '</span>' : '') + '</div>';
        }).join('') +
        '<div class="alert" data-role="error" hidden></div>' +
        '<div class="modal-actions">' +
        '<button class="btn btn-secondary" data-act="cancel" type="button">' + App.esc(opts.cancelText || '取消') + '</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger-solid' : 'btn-primary') + '" type="submit">' + App.esc(opts.okText || '確定') + '</button>' +
        '</div></form>'
      );
      var form = root.querySelector('form');
      root.querySelectorAll('[data-choice]').forEach(function (group) {
        group.querySelectorAll('.seg').forEach(function (b) {
          b.onclick = function () {
            group.querySelectorAll('.seg').forEach(function (x) { x.classList.toggle('on', x === b); });
            form[group.getAttribute('data-choice')].value = b.getAttribute('data-value');
          };
        });
      });
      form.onsubmit = function (e) {
        e.preventDefault();
        var values = {};
        var missing = [];
        opts.fields.forEach(function (f) {
          values[f.name] = String(form[f.name].value || '').trim();
          if (f.required && !values[f.name]) missing.push(f.label);
        });
        if (missing.length) {
          var err = root.querySelector('[data-role="error"]');
          err.textContent = '請填寫：' + missing.join('、');
          err.hidden = false;
          return;
        }
        closeModal();
        resolve(values);
      };
      root.querySelector('[data-act="cancel"]').onclick = function () { closeModal(); resolve(null); };
      root.querySelector('.modal-backdrop').onclick = function () { closeModal(); resolve(null); };
    });
  };

  /** 底部選單：items 為 [{ key, label, disabled, hint, danger }]，回傳 Promise<key|null>。 */
  App.sheet = function (title, items) {
    return new Promise(function (resolve) {
      var root = openModal(
        (title ? '<h2>' + App.esc(title) + '</h2>' : '') +
        '<div class="sheet-list">' + items.map(function (it) {
          return '<button type="button" class="sheet-item' + (it.danger ? ' danger' : '') + '" data-key="' + App.esc(it.key) + '"' + (it.disabled ? ' disabled' : '') + '>' +
            '<span>' + App.esc(it.label) + '</span>' + (it.hint ? '<span class="muted small">' + App.esc(it.hint) + '</span>' : '') + '</button>';
        }).join('') + '</div>' +
        '<button class="btn btn-secondary btn-block" data-act="cancel" type="button">取消</button>'
      );
      root.querySelector('.modal-box').classList.add('sheet');
      root.querySelectorAll('.sheet-item').forEach(function (b) {
        b.onclick = function () { closeModal(); resolve(b.getAttribute('data-key')); };
      });
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

  /** 網址 # 後面的路徑與參數，例如 #/todos?task=T-001 */
  App.location = function () {
    var raw = location.hash.replace(/^#/, '');
    var i = raw.indexOf('?');
    var params = {};
    if (i !== -1) {
      raw.slice(i + 1).split('&').forEach(function (kv) {
        var p = kv.split('=');
        if (p[0]) params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
    }
    return { path: (i === -1 ? raw : raw.slice(0, i)) || '/home', query: params };
  };

  // ---------- 電腦版判斷（SPEC 5.6：寬度 1024 像素以上）----------

  var desktopQuery = window.matchMedia('(min-width: 1024px)');
  App.isDesktop = function () { return desktopQuery.matches; };
  var onDesktopChange = function () {
    document.body.classList.toggle('desktop', App.isDesktop());
    if (App.state.profile) App.render(true);
  };
  if (desktopQuery.addEventListener) desktopQuery.addEventListener('change', onDesktopChange);
  else desktopQuery.addListener(onDesktopChange);
  document.body.classList.toggle('desktop', App.isDesktop());

  function matchRoute(path) {
    var match = null;
    App.routes.some(function (r) {
      var m = path.match(r.regex);
      if (!m) return false;
      var params = {};
      r.keys.forEach(function (k, i) { params[k] = decodeURIComponent(m[i + 1]); });
      match = { route: r, params: params };
      return true;
    });
    return match;
  }

  var lastMain = null; // 上次在中欄顯示的路徑（只換右欄時不重畫中欄）

  App.render = function (force) {
    if (!App.state.profile) return;
    var loc = App.location();
    var desktop = App.isDesktop();

    // 電腦版：從清單點任務，改成「中欄不動、右欄顯示詳情」
    var taskPath = loc.path.match(/^\/tasks\/([^/]+)(?:\/(edit|assign))?$/);
    if (desktop && taskPath && lastMain && lastMain.indexOf('/tasks/') !== 0) {
      App.go(lastMain + '?task=' + encodeURIComponent(decodeURIComponent(taskPath[1])) + (taskPath[2] ? '&mode=' + taskPath[2] : ''), true);
      return;
    }

    var match = matchRoute(loc.path);
    if (!match || (match.route.opts.admin && !App.state.profile.isAdmin)) {
      App.go('/home', true);
      return;
    }

    var mainChanged = force === true || loc.path !== lastMain;
    if (mainChanged) {
      lastMain = loc.path;
      // 底部分頁列在所有頁面都固定顯示（SPEC 5.1）；詳情與表單頁不顯示右下角「＋」
      renderTabbar(match.route.opts.tab);
      App.$('fab').hidden = !!match.route.opts.noFab;
      App.$('view-app').classList.remove('composing');
      App.renderDesktopChrome(match.route.opts.tab);
      var page = App.$('page');
      page.innerHTML = '';
      window.scrollTo(0, 0);
      match.route.opts.render(page, match.params, loc.query);
    }
    App.updatePane(desktop ? loc.query.task : null, loc.query.mode);
  };

  /** 只重畫中欄（例如右欄改了任務狀態，中欄清單要跟著更新）。 */
  App.refreshMain = function () {
    var match = matchRoute(App.location().path);
    if (!match) return;
    var page = App.$('page');
    var y = window.scrollY;
    match.route.opts.render(page, match.params, App.location().query);
    window.scrollTo(0, y);
  };

  // ---------- 電腦版右欄：任務詳情（不換頁）----------

  var paneState = { id: null, mode: null };

  App.updatePane = function (id, mode) {
    var view = App.$('view-app');
    mode = mode || 'detail';
    if (!id) {
      paneState = { id: null, mode: null };
      view.classList.remove('pane-open');
      App.$('pane-body').innerHTML = '';
      App.markSelected();
      return;
    }
    view.classList.add('pane-open');
    if (paneState.id === id && paneState.mode === mode) { App.markSelected(); return; }
    paneState = { id: id, mode: mode };
    App.markSelected();
    var base = App.location().path;
    var head = App.$('pane-head');
    var body = App.$('pane-body');
    body.scrollTop = 0;
    var host = {
      el: body,
      header: function (opts) {
        head.innerHTML =
          (opts.cancel ? '<button class="pane-btn" type="button" data-pane="back">‹ 取消</button>' : '<span></span>') +
          '<div class="pane-title">' + App.esc(opts.title) + '</div>' +
          '<div class="pane-tools">' + (opts.more ? '<button class="btn-more" type="button" aria-label="更多">⋯</button>' : '') +
          '<button class="pane-btn" type="button" data-pane="close" aria-label="關閉">✕</button></div>';
        head.querySelector('[data-pane="close"]').onclick = function () { App.go(base); };
        var back = head.querySelector('[data-pane="back"]');
        if (back) back.onclick = function () { host.goMode('detail'); };
        return head;
      },
      goMode: function (m) {
        App.go(base + '?task=' + encodeURIComponent(id) + (m === 'detail' ? '' : '&mode=' + m), m === 'detail');
      },
      changed: function () { App.refreshMain(); },
      afterDelete: function () {
        App.go(base, true);
        App.refreshMain();
      }
    };
    App.TaskView.render(host, id, mode);
  };

  /** 中欄清單中標示目前在右欄打開的任務。 */
  App.markSelected = function () {
    var current = paneState.id;
    document.querySelectorAll('#page [data-task]').forEach(function (row) {
      row.classList.toggle('selected', !!current && row.getAttribute('data-task') === current);
    });
  };

  // 中欄清單是讀取資料後才畫出來的，畫好後再標示一次選取的任務
  new MutationObserver(function () { if (paneState.id) App.markSelected(); })
    .observe(document.getElementById('page'), { childList: true, subtree: true });

  // 電腦版：點中欄清單裡的任務，改在右欄打開（不換頁）
  document.addEventListener('click', function (e) {
    if (!App.isDesktop() || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#/tasks/"]');
    if (!a || !a.closest('#page')) return;
    var m = a.getAttribute('href').match(/^#\/tasks\/([^/?]+)$/);
    if (!m) return;
    e.preventDefault();
    App.go(App.location().path + '?task=' + m[1]);
  });

  window.addEventListener('hashchange', App.render);

  // 在備註輸入框打字時暫時收起分頁列，讓鍵盤上方有空間；離開輸入框就恢復
  document.addEventListener('focusin', function (e) {
    if (e.target.closest && e.target.closest('.composer')) App.$('view-app').classList.add('composing');
  });
  document.addEventListener('focusout', function (e) {
    if (e.target.closest && e.target.closest('.composer')) {
      setTimeout(function () {
        if (!document.activeElement || !document.activeElement.closest('.composer')) App.$('view-app').classList.remove('composing');
      }, 150);
    }
  });
  document.addEventListener('DOMContentLoaded', function () {
    var fab = App.$('fab');
    if (fab) fab.onclick = function () { App.onFab(); };
  });

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

  /** 頁面載入資料後，依內容決定底部要亮哪個分頁（例如子任務亮「專案」） */
  App.setActiveTab = function (tab) {
    renderTabbar(tab);
    if (App.isDesktop()) App.renderDesktopChrome(tab);
  };

  // ---------- 電腦版左欄選單與上方工具列（SPEC 5.6）----------

  var sideProjectsAt = 0;

  /** 左欄「專案」底下列出我參與的專案；最多每 30 秒向後端更新一次。 */
  function loadSideProjects(force) {
    if (!force && Date.now() - sideProjectsAt < 30000) return;
    sideProjectsAt = Date.now();
    App.api('projects.list').then(function (d) {
      App.state.sideProjects = d.projects.filter(function (p) { return p.participating; });
      App.renderDesktopChrome(App.state.sideTab);
    }).catch(function () { /* 左欄專案清單載入失敗不影響使用 */ });
  }
  App.reloadSideProjects = function () { loadSideProjects(true); };

  App.renderDesktopChrome = function (activeTab) {
    if (!App.isDesktop() || !App.state.profile) return;
    App.state.sideTab = activeTab;
    var p = App.state.profile;
    var path = App.location().path;
    var tabs = TABS.filter(function (t) { return !t.admin || p.isAdmin; });
    var projects = App.state.sideProjects || [];
    App.$('sidebar').innerHTML =
      '<div class="side-brand"><img src="icons/icon-192.png" alt=""><span>內部專案追蹤系統</span></div>' +
      '<nav class="side-nav">' + tabs.map(function (t) {
        var html = '<a class="side-item' + (t.id === activeTab ? ' active' : '') + '" href="#' + t.path + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[t.id] + '</svg><span>' + t.label + '</span></a>';
        if (t.id === 'projects' && projects.length) {
          html += '<div class="side-sub">' + projects.map(function (pr) {
            var href = '/projects/' + encodeURIComponent(pr.id);
            return '<a class="side-subitem' + (path === href ? ' active' : '') + '" href="#' + href + '">' +
              App.esc(pr.name) + (pr.state === '暫停' ? ' <small>暫停</small>' : '') + '</a>';
          }).join('') + '</div>';
        }
        return html;
      }).join('') + '</nav>' +
      '<a class="side-user" href="#/settings"><span class="avatar avatar-sm">' + App.esc(App.initial(p.name)) + '</span>' +
      '<span class="side-user-text"><strong>' + App.esc(p.name) + '</strong><small>' +
      App.esc((p.units.map(function (u) { return u.name; }).join('、') || '未設定單位') + ' · ' + p.role) + '</small></span></a>';
    var header = App.$('desk-header');
    if (!header.firstChild) {
      header.innerHTML = '<form class="desk-search" id="desk-search">' +
        '<input class="input" name="q" type="search" placeholder="搜尋標題、說明、專案目標或編號" autocomplete="off">' +
        '</form><button class="btn btn-primary" type="button" id="desk-new">＋ 新增</button>';
      header.querySelector('#desk-search').onsubmit = function (e) {
        e.preventDefault();
        var q = e.target.q.value.trim();
        if (!q) return;
        App.state.lastSearch = q;
        if (App.location().path === '/search') App.render(true);
        else App.go('/search');
      };
      header.querySelector('#desk-new').onclick = function () { App.onFab(); };
    }
    loadSideProjects(false);
  };

  /** 右下角「＋」新增按鈕（SPEC 5.1） */
  App.onFab = function () {
    App.sheet('新增', [
      { key: 'project', label: '新增專案' },
      { key: 'subtask', label: '新增子任務' },
      { key: 'todo', label: '新增公共待辦' }
    ]).then(function (key) {
      if (key === 'todo') App.go('/new/task/todo');
      if (key === 'subtask') App.go('/new/task/pick');
      if (key === 'project') App.go('/projects/new');
    });
  };

  // ---------- 共用畫面片段 ----------

  /** 頁首：主分頁顯示標題；子頁面另有返回鍵。 */
  App.topbar = function (opts) {
    if (opts.back) {
      return '<header class="topbar topbar-sub">' +
        '<a class="btn-back" href="#' + opts.back + '">‹ ' + App.esc(opts.backLabel || '返回') + '</a>' +
        '<div class="topbar-title">' + App.esc(opts.title) + '</div>' +
        (opts.more ? '<button class="btn-more" type="button" id="btn-more" aria-label="更多">⋯</button>' : '<span class="topbar-spacer"></span>') +
        '</header>';
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
