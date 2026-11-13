/**
 * dsh-experience — 浏览器半侧（工作台可视化面板）。
 * 数据经 host 的只读 HTTP 路由读取，写操作只回传指令；前端不直接改文件。
 * 注意：Electron 不支持 window.prompt/alert，所有输入与提示都用内嵌弹窗实现。
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
    var STYLE_ID = NS + '-style'

    var C = {
      primary: 'var(--dsw-alias-label-primary)',
      secondary: 'var(--dsw-alias-label-secondary)',
      tertiary: 'var(--dsw-alias-label-tertiary)',
      bg1: 'var(--dsw-alias-bg-layer-1)',
      bg2: 'var(--dsw-alias-bg-layer-2)',
      bgBase: 'var(--dsw-alias-bg-base)',
      border: 'var(--dsw-alias-border-l1)',
      business: 'var(--dsw-alias-state-business-primary)',
      ok: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      danger: 'var(--dsw-alias-state-error-primary)',
    }

    function ensureStyle() {
      if (typeof document === 'undefined' || !document.head) return
      if (document.getElementById(STYLE_ID)) return
      var css = [
        '.dx-btn{box-sizing:border-box;display:inline-flex;align-items:center;gap:4px;padding:6px 11px;border-radius:7px;',
        'font-size:12px;line-height:1;cursor:pointer;white-space:nowrap;',
        'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);',
        'color:var(--dsw-alias-label-primary);transition:background .12s ease,border-color .12s ease;font-family:inherit}',
        '.dx-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
        '.dx-btn:disabled{opacity:.45;cursor:not-allowed}',
        '.dx-btn-primary{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-state-business-primary));',
        'border-color:transparent;color:var(--dsw-alias-label-primary-inverted)}',
        '.dx-btn-primary:hover{background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-state-business-primary))}',
        '.dx-input,.dx-textarea,.dx-select{box-sizing:border-box;width:100%;padding:7px 10px;border-radius:7px;font-size:13px;',
        'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);',
        'border:1px solid var(--dsw-alias-border-l1);outline:none;font-family:inherit}',
        '.dx-input:focus,.dx-textarea:focus,.dx-select:focus{border-color:var(--dsw-alias-state-business-primary)}',
        '.dx-textarea{resize:vertical;min-height:78px;line-height:1.6}',
        '.dx-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;',
        'padding:24px;background:var(--dsw-alias-bg-overlay,rgba(0,0,0,.48))}',
        '.dx-card{box-sizing:border-box;width:min(600px,94vw);max-height:86vh;overflow:auto;padding:18px 20px 16px;',
        'border-radius:12px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);',
        'color:var(--dsw-alias-label-primary);box-shadow:0 16px 48px rgba(0,0,0,.35)}',
        '.dx-label{font-size:12px;color:var(--dsw-alias-label-secondary);margin:10px 0 4px}',
        '.dx-badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;line-height:17px;',
        'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);margin-right:6px;white-space:nowrap}',
        '.dx-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
        '.dx-muted{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
        '.dx-item{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:10px 12px;margin-bottom:8px;background:var(--dsw-alias-bg-layer-1)}',
        '.dx-cat{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 11px;border-radius:7px;cursor:pointer;font-size:13px}',
        '.dx-cat:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      ].join('')
      var el = document.createElement('style')
      el.id = STYLE_ID
      el.textContent = css
      document.head.appendChild(el)
    }

    function api(action, body) {
      return fetch(ROUTE + '/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.assign({ action: action }, body || {})),
      }).then(function (r) { return r.json() })
    }

    function Badge(props) {
      return h('span', { className: 'dx-badge', style: props.color ? { color: props.color, borderColor: props.color } : undefined }, props.children)
    }

    function Btn(props) {
      return h('button', {
        className: 'dx-btn' + (props.primary ? ' dx-btn-primary' : ''),
        disabled: props.disabled,
        onClick: props.onClick,
        title: props.title,
        style: props.style,
      }, props.children)
    }

    function StatCard(props) {
      return h('div', {
        style: { flex: 1, minWidth: 104, background: C.bg2, borderRadius: 9, padding: '10px 13px', margin: 4, border: '1px solid ' + C.border },
      }, [
        h('div', { key: 'v', style: { fontSize: 19, fontWeight: 600, color: props.color || C.primary } }, props.value),
        h('div', { key: 'l', style: { fontSize: 12, color: C.secondary, marginTop: 2 } }, props.label),
      ])
    }

    function Field(props) {
      return h('div', null, [
        h('div', { key: 'l', className: 'dx-label' }, props.label),
        props.children,
      ])
    }

    function Modal(props) {
      return h('div', {
        className: 'dx-overlay',
        onMouseDown: function (e) { if (e.target === e.currentTarget && props.onClose) props.onClose() },
      }, h('div', { className: 'dx-card' }, [
        h('div', { key: 'h', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 } }, [
          h('div', { key: 't', style: { fontSize: 15, fontWeight: 600 } }, props.title),
          h(Btn, { key: 'x', onClick: props.onClose, title: '关闭' }, '关闭'),
        ]),
        h('div', { key: 'b' }, props.children),
      ]))
    }

    function ExperiencePanel() {
      var dataHook = React.useState(null); var data = dataHook[0]; var setData = dataHook[1]
      var catHook = React.useState(''); var category = catHook[0]; var setCategory = catHook[1]
      var qHook = React.useState(''); var query = qHook[0]; var setQuery = qHook[1]
      var mergeHook = React.useState(null); var mergeSource = mergeHook[0]; var setMergeSource = mergeHook[1]
      var noticeHook = React.useState(null); var notice = noticeHook[0]; var setNotice = noticeHook[1]
      var modalHook = React.useState(null); var modal = modalHook[0]; var setModal = modalHook[1]
      var openHook = React.useState({}); var open = openHook[0]; var setOpen = openHook[1]
      var testHook = React.useState(null); var testResult = testHook[0]; var setTestResult = testHook[1]

      React.useEffect(function () { ensureStyle() }, [])

      React.useEffect(function () {
        var alive = true
        fetch(ROUTE + '/state', { cache: 'no-store' })
          .then(function (r) { return r.json() })
          .then(function (s) { if (alive) setData(s) })
          .catch(function (e) { if (alive) setNotice({ kind: 'err', text: '加载失败：' + String(e && e.message || e) }) })
        return function () { alive = false }
      }, [])

      function run(action, body, okText) {
        setNotice(null)
        api(action, body).then(function (s) {
          if (!s || s.ok === false) { setNotice({ kind: 'err', text: (s && s.error) || '操作失败' }); return }
          setData(s)
          if (okText) setNotice({ kind: 'ok', text: okText })
        }).catch(function (e) { setNotice({ kind: 'err', text: String(e && e.message || e) }) })
      }

      if (!data) return h('div', { style: { padding: 28, color: C.secondary } }, '加载经验库…')

      var cats = data.categories || []
      var stats = data.stats || {}
      var allItems = data.items || []

      var q = String(query || '').toLowerCase()
      var items = allItems.filter(function (i) {
        if (category && i.category !== category) return false
        if (!q) return true
        return (i.title + ' ' + (i.solution || '') + ' ' + (i.symptom || '') + ' ' + (i.id || '')).toLowerCase().indexOf(q) >= 0
      })

      function toggleOpen(id) {
        var next = Object.assign({}, open)
        next[id] = !next[id]
        setOpen(next)
      }

      function openEdit(it) {
        setModal({
          type: 'edit',
          id: it.id,
          title: it.title || '',
          symptom: it.symptom || '',
          solution: it.solution || it.correctCommand || '',
          cause: it.cause || '',
          note: it.note || '',
        })
      }

      function openTest(it) {
        var text = [it.symptom, it.solution, it.title].filter(Boolean).join(' ')
        api('search', { query: text }).then(function (s) {
          setTestResult({ id: it.id, results: (s && s.results) || [] })
        }).catch(function (e) { setNotice({ kind: 'err', text: String(e && e.message || e) }) })
      }

      function CatRow(c) {
        var selected = category === c.id
        return h('div', {
          key: c.id,
          className: 'dx-cat',
          onClick: function () { setCategory(selected ? '' : c.id) },
          style: { background: selected ? C.bg2 : 'transparent', color: c.enabled === false ? C.tertiary : C.primary },
        }, [
          h('span', { key: 't', style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, c.title || c.id),
          h('input', {
            key: 'c', type: 'checkbox', checked: c.enabled !== false, title: '启用/停用分类',
            onClick: function (e) { e.stopPropagation() },
            onChange: function (e) {
              e.stopPropagation()
              run('toggleCategory', { id: c.id, enabled: e.target.checked }, '分类「' + (c.title || c.id) + '」已' + (e.target.checked ? '启用' : '停用'))
            },
          }),
        ])
      }

      function ItemRow(it) {
        var isOpen = !!open[it.id]
        var conflicted = (data.conflicts || []).some(function (p) { return p.a === it.id || p.b === it.id })
        var isSource = mergeSource === it.id
        return h('div', { key: it.id, className: 'dx-item' }, [
          h('div', { key: 'h', className: 'dx-row' }, [
            h('span', {
              key: 't',
              onClick: function () { openEdit(it) },
              title: it.id + '（点击编辑）',
              style: { fontWeight: 600, fontSize: 13, color: it.enabled ? C.primary : C.tertiary, flex: 1, minWidth: 120, cursor: 'pointer' },
            }, it.title || it.id),
            h(Badge, { key: 's', color: it.status === 'mature' ? C.ok : it.status === 'confirmed' ? C.business : undefined }, it.status || 'candidate'),
            h(Badge, { key: 'c' }, '置信 ' + (typeof it.confidence === 'number' ? it.confidence : '-')),
            h(Badge, { key: 'h2' }, '命中 ' + (it.hits || 0)),
            it.stale ? h(Badge, { key: 'st', color: C.warn }, '建议归档') : null,
            conflicted ? h(Badge, { key: 'cf', color: C.danger }, '冲突') : null,
            h('input', {
              key: 'e', type: 'checkbox', checked: it.enabled !== false, title: '启用/停用该条',
              onChange: function (e) { run('toggleItem', { id: it.id, enabled: e.target.checked }, (e.target.checked ? '已启用 ' : '已停用 ') + it.id) },
            }),
          ]),
          h('div', { key: 'b', style: { color: C.secondary, fontSize: 12, marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } },
            (it.symptom || '').slice(0, 160) + ((it.symptom || '').length > 160 ? '…' : '')),
          isOpen ? h('div', { key: 'o', style: { marginTop: 8, borderTop: '1px solid ' + C.border, paddingTop: 8, fontSize: 12, color: C.secondary, lineHeight: 1.75, whiteSpace: 'pre-wrap' } }, [
            h('div', { key: 's' }, '解法：' + (it.solution || it.correctCommand || '（无）')),
            it.cause ? h('div', { key: 'c' }, '原因：' + it.cause) : null,
            it.note ? h('div', { key: 'n' }, '注意：' + it.note) : null,
            h('div', { key: 'i', style: { color: C.tertiary, marginTop: 4 } }, 'id：' + it.id),
          ]) : null,
          h('div', { key: 'a', className: 'dx-row', style: { marginTop: 8 } }, [
            h(Btn, { key: 'open', onClick: function () { toggleOpen(it.id) } }, isOpen ? '收起' : '查看'),
            h(Btn, { key: 'edit', onClick: function () { openEdit(it) } }, '编辑'),
            h(Btn, { key: 'test', onClick: function () { openTest(it) } }, '测试应用'),
            isSource
              ? h(Btn, { key: 'src', primary: true, onClick: function () { setMergeSource(null) } }, '已选为合并源')
              : h(Btn, { key: 'dst', onClick: function () { setMergeSource(it.id); setNotice({ kind: 'ok', text: '已把 ' + it.id + ' 设为合并源，再点另一个条目的「合并到此」' }) } }, '设为合并源'),
            mergeSource && mergeSource !== it.id
              ? h(Btn, { key: 'into', primary: true, onClick: function () { run('merge', { targetId: it.id, sourceId: mergeSource }, '已把 ' + mergeSource + ' 合并到 ' + it.id); setMergeSource(null) } }, '合并到此')
              : null,
          ]),
        ])
      }

      var modalEl = null
      if (modal && modal.type === 'record') {
        modalEl = h(Modal, { title: '手动新增经验', onClose: function () { setModal(null) } }, [
          h(Field, { key: 't', label: '内容（必填，可粘贴一段报错或命令）' },
            h('textarea', {
              key: 'i', className: 'dx-textarea', value: modal.text || '',
              onChange: function (e) { setModal(Object.assign({}, modal, { text: e.target.value })) },
              placeholder: '例如：pip install 报 ssl certificate verify failed',
            })),
          h(Field, { key: 'k', label: '类型（留空自动判断）' },
            h('select', {
              key: 's', className: 'dx-select', value: modal.kind || '',
              onChange: function (e) { setModal(Object.assign({}, modal, { kind: e.target.value })) },
            }, [
              h('option', { key: '', value: '' }, '自动判断'),
              h('option', { key: 'error', value: 'error' }, 'error（报错）'),
              h('option', { key: 'command', value: 'command' }, 'command（不能执行的命令）'),
              h('option', { key: 'preference', value: 'preference' }, 'preference（用户偏好）'),
              h('option', { key: 'workflow', value: 'workflow' }, 'workflow（成功流程）'),
              h('option', { key: 'domain', value: 'domain' }, 'domain（领域知识）'),
            ])),
          h(Field, { key: 'c', label: '分类（留空按类型自动归类）' },
            h('select', {
              key: 's', className: 'dx-select', value: modal.category || '',
              onChange: function (e) { setModal(Object.assign({}, modal, { category: e.target.value })) },
            }, [h('option', { key: '', value: '' }, '自动归类')].concat(cats.map(function (c) {
              return h('option', { key: c.id, value: c.id }, (c.title || c.id) + '（' + c.id + '）')
            })))),
          h(Field, { key: 'ti', label: '标题（可选）' },
            h('input', {
              key: 'i', className: 'dx-input', value: modal.title || '',
              onChange: function (e) { setModal(Object.assign({}, modal, { title: e.target.value })) },
            })),
          h(Field, { key: 'so', label: '解法（可选）' },
            h('textarea', {
              key: 'i', className: 'dx-textarea', style: { minHeight: 56 }, value: modal.solution || '',
              onChange: function (e) { setModal(Object.assign({}, modal, { solution: e.target.value })) },
            })),
          h('div', { key: 'f', className: 'dx-row', style: { justifyContent: 'flex-end', marginTop: 16 } }, [
            h(Btn, { key: 'c', onClick: function () { setModal(null) } }, '取消'),
            h(Btn, {
              key: 's', primary: true,
              onClick: function () {
                if (!String(modal.text || '').trim()) { setNotice({ kind: 'err', text: '内容不能为空' }); return }
                var body = { text: modal.text.trim() }
                if (modal.kind) body.kind = modal.kind
                if (modal.category) body.category = modal.category
                if (modal.title) body.title = modal.title
                if (modal.solution) body.solution = modal.solution
                run('record', body, '已记录')
                setModal(null)
              },
            }, '保存'),
          ]),
        ])
      } else if (modal && modal.type === 'category') {
        modalEl = h(Modal, { title: '新建分类', onClose: function () { setModal(null) } }, [
          h(Field, { key: 'i', label: '分类 ID（小写英文字母/数字/连字符，如 my-area）' },
            h('input', {
              key: 'i', className: 'dx-input', value: modal.name || '', placeholder: 'my-area',
              onChange: function (e) { setModal(Object.assign({}, modal, { name: e.target.value })) },
            })),
          h(Field, { key: 't', label: '显示标题' },
            h('input', {
              key: 'i', className: 'dx-input', value: modal.title || '', placeholder: '我的领域知识',
              onChange: function (e) { setModal(Object.assign({}, modal, { title: e.target.value })) },
            })),
          h(Field, { key: 'd', label: '一句话描述' },
            h('input', {
              key: 'i', className: 'dx-input', value: modal.description || '',
              onChange: function (e) { setModal(Object.assign({}, modal, { description: e.target.value })) },
            })),
          h('div', { key: 'f', className: 'dx-row', style: { justifyContent: 'flex-end', marginTop: 16 } }, [
            h(Btn, { key: 'c', onClick: function () { setModal(null) } }, '取消'),
            h(Btn, {
              key: 's', primary: true,
              onClick: function () {
                var name = String(modal.name || '').trim()
                if (!name) { setNotice({ kind: 'err', text: '分类 ID 不能为空' }); return }
                run('createCategory', { name: name, title: modal.title || name, description: modal.description || '' }, '已新建分类 ' + name)
                setModal(null)
              },
            }, '创建'),
          ]),
        ])
      } else if (modal && modal.type === 'edit') {
        modalEl = h(Modal, { title: '编辑 ' + modal.id, onClose: function () { setModal(null) } }, [
          h(Field, { key: 't', label: '标题' },
            h('input', {
              key: 'i', className: 'dx-input', value: modal.title || '',
              onChange: function (e) { setModal(Object.assign({}, modal, { title: e.target.value })) },
            })),
          h(Field, { key: 'sy', label: '现象' },
            h('textarea', {
              key: 'i', className: 'dx-textarea', value: modal.symptom || '',
              onChange: function (e) { setModal(Object.assign({}, modal, { symptom: e.target.value })) },
            })),
          h(Field, { key: 'so', label: '解法' },
            h('textarea', {
              key: 'i', className: 'dx-textarea', value: modal.solution || '',
              onChange: function (e) { setModal(Object.assign({}, modal, { solution: e.target.value })) },
            })),
          h(Field, { key: 'ca', label: '原因' },
            h('textarea', {
              key: 'i', className: 'dx-textarea', style: { minHeight: 56 }, value: modal.cause || '',
              onChange: function (e) { setModal(Object.assign({}, modal, { cause: e.target.value })) },
            })),
          h(Field, { key: 'no', label: '反例 / 注意' },
            h('textarea', {
              key: 'i', className: 'dx-textarea', style: { minHeight: 56 }, value: modal.note || '',
              onChange: function (e) { setModal(Object.assign({}, modal, { note: e.target.value })) },
            })),
          h('div', { key: 'f', className: 'dx-row', style: { justifyContent: 'flex-end', marginTop: 16 } }, [
            h(Btn, { key: 'c', onClick: function () { setModal(null) } }, '取消'),
            h(Btn, {
              key: 's', primary: true,
              onClick: function () {
                run('editItem', {
                  id: modal.id, title: modal.title, symptom: modal.symptom,
                  solution: modal.solution, cause: modal.cause, note: modal.note,
                }, '已保存 ' + modal.id)
                setModal(null)
              },
            }, '保存'),
          ]),
        ])
      } else if (testResult) {
        var res = testResult.results || []
        modalEl = h(Modal, { title: '测试应用：' + testResult.id, onClose: function () { setTestResult(null) } }, [
          h('div', { key: 'i', className: 'dx-muted', style: { marginTop: 8 } }, '用该条内容做一次召回，结果如下：'),
          h('div', { key: 'l', style: { marginTop: 10 } }, res.length
            ? res.map(function (r) {
              return h('div', { key: r.id, style: { padding: '7px 0', borderBottom: '1px solid ' + C.border, fontSize: 12.5 } }, [
                h('div', { key: 't', style: { fontWeight: 600 } }, r.id + '（置信 ' + r.confidence + '，得分 ' + r.score + '）'),
                h('div', { key: 's', style: { color: C.secondary, marginTop: 2 } }, (r.solution || '').slice(0, 120)),
                r.crossProject ? h('div', { key: 'w', style: { color: C.warn, marginTop: 2 } }, '⚠ 其他项目经验，请勿盲从') : null,
              ])
            })
            : h('div', { key: 'e', className: 'dx-muted' }, '没有召回任何条目')),
          h('div', { key: 'f', className: 'dx-row', style: { justifyContent: 'flex-end', marginTop: 16 } }, [
            h(Btn, { key: 'c', primary: true, onClick: function () { setTestResult(null) } }, '知道了'),
          ]),
        ])
      }

      return h('div', {
        style: { boxSizing: 'border-box', minHeight: '100%', overflow: 'auto', padding: '18px 22px 48px', color: C.primary, fontSize: 13, background: C.bgBase },
      }, [
        h('div', { key: 'title', style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 } }, [
          h('h1', { key: 'h', style: { fontSize: 18, margin: 0, fontWeight: 600 } }, '智能体自学习经验库'),
          h('span', { key: 'm', className: 'dx-muted' }, '档位 ' + (data.mode || 'assisted') + ' · ' + (data.rootDir || '')),
        ]),
        h('div', { key: 'stats', style: { display: 'flex', flexWrap: 'wrap', margin: '-4px' } }, [
          h(StatCard, { key: 'a', label: '总条数', value: stats.total || 0 }),
          h(StatCard, { key: 'b', label: '启用中', value: stats.totalEnabled || 0, color: C.ok }),
          h(StatCard, { key: 'c', label: '成熟 mature', value: (stats.byStatus && stats.byStatus.mature) || 0, color: C.ok }),
          h(StatCard, { key: 'd', label: '候选 candidate', value: (stats.byStatus && stats.byStatus.candidate) || 0 }),
          h(StatCard, { key: 'e', label: '命中率', value: stats.hitRate == null ? '—' : (stats.hitRate * 100).toFixed(0) + '%' }),
          h(StatCard, { key: 'f', label: '冲突数', value: stats.conflicts || 0, color: stats.conflicts ? C.danger : undefined }),
          h(StatCard, { key: 'g', label: '陈旧', value: stats.stale || 0, color: stats.stale ? C.warn : undefined }),
        ]),
        notice ? h('div', {
          key: 'n',
          style: {
            marginTop: 10, padding: '8px 12px', borderRadius: 7, fontSize: 12.5,
            background: notice.kind === 'err' ? 'rgba(224,96,85,.12)' : 'rgba(76,175,125,.12)',
            color: notice.kind === 'err' ? C.danger : C.ok,
            border: '1px solid ' + (notice.kind === 'err' ? C.danger : C.ok),
          },
        }, notice.text) : null,
        h('div', { key: 'toolbar', className: 'dx-row', style: { marginTop: 14 } }, [
          h('input', {
            key: 'q', className: 'dx-input', placeholder: '搜索标题 / 正文…', value: query,
            style: { flex: 1, minWidth: 190 },
            onChange: function (e) { setQuery(e.target.value) },
          }),
          h(Btn, { key: 'new', onClick: function () { setModal({ type: 'category', name: '', title: '', description: '' }) } }, '新建分类'),
          h(Btn, { key: 'rec', onClick: function () { setModal({ type: 'record', text: '', kind: '', category: '', title: '', solution: '' }) } }, '手动新增'),
          h(Btn, { key: 'reb', onClick: function () { run('rebuild', {}, '已重建索引') } }, '重建索引'),
          h('a', {
            key: 'exp', href: ROUTE + '/export', className: 'dx-btn',
            style: { textDecoration: 'none' }, title: '导出全部经验为 zip',
          }, '导出 zip'),
        ]),
        h('div', { key: 'grid', style: { display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap', alignItems: 'flex-start' } }, [
          h('div', {
            key: 'cats',
            style: { width: 230, flex: '0 0 230px', border: '1px solid ' + C.border, borderRadius: 10, padding: 8, background: C.bg1 },
          }, [
            h('div', { key: 'h', className: 'dx-muted', style: { padding: '2px 8px 6px', letterSpacing: 1 } }, '分类'),
            h('div', {
              key: 'all', className: 'dx-cat',
              onClick: function () { setCategory('') },
              style: { background: category === '' ? C.bg2 : 'transparent' },
            }, '全部（' + allItems.length + '）'),
            cats.map(CatRow),
          ]),
          h('div', { key: 'list', style: { flex: 1, minWidth: 320 } }, [
            h('div', { key: 'h', className: 'dx-muted', style: { marginBottom: 8 } }, (category || '全部') + ' · ' + items.length + ' 条'),
            items.length ? items.map(ItemRow) : h('div', { key: 'empty', className: 'dx-muted', style: { padding: 20 } }, '没有匹配条目'),
          ]),
        ]),
        h('div', { key: 'journal', style: { marginTop: 22 } }, [
          h('div', { key: 'h', className: 'dx-muted', style: { marginBottom: 8 } }, '最近变更（可回滚）'),
          (data.journal || []).map(function (j) {
            return h('div', {
              key: j.seq,
              style: { display: 'flex', gap: 8, alignItems: 'center', padding: '5px 8px', borderBottom: '1px solid ' + C.border, fontSize: 12, color: C.secondary },
            }, [
              h('span', { key: 's', style: { fontVariantNumeric: 'tabular-nums', color: C.tertiary, width: 42 } }, '#' + j.seq),
              h('span', { key: 'o', style: { width: 96 } }, j.op),
              h('span', { key: 'i', style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, j.id || ''),
              h('span', { key: 't', style: { color: C.tertiary } }, (j.ts || '').replace('T', ' ').slice(0, 16)),
              j.op !== 'revert'
                ? h(Btn, { key: 'r', onClick: function () { run('revert', { seq: j.seq }, '已回滚 #' + j.seq) } }, '回滚')
                : h('span', { key: 'r', className: 'dx-muted' }, '已回滚'),
            ])
          }),
        ]),
        modalEl,
      ])
    }

    function apply(ctx) {
      try {
        if (!require('react')) return
      } catch (e) {
        console.warn('[dsh-experience] 拿不到 react，不注册', e)
        return
      }
      ensureStyle()
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
