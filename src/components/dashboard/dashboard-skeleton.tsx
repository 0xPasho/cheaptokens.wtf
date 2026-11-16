import { Skeleton } from "@/components/ui/skeleton";

/** Lo que se ve mientras llega una vista del dashboard: la forma de los paneles (docs/13 › Skeleton). */
export function DashboardSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="mt-8 flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28 rounded-3xl" />)}
      </div>
    </div>
  );
}
