# mp-ui-branding 分支 UI 改造评估报告

> 审查对象：mp-ui-branding（0bb4596..HEAD，30 文件，+2019/-1260）
> 验证：`npm run build:mp-weixin` 全量编译通过（DONE，零错误）

## 结论

**未发现 CRITICAL 级问题**，可安全合入。

| 检查维度 | 结果 |
|---|---|
| 业务逻辑 | ✅ api.uts import 完整，原 handler 原样保留（仅前置 hapticTap），无请求/数据流改动 |
| 组件事件链 | ✅ LoginPopup/ProfilePopup 6 页全绑定（含 @get-phone、@update-nickname）；AppSelector/AppSegment/AppPhotoPicker 绑定与 handler 齐备 |
| 编译 | ✅ 全量 build 通过；模板标签平衡；无未定义引用 |
| CSS 冲突 | ✅ 全局类与 8 个新组件零同名；旧全局弹窗样式已清除 |
| 安全 | ✅ 无明文密钥；本地地址为基线已有（非本分支引入） |

## 建议（非阻塞，可后续处理）

1. 行尾符 CRLF→LF 造成 diff 噪音（App.uvue 等），建议 .gitattributes 统一 LF
2. AppSelector 事件契约：组件 emit 原始 index，页面 selectAge 做双向兼容 —— 建议统一事件对象形态
3. AppSegment props 类型 `Array as any[]` 建议改用精确类型
4. favorites 双层 padding 叠加（.content + .photolistContainer），建议合并
5. 本地地址 http://127.0.0.1:8155（基线），发布链路需确认环境变量覆盖
6. 分支历史为 squash 单 commit，后续建议保留逐 commit 粒度
