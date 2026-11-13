import { ok, equal } from 'node:assert/strict'
import { mkdirSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 自建 dsh-tools stub，保证脱离 DSH 也能冒烟
const here = dirname(fileURLToPath(import.meta.url))
const stubDir = join(here, '..', 'node_modules', '@deepseek-ai', 'dsh-tools')
if (!existsSync(join(stubDir, 'index.js'))) {
  mkdirSync(stubDir, { recursive: true })
  writeFileSync(join(stubDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-tools', type: 'module', exports: { '.': './index.js' } }) + '\n')
  writeFileSync(join(stubDir, 'index.js'), 'export function defineTool(d) { return d }\n')
}

process.env.DSH_EXPERIENCE_ROOT = mkdtempSync(join(tmpdir(), 'dsh-exp-smoke-'))

const tools = []
const sections = []
const ctx = {
  tools: { register: (d) => tools.push(d) },
  webServer: { register: () => () => {} },
  systemPrompt: { section: (s) => { sections.push(s); return () => {} } },
  effect: (fn) => { try { fn() } catch { } ; return () => {} },
  on: () => () => {},
  logger: { info() {}, warn() {}, error() {} },
}

const mod = await import('../host.js')
equal(mod.name, 'dsh-experience')
mod.apply(ctx)

console.log('tools registered: ' + tools.map((t) => t.name).join(', '))
equal(tools.length, 9)
equal(tools.map((t) => t.name).join(','), 'exp_record,exp_list,exp_search,exp_stats,exp_categories,exp_enable,exp_disable,exp_merge,exp_revert')

console.log('sections: ' + sections.map((s) => s.name).join(', '))
equal(sections.map((s) => s.name).sort().join(','), 'experience:overview,experience:relevant')
equal(typeof sections[0].text, 'function')

const rec = tools.find((t) => t.name === 'exp_record')
const out = JSON.parse(rec.execute({ text: 'pip install 报错 ssl certificate verify failed', kind: 'error', solution: '加 --trusted-host' }))
ok(out.ok, out.error)
console.log('exp_record -> ' + out.id)

const list = tools.find((t) => t.name === 'exp_list')
const items = JSON.parse(list.execute({}))
equal(items.length >= 1, true)
ok(items.some((i) => i.id === out.id))

const search = tools.find((t) => t.name === 'exp_search')
ok(Array.isArray(JSON.parse(search.execute({ query: 'ssl' }))))

const stats = tools.find((t) => t.name === 'exp_stats')
const st = JSON.parse(stats.execute({}))
equal(st.total >= 1, true)

// 回调触发检测
const off = { }
console.log('SMOKE OK')
try { rmSync(process.env.DSH_EXPERIENCE_ROOT, { recursive: true, force: true }) } catch { }
