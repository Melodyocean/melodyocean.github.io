/**
 * 任務畫面：公共待辦清單、歷史、任務詳情、新增表單、修改指派（SPEC 5.4、5.7、6.2–6.6）。
 * 按鈕是否出現由後端回傳的權限決定；送出時後端會再檢查一次。
 */
(function () {
  'use strict';
  var App = window.App;
  var esc = App.esc;

  var STATUS_CLASS = { '未開始': 'todo', '進行中': 'doing', '等待外部': 'waiting', '待簽核': 'review', '已完成': 'done' };
  var GROUP_ORDER = ['待簽核', '進行中', '等待外部', '未開始']; // SPEC 5.3

  // ---------- 共用片段 ----------

  App.statusBadge = function (status) {
    return '<span class="status s-' + (STATUS_CLASS[status] || 'todo') + '">' + esc(status) + '</span>';
  };

  App.dueHtml = function (t) {
    if (t.status === '已完成') return t.completedAt ? '<span class="due">完成於 ' + esc(App.fmtDate(t.completedAt)) + '</span>' : '';
    if (!t.dueDate) return '';
    if (t.overdueDays > 0) return '<span class="due overdue">逾期 ' + t.overdueDays + ' 天</span>';
    if (t.daysLeft === 0) return '<span class="due soon">今天到期</span>';
    return '<span class="due">' + esc(App.fmtDate(t.dueDate)) + '</span>';
  };

  function whoHtml(t) {
    return esc(t.unitName) + ' · ' + (t.assigneeNames.length ? esc(t.assigneeNames.join('、')) : '單位全體');
  }

  /** opts.inProject：在專案內頁時不重複顯示專案名稱 */
  App.taskRow = function (t, opts) {
    opts = opts || {};
    var place = opts.inProject ? '' : esc(t.projectId ? t.projectName : '公共待辦') + ' · ';
    return '<a class="task-row" href="#/tasks/' + encodeURIComponent(t.id) + '">' +
      '<span class="task-main">' +
      '<span class="task-title"><span class="task-id">' + esc(t.id) + '</span> ' + esc(t.title) + '</span>' +
      '<span class="task-sub">' + App.statusBadge(t.status) +
      (t.closedWithProject ? ' <span class="tag tag-paused">隨專案結案</span>' : '') +
      (t.projectPaused && !opts.inProject ? ' <span class="tag tag-paused">暫停中</span>' : '') +
      ' <span>' + place + whoHtml(t) + '</span></span>' +
      '</span>' +
      '<span class="task-side">' + App.dueHtml(t) + (t.noteCount ? '<span class="note-count">💬 ' + t.noteCount + '</span>' : '') + '</span>' +
      '</a>';
  };

  function groupedHtml(tasks) {
    return GROUP_ORDER.map(function (status) {
      var list = tasks.filter(function (t) { return t.status === status; });
      if (!list.length) return '';
      return '<h3 class="section-title">' + App.statusBadge(status) + ' ' + list.length + ' 項</h3>' +
        '<div class="card list">' + list.map(function (t) { return App.taskRow(t); }).join('') + '</div>';
    }).join('');
  }

  function loadInto(boxId, promise, render) {
    promise.then(function (data) {
      var box = App.$(boxId);
      if (box) box.innerHTML = render(data);
    }).catch(function (err) {
      var box = App.$(boxId);
      if (box) box.innerHTML = App.errorHtml(err);
    });
  }

  // ---------- 公共待辦分頁（SPEC 6.5）----------

  App.route('/todos', {
    tab: 'todos',
    render: function (page) {
      page.innerHTML = App.topbar({ title: '公共待辦' }) +
        '<main class="content" id="todo-list">' + App.loadingHtml + '</main>';
      loadInto('todo-list', App.api('tasks.listTodos'), function (data) {
        if (!data.tasks.length) {
          return '<div class="card empty"><h2>目前沒有未完成的公共待辦</h2>' +
            '<p class="muted">按右下角「＋」可以新增。</p></div>';
        }
        return groupedHtml(data.tasks);
      });
    }
  });

  // ---------- 歷史分頁（SPEC 6.6）----------

  App.route('/history', {
    tab: 'history',
    render: function (page) {
      page.innerHTML = App.topbar({ title: '歷史' }) +
        '<main class="content" id="history-list">' + App.loadingHtml + '</main>';
      loadInto('history-list', App.api('tasks.history'), function (data) {
        if (!data.tasks.length && !data.projects.length) {
          return '<div class="card empty"><h2>還沒有歷史資料</h2>' +
            '<p class="muted">簽核完成的任務、已結案的專案會移到這裡。</p></div>';
        }
        return (data.projects.length ? '<h3 class="section-title">已結案專案（' + data.projects.length + '）</h3>' +
            '<div class="card list">' + data.projects.map(function (p) {
              return '<a class="project-row" href="#/projects/' + encodeURIComponent(p.id) + '">' +
                '<span class="project-title"><span class="task-id">' + esc(p.id) + '</span> ' + esc(p.name) + ' ' + App.projectTags(p) + '</span>' +
                '<span class="project-hint muted">' + (p.closeNote ? esc(p.closeNote) + ' · ' : '') + '結案於 ' + esc(App.fmtDate(p.closedAt)) + ' · 完成 ' + p.done + ' / ' + p.total + ' 項</span></a>';
            }).join('') + '</div>' : '') +
          (data.tasks.length ? '<h3 class="section-title">已完成的任務（' + data.tasks.length + '）</h3>' +
            '<div class="card list">' + data.tasks.map(function (t) { return App.taskRow(t); }).join('') + '</div>' : '');
      });
    }
  });

  // ---------- 任務詳情（SPEC 5.4）----------

  App.route('/tasks/:id', {
    tab: 'todos',
    noFab: true,
    render: function (page, params) {
      page.innerHTML = App.topbar({ title: '任務詳情', back: '/todos', backLabel: '返回' }) +
        '<main class="content" id="task-box">' + App.loadingHtml + '</main>';
      loadTask(page, params.id);
    }
  });

  function loadTask(page, id) {
    return App.api('tasks.get', { id: id }).then(function (data) {
      if (!App.$('task-box')) return;
      renderTask(page, data.task);
    }).catch(function (err) {
      var box = App.$('task-box');
      if (box) box.innerHTML = App.errorHtml(err);
    });
  }

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
    if (t.overdueDays > 0) return text + ' <span class="due overdue">逾期 ' + t.overdueDays + ' 天</span>';
    if (t.daysLeft === 0) return text + ' <span class="due soon">今天到期</span>';
    return text + ' <span class="muted">（剩 ' + t.daysLeft + ' 天）</span>';
  }

  function renderTask(page, t) {
    var perm = t.permissions;
    var back = t.projectId ? '/projects/' + encodeURIComponent(t.projectId) : (t.status === '已完成' ? '/history' : '/todos');
    var backLabel = t.projectId ? '專案' : (t.status === '已完成' ? '歷史' : '公共待辦');
    var hasMore = perm.canReassign || perm.canEdit;
    page.querySelector('.topbar').outerHTML = App.topbar({ title: '任務詳情', back: back, backLabel: backLabel, more: hasMore });
    App.setActiveTab(t.projectId ? (t.projectState === '已結案' ? 'history' : 'projects') : (t.status === '已完成' ? 'history' : 'todos'));

    var actions = perm.actions.map(function (a) {
      var cls = ['return', 'reopen', 'back', 'withdraw'].indexOf(a.action) !== -1 ? 'btn-secondary' : 'btn-primary';
      return '<button class="btn ' + cls + '" type="button" data-action="' + esc(a.action) + '">' + esc(a.label) + '</button>';
    }).join('');

    App.$('task-box').innerHTML =
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
        ? '<form class="composer" id="note-form">' +
          '<textarea class="input textarea" name="content" rows="1" maxlength="2000" placeholder="輸入備註…"></textarea>' +
          '<button class="btn btn-primary" type="submit" id="note-send">送出</button></form>'
        : '');

    App.$('task-box').classList.toggle('has-composer', perm.canNote);
    bindTask(page, t);
  }

  function timelineItem(n) {
    if (n.kind === '狀態') {
      return '<div class="tl-status">' + esc(n.authorName) + ' ' + esc(n.content) + ' · ' + esc(App.fmtDateTime(n.createdAt)) + '</div>';
    }
    return '<div class="tl-note">' +
      '<div class="tl-head"><strong>' + esc(n.authorName) + '</strong> <span class="muted small">' + esc(App.fmtDateTime(n.createdAt)) +
      (n.editedAt ? ' · 已編輯（' + esc(App.fmtDateTime(n.editedAt)) + '）' : '') + '</span>' +
      (n.canEdit ? '<button class="link-btn" type="button" data-edit="' + esc(n.id) + '">編輯</button>' : '') + '</div>' +
      '<div class="tl-body">' + esc(n.content) + '</div></div>';
  }

  var CONFIRM = {
    approve: { title: '確定簽核完成？', message: '簽核後任務會移到歷史區。', okText: '簽核完成' },
    'return': { title: '退回「進行中」？', message: '建議同時在備註說明退回的原因。', okText: '退回' },
    reopen: { title: '取消完成？', message: '任務會改回「進行中」，並回到主畫面。', okText: '取消完成' }
  };

  function bindTask(page, t) {
    App.$('task-box').querySelectorAll('[data-action]').forEach(function (btn) {
      btn.onclick = function () {
        var action = btn.getAttribute('data-action');
        var ask = CONFIRM[action] ? App.confirm(CONFIRM[action]) : Promise.resolve(true);
        ask.then(function (yes) {
          if (!yes) return;
          App.busy(btn, App.api('tasks.setStatus', { id: t.id, action: action }))
            .then(function (res) {
              App.toast('狀態已改為「' + res.status + '」');
              return loadTask(page, t.id);
            })
            .catch(function (err) { App.toast(err.message); });
        });
      };
    });

    App.$('task-box').querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.onclick = function () { App.copyText(t.paths[Number(btn.getAttribute('data-copy'))]); };
    });

    App.$('task-box').querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.onclick = function () {
        var note = t.timeline.filter(function (n) { return n.id === btn.getAttribute('data-edit'); })[0];
        App.prompt({ title: '修改備註', value: note.content, multiline: true, okText: '儲存' }).then(function (content) {
          if (!content || content === note.content) return;
          App.api('notes.edit', { id: note.id, content: content })
            .then(function () { App.toast('已修改備註'); return loadTask(page, t.id); })
            .catch(function (err) { App.toast(err.message); });
        });
      };
    });

    var form = App.$('note-form');
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
        App.busy(App.$('note-send'), App.api('notes.add', { taskId: t.id, content: content }), '送出中')
          .then(function () { App.toast('已送出備註'); return loadTask(page, t.id); })
          .catch(function (err) { App.toast(err.message); });
      };
    }

    var more = App.$('btn-more');
    if (more) {
      more.onclick = function () {
        App.sheet('更多', [
          { key: 'edit', label: '編輯任務', disabled: !t.permissions.canEdit },
          { key: 'reassign', label: '修改指派', disabled: !t.permissions.canReassign },
          { key: 'delete', label: '刪除', disabled: true, hint: '第 4 階段開放' }
        ]).then(function (key) {
          if (key === 'edit') App.go('/tasks/' + encodeURIComponent(t.id) + '/edit');
          if (key === 'reassign') App.go('/tasks/' + encodeURIComponent(t.id) + '/assign');
        });
      };
    }
  }

  // ---------- 單位與負責人選擇（新增表單、修改指派共用）----------

  /**
   * 在 box 內畫出「負責單位（單選）」與「負責人（可多選）」。
   * 回傳 { get(): { unitId, assignees } }，選擇變動時呼叫 onChange。
   */
  function assignPicker(box, members, initial, onChange) {
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
        '<div class="field" id="field-unit"><span class="field-label">負責單位 <em>必填</em></span>' +
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
                '<button type="button" class="link-btn" id="show-others">其他單位的人…</button>')
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
      var so = box.querySelector('#show-others');
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
  }

  // ---------- 新增子任務／公共待辦（SPEC 5.7）----------

  /** place：todo＝公共待辦；pick＝請使用者選專案；其他＝專案編號 */
  App.route('/new/task/:place', {
    tab: 'todos',
    noFab: true,
    render: function (page, params) {
      var place = params.place;
      var isProject = place !== 'todo' && place !== 'pick';
      App.setActiveTab(place === 'todo' ? 'todos' : 'projects');
      page.innerHTML = App.topbar({
        title: place === 'todo' ? '新增公共待辦' : '新增子任務',
        back: isProject ? '/projects/' + encodeURIComponent(place) : (place === 'pick' ? '/projects' : '/todos'),
        backLabel: '取消'
      }) + '<main class="content" id="new-box">' + App.loadingHtml + '</main>';
      Promise.all([App.api('members.list'), App.api('units.list'), App.api('projects.creatable')]).then(function (res) {
        App.state.units = res[1].units;
        if (App.$('new-box')) renderNewForm(res[0].members, res[2].projects, place);
      }).catch(function (err) {
        var box = App.$('new-box');
        if (box) box.innerHTML = App.errorHtml(err);
      });
    }
  });

  App.route('/new/todo', { tab: 'todos', noFab: true, render: function () { App.go('/new/task/todo', true); } });

  function dueOptions() {
    var today = App.today();
    var dow = App.weekday(today);
    var thisFri = App.addDays(today, 5 - (dow === 0 ? 7 : dow));
    return [
      { key: 'tomorrow', label: '明天', date: App.addDays(today, 1) },
      { key: 'thisFri', label: '本週五', date: thisFri, disabled: thisFri < today },
      { key: 'nextFri', label: '下週五', date: App.addDays(thisFri, 7) }
    ];
  }

  function renderNewForm(members, projects, place) {
    var box = App.$('new-box');
    var due = { date: '' };
    var initialPlace = place === 'todo' ? '' : place === 'pick' ? null : place;
    if (initialPlace && !projects.some(function (p) { return p.id === initialPlace; })) {
      box.innerHTML = App.errorHtml({ message: '這個專案目前不能新增子任務（可能已暫停或結案）。' });
      return;
    }
    box.innerHTML =
      '<form class="card form" id="new-form" novalidate>' +
      '<label class="field" id="field-place"><span class="field-label">放在</span>' +
      '<select class="input" name="place">' +
      (initialPlace === null ? '<option value="__pick" selected disabled>請選擇專案…</option>' : '') +
      projects.map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === initialPlace ? ' selected' : '') + '>' + esc(p.id + ' ' + p.name) + '</option>';
      }).join('') +
      '<option value=""' + (initialPlace === '' ? ' selected' : '') + '>公共待辦</option>' +
      '</select></label>' +
      '<label class="field" id="field-title"><span class="field-label">任務標題 <em>必填</em></span>' +
      '<input class="input" name="title" maxlength="100" autocomplete="off"></label>' +
      '<div id="assign-box"></div>' +
      '<div class="field"><span class="field-label">期限 <span class="muted small">選填</span></span>' +
      '<div class="chips" id="due-chips">' + dueOptions().map(function (o) {
        return '<button type="button" class="chip" data-due="' + o.date + '"' + (o.disabled ? ' disabled' : '') + '>' + o.label + '</button>';
      }).join('') + '<label class="chip chip-date">選日期…<input type="date" id="due-input" min="' + App.today() + '"></label></div>' +
      '<div class="field-hint" id="due-text"></div></div>' +
      '<button type="button" class="link-btn" id="toggle-more">＋ 說明、文件路徑</button>' +
      '<div id="more-fields" hidden>' +
      '<label class="field"><span class="field-label">說明</span>' +
      '<textarea class="input textarea" name="description" rows="3" maxlength="2000" placeholder="要做什麼、做到什麼程度算完成"></textarea></label>' +
      '<label class="field"><span class="field-label">文件路徑 <span class="muted small">一行一筆</span></span>' +
      '<textarea class="input textarea" name="paths" rows="2" placeholder="例：\\\\server\\品保\\2026\\報告"></textarea></label>' +
      '</div>' +
      '<p class="form-note" id="notify-note"></p>' +
      '<div class="alert" id="new-error" role="alert" hidden></div>' +
      '<button class="btn btn-primary btn-block" type="submit" id="new-save" disabled>建立任務</button>' +
      '<p class="hint center" id="missing-note"></p>' +
      '</form>';

    var form = App.$('new-form');
    var picker = assignPicker(App.$('assign-box'), members, {}, update);

    function setDue(date) {
      due.date = date;
      form.querySelectorAll('[data-due]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-due') === date); });
      var input = App.$('due-input');
      var custom = date && !form.querySelector('[data-due="' + date + '"]');
      input.parentElement.classList.toggle('on', !!custom);
      App.$('due-text').innerHTML = date ? '期限：' + esc(App.fmtDate(date)) + ' <button type="button" class="link-btn" id="due-clear">清除</button>' : '';
      var clear = App.$('due-clear');
      if (clear) clear.onclick = function () { input.value = ''; setDue(''); };
    }
    form.querySelectorAll('[data-due]').forEach(function (b) {
      b.onclick = function () { setDue(due.date === b.getAttribute('data-due') ? '' : b.getAttribute('data-due')); };
    });
    App.$('due-input').onchange = function (e) { setDue(e.target.value); };
    App.$('due-input').onclick = function (e) {
      try { if (e.target.showPicker) e.target.showPicker(); } catch (err) { /* 部分瀏覽器不支援 */ }
    };

    App.$('toggle-more').onclick = function () {
      App.$('more-fields').hidden = false;
      App.$('toggle-more').hidden = true;
    };

    function update() {
      var a = picker.get();
      var title = form.title.value.trim();
      var missing = [];
      if (form.place.value === '__pick') missing.push('放在哪個專案');
      if (!title) missing.push('任務標題');
      if (!a.unitId) missing.push('負責單位');
      App.$('new-save').disabled = missing.length > 0;
      App.$('missing-note').textContent = missing.length ? '還缺：' + missing.join('、') : '';
      App.$('field-title').classList.toggle('missing', !title && form.title.dataset.touched === '1');
      // SPEC 5.7 表單底部提示（D-038）
      var who = a.assignees.length ? picker.names().join('、') : (a.unitId ? App.unitName(a.unitId) + '全體' : '負責人或單位');
      App.$('notify-note').textContent = '建立後狀態為「未開始」，' + who + '下個工作日早上 9 點後會收到 Email 通知';
    }
    form.title.oninput = function () { form.title.dataset.touched = '1'; update(); };
    form.place.onchange = update;
    update();

    form.onsubmit = function (e) {
      e.preventDefault();
      var a = picker.get();
      var payload = {
        projectId: form.place.value === '__pick' ? '' : form.place.value,
        title: form.title.value.trim(),
        unitId: a.unitId,
        assignees: a.assignees,
        dueDate: due.date,
        description: form.description.value.trim(),
        paths: form.paths.value.split('\n').map(function (p) { return p.trim(); }).filter(Boolean)
      };
      var err = App.$('new-error');
      err.hidden = true;
      App.busy(App.$('new-save'), App.api('tasks.create', payload), '建立中…')
        .then(function (res) {
          App.toast('已建立 ' + res.id);
          App.go('/tasks/' + encodeURIComponent(res.id), true);
        })
        .catch(function (e2) {
          err.textContent = e2.message;
          err.hidden = false;
        });
    };
  }

  // ---------- 修改指派 ----------

  App.route('/tasks/:id/assign', {
    tab: 'todos',
    noFab: true,
    render: function (page, params) {
      var id = params.id;
      page.innerHTML = App.topbar({ title: '修改指派', back: '/tasks/' + encodeURIComponent(id), backLabel: '取消' }) +
        '<main class="content" id="assign-page">' + App.loadingHtml + '</main>';
      Promise.all([App.api('tasks.get', { id: id }), App.api('members.list'), App.api('units.list')]).then(function (res) {
        App.state.units = res[2].units;
        var t = res[0].task;
        App.setActiveTab(t.projectId ? 'projects' : 'todos');
        var box = App.$('assign-page');
        if (!box) return;
        box.innerHTML = '<form class="card form" id="assign-form">' +
          '<p class="muted">' + esc(t.id) + ' ' + esc(t.title) + '</p>' +
          '<div id="assign-box2"></div>' +
          '<div class="alert" id="assign-error" role="alert" hidden></div>' +
          '<button class="btn btn-primary btn-block" type="submit" id="assign-save">儲存</button></form>';
        var picker = assignPicker(App.$('assign-box2'), res[1].members,
          { unitId: t.unitId, assignees: t.assignees.map(function (a) { return a.id; }) }, function () {});
        App.$('assign-form').onsubmit = function (e) {
          e.preventDefault();
          var a = picker.get();
          App.busy(App.$('assign-save'), App.api('tasks.reassign', { id: id, unitId: a.unitId, assignees: a.assignees }), '儲存中…')
            .then(function () { App.toast('已修改指派'); App.go('/tasks/' + encodeURIComponent(id), true); })
            .catch(function (e2) {
              var err = App.$('assign-error');
              err.textContent = e2.message;
              err.hidden = false;
            });
        };
      }).catch(function (err) {
        var box = App.$('assign-page');
        if (box) box.innerHTML = App.errorHtml(err);
      });
    }
  });

  // ---------- 編輯任務（SPEC 5.4、D-036：標題、說明、期限、文件路徑）----------

  App.route('/tasks/:id/edit', {
    tab: 'todos',
    noFab: true,
    render: function (page, params) {
      var id = params.id;
      page.innerHTML = App.topbar({ title: '編輯任務', back: '/tasks/' + encodeURIComponent(id), backLabel: '取消' }) +
        '<main class="content" id="edit-page">' + App.loadingHtml + '</main>';
      App.api('tasks.get', { id: id }).then(function (res) {
        var t = res.task;
        App.setActiveTab(t.projectId ? 'projects' : 'todos');
        var box = App.$('edit-page');
        if (!box) return;
        if (!t.permissions.canEdit) {
          box.innerHTML = App.errorHtml({ message: t.permissions.readOnly ? '此任務在歷史區，唯讀。' : '只有發布者或管理者可以編輯任務內容。' });
          return;
        }
        box.innerHTML = '<form class="card form" id="edit-form" novalidate>' +
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
          '<div class="alert" id="edit-error" role="alert" hidden></div>' +
          '<button class="btn btn-primary btn-block" type="submit" id="edit-save">儲存</button></form>';
        var form = App.$('edit-form');
        form.onsubmit = function (e) {
          e.preventDefault();
          var err = App.$('edit-error');
          if (!form.title.value.trim()) { err.textContent = '請填寫任務標題'; err.hidden = false; return; }
          App.busy(App.$('edit-save'), App.api('tasks.update', {
            id: id,
            title: form.title.value.trim(),
            description: form.description.value.trim(),
            dueDate: form.dueDate.value,
            paths: form.paths.value.split('\n').map(function (p) { return p.trim(); }).filter(Boolean)
          }), '儲存中…')
            .then(function () { App.toast('已儲存'); App.go('/tasks/' + encodeURIComponent(id), true); })
            .catch(function (e2) { err.textContent = e2.message; err.hidden = false; });
        };
      }).catch(function (err) {
        var box = App.$('edit-page');
        if (box) box.innerHTML = App.errorHtml(err);
      });
    }
  });
})();
