// P2-12 tabBar 同步工具（旧端 utils/tabbar.uts 移植）：setSelected 优先/守卫 setData 回退/容器安全。
import { afterEach, describe, expect, it } from "vitest";
import { syncTabBarSelected } from "../../src/application/tabbar";

const g = globalThis as unknown as { getCurrentPages?: () => unknown[] };
const prevPages = g.getCurrentPages;
afterEach(() => {
  g.getCurrentPages = prevPages;
});

describe("syncTabBarSelected（P2-12）", () => {
  it("优先 setSelected（新组件带守卫幂等）", () => {
    const spy = { calls: [] as number[] };
    g.getCurrentPages = () => [{ getTabBar: () => ({ setSelected: (i: number) => spy.calls.push(i) }) }];
    syncTabBarSelected(1);
    expect(spy.calls).toEqual([1]);
  });
  it("无 setSelected 时守卫 setData：值不同才写、相同不写（防无谓重绘）", () => {
    const writes: Array<{ selected: number }> = [];
    let selected = 0;
    g.getCurrentPages = () => [{
      getTabBar: () => ({
        data: { get selected() { return selected; } },
        setData: (d: { selected: number }) => { writes.push(d); selected = d.selected; },
      }),
    }];
    syncTabBarSelected(0); // 相同值：不写
    expect(writes.length).toBe(0);
    syncTabBarSelected(2); // 不同值：写一次
    expect(writes).toEqual([{ selected: 2 }]);
  });
  it("容器安全：无 getCurrentPages/空栈/无 getTabBar/返回 null/抛异常 一律静默", () => {
    delete g.getCurrentPages;
    expect(() => syncTabBarSelected(0)).not.toThrow();
    g.getCurrentPages = () => [];
    expect(() => syncTabBarSelected(0)).not.toThrow();
    g.getCurrentPages = () => [{}];
    expect(() => syncTabBarSelected(0)).not.toThrow();
    g.getCurrentPages = () => [{ getTabBar: () => null }];
    expect(() => syncTabBarSelected(0)).not.toThrow();
    g.getCurrentPages = () => [{ getTabBar: () => { throw new Error("boom"); } }];
    expect(() => syncTabBarSelected(0)).not.toThrow();
  });
});
