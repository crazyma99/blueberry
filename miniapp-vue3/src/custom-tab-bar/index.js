// 自定义底部 tabBar（pages.json tabBar.custom = true，仅微信生效；抖音为原生 tabBar）。
// 移植自旧端 src/custom-tab-bar/index.js：
//  · 各 tab 页下是相互独立的组件实例，用模块级变量共享选中下标；
//  · 2026-09-15 主人指示「回滚 Tab 选中背景位移动效」（真机三版实现均未稳定生效）⇒
//    恢复每 tab 静态淡金渐变；以下保留不回滚：图标线性/面性双态、未选中压暗、
//    选中态由页面 onShow 同步（src/application/tabbar.ts，唯一必然触发的路径）。
let sharedSelected = -1; // -1 表示尚未初始化

Component({
  data: {
    selected: 0,
    list: [
      { pagePath: 'pages/index/index', icon: '/static/iconpark/home.svg', iconActive: '/static/iconpark/home-filled.svg', text: '首页' },
      { pagePath: 'pages/priceHomePage/index', icon: '/static/iconpark/price.svg', iconActive: '/static/iconpark/price-filled.svg', text: '价目表' },
      { pagePath: 'pages/mine/index', icon: '/static/iconpark/mine.svg', iconActive: '/static/iconpark/mine-filled.svg', text: '我的' },
    ],
  },
  lifetimes: {
    attached() {
      // 字体尽早注册（旧端 CR 🟡：不排 nextTick 之后，防异步异常连带跳过）
      uni.loadFontFace({
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
      // 兜底通道：webview 渲染器下自定义 tabbar 可能收不到 pageLifetimes；
      // 主入口是页面 onShow → syncTabBarSelected（application/tabbar.ts）。
      this.syncSelected(false);
    },
  },
  methods: {
    syncSelected(preferShared) {
      const pages = getCurrentPages();
      const route = pages.length > 0 ? pages[pages.length - 1].route : '';
      const routeIndex = this.data.list.findIndex((item) => item.pagePath === route);
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
    // 页面 onShow 同步入口（越界守卫＋幂等）
    setSelected(index) {
      const target = Number(index);
      if (isNaN(target) || target < 0 || target >= this.data.list.length) return;
      if (target !== this.data.selected) {
        this.setData({ selected: target });
      }
    },
    onTap(e) {
      const index = Number(e.currentTarget.dataset.index);
      if (!(index >= 0) || index >= this.data.list.length) return;
      try {
        uni.vibrateShort({ type: 'light' });
      } catch (err) {
        // 不支持振动时静默
      }
      // 只写共享变量不 setData：点击时旧实例重绘＋新实例渲染＝一次切换两次渲染，加重闪烁
      sharedSelected = index;
      uni.switchTab({ url: '/' + this.data.list[index].pagePath });
    },
  },
});
