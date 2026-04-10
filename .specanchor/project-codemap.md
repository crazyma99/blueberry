# Project CodeMap

> 项目全局代码地图，提供项目的整体架构视图

## 项目信息

- **项目名称**: blueBerry
- **技术栈**: uni-app x (Vue 3 + UTS)
- **目标平台**: 微信小程序
- **版本**: 1.0.0

## 代码结构

```
blueBerry/
├── .specanchor/          # Spec 规范管理目录
│   ├── global/           # Global Spec
│   ├── modules/          # Module Spec
│   ├── tasks/            # Task Spec
│   └── archive/          # 归档
├── src/                  # 源代码目录
│   ├── pages/            # 页面
│   │   ├── index/        # 首页
│   │   ├── demoDetail/   # 客片详情
│   │   ├── priceList/    # 价目列表
│   │   ├── targetPhotoDetail/  # 目标照片详情
│   │   └── priceHomePage/      # 价目表首页
│   ├── utils/            # 工具函数
│   │   ├── config.uts    # 配置
│   │   ├── http.uts      # HTTP 封装
│   │   └── api.uts       # API 接口
│   ├── static/           # 静态资源
│   ├── App.uvue          # 应用入口
│   ├── main.uts          # 主入口
│   ├── pages.json        # 页面配置
│   ├── manifest.json     # 应用配置
│   └── uni.scss          # 全局样式
├── package.json          # 依赖配置
└── project.config.json   # 项目配置
```

## 核心模块

### 页面模块

1. **首页模块** - 应用主入口
2. **价目表模块** - 价格展示
3. **客片展示模块** - 作品展示

### 工具模块

1. **HTTP 模块** - 网络请求
2. **API 模块** - 接口定义
3. **配置模块** - 配置管理

## Global Spec

- `project-setup.spec.md` - 项目配置规范
- `coding-standards.spec.md` - 编码规范
- `architecture.spec.md` - 架构规范

## Module Spec

- `src-pages-index.spec.md` - 首页模块
- `src-pages-price.spec.md` - 价目表模块 (priceHomePage + priceList)
- `src-pages-album.spec.md` - 客片展示模块 (demoDetail + targetPhotoDetail)
- `src-utils.spec.md` - 工具模块 (config + http + api)

## 开发指南

1. 新增功能前，先查阅相关 Global Spec
2. 涉及模块修改时，查看对应 Module Spec
3. 复杂任务使用 Task Spec 跟踪
4. 修改代码后考虑是否需要更新 Module Spec
