import { Component, type ReactNode } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center" dir="rtl">
          <AlertTriangle className="w-12 h-12 text-destructive opacity-70" />
          <h2 className="text-xl font-bold">משהו השתבש</h2>
          <p className="text-muted-foreground text-sm max-w-sm">
            אירעה שגיאה בטעינת הדף. לחץ על רענון כדי לנסות שוב.
          </p>
          {this.state.error && (
            <code className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded max-w-sm break-all">
              {this.state.error.message}
            </code>
          )}
          <div className="flex gap-2">
            <Button onClick={this.handleReset} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              נסה שוב
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              רענן דף
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
