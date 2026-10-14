"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  cn,
} from "@garageos/design-system";
import { Check, Languages } from "lucide-react";

import { LOCALES, LOCALE_META } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/lib/i18n/context";

// Language picker for the top bar. Switching is instant (client state) and
// persisted to a cookie so the next server render uses the same language.
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const active = LOCALE_META[locale];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 min-h-11 min-w-11 justify-center px-2 py-2 rounded-lg hover:bg-muted transition-colors"
          aria-label={t("menu.language")}
        >
          <Languages className="size-4 text-muted-foreground" />
          <span className="hidden md:inline text-sm font-medium text-foreground">{active.flag}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t("menu.language")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LOCALES.map((l) => {
          const meta = LOCALE_META[l];
          const isActive = l === locale;
          return (
            <DropdownMenuItem
              key={l}
              onClick={() => setLocale(l)}
              className={cn(isActive && "font-semibold")}
            >
              <span className="mr-2">{meta.flag}</span>
              <span className="flex-1">{meta.native}</span>
              {isActive && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
