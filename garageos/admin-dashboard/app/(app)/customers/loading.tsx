import { Bar, CardShell } from "@/components/skeletons/skel";

export default function CustomersLoading() {
  return (
    <div className="p-4 lg:p-6 space-y-6" aria-busy="true" aria-label="Loading customers">
      <div className="flex items-center justify-between">
        <div className="space-y-2"><Bar className="h-7 w-40" /><Bar className="h-4 w-64" /></div>
        <Bar className="h-10 w-64 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <CardShell key={i} className="p-4">
            <div className="flex items-center gap-3">
              <Bar className="size-11 rounded-xl" />
              <div className="flex-1 space-y-2"><Bar className="h-3.5 w-32" /><Bar className="h-3 w-24" /></div>
            </div>
            <div className="mt-3 flex justify-between"><Bar className="h-3 w-20" /><Bar className="h-3 w-14" /></div>
          </CardShell>
        ))}
      </div>
    </div>
  );
}
