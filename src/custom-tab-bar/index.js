// 各 tab 页下的自定义 tabBar 是相互独立的组件实例，用模块级变量共享选中下标。
// 注意时序：attached 触发时新页面可能尚未进入页面栈，此时 getCurrentPages()
// 取到的仍是旧页面路由，所以 attached 阶段优先使用点击时写入的共享值；
// show 阶段路由已稳定，再以路由为准校准。
//
// 2026-09-15 主人指示：
// - 图标支持「默认态线性 / 激活态面性」（icon / iconActive 两套 SVG）
// - 选中背景改为单一高亮块并做位移动效：新实例先在【上一个选中位】渲染，
//   下一帧再移到目标位，从而让 CSS transition 真的产生位移（否则首帧即目标位，无动画可播）
let sharedSelected = -1; // -1 表示尚未初始化
let sharedPrevSelected = -1; // 点击时记录的上一个选中位（用于位移动效的起点）

Component({
  data: {
    selected: 0,
    // 是否启用位移动效（位移发生前才打开，首帧与直达页面不播）
    slideReady: false,
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
      const target = this.resolveSelected(true);
      const prev = sharedPrevSelected;
      if (prev > -1 && prev !== target) {
        // 先落在上一个选中位（无动画），下一帧再位移到目标位 —— 这样才有"滑动"效果
        this.setData({ selected: prev, slideReady: false });
        wx.nextTick(() => {
          this.setData({ selected: target, slideReady: true });
        });
      } else {
        this.setData({ selected: target, slideReady: false });
      }
      // custom-tab-bar 渲染时机早于 App onLaunch 中全局字体加载完成，
      // 组件内再注册一次（字体加载有缓存），确保底栏文字也能应用自定义字体
      wx.loadFontFace({
        global: true,
        family: 'NotoSerifSC-Bold',
        source: 'url("https://lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com/font/NotoSerifSC-Bold-subset.woff")',
      });
    },
  },
  pageLifetimes: {
    show() {
      // 路由稳定后以路由为准；若与当前高亮位不同（例如从其它路径切回），同样走位移动效
      const target = this.resolveSelected(false);
      if (target !== this.data.selected) {
        this.setData({ slideReady: true });
        this.setData({ selected: target });
      }
    },
  },
  methods: {
    // 计算应选中的下标；preferShared=true 时（attached 阶段）优先用点击写入的共享值
    resolveSelected(preferShared) {
      const pages = getCurrentPages();
      const route = pages.length > 0 ? pages[pages.length - 1].route : '';
      const routeIndex = this.data.list.findIndex(item => item.pagePath === route);
      if (preferShared && sharedSelected > -1) {
        return sharedSelected;
      }
      if (routeIndex > -1) {
        sharedSelected = routeIndex;
        return routeIndex;
      }
      return sharedSelected > -1 ? sharedSelected : 0;
    },
    onTap(e) {
      const index = e.currentTarget.dataset.index;
      // 触感反馈：tab 切换用轻振动（Selection 语义），失败静默
      try {
        wx.vibrateShort({ type: 'light' });
      } catch (err) {
        // 不支持振动时静默
      }
      // 记录位移起点（供新实例的 tabbar 播放位移），只写共享变量、不在此 setData：
      // 点击时旧实例重绘 + 新实例渲染 = 一次切换两次渲染，会加重切换闪烁。
      // 同时不做"已选中则忽略"判断，避免实例状态与实际页面脱节时误吞点击。
      sharedPrevSelected = this.data.selected;
      sharedSelected = index;
      wx.switchTab({ url: '/' + this.data.list[index].pagePath });
    },
  },
});
