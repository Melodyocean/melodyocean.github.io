/**
 * 首頁、個人設定、加到主畫面提示，以及尚未開放的分頁。
 */
(function () {
  'use strict';
  var App = window.App;
  var esc = App.esc;

  // ---------- 首頁 ----------

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
        '<a class="avatar" href="#/settings" aria-label="個人設定">' + esc(App.initial(p.name)) + '</a>' +
        '</header>' +
        '<main class="content">' +
        '<div class="card"><h2>系統建置中</h2>' +
        '<p>目前是<strong>第 1 階段</strong>：成員與單位管理。</p>' +
        (p.isAdmin ? '<p>到下方「<strong>總覽</strong>」分頁的最下面，可以新增同仁、管理單位。</p>' : '') +
        '<p class="muted">任務、專案、通知等功能會一個階段一個階段加進來。</p></div>' +
        installCardHtml() +
        '</main>';
      bindInstallCard(page);
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
        '<div><dt>Gmail</dt><dd>' + esc(p.email) + '</dd></div>' +
        '<div><dt>所屬單位</dt><dd>' + esc(units) + '</dd></div>' +
        '<div><dt>角色</dt><dd>' + esc(p.role) + '</dd></div>' +
        '</dl>' +
        '<button class="btn btn-danger btn-block" id="btn-logout" type="button">登出</button>' +
        '<p class="hint center">版本 ' + esc(App.cfg.VERSION) + '（第 1 階段）</p>' +
        '</main>';
      App.$('btn-logout').onclick = App.logout;
    }
  });

  // ---------- 尚未開放的分頁 ----------

  App.route('/projects', { tab: 'projects', render: App.placeholder('專案', 3, '之後這裡會列出你看得到的所有專案。') });
  App.route('/todos', { tab: 'todos', render: App.placeholder('公共待辦', 2, '之後這裡會列出所有未完成的公共待辦。') });
  App.route('/history', { tab: 'history', render: App.placeholder('歷史', 2, '之後這裡會列出已完成的項目與已結案的專案。') });

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
