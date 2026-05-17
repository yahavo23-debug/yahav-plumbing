import { Package } from "lucide-react";
import { useInventoryImage } from "@/hooks/useInventoryImage";
import { cn } from "@/lib/utils";

export function InventoryImage({
  path,
  alt,
  className,
}: { path: string | null | undefined; alt: string; className?: string }) {
  const url = useInventoryImage(path);
  if (!url) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
        <Package className="w-8 h-8" />
      </div>
    );
  }
  return <img src={url} alt={alt} loading="lazy" className={cn("object-cover", className)} />;
}
