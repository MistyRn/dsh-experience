#!/usr/bin/env node
/**
 * dsh-experience 一键发布脚本
 *
 * 用法（在仓库根目录执行）：
 *   GITHUB_TOKEN=ghp_xxx node scripts/publish.mjs
 *   GITHUB_TOKEN=ghp_xxx node scripts/publish.mjs --private
 *   GITHUB_TOKEN=ghp_xxx node scripts/publish.mjs --no-release
 *
 * 环境变量：
 *   GITHUB_TOKEN / GH_TOKEN   必须有；fine-grained token 需 Contents: RW + Administration: RW
 *   GITHUB_OWNER              仓库归属账号（缺省用 token 所属用户）
 *   GITHUB_REPO               仓库名（缺省 dsh-experience）
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const API = 'https://api.github.com'

const args = process.argv.slice(2)
const PRIVATE = args.includes('--private')
const NO_RELEASE = args.includes('--no-release')

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
if (!token) {
  console.error([
    '缺少 GITHUB_TOKEN。',
    '',
    '  PowerShell:  $env:GITHUB_TOKEN="ghp_xxx"; node scripts/publish.mjs',
    '  Bash:        GITHUB_TOKEN=ghp_xxx node scripts/publish.mjs',
    '',
    'token 生成：GitHub -> Settings -> Developer settings -> Fine-grained tokens',
    '所需权限：Contents: Read and write、Administration: Read and write（创建仓库用）',
  ].join('\n'))
  process.exit(2)
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const repoName = process.env.GITHUB_REPO || manifest.name
const version = manifest.version
const tag = 'v' + version
const pkgFile = 'dsh-experience-' + version + '.tgz'

const HELPER = '!f() { echo username=x-access-token; echo "password=$GITHUB_TOKEN"; }; f'
const GIT_ENV = { ...process.env, GITHUB_TOKEN: token, GIT_TERMINAL_PROMPT: '0' }

function sh(cmd, cmdArgs, opts) {
  return (execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', ...(opts || {}) }) || '').trim()
}

async function api(path, init) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'dsh-experience-publish',
      ...(init && init.headers ? init.headers : {}),
    },
  })
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!res.ok) {
    const err = new Error('GitHub API ' + path + ' 失败 ' + res.status + ': ' + (body && body.message ? body.message : text))
    err.status = res.status
    throw err
  }
  return body
}

async function ensureRepo(owner) {
  try {
    const existing = await api('/repos/' + owner + '/' + repoName)
    console.log('[1/4] 仓库已存在：' + existing.html_url)
    return existing
  } catch (error) {
    if (error.status !== 404) throw error
  }
  const created = await api('/user/repos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: repoName,
      description: '智能体自学习经验库：为 DeepSeek Harness 沉淀可复用经验，自动注入上下文，支持分类/单条开关与可视化面板。',
      private: PRIVATE,
      has_issues: true,
      has_wiki: false,
      has_projects: false,
    }),
  })
  console.log('[1/4] 已创建仓库：' + created.html_url)
  return created
}

function pushRef(ref) {
  const gitArgs = ['-c', 'credential.helper=' + HELPER, 'push', 'origin', ref]
  execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] })
}

async function createRelease(owner, tgzPath) {
  let release = null
  try {
    release = await api('/repos/' + owner + '/' + repoName + '/releases/tags/' + tag)
    console.log('[4/4] Release ' + tag + ' 已存在')
  } catch (error) {
    if (error.status !== 404) throw error
  }
  if (!release) {
    const lines = [
      '首个公开版本。',
      '',
      '### 新增',
      '- 存储引擎：markdown 真相源 + 可重建 index.json + append-only journal.jsonl',
      '- 9 个工具：exp_record / exp_list / exp_search / exp_enable / exp_disable / exp_stats / exp_merge / exp_categories / exp_revert',
      '- 自动注入：会话概览 + 工具失败时召回相关经验',
      '- 工作台面板：分类树、条目列表、统计、搜索、编辑、合并、回滚、导出 zip',
      '- 隐私脱敏、档位控制、成熟度演进、审计回滚',
      '',
      '### 安装',
      '下载附件 ' + pkgFile + '，在 DSH 插件管理器中安装，然后重启 DSH。',
    ]
    release = await api('/repos/' + owner + '/' + repoName + '/releases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tag_name: tag, name: tag, body: lines.join('\n'), draft: false, prerelease: false }),
    })
    console.log('[4/4] 已创建 Release ' + tag)
  }
  if (tgzPath && existsSync(tgzPath)) {
    const data = readFileSync(tgzPath)
    const base = release.upload_url.split('{')[0] + '?name=' + encodeURIComponent(pkgFile)
    const res = await fetch(base, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/octet-stream',
        'content-length': String(data.length),
        'user-agent': 'dsh-experience-publish',
      },
      body: data,
    })
    if (res.ok) console.log('[4/4] 已上传安装包 ' + pkgFile)
    else console.warn('[4/4] 安装包上传失败 ' + res.status + '（Release 已创建，可稍后手动补传）')
  } else {
    console.log('[4/4] 未找到 ' + pkgFile + '，跳过附件上传')
  }
}

async function main() {
  const me = await api('/user')
  const owner = process.env.GITHUB_OWNER || me.login
  console.log('账号：' + me.login + '（仓库将创建在 ' + owner + '/' + repoName + '）')

  const repo = await ensureRepo(owner)

  try { sh('git', ['remote', 'remove', 'origin'], { stdio: 'ignore' }) } catch { /* 本来就没有 */ }
  sh('git', ['remote', 'add', 'origin', repo.clone_url])
  console.log('[2/4] 已设置 remote：' + repo.clone_url)

  if (sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']) !== 'main') sh('git', ['branch', '-M', 'main'])
  pushRef('main')
  console.log('[3/4] 已推送 main')

  if (NO_RELEASE) {
    console.log('[4/4] 已跳过 Release')
  } else {
    try { sh('git', ['tag', tag]) } catch { /* tag 已存在 */ }
    try { pushRef('refs/tags/' + tag) } catch { console.warn('tag ' + tag + ' 推送失败（可能已存在）') }
    await createRelease(owner, join(ROOT, '..', pkgFile))
  }

  console.log('\n完成：' + repo.html_url)
}

main().catch((error) => {
  console.error('发布失败：' + (error && error.message ? error.message : error))
  process.exit(1)
})
