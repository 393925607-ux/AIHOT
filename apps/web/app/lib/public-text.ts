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
  ["AI 编程模型仅在 46% 的情况下陈述其假设", "人工智能编程模型只有约 46% 的情况下会说明自己的假设"],
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

const ALLOWED_TERMS = new Set(
  "Windows Computer Use Claude Code Codex ChatGPT Chrome MCP GitHub OpenAI Gemini Qwen Snowflake Hacker News Agent Browser Remote Desktop Android iOS macOS Linux CLI API URL HTTP RPC GPU GB MB OOM Xcode PowerShell Benchmark SOTA GPT SWE Pro Fable Cowork MSIX WebView2 Electron Chromium Apple Safari Finder WSL AWS HTTPS_PROXY Bedrock SSO DNS sky getApp listApps Trusted Darwin App Sol Ultra"
    .split(" "),
);

const TECHNICAL_PHRASES: Array<[string, string]> = [
  ["A saved user permission setting blocks this action", "已保存的浏览器权限设置阻止了此操作"],
  ["saved browser permissions could not be verified", "已保存的浏览器权限无法验证"],
  ["Trusted RPC service is not configured: sky", "可信 RPC 服务未配置：sky"],
  ["Missing HCS services: vfpext", "缺少 HCS 服务：vfpext"],
  ["Steered conversation", "转向中的对话"],
];

function normalizeTechnicalPhrases(value: string): string {
  return TECHNICAL_PHRASES.reduce((text, [source, target]) => text.replaceAll(source, target), value);
}

function isReaderFacingChinese(value: string): boolean {
  if (!/[\u3400-\u9fff]/.test(value)) return false;
  const words = value.match(/[A-Za-z][A-Za-z0-9_.@/-]*/g) ?? [];
  return words.every((word) => ALLOWED_TERMS.has(word) || /^\d/.test(word));
}

export function publicText(value: string | null | undefined, fallback: string): string {
  const text = value?.trim();
  if (!text) return fallback;
  const exact = EXACT_TRANSLATIONS.get(text);
  if (exact) return exact;
  const prefix = PREFIX_TRANSLATIONS.find(([source]) => text.startsWith(source));
  if (prefix) return prefix[1];
  const normalized = normalizeTechnicalPhrases(text);
  return isReaderFacingChinese(normalized) ? normalized : fallback;
}

export function displaySource(value: string | null | undefined): string {
  const text = value?.toLowerCase() ?? "";
  if (text.includes("github")) return "GitHub";
  if (text.includes("hacker") || text === "hn") return "Hacker News";
  if (text.includes("openai")) return "OpenAI 社区";
  if (text.includes("reddit")) return "讨论社区";
  return "公开来源";
}

export function displayClaimant(value: string | null | undefined): string {
  if (value === "Alibaba / Qwen") return "阿里巴巴 / 通义千问";
  if (value === "OliverDB / OliverAI") return "奥利弗数据库";
  if (value === "Bito") return "比托";
  return value && !/[A-Za-z]/.test(value) ? value : "未标注提出方";
}
