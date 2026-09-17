// P2-08 登录同意/拒绝流程：未同意协议时阻断登录（旧端 mine:263「请先同意用户协议和隐私政策」语义）。
// 同意状态为运行态内存（与旧端 loginAgreementChecked 一致：不持久化，每次冷启动重新勾选）。
export interface ConsentGate {
  readonly agreed: boolean;
  agree(): void;
  reject(): void;
  /** 登录前置校验：未同意返回 false（调用方 toast 提示并引导打开协议页） */
  ensure(): boolean;
}

export function createConsentGate(): ConsentGate {
  let agreed = false;
  return {
    get agreed() {
      return agreed;
    },
    agree: () => {
      agreed = true;
    },
    reject: () => {
      agreed = false;
    },
    ensure: () => agreed,
  };
}
