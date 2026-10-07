/**
 * 首頁、個人設定、加到主畫面提示，以及尚未開放的分頁。
 */
(function () {
  'use strict';
  var App = window.App;
  var esc = App.esc;

  // ---------- 首頁（SPEC 5.2）----------

  App.route('/home', {
    tab: 'home',
    render: function (page) {
      var p = App.state.profile;
      var date = new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'long'
      }).format(new Date());
      page.innerHTML =
        '<header class="topbar">' +
        '<div><div class="topbar-date">' + esc(date) + '</div>' +
        '<div class="topbar-greeting">你好，' + esc(p.name) + '</div></div>' +
        '<div class="topbar-actions">' +
        '<a class="icon-btn" href="#/search" aria-label="搜尋"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></a>' +
        '<a class="avatar" href="#/settings" aria-label="個人設定">' + esc(App.initial(p.name)) + '</a></div>' +
        '</header>' +
        '<main class="content" id="home-box">' + App.loadingHtml + '</main>';
      var box = App.$('home-box');
      App.load(box, 'home', {}, function (data) {
        App.state.home = data;
        box.innerHTML = homeHtml(data) + installCardHtml();
        bindHome(box, data);
        bindInstallCard(page);
      });
    }
  });

  function homeHtml(d) {
    var boxes =
      '<div class="stat-row">' +
      statBox('overdue', '已逾期', d.counts.overdue) +
      statBox('review', '待我簽核', d.counts.review) +
      statBox('assigned', '指派給我', d.counts.assigned) +
      statBox('feed', '新動態', d.counts.feed || 0) +
      '</div>';

    var needCount = d.needs.length + d.resumeReminders.length;
    var needs = '<div class="section-head"><h3 class="section-title">需要我處理</h3>' +
      (needCount > 3 ? '<a class="section-link" href="#/mine/needs">全部 ' + needCount + ' 項 ›</a>' : '') + '</div>';
    var reminders = d.resumeReminders.slice(0, 3).map(reminderCard).join('');
    var rows = d.needs.slice(0, Math.max(0, 3 - Math.min(3, d.resumeReminders.length))).map(function (t) { return App.taskRow(t); }).join('');
    needs += reminders + (rows ? '<div class="card list cards-only">' + rows + '</div>' : '') +
      (!reminders && !rows ? '<div class="card empty small-empty"><p class="muted">目前沒有需要你處理的事項 👍</p></div>' : '');

    var projects = '<div class="section-head"><h3 class="section-title">我參與的專案</h3>' +
      (d.projects.length > 3 ? '<a class="section-link" href="#/projects">全部 ' + d.projects.length + ' 個 ›</a>' : '') + '</div>' +
      (d.projects.length ? '<div class="card list">' + d.projects.slice(0, 3).map(App.projectCard).join('') + '</div>'
        : '<div class="card empty small-empty"><p class="muted">還沒有參與的專案。</p></div>');

    // 電腦版：左欄＝三個數字方塊＋需要我處理，右欄＝我參與的專案（SPEC 5.6）；手機版由上到下依序排列
    return '<div class="home-cols"><div>' + boxes + needs + '</div><div>' + projects + '</div></div>';
  }

  function statBox(kind, label, n) {
    var cls = 'stat stat-' + kind + (kind === 'feed' && !n ? ' stat-zero' : ''); // 新動態為 0 時灰色（SPEC 5.2）
    return '<a class="' + cls + '" href="#/mine/' + kind + '"><span class="stat-num">' + n + '</span><span class="stat-label">' + label + '</span></a>';
  }

  function reminderCard(r) {
    return '<div class="card reminder">' +
      '<div><span class="tag tag-paused">暫停中</span> <a href="#/projects/' + encodeURIComponent(r.id) + '"><strong>' + esc(r.id) + ' ' + esc(r.name) + '</strong></a></div>' +
      '<p class="muted small">已到預計恢復日（' + esc(App.fmtDate(r.resumeDate)) + (r.daysPast ? '，已過 ' + r.daysPast + ' 天' : '') + '）· ' + esc(r.pauseReason) + '</p>' +
      '<div class="action-row"><button class="btn btn-primary" type="button" data-resume="' + esc(r.id) + '">恢復</button>' +
      '<button class="btn btn-secondary" type="button" data-extend="' + esc(r.id) + '">延長暫停</button></div></div>';
  }

  function bindHome(box, d) {
    var find = function (id) { return d.resumeReminders.filter(function (r) { return r.id === id; })[0]; };
    box.querySelectorAll('[data-resume]').forEach(function (b) {
      b.onclick = function () {
        App.resumeProject(find(b.getAttribute('data-resume'))).then(function (ok) { if (ok) App.render(); });
      };
    });
    box.querySelectorAll('[data-extend]').forEach(function (b) {
      b.onclick = function () {
        App.extendPause(find(b.getAttribute('data-extend'))).then(function (ok) { if (ok) App.render(); });
      };
    });
  }

  // ---------- 首頁數字方塊與「全部」清單 ----------

  var MINE = {
    needs: { title: '需要我處理', empty: '目前沒有需要你處理的事項。' },
    overdue: { title: '已逾期', empty: '沒有逾期的項目。' },
    review: { title: '待我簽核', empty: '沒有等你簽核的項目。' },
    assigned: { title: '指派給我', empty: '沒有指派給你或你單位的未完成項目。' }
  };

  // ---------- 新動態清單（SPEC 6.12）----------

  App.route('/mine/feed', {
    tab: 'home',
    render: function (page) {
      page.innerHTML = App.topbar({ title: '新動態', back: '/home', backLabel: '首頁' }) +
        '<main class="content" id="feed-box">' + App.loadingHtml + '</main>';
      var box = App.$('feed-box');
      App.load(box, 'feed.list', {}, function (d) {
        if (!d.items.length) {
          box.innerHTML = '<div class="card empty"><p class="muted">沒有新動態。跟你有關的任務有人寫備註、改狀態或期限時，會出現在這裡。</p></div>';
          return;
        }
        box.innerHTML =
          '<div class="feed-head"><span class="muted">共 ' + d.items.length + ' 個任務有新動態</span>' +
          '<button class="btn btn-small btn-secondary" type="button" id="feed-all">全部標為已讀</button></div>' +
          '<div class="card list">' + d.items.map(function (t) {
            return '<a class="task-row feed-row" data-task="' + esc(t.id) + '" href="#/tasks/' + encodeURIComponent(t.id) + '">' +
              '<span class="task-main">' +
              '<span class="task-title"><span class="task-id">' + esc(t.id) + '</span> ' + esc(t.title) + ' <span class="tag tag-new">新</span></span>' +
              '<span class="task-sub feed-latest">' + esc(t.latest.text) + ' · ' + esc(App.fmtDateTime(t.latest.at)) +
              (t.moreCount ? '<span class="muted">（另 ' + t.moreCount + ' 則）</span>' : '') + '</span>' +
              '<span class="task-sub">' + App.statusBadge(t.status) + ' <span>' + esc(t.projectId ? t.projectName : '公共待辦') + ' · ' + esc(t.unitName) + '</span></span>' +
              '</span></a>';
          }).join('') + '</div>';
        App.$('feed-all').onclick = function (e) {
          App.busy(e.target, App.api('feed.markAll'), '處理中…')
            .then(function () { App.toast('已全部標為已讀'); App.render(true); })
            .catch(function (err) { App.toast(err.message); });
        };
      });
    }
  });

  App.route('/mine/:kind', {
    tab: 'home',
    render: function (page, params) {
      var def = MINE[params.kind];
      if (!def) { App.go('/home', true); return; }
      page.innerHTML = App.topbar({ title: def.title, back: '/home', backLabel: '首頁' }) +
        '<main class="content" id="mine-box">' + App.loadingHtml + '</main>';
      var mineBox = App.$('mine-box');
      App.load(mineBox, 'home', {}, function (d) {
        var box = mineBox;
        var list = d[params.kind];
        var reminders = params.kind === 'needs' ? d.resumeReminders.map(reminderCard).join('') : '';
        box.innerHTML = reminders + (list.length ? App.taskList(list)
          : (reminders ? '' : '<div class="card empty"><p class="muted">' + esc(def.empty) + '</p></div>'));
        bindHome(box, d);
      });
    }
  });

  // ---------- 個人設定（SPEC 5.8）----------

  App.route('/settings', {
    tab: 'home',
    render: function (page) {
      var p = App.state.profile;
      var units = p.units.length
        ? p.units.map(function (u) { return u.name + (u.active ? '' : '（已停用）'); }).join('、')
        : '（尚未設定）';
      page.innerHTML = App.topbar({ title: '個人設定', back: '/home', backLabel: '首頁' }) +
        '<main class="content">' +
        '<dl class="card profile">' +
        '<div><dt>姓名</dt><dd>' + esc(p.name) + '</dd></div>' +
        '<div><dt>Gmail（登入用）</dt><dd>' + esc(p.email) + '</dd></div>' +
        '<div><dt>每日摘要寄到</dt><dd>' + esc(p.notifyEmail || p.email) + '</dd></div>' +
        '<div><dt>所屬單位</dt><dd>' + esc(units) + '</dd></div>' +
        '<div><dt>角色</dt><dd>' + esc(p.role) + '</dd></div>' +
        '</dl>' +
        '<button class="btn btn-danger btn-block" id="btn-logout" type="button">登出</button>' +
        '<p class="hint center">版本 ' + esc(App.cfg.VERSION) + '</p>' +
        '</main>';
      App.$('btn-logout').onclick = App.logout;
    }
  });

  // ---------- 尚未開放的分頁 ----------


  // ---------- 加到主畫面 ----------

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function installCardHtml() {
    if (isStandalone()) return '';
    var ua = navigator.userAgent || '';
    var isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var text;
    if (App.state.installPrompt) {
      text = '把系統安裝到這台裝置，之後就能像 App 一樣從主畫面打開。';
    } else if (isIOS) {
      text = '在 Safari 點下方的「分享」按鈕（方框加向上箭頭），往下找到「加入主畫面」，再按「新增」。';
    } else if (/Android/i.test(ua)) {
      text = '在 Chrome 點右上角「⋮」，選「加到主畫面」或「安裝應用程式」。';
    } else {
      return '';
    }
    return '<div class="card"><h2>加到手機主畫面</h2><p>' + esc(text) + '</p>' +
      (App.state.installPrompt ? '<button class="btn btn-primary" id="btn-install" type="button">安裝到這台裝置</button>' : '') +
      '</div>';
  }

  function bindInstallCard(page) {
    var btn = page.querySelector('#btn-install');
    if (!btn) return;
    btn.onclick = function () {
      var prompt = App.state.installPrompt;
      if (!prompt) return;
      prompt.prompt();
      prompt.userChoice.then(function () {
        App.state.installPrompt = null;
        App.render();
      });
    };
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    App.state.installPrompt = e;
    if (App.state.profile && (location.hash === '' || location.hash === '#/home')) App.render();
  });
})();
