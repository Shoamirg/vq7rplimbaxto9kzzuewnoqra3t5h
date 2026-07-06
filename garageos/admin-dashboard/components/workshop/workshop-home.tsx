"use client";

import { useEffect, useState } from "react";
import { Wrench, Loader2 } from "lucide-react";

import { clientFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { JobRow, type JobCard } from "./job-card";

type JobsResponse = { today: JobCard[]; upcoming: JobCard[]; in_progress_count: number };

export function WorkshopHome() {
  const { t } = useI18n();
  const [data, setData] = useState<JobsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientFetch<JobsResponse>("/workshop/jobs")
      .then(setData)
      .catch(() => setData({ today: [], upcoming: [], in_progress_count: 0 }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid place-items-center py-20 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const today = data?.today ?? [];
  const upcoming = data?.upcoming ?? [];
  const total = today.length + upcoming.length;

  if (total === 0) {
    return (
      <div className="grid place-items-center py-20 text-center">
        <div className="mb-3 grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
          <Wrench className="size-7" />
        </div>
        <p className="font-semibold text-foreground">{t("workshop.empty_title")}</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{t("workshop.empty_desc")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 px-1 text-sm font-bold text-foreground">
          {t("workshop.today")}
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{today.length}</span>
        </h2>
        {today.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t("workshop.none_today")}
          </p>
        ) : (
          <div className="space-y-2">{today.map((j) => <JobRow key={j.id} job={j} />)}</div>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-bold text-foreground">{t("workshop.upcoming")}</h2>
          <div className="space-y-2">{upcoming.map((j) => <JobRow key={j.id} job={j} />)}</div>
        </section>
      )}
    </div>
  );
}
