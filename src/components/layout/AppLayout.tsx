import { useState, ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Menu, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
}

function ContractorBanner() {
  return (
    <div className="bg-warning/15 border-b border-warning/30 px-4 py-2 flex items-center justify-center gap-2 text-warning text-sm font-medium">
      <Eye className="w-4 h-4" />
      <span>מצב צפייה בלבד — אין אפשרות לערוך או לשנות נתונים</span>
    </div>
  );
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { role } = useAuth();
  const isContractor = role === "contractor";

  if (isMobile) {
    return (
      <div className={cn("min-h-screen bg-background", isContractor && "contractor-lockdown")}>
        {isContractor && <ContractorBanner />}
        {/* Mobile header */}
        <header className="sticky top-0 z-30 h-14 bg-card border-b border-border flex items-center px-4 gap-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 w-64 bg-sidebar">
              <SheetTitle className="sr-only">תפריט ניווט</SheetTitle>
              <AppSidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          {title && <h1 className="font-semibold text-lg">{title}</h1>}
        </header>
        <main className="p-4">{children}</main>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen bg-background", isContractor && "contractor-lockdown")}>
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main
        className={cn(
          "transition-all duration-300 min-h-screen",
          collapsed ? "mr-16" : "mr-64"
        )}
      >
        {isContractor && <ContractorBanner />}
        {title && (
          <header className="sticky top-0 z-20 h-16 bg-background/80 backdrop-blur-sm border-b border-border flex items-center px-6">
            <h1 className="text-xl font-bold">{title}</h1>
          </header>
        )}
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
