/**
 * 專案畫面：專案分頁、專案內頁、新增／編輯專案、已完成清單、暫停與結案（SPEC 5.3、5.7、6.1）。
 */
(function () {
  'use strict';
  var App = window.App;
  var esc = App.esc;

  // ---------- 共用片段 ----------

  App.projectTags = function (p) {
    return (p.state === '暫停' ? '<span class="tag tag-paused">暫停中</span>' : '') +
      (p.state === '已結案' ? '<span class="tag ' + (p.closeReason === '完成' ? 'tag-done' : 'tag-paused') + '">結案・' + esc(p.closeReason) + '</span>' : '') +
      (p.visibility === '限定成員' ? '<span class="tag tag-restricted">限定成員</span>' : '');
  };

  App.projectCard = function (p) {
    var hint = p.hint ? '<span class="hint-' + p.hint.kind + '">' + esc(p.hint.text) + '</span>' : '';
    return '<a class="project-row" href="#/projects/' + encodeURIComponent(p.id) + '">' +
      '<span class="project-title">' + (p.hasNew ? App.dot() : '') + '<span class="task-id">' + esc(p.id) + '</span> ' + esc(p.name) + ' ' + App.projectTags(p) + '</span>' +
      App.progressHtml(p.done, p.total) +
      (p.state === '暫停' ? '<span class="project-hint muted">' + esc(p.pauseReason) + ' · 預計 ' + esc(App.fmtDate(p.resumeDate)) + ' 恢復</span>'
        : (hint ? '<span class="project-hint">' + hint + '</span>' : '')) +
      '</a>';
  };

  /** 讀取清單並畫在 boxId：有暫存先顯示，再更新為最新資料。 */
  function loadInto(boxId, action, payload, render) {
    var box = App.$(boxId);
    return App.load(box, action, payload, function (data) { box.innerHTML = render(data); });
  }

  // ---------- 專案分頁 ----------

  App.route('/projects', {
    tab: 'projects',
    render: function (page) {
      page.innerHTML = App.topbar({ title: '專案' }) +
        '<main class="content" id="project-list">' + App.loadingHtml + '</main>';
      loadInto('project-list', 'projects.list', {}, function (data) {
        if (!data.projects.length) {
          return '<div class="card empty"><h2>目前沒有專案</h2><p class="muted">按右下角「＋」→「新增專案」建立第一個專案。</p></div>';
        }
        var mine = data.projects.filter(function (p) { return p.participating; });
        var others = data.projects.filter(function (p) { return !p.participating; });
        return (mine.length ? '<h3 class="section-title">我參與的（' + mine.length + '）</h3><div class="card list">' + mine.map(App.projectCard).join('') + '</div>' : '') +
          (others.length ? '<h3 class="section-title">其他公開專案（' + others.length + '）</h3><div class="card list">' + others.map(App.projectCard).join('') + '</div>' : '');
      });
    }
  });

  // ---------- 專案內頁（SPEC 5.3）----------

  var GROUP_ORDER = ['待簽核', '進行中', '等待外部', '未開始'];

  App.route('/projects/:id', {
    tab: 'projects',
    noFab: true,
    render: function (page, params) {
      if (params.id === 'new') { renderProjectFormPage(page, null); return; }
      page.innerHTML = App.topbar({ title: '專案', back: '/projects', backLabel: '專案' }) +
        '<main class="content" id="project-box">' + App.loadingHtml + '</main>';
      loadProject(page, params.id);
    }
  });

  function loadProject(page, id) {
    var box = App.$('project-box');
    return App.load(box, 'projects.get', { id: id }, function (data) { renderProject(page, data.project); });
  }

  function targetDateHtml(p) {
    if (!p.targetDate) return '';
    var days = Math.round((Date.parse(p.targetDate) - Date.parse(App.today())) / 86400000);
    return '<div class="goal-date">目標完成日：' + esc(App.fmtDate(p.targetDate)) +
      (p.state === '進行中' && days >= 0 ? ' <span class="muted">（剩 ' + days + ' 天）</span>' : '') + '</div>';
  }

  // 專案頁「子任務｜全部備註」（SPEC 5.3、D-064）；記住每個專案上次看的是哪一邊
  App.state.pview = App.state.pview || {};

  function notesPaneHtml() {
    return '<div class="card notes-pane"><div id="pn-body">' + App.loadingHtml + '</div></div>';
  }

  function renderNotes(box, data, filter) {
    var list = data.notes.filter(function (n) { return !filter || n.taskId === filter; });
    box.innerHTML =
      '<select class="input" id="pn-filter"><option value="">全部子任務</option>' + data.tasks.map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (filter === t.id ? ' selected' : '') + '>' + esc(t.id + ' ' + t.title) + '</option>';
      }).join('') + '</select>' +
      (list.length ? '<div class="pn-list">' + list.map(function (n) {
        return '<a class="pn-item" data-task="' + esc(n.taskId) + '" href="#/tasks/' + encodeURIComponent(n.taskId) + '">' +
          '<span class="pn-task"><span class="task-id">' + esc(n.taskId) + '</span> ' + esc(n.taskTitle) + '</span>' +
          '<span class="pn-meta">' + esc(n.authorName) + ' · ' + esc(App.fmtDateTime(n.createdAt)) + (n.editedAt ? ' · 已編輯' : '') + '</span>' +
          '<span class="pn-content">' + esc(n.content) + '</span></a>';
      }).join('') + '</div>' : '<p class="muted pn-empty">' + (filter ? '這個子任務還沒有備註。' : '這個專案還沒有任何備註。') + '</p>');
    box.querySelector('#pn-filter').onchange = function (e) { renderNotes(box, data, e.target.value); };
  }

  function loadNotes(p) {
    var body = App.$('pn-body');
    if (!body) return;
    App.load(body, 'projects.notes', { id: p.id }, function (data) { renderNotes(body, data, ''); });
  }

  function renderProject(page, p) {
    var perm = p.permissions;
    var view = App.state.pview[p.id] === 'notes' ? 'notes' : 'tasks';
    var closed = p.state === '已結案';
    page.querySelector('.topbar').outerHTML = App.topbar({
      title: '專案', back: closed ? '/history' : '/projects', backLabel: closed ? '歷史' : '專案', more: perm.canManage
    });
    App.setActiveTab(closed ? 'history' : 'projects');
    var open = p.tasks.filter(function (t) { return t.status !== '已完成'; });
    var groups = GROUP_ORDER.map(function (status) {
      var list = open.filter(function (t) { return t.status === status; });
      if (!list.length) return '';
      return '<h3 class="section-title">' + App.statusBadge(status) + ' ' + list.length + ' 項</h3>' +
        App.taskList(list, { inProject: true });
    }).join('');

    App.$('project-box').innerHTML =
      (p.state === '暫停' ? '<div class="banner banner-paused">暫停中 · ' + esc(p.pauseReason) + ' · 預計 ' + esc(App.fmtDate(p.resumeDate)) + ' 恢復</div>' : '') +
      (closed ? '<div class="banner banner-closed">已結案（' + esc(p.closeReason) + '）' + (p.closeNote ? ' · ' + esc(p.closeNote) : '') +
        ' · ' + esc(p.closedBy) + ' ' + esc(App.fmtDateTime(p.closedAt)) + '</div>' : '') +
      '<div class="task-head">' +
      '<div class="task-meta">' + esc(p.id) + ' · ' + esc(p.visibility) + ' · ' + esc(p.createdBy.name) + ' 建立於 ' + esc(App.fmtDate(p.createdAt)) + '</div>' +
      '<h1 class="task-h1">' + (p.hasNew ? App.dot() : '') + esc(p.name) + '</h1></div>' +

      '<div class="card goal">' +
      '<div class="goal-label">專案目標</div><p class="goal-text">' + esc(p.goal) + '</p>' + targetDateHtml(p) +
      (p.background ? '<button type="button" class="link-btn" id="toggle-bg">查看背景說明 ›</button><p class="goal-bg" id="bg-text" hidden>' + esc(p.background) + '</p>' : '') +
      '</div>' +

      (p.paths.length ? '<div class="card"><div class="goal-label">文件路徑</div>' + p.paths.map(function (path, i) {
        return '<span class="path-item"><code>' + esc(path) + '</code><button class="btn btn-small btn-secondary" type="button" data-copy="' + i + '">複製</button></span>';
      }).join('') + '</div>' : '') +

      '<div class="card">' + App.progressHtml(p.done, p.total) +
      (p.done ? '<a class="link-row" href="#/projects/' + encodeURIComponent(p.id) + '/done">已完成 ' + p.done + ' 項 →</a>' : '') +
      (p.visibility === '限定成員' ? '<p class="muted small">可見成員：' + esc(p.visibleMembers.map(function (m) { return m.name; }).join('、')) + '（以及被指派子任務的人）</p>' : '') +
      '</div>' +

      '<div class="segmented pview-switch"><button type="button" class="seg' + (view === 'tasks' ? ' on' : '') + '" data-view="tasks">子任務</button>' +
      '<button type="button" class="seg' + (view === 'notes' ? ' on' : '') + '" data-view="notes">全部備註</button></div>' +
      (view === 'notes' ? notesPaneHtml()
        : (groups || '<div class="card empty"><p class="muted">' + (p.total ? '子任務都完成了。' : '還沒有子任務。') + '</p></div>')) +

      (perm.canAddTask ? '<div class="bottom-bar"><a class="btn btn-primary btn-block" href="#/new/task/' + encodeURIComponent(p.id) + '">＋ 新增子任務</a></div>' : '');

    App.$('project-box').classList.toggle('has-bottom-bar', perm.canAddTask);
    App.$('project-box').querySelectorAll('[data-view]').forEach(function (b) {
      b.onclick = function () {
        App.state.pview[p.id] = b.getAttribute('data-view');
        renderProject(page, p);
      };
    });
    if (view === 'notes') loadNotes(p);
    bindProject(page, p);
  }

  function bindProject(page, p) {
    var bg = App.$('toggle-bg');
    if (bg) bg.onclick = function () { App.$('bg-text').hidden = false; bg.hidden = true; };
    App.$('project-box').querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.onclick = function () { App.copyText(p.paths[Number(btn.getAttribute('data-copy'))]); };
    });
    var more = App.$('btn-more');
    if (!more) return;
    more.onclick = function () {
      var perm = p.permissions;
      var items = [];
      if (perm.canEdit) {
        items.push({ key: 'edit', label: '編輯專案' });
        items.push({ key: 'members', label: '編輯可見成員' });
      }
      if (perm.canPause) items.push({ key: 'pause', label: '暫停專案' });
      if (perm.canResume) {
        items.push({ key: 'resume', label: '恢復專案' });
        items.push({ key: 'extend', label: '延長暫停' });
      }
      if (perm.canClose) items.push({ key: 'close', label: '結案' });
      if (perm.canReopen) items.push({ key: 'reopen', label: '取消結案' });
      if (perm.canDelete) items.push({ key: 'delete', label: '刪除專案', danger: true });
      App.sheet('更多', items).then(function (key) {
        if (key === 'edit' || key === 'members') App.go('/projects/' + encodeURIComponent(p.id) + '/edit' + (key === 'members' ? '?members' : ''));
        if (key === 'pause') App.pauseProject(p).then(function (ok) { if (ok) loadProject(page, p.id); });
        if (key === 'resume') App.resumeProject(p).then(function (ok) { if (ok) loadProject(page, p.id); });
        if (key === 'extend') App.extendPause(p).then(function (ok) { if (ok) loadProject(page, p.id); });
        if (key === 'close') closeProject(p).then(function (ok) { if (ok) loadProject(page, p.id); });
        if (key === 'reopen') reopenProject(p).then(function (ok) { if (ok) loadProject(page, p.id); });
        if (key === 'delete') deleteProject(p);
      });
    };
  }

  // ---------- 暫停／恢復／延長／結案 ----------

  function run(promise, message) {
    return promise.then(function () { App.toast(message); return true; })
      .catch(function (err) { App.toast(err.message); return false; });
  }

  App.pauseProject = function (p) {
    return App.formModal({
      title: '暫停「' + p.name + '」',
      message: '暫停期間子任務不計逾期、不出現在「需要我處理」，也不能新增子任務或變更狀態；仍可查看與備註。',
      fields: [
        { name: 'reason', label: '暫停原因', required: true, placeholder: '例：客戶延後開案', maxLength: 100 },
        { name: 'resumeDate', label: '預計恢復日', type: 'date', required: true, min: App.today() }
      ],
      okText: '暫停'
    }).then(function (v) {
      return v ? run(App.api('projects.pause', { id: p.id, reason: v.reason, resumeDate: v.resumeDate }), '專案已暫停') : false;
    });
  };

  App.resumeProject = function (p) {
    return App.confirm({ title: '恢復「' + p.name + '」？', message: '子任務會回到原本的狀態；期限不會自動順延。', okText: '恢復' })
      .then(function (yes) {
        if (!yes) return false;
        return App.api('projects.resume', { id: p.id }).then(function (res) {
          App.toast('專案已恢復');
          return res.overdueTasks.length ? adjustOverdue(res.overdueTasks) : true;
        }).catch(function (err) { App.toast(err.message); return false; });
      });
  };

  /** 恢復時「以下任務期限已過」：逐項修改期限或直接略過（SPEC 6.1、D-040） */
  function adjustOverdue(tasks) {
    return App.formModal({
      title: '以下任務期限已過',
      message: '可以直接修改期限，也可以按「略過」之後再處理。',
      fields: tasks.map(function (t) {
        return { name: 'd_' + t.id.replace(/\W/g, '_'), label: t.id + ' ' + t.title + '（原期限 ' + App.fmtDate(t.dueDate) + '）', type: 'date', value: t.dueDate, min: App.today() };
      }),
      okText: '儲存期限',
      cancelText: '略過'
    }).then(function (v) {
      if (!v) return true;
      var updates = tasks.filter(function (t) {
        var nv = v['d_' + t.id.replace(/\W/g, '_')];
        return nv && nv !== t.dueDate;
      }).map(function (t) {
        return App.api('tasks.update', { id: t.id, dueDate: v['d_' + t.id.replace(/\W/g, '_')] });
      });
      return Promise.all(updates).then(function () {
        if (updates.length) App.toast('已更新 ' + updates.length + ' 項期限');
        return true;
      }).catch(function (err) { App.toast(err.message); return true; });
    });
  }

  App.extendPause = function (p) {
    return App.formModal({
      title: '延長暫停',
      fields: [{ name: 'resumeDate', label: '新的預計恢復日', type: 'date', required: true, min: App.today(), value: p.resumeDate && p.resumeDate >= App.today() ? p.resumeDate : '' }],
      okText: '延長'
    }).then(function (v) {
      return v ? run(App.api('projects.extend', { id: p.id, resumeDate: v.resumeDate }), '已延長暫停') : false;
    });
  };

  function closeProject(p) {
    var open = p.tasks.filter(function (t) { return t.status !== '已完成'; });
    var ask = open.length
      ? App.confirm({
        title: '還有 ' + open.length + ' 項子任務未完成',
        message: open.slice(0, 8).map(function (t) { return t.id + ' ' + t.title + '（' + t.status + '）'; }).join('\n') +
          (open.length > 8 ? '\n…等 ' + open.length + ' 項' : '') +
          '\n\n結案後這些子任務會保留原狀態，標示「隨專案結案」，一起移到歷史區。',
        okText: '繼續結案',
        danger: true
      })
      : Promise.resolve(true);
    return ask.then(function (yes) {
      if (!yes) return false;
      return App.formModal({
        title: '結案「' + p.name + '」',
        fields: [
          { name: 'reason', label: '結案原因', type: 'choice', options: ['完成', '取消'], required: true },
          { name: 'note', label: '說明', type: 'textarea', placeholder: '一句話說明（選填）', maxLength: 200 }
        ],
        okText: '結案',
        danger: true
      }).then(function (v) {
        return v ? run(App.api('projects.close', { id: p.id, reason: v.reason, note: v.note }), '專案已結案，移到歷史區') : false;
      });
    });
  }

  /** 刪除專案：子任務（含他人建立的）一起隱藏（SPEC 6.7、D-043） */
  function deleteProject(p) {
    App.confirm({
      title: '刪除「' + p.name + '」？',
      message: '將一併隱藏 ' + p.total + ' 個子任務，確定刪除？\n刪除後管理者可以在「已刪除項目」還原。',
      okText: '刪除',
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      App.api('projects.delete', { id: p.id }).then(function () {
        App.toast('已刪除 ' + p.id);
        App.go(p.state === '已結案' ? '/history' : '/projects', true);
      }).catch(function (err) { App.toast(err.message); });
    });
  }

  function reopenProject(p) {
    return App.confirm({ title: '取消結案？', message: '專案會回到「專案」分頁，子任務恢復可以操作。', okText: '取消結案' })
      .then(function (yes) { return yes ? run(App.api('projects.reopen', { id: p.id }), '已取消結案') : false; });
  }

  // ---------- 已完成的子任務 ----------

  App.route('/projects/:id/done', {
    tab: 'projects',
    noFab: true,
    render: function (page, params) {
      page.innerHTML = App.topbar({ title: '已完成', back: '/projects/' + encodeURIComponent(params.id), backLabel: '專案' }) +
        '<main class="content" id="done-box">' + App.loadingHtml + '</main>';
      loadInto('done-box', 'projects.get', { id: params.id }, function (data) {
        var done = data.project.tasks.filter(function (t) { return t.status === '已完成'; })
          .sort(function (a, b) { return String(b.completedAt).localeCompare(String(a.completedAt)); });
        return '<p class="muted">' + esc(data.project.id) + ' ' + esc(data.project.name) + '</p>' +
          (done.length ? App.taskList(done, { inProject: true })
            : '<div class="card empty"><p class="muted">還沒有已完成的子任務。</p></div>');
      });
    }
  });

  // ---------- 新增／編輯專案（SPEC 5.7、6.1）----------

  App.route('/projects/:id/edit', {
    tab: 'projects',
    noFab: true,
    render: function (page, params) {
      page.innerHTML = App.topbar({ title: '編輯專案', back: '/projects/' + encodeURIComponent(params.id), backLabel: '取消' }) +
        '<main class="content" id="pform-box">' + App.loadingHtml + '</main>';
      Promise.all([App.api('projects.get', { id: params.id }), App.getData('members.list')]).then(function (res) {
        if (App.$('pform-box')) renderProjectForm(res[0].project, res[1].members);
      }).catch(function (err) {
        var box = App.$('pform-box');
        if (box) box.innerHTML = App.errorHtml(err);
      });
    }
  });

  function renderProjectFormPage(page) {
    page.innerHTML = App.topbar({ title: '新增專案', back: '/projects', backLabel: '取消' }) +
      '<main class="content" id="pform-box">' + App.loadingHtml + '</main>';
    App.getData('members.list').then(function (res) {
      if (App.$('pform-box')) renderProjectForm(null, res.members);
    }).catch(function (err) {
      var box = App.$('pform-box');
      if (box) box.innerHTML = App.errorHtml(err);
    });
  }

  function renderProjectForm(project, members) {
    var isNew = !project;
    var p = project || { name: '', goal: '', targetDate: '', background: '', paths: [], visibility: '公開', visibleMembers: [] };
    var state = { visibility: p.visibility, members: p.visibleMembers.map(function (m) { return m.id; }) };
    var me = App.state.profile.id;
    var choices = members.filter(function (m) { return m.id !== me && (m.active || state.members.indexOf(m.id) !== -1); });
    var box = App.$('pform-box');
    var showMore = !isNew && (p.background || p.paths.length);

    box.innerHTML =
      '<form class="card form" id="pform" novalidate>' +
      '<label class="field" id="pf-name"><span class="field-label">專案名稱 <em>必填</em></span>' +
      '<input class="input" name="name" maxlength="60" value="' + esc(p.name) + '" autocomplete="off"></label>' +
      '<label class="field" id="pf-goal"><span class="field-label">專案目標 <em>必填</em></span>' +
      '<textarea class="input textarea" name="goal" rows="2" maxlength="300" placeholder="這個專案要達成什麼？例：10 月底前完成樣品承認，11 月底前量產">' + esc(p.goal) + '</textarea></label>' +
      '<label class="field"><span class="field-label">目標完成日 <span class="muted small">選填，僅供參考</span></span>' +
      '<input class="input" name="targetDate" type="date" value="' + esc(p.targetDate) + '"></label>' +
      '<div class="field" id="pf-vis"><span class="field-label">可見性</span>' +
      '<div class="segmented">' + ['公開', '限定成員'].map(function (v) {
        return '<button type="button" class="seg' + (state.visibility === v ? ' on' : '') + '" data-vis="' + v + '">' + v + '</button>';
      }).join('') + '</div>' +
      '<span class="field-hint" id="vis-hint"></span>' +
      '<div id="vis-members"></div></div>' +
      '<button type="button" class="link-btn" id="pf-more-btn"' + (showMore ? ' hidden' : '') + '>＋ 背景說明、文件路徑</button>' +
      '<div id="pf-more"' + (showMore ? '' : ' hidden') + '>' +
      '<label class="field"><span class="field-label">背景說明</span>' +
      '<textarea class="input textarea" name="background" rows="4" maxlength="3000" placeholder="較長的背景、客戶要求、注意事項">' + esc(p.background) + '</textarea></label>' +
      '<label class="field"><span class="field-label">文件路徑 <span class="muted small">一行一筆</span></span>' +
      '<textarea class="input textarea" name="paths" rows="2">' + esc(p.paths.join('\n')) + '</textarea></label>' +
      '</div>' +
      '<div class="alert" id="pf-error" role="alert" hidden></div>' +
      '<button class="btn btn-primary btn-block" type="submit" id="pf-save">' + (isNew ? '建立專案' : '儲存') + '</button>' +
      '<p class="hint center" id="pf-missing"></p>' +
      '</form>';

    var form = App.$('pform');

    function drawMembers() {
      App.$('vis-hint').textContent = state.visibility === '公開'
        ? '全體成員都看得到。'
        : '只有你、下面勾選的成員，以及被指派子任務的人看得到。';
      var mbox = App.$('vis-members');
      if (state.visibility !== '限定成員') { mbox.innerHTML = ''; return; }
      mbox.innerHTML = '<div class="sub-label">可見成員 <em class="req">至少一位</em></div><div class="chips">' + choices.map(function (m) {
        var on = state.members.indexOf(m.id) !== -1;
        return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-mem="' + esc(m.id) + '">' + esc(m.name) + '</button>';
      }).join('') + '</div>';
      mbox.querySelectorAll('[data-mem]').forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-mem');
          var i = state.members.indexOf(id);
          if (i === -1) state.members.push(id); else state.members.splice(i, 1);
          drawMembers();
          update();
        };
      });
    }

    form.querySelectorAll('[data-vis]').forEach(function (b) {
      b.onclick = function () {
        state.visibility = b.getAttribute('data-vis');
        form.querySelectorAll('[data-vis]').forEach(function (x) { x.classList.toggle('on', x === b); });
        drawMembers();
        update();
      };
    });
    App.$('pf-more-btn').onclick = function () { App.$('pf-more').hidden = false; App.$('pf-more-btn').hidden = true; };

    function update() {
      var missing = [];
      if (!form.name.value.trim()) missing.push('專案名稱');
      if (!form.goal.value.trim()) missing.push('專案目標');
      if (state.visibility === '限定成員' && !state.members.length) missing.push('可見成員');
      App.$('pf-save').disabled = missing.length > 0;
      App.$('pf-missing').textContent = missing.length ? '還缺：' + missing.join('、') : '';
    }
    form.name.oninput = update;
    form.goal.oninput = update;
    drawMembers();
    update();
    if (location.hash.indexOf('?members') !== -1) App.$('pf-vis').scrollIntoView();

    form.onsubmit = function (e) {
      e.preventDefault();
      var payload = {
        name: form.name.value.trim(),
        goal: form.goal.value.trim(),
        targetDate: form.targetDate.value,
        background: form.background.value.trim(),
        paths: form.paths.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean),
        visibility: state.visibility,
        visibleMembers: state.visibility === '限定成員' ? state.members : []
      };
      if (!isNew) payload.id = project.id;
      var err = App.$('pf-error');
      err.hidden = true;
      App.busy(App.$('pf-save'), App.api(isNew ? 'projects.create' : 'projects.update', payload), '儲存中…')
        .then(function (res) {
          App.toast(isNew ? '已建立 ' + res.id : '已儲存');
          App.go('/projects/' + encodeURIComponent(res.id), true);
        })
        .catch(function (e2) { err.textContent = e2.message; err.hidden = false; });
    };
  }
})();
