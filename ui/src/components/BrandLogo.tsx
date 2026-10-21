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
          "flex h-7 w-7 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground shadow-xs select-none shrink-0",
          className
        )}
        title={branding.productName}
        aria-label={branding.productName}
      >
        <span className="text-xs font-black tracking-tight">AI</span>
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
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground shadow-xs shrink-0">
        <span className="text-xs font-black tracking-tight">AI</span>
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-sm font-bold tracking-tight">
          {branding.productName}
        </span>
      </div>
    </div>
  );
}
