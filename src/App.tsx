import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth, AppRole } from "@/hooks/useAuth";
import { NoAccessScreen } from "@/components/layout/NoAccessScreen";

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
import MarketingAnalytics from "./pages/MarketingAnalytics";
import ProfitabilityReport from "./pages/ProfitabilityReport";
import PublicQuote from "./pages/PublicQuote";
import NotFound from "./pages/NotFound";

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

      {/* Protected routes */}
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
      <Route path="/customers/new" element={<ProtectedRoute allowedRoles={["admin", "secretary"]}><CustomerForm /></ProtectedRoute>} />
      <Route path="/customers/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
      <Route path="/customers/:id/edit" element={<ProtectedRoute allowedRoles={["admin", "secretary"]}><CustomerForm /></ProtectedRoute>} />
      <Route path="/service-calls" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary", "contractor"]}><ServiceCalls /></ProtectedRoute>} />
      <Route path="/service-calls/new" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary"]}><CustomerSelect /></ProtectedRoute>} />
      <Route path="/service-calls/new/:customerId" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary"]}><ServiceCallForm /></ProtectedRoute>} />
      <Route path="/service-calls/:id" element={<ProtectedRoute><ServiceCallDetail /></ProtectedRoute>} />
      <Route path="/service-calls/:id/edit" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary"]}><ServiceCallForm /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary"]}><Reports /></ProtectedRoute>} />
      <Route path="/reports/:id" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary"]}><ReportEditor /></ProtectedRoute>} />
      <Route path="/dispatch" element={<ProtectedRoute allowedRoles={["admin", "technician", "secretary"]}><DispatchBoard /></ProtectedRoute>} />
      <Route path="/finance" element={<ProtectedRoute allowedRoles={["admin", "secretary"]}><Finance /></ProtectedRoute>} />
      <Route path="/marketing" element={<ProtectedRoute allowedRoles={["admin"]}><MarketingAnalytics /></ProtectedRoute>} />
      <Route path="/profitability" element={<ProtectedRoute allowedRoles={["admin", "secretary"]}><ProfitabilityReport /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute allowedRoles={["admin"]}><Settings /></ProtectedRoute>} />

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
