import { LoaderCircle } from "lucide-react";

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
};

export function PageLoader({ label = "Cargando..." }: { label?: string }) {
  return (
    <div className="panel loading-panel">
      <LoaderCircle className="loading-spinner" aria-hidden="true" />
      <span className="loading-label">{label}</span>
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <div className="panel">
      <div className="table-skeleton" style={{ ["--table-cols" as string]: columns }}>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="table-skeleton-row">
            {Array.from({ length: columns }).map((__, colIndex) => (
              <div key={`${rowIndex}-${colIndex}`} className="skeleton-line" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricSkeleton() {
  return (
    <div className="panel">
      <div className="skeleton-block h-4 w-28" />
      <div className="skeleton-block mt-3 h-8 w-20" />
    </div>
  );
}
