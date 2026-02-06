import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert, LogOut } from "lucide-react";

export function NoAccessScreen() {
  const { signOut, user } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-6 text-center space-y-4">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-2">ממתין לאישור גישה</h2>
            <p className="text-muted-foreground text-sm">
              ההרשמה שלך התקבלה בהצלחה. מנהל המערכת צריך להגדיר לך תפקיד כדי שתוכל להיכנס.
            </p>
          </div>
          {user?.email && (
            <p className="text-xs text-muted-foreground" dir="ltr">{user.email}</p>
          )}
          <Button variant="outline" onClick={signOut} className="gap-2">
            <LogOut className="w-4 h-4" /> התנתק
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
