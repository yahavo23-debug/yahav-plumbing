import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, Plus, Search, Phone, MapPin } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";

type Customer = Tables<"customers">;

const CustomerSelect = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    loadCustomers();
  }, [user]);

  const loadCustomers = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name");

    if (error) {
      console.error("Load customers error:", error);
      toast({ title: "שגיאה", description: "לא ניתן לטעון לקוחות", variant: "destructive" });
    } else {
      setCustomers(data || []);
    }
    setLoading(false);
  };

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q)
    );
  });

  return (
    <AppLayout title="קריאת שירות חדשה — בחירת לקוח">
      <Button variant="ghost" onClick={() => navigate("/service-calls")} className="mb-4 gap-2">
        <ArrowRight className="w-4 h-4" /> חזרה
      </Button>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי שם, טלפון או עיר..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10"
            autoFocus
          />
        </div>
        <Button onClick={() => navigate("/customers/new?returnTo=service-call")} className="h-10 gap-2 shrink-0">
          <Plus className="w-4 h-4" /> לקוח חדש
        </Button>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {search ? "לא נמצאו לקוחות תואמים" : "אין לקוחות במערכת"}
        </p>
      ) : (
        <div className="grid gap-2">
          {filtered.map((customer) => (
            <Card
              key={customer.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => navigate(`/service-calls/new/${customer.id}`)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-primary font-bold text-sm">
                      {customer.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold">{customer.name}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      {customer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {customer.phone}
                        </span>
                      )}
                      {customer.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {customer.city}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground rotate-180" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
};

export default CustomerSelect;
