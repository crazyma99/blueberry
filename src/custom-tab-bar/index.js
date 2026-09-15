// 各 tab 页下的自定义 tabBar 是相互独立的组件实例，用模块级变量共享选中下标。
//
// ⚠️ 位移动效的三次迭代（留痕，勿回退）：
//   v1（CSS transition + selected 驱动）：切回「常驻 tab 页」时不动画 —— 微信 tab 页不销毁，
//      组件只在首次进入该页 attached，此后只可能触发 pageLifetimes.show，而 show 时高亮块已在目标位。
//   v2（FLIP：show 里先落旧位再位移）：经独立 CR 用基础库源码 + 社区 issue 证实
//      **webview 渲染器下自定义 tabbar 位于独立元素树（挂在 document.documentElement，不在页面组件树内），
//      收不到 pageLifetimes.show**；且页面 onShow 里 syncTabBarSelected 的裸 setData 会把 FLIP 第一阶段抹掉；
//      再叠加 wx.nextTick 是宏任务、两次 setData 常落在同一渲染帧 ⇒ 仍不出动画。
//   v3（本版）：改由**页面 onShow 经 getTabBar().slideTo(index) 单一入口**驱动（官方支持、必然执行），
//      动效用组件级 this.animate()（视图层动画，不依赖 CSS transition 与渲染帧对齐），
//      并把「高亮块位置 highlightIndex」与「图标/文字激活态 selected」拆成两个数据源（避免动画期间闪旧图标）。
let sharedSelected = -1; // -1 表示尚未初始化
let sharedPrevSelected = -1; // 点击时记录的上一个选中位（新实例据此判断动画起点），用后即焚
let sharedTapPending = false; // 是否因「用户点击 tab」而切换（程序化 switchTab 时为 false，避免首帧采用陈旧下标）

// 取出并清空位移起点：仅当它有效且与目标位不同才返回，否则返回 -1
function consumePrevIndex(target) {
  const prev = sharedPrevSelected;
  sharedPrevSelected = -1;
  if (prev > -1 && prev !== target) {
    return prev;
  }
  return -1;
}

Component({
  data: {
    // 图标/文字激活态（点击后立即切换，与高亮块动画解耦）
    selected: 0,
    // 高亮块位置（无动画时的落位；动画结束时由 slideTo 对齐到目标位）
    highlightIndex: 0,
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
      const target = this.resolveSelected(true);
      const prev = consumePrevIndex(target);
      // 只落位、不播动画：位移动效统一由「页面 onShow → slideTo()」单一入口播放
      // （CR 🟡S1：attached 播一次 + onShow 又播一次 = 同一跳双播/重启动画）。
      // 图标态直接给目标（不闪旧图标）；高亮块先落在「上一跳」位置，等页面 onShow 播位移过去。
      this.setData({ selected: target, highlightIndex: prev > -1 ? prev : target });
      // 兜底收敛（CR 🟡S7）：页面首个 onShow 里 getTabBar() 可能为 null（官方另有异步版 getTabBar(cb)），
      // 此时动画不会被触发、高亮块会滞留在「上一跳」格子。400ms 后若仍未动，直接对齐目标位。
      if (prev > -1 && prev !== target) {
        if (this._slideFallbackTimer != null) {
          clearTimeout(this._slideFallbackTimer);
        }
        this._slideFallbackTimer = setTimeout(() => {
          this._slideFallbackTimer = null;
          if (this.data.highlightIndex === prev && this.data.highlightIndex !== target) {
            this.syncSelection(target);
          }
        }, 400);
      }
    },
  },
  detached() {
    // CR 🟡S4：清理兜底定时器，避免实例销毁后回调仍改数据
    if (this._finishTimer != null) {
      clearTimeout(this._finishTimer);
      this._finishTimer = null;
    }
    if (this._slideFallbackTimer != null) {
      clearTimeout(this._slideFallbackTimer);
      this._slideFallbackTimer = null;
    }
  },
  pageLifetimes: {
    show() {
      // 状态兜底（不播动画）：webview 渲染器下自定义 tabbar 很可能收不到 pageLifetimes，
      // 位移动效的主入口是页面 onShow → getTabBar().slideTo()（src/utils/tabbar.uts）。
      // 这里只做「选中态/高亮位」对齐，避免与页面 onShow 的同一次切换重复播动画（CR 🟡S1/S3）。
      this.syncSelection(this.resolveSelected(false));
    },
  },
  methods: {
    // 计算应选中的下标；preferShared=true 时（attached 阶段）优先用点击写入的共享值
    resolveSelected(preferShared) {
      const pages = getCurrentPages();
      const route = pages.length > 0 ? pages[pages.length - 1].route : '';
      const routeIndex = this.data.list.findIndex(item => item.pagePath === route);
      // CR 🟡S8：只有「用户点击 tab」才信任模块级共享下标；程序化 switchTab（如品牌馆页切回首页）
      // 没有点击记录，此时应以本页路由为准，否则首帧会短暂显示上一次点击的 tab。
      const trustShared = preferShared && sharedTapPending && sharedSelected > -1;
      sharedTapPending = false;
      if (trustShared) {
        return sharedSelected;
      }
      if (routeIndex > -1) {
        sharedSelected = routeIndex;
        return routeIndex;
      }
      return sharedSelected > -1 ? sharedSelected : 0;
    },
    // 仅对齐状态、不播动画（pageLifetimes.show 兜底通道用）
    syncSelection(index) {
      const target = Number(index);
      if (isNaN(target) || target < 0 || target >= this.data.list.length) {
        return;
      }
      if (this.data.selected !== target) {
        this.setData({ selected: target });
      }
      if (this.data.highlightIndex !== target) {
        this.setData({ highlightIndex: target });
      }
    },
    /**
     * 选中背景位移动效（唯一入口：页面 onShow → getTabBar().slideTo()；attached 只落位不播）
     * @param index 目标 tab 下标
     * @param fromOverride 可选动画起点（不传则用当前高亮块位置）
     */
    slideTo(index, fromOverride) {
      const target = Number(index);
      if (isNaN(target) || target < 0 || target >= this.data.list.length) {
        return; // 越界守卫（CR 🟡：dataset 异常时不再抛错）
      }
      // 动画即将播放：取消 attached 里的兜底收敛定时器（CR 🟡S7），保持「单一播放者」
      if (this._slideFallbackTimer != null) {
        clearTimeout(this._slideFallbackTimer);
        this._slideFallbackTimer = null;
      }
      // 图标/文字态立即切换（与高亮块动画解耦）
      if (this.data.selected !== target) {
        this.setData({ selected: target });
      }
      // 动画起点优先级：显式传入 > 本次切换记录的上一位（用后即焚）> 当前高亮块位置。
      // ⚠️ 常驻页场景必须用「上一位」：每个 tab 页的 tabbar 实例静态显示的是「自己那一格」，
      //    若用实例自身位置当起点，则 起点==终点 ⇒ 没有任何位移可播（这正是 v2 失败的原因之一）。
      let from = this.data.highlightIndex;
      const f = fromOverride == null ? NaN : Number(fromOverride);
      if (!isNaN(f) && f > -1) {
        from = f;
      } else {
        const consumed = consumePrevIndex(target);
        if (consumed > -1) {
          from = consumed;
        }
      }
      // 动画结束/兜底：把数据态对齐到目标位（动画期间数据态保持不动，避免覆盖视图层动画）
      const finish = () => {
        if (this.data.highlightIndex !== target) {
          this.setData({ highlightIndex: target });
        }
      };
      if (from === target) {
        finish();
        return;
      }
      if (typeof this.animate !== 'function' || typeof this.createSelectorQuery !== 'function') {
        finish(); // 基础库不支持组件级动画：直接落位，不阻塞切换
        return;
      }
      // 用节点实测宽度换算 px（比百分比更稳），交给视图层动画播放
      this.createSelectorQuery().select('.tabbar-inner').boundingClientRect((rect) => {
        const width = rect != null && rect.width ? rect.width : 0;
        const cell = width > 0 ? width / this.data.list.length : 0;
        if (cell <= 0) {
          finish();
          return;
        }
        if (this._finishTimer != null) {
          clearTimeout(this._finishTimer);
          this._finishTimer = null;
        }
        // 官方签名 animate(selector, keyframes, duration, callback)：
        // 缓动必须写在**第一帧关键帧**的 ease 字段上（第 4 参不是 easing，误传会被当成 scrollTimeline）——
        // 独立 CR 🔴R1。动画写下的内联样式会盖住 wxml 里由 highlightIndex 驱动的 transform，
        // 故必须 clearAnimation 清除后再对齐数据态（🔴R2）。
        const done = () => {
          // 顺序：先把数据态对齐（模板样式写入「段 0」），再清动画样式（「段 1」），避免 1 帧回跳。
          finish();
          // ⚠️ CR 🔴R2：clearAnimation 传 {} 在基础库里走「逐属性清除」分支且 keys 为空 ⇒ **一个属性都不清**，
          // 动画写下的内联 transform 会永久盖住 wxml 由 highlightIndex 驱动的 transform。
          // 正确形态是「不传 options」（2 参）= 清除全部。
          setTimeout(() => {
            try {
              if (typeof this.clearAnimation === 'function') {
                this.clearAnimation('.tabbar-highlight');
              }
            } catch (err) {
              // 清理失败不影响状态（数据态已在上面对齐）
            }
          }, 50);
        };
        try {
          this.animate('.tabbar-highlight', [
            { transform: 'translateX(' + (from * cell) + 'px)', ease: 'ease-out' },
            { transform: 'translateX(' + (target * cell) + 'px)' },
          ], 280, done);
        } catch (err) {
          finish();
        }
        // 兜底：动画回调缺失/被跳过时也要对齐数据态
        this._finishTimer = setTimeout(finish, 400);
      }).exec();
    },
    onTap(e) {
      // CR 🟡：dataset 在不同渲染器下可能是字符串，统一归一为数字并做范围守卫
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
      // 记录位移起点（供新实例/页面 onShow 播放位移），只写共享变量、不在此 setData：
      // 点击时旧实例重绘 + 新实例渲染 = 一次切换两次渲染，会加重切换闪烁。
      sharedPrevSelected = this.data.selected;
      sharedSelected = index;
      sharedTapPending = true;
      wx.switchTab({ url: '/' + this.data.list[index].pagePath });
    },
  },
});
