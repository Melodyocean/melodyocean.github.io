/**
 * 任務詳情元件（SPEC 5.4）：同一份畫面可以放在手機的整頁，或電腦版的右欄（SPEC 5.6、D-051）。
 *
 * host（放置處）需提供：
 *   el            放內容的容器
 *   header(opts)  更新頁首：{ title, back, backLabel, more }，回傳頁首元素（用來綁「⋯」按鈕）
 *   goMode(mode)  切換到 detail / edit / assign（手機換頁；電腦版在右欄切換）
 *   afterDelete(t)刪除後要去哪裡
 *   changed()     資料有變動時（電腦版用來更新中欄清單）
 * 按鈕是否出現由後端回傳的權限決定；送出時後端會再檢查一次。
 */
(function () {
  'use strict';
  var App = window.App;
  var esc = App.esc;
  var STATUS_CLASS = { '未開始': 'todo', '進行中': 'doing', '等待外部': 'waiting', '待簽核': 'review', '已完成': 'done' };

  var TaskView = App.TaskView = {};

  function q(host, sel) { return host.el.querySelector(sel); }
  function qa(host, sel) { return host.el.querySelectorAll(sel); }

  function backOf(t) {
    if (t.projectId) return { back: '/projects/' + encodeURIComponent(t.projectId), backLabel: '專案' };
    return t.status === '已完成' ? { back: '/history', backLabel: '歷史' } : { back: '/todos', backLabel: '公共待辦' };
  }

  TaskView.tabOf = function (t) {
    if (t.projectId) return t.projectState === '已結案' ? 'history' : 'projects';
    return t.status === '已完成' ? 'history' : 'todos';
  };

  // ---------- 詳情 ----------

  TaskView.detail = function (host, id) {
    return App.load(host.el, 'tasks.get', { id: id }, function (data) {
      // 資料更新重畫時，保留使用者正在打的備註
      var ta = host.el.querySelector('[data-role="note-form"] textarea');
      var draft = ta ? ta.value : '';
      renderDetail(host, data.task);
      var ta2 = host.el.querySelector('[data-role="note-form"] textarea');
      if (draft && ta2) ta2.value = draft;
    });
  };

  function stepsHtml(status) {
    var steps = ['未開始', '進行中', '待簽核', '已完成'];
    var current = status === '等待外部' ? 1 : steps.indexOf(status);
    return '<ol class="steps-bar">' + steps.map(function (s, i) {
      var label = (i === 1 && status === '等待外部') ? '等待外部' : s;
      var cls = i < current ? 'past' : (i === current ? 'current s-' + STATUS_CLASS[status] : '');
      return '<li class="' + cls + '"><span class="bar"></span><span class="label">' + esc(label) + '</span></li>';
    }).join('') + '</ol>';
  }

  function dueDetail(t) {
    if (!t.dueDate) return '<span class="muted">未設定</span>';
    var text = esc(App.fmtDate(t.dueDate));
    if (t.status === '已完成') return text;
    if (t.duePassedWhileWaiting) return text + ' <span class="due waiting">已過（等待外部中）</span>';
    if (t.overdueDays > 0) return text + ' <span class="due overdue">逾期 ' + t.overdueDays + ' 天</span>';
    if (t.daysLeft === 0) return text + ' <span class="due soon">今天到期</span>';
    return text + ' <span class="muted">（剩 ' + t.daysLeft + ' 天）</span>';
  }

  function timelineItem(n) {
    if (n.kind === '狀態') {
      return '<div class="tl-status">' + esc(n.authorName) + ' ' + esc(n.content) + ' · ' + esc(App.fmtDateTime(n.createdAt)) + '</div>';
    }
    return '<div class="tl-note">' +
      '<div class="tl-head"><strong>' + esc(n.authorName) + '</strong> <span class="muted small">' + esc(App.fmtDateTime(n.createdAt)) +
      (n.editedAt ? ' · 已編輯（' + esc(App.fmtDateTime(n.editedAt)) + '）' : '') + '</span>' +
      (n.canEdit ? '<span class="tl-tools"><button class="link-btn" type="button" data-edit="' + esc(n.id) + '">編輯</button>' +
        '<button class="link-btn danger" type="button" data-del-note="' + esc(n.id) + '">刪除</button></span>' : '') + '</div>' +
      '<div class="tl-body">' + esc(n.content) + '</div></div>';
  }

  /** 等待外部的紫色區塊 */
  function waitingBlock(t) {
    var w = t.waiting;
    var follow = w.followUpState === 'overdue' ? '<strong class="follow-overdue">追蹤逾期 ' + w.followUpOverdueDays + ' 天</strong>'
      : w.followUpState === 'today' ? '<strong class="follow-today">今天該追蹤</strong>'
        : '剩 ' + w.followUpDaysLeft + ' 天';
    return '<div class="waiting-box">' +
      '<div class="waiting-title">正在等待：' + esc(w.waitingFor) + '</div>' +
      '<div class="waiting-note">' + esc(w.note) + '</div>' +
      '<div class="waiting-meta">下次追蹤日：' + esc(App.fmtDate(w.followUpDate)) + '（' + follow + '）　已等待 ' + w.waitingDays + ' 天</div>' +
      (t.permissions.canSetFollowUp ? '<button class="btn btn-small btn-waiting-outline" type="button" data-role="followup">改追蹤日</button>' : '') +
      '</div>';
  }

  function renderDetail(host, t) {
    var perm = t.permissions;
    var b = backOf(t);
    var header = host.header({ title: '任務詳情', back: b.back, backLabel: b.backLabel, more: perm.canReassign || perm.canEdit || perm.canDelete, task: t });

    var actions = perm.actions.map(function (a) {
      var cls = ['return', 'reopen', 'back', 'withdraw'].indexOf(a.action) !== -1 ? 'btn-secondary'
        : a.action === 'wait' ? 'btn-waiting-outline' : a.action === 'resume' ? 'btn-waiting' : 'btn-primary';
      return '<button class="btn ' + cls + '" type="button" data-action="' + esc(a.action) + '">' + esc(a.label) + '</button>';
    }).join('');

    host.el.innerHTML =
      (perm.readOnlyReason === 'closed' ? '<div class="banner banner-closed">' + (t.closedWithProject ? '隨專案結案' : '專案已結案') + '：此任務在歷史區，唯讀。需要修改請專案建立者或管理者先「取消結案」。</div>' : '') +
      (perm.readOnlyReason === 'done' ? '<div class="banner banner-closed">已完成：此任務在歷史區，唯讀。需要修改請先「取消完成」。</div>' : '') +
      (perm.pausedBlocked ? '<div class="banner banner-paused">專案暫停中：不能變更狀態，需先恢復專案；仍可添加備註。</div>' : '') +
      '<div class="task-head">' +
      '<div class="task-meta">' + esc(t.id) + ' · ' +
      (t.projectId ? '<a href="#/projects/' + encodeURIComponent(t.projectId) + '">' + esc(t.projectName) + '</a>' : '公共待辦') + '</div>' +
      '<h1 class="task-h1">' + esc(t.title) + '</h1>' +
      (t.description ? '<p class="task-desc">' + esc(t.description) + '</p>' : '') +
      '</div>' +

      '<div class="card">' + stepsHtml(t.status) +
      (t.waiting ? waitingBlock(t) : '') +
      (actions ? '<div class="action-row">' + actions + '</div>' : '') +
      '</div>' +

      '<dl class="card profile">' +
      '<div><dt>負責單位</dt><dd>' + esc(t.unitName) + '</dd></div>' +
      '<div><dt>負責人</dt><dd>' + (t.assignees.length ? esc(t.assignees.map(function (a) { return a.name; }).join('、')) : '單位全體') + '</dd></div>' +
      '<div><dt>期限</dt><dd>' + dueDetail(t) + '</dd></div>' +
      '<div><dt>建立</dt><dd>' + esc(t.createdBy.name) + ' · ' + esc(App.fmtDateTime(t.createdAt)) + '</dd></div>' +
      (t.status === '已完成' ? '<div><dt>簽核</dt><dd>' + esc(t.completedBy) + ' · ' + esc(App.fmtDateTime(t.completedAt)) + '</dd></div>' : '') +
      (t.paths.length ? '<div class="paths"><dt>文件路徑</dt><dd>' + t.paths.map(function (p, i) {
        return '<span class="path-item"><code>' + esc(p) + '</code><button class="btn btn-small btn-secondary" type="button" data-copy="' + i + '">複製</button></span>';
      }).join('') + '</dd></div>' : '') +
      '</dl>' +

      '<h3 class="section-title">備註與紀錄</h3>' +
      (t.timeline.length ? '<div class="card timeline">' + t.timeline.map(timelineItem).join('') + '</div>'
        : '<div class="card"><p class="muted">還沒有備註。</p></div>') +

      (perm.canNote
        ? '<form class="composer" data-role="note-form">' +
          '<textarea class="input textarea" name="content" rows="1" maxlength="2000" placeholder="輸入備註…"></textarea>' +
          '<button class="btn btn-primary" type="submit" data-role="note-send">送出</button></form>'
        : '');

    host.el.classList.toggle('has-composer', perm.canNote);
    bindDetail(host, t, header);
  }

  var CONFIRM = {
    approve: { title: '確定簽核完成？', message: '簽核後任務會移到歷史區。', okText: '簽核完成' },
    'return': { title: '退回「進行中」？', message: '建議同時在備註說明退回的原因。', okText: '退回' },
    reopen: { title: '取消完成？', message: '任務會改回「進行中」，並回到主畫面。', okText: '取消完成' }
  };

  /** 改為等待外部時的必填資料（SPEC 6.4） */
  function askWaiting() {
    return App.formModal({
      title: '改為等待外部',
      message: '等待期間不計逾期；到了下次追蹤日會提醒負責人追蹤。',
      fields: [
        { name: 'waitingFor', label: '正在等待', type: 'choice', options: ['客戶', '供應商', '其他'], required: true },
        { name: 'waitingNote', label: '等待說明', required: true, placeholder: '例：等客戶 B 確認 Rev.C 圖面', maxLength: 100 },
        { name: 'followUpDate', label: '下次追蹤日', type: 'date', required: true, value: App.addDays(App.today(), 7), min: App.today() }
      ],
      okText: '改為等待外部'
    });
  }

  function bindDetail(host, t, header) {
    var reload = function (message) {
      if (message) App.toast(message);
      if (host.changed) host.changed();
      return TaskView.detail(host, t.id);
    };
    var fail = function (err) { App.toast(err.message); };

    qa(host, '[data-action]').forEach(function (btn) {
      btn.onclick = function () {
        var action = btn.getAttribute('data-action');
        var ask = action === 'wait' ? askWaiting()
          : CONFIRM[action] ? App.confirm(CONFIRM[action]) : Promise.resolve(true);
        ask.then(function (yes) {
          if (!yes) return;
          var payload = { id: t.id, action: action };
          if (action === 'wait') Object.assign(payload, yes);
          App.busy(btn, App.api('tasks.setStatus', payload))
            .then(function (res) { return reload('狀態已改為「' + res.status + '」'); })
            .catch(fail);
        });
      };
    });

    qa(host, '[data-copy]').forEach(function (btn) {
      btn.onclick = function () { App.copyText(t.paths[Number(btn.getAttribute('data-copy'))]); };
    });

    qa(host, '[data-edit]').forEach(function (btn) {
      btn.onclick = function () {
        var note = t.timeline.filter(function (n) { return n.id === btn.getAttribute('data-edit'); })[0];
        App.prompt({ title: '修改備註', value: note.content, multiline: true, okText: '儲存' }).then(function (content) {
          if (!content || content === note.content) return;
          App.api('notes.edit', { id: note.id, content: content }).then(function () { return reload('已修改備註'); }).catch(fail);
        });
      };
    });

    qa(host, '[data-del-note]').forEach(function (btn) {
      btn.onclick = function () {
        App.confirm({ title: '刪除這則備註？', message: '刪除後管理者仍可在「已刪除項目」還原。', okText: '刪除', danger: true }).then(function (yes) {
          if (!yes) return;
          App.api('notes.delete', { id: btn.getAttribute('data-del-note') }).then(function () { return reload('已刪除備註'); }).catch(fail);
        });
      };
    });

    var fu = q(host, '[data-role="followup"]');
    if (fu) {
      fu.onclick = function () {
        App.formModal({
          title: '改追蹤日',
          message: '建議同時添加一則備註，說明這次追蹤的結果。',
          fields: [{ name: 'followUpDate', label: '下次追蹤日', type: 'date', required: true, value: App.addDays(App.today(), 7), min: App.today() }],
          okText: '儲存'
        }).then(function (v) {
          if (!v) return;
          App.api('tasks.setFollowUp', { id: t.id, followUpDate: v.followUpDate }).then(function () { return reload('已改追蹤日'); }).catch(fail);
        });
      };
    }

    var form = q(host, '[data-role="note-form"]');
    if (form) {
      var ta = form.content;
      ta.oninput = function () {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
      };
      form.onsubmit = function (e) {
        e.preventDefault();
        var content = ta.value.trim();
        if (!content) { ta.focus(); return; }
        // 等待外部：負責人在追蹤日當天或之後加備註＝完成追蹤，先選下次追蹤日（SPEC 6.4、D-042）
        var counts = t.waiting && t.waiting.followUpState && t.permissions.isAssignee;
        var ask = counts ? App.formModal({
          title: '下次追蹤日',
          message: '這則備註會視為「已追蹤」。直接略過會設為 7 天後。',
          fields: [{ name: 'next', label: '下次追蹤日', type: 'date', required: true, value: App.addDays(App.today(), 7), min: App.today() }],
          okText: '送出',
          cancelText: '略過（7 天後）'
        }).then(function (v) { return { next: v ? v.next : '' }; }) : Promise.resolve({ next: '' });
        ask.then(function (r) {
          App.busy(q(host, '[data-role="note-send"]'), App.api('notes.add', { taskId: t.id, content: content, nextFollowUp: r.next }), '送出中')
            .then(function (res) { return reload(res.followUpDate ? '已追蹤，下次追蹤日 ' + App.fmtDate(res.followUpDate) : '已送出備註'); })
            .catch(fail);
        });
      };
    }

    var more = header && header.querySelector('.btn-more');
    if (more) {
      more.onclick = function () {
        var perm = t.permissions;
        var items = [];
        if (perm.canEdit) items.push({ key: 'edit', label: '編輯任務' });
        if (perm.canReassign) items.push({ key: 'assign', label: '修改指派' });
        if (perm.canDelete) items.push({ key: 'delete', label: '刪除', danger: true });
        App.sheet('更多', items).then(function (key) {
          if (key === 'edit' || key === 'assign') host.goMode(key);
          if (key === 'delete') {
            App.confirm({ title: '刪除「' + t.id + ' ' + t.title + '」？', message: '刪除後會從所有清單中隱藏，管理者可以在「已刪除項目」還原。', okText: '刪除', danger: true })
              .then(function (yes) {
                if (!yes) return;
                App.api('tasks.delete', { id: t.id }).then(function () {
                  App.toast('已刪除 ' + t.id);
                  host.afterDelete(t);
                }).catch(fail);
              });
          }
        });
      };
    }
  }

  // ---------- 單位與負責人選擇（新增表單、修改指派共用）----------

  /**
   * 在 box 內畫出「負責單位（單選）」與「負責人（可多選）」。
   * 回傳 { get(), names() }，選擇變動時呼叫 onChange。
   */
  App.assignPicker = function (box, members, initial, onChange) {
    var state = { unitId: initial.unitId || '', assignees: (initial.assignees || []).slice(), showOthers: false };
    var units = App.state.units.filter(function (u) { return u.active || u.id === initial.unitId; });
    var activeMembers = members.filter(function (m) { return m.active || state.assignees.indexOf(m.id) !== -1; });

    function chip(m) {
      var on = state.assignees.indexOf(m.id) !== -1;
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-member="' + esc(m.id) + '" aria-pressed="' + on + '">' + esc(m.name) + '</button>';
    }

    function draw() {
      var inUnit = activeMembers.filter(function (m) { return m.units.indexOf(state.unitId) !== -1; });
      var others = activeMembers.filter(function (m) { return m.units.indexOf(state.unitId) === -1; });
      var selectedOthers = others.filter(function (m) { return state.assignees.indexOf(m.id) !== -1; });
      box.innerHTML =
        '<div class="field"><span class="field-label">負責單位 <em>必填</em></span>' +
        '<div class="chips">' + units.map(function (u) {
          var on = state.unitId === u.id;
          return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-unit="' + esc(u.id) + '" aria-pressed="' + on + '">' + esc(u.name) + '</button>';
        }).join('') + '</div></div>' +
        '<div class="field"><span class="field-label">負責人 <span class="muted small">選填，可多選；不選＝單位全體負責</span></span>' +
        (state.unitId
          ? '<div class="chips">' + (inUnit.length ? inUnit.map(chip).join('') : '<span class="muted small">這個單位目前沒有成員</span>') + '</div>' +
            (state.showOthers
              ? '<div class="sub-label">其他單位的人</div><div class="chips">' + others.map(chip).join('') + '</div>'
              : (selectedOthers.length ? '<div class="sub-label">其他單位的人</div><div class="chips">' + selectedOthers.map(chip).join('') + '</div>' : '') +
                '<button type="button" class="link-btn" data-role="show-others">其他單位的人…</button>')
          : '<p class="muted small">請先選負責單位</p>') +
        '</div>';
      box.querySelectorAll('[data-unit]').forEach(function (b) {
        b.onclick = function () { state.unitId = b.getAttribute('data-unit'); draw(); onChange(); };
      });
      box.querySelectorAll('[data-member]').forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-member');
          var i = state.assignees.indexOf(id);
          if (i === -1) state.assignees.push(id); else state.assignees.splice(i, 1);
          draw();
          onChange();
        };
      });
      var so = box.querySelector('[data-role="show-others"]');
      if (so) so.onclick = function () { state.showOthers = true; draw(); };
    }

    draw();
    return {
      get: function () { return { unitId: state.unitId, assignees: state.assignees.slice() }; },
      names: function () {
        return state.assignees.map(function (id) {
          var m = members.filter(function (x) { return x.id === id; })[0];
          return m ? m.name : id;
        });
      }
    };
  };

  // ---------- 修改指派 ----------

  TaskView.assign = function (host, id) {
    host.el.innerHTML = App.loadingHtml;
    host.header({ title: '修改指派', cancel: true });
    Promise.all([App.api('tasks.get', { id: id }), App.getData('members.list'), App.getData('units.list')]).then(function (res) {
      if (!host.el.isConnected) return;
      App.state.units = res[2].units;
      var t = res[0].task;
      host.el.innerHTML = '<form class="card form" data-role="assign-form">' +
        '<p class="muted">' + esc(t.id) + ' ' + esc(t.title) + '</p>' +
        '<div data-role="picker"></div>' +
        '<div class="alert" data-role="error" role="alert" hidden></div>' +
        '<button class="btn btn-primary btn-block" type="submit" data-role="save">儲存</button></form>';
      var picker = App.assignPicker(q(host, '[data-role="picker"]'), res[1].members,
        { unitId: t.unitId, assignees: t.assignees.map(function (a) { return a.id; }) }, function () {});
      q(host, '[data-role="assign-form"]').onsubmit = function (e) {
        e.preventDefault();
        var a = picker.get();
        App.busy(q(host, '[data-role="save"]'), App.api('tasks.reassign', { id: id, unitId: a.unitId, assignees: a.assignees }), '儲存中…')
          .then(function () {
            App.toast('已修改指派');
            if (host.changed) host.changed();
            host.goMode('detail');
          })
          .catch(function (e2) {
            var err = q(host, '[data-role="error"]');
            err.textContent = e2.message;
            err.hidden = false;
          });
      };
    }).catch(function (err) {
      if (host.el.isConnected) host.el.innerHTML = App.errorHtml(err);
    });
  };

  // ---------- 編輯任務（D-036：標題、說明、期限、文件路徑）----------

  TaskView.edit = function (host, id) {
    host.el.innerHTML = App.loadingHtml;
    host.header({ title: '編輯任務', cancel: true });
    App.api('tasks.get', { id: id }).then(function (res) {
      if (!host.el.isConnected) return;
      var t = res.task;
      if (!t.permissions.canEdit) {
        host.el.innerHTML = App.errorHtml({ message: t.permissions.readOnly ? '此任務在歷史區，唯讀。' : '只有發布者或管理者可以編輯任務內容。' });
        return;
      }
      host.el.innerHTML = '<form class="card form" data-role="edit-form" novalidate>' +
        '<p class="muted">' + esc(t.id) + ' · ' + esc(t.projectId ? t.projectName : '公共待辦') + '</p>' +
        '<label class="field"><span class="field-label">任務標題 <em>必填</em></span>' +
        '<input class="input" name="title" maxlength="100" value="' + esc(t.title) + '" autocomplete="off"></label>' +
        '<label class="field"><span class="field-label">說明</span>' +
        '<textarea class="input textarea" name="description" rows="3" maxlength="2000" placeholder="要做什麼、做到什麼程度算完成">' + esc(t.description) + '</textarea></label>' +
        '<label class="field"><span class="field-label">期限</span>' +
        '<input class="input" name="dueDate" type="date" value="' + esc(t.dueDate) + '">' +
        '<span class="field-hint">清空表示不設期限</span></label>' +
        '<label class="field"><span class="field-label">文件路徑 <span class="muted small">一行一筆</span></span>' +
        '<textarea class="input textarea" name="paths" rows="2">' + esc(t.paths.join('\n')) + '</textarea></label>' +
        '<div class="alert" data-role="error" role="alert" hidden></div>' +
        '<button class="btn btn-primary btn-block" type="submit" data-role="save">儲存</button></form>';
      var form = q(host, '[data-role="edit-form"]');
      form.onsubmit = function (e) {
        e.preventDefault();
        var err = q(host, '[data-role="error"]');
        if (!form.title.value.trim()) { err.textContent = '請填寫任務標題'; err.hidden = false; return; }
        App.busy(q(host, '[data-role="save"]'), App.api('tasks.update', {
          id: id,
          title: form.title.value.trim(),
          description: form.description.value.trim(),
          dueDate: form.dueDate.value,
          paths: form.paths.value.split('\n').map(function (p) { return p.trim(); }).filter(Boolean)
        }), '儲存中…')
          .then(function () {
            App.toast('已儲存');
            if (host.changed) host.changed();
            host.goMode('detail');
          })
          .catch(function (e2) { err.textContent = e2.message; err.hidden = false; });
      };
    }).catch(function (err) {
      if (host.el.isConnected) host.el.innerHTML = App.errorHtml(err);
    });
  };

  TaskView.render = function (host, id, mode) {
    if (mode === 'edit') return TaskView.edit(host, id);
    if (mode === 'assign') return TaskView.assign(host, id);
    return TaskView.detail(host, id);
  };

  // ---------- 手機版：整頁顯示 ----------

  /** 建立「整頁」的 host（手機版，或電腦版直接打開任務網址時）。 */
  App.pageTaskHost = function (page, id, mode) {
    page.innerHTML = App.topbar({ title: '任務詳情', back: '/todos', backLabel: '返回' }) +
      '<main class="content"></main>';
    var host = {
      el: page.querySelector('main'),
      header: function (opts) {
        var html = opts.cancel
          ? App.topbar({ title: opts.title, back: '/tasks/' + encodeURIComponent(id), backLabel: '取消' })
          : App.topbar({ title: opts.title, back: opts.back, backLabel: opts.backLabel, more: opts.more });
        var old = page.querySelector('.topbar');
        old.outerHTML = html;
        if (opts.task) App.setActiveTab(TaskView.tabOf(opts.task));
        return page.querySelector('.topbar');
      },
      goMode: function (m) {
        App.go('/tasks/' + encodeURIComponent(id) + (m === 'detail' ? '' : '/' + m), m === 'detail');
      },
      afterDelete: function (t) {
        var b = backOf(t);
        App.go(b.back, true);
      }
    };
    TaskView.render(host, id, mode);
  };
})();
