import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { NoAccessScreen } from "@/components/layout/NoAccessScreen";

// Pages
import Auth from "./pages/Auth";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
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

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/auth" element={<Auth />} />
      <Route path="/r/:token" element={<PublicReport />} />
      <Route path="/s/:token" element={<PublicShare />} />

      {/* Protected routes */}
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
      <Route path="/customers/new" element={<ProtectedRoute><CustomerForm /></ProtectedRoute>} />
      <Route path="/customers/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
      <Route path="/customers/:id/edit" element={<ProtectedRoute><CustomerForm /></ProtectedRoute>} />
      <Route path="/service-calls" element={<ProtectedRoute><ServiceCalls /></ProtectedRoute>} />
      <Route path="/service-calls/new" element={<ProtectedRoute><CustomerSelect /></ProtectedRoute>} />
      <Route path="/service-calls/new/:customerId" element={<ProtectedRoute><ServiceCallForm /></ProtectedRoute>} />
      <Route path="/service-calls/:id" element={<ProtectedRoute><ServiceCallDetail /></ProtectedRoute>} />
      <Route path="/service-calls/:id/edit" element={<ProtectedRoute><ServiceCallForm /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/reports/:id" element={<ProtectedRoute><ReportEditor /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

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
