/**
 * dsh-experience — 浏览器半侧（工作台可视化面板）。
 * 数据经 host 的只读 HTTP/REST 路由读取，写操作只回传指令；前端不直接改文件。
 */
window.__ModuleLoader__.load({
  id: 'dsh-experience',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    var h = React.createElement

    var NS = 'dsh-experience'
    var ROUTE = '/plugins/dsh-experience'

    var COLORS = {
      primary: 'var(--dsw-alias-label-primary, #e8e8e8)',
      secondary: 'var(--dsw-alias-label-secondary, #9a9a9a)',
      tertiary: 'var(--dsw-alias-label-tertiary, #777)',
      bg1: 'var(--dsw-alias-bg-layer-1, #171717)',
      bg2: 'var(--dsw-alias-bg-layer-2, #202020)',
      border: 'var(--dsw-alias-border-l1, #2c2c2c)',
      accent: 'var(--dsw-alias-brand-primary, #4f8cff)',
      warn: 'var(--dsw-alias-state-warn-primary, #e0a63c)',
      ok: 'var(--dsw-alias-state-success-primary, #4caf7d)',
      danger: 'var(--dsw-alias-state-danger-primary, #e06055)',
    }

    function api(action, body) {
      return fetch(ROUTE + '/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.assign({ action: action }, body || {})),
      }).then(function (r) { return r.json() })
    }

    function badge(text, color) {
      return h('span', {
        style: {
          display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11,
          lineHeight: '17px', color: color || COLORS.secondary, background: COLORS.bg2,
          border: '1px solid ' + (color || COLORS.border), marginRight: 6, whiteSpace: 'nowrap',
        },
      }, text)
    }

    function statCard(label, value, color) {
      return h('div', {
        style: { flex: 1, minWidth: 110, background: COLORS.bg2, borderRadius: 8, padding: '10px 14px', margin: 4, border: '1px solid ' + COLORS.border },
      }, [
        h('div', { key: 'v', style: { fontSize: 20, fontWeight: 600, color: color || COLORS.primary } }, value),
        h('div', { key: 'l', style: { fontSize: 12, color: COLORS.secondary, marginTop: 2 } }, label),
      ])
    }

    function ExperiencePanel() {
      var stateHook = React.useState(null); var state = stateHook[0]; var setState = stateHook[1]
      var catHook = React.useState(''); var category = catHook[0]; var setCategory = catHook[1]
      var qHook = React.useState(''); var query = qHook[0]; var setQuery = qHook[1]
      var mergeHook = React.useState(null); var mergeSource = mergeHook[0]; var setMergeSource = mergeHook[1]
      var errHook = React.useState(''); var err = errHook[0]; var setErr = errHook[1]
      var openHook = React.useState({}); var open = openHook[0]; var setOpen = openHook[1]

      React.useEffect(function () {
        var alive = true
        function load() {
          fetch(ROUTE + '/state', { cache: 'no-store' })
            .then(function (r) { return r.json() })
            .then(function (s) { if (alive) setState(s) })
            .catch(function (e) { if (alive) setErr(String(e && e.message || e)) })
        }
        load()
        return function () { alive = false }
      }, [])

      function doAction(action, body, label) {
        setErr('')
        api(action, body).then(function (s) {
          if (s && s.ok === false) setErr(s.error || '操作失败')
          setState(s)
          if (label) setErr(label + ' 完成')
        }).catch(function (e) { setErr(String(e && e.message || e)) })
      }

      if (!state) return h('div', { style: { padding: 28, color: COLORS.secondary } }, '加载经验库…')

      var cats = state.categories || []
      var stats = state.stats || {}
      var hadErr = err

      function filtered() {
        var items = state.items || []
        var q = String(query || '').toLowerCase()
        return items.filter(function (i) {
          if (category && i.category !== category) return false
          if (!q) return true
          var hay = (i.title + ' ' + (i.solution || '') + ' ' + (i.symptom || '') + ' ' + (i.id || '')).toLowerCase()
          return hay.indexOf(q) >= 0
        })
      }
      var items = filtered()

      function CatRow(c) {
        var selected = category === c.id
        return h('div', {
          key: c.id,
          onClick: function () { setCategory(selected ? '' : c.id) },
          style: {
            padding: '8px 12px', cursor: 'pointer', borderRadius: 6, marginBottom: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: selected ? COLORS.bg2 : 'transparent',
            color: c.enabled === false ? COLORS.tertiary : COLORS.primary,
          },
        }, [
          h('span', { key: 't', style: { fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' } }, c.title || c.id),
          h('input', {
            key: 'c', type: 'checkbox', checked: c.enabled !== false, title: '启用/停用分类',
            onChange: function (e) { e.stopPropagation(); doAction('toggleCategory', { id: c.id, enabled: e.target.checked }) },
            onClick: function (e) { e.stopPropagation() },
          }),
        ])
      }

      function ItemRow(it) {
        var isOpen = !!open[it.id]
        var stale = it.stale
        var conflicted = (state.conflicts || []).some(function (p) { return p.a === it.id || p.b === it.id })
        return h('div', {
          key: it.id,
          style: { border: '1px solid ' + COLORS.border, borderRadius: 8, padding: '10px 12px', marginBottom: 8, background: COLORS.bg1 },
        }, [
          h('div', { key: 'h', style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } }, [
            h('span', { key: 't', style: { fontWeight: 600, fontSize: 13, color: it.enabled ? COLORS.primary : COLORS.tertiary, cursor: 'pointer', flex: 1, minWidth: 120 }, title: it.id, onClick: function () { setOpen(Object.assign({}, open, {})) /* noop */ } }, it.title || it.id),
            badge(it.status || 'candidate', it.status === 'mature' ? COLORS.ok : it.status === 'confirmed' ? COLORS.accent : COLORS.secondary),
            badge('置信 ' + (typeof it.confidence === 'number' ? it.confidence : '-')),
            badge('命中 ' + (it.hits || 0)),
            stale ? badge('建议归档', COLORS.warn) : null,
            conflicted ? badge('冲突', COLORS.danger) : null,
            h('input', {
              key: 'e', type: 'checkbox', checked: it.enabled !== false, title: '启用/停用该条',
              onChange: function (e) { doAction('toggleItem', { id: it.id, enabled: e.target.checked }) },
            }),
          ]),
          h('div', { key: 'b', style: { color: COLORS.secondary, fontSize: 12, marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } },
            (it.symptom || '').slice(0, 160) + ((it.symptom || '').length > 160 ? '…' : '')),
          isOpen ? h('div', { key: 'o', style: { marginTop: 8, borderTop: '1px solid ' + COLORS.border, paddingTop: 8, fontSize: 12, color: COLORS.secondary, whiteSpace: 'pre-wrap' } }, [
            h('div', { key: 's' }, '解法：' + (it.solution || it.correctCommand || '（无）')),
            (it.cause ? h('div', { key: 'c' }, '原因：' + it.cause) : null),
            (it.note ? h('div', { key: 'n' }, '注意：' + it.note) : null),
          ]) : null,
          h('div', { key: 'a', style: { marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' } }, [
            h('button', { key: 'open', onClick: function () { setOpen(Object.assign({}, open, (function (o) { o[it.id] = !open[it.id]; return o })({}))) }, style: btn(false) }, isOpen ? '收起' : '查看'),
            h('button', { key: 'edit', onClick: function () { edit(it) }, style: btn(false) }, '编辑'),
            h('button', { key: 'test', onClick: function () { test(it) }, style: btn(false) }, '测试应用'),
            mergeSource && mergeSource !== it.id ? h('button', { key: 'into', onClick: function () { setMergeSource(null); doAction('merge', { targetId: it.id, sourceId: mergeSource }, '合并') }, style: btn(true) }, '合并到此') : null,
            mergeSource !== it.id ? h('button', { key: 'src', onClick: function () { setMergeSource(it.id) }, style: btn(false) }, '设为合并源') : h('span', { key: 'srcsel', style: { fontSize: 12, color: COLORS.accent } }, '已是合并源'),
          ]),
        ])
      }

      function edit(it) {
        var v = window.prompt('编辑解法（' + it.id + '）：', it.solution || it.correctCommand || '')
        if (v === null) return
        doAction('editItem', { id: it.id, solution: v, title: it.title }, '编辑')
      }

      function test(it) {
        api('search', { query: (it.symptom || it.solution || it.title || '') }).then(function (s) {
          var res = (s && s.results) || []
          var text = res.length ? res.map(function (r) { return r.id + '（' + r.confidence + '）' }).join('\n') : '没有命中相关经验'
          window.alert('测试应用结果：\n' + text)
        })
      }

      function record() {
        var text = window.prompt('记录一条经验（报错/命令/偏好/流程/知识原文）：')
        if (!text) return
        var kind = window.prompt('类型（error/command/preference/workflow/domain，留空自动）：')
        doAction('record', { text: text, kind: kind || undefined }, '记录')
      }

      function newCategory() {
        var name = window.prompt('新分类 ID（小写英文/数字/连字符）：')
        if (!name) return
        doAction('createCategory', { name: name, title: name, description: '' }, '新建分类')
      }

      return h('div', { style: { boxSizing: 'border-box', minHeight: '100%', overflow: 'auto', padding: '18px 22px 48px', color: COLORS.primary, fontSize: 13 } }, [
        h('div', { key: 'title', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } }, [
          h('h1', { key: 'h', style: { fontSize: 18, margin: 0 } }, '智能体自学习经验库'),
          h('span', { key: 'm', style: { fontSize: 12, color: COLORS.secondary } }, '档位 ' + (state.mode || 'assisted') + ' · ' + (state.rootDir || '')),
        ]),
        h('div', { key: 'stats', style: { display: 'flex', flexWrap: 'wrap', margin: '-4px' } }, [
          statCard('总条数', stats.total || 0),
          statCard('启用中', stats.totalEnabled || 0, COLORS.ok),
          statCard('成熟 mature', (stats.byStatus && stats.byStatus.mature) || 0, COLORS.ok),
          statCard('候选 candidate', (stats.byStatus && stats.byStatus.candidate) || 0),
          statCard('命中率', stats.hitRate == null ? '—' : (stats.hitRate * 100).toFixed(0) + '%'),
          statCard('冲突数', stats.conflicts || 0, stats.conflicts ? COLORS.danger : undefined),
          statCard('陈旧', stats.stale || 0, stats.stale ? COLORS.warn : undefined),
        ]),
        hadErr ? h('div', { key: 'err', style: { marginTop: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(224,96,85,0.12)', color: COLORS.danger } }, hadErr) : null,
        h('div', { key: 'toolbar', style: { marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' } }, [
          h('input', {
            key: 'q', placeholder: '搜索标题/正文…', value: query,
            onChange: function (e) { setQuery(e.target.value) },
            style: { flex: 1, minWidth: 180, background: COLORS.bg2, border: '1px solid ' + COLORS.border, borderRadius: 6, padding: '6px 10px', color: COLORS.primary, fontSize: 13 },
          }),
          h('button', { key: 'new', onClick: newCategory, style: btn(true) }, '新建分类'),
          h('button', { key: 'rec', onClick: record, style: btn(false) }, '手动新增'),
          h('button', { key: 'reb', onClick: function () { doAction('rebuild', {}, '重建索引') }, style: btn(false) }, '重建索引'),
          h('a', { key: 'exp', href: ROUTE + '/export', style: Object.assign(btn(false), { textDecoration: 'none', display: 'inline-block' }) }, '导出 zip'),
        ]),
        h('div', { key: 'grid', style: { display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' } }, [
          h('div', { key: 'cats', style: { width: 230, flex: '0 0 230px', border: '1px solid ' + COLORS.border, borderRadius: 8, padding: '8px', background: COLORS.bg1, height: 'fit-content' } }, [
            h('div', { key: 'h', style: { fontSize: 11, color: COLORS.tertiary, padding: '0 8px 6px', letterSpacing: 1 } }, '分类'),
            h('div', { key: 'all', onClick: function () { setCategory('') }, style: { padding: '8px 12px', cursor: 'pointer', borderRadius: 6, marginBottom: 2, background: category === '' ? COLORS.bg2 : 'transparent' } }, '全部'),
            cats.map(CatRow),
          ]),
          h('div', { key: 'list', style: { flex: 1, minWidth: 320 } }, [
            h('div', { key: 'h', style: { fontSize: 12, color: COLORS.secondary, marginBottom: 8 } }, (category ? category : '全部') + ' · ' + items.length + ' 条'),
            items.length ? items.map(ItemRow) : h('div', { key: 'empty', style: { color: COLORS.tertiary, padding: 20 } }, '没有匹配条目'),
          ]),
        ]),
        h('div', { key: 'journal', style: { marginTop: 22 } }, [
          h('div', { key: 'h', style: { fontSize: 12, color: COLORS.secondary, marginBottom: 8 } }, '最近变更（可回滚）'),
          (state.journal || []).map(function (j) {
            return h('div', { key: j.seq, style: { display: 'flex', gap: 8, alignItems: 'center', padding: '5px 8px', borderBottom: '1px solid ' + COLORS.border, fontSize: 12, color: COLORS.secondary } }, [
              h('span', { key: 's', style: { fontVariantNumeric: 'tabular-nums', color: COLORS.tertiary, width: 40 } }, '#' + j.seq),
              h('span', { key: 'o', style: { width: 90 } }, j.op),
              h('span', { key: 'i', style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' } }, j.id || ''),
              h('span', { key: 't', style: { color: COLORS.tertiary } }, (j.ts || '').replace('T', ' ').slice(0, 16)),
              j.op !== 'revert' ? h('button', { key: 'r', style: btn(false), onClick: function () { doAction('revert', { seq: j.seq }, '回滚 #' + j.seq) } }, '回滚') : null,
            ])
          }),
        ]),
      ])
    }

    function btn(primary) {
      var base = {
        padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, lineHeight: 1,
        border: '1px solid ' + COLORS.border, background: COLORS.bg2, color: COLORS.primary,
      }
      if (primary) { base.background = COLORS.accent; base.borderColor = COLORS.accent; base.color = '#fff' }
      return base
    }

    function apply(ctx) {
      try { if (!require('react')) return } catch (e) { console.warn('[dsh-experience] 拿不到 react，不注册', e); return }
      try {
        ctx.inject(['desktopWorkbenches'], function (scope) {
          scope.effect(function () {
            return scope.desktopWorkbenches.register({
              title: '经验库',
              description: '智能体自学习经验库：查看、编辑、启用/停用本地沉淀的经验。',
              customFrame: true,
            }, ExperiencePanel)
          }, 'dsh-experience: workbench panel')
        })
        console.info('[dsh-experience] 已注册工作台「经验库」')
      } catch (e) {
        console.warn('[dsh-experience] 工作台面板未注册：', e)
      }
    }

    exports.apply = apply
    exports.inject = ['desktopWorkbenches']
    return module.exports
  },
})
