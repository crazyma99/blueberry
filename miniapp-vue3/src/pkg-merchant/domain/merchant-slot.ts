// 商家端档期管理：纯逻辑（校验/排序/载荷/模板预览文案）· issue #14 M1。**纯函数**，无平台依赖。
//
// 后端契约（只读核对 lanmei-backend-golang `internal/admin/handler/booking.go`、`internal/service/booking.go`、`booking_slot_template.go`）：
//   · GET  /booking/slots[?date=YYYY-MM-DD] → SlotView[]（id/merchantId/shopId/startTime/endTime/capacity/status/createTime/updateTime；status 1 启用 0 停用）。
//     后端 PR #43：**传了 date 才**在每个档期多返回整数 `bookedGuests`（无预约显式为 0；待确认/已确认/保留期内待支付按 guest_count 求和，
//     已取消/已完成/爽约不计；停用档期也返回）；不传 date 则无该字段；非法 date 返回 HTTP200+code=500「日期格式应为 YYYY-MM-DD」。
//     ⇒ 本端：**只有请求带了合法 date 且响应里真有该整数字段才显示「已占」**；字段缺失（后端未部署/旧版）一律不显示（绝不显示 0 误导）；
//   · POST /booking/slots {startTime,endTime,capacity,status?}：HH:mm 且 start<end；容量 1..500；同商家同起止时间唯一；
//     **启用档期之间时间不得重叠**（半开区间，首尾相接不算；冲突文案「与已有启用档期 HH:mm-HH:mm 时间重叠」由后端给，原样展示）；
//   · PUT  /booking/slots/:id {capacity?, status?}：**至少传一个**；时间创建后不可改；改小容量/停用允许、不影响已有预约；
//     重新启用同样校验不与其它启用档期重叠；
//   · GET  /booking/slot-templates → [{id:string, merchantId, name, builtin, items:[{startTime,endTime,capacity}], updatedAt}]（内置模板恒在第 0 项，id="builtin-default"）；
//   · POST /booking/slot-templates/:id/apply {dryRun(**必填**), capacity?}：权限 booking_slot_template，**另需 booking_slot**；
//     结果 {dryRun,templateId,templateName,created[],skipped[],conflicts[],summary{created,skipped,conflicts}}；
//     同起止已存在（含停用）⇒ skipped；与现有启用档期重叠 ⇒ conflicts（该项不创建）；dryRun=true 绝不写库。
//   M1 只做模板「查看 + 套用」，不做模板自身的增删改。
export const SLOT_CAPACITY_MIN = 1;
export const SLOT_CAPACITY_MAX = 500;
export const SLOT_STATUS_ENABLED = 1;
export const SLOT_STATUS_DISABLED = 0;

export interface MerchantSlotView {
  id: number;
  startTime: string;
  endTime: string;
  capacity: number;
  /** 1 启用 / 0 停用 */
  status: number;
  /** 所选日期该档期已占人数（guest_count 之和）；**null＝响应里没有该字段 ⇒ 页面不显示「已占」**（不得当 0） */
  bookedGuests: number | null;
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidHHmm(v: string): boolean {
  return HHMM_RE.test(v);
}

export type SlotFormError = { field: "startTime" | "endTime" | "capacity"; message: string };

/** 解析容量输入：只接受纯数字串（拒绝 "5.5"/"1e2"/"0x10"/空白）；返回整数或 null */
export function parseCapacity(raw: string | number): number | null {
  if (typeof raw === "number") return Number.isInteger(raw) ? raw : null;
  const t = String(raw).trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  return Number.parseInt(t, 10);
}

export function validateCapacity(raw: string | number): { ok: true; value: number } | { ok: false; message: string } {
  const n = parseCapacity(raw);
  if (n == null || n < SLOT_CAPACITY_MIN || n > SLOT_CAPACITY_MAX) {
    return { ok: false, message: `容量需为 ${SLOT_CAPACITY_MIN}-${SLOT_CAPACITY_MAX} 的整数` };
  }
  return { ok: true, value: n };
}

/** 新增档期表单校验（与后端 normalizeSlotTimes/checkSlotCapacity 同口径；后端仍是最终关卡） */
export function validateNewSlot(input: { startTime: string; endTime: string; capacity: string | number }):
  | { ok: true; body: { startTime: string; endTime: string; capacity: number } }
  | { ok: false; error: SlotFormError } {
  const start = input.startTime.trim();
  const end = input.endTime.trim();
  if (!isValidHHmm(start)) return { ok: false, error: { field: "startTime", message: "请选择开始时间" } };
  if (!isValidHHmm(end)) return { ok: false, error: { field: "endTime", message: "请选择结束时间" } };
  if (start >= end) return { ok: false, error: { field: "endTime", message: "开始时间必须早于结束时间" } };
  const cap = validateCapacity(input.capacity);
  if (!cap.ok) return { ok: false, error: { field: "capacity", message: cap.message } };
  return { ok: true, body: { startTime: start, endTime: end, capacity: cap.value } };
}

/** 修改载荷：capacity/status 至少一个；仅包含**真正变化**的字段（避免无谓写审计） */
export type SlotPatch = { capacity?: number; status?: 0 | 1 };

export function buildSlotPatch(
  current: Pick<MerchantSlotView, "capacity" | "status">,
  next: { capacity?: string | number; status?: number },
): { ok: true; patch: SlotPatch } | { ok: false; message: string } {
  const patch: SlotPatch = {};
  if (next.capacity !== undefined) {
    const cap = validateCapacity(next.capacity);
    if (!cap.ok) return { ok: false, message: cap.message };
    if (cap.value !== current.capacity) patch.capacity = cap.value;
  }
  if (next.status !== undefined) {
    if (next.status !== SLOT_STATUS_ENABLED && next.status !== SLOT_STATUS_DISABLED) return { ok: false, message: "状态只能是启用或停用" };
    if (next.status !== current.status) patch.status = next.status as 0 | 1;
  }
  if (patch.capacity === undefined && patch.status === undefined) return { ok: false, message: "没有需要修改的内容" };
  return { ok: true, patch };
}

/** 档期按开始时间升序（同起点按结束时间），稳定排序；不修改入参 */
export function sortSlots<T extends Pick<MerchantSlotView, "startTime" | "endTime" | "id">>(list: readonly T[]): T[] {
  return list.slice().sort((a, b) => (a.startTime === b.startTime ? (a.endTime === b.endTime ? a.id - b.id : a.endTime < b.endTime ? -1 : 1) : a.startTime < b.startTime ? -1 : 1));
}

export function describeSlotStatus(status: number): { label: string; tone: "action" | "muted" } {
  return status === SLOT_STATUS_ENABLED ? { label: "启用", tone: "action" } : { label: "停用", tone: "muted" };
}

/** 容量下调/停用的确认提示（后端允许且不影响已有预约；明示给商家，避免误以为会取消已有预约） */
export const SLOT_REDUCE_NOTICE = "已有预约不受影响，仅新的预约会受限制";

export function slotChangeConfirmCopy(
  slot: Pick<MerchantSlotView, "startTime" | "endTime" | "capacity" | "status">,
  patch: SlotPatch,
): { title: string; msg: string } | null {
  const range = `${slot.startTime}-${slot.endTime}`;
  if (patch.status === SLOT_STATUS_DISABLED) {
    return { title: "停用档期", msg: `停用 ${range} 档期后客人将无法再预约该时段。${SLOT_REDUCE_NOTICE}。` };
  }
  if (patch.capacity !== undefined && patch.capacity < slot.capacity) {
    return { title: "调低容量", msg: `将 ${range} 的容量由 ${slot.capacity} 调为 ${patch.capacity}。${SLOT_REDUCE_NOTICE}。` };
  }
  return null; // 启用/调高容量：无需确认
}

function toInt(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
}
function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * 规整服务端 SlotView。`bookedGuests` 只接受**非负整数**（number）；缺失/null/字符串/小数/负数/NaN 一律视为「没有该字段」⇒ null，
 * 页面据此不显示「已占」（而不是显示 0）。
 */
export function normalizeSlot(raw: unknown): MerchantSlotView {
  const s = (raw ?? {}) as Record<string, unknown>;
  const bg = s.bookedGuests;
  const bookedGuests = typeof bg === "number" && Number.isInteger(bg) && bg >= 0 ? bg : null;
  return { id: toInt(s.id), startTime: toStr(s.startTime), endTime: toStr(s.endTime), capacity: toInt(s.capacity), status: toInt(s.status), bookedGuests };
}

/** 「已占 X / 容量 Y」文案；bookedGuests 为 null ⇒ 返回 ""（不显示） */
export function describeBooked(slot: Pick<MerchantSlotView, "bookedGuests" | "capacity">): string {
  return slot.bookedGuests == null ? "" : `已占 ${slot.bookedGuests} / 容量 ${slot.capacity}`;
}

// ——— 日期（严格 YYYY-MM-DD，且必须是真实存在的日历日）———
const DATE_STRICT_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateStr(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = DATE_STRICT_RE.exec(v);
  if (m == null) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // 当月天数（含闰年）
  return d <= dim;
}

export interface SlotDateOption {
  label: string;
  /** YYYY-MM-DD */
  value: string;
}

const WEEKS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function p2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}
/** 本地日期 → YYYY-MM-DD（不经 UTC，按「自然日」） */
export function toDateStr(d: Date): string {
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}

/** 档期日期选项：今天前 `past` 天 ～ 今天后 `ahead` 天（含今天），可注入 now；value 严格 YYYY-MM-DD */
export function buildSlotDateOptions(now: Date = new Date(), past = 7, ahead = 30): SlotDateOption[] {
  const out: SlotDateOption[] = [];
  for (let i = -past; i <= ahead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const tag = i === 0 ? "今天" : i === 1 ? "明天" : WEEKS[d.getDay()];
    out.push({ label: `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${tag}`, value: toDateStr(d) });
  }
  return out;
}

// ——— 档期模板 ———
export interface SlotTemplateItem {
  startTime: string;
  endTime: string;
  capacity: number;
}
export interface SlotTemplateView {
  /** 字符串 ID：自定义 "12"，内置 "builtin-default" */
  id: string;
  name: string;
  builtin: boolean;
  items: SlotTemplateItem[];
}

export function normalizeTemplate(raw: unknown): SlotTemplateView {
  const t = (raw ?? {}) as Record<string, unknown>;
  const items = Array.isArray(t.items) ? t.items.map((i) => {
    const x = (i ?? {}) as Record<string, unknown>;
    return { startTime: toStr(x.startTime), endTime: toStr(x.endTime), capacity: toInt(x.capacity) };
  }) : [];
  return { id: toStr(t.id), name: toStr(t.name), builtin: t.builtin === true, items };
}

export interface TemplateApplyResult {
  dryRun: boolean;
  templateName: string;
  created: Array<{ startTime: string; endTime: string; capacity: number }>;
  skipped: Array<{ startTime: string; endTime: string }>;
  conflicts: Array<{ startTime: string; endTime: string; withRange: string }>;
  summary: { created: number; skipped: number; conflicts: number };
}

export function normalizeApplyResult(raw: unknown): TemplateApplyResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  const created = arr(r.created).map((c) => ({ startTime: toStr(c.startTime), endTime: toStr(c.endTime), capacity: toInt(c.capacity) }));
  const skipped = arr(r.skipped).map((c) => ({ startTime: toStr(c.startTime), endTime: toStr(c.endTime) }));
  const conflicts = arr(r.conflicts).map((c) => {
    const w = (c.with ?? {}) as Record<string, unknown>;
    return { startTime: toStr(c.startTime), endTime: toStr(c.endTime), withRange: toStr(w.startTime) + "-" + toStr(w.endTime) };
  });
  const s = (r.summary ?? {}) as Record<string, unknown>;
  return {
    dryRun: r.dryRun === true,
    templateName: toStr(r.templateName),
    created,
    skipped,
    conflicts,
    summary: {
      created: s.created === undefined ? created.length : toInt(s.created),
      skipped: s.skipped === undefined ? skipped.length : toInt(s.skipped),
      conflicts: s.conflicts === undefined ? conflicts.length : toInt(s.conflicts),
    },
  };
}

/** 预览文案（dryRun 结果 → 确认框正文）：说明将新增/跳过/冲突各几条；冲突逐条列出现有重叠档期 */
export function describeApplyPreview(res: TemplateApplyResult): string {
  const { created, skipped, conflicts } = res.summary;
  const lines = [`将新增 ${created} 个档期，跳过 ${skipped} 个（已存在），冲突 ${conflicts} 个（与已启用档期重叠，不会创建）。`];
  if (res.conflicts.length > 0) {
    lines.push("冲突：" + res.conflicts.slice(0, 5).map((c) => `${c.startTime}-${c.endTime} 与 ${c.withRange}`).join("；") + (res.conflicts.length > 5 ? " 等" : ""));
  }
  return lines.join("\n");
}

/** 套用结果可执行：至少新增 1 个才值得确认（全跳过/全冲突 ⇒ 不给「确认套用」） */
export function canConfirmApply(res: TemplateApplyResult): boolean {
  return res.summary.created > 0;
}

export function describeApplyDone(res: TemplateApplyResult): string {
  return `已新增 ${res.summary.created} 个档期` + (res.summary.skipped > 0 ? `，跳过 ${res.summary.skipped} 个` : "") + (res.summary.conflicts > 0 ? `，${res.summary.conflicts} 个因冲突未创建` : "");
}
