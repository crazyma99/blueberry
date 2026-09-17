// 数字展示格式（旧端 format.uts:10-15 忠实移植）：≥1万显示 x.x万。
export function formatCount(count: number): string {
  if (count >= 10000) {
    return (count / 10000).toFixed(1) + "万";
  }
  return String(count || 0);
}
