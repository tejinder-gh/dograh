import { branding } from "@/config/branding";
import { cn } from "@/lib/utils";

// Reusable product wordmark and logo mark. Theme-aware and bound to centralized branding configuration.
export function BrandLogo({
  className,
  inverse = false,
  mark = false,
}: {
  className?: string;
  inverse?: boolean;
  mark?: boolean;
}) {
  if (mark) {
    return (
      <div
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-primary to-violet-600 font-bold text-primary-foreground shadow-xs select-none shrink-0 ring-1 ring-white/10",
          className
        )}
        title={branding.productName}
        aria-label={branding.productName}
      >
        <span className="text-xs font-black tracking-tighter">A</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 select-none",
        inverse ? "text-white" : "text-foreground",
        className
      )}
      title={branding.productName}
      aria-label={branding.productName}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-primary to-violet-600 font-bold text-primary-foreground shadow-xs shrink-0 ring-1 ring-white/10">
        <span className="text-xs font-black tracking-tighter">A</span>
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-sm font-bold tracking-tight">
          {branding.productName}
        </span>
      </div>
    </div>
  );
}
