import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth, AppRole } from "@/hooks/useAuth";
import { NoAccessScreen } from "@/components/layout/NoAccessScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/**
 * Workaround for Radix Dialog/AlertDialog bug where `pointer-events: none`
 * stays stuck on <body> after closing nested/stacked dialogs (desktop only —
 * mobile uses touch which bypasses this). Watches body style and clears it
 * whenever there are no open Radix overlays on the page.
 */
function PointerEventsGuard() {
  useEffect(() => {
    const cleanup = () => {
      const hasOpenOverlay = document.querySelector(
        '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]'
      );
      if (!hasOpenOverlay && document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = "";
      }
    };
    const observer = new MutationObserver(cleanup);
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"], subtree: false });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}

// Pages
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import CustomerForm from "./pages/CustomerForm";
import CustomerDetail from "./pages/CustomerDetail";
import CustomerSelect from "./pages/CustomerSelect";
import ServiceCalls from "./pages/ServiceCalls";
import ServiceCallForm from "./pages/ServiceCallForm";
import ServiceCallDetail from "./pages/ServiceCallDetail";
import Reports from "./pages/Reports";
import ReportEditor from "./pages/ReportEditor";
import PublicReport from "./pages/PublicReport";
import PublicShare from "./pages/PublicShare";
import Settings from "./pages/Settings";
import DispatchBoard from "./pages/DispatchBoard";
import Finance from "./pages/Finance";
import ProfitabilityReport from "./pages/ProfitabilityReport";
import PublicQuote from "./pages/PublicQuote";
import NotFound from "./pages/NotFound";
import CalendarPage from "./pages/CalendarPage";
import Invoices from "./pages/Invoices";

const queryClient = new QueryClient();

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: AppRole[] }) {
  const { user, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // User has no role - show waiting screen
  if (!role) {
    return <NoAccessScreen />;
  }

  // Role-based route guard
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/r/:token" element={<PublicReport />} />
      <Route path="/q/:token" element={<PublicQuote />} />
      <Route path="/s/:token" element={<PublicShare />} />

      {/* Protected routes — each wrapped in ErrorBoundary so crashes show a message not a white screen */}
      <Route path="/" element={<ProtectedRoute><ErrorBoundary><Dashboard /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><ErrorBoundary><Customers /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/customers/new" element={<ProtectedRoute allowedRoles={["admin", "secretary"]}><ErrorBoundary><CustomerForm /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/customers/:id" element={<ProtectedRoute><ErrorBoundary><CustomerDetail /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/customers/:id/edit" element={<ProtectedRoute allowedRoles={["admin", "secretary"]}><ErrorBoundary><CustomerForm /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/service-calls" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary", "contractor"]}><ErrorBoundary><ServiceCalls /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/service-calls/new" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary"]}><ErrorBoundary><CustomerSelect /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/service-calls/new/:customerId" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary"]}><ErrorBoundary><ServiceCallForm /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/service-calls/:id" element={<ProtectedRoute><ErrorBoundary><ServiceCallDetail /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/service-calls/:id/edit" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary"]}><ErrorBoundary><ServiceCallForm /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary"]}><ErrorBoundary><Reports /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/reports/:id" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary"]}><ErrorBoundary><ReportEditor /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/dispatch" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary"]}><ErrorBoundary><DispatchBoard /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary"]}><ErrorBoundary><CalendarPage /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/finance" element={<ProtectedRoute allowedRoles={["admin", "secretary"]}><ErrorBoundary><Finance /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/invoices" element={<ProtectedRoute allowedRoles={["admin", "secretary"]}><ErrorBoundary><Invoices /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/profitability" element={<ProtectedRoute allowedRoles={["admin", "secretary"]}><ErrorBoundary><ProfitabilityReport /></ErrorBoundary></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute allowedRoles={["admin"]}><ErrorBoundary><Settings /></ErrorBoundary></ProtectedRoute>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
