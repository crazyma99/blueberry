// 同步自定义 tabBar 选中态（旧端 utils/tabbar.uts 忠实移植）：
// 微信官方模式＝tab 页 onShow 经 getTabBar() 拿本页实例；webview 渲染器下自定义 tabbar
// 位于独立元素树、pageLifetimes 很可能收不到 ⇒ **页面 onShow 是唯一必然入口**。
// 抖音端为原生 tabBar（pages.json custom 条件编译仅微信），本调用安全无害（getTabBar 不存在即返回）。
export function syncTabBarSelected(index: number): void {
  try {
    if (typeof getCurrentPages !== "function") return;
    const pages = getCurrentPages();
    if (pages.length === 0) return;
    const current = pages[pages.length - 1] as unknown as {
      getTabBar?: () => {
        setSelected?: (i: number) => void;
        data?: { selected?: number };
        setData?: (d: { selected: number }) => void;
      } | null;
    };
    if (typeof current.getTabBar !== "function") return;
    const tabBar = current.getTabBar();
    if (tabBar == null) return;
    // 新组件 setSelected 带越界守卫与幂等；旧组件退化为守卫 setData
    if (typeof tabBar.setSelected === "function") {
      tabBar.setSelected(index);
      return;
    }
    if (tabBar.data != null && tabBar.data.selected !== index && typeof tabBar.setData === "function") {
      tabBar.setData({ selected: index });
    }
  } catch {
    // 容器异常静默：tab 同步不影响业务
  }
}
