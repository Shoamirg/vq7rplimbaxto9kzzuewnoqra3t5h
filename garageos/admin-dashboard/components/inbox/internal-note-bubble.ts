import { createElement, type ReactNode } from "react";

type InternalNoteBubbleProps = { label: string; body: ReactNode; timestamp: ReactNode };

export function InternalNoteBubble({ label, body, timestamp }: InternalNoteBubbleProps) {
  return createElement("div", { className: "mx-auto w-[88%] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2" },
    createElement("p", { className: "text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1" }, label),
    createElement("p", { className: "text-[13px] text-amber-900 whitespace-pre-wrap" }, body),
    timestamp,
  );
}
