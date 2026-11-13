# dsh-experience · 智能体自学习经验库

> 让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 里的智能体**越用越聪明**：把踩过的坑、被纠正的写法、验证过的流程，自动沉淀成一份可读、可开关、会自动注入上下文的本地经验库。

[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22.19-339933.svg)](https://nodejs.org)
[![dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen.svg)](#设计)
[![offline](https://img.shields.io/badge/network-none-blue.svg)](#隐私与安全)

---

## 为什么做这个

智能体的能力问题，很大一部分不是「不会」，而是**记不住**：

- 同一个报错，这次解决了，换个会话又从头排查一遍；
- 用户说过「别再用 pnpm，用 npm」，五轮之后又绕回去了；
- 一条费了很大劲才跑通的部署流程，下次还要重新试错。

现有记忆类方案大多把内容塞进模型上下文或向量库，用户既看不见、也管不了。**dsh-experience 换了个方向：经验就是你自己磁盘上的 markdown 文件。**

| | |
|---|---|
| 看得见 | 一条经验一个 `.md` 文件，frontmatter 是元数据，正文是「现象 / 原因 / 解法 / 反例」 |
| 管得住 | 分类级 + 单条级双层开关，停用立刻退出注入与召回 |
| 可审计 | 每次写入都追加到 `journal.jsonl`，任何一笔都能按 `seq` 回滚 |
| 带得走 | 卸载插件后，数据仍是一堆可读的 md / json / jsonl，不丢、不锁死 |

## 特性

- **零运行时依赖、完全离线**：仅使用 Node 内置模块与 DSH 提供的 `@deepseek-ai/dsh-tools`，无任何网络请求（唯一的对外出口是被动版本徽章图片，不进运行时）。
- **markdown 真相源 + 可重建索引**：`index.json` 是派生物，删掉能从 `categories/` 全量重建。
- **9 个 `exp_*` 工具**：记录、查询、检索、统计、合并、分类管理、回滚。
- **自动注入**：会话启动注入「经验概览」，工具失败时按报错文本召回「相关经验」。
- **可视化面板**：分类树、条目列表、统计卡、搜索、编辑、合并、回滚、导出 zip。
- **隐私优先**：写入前脱敏 key/token/证件号/银行卡，命中 `blockedKinds` 整条拒写。
- **成熟度演进**：新条目是 candidate，反复验证通过会自动升级到 mature。
- **原子写**：临时文件 + rename，杜绝写一半损坏。

## 安装

### 方式一：插件管理器（推荐）

1. 到 [Releases](../../releases) 下载 `dsh-experience-0.1.0.tgz`；
2. 在 DSH 的**插件管理器**中选择「安装本地插件」，选中该 tgz；
3. **重启 DSH**。

### 方式二：直接放进 Profile 插件目录

```bash
git clone https://github.com/MistyRn/dsh-experience.git
# 将目录放入你的 DSH Profile 插件目录，然后重启 DSH
```

安装成功后，左侧「工作台」切换器会多出一个**「经验库」**页面。

## 快速开始

在对话里直接对智能体说：

> 记住：这个项目用 npm，不要用 pnpm。
> 把刚才那个 pip SSL 报错存成经验。

或者让智能体显式调用工具：

```text
exp_record(text="pip install 报 SSL 证书错误", kind="error", solution="加 --trusted-host 或更新 certifi")
```

之后同类报错再次出现时，插件会自动召回这条经验并注入上下文。

## 工具一览

| 工具 | 说明 | 档位 |
|---|---|---|
| `exp_record` | 记录一条经验（自动分类、去重、脱敏、写 md + 更新 index + 追加 journal；返回 `similar` 供合并） | assisted / autonomous |
| `exp_list` | 只读列出条目（含状态 / 置信度 / 命中 / 开关） | readonly+ |
| `exp_search` | 按相似度召回经验摘要（带 id / 置信度 / 作用域标注） | readonly+ |
| `exp_stats` | 分类统计、各 status 计数、命中率、冲突数、陈旧数 | readonly+ |
| `exp_categories` | 列出 / 新增 / 改名分类 | readonly 仅 list |
| `exp_enable` | 逐条或按分类启用（分类开关覆盖该类所有条目） | assisted+ |
| `exp_disable` | 逐条或按分类停用（停用即退出注入 / 召回） | assisted+ |
| `exp_merge` | 手动合并两条近似经验（保留高置信者，低者归档） | assisted+ |
| `exp_revert` | 依 `journal.seq` 撤销一笔变更（撤销本身不可再撤销） | assisted+ |

## 数据目录

默认 `~/.dsh/experience/`，可用环境变量 `DSH_EXPERIENCE_ROOT` 或 `settings.json` 的 `rootDir` 改写：

```text
~/.dsh/experience/
├── README.md            自动生成的总览：每个分类一句话 + 启用状态
├── settings.json        全局配置
├── index.json           派生索引（可删除后重建）
├── journal.jsonl        append-only 审计日志，每行带递增 seq
├── categories/
│   ├── errors/          报错类经验
│   │   ├── _index.md    分类元数据 + 分类级开关
│   │   └── pip-ssl-cert.md
│   ├── failed-commands/
│   ├── preferences/
│   ├── workflows/
│   └── domain/
└── archive/             预留：归档条目落盘位置
```

单条经验示例：

```markdown
---
id: errors/pip-ssl-cert
kind: error
scope: global
status: mature
enabled: true
confidence: 0.9
hits: 12
successes: 11
tags: [python, pip, ssl]
created: 2026-11-13T19:00:00+08:00
updated: 2026-11-13T19:00:00+08:00
lastSeen: 2026-11-13T19:00:00+08:00
---

现象：pip install 报 ssl certificate verify failed

原因：本地 CA 证书链不完整

解法：更新 certifi，或临时加 --trusted-host

反例 / 注意：不要全局关闭 SSL 校验
```

## 配置

`settings.json`：

```json
{
  "version": 1,
  "rootDir": "~/.dsh/experience",
  "mode": "assisted",
  "inject": {
    "enabled": true,
    "hotMaxLines": 80,
    "recallTopK": 5,
    "minConfidence": 0.5,
    "recordSimilarityThreshold": 0.5
  },
  "privacy": {
    "redactPatterns": [],
    "blockedKinds": ["credential", "health", "finance"]
  },
  "categories": { "errors": { "enabled": true } }
}
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `mode` | `assisted` | `off` / `readonly` / `assisted` / `autonomous`，见下表 |
| `inject.enabled` | `true` | 总注入开关 |
| `inject.hotMaxLines` | `80` | 概览块最多行数 |
| `inject.recallTopK` | `5` | 召回条数 |
| `inject.minConfidence` | `0.5` | 召回置信度下限 |
| `inject.recordSimilarityThreshold` | `0.5` | 判为「重复」的相似度阈值 |
| `privacy.redactPatterns` | `[]` | 追加的自定义脱敏正则 |
| `privacy.blockedKinds` | 见上 | 命中即整条拒写的类别 |

## 档位

| 档位 | 注册工具 | 自动写 | 注入 |
|---|---|---|---|
| `off` | 无 | — | 关 |
| `readonly` | list / search / stats / categories(list) | 否 | 关 |
| `assisted` | 全部 | 否（只召回，重复项返回 `similar` 由人合并） | 开 |
| `autonomous` | 全部 | 是（相似条目自动追加命中，工具失败自动记录） | 开 |

## 自动注入

- **会话启动**：注入「经验库概览」——启用中、高置信（mature / confirmed）的经验，按 `hotMaxLines` 截断为紧凑表。
- **事件触发**：工具失败（非零退出 / 报错）时，用报错文本与命令做 `exp_search`，取 `recallTopK` 条 `minConfidence` 以上的结果注入「相关经验」块；跨项目条目额外带「⚠ 其他项目经验，请勿盲从」标注。
- **克制原则**：宁可少注入。没有命中就不注入，不拿无关内容填预算。

## 面板

工作台「经验库」页：

- 顶部统计卡：总条数 / 启用中 / mature / candidate / 命中率 / 冲突数 / 陈旧数；
- 左侧分类树：动态分类 + 分类开关 + 「新建分类」；
- 右侧条目列表：搜索、展开查看、编辑、测试应用、逐条开关、设为合并源 / 合并到此；
- 底部最近变更：按 `seq` 一键回滚；
- 工具条：手动新增、重建索引、导出 zip。

前端只读数据、只回传指令，不直接改文件。

## 隐私与安全

- 绝不存储：密钥、API key、token、密码、证件号、银行卡、健康信息。
- 写入前对正文跑内置规则 + `privacy.redactPatterns` 脱敏，命中 `blockedKinds` 的整条拒绝写入。
- 所有数据留在本机，不做任何网络请求。

## 开发

```bash
node tests/storage.test.mjs     # 存储引擎离线单测（14 项）
node tests/smoke-host.test.mjs  # host 半侧冒烟（9 个工具 + 注入，自带 dsh-tools stub）
pnpm pack                       # 打包为 tgz
```

两个测试都不需要安装 DSH，可在任意 Node ≥ 22 环境直接跑，CI 见 `.github/workflows/ci.yml`。

## 设计

- **置信度**：`confidence = (successes + 0.5) / (hits + 1)`，下限 0.1、上限 1.0；`successes >= 3` 自动升为 mature；`lastSeen` 超过 90 天标记「建议归档」。
- **去重**：同分类同 kind 内做相似度匹配（英文词加权 + 中文二元组，余弦），超过阈值返回 `similar` 而不新建文件。
- **冲突**：同分类同 kind 但结论相反的条目会在统计与面板标「冲突」，提醒人工取舍。
- **审计**：record / update / enable / disable / merge / archive 每次写入都追加 journal；`exp_revert(seq)` 依 `before` 恢复，并再记一条 revert。
- **并发**：全部写入为「临时文件 + rename」原子写，单进程内串行执行。

## 兼容性

在 DSH `0.2.2-alpha` 系列实测（`@deepseek-ai/dsh-tools` 的 `defineTool`、`systemPrompt.section`、`webServer.register`、`tools/result` 事件、`desktopWorkbenches.register`）。DSH 大版本变更后如面板或注入失效，请先看控制台里 `[dsh-experience]` 前缀的日志。

## 贡献者

- **MistyRn** — 作者 / 维护者
- **DSH** — 设计与实现协作
- **DeepSeek V4.1 Flash** — AI 协作开发

> 面板中的大脑图标路径来自 [Lucide](https://lucide.dev)（`brain`，ISC License）。

## 许可证

[MIT](LICENSE)
