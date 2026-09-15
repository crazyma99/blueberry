// 各 tab 页下的自定义 tabBar 是相互独立的组件实例，用模块级变量共享选中下标。
// 注意时序：attached 触发时新页面可能尚未进入页面栈，此时 getCurrentPages()
// 取到的仍是旧页面路由，所以 attached 阶段优先使用点击时写入的共享值；
// show 阶段路由已稳定，再以路由为准校准。
//
// 2026-09-15 主人指示：
// - 图标支持「默认态线性 / 激活态面性」（icon / iconActive 两套 SVG）
// - 选中背景改为单一高亮块并做位移动效
//
// ⚠️ 2026-09-15 二修（主人报「位移动画只生效一次」）：
//   根因＝微信 tab 页是**常驻实例**（switchTab 不销毁页面），tabbar 组件只在**首次**进入该页
//   触发 attached，之后每次切回来只触发 pageLifetimes.show；而 show 时本实例的高亮块
//   早已停在目标位，没有"变化"自然没有 transition ⇒ 只有每个 tab 首次被打开时能滑动。
//   修法＝FLIP：无论 attached 还是 show，只要本次切换带「上一个选中位」（onTap 记录）
//   就先瞬间落在上一个位（transition: none），下一帧再位移到目标位。
//   该起点值用后即焚（consumePrevIndex），避免"从其它页面返回 tab 页"时重放假动画。
let sharedSelected = -1; // -1 表示尚未初始化
let sharedPrevSelected = -1; // 点击时记录的上一个选中位（FLIP 起点，用后清零）

// 取出并清空 FLIP 起点：仅当它有效且与目标位不同才返回，否则返回 -1
function consumePrevIndex(target) {
  const prev = sharedPrevSelected;
  sharedPrevSelected = -1;
  if (prev > -1 && prev !== target) {
    return prev;
  }
  return -1;
}

// 下一帧：优先 wx.nextTick，缺失时用 setTimeout 兜底（CR 🟡）
function nextTick(fn) {
  if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
    wx.nextTick(fn);
    return;
  }
  setTimeout(fn, 0);
}
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
      // 字体尽早注册（CR 🟡：原先排在 nextTick 之后，一旦 nextTick 异常会连带跳过）
      wx.loadFontFace({
        global: true,
        family: 'NotoSerifSC-Bold',
        source: 'url("https://lanmeiimgstore-1311468332.cos.ap-shanghai.myqcloud.com/font/NotoSerifSC-Bold-subset.woff")',
      });
      // 首帧：优先用点击写入的共享值（此时路由可能还是旧页）
      this.applySelected(this.resolveSelected(true), consumePrevIndex(sharedSelected));
    },
  },
  pageLifetimes: {
    show() {
      // 路由稳定后以路由为准；tab 页是常驻实例，切回来只会走这里，
      // 故同样用 FLIP（先落在上一个位、下一帧再位移）重放位移
      const target = this.resolveSelected(false);
      this.applySelected(target, consumePrevIndex(target));
    },
  },
  methods: {
    // 统一落位逻辑：prev 有效时走 FLIP（先无动画落在 prev，下一帧再带动画位移到 target）
    applySelected(target, prev) {
      if (prev !== -1) {
        this.setData({ selected: prev, slideReady: false });
        nextTick(() => {
          this.setData({ selected: target, slideReady: true });
        });
        return;
      }
      if (target !== this.data.selected) {
        this.setData({ slideReady: true });
        this.setData({ selected: target });
      }
    },
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
      // CR 🟡：dataset 在不同渲染器下可能是字符串，统一归一为数字（否则 === 全 false、高亮全灭）
      const index = Number(e.currentTarget.dataset.index);
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