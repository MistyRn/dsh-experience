# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.1] - 2026-11-13

### 修复

- 面板「手动新增 / 新建分类 / 编辑」点击无反应：Electron 不支持 window.prompt()，改为面板内嵌弹窗表单。
- 「测试应用」不再使用 window.alert()，改为弹窗内展示召回结果。
- 按钮配色改用 DSH 官方设计 token（button-primary-fill + label-primary-inverted），修复「新建分类」观感，并补上 hover 反馈。

## [0.1.0] - 2026-11-13

首个公开版本。

### 新增

- 存储引擎：markdown 真相源 + 可重建 index.json + append-only journal.jsonl，原子写。
- 9 个工具：exp_record / exp_list / exp_search / exp_enable / exp_disable / exp_stats / exp_merge / exp_categories / exp_revert。
- 自动注入：会话启动注入经验概览，工具失败时按报错文本召回相关经验。
- 工作台面板：分类树、条目列表、统计卡、搜索、编辑、合并、回滚、导出 zip。
- 隐私：密钥/token/证件号/银行卡脱敏，blockedKinds 整条拒写。
- 档位：off / readonly / assisted / autonomous。
- 成熟度演进：confidence = (successes + 0.5) / (hits + 1)，successes >= 3 升 mature，90 天未命中标记陈旧。
- 离线测试：14 项存储引擎单测 + host 冒烟测试。
