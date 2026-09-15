// 日期工具：相对开工日 <-> 真实日期
// 基准日取固定常量，保证同一天内反复构建结果稳定、可复现（排程不依赖当前时钟）。

export const DAY0 = "2026-09-16"; // 第 0 天

/** 相对日 -> "M月D日（周几）" */
export function fmtDay(day: number | null): string {
  if (day === null || Number.isNaN(day)) return "未排定";
  const d = new Date(DAY0 + "T00:00:00");
  d.setDate(d.getDate() + Math.round(day));
  const week = "日一二三四五六"[d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日(周${week})`;
}

/** 相对日 -> "MM-DD"（甘特紧凑展示） */
export function fmtShort(day: number | null): string {
  if (day === null || Number.isNaN(day)) return "--";
  const d = new Date(DAY0 + "T00:00:00");
  d.setDate(d.getDate() + Math.round(day));
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 时间段文字 */
export function fmtRange(start: number | null, duration: number): string {
  if (start === null) return "未排定";
  return `${fmtShort(start)} ~ ${fmtShort(start + duration - 1)}（${duration}天）`;
}

/** 两个闭区间 [aStart,aEnd]、[bStart,bEnd] 是否在同一班组上重叠（共享整日即冲突） */
export function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function yuan(n: number): string {
  return `¥${Math.round(n).toLocaleString("zh-CN")}`;
}

/** 元 -> 万元文本 */
export function wan(n: number): string {
  return `${(n / 10000).toFixed(2)}万`;
}
