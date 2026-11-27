## 合并 Release 时排除 doc 目录

Release 分支不允许包含 doc 文件，合并前先确认 diff 里没有 doc/ 下的改动。

## 提交前先跑一遍测试

推送前必须本地跑通测试，不要指望 CI 兜底。

## 改表结构必须先写 migration

不能直接改生产库表结构，必须先提交 migration 脚本并评审。

## 不要直接改生产配置

生产配置走环境变量和配置中心，禁止手工改线上文件。

## 新增接口要补 OpenAPI 文档

新接口必须在同一 PR 里补上 OpenAPI 描述和示例。

## 依赖升级先看 changelog

升级第三方依赖前先读 changelog，确认破坏性变更。
