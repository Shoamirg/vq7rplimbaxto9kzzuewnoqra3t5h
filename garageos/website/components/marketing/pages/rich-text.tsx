"use client";

import { Fragment, type ReactNode } from "react";

import { useMarketingI18n } from "@/components/marketing/marketing-i18n-provider";

// Renders the tiny inline markup used by the marketing copy files:
// `**bold**` and `[label](/path)` (site-relative or mailto: links only).
// Site-relative links are kept in the reader's language ("/security" -> "/ru/security").
// Copy is static and authored in-repo; nothing is injected as HTML.
const TOKEN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(((?:\/|mailto:)[^)\s]*)\)/g;

export function RichText({ text }: { text: string }) {
  const { href } = useMarketingI18n();
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    if (match[1] !== undefined) parts.push(<strong key={index}>{match[1]}</strong>);
    else parts.push(<a key={index} href={href(match[3])}>{match[2]}</a>);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts.map((part, i) => <Fragment key={i}>{part}</Fragment>)}</>;
}
