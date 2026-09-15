// 各 tab 页下的自定义 tabBar 是相互独立的组件实例，用模块级变量共享选中下标。
//
// ⚠️ 2026-09-15 主人指示「回滚 Tab 选中背景位移动效」（真机实测始终未生效）。
//    三次实现均未能在微信真机稳定生效：
//      v1 CSS transition（tab 页常驻、无重绘时机）→ v2 FLIP + pageLifetimes.show
//      （自定义 tabbar 位于独立元素树，收不到 show）→ v3/v3.2 页面 onShow + this.animate
//      （视图层动画 + clearAnimation 已按 CR 修正，真机仍不生效）。
//    结论：自定义 tabbar 在 webview 渲染器下处于独立元素树，生命周期与动画指令不完全受控；
//    故按主人指示回滚为「每个 tab 各自静态渐变背景」（v1.0.43 及以前形态）。
//
// **以下保留、不回滚**（均为主人另行确认的需求）：
//   · 图标线性/面性双态（icon / iconActive 两套 SVG）
//   · 未选中图标与文字压暗（rgba(241,205,145,.55)）
//   · 选中态由页面 onShow 同步（src/utils/tabbar.uts；这是唯一必然触发的路径）
let sharedSelected = -1; // -1 表示尚未初始化

Component({
  data: {
    // 当前选中下标（唯一数据源，驱动图标态/文字色/渐变背景）
    selected: 0,
    list: [
      {
        pagePath: 'pages/index/index',
        icon: '/static/iconpark/home.svg',
        iconActive: '/static/iconpark/home-filled.svg',
        text: '首页',
      },
      {
        pagePath: 'pages/priceHomePage/index',
        icon: '/static/iconpark/price.svg',
        iconActive: '/static/iconpark/price-filled.svg',
        text: '价目表',
      },
      {
        pagePath: 'pages/mine/index',
        icon: '/static/iconpark/mine.svg',
        iconActive: '/static/iconpark/mine-filled.svg',
        text: '我的',
      },
    ],
  },
  lifetimes: {
    attached() {
      // 字体尽早注册（CR 🟡：原先排在 nextTick 之后，一旦 nextTick 异常会连带跳过）
      wx.loadFontFace({
        global: true,
        family: 'NotoSerifSC-Bold',
        source: 'url("https://lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com/font/NotoSerifSC-Bold-subset.woff")',
      });
      // 首帧：优先用点击写入的共享值（attached 时路由可能还是旧页），否则按路由
      this.syncSelected(true);
    },
  },
  pageLifetimes: {
    show() {
      // 兜底通道：webview 渲染器下自定义 tabbar 很可能收不到 pageLifetimes，
      // 主入口是页面 onShow → getTabBar().setSelected(index)（src/utils/tabbar.uts）。
      this.syncSelected(false);
    },
  },
  methods: {
    // 按路由/共享值对齐选中态（只改数据，无任何动画）
    syncSelected(preferShared) {
      const pages = getCurrentPages();
      const route = pages.length > 0 ? pages[pages.length - 1].route : '';
      const routeIndex = this.data.list.findIndex(item => item.pagePath === route);
      let target;
      if (preferShared && sharedSelected > -1) {
        target = sharedSelected;
      } else if (routeIndex > -1) {
        target = routeIndex;
        sharedSelected = routeIndex;
      } else {
        target = sharedSelected > -1 ? sharedSelected : 0;
      }
      if (target !== this.data.selected) {
        this.setData({ selected: target });
      }
    },
    // 页面 onShow 同步入口（utils/tabbar.uts 优先调用；越界守卫 + 幂等）
    setSelected(index) {
      const target = Number(index);
      if (isNaN(target) || target < 0 || target >= this.data.list.length) {
        return;
      }
      if (target !== this.data.selected) {
        this.setData({ selected: target });
      }
    },
    onTap(e) {
      // dataset 在不同渲染器下可能是字符串，统一归一为数字并做范围守卫
      const index = Number(e.currentTarget.dataset.index);
      if (!(index >= 0) || index >= this.data.list.length) {
        return;
      }
      // 触感反馈：tab 切换用轻振动（Selection 语义），失败静默
      try {
        wx.vibrateShort({ type: 'light' });
      } catch (err) {
        // 不支持振动时静默
      }
      // 只写共享变量、不在此 setData：点击时旧实例重绘 + 新实例渲染 = 一次切换两次渲染，会加重切换闪烁
      sharedSelected = index;
      wx.switchTab({ url: '/' + this.data.list[index].pagePath });
    },
  },
});
