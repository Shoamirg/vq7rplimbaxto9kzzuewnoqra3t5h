import { Skeleton } from "@garageos/design-system";

export default function VehicleLoading() {
  return (
    <div className="p-4 lg:p-6 space-y-5">
      <Skeleton className="h-4 w-40" />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Skeleton className="h-28 rounded-xl xl:col-span-2" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <Skeleton className="h-9 w-96 max-w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}
