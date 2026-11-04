import { Fragment, type ReactNode } from "react";

// Renders the tiny inline markup used by the marketing copy files:
// `**bold**` and `[label](/path)` (site-relative or mailto: links only).
// Copy is static and authored in-repo; nothing is injected as HTML.
const TOKEN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(((?:\/|mailto:)[^)\s]*)\)/g;

export function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    if (match[1] !== undefined) parts.push(<strong key={index}>{match[1]}</strong>);
    else parts.push(<a key={index} href={match[3]}>{match[2]}</a>);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts.map((part, i) => <Fragment key={i}>{part}</Fragment>)}</>;
}
