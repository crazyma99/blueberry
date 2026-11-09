// 拨号平台适配（商家端「客人手机号一键拨打」· issue #14）。
// 平台 API 只许落在 src/platform/**（SPEC §二①）：商家页面经本适配器拨号，不直调 uni.makePhoneCall。
// 容器安全：API 缺失（测试/异常容器）⇒ 返回 false，不抛；用户在系统拨号面板取消属正常，不算失败。
export interface DialerPort {
  /** 拉起系统拨号面板；返回是否**成功发起**（容器无该能力 ⇒ false，由调用方给文案兜底，如提示复制号码） */
  call(phone: string): Promise<boolean>;
}

export function createUniDialer(): DialerPort {
  return {
    call(phone: string): Promise<boolean> {
      return new Promise((resolve) => {
        const num = typeof phone === "string" ? phone.trim() : "";
        if (num === "" || typeof uni === "undefined" || typeof uni.makePhoneCall !== "function") {
          resolve(false);
          return;
        }
        try {
          uni.makePhoneCall({
            phoneNumber: num,
            success: () => resolve(true),
            // 用户在拨号面板点取消也会走 fail（errMsg 含 cancel）：这是用户主动行为，不当作故障
            fail: (err: { errMsg?: string }) => resolve(typeof err?.errMsg === "string" && err.errMsg.includes("cancel")),
          });
        } catch {
          resolve(false);
        }
      });
    },
  };
}
