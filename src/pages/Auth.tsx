import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Wrench } from "lucide-react";
import { useLogo } from "@/hooks/useLogo";
import { supabase } from "@/integrations/supabase/client";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [forgotMode, setForgotMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const { logoUrl } = useLogo();

  if (user) {
    navigate("/", { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (forgotMode) {
        if (!email.trim()) {
          toast({ title: "שגיאה", description: "יש להזין כתובת אימייל", variant: "destructive" });
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
          toast({ title: "שגיאה", description: error.message, variant: "destructive" });
        } else {
          toast({
            title: "נשלח קישור איפוס",
            description: "אם הכתובת רשומה במערכת, תקבל אימייל עם קישור לאיפוס הסיסמה",
          });
          setForgotMode(false);
        }
        setLoading(false);
        return;
      }

      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast({ title: "שגיאה", description: "אימייל או סיסמה שגויים", variant: "destructive" });
          } else if (error.message.includes("Email not confirmed")) {
            toast({ title: "שגיאה", description: "יש לאמת את כתובת האימייל לפני ההתחברות", variant: "destructive" });
          } else {
            toast({ title: "שגיאה", description: error.message, variant: "destructive" });
          }
        } else {
          navigate("/");
        }
      } else {
        if (password.length < 6) {
          toast({ title: "שגיאה", description: "הסיסמה חייבת להכיל לפחות 6 תווים", variant: "destructive" });
          setLoading(false);
          return;
        }
        if (!phone.trim() || !/^0\d{8,9}$/.test(phone.trim())) {
          toast({ title: "שגיאה", description: "יש להזין מספר טלפון ישראלי תקין (למשל 0501234567)", variant: "destructive" });
          setLoading(false);
          return;
        }
        if (!idNumber.trim() || !/^\d{5,9}$/.test(idNumber.trim())) {
          toast({ title: "שגיאה", description: "יש להזין מספר תעודת זהות תקין (5-9 ספרות)", variant: "destructive" });
          setLoading(false);
          return;
        }
        const { error } = await signUp(email, password, fullName, phone.trim(), idNumber.trim());
        if (error) {
          if (error.message.includes("already registered")) {
            toast({ title: "שגיאה", description: "כתובת אימייל זו כבר רשומה במערכת", variant: "destructive" });
          } else {
            toast({ title: "שגיאה", description: error.message, variant: "destructive" });
          }
        } else {
          toast({ title: "נרשמת בהצלחה!", description: "נא לבדוק את האימייל לאימות החשבון" });
          setIsLogin(true);
        }
      }
    } catch (err) {
      toast({ title: "שגיאה", description: "אירעה שגיאה בלתי צפויה", variant: "destructive" });
    } finally {
      setLoading(false);
    }
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
          <CardTitle className="text-2xl font-bold">
            {isLogin ? "כניסה למערכת" : "הרשמה"}
          </CardTitle>
          <CardDescription>
            {isLogin ? "הזן את הפרטים שלך כדי להתחבר" : "צור חשבון חדש"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">שם מלא</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="ישראל ישראלי"
                    required={!isLogin}
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">מספר טלפון</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0501234567"
                    required={!isLogin}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="idNumber">תעודת זהות</Label>
                  <Input
                    id="idNumber"
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                    placeholder="123456789"
                    required={!isLogin}
                    dir="ltr"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">אימייל</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                dir="ltr"
              />
            </div>
            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading ? "טוען..." : isLogin ? "התחברות" : "הרשמה"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-primary hover:underline"
            >
              {isLogin ? "אין לך חשבון? הירשם כאן" : "יש לך חשבון? התחבר כאן"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
