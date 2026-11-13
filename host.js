/**
 * dsh-experience — host 半侧（工具 + 存储 + 面板路由 + 自动注入）。
 * 依赖 @deepseek-ai/dsh-tools 的 defineTool（DSH 提供），其余仅用 node 内置模块。
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import * as store from './lib/store.js'

export const name = 'dsh-experience'
export const inject = ['tools', 'webServer', 'systemPrompt']

const PLUGIN = 'dsh-experience'
const ROUTE = '/plugins/dsh-experience'
const MAX_BODY = 2 * 1024 * 1024
const RELEVANT_TTL_MS = 10 * 60 * 1000

let runtime = null
let root = null
let lastTrigger = { query: '', result: [], ts: 0 }

function resolveRoot() {
  if (root) return root
  const def = store.resolveRoot(process.env.DSH_EXPERIENCE_ROOT || '~/.dsh/experience')
  try {
    const raw = JSON.parse(readFileSync(join(def, 'settings.json'), 'utf8'))
    root = store.resolveRoot(raw.rootDir) || def
  } catch { root = def }
  return root
}

function ensure() {
  const r = resolveRoot()
  store.ensureStore(r)
  return r
}

function settings() { return store.readSettings(resolveRoot()) }

function asError(e) { return e instanceof Error ? e : new Error(String(e)) }

function resultText(result) {
  const c = result && result.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map((p) => (p && typeof p.text === 'string') ? p.text : JSON.stringify(p)).join(' ').slice(0, 4000)
  return c ? String(c) : ''
}

// ---------------------------------------------------------------------------
// 注入（第八节）
// ---------------------------------------------------------------------------

function buildOverview() {
  try {
    const s = settings()
    if (!s.inject?.enabled || s.mode === 'off' || s.mode === 'readonly') return ''
    const r = resolveRoot()
    const candidates = store.listItems(r, {}).filter((i) => i.enabled && i.categoryEnabled && (i.status === 'mature' || (i.status === 'confirmed' && (i.confidence || 0) >= (s.inject?.minConfidence ?? 0.5))))
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    if (!candidates.length) return ''
    const max = s.inject?.hotMaxLines ?? 80
    const lines = ['经验库概览（dsh-experience，本机沉淀的可复用经验）']
    for (const it of candidates) {
      const sol = (it.solution || it.correctCommand || it.symptom || '').split('\n')[0].slice(0, 72)
      lines.push('- ' + it.id + ' [' + (it.categoryTitle || '') + '] ' + sol)
      if (lines.length >= max) break
    }
    return lines.join('\n')
  } catch { return '' }
}

function buildRelevant() {
  try {
    if (Date.now() - lastTrigger.ts > RELEVANT_TTL_MS) return ''
    const res = lastTrigger.result || []
    if (!res.length) return ''
    const lines = ['相关经验（dsh-experience，命中「' + lastTrigger.query.slice(0, 60) + '」的召回结果）']
    for (const item of res) {
      const warn = item.crossProject ? '⚠ 其他项目经验，请勿盲从 ' : ''
      lines.push('- ' + warn + item.id + '（置信 ' + item.confidence + '）：' + String(item.solution || '').split('\n')[0].slice(0, 90))
    }
    return lines.join('\n')
  } catch { return '' }
}

function onTrigger(query) {
  try {
    const r = resolveRoot()
    const s = settings()
    const cap = s.inject?.recallTopK ?? 5
    const minConf = s.inject?.minConfidence ?? 0.5
    lastTrigger = { query, result: store.searchItems(r, query, cap, minConf), ts: Date.now() }
  } catch (e) {
    runtime?.logger?.warn?.(PLUGIN + ': 触发召回失败 ' + asError(e).message)
  }
}

function onToolResult(exec, result) {
  try {
    if (!(result && result.isError)) return
    const s = settings()
    const text = resultText(result)
    const query = (exec && exec.name ? exec.name + ' ' : '') + (text || '').slice(0, 800)
    onTrigger(query)
    if (s.mode === 'autonomous' && s.inject?.enabled && text) {
      store.recordItem(resolveRoot(), { text: text.slice(0, 4000), scope: 'project' })
    }
  } catch (e) {
    runtime?.logger?.warn?.(PLUGIN + ': 触发检测失败 ' + asError(e).message)
  }
}

// ---------------------------------------------------------------------------
// 工具定义（第六节）
// ---------------------------------------------------------------------------

const STRING_OUT = { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v ?? '') }] }

function registerTools(ctx) {
  const mode = settings().mode || 'assisted'
  const reg = (def) => { try { ctx.tools.register(defineTool(def)) } catch (e) { ctx.logger?.warn?.(PLUGIN + ': 注册工具失败 ' + def.name + '：' + asError(e).message) } }

  if (mode === 'off') return

  reg({
    name: 'exp_record',
    description: '把一条经验记录进本地经验库：报错、不能执行的命令、用户偏好、成功流程或领域知识。自动分类、去重、脱敏并写入 markdown 真相源；相似条目会返回 similar 供合并。',
    parameters: {
      text: { type: 'string', required: true, description: '经验正文或一条报错/命令原文。' },
      kind: { type: 'string', enum: [...store.KINDS], description: '经验类型：error/command/preference/workflow/domain；缺省自动推断。' },
      scope: { type: 'string', enum: [...store.SCOPES], description: '作用域：global/project/session；缺省 global。' },
      title: { type: 'string', description: '短标题；缺省取正文第一行。' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签数组。' },
      category: { type: 'string', description: '目标分类 ID，缺省按 kind 自动归类。' },
      solution: { type: 'string', description: '解法（可选）。' },
      wrongCommand: { type: 'string', description: 'command 类：错误的命令。' },
      correctCommand: { type: 'string', description: 'command 类：正确的命令。' },
      why: { type: 'string', description: 'command 类：为什么。' },
    },
    output: STRING_OUT,
    presentCall: (args) => ({ card: 'generic', kind: 'other', title: '记录经验', rawInput: { text: args.text, kind: args.kind } }),
    execute(args) {
      const r = resolveRoot()
      const out = store.recordItem(r, args)
      return JSON.stringify(out)
    },
  })

  reg({
    name: 'exp_list',
    description: '只读列出经验库条目（含状态/置信度/命中/开关）。',
    parameters: {
      category: { type: 'string', description: '按分类 ID 过滤。' },
      kind: { type: 'string', enum: [...store.KINDS], description: '按类型过滤。' },
      status: { type: 'string', enum: [...store.STATUSES], description: '按成熟度过滤。' },
      enabled: { type: 'boolean', description: '只列启用或停用。' },
      scope: { type: 'string', enum: [...store.SCOPES], description: '按作用域过滤。' },
      query: { type: 'string', description: '关键词过滤。' },
      limit: { type: 'integer', description: '最多返回条数，默认 200。' },
    },
    output: STRING_OUT,
    execute(args) {
      return JSON.stringify(store.listItems(resolveRoot(), args))
    },
  })

  reg({
    name: 'exp_search',
    description: '按相似度召回相关经验摘要（带 id/置信度/作用域标注），供注入与问答使用。',
    parameters: {
      query: { type: 'string', required: true, description: '报错文本、命令或问题描述。' },
      topK: { type: 'integer', description: '返回条数，默认 5。' },
    },
    output: STRING_OUT,
    execute(args) {
      const s = settings()
      return JSON.stringify(store.searchItems(resolveRoot(), args.query, args.topK || s.inject?.recallTopK || 5, s.inject?.minConfidence ?? 0.5))
    },
  })

  reg({
    name: 'exp_stats',
    description: '只读：分类统计、各 status 计数、命中率、冲突数、陈旧数。',
    parameters: {},
    output: STRING_OUT,
    execute() { return JSON.stringify(store.stats(resolveRoot())) },
  })

  reg({
    name: 'exp_categories',
    description: '列出分类，或动态新增/改名分类（建文件夹 + _index.md + 注册进 settings/index）。',
    parameters: {
      action: { type: 'string', enum: ['list', 'create', 'rename'], required: true, description: 'list/create/rename。' },
      name: { type: 'string', description: '分类 ID 或旧分类 ID。' },
      title: { type: 'string', description: 'create 时的显示标题。' },
      description: { type: 'string', description: 'create 时的描述。' },
      newName: { type: 'string', description: 'rename 时的新分类 ID。' },
    },
    output: STRING_OUT,
    execute(args) {
      const m = settings().mode
      if (m === 'readonly' && args.action !== 'list') return JSON.stringify({ ok: false, error: 'readonly 档位只允许 list' })
      if (args.action === 'rename') return JSON.stringify(store.manageCategory(resolveRoot(), 'rename', args.name, args.newName))
      return JSON.stringify(store.manageCategory(resolveRoot(), args.action, args.name, { title: args.title, description: args.description }))
    },
  })

  if (mode === 'readonly') return

  reg({
    name: 'exp_enable',
    description: '启用某条经验或整个分类（分类级开关覆盖该类所有条目）。',
    parameters: { id: { type: 'string', required: true, description: '条目 id（如 errors/xxx）或分类 id。' } },
    output: STRING_OUT,
    execute(args) { return JSON.stringify(store.setEnabled(resolveRoot(), args.id, true)) },
  })

  reg({
    name: 'exp_disable',
    description: '停用某条经验或整个分类；停用的条目不参与注入与召回。',
    parameters: { id: { type: 'string', required: true, description: '条目 id 或分类 id。' } },
    output: STRING_OUT,
    execute(args) { return JSON.stringify(store.setEnabled(resolveRoot(), args.id, false)) },
  })

  reg({
    name: 'exp_merge',
    description: '手动合并两条近似经验：保留高置信者为 master，低者归档。可用 fields 覆盖正文字段。',
    parameters: {
      targetId: { type: 'string', required: true, description: '合并目标条目 id。' },
      sourceId: { type: 'string', required: true, description: '被合并的近似条目 id。' },
      solution: { type: 'string', description: '覆盖解法。' },
      note: { type: 'string', description: '覆盖反例/注意。' },
      title: { type: 'string', description: '覆盖标题。' },
    },
    output: STRING_OUT,
    execute(args) {
      return JSON.stringify(store.mergeItems(resolveRoot(), args.targetId, args.sourceId, { solution: args.solution, note: args.note, title: args.title }))
    },
  })

  reg({
    name: 'exp_revert',
    description: '依 journal.seq 撤销一笔变更；撤销本身也是一条新 journal 记录，不可再次 undo。',
    parameters: { seq: { type: 'integer', required: true, description: '要撤销的 journal 序号。' } },
    output: STRING_OUT,
    execute(args) { return JSON.stringify(store.revert(resolveRoot(), args.seq)) },
  })
}

// ---------------------------------------------------------------------------
// 面板路由（第十二节）
// ---------------------------------------------------------------------------

function buildState() {
  const r = resolveRoot()
  const s = settings()
  return {
    ok: true,
    mode: s.mode,
    rootDir: r,
    inject: s.inject,
    privacy: s.privacy,
    categories: store.listCategories(r),
    items: store.listItems(r, { limit: 500 }),
    stats: store.stats(r),
    conflicts: store.detectConflicts(r),
    journal: store.readJournal(r).slice(-200).reverse(),
  }
}

function editItem(id, patch) {
  const r = resolveRoot()
  const item = store.readItems(r).find((i) => i.meta.id === id)
  if (!item) return { ok: false, error: '找不到条目 ' + id }
  const before = { meta: { ...item.meta }, fields: { ...item.fields } }
  const fieldsMap = { title: null, tags: null, scope: null, solution: '解法', symptom: '现象', cause: '原因', note: '反例 / 注意', correctCommand: '正确命令', wrongCommand: '错误命令', why: '为什么' }
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) continue
    if (key === 'title' || key === 'scope') item.meta[key] = patch[key]
    else if (key === 'tags') item.meta.tags = Array.isArray(patch[key]) ? patch[key].map(String) : []
    else if (fieldsMap[key]) item.fields[fieldsMap[key]] = String(patch[key])
  }
  item.meta.updated = store.nowIso()
  store.writeItem(r, { meta: { ...item.meta }, fields: { ...item.fields } })
  store.appendJournal(r, 'update', id, before, { meta: item.meta, fields: item.fields })
  store.rebuildIndexFile(r)
  return { ok: true, id }
}

function sendJson(res, status, body, headOnly) {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  if (headOnly) { res.end() } else { res.end(text) }
}

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let settled = false, size = 0
    const chunks = []
    const fail = (e) => { if (settled) return; settled = true; rejectBody(e); try { req.destroy() } catch { } }
    req.on('data', (c) => { if (settled) return; size += c.length; if (size > MAX_BODY) return fail(new Error('请求体过大')); chunks.push(c) })
    req.on('end', () => {
      if (settled) return; settled = true
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text.trim()) return resolveBody({})
      try { resolveBody(JSON.parse(text)) } catch { rejectBody(new Error('请求体必须是 JSON 对象')) }
    })
    req.on('error', (e) => fail(e))
  })
}

function applyPanelAction(body) {
  const r = resolveRoot()
  const a = String(body.action || '')
  if (a === 'list') return buildState()
  if (a === 'toggleItem') return { ...buildState(), turned: store.setEnabled(r, body.id, body.enabled !== false) }
  if (a === 'toggleCategory') return { ...buildState(), turned: store.setEnabled(r, body.id, body.enabled !== false) }
  if (a === 'createCategory') return { ...buildState(), created: store.manageCategory(r, 'create', body.name, { title: body.title, description: body.description }) }
  if (a === 'renameCategory') return { ...buildState(), renamed: store.manageCategory(r, 'rename', body.name, body.newName) }
  if (a === 'editItem') return { ...buildState(), edited: editItem(body.id, body) }
  if (a === 'merge') return { ...buildState(), merged: store.mergeItems(r, body.targetId, body.sourceId, {}) }
  if (a === 'revert') return { ...buildState(), reverted: store.revert(r, body.seq) }
  if (a === 'record') return { ...buildState(), recorded: store.recordItem(r, body) }
  if (a === 'search') return { ok: true, results: store.searchItems(r, body.query, 20, 0) }
  if (a === 'rebuild') return { ...buildState(), rebuilt: store.rebuildIndexFile(r) }
  return { ok: false, error: '未知操作 ' + (a || '(空)') }
}

// --- 极简 STORE zip（无压缩、带 UTF-8 文件名与 crc32） ---
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c } return t })()
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

function walkFiles(dir, prefix, out) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walkFiles(full, prefix + name + '/', out)
    else out.push({ name: prefix + name, path: full })
  }
}

function makeZip(entries) {
  const local = [], central = []
  let offset = 0
  for (const e of entries) {
    const data = readFileSync(e.path)
    const nameBuf = Buffer.from(e.name, 'utf8')
    const crc = crc32(data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8)
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18)
    lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28)
    local.push(lh, nameBuf, data)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14); ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36)
    ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42)
    central.push(ch, nameBuf)
    offset += lh.length + nameBuf.length + data.length
  }
  const centralOffset = offset
  const centralSize = central.reduce((s, b) => s + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralSize, 12); eocd.writeUInt32LE(centralOffset, 16); eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...local, ...central, eocd])
}

function mountRoutes(ctx) {
  const server = ctx.webServer
  if (!server || typeof server.register !== 'function') { ctx.logger?.warn?.(PLUGIN + ': 没有 webServer，面板路由未挂载'); return }
  const guard = (label, handler) => (req, res) => {
    Promise.resolve().then(() => handler(req, res)).catch((e) => {
      const status = 500
      ctx.logger?.error?.(PLUGIN + ': ' + label + ' 失败', asError(e))
      if (!res.headersSent) sendJson(res, status, { error: 'internal', message: asError(e).message })
      else { try { res.end() } catch { } }
    })
  }
  ctx.effect(() => {
    const offState = server.register({ kind: 'exact', path: ROUTE + '/state', handler: guard('state', (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method_not_allowed' })
      sendJson(res, 200, buildState(), req.method === 'HEAD')
    }) })
    const offAction = server.register({ kind: 'exact', path: ROUTE + '/action', handler: guard('action', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' })
      const body = await readJsonBody(req)
      sendJson(res, 200, applyPanelAction(body))
    }) })
    const offExport = server.register({ kind: 'exact', path: ROUTE + '/export', handler: guard('export', (req, res) => {
      const files = []
      walkFiles(resolveRoot(), '', files)
      const zip = makeZip(files)
      res.statusCode = 200
      res.setHeader('content-type', 'application/zip')
      res.setHeader('content-disposition', 'attachment; filename="dsh-experience.zip"')
      res.end(zip)
    }) })
    return () => { try { offState?.() } catch { } try { offAction?.() } catch { } try { offExport?.() } catch { } }
  }, PLUGIN + ': routes')
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

export function apply(ctx) {
  try {
    runtime = ctx
    ensure()
    registerTools(ctx)

    const mode = settings().mode || 'assisted'
    if (mode !== 'off' && settings().inject?.enabled && ctx.systemPrompt && typeof ctx.systemPrompt.section === 'function') {
      ctx.effect(() => {
        const offOverview = ctx.systemPrompt.section({ name: 'experience:overview', order: 2300, text: () => buildOverview(), interpolate: false })
        const offRelevant = ctx.systemPrompt.section({ name: 'experience:relevant', order: 2200, text: () => buildRelevant(), interpolate: false })
        return () => { try { offOverview?.() } catch { } try { offRelevant?.() } catch { } }
      }, PLUGIN + ': prompt sections')
    }

    if (typeof ctx.on === 'function') {
      ctx.effect(() => {
        const off = ctx.on('tools/result', onToolResult)
        return () => { try { off?.() } catch { } }
      }, PLUGIN + ': tools/result')
    }

    mountRoutes(ctx)
    ctx.logger?.info?.(PLUGIN + ': 就绪（' + resolveRoot() + '，档位 ' + (settings().mode || 'assisted') + '）')
  } catch (e) {
    try { ctx.logger?.error?.(PLUGIN + ': 初始化失败', asError(e)) } catch { }
  }
}
