/**
 * dsh-experience — 存储引擎（零运行时依赖）。
 * markdown 真相源 + 可重建 index.json + append-only journal.jsonl。
 * 本模块只依赖 node 内置模块，可脱离 DSH 独立单元测试。
 * 所有写入均为同步原子写（临时文件 + rename），单进程串行执行保证互斥。
 */

import {
  existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync,
  renameSync, unlinkSync, rmSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const VERSION = 1
export const KINDS = ['error', 'command', 'preference', 'workflow', 'domain']
export const SCOPES = ['global', 'project', 'session']
export const STATUSES = ['candidate', 'confirmed', 'mature', 'disabled', 'archived']
export const MODES = ['off', 'readonly', 'assisted', 'autonomous']
export const STALE_DAYS = 90

export const DEFAULT_CATEGORY_DEFS = [
  { id: 'errors', title: '报错类经验', description: '运行、构建、安装等报错的现象、原因与解法', order: 1 },
  { id: 'failed-commands', title: '不能执行的命令', description: '执行失败或不可用的命令及其正确写法', order: 2 },
  { id: 'preferences', title: '用户偏好', description: '用户明确表达的风格、习惯与长期偏好', order: 3 },
  { id: 'workflows', title: '成功流程', description: '可复用的成功操作步骤与流程', order: 4 },
  { id: 'domain', title: '领域知识', description: '项目或业务领域的专门知识', order: 5 },
]

const BODY_LABELS = ['现象', '原因', '解法', '反例 / 注意', '错误命令', '正确命令', '为什么']

const SECRET_PATTERNS = [
  { name: 'apiKey', re: /(?:api[_-]?key|apikey|access[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_\-.\/+=]{8,}/gi },
  { name: 'bearer', re: /\bbearer\s+[A-Za-z0-9_\-.\/+=]{16,}/gi },
  { name: 'credential', re: /\b(?:token|secret|password|passwd|pwd)\b\s*[:=]\s*["']?[^\s"'，。;；]{6,}/gi },
  { name: 'openai', re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: 'cnId', re: /\b[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g },
  { name: 'creditCard', re: /\b(?:\d[ -]?){13,19}\b/g },
]

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

export function nowIso() { return new Date().toISOString() }

export function expandHome(input) {
  const s = String(input ?? '').trim()
  if (s === '~') return homedir()
  if (s.startsWith('~/')) return join(homedir(), s.slice(2))
  return s
}

export function resolveRoot(input) {
  const s = expandHome(input || '')
  return s || join(homedir(), '.dsh', 'experience')
}

export function slugify(text) {
  const s = String(text ?? '').normalize('NFKC')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80)
  return s || 'untitled'
}

export function sanitizeCategoryId(text) {
  return String(text ?? '').toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function atomicWrite(file, text) {
  const dir = dirname(file)
  mkdirSync(dir, { recursive: true })
  const tmp = join(dir, '.tmp-' + randomUUID())
  writeFileSync(tmp, text, 'utf8')
  try { renameSync(tmp, file) } catch (error) {
    try { unlinkSync(tmp) } catch { /* 忽略 */ }
    throw error
  }
}

// ---------------------------------------------------------------------------
// frontmatter 与正文
// ---------------------------------------------------------------------------

function parseScalar(val) {
  if (val === '') return ''
  if (val[0] === '[' && val[val.length - 1] === ']') {
    return val.slice(1, -1).split(',').map((s) => s.trim()).filter((s) => s !== '')
  }
  if (val === 'true') return true
  if (val === 'false') return false
  if (val === 'null') return null
  if (/^-?\d+(\.\d+)?$/.test(val)) return Number(val)
  return val
}

export function parseFrontmatter(text) {
  const meta = {}
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { meta, body: text }
  const body = text.slice(m[0].length)
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const val = parseScalar(line.slice(idx + 1).trim())
    if (val !== undefined) meta[key] = val
  }
  return { meta, body }
}

function escStr(s) {
  return String(s).replace(/\r?\n/g, ' ').replace(/"/g, "'").replace(/:/g, '：').trim()
}

export function serializeFrontmatter(meta) {
  const order = ['id', 'kind', 'scope', 'status', 'enabled', 'confidence', 'hits', 'successes', 'tags', 'title', 'created', 'updated', 'lastSeen']
  const lines = ['---']
  const all = []
  for (const key of order) if (key in meta) all.push([key, meta[key]])
  for (const key of Object.keys(meta)) if (!order.includes(key)) all.push([key, meta[key]])
  for (const [key, val] of all) {
    if (Array.isArray(val)) lines.push(key + ': [' + val.map((s) => escStr(String(s))).join(', ') + ']')
    else if (typeof val === 'string') lines.push(key + ': ' + escStr(val))
    else lines.push(key + ': ' + JSON.stringify(val))
  }
  lines.push('---')
  return lines.join('\n') + '\n'
}

export function parseBody(text) {
  const fields = {}
  const labelRe = new RegExp('^(?:' + BODY_LABELS.join('|') + ')：')
  const lines = String(text).split(/\r?\n/)
  let current = null
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    const m = line.match(labelRe)
    if (m) {
      current = m[0].slice(0, -1)
      fields[current] = line.slice(m[0].length).trim()
    } else if (current) {
      fields[current] = (fields[current] ? fields[current] + '\n' : '') + line
    }
  }
  for (const key of Object.keys(fields)) fields[key] = fields[key].trim()
  return fields
}

export function serializeBody(fields) {
  const labels = []
  for (const label of BODY_LABELS) if (fields[label]) labels.push(label)
  for (const key of Object.keys(fields)) if (!BODY_LABELS.includes(key) && fields[key]) labels.push(key)
  const parts = []
  for (const label of labels) parts.push(label + '：' + String(fields[label]).replace(/\r?\n/g, '\n').replace(/\n+$/, ''))
  return parts.join('\n\n') + '\n'
}

// ---------------------------------------------------------------------------
// 路径与目录
// ---------------------------------------------------------------------------

function catDir(rootDir, cat) { return join(rootDir, 'categories', String(cat)) }
function archiveDir(rootDir) { return join(rootDir, 'archive') }
export function ensureDir(dir) { mkdirSync(dir, { recursive: true }) }

// ---------------------------------------------------------------------------
// settings / index / README
// ---------------------------------------------------------------------------

export function defaultSettings() {
  const categories = {}
  for (const c of DEFAULT_CATEGORY_DEFS) categories[c.id] = { enabled: true }
  return {
    version: 1,
    rootDir: '~/.dsh/experience',
    mode: 'assisted',
    inject: { enabled: true, hotMaxLines: 80, recallTopK: 5, minConfidence: 0.5, recordSimilarityThreshold: 0.5 },
    privacy: { redactPatterns: [], blockedKinds: ['credential', 'health', 'finance'] },
    categories,
  }
}

export function readSettings(rootDir) {
  try { return { ...defaultSettings(), ...JSON.parse(readFileSync(join(rootDir, 'settings.json'), 'utf8')) } }
  catch { return defaultSettings() }
}

export function writeSettings(rootDir, settings) {
  atomicWrite(join(rootDir, 'settings.json'), JSON.stringify(settings, null, 2) + '\n')
}

function categoryMetaPath(rootDir, cat) { return join(catDir(rootDir, cat), '_index.md') }

export function readCategoryMeta(rootDir, cat) {
  try { return parseFrontmatter(readFileSync(categoryMetaPath(rootDir, cat), 'utf8')).meta }
  catch { return null }
}

export function writeCategoryMeta(rootDir, meta) {
  ensureDir(catDir(rootDir, meta.id))
  atomicWrite(categoryMetaPath(rootDir, meta.id), serializeFrontmatter(meta) + (meta.description || '') + '\n')
}

export function listCategories(rootDir) {
  const settings = readSettings(rootDir)
  const out = []
  for (const def of DEFAULT_CATEGORY_DEFS) {
    const meta = readCategoryMeta(rootDir, def.id)
    if (meta) out.push(meta)
  }
  const seen = new Set(out.map((c) => c.id))
  const dir = join(rootDir, 'categories')
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('_') || name.startsWith('.')) continue
      if (!seen.has(name)) {
        const meta = readCategoryMeta(rootDir, name)
        if (meta) { out.push(meta); seen.add(name) }
      }
    }
  }
  const enabledMap = settings.categories || {}
  for (const c of out) if (enabledMap[c.id] && typeof enabledMap[c.id].enabled === 'boolean') c.enabled = enabledMap[c.id].enabled
  return out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id)))
}

export function readItems(rootDir) {
  const items = []
  const dir = join(rootDir, 'categories')
  if (!existsSync(dir)) return items
  for (const cat of readdirSync(dir)) {
    if (cat.startsWith('_') || cat.startsWith('.')) continue
    const cdir = join(dir, cat)
    let files = []
    try { files = readdirSync(cdir) } catch { continue }
    for (const f of files) {
      if (!f.endsWith('.md') || f === '_index.md' || f.startsWith('.')) continue
      try {
        const parsed = parseFrontmatter(readFileSync(join(cdir, f), 'utf8'))
        items.push({ meta: parsed.meta, fields: parseBody(parsed.body), path: 'categories/' + cat + '/' + f })
      } catch { /* 跳过损坏文件 */ }
    }
  }
  return items
}

export function buildIndex(rootDir) {
  const categories = {}
  const items = {}
  for (const c of listCategories(rootDir)) categories[c.id] = { enabled: c.enabled !== false, count: 0 }
  for (const item of readItems(rootDir)) {
    const m = item.meta
    const id = m.id || item.path.replace(/^categories\//, '').replace(/\.md$/, '')
    const cat = id.split('/')[0]
    categories[cat] = categories[cat] || { enabled: true, count: 0 }
    if (m.status !== 'archived') categories[cat].count += 1
    items[id] = {
      category: cat, kind: m.kind, scope: m.scope, status: m.status,
      enabled: m.enabled !== false, confidence: typeof m.confidence === 'number' ? m.confidence : 0.3,
      hits: m.hits || 0, successes: m.successes || 0, tags: m.tags || [],
      path: item.path, updated: m.updated || null,
    }
  }
  return { version: 1, categories, items }
}

export function rebuildIndexFile(rootDir) {
  const index = buildIndex(rootDir)
  atomicWrite(join(rootDir, 'index.json'), JSON.stringify(index, null, 2) + '\n')
  return index
}

export function writeReadme(rootDir, index) {
  const idx = index || buildIndex(rootDir)
  const cats = []
  for (const c of listCategories(rootDir)) {
    cats.push('- **' + (c.title || c.id) + '**（' + c.id + '）— ' + (c.description || '') + '，启用：' + (c.enabled !== false ? '是' : '否') + '，条目：' + ((idx.categories[c.id] && idx.categories[c.id].count) || 0))
  }
  const text = [
    '# 智能体自学习经验库（dsh-experience）',
    '',
    '本文件由插件自动生成，供你在文件系统里快速浏览决策。',
    '',
    '## 分类',
    '',
    cats.join('\n') || '（暂无分类）',
    '',
    '## 说明',
    '',
    '- 每条经验保存在 categories/<分类>/<slug>.md，文件顶部 YAML frontmatter 即元数据。',
    '- index.json 为派生索引，可删除后由 categories 全量重建。',
    '- journal.jsonl 为 append-only 审计日志（每行带 seq），卸载后仍可读。',
    '',
  ].join('\n')
  atomicWrite(join(rootDir, 'README.md'), text)
}

// ---------------------------------------------------------------------------
// 期刊（审计）
// ---------------------------------------------------------------------------

function journalPath(rootDir) { return join(rootDir, 'journal.jsonl') }

export function readJournal(rootDir) {
  const file = journalPath(rootDir)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    try { return JSON.parse(l) } catch { return null }
  }).filter(Boolean)
}

export function appendJournal(rootDir, op, id, before, after) {
  const current = readJournal(rootDir)
  const seq = (current.length ? current[current.length - 1].seq : 0) + 1
  const entry = { seq, ts: nowIso(), op, id, before: before ?? null, after: after ?? null }
  writeFileSync(journalPath(rootDir), JSON.stringify(entry) + '\n', { encoding: 'utf8', flag: 'a' })
  return entry
}

// ---------------------------------------------------------------------------
// 隐私与脱敏（第十三节）
// ---------------------------------------------------------------------------

export function detectSecrets(text) {
  const hits = []
  for (const p of SECRET_PATTERNS) {
    p.re.lastIndex = 0
    const m = String(text).match(p.re)
    if (m && m.length) hits.push(p.name)
  }
  return hits
}

export function redact(text, patterns) {
  let out = String(text)
  for (const p of SECRET_PATTERNS) {
    p.re.lastIndex = 0
    out = out.replace(p.re, '[已脱敏]')
  }
  for (const raw of patterns || []) {
    try { out = out.replace(new RegExp(String(raw), 'g'), '[已脱敏]') } catch { /* 非法 pattern 忽略 */ }
  }
  return out
}

export function isBlockedKind(kind, blockedKinds) {
  const map = {
    credential: ['credential', 'secret', 'token', 'key', 'password'],
    health: ['health', 'medical'],
    finance: ['finance', 'bank', 'card', 'money'],
  }
  const k = String(kind || '').toLowerCase()
  for (const b of blockedKinds || []) {
    if (k === b) return true
    const words = map[b]
    if (words && words.some((w) => k.includes(w))) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// 相似度（第十节）
// ---------------------------------------------------------------------------

function tokenizeWeighted(text) {
  const tf = {}
  const s = String(text || '').toLowerCase()
  const latin = s.match(/[a-z0-9]+/g) || []
  for (const w of latin) tf[w] = (tf[w] || 0) + 2
  const cjk = s.match(/[\u4e00-\u9fff]/g) || []
  for (let i = 0; i < cjk.length - 1; i++) {
    const g = cjk[i] + cjk[i + 1]
    tf[g] = (tf[g] || 0) + 1
  }
  return tf
}

export function similarity(a, b) {
  const ta = tokenizeWeighted(a), tb = tokenizeWeighted(b)
  let dot = 0, na = 0, nb = 0
  for (const k in ta) na += ta[k] * ta[k]
  for (const k in tb) nb += tb[k] * tb[k]
  for (const k in ta) if (tb[k]) dot += ta[k] * tb[k]
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function itemText(item) {
  return [item.meta.title, ...(item.meta.tags || []), item.fields['现象'], item.fields['解法'], item.fields['原因'], item.fields['错误命令'], item.fields['正确命令']].filter(Boolean).join(' ')
}

export function findSimilar(rootDir, kind, category, text, threshold) {
  return readItems(rootDir)
    .filter((it) => it.meta.kind === kind && it.meta.id && it.meta.id.split('/')[0] === category && it.meta.status !== 'archived')
    .map((item) => ({ item, score: similarity(itemText(item), text) }))
    .filter((x) => x.score >= (threshold ?? 0.6))
    .sort((a, b) => b.score - a.score)
}

// ---------------------------------------------------------------------------
// 置信度与成熟度（第九节）
// ---------------------------------------------------------------------------

export function evolveConfidence(item) {
  const hits = item.hits || 0
  const successes = item.successes || 0
  return Math.round((Math.min(1, Math.max(0.1, (successes + 0.5) / (hits + 1))) * 100)) / 100
}

export function statusFromCounts(status, successes) {
  if (status === 'archived' || status === 'disabled') return status
  if (successes >= 3) return 'mature'
  return status === 'confirmed' ? 'confirmed' : 'candidate'
}

export function isStale(meta, now) {
  const lastSeen = meta.lastSeen ? new Date(meta.lastSeen).getTime() : 0
  if (!lastSeen) return false
  return (now || Date.now()) - lastSeen > STALE_DAYS * 24 * 60 * 60 * 1000
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

export function ensureStore(rootDir) {
  ensureDir(rootDir)
  ensureDir(join(rootDir, 'categories'))
  ensureDir(archiveDir(rootDir))
  const settings = readSettings(rootDir)
  let changed = false
  if (!settings.version) { settings.version = 1; changed = true }
  for (const def of DEFAULT_CATEGORY_DEFS) {
    if (!readCategoryMeta(rootDir, def.id)) {
      writeCategoryMeta(rootDir, { id: def.id, title: def.title, description: def.description, enabled: true, order: def.order })
      changed = true
    }
    if (!settings.categories[def.id]) { settings.categories[def.id] = { enabled: true }; changed = true }
  }
  if (changed) writeSettings(rootDir, settings)
  const index = rebuildIndexFile(rootDir)
  writeReadme(rootDir, index)
  return settings
}

// ---------------------------------------------------------------------------
// 记录（第六、七、九、十节）
// ---------------------------------------------------------------------------

function inferKind(text, explicit) {
  if (explicit && KINDS.includes(explicit)) return explicit
  const t = String(text || '').toLowerCase()
  if (/报错|错误|error|traceback|exception|failed|失败/.test(t)) return 'error'
  if (/命令|command|^\$ |npm |pip |git |pnpm |docker |kubectl /.test(t)) return 'command'
  if (/偏好|我喜欢|我希望|以后|记住|别再用|应该是|不要说/.test(t)) return 'preference'
  if (/流程|步骤|成功|方案|做法/.test(t)) return 'workflow'
  return 'domain'
}

function inferCategory(kind) {
  const map = { error: 'errors', command: 'failed-commands', preference: 'preferences', workflow: 'workflows', domain: 'domain' }
  return map[kind] || 'domain'
}

export function writeItem(rootDir, item) {
  const cat = item.meta.id.split('/')[0]
  const slug = item.meta.id.split('/').slice(1).join('/')
  ensureDir(catDir(rootDir, cat))
  const file = join(catDir(rootDir, cat), slug + '.md')
  atomicWrite(file, serializeFrontmatter(item.meta) + serializeBody(item.fields))
  return file
}

function removeOldFile(rootDir, id) {
  const parts = String(id).split('/')
  const cat = parts[0]
  const slug = parts.slice(1).join('/')
  for (const f of [join(rootDir, 'categories', cat, slug + '.md'), join(archiveDir(rootDir), slug + '.md')]) {
    try { if (existsSync(f)) unlinkSync(f) } catch { /* 忽略 */ }
  }
}

export function recordItem(rootDir, input) {
  const settings = readSettings(rootDir)
  const blocked = settings.privacy?.blockedKinds || []
  const threshold = settings.inject?.recordSimilarityThreshold ?? 0.6

  const raw = input && typeof input === 'object' ? input : { text: String(input ?? '') }
  const text = String(raw.text ?? raw.content ?? '').trim()
  if (!text) return { ok: false, error: '记录内容不能为空' }
  const kind = inferKind(text, raw.kind)
  if (isBlockedKind(raw.kind || kind, blocked)) return { ok: false, error: '命中 privacy.blockedKinds，已拒绝写入' }

  const redacted = redact(text, settings.privacy?.redactPatterns)
  const secrets = detectSecrets(text)
  const category = sanitizeCategoryId(raw.category || inferCategory(kind)) || inferCategory(kind)
  if (!readCategoryMeta(rootDir, category)) {
    writeCategoryMeta(rootDir, { id: category, title: category, description: '动态新增分类', enabled: true, order: 99 })
    settings.categories[category] = { enabled: true }
    writeSettings(rootDir, settings)
  }

  const title = String(raw.title || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 80)
    || redacted.split(/\n|。/)[0].slice(0, 60)
    || '未命名经验'

  const fields = {}
  if (kind === 'command') {
    fields['错误命令'] = String(raw.wrongCommand || '').trim() || redacted
    fields['正确命令'] = String(raw.correctCommand || '').trim()
    fields['为什么'] = String(raw.why || '').trim()
    fields['现象'] = redacted
  } else {
    fields['现象'] = String(raw.symptom || redacted).trim()
    fields['原因'] = String(raw.cause || '').trim()
    fields['解法'] = String(raw.solution || '').trim()
    fields['反例 / 注意'] = String(raw.note || '').trim()
    if (!fields['现象']) fields['现象'] = redacted
  }

  // 去重（第十节）
  const sims = findSimilar(rootDir, kind, category, redacted + ' ' + title, threshold)
  const match = sims[0] && sims[0].score >= threshold ? sims[0] : null
  if (match) {
    const similar = sims.slice(0, 5).map((x) => ({ id: x.item.meta.id, score: Math.round(x.score * 100) / 100 }))
    if (settings.mode !== 'autonomous') {
      return { ok: true, id: null, category, merged: false, similar }
    }
    const item = match.item
    const beforeHits = item.meta.hits || 0
    item.meta.hits = beforeHits + 1
    item.meta.updated = nowIso()
    item.meta.lastSeen = nowIso()
    item.meta.confidence = evolveConfidence(item.meta)
    item.fields['反例 / 注意'] = [item.fields['反例 / 注意'], '追加：' + redacted].filter(Boolean).join('\n')
    writeItem(rootDir, { meta: { ...item.meta }, fields: { ...item.fields } })
    appendJournal(rootDir, 'record', item.meta.id, { meta: { ...item.meta, hits: beforeHits } }, { meta: item.meta })
    rebuildIndexFile(rootDir)
    return { ok: true, id: item.meta.id, category, merged: true, similar }
  }

  const now = nowIso()
  const slug = slugify(title)
  let id = category + '/' + slug
  if (readItems(rootDir).some((it) => it.meta.id === id)) id = category + '/' + slug + '-' + now.slice(0, 13).replace(/[^0-9]/g, '')
  const meta = {
    id, kind, scope: SCOPES.includes(raw.scope) ? raw.scope : 'global',
    status: 'candidate', enabled: true, confidence: 0.3, hits: 0, successes: 0,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 20) : [],
    created: now, updated: now, lastSeen: now,
  }
  if (title) meta.title = title
  const item = { meta, fields }
  writeItem(rootDir, item)
  appendJournal(rootDir, 'record', id, null, { meta: item.meta, fields: item.fields })
  rebuildIndexFile(rootDir)
  writeReadme(rootDir)
  return { ok: true, id, category, merged: false, similar: [], redacted: redacted !== text, secrets: secrets.length > 0 }
}

// ---------------------------------------------------------------------------
// 查询 / 搜索（第六节）
// ---------------------------------------------------------------------------

export function itemPublic(item) {
  const m = item.meta
  const id = m.id || ''
  return {
    id, category: id.split('/')[0], kind: m.kind, scope: m.scope, status: m.status,
    enabled: m.enabled !== false, confidence: m.confidence, hits: m.hits || 0, successes: m.successes || 0,
    tags: m.tags || [], created: m.created, updated: m.updated, lastSeen: m.lastSeen,
    title: m.title || id.split('/').slice(1).join('/'),
    symptom: item.fields['现象'] || '', solution: item.fields['解法'] || '',
    cause: item.fields['原因'] || '', correctCommand: item.fields['正确命令'] || '',
    wrongCommand: item.fields['错误命令'] || '', note: item.fields['反例 / 注意'] || '',
    stale: isStale(m, Date.now()),
  }
}

export function effectiveItems(rootDir) {
  const index = buildIndex(rootDir)
  return readItems(rootDir).filter((it) => {
    const id = it.meta.id || ''
    const cat = id.split('/')[0]
    const catEnabled = index.categories[cat] ? index.categories[cat].enabled !== false : true
    return catEnabled && it.meta.enabled !== false && it.meta.status !== 'disabled' && it.meta.status !== 'archived'
  })
}

export function listItems(rootDir, filter) {
  const f = filter || {}
  let items = readItems(rootDir)
  const index = buildIndex(rootDir)
  if (f.category) items = items.filter((it) => (it.meta.id || '').split('/')[0] === f.category)
  if (f.kind) items = items.filter((it) => it.meta.kind === f.kind)
  if (f.status) items = items.filter((it) => it.meta.status === f.status)
  if (typeof f.enabled === 'boolean') items = items.filter((it) => (it.meta.enabled !== false) === f.enabled)
  if (f.scope) items = items.filter((it) => it.meta.scope === f.scope)
  if (f.query) {
    const q = String(f.query).toLowerCase()
    items = items.filter((it) => itemText(it).toLowerCase().includes(q))
  }
  const cats = Object.fromEntries(listCategories(rootDir).map((c) => [c.id, c]))
  const out = items.map((it) => {
    const pub = itemPublic(it)
    pub.categoryEnabled = index.categories[(it.meta.id || '').split('/')[0]] ? index.categories[(it.meta.id || '').split('/')[0]].enabled !== false : true
    pub.categoryTitle = cats[(it.meta.id || '').split('/')[0]] ? cats[(it.meta.id || '').split('/')[0]].title : ''
    return pub
  })
  const limit = Math.max(1, Math.min(500, f.limit || 200))
  return out.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || ''))).slice(0, limit)
}

export function searchItems(rootDir, query, topK, minConfidence) {
  const q = String(query || '').trim()
  if (!q) return []
  const k = topK || 5
  const minConf = minConfidence ?? 0
  return effectiveItems(rootDir)
    .map((it) => ({ item: it, score: similarity(q, itemText(it)) }))
    .filter((x) => (x.item.meta.confidence || 0) >= minConf && x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => ({
      id: x.item.meta.id, title: x.item.meta.title || x.item.meta.id, confidence: x.item.meta.confidence,
      score: Math.round(x.score * 100) / 100, scope: x.item.meta.scope, kind: x.item.meta.kind,
      solution: x.item.fields['解法'] || x.item.fields['正确命令'] || '',
      crossProject: x.item.meta.scope !== 'global',
    }))
}

// ---------------------------------------------------------------------------
// 启用/停用（第十一节）
// ---------------------------------------------------------------------------

function findItem(rootDir, id) {
  return readItems(rootDir).find((it) => it.meta.id === id)
}

export function setEnabled(rootDir, idOrCategory, enabled) {
  const on = !!enabled
  const isCat = listCategories(rootDir).some((c) => c.id === idOrCategory)
  if (isCat) {
    const before = readCategoryMeta(rootDir, idOrCategory)
    const meta = { ...(before || { id: idOrCategory }), enabled: on }
    writeCategoryMeta(rootDir, meta)
    const settings = readSettings(rootDir)
    settings.categories[idOrCategory] = { ...(settings.categories[idOrCategory] || {}), enabled: on }
    writeSettings(rootDir, settings)
    appendJournal(rootDir, on ? 'enable' : 'disable', idOrCategory, { meta: before }, { meta })
    rebuildIndexFile(rootDir)
    return { ok: true, id: idOrCategory, categoryMode: true, enabled: on }
  }
  const item = findItem(rootDir, idOrCategory)
  if (!item) return { ok: false, error: '找不到条目 ' + idOrCategory }
  const before = { meta: { ...item.meta }, fields: { ...item.fields } }
  item.meta.enabled = on
  item.meta.updated = nowIso()
  writeItem(rootDir, { meta: { ...item.meta }, fields: { ...item.fields } })
  appendJournal(rootDir, on ? 'enable' : 'disable', idOrCategory, before, { meta: item.meta, fields: item.fields })
  rebuildIndexFile(rootDir)
  return { ok: true, id: idOrCategory, categoryMode: false, enabled: on }
}

// ---------------------------------------------------------------------------
// 统计（第六节）
// ---------------------------------------------------------------------------

export function detectConflicts(rootDir) {
  const out = []
  const items = readItems(rootDir)
  const negA = ['不要', '别', '禁止', '不能用', '错误']
  const negB = ['应该', '正确', '请用', '需用']
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j]
      if (a.meta.kind !== b.meta.kind) continue
      const sa = a.fields['解法'] || a.fields['正确命令'] || ''
      const sb = b.fields['解法'] || b.fields['正确命令'] || ''
      const aNeg = negA.some((w) => sa.includes(w)), bNeg = negA.some((w) => sb.includes(w))
      const aPos = negB.some((w) => sa.includes(w)), bPos = negB.some((w) => sb.includes(w))
      if ((aNeg && bPos) || (aPos && bNeg)) out.push({ a: a.meta.id, b: b.meta.id })
    }
  }
  return out
}

export function stats(rootDir) {
  const items = readItems(rootDir)
  const index = buildIndex(rootDir)
  const byCategory = {}
  for (const c of listCategories(rootDir)) byCategory[c.id] = { title: c.title || c.id, enabled: c.enabled !== false, count: index.categories[c.id] ? index.categories[c.id].count : 0 }
  const byStatus = {}
  for (const it of items) byStatus[it.meta.status] = (byStatus[it.meta.status] || 0) + 1
  let hits = 0, successes = 0, stale = 0
  for (const it of items) {
    hits += it.meta.hits || 0
    successes += it.meta.successes || 0
    if (isStale(it.meta, Date.now())) stale += 1
  }
  const conflicts = detectConflicts(rootDir).length
  return {
    total: items.length, byCategory, byStatus, hits, successes,
    hitRate: hits > 0 ? Math.round((successes / hits) * 100) / 100 : null,
    conflicts, stale, totalEnabled: effectiveItems(rootDir).length,
  }
}

// ---------------------------------------------------------------------------
// 合并（第十节）
// ---------------------------------------------------------------------------

export function mergeItems(rootDir, targetId, sourceId, overrides) {
  const target = findItem(rootDir, targetId)
  const source = findItem(rootDir, sourceId)
  if (!target) return { ok: false, error: '找不到 targetId ' + targetId }
  if (!source) return { ok: false, error: '找不到 sourceId ' + sourceId }
  const beforeTarget = { meta: { ...target.meta }, fields: { ...target.fields } }
  const beforeSource = { meta: { ...source.meta }, fields: { ...source.fields } }
  let master = target, slave = source
  if ((source.meta.confidence || 0) > (target.meta.confidence || 0)) { master = source; slave = target }
  for (const label of BODY_LABELS) {
    if (slave.fields[label] && !master.fields[label]) master.fields[label] = slave.fields[label]
  }
  if (overrides && typeof overrides === 'object') {
    for (const key of Object.keys(overrides)) {
      if (BODY_LABELS.includes(key)) master.fields[key] = String(overrides[key])
      else if (overrides[key] !== undefined && !['id', 'status', 'hits', 'successes', 'confidence'].includes(key)) master.meta[key] = overrides[key]
    }
  }
  master.meta.hits = (master.meta.hits || 0) + (slave.meta.hits || 0)
  master.meta.successes = (master.meta.successes || 0) + (slave.meta.successes || 0)
  master.meta.confidence = evolveConfidence(master.meta)
  master.meta.status = statusFromCounts(master.meta.status, master.meta.successes)
  master.meta.updated = nowIso()
  master.meta.lastSeen = nowIso()
  slave.meta.status = 'archived'
  slave.meta.updated = nowIso()
  writeItem(rootDir, { meta: { ...master.meta }, fields: { ...master.fields } })
  writeItem(rootDir, { meta: { ...slave.meta }, fields: { ...slave.fields } })
  appendJournal(rootDir, 'merge', master.meta.id, { target: beforeTarget, source: beforeSource }, { master: { meta: master.meta, fields: master.fields }, slave: { meta: slave.meta, fields: slave.fields } })
  rebuildIndexFile(rootDir)
  return { ok: true, masterId: master.meta.id, archivedId: slave.meta.id, status: master.meta.status }
}

// ---------------------------------------------------------------------------
// 分类管理（第二、六节）
// ---------------------------------------------------------------------------

export function manageCategory(rootDir, action, name, extra) {
  if (action === 'list') return { ok: true, categories: listCategories(rootDir) }
  if (action === 'create') {
    const id = sanitizeCategoryId(name)
    if (!id || !/^[a-z][a-z0-9-]+$/.test(id)) return { ok: false, error: '分类 ID 需为字母开头的小写英文/数字/连字符' }
    if (readCategoryMeta(rootDir, id)) return { ok: false, error: '分类已存在 ' + id }
    const title = String((extra && extra.title) || name).trim() || id
    const description = String((extra && extra.description) || '').trim()
    writeCategoryMeta(rootDir, { id, title, description, enabled: true, order: 99 })
    const settings = readSettings(rootDir)
    settings.categories[id] = { enabled: true }
    writeSettings(rootDir, settings)
    appendJournal(rootDir, 'category-create', id, null, { meta: readCategoryMeta(rootDir, id) })
    rebuildIndexFile(rootDir)
    writeReadme(rootDir)
    return { ok: true, id }
  }
  if (action === 'rename') {
    const oldId = sanitizeCategoryId(name)
    const newId = sanitizeCategoryId(extra)
    if (!newId || !/^[a-z][a-z0-9-]+$/.test(newId)) return { ok: false, error: '新分类 ID 无效' }
    const before = readCategoryMeta(rootDir, oldId)
    if (!before) return { ok: false, error: '找不到分类 ' + oldId }
    if (oldId === newId) return { ok: true, id: newId }
    writeCategoryMeta(rootDir, { ...before, id: newId })
    const items = readItems(rootDir).filter((it) => (it.meta.id || '').split('/')[0] === oldId)
    for (const it of items) {
      const oldSlug = (it.meta.id || '').split('/').slice(1).join('/')
      it.meta.id = newId + '/' + oldSlug
      it.meta.updated = nowIso()
      writeItem(rootDir, { meta: { ...it.meta }, fields: { ...it.fields } })
      const oldFile = join(catDir(rootDir, oldId), oldSlug + '.md')
      try { if (existsSync(oldFile)) unlinkSync(oldFile) } catch { /* 忽略 */ }
    }
    const settings = readSettings(rootDir)
    settings.categories[newId] = settings.categories[oldId] || { enabled: true }
    delete settings.categories[oldId]
    writeSettings(rootDir, settings)
    try { rmSync(catDir(rootDir, oldId), { recursive: true, force: true }) } catch { /* 忽略 */ }
    appendJournal(rootDir, 'category-rename', oldId, { id: oldId }, { id: newId })
    rebuildIndexFile(rootDir)
    return { ok: true, id: newId, from: oldId }
  }
  return { ok: false, error: '未知 action ' + action }
}

// ---------------------------------------------------------------------------
// 回滚（第十四节）
// ---------------------------------------------------------------------------

export function revert(rootDir, seq) {
  const journal = readJournal(rootDir)
  const entry = journal.find((e) => e.seq === Number(seq))
  if (!entry) return { ok: false, error: '找不到 journal seq ' + seq }
  if (entry.op === 'revert') return { ok: false, error: '该记录是回滚本身，不可再次撤销' }
  const id = entry.id
  const before = entry.before
  if (!id) return { ok: false, error: '该记录缺少 id，无法回滚' }

  if (['record', 'enable', 'disable', 'update', 'archive'].includes(entry.op)) {
    const item = findItem(rootDir, id)
    if (before == null) {
      if (item) removeOldFile(rootDir, id)
    } else if (before.meta) {
      writeItem(rootDir, { meta: { ...before.meta, id }, fields: { ...(before.fields || {}) } })
    }
  } else if (entry.op === 'merge') {
    if (before && before.target && before.target.meta) writeItem(rootDir, { meta: { ...before.target.meta }, fields: { ...before.target.fields } })
    if (before && before.source && before.source.meta) writeItem(rootDir, { meta: { ...before.source.meta }, fields: { ...before.source.fields } })
  } else if (entry.op === 'category-create') {
    try { rmSync(catDir(rootDir, id), { recursive: true, force: true }) } catch { }
    const settings = readSettings(rootDir)
    delete settings.categories[id]
    writeSettings(rootDir, settings)
  } else if (entry.op === 'category-rename') {
    const oldId = before && before.id ? before.id : id
    const oldMeta = before && before.meta ? before.meta : null
    const items = readItems(rootDir).filter((it) => (it.meta.id || '').split('/')[0] === id)
    for (const it of items) {
      const slug = (it.meta.id || '').split('/').slice(1).join('/')
      it.meta.id = oldId + '/' + slug
      writeItem(rootDir, { meta: { ...it.meta }, fields: { ...it.fields } })
    }
    try { rmSync(catDir(rootDir, id), { recursive: true, force: true }) } catch { }
    ensureDir(catDir(rootDir, oldId))
  }

  appendJournal(rootDir, 'revert', id, null, null)
  rebuildIndexFile(rootDir)
  writeReadme(rootDir)
  return { ok: true, seq: entry.seq, op: entry.op, id }
}
