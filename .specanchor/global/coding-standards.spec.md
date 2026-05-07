---
specanchor:
  level: global
  type: coding-standards
  version: "1.0.0"
  last_updated: "2026-05-07"
---

# Coding Standards Spec

## 文件命名

- 页面: `index.uvue` (放在页面目录下)
- 工具: 小驼峰,如 `config.uts`
- 组件: PascalCase

## UVue 文件结构

```vue
<template>
  <!-- 模板 -->
</template>

<script lang="uts">
  // 脚本
</script>

<style>
  /* 样式 */
</style>
```

## 命名约定

- 变量/函数: camelCase
- 常量: UPPER_SNAKE_CASE
- 组件: PascalCase
- CSS 类: kebab-case

## 样式规范

1. 全局样式: `src/App.uvue`, `src/uni.scss`
2. 页面样式: 页面 `<style>` 标签
3. 隐藏滚动条: 使用 `.hide-scrollbar` 类

## 条件编译

```typescript
// #ifdef APP-ANDROID || APP-HARMONY
// 平台特定代码
// #endif
```

## API 调用

1. HTTP 请求: 使用 `src/utils/http.uts`
2. API 接口: 定义在 `src/utils/api.uts`
3. 认证状态: 使用 `src/utils/auth.uts`
4. 配置: `src/utils/config.uts`

## 注意事项

1. 页面路径必须在 `src/pages.json` 注册
2. TabBar 页面必须配置在 `tabBar.list`
3. 避免硬编码配置值
4. 源码根为 `src/`; 不新增根目录 `pages/`、`static/`、`utils/` 或入口文件副本
