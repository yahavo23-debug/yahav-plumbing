import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Wrench } from "lucide-react";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();

  if (user) {
    navigate("/", { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
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
        const { error } = await signUp(email, password, fullName);
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
          <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center">
            <Wrench className="w-8 h-8 text-primary-foreground" />
          </div>
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
