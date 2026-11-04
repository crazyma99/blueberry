// 轻提示宿主栈（零 #ifdef）。
// 背景：App.vue 无 template，无法全局挂载 wot <wd-toast />；改为"页面级 BaseFeedback 登记为宿主 + 模块栈"：
//   platform/uni/feedback.ts 的 toast() 经 showToastViaHost 投递给**栈顶且属于当前页**的宿主
//   （后挂载者优先，卸载后回到前者）；无可用宿主 → 返回 false，由调用方回落原生 uni.showToast。
// 页归属：tab 页/被压栈页挂载后并不卸载，若只看栈序，A→切到 B→回 A 时 A 的提示会投给隐藏的 B。
//   故宿主登记时记录所属页对象（getCurrentPages() 栈顶），投递时只认"当前页"的宿主；
//   取不到页栈（测试/异常容器）时 page 为 undefined ⇒ 视为通配，退化为纯栈序。
export type ToastIcon = "success" | "error" | "warning" | "info" | "loading";

export interface ToastHost {
  show: (text: string, iconName?: ToastIcon) => void;
}

interface Entry {
  host: ToastHost;
  page: unknown;
}

const stack: Entry[] = [];

/** 当前页对象（getCurrentPages() 栈顶）；取不到返回 undefined */
export function currentPageRef(): unknown {
  try {
    const g = globalThis as { getCurrentPages?: () => unknown[] };
    if (typeof g.getCurrentPages !== "function") return undefined;
    const pages = g.getCurrentPages();
    return Array.isArray(pages) && pages.length > 0 ? pages[pages.length - 1] : undefined;
  } catch {
    return undefined;
  }
}

/** 登记宿主（入栈）；返回注销函数（幂等：重复调用无副作用，且只移除自己这一项）。page 缺省取当前页。 */
export function registerToastHost(host: ToastHost, page: unknown = currentPageRef()): () => void {
  const entry: Entry = { host, page };
  stack.push(entry);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const i = stack.lastIndexOf(entry);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** 投递给栈顶且属于当前页的宿主；无可用宿主返回 false（调用方回落原生） */
export function showToastViaHost(title: string, iconName?: ToastIcon): boolean {
  const cur = currentPageRef();
  for (let i = stack.length - 1; i >= 0; i--) {
    const e = stack[i];
    if (cur === undefined || e.page === undefined || e.page === cur) {
      e.host.show(title, iconName);
      return true;
    }
  }
  return false;
}

/** 测试钩子：清空栈 */
export function resetToastHostsForTest(): void {
  stack.length = 0;
}
