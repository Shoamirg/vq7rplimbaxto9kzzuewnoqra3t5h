import { MARKETING_LINKS } from "@/lib/marketing-i18n";

// Server-rendered content pages import these links directly. The interactive
// navigation and footer remain client components behind this shared entry point.
export const DEMO_HREF = MARKETING_LINKS.demo;
export const SIGN_IN_HREF = MARKETING_LINKS.signIn;
export const LIVE_DEMO_HREF = MARKETING_LINKS.liveDemo;

export { MarketingFooter, MarketingCta } from "./marketing-i18n-provider";
export { MarketingNav } from "./site-nav";
