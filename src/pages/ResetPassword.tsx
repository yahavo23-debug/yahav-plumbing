import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useLogo } from "@/hooks/useLogo";
import { Wrench } from "lucide-react";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const { logoUrl } = useLogo();

  useEffect(() => {
    // Supabase puts the recovery token in the URL hash and triggers PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also check existing session (in case event already fired)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "שגיאה", description: "הסיסמה חייבת להכיל לפחות 6 תווים", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "שגיאה", description: "הסיסמאות אינן תואמות", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "הסיסמה עודכנה בהצלחה" });
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="mx-auto max-h-24 max-w-[200px] rounded-2xl object-contain" />
          ) : (
            <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center">
              <Wrench className="w-8 h-8 text-primary-foreground" />
            </div>
          )}
          <CardTitle className="text-2xl font-bold">איפוס סיסמה</CardTitle>
          <CardDescription>
            {ready ? "הזן סיסמה חדשה לחשבונך" : "מאמת את קישור האיפוס..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">סיסמה חדשה</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                dir="ltr"
                disabled={!ready}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">אישור סיסמה</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                dir="ltr"
                disabled={!ready}
              />
            </div>
            <Button type="submit" className="w-full h-12 text-base" disabled={loading || !ready}>
              {loading ? "מעדכן..." : "עדכן סיסמה"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => navigate("/auth")}
              className="text-sm text-primary hover:underline"
            >
              חזרה למסך הכניסה
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
