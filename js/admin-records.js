/**
 * 管理工具：操作紀錄（SPEC 6.8）與已刪除項目（SPEC 6.7），僅管理者。
 */
(function () {
  'use strict';
  var App = window.App;
  var esc = App.esc;

  // ---------- 操作紀錄 ----------

  App.route('/admin/logs', {
    tab: 'overview',
    admin: true,
    noFab: true,
    render: function (page) {
      page.innerHTML = App.topbar({ title: '操作紀錄', back: '/overview', backLabel: '總覽' }) +
        '<main class="content"><form class="card form" id="log-filter">' +
        '<label class="field"><span class="field-label">對象</span><input class="input" name="target" placeholder="編號或名稱，例：T-021、客戶 A" autocomplete="off"></label>' +
        '<label class="field"><span class="field-label">操作者</span><select class="input" name="actorId"><option value="">全部</option></select></label>' +
        '<div class="field"><span class="field-label">日期</span><div class="date-range">' +
        '<input class="input" name="from" type="date"><span>～</span><input class="input" name="to" type="date"></div></div>' +
        '<button class="btn btn-primary btn-block" type="submit" id="log-btn">查詢</button></form>' +
        '<div id="log-list">' + App.loadingHtml + '</div></main>';
      var form = App.$('log-filter');
      App.api('members.list').then(function (res) {
        form.actorId.innerHTML = '<option value="">全部</option>' + res.members.map(function (m) {
          return '<option value="' + esc(m.id) + '">' + esc(m.name) + (m.active ? '' : '（已停用）') + '</option>';
        }).join('');
      }).catch(function () { /* 篩選選單載入失敗不影響查詢 */ });
      form.onsubmit = function (e) {
        e.preventDefault();
        load({ target: form.target.value.trim(), actorId: form.actorId.value, from: form.from.value, to: form.to.value });
      };
      load({});
    }
  });

  function load(filter) {
    var box = App.$('log-list');
    box.innerHTML = App.loadingHtml;
    App.api('logs.list', filter).then(function (data) {
      if (!App.$('log-list')) return;
      if (!data.logs.length) { box.innerHTML = '<div class="card empty"><p class="muted">沒有符合的紀錄。</p></div>'; return; }
      box.innerHTML = '<p class="hint">共 ' + data.total + ' 筆' + (data.limited ? '，只顯示最新 200 筆，請加上篩選條件' : '') + '（新到舊）</p>' +
        '<div class="card list">' + data.logs.map(logRow).join('') + '</div>';
      box.querySelectorAll('.log-row').forEach(function (row) {
        row.onclick = function () { row.classList.toggle('open'); };
      });
    }).catch(function (err) { box.innerHTML = App.errorHtml(err); });
  }

  function kv(obj) {
    if (!obj) return '<span class="muted">（無）</span>';
    var keys = Object.keys(obj);
    if (!keys.length) return '<span class="muted">（無）</span>';
    return keys.map(function (k) {
      var v = obj[k];
      return '<div><span class="muted">' + esc(k) + '：</span>' + esc(v === '' ? '（空白）' : v) + '</div>';
    }).join('');
  }

  function logRow(l) {
    var hasDetail = l.before || l.after;
    return '<div class="log-row' + (hasDetail ? ' has-detail' : '') + '">' +
      '<div class="log-head"><span class="log-action">' + esc(l.action) + '</span> ' +
      '<span>' + esc(l.targetType) + ' ' + esc(l.targetId) + ' ' + esc(l.targetName) + '</span></div>' +
      '<div class="muted small">' + esc(l.actorName) + ' · ' + esc(App.fmtDateTime(l.at)) + (hasDetail ? ' · 點開看內容' : '') + '</div>' +
      (hasDetail ? '<div class="log-detail"><div class="log-col"><div class="log-label">變更前</div>' + kv(l.before) + '</div>' +
        '<div class="log-col"><div class="log-label">變更後</div>' + kv(l.after) + '</div></div>' : '') +
      '</div>';
  }

  // ---------- 已刪除項目 ----------

  App.route('/admin/deleted', {
    tab: 'overview',
    admin: true,
    noFab: true,
    render: function (page) {
      page.innerHTML = App.topbar({ title: '已刪除項目', back: '/overview', backLabel: '總覽' }) +
        '<main class="content" id="deleted-box">' + App.loadingHtml + '</main>';
      loadDeleted();
    }
  });

  function loadDeleted() {
    App.api('deleted.list').then(function (d) {
      var box = App.$('deleted-box');
      if (!box) return;
      var who = function (x) { return esc(x.deletedBy) + ' 刪除於 ' + esc(App.fmtDateTime(x.deletedAt)); };
      var btn = function (type, id, disabledReason) {
        return disabledReason
          ? '<span class="muted small">' + esc(disabledReason) + '</span>'
          : '<button class="btn btn-small btn-secondary" type="button" data-type="' + type + '" data-id="' + esc(id) + '">還原</button>';
      };
      var section = function (title, list, row) {
        return '<h3 class="section-title">' + title + '（' + list.length + '）</h3>' +
          (list.length ? '<div class="card list">' + list.map(row).join('') + '</div>' : '<div class="card"><p class="muted">沒有</p></div>');
      };
      box.innerHTML =
        '<p class="hint">還原專案時，會一併還原「因刪除專案而被隱藏」的子任務；專案刪除前就已個別刪除的子任務，需要個別還原。</p>' +
        section('專案', d.projects, function (p) {
          return '<div class="list-row"><span class="list-main"><span class="list-title">' + esc(p.id) + ' ' + esc(p.name) + '</span>' +
            '<span class="list-sub">' + who(p) + (p.hiddenTasks ? ' · 一併隱藏 ' + p.hiddenTasks + ' 個子任務' : '') + '</span></span>' + btn('project', p.id) + '</div>';
        }) +
        section('任務', d.tasks, function (t) {
          return '<div class="list-row"><span class="list-main"><span class="list-title">' + esc(t.id) + ' ' + esc(t.title) + '</span>' +
            '<span class="list-sub">' + esc(t.projectId ? t.projectName : '公共待辦') + ' · ' + who(t) + '</span></span>' +
            btn('task', t.id, t.projectDeleted ? '請先還原所屬專案' : '') + '</div>';
        }) +
        section('備註', d.notes, function (n) {
          return '<div class="list-row"><span class="list-main"><span class="list-title">' + esc(n.content) + '</span>' +
            '<span class="list-sub">' + esc(n.taskId) + ' ' + esc(n.taskTitle) + ' · ' + esc(n.authorName) + ' 寫 · ' + who(n) + '</span></span>' +
            btn('note', n.id, n.taskDeleted ? '請先還原所屬任務' : '') + '</div>';
        });
      box.querySelectorAll('[data-type]').forEach(function (b) {
        b.onclick = function () {
          App.busy(b, App.api('deleted.restore', { type: b.getAttribute('data-type'), id: b.getAttribute('data-id') }), '…')
            .then(function (res) {
              App.toast('已還原' + (res.restoredTasks ? '，並一併還原 ' + res.restoredTasks + ' 個子任務' : ''));
              loadDeleted();
            })
            .catch(function (err) { App.toast(err.message); });
        };
      });
    }).catch(function (err) {
      var box = App.$('deleted-box');
      if (box) box.innerHTML = App.errorHtml(err);
    });
  }
})();
