import { useNavigate, useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { useLogo } from "@/hooks/useLogo";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Wrench,
  FileText,
  LogOut,
  Settings,
  ChevronRight,
  CalendarDays,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavItem {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  roles: AppRole[] | "all"; // which roles can see this item
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "לוח בקרה", path: "/", roles: "all" },
  { icon: CalendarDays, label: "לוח שיבוץ", path: "/dispatch", roles: ["admin", "technician", "secretary"] },
  { icon: Users, label: "לקוחות", path: "/customers", roles: "all" },
  { icon: Wrench, label: "קריאות שירות", path: "/service-calls", roles: ["admin", "technician", "secretary", "contractor"] },
  { icon: FileText, label: "דוחות", path: "/reports", roles: ["admin", "technician", "secretary"] },
  { icon: Wallet, label: "כספים", path: "/finance", roles: ["admin", "secretary"] },
];

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, role } = useAuth();
  const { logoUrl } = useLogo();

  const visibleItems = navItems.filter(
    (item) => item.roles === "all" || (role && item.roles.includes(role))
  );

  return (
    <aside
      className={cn(
        "fixed top-0 right-0 h-full bg-sidebar text-sidebar-foreground z-40 transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-xl object-contain shrink-0" />
        ) : (
          <div className="w-10 h-10 bg-sidebar-primary rounded-xl flex items-center justify-center shrink-0">
            <Wrench className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
        )}
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="font-bold text-base text-sidebar-primary-foreground truncate">Yahav CRM</h1>
            <p className="text-xs text-sidebar-foreground/60 truncate">ניהול שירות</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 mt-2">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== "/" && location.pathname.startsWith(item.path));
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-sm font-medium",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-1">
        {role === "admin" && (
          <button
            onClick={() => navigate("/settings")}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors text-sm"
          >
            <Settings className="w-5 h-5 shrink-0" />
            {!collapsed && <span>הגדרות</span>}
          </button>
        )}
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-destructive hover:bg-sidebar-accent transition-colors text-sm"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>התנתק</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute top-1/2 -left-3 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center shadow-sm hover:bg-accent transition-colors"
      >
        <ChevronRight
          className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", !collapsed && "rotate-180")}
        />
      </button>
    </aside>
  );
}
