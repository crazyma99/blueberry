// 端口层：时钟（纯 TS 接口：可注入，防抖/超时测试用固定时钟）
export interface ClockPort {
  now(): number;
}

export const systemClock: ClockPort = {
  now: () => Date.now(),
};
