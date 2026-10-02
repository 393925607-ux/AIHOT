/**
 * 中文安全展示：只接受数据库已经生成的中文字段。
 * 原始英文、技术日志和用户名不在前台做运行时翻译，调用方应提供中文 fallback。
 */
const EXACT_TRANSLATIONS = new Map<string, string>([
  ["No Text-to-Speech Option Available in Codex Mobile", "编程助手移动版缺少文字转语音功能"],
  ["Codex IDE plugin silently eats messages", "编程助手集成插件会悄悄吞掉消息"],
  ["More useful context sharing (by forking or otherwise)", "通过分支等方式复用会话上下文时，多个分支会把对话合并错"],
  ["ChatGPT Desktop: branch selection missing when starting a new Codex chat", "桌面版开始新的编程助手对话时找不到分支选择"],
  ["Codex frequently cannot read files in cloud projects", "编程助手经常无法读取云端项目文件"],
  ["AI coding models state their assumptions only 46% of the time", "人工智能编程模型只有约 46% 的情况下会说明自己的假设"],
  ["Qwen Image 2.1 以极小的 70 亿参数模型击败 Google Nano Banana 2.0", "通义千问图像模型 2.1 以 70 亿参数模型击败谷歌香蕉模型 2.0"],
  ["OliverDB：相对 Snowflake 为 9.67 倍，计算量少 8 倍", "奥利弗数据库：相对雪花数据仓库快 9.67 倍，计算量少 8 倍"],
]);
const PREFIX_TRANSLATIONS: Array<[string, string]> = [
  ["No Text-to-Speech Option Available in Codex Mobile", "编程助手移动版缺少文字转语音功能"],
  ["Codex IDE plugin silently eats messages", "编程助手集成插件会悄悄吞掉消息"],
  ["More useful context sharing", "通过分支等方式复用会话上下文时，多个分支会把对话合并错"],
  ["ChatGPT Desktop: branch selection missing", "桌面版开始新的编程助手对话时找不到分支选择"],
  ["Codex frequently cannot read files in cloud projects", "编程助手经常无法读取云端项目文件"],
];

export function publicText(value: string | null | undefined, fallback: string): string {
  const text = value?.trim();
  if (!text) return fallback;
  const exact = EXACT_TRANSLATIONS.get(text);
  if (exact) return exact;
  const prefix = PREFIX_TRANSLATIONS.find(([source]) => text.startsWith(source));
  if (prefix) return prefix[1];
  if (/[A-Za-z]/.test(text)) return fallback;
  return text;
}

export function displaySource(value: string | null | undefined): string {
  const text = value?.toLowerCase() ?? "";
  if (text.includes("github")) return "代码托管平台";
  if (text.includes("hacker") || text === "hn") return "技术社区";
  if (text.includes("openai")) return "开发者社区";
  if (text.includes("reddit")) return "讨论社区";
  return "公开来源";
}

export function displayClaimant(value: string | null | undefined): string {
  if (value === "Alibaba / Qwen") return "阿里巴巴 / 通义千问";
  if (value === "OliverDB / OliverAI") return "奥利弗数据库";
  if (value === "Bito") return "比托";
  return value && !/[A-Za-z]/.test(value) ? value : "未标注提出方";
}
