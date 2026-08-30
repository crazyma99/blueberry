// 各 tab 页下的自定义 tabBar 是相互独立的组件实例，用模块级变量共享选中下标。
// 注意时序：attached 触发时新页面可能尚未进入页面栈，此时 getCurrentPages()
// 取到的仍是旧页面路由，所以 attached 阶段优先使用点击时写入的共享值；
// show 阶段路由已稳定，再以路由为准校准。
let sharedSelected = -1; // -1 表示尚未初始化

Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: 'pages/index/index',
        icon: '/static/home-bar.png',
        text: '首页',
      },
      {
        pagePath: 'pages/priceHomePage/index',
        icon: '/static/price-bar.png',
        text: '价目表',
      },
      {
        pagePath: 'pages/mine/index',
        icon: '/static/my-bar.png',
        text: '我的',
      },
    ],
  },
  lifetimes: {
    attached() {
      this.syncSelected(true);
      // custom-tab-bar 渲染时机早于 App onLaunch 中全局字体加载完成，
      // 组件内再注册一次（字体加载有缓存），确保底栏文字也能应用自定义字体
      wx.loadFontFace({
        global: true,
        family: 'HarmonyOS-Sans-SC',
        source: 'url("https://www.lanmei66.cloud/font/HarmonyOS_Sans_SC-subset.woff")',
      });
    },
  },
  pageLifetimes: {
    show() {
      this.syncSelected(false);
    },
  },
  methods: {
    // preferShared: attached 阶段为 true，优先用点击写入的共享值（此时路由可能还是旧页）；
    // 其余情况以当前页面路由为准，并同步更新共享值
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
    onTap(e) {
      const index = e.currentTarget.dataset.index;
      // 只写共享变量（供新实例 attached 时首帧取到正确选中态），不在此 setData：
      // 点击时旧实例重绘 + 新实例渲染 = 一次切换两次渲染，会加重切换闪烁。
      // 高亮随新页面的 tabbar 实例一次性出现，与页面切换同步。
      // 同时不做"已选中则忽略"判断，避免实例状态与实际页面脱节时误吞点击。
      sharedSelected = index;
      wx.switchTab({ url: '/' + this.data.list[index].pagePath });
    },
  },
});
