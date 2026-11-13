import { ok, equal } from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, unlinkSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as S from '../lib/store.js'

let passed = 0, failed = 0
function t(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name) }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n     ' + (e.message || e)) }
}

const root = mkdtempSync(join(tmpdir(), 'dsh-exp-'))
S.ensureStore(root)

t('初始化：5 个默认分类 + settings + README + index', () => {
  ok(existsSync(join(root, 'settings.json')))
  ok(existsSync(join(root, 'README.md')))
  ok(existsSync(join(root, 'index.json')))
  equal(S.listCategories(root).length, 5)
})

let rec
t('记录报错 -> categories/errors/<slug>.md + index + journal', () => {
  rec = S.recordItem(root, { kind: 'error', title: 'pip SSL 证书错误', text: 'pip install 报错 ssl certificate verify failed', solution: '加 --trusted-host' })
  ok(rec.ok, rec.error)
  ok(rec.id.startsWith('errors/'))
  ok(existsSync(join(root, 'categories', 'errors', rec.id.split('/')[1] + '.md')))
  const idx = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'))
  ok(idx.items[rec.id])
  ok(S.readJournal(root).some((e) => e.op === 'record' && e.id === rec.id))
  ok(readFileSync(join(root, 'README.md'), 'utf8').includes('errors'))
})

t('同类经验再次出现 -> 返回 similar，不产生重复文件', () => {
  const before = readdirSync(join(root, 'categories', 'errors')).filter((f) => f.endsWith('.md')).length
  const r2 = S.recordItem(root, { kind: 'error', text: 'pip install 出现 ssl certificate verify failed，需要信任源' })
  equal(r2.ok, true)
  equal(r2.merged, false)
  equal(r2.similar.length > 0, true)
  const after = readdirSync(join(root, 'categories', 'errors')).filter((f) => f.endsWith('.md')).length
  equal(after, before)
})

t('autonomous 下同类经验 -> 追加命中不新建文件', () => {
  const settings = S.readSettings(root); settings.mode = 'autonomous'; S.writeSettings(root, settings)
  const before = readdirSync(join(root, 'categories', 'errors')).filter((f) => f.endsWith('.md')).length
  const r = S.recordItem(root, { kind: 'error', text: 'ssl certificate verify failed 再犯' })
  equal(r.merged, true)
  const after = readdirSync(join(root, 'categories', 'errors')).filter((f) => f.endsWith('.md')).length
  equal(after, before)
  const settings2 = S.readSettings(root); settings2.mode = 'assisted'; S.writeSettings(root, settings2)
})

t('停用分类 -> 有效条目排除该类；启用恢复', () => {
  S.setEnabled(root, 'errors', false)
  equal(S.effectiveItems(root).some((it) => (it.meta.id || '').startsWith('errors/')), false)
  S.setEnabled(root, 'errors', true)
  equal(S.effectiveItems(root).some((it) => (it.meta.id || '').startsWith('errors/')), true)
})

t('停用单条 -> 仅该条排除', () => {
  S.setEnabled(root, rec.id, false)
  const eff = S.effectiveItems(root)
  equal(eff.some((it) => it.meta.id === rec.id), false)
})

t('revert(seq) 能够撤销单条禁用', () => {
  const seq = S.readJournal(root).filter((e) => e.op === 'disable' && e.id === rec.id).map((e) => e.seq).pop()
  ok(seq != null, '应存在 disable 记录')
  const r = S.revert(root, seq)
  ok(r.ok, r.error)
  equal(S.effectiveItems(root).some((it) => it.meta.id === rec.id), true)
  ok(S.readJournal(root).some((e) => e.op === 'revert'))
})

t('密钥/token 内容被脱敏', () => {
  const r = S.recordItem(root, { kind: 'domain', title: '部署配置', text: '我的 token=abcdef123456，sk-abcdefghijklmnopqrstuvwxyz123456 请勿外泄' })
  ok(r.ok, r.error)
  equal(r.redacted, true)
  const item = S.listItems(root, { query: '部署配置' }).find((x) => x.id === r.id)
  ok(item, '应能找到该条目')
  ok(item.symptom.includes('[已脱敏]'), '正文应含 [已脱敏]')
})

t('新增分类 -> listCategories 认可，且可写入条目', () => {
  const r = S.manageCategory(root, 'create', 'My New Area', { title: '新领域' })
  ok(r.ok, r.error)
  ok(S.listCategories(root).some((c) => c.id === r.id))
  const rec2 = S.recordItem(root, { kind: 'domain', category: 'my-new-area', text: '该领域的一个知识点与背景说明' })
  ok(rec2.ok, rec2.error)
  ok(rec2.id.startsWith('my-new-area/'))
})

t('删除 index.json 后可重建，index 仍含记录', () => {
  unlinkSync(join(root, 'index.json'))
  const idx = S.rebuildIndexFile(root)
  ok(idx.items[rec.id])
  ok(existsSync(join(root, 'index.json')))
})

t('搜索返回按相似度排序的结果', () => {
  const res = S.searchItems(root, 'ssl certificate verify', 5, 0)
  ok(res.length >= 1)
  equal(res[0].id, rec.id)
})

t('置信度演进：successes>=3 -> mature，公式正确', () => {
  const item = S.readItems(root).find((it) => it.meta.id === rec.id)
  item.meta.hits = 4; item.meta.successes = 3
  item.meta.confidence = S.evolveConfidence(item.meta)
  item.meta.status = S.statusFromCounts(item.meta.status, item.meta.successes)
  equal(item.meta.status, 'mature')
  equal(item.meta.confidence, (3 + 0.5) / (4 + 1))
})

t('合并：低置信条目归档，高置信保留', () => {
  const a = S.recordItem(root, { kind: 'domain', title: '合并主', text: '某个领域知识 A 的详细说明', solution: '应该这样做' })
  const b = S.recordItem(root, { kind: 'domain', category: a.category, title: '合并从', text: '某个领域知识 B 的补充说明', solution: '不要那样做' })
  // 人工提升 b 置信度使其成为 master
  const bi = S.readItems(root).find((x) => x.meta.id === b.id)
  bi.meta.confidence = 0.9; bi.meta.hits = 5; bi.meta.successes = 4
  S.writeItem(root, { meta: bi.meta, fields: bi.fields })
  const m = S.mergeItems(root, a.id, b.id)
  ok(m.ok, m.error)
  equal(m.masterId, b.id)
  equal(m.archivedId, a.id)
  const archived = S.readItems(root).find((x) => x.meta.id === a.id)
  equal(archived.meta.status, 'archived')
})

t('卸载后数据仍可读（md + journal 均为纯文本）', () => {
  const md = readFileSync(join(root, 'categories', 'errors', rec.id.split('/')[1] + '.md'), 'utf8')
  ok(md.includes('---'))
  const journal = S.readJournal(root)
  ok(journal.length > 0)
  ok(journal.every((e) => typeof e.seq === 'number'))
})

console.log('\n== 结果 ==')
console.log('通过 ' + passed + '，失败 ' + failed)
try { rmSync(root, { recursive: true, force: true }) } catch { }
if (failed > 0) process.exit(1)
