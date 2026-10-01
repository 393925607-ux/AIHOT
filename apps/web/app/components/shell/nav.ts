// Site navigation, one place for the desktop sidebar, the mobile tab bar and the mobile "更多" page.
import type { ReactNode } from "react";
import {
  IconBolt, IconMessage, IconChart,
} from "../icons";

export interface NavItem {
  to: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
  /** Match the path exactly (the home page). */
  end?: boolean;
  /** Shows the unread dot while the changelog has news. */
  changelog?: boolean;
}

export const SIDEBAR: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "内容",
    items: [
      { to: "/", label: "首页", icon: IconBolt, end: true },
      { to: "/demands", label: "真需求", icon: IconMessage },
      { to: "/claims", label: "牛皮账本", icon: IconChart },
    ],
  },
];

export const TABBAR: NavItem[] = [
  { to: "/", label: "首页", icon: IconBolt, end: true },
  { to: "/demands", label: "真需求", icon: IconMessage },
  { to: "/claims", label: "牛皮账本", icon: IconChart },
];

/** Pages reached from the mobile "更多" tab keep that tab highlighted. */
export const MORE_PATHS = ["/more", "/signals", "/demands", "/claims", "/topics", "/starred", "/leaderboard", "/codex-reset", "/agent", "/about", "/changelog", "/feedback", "/terms", "/privacy"];

export function tabIsActive(item: NavItem, pathname: string): boolean {
  if (item.end) return pathname === item.to;
  if (item.to === "/more") return MORE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (item.to === "/daily") return /^\/(daily|weekly|monthly)(\/|$)/.test(pathname);
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
