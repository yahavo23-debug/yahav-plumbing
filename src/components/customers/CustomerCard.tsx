import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, MapPin, Mail, MoreVertical, Edit, Trash2 } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { CustomerBillingBadgeInline } from "@/components/billing/CustomerBillingBadgeInline";
import { useCustomerBilling } from "@/hooks/useCustomerBilling";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Customer = Tables<"customers">;

interface CustomerCardProps {
  customer: Customer;
  isAdmin: boolean;
  isContractor: boolean;
  hasPendingCall: boolean;
  onEdit: (id: string) => void;
  onDelete: (customer: Customer) => void;
}

export function CustomerCard({ customer, isAdmin, isContractor, hasPendingCall, onEdit, onDelete }: CustomerCardProps) {
  const navigate = useNavigate();
  const billing = useCustomerBilling(customer.id);

  const isDebt = !billing.loading && (billing.status === "debt" || billing.status === "overdue" || billing.status === "legal");

  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-md transition-shadow",
        isDebt && "border-destructive/50 bg-destructive/5",
        !isDebt && hasPendingCall && "border-purple-500/50 bg-purple-500/5"
      )}
      onClick={() => navigate(`/customers/${customer.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className={cn(
            "font-semibold text-lg",
            isDebt && "text-destructive",
            !isDebt && hasPendingCall && "text-purple-600 dark:text-purple-400"
          )}>
            {customer.name}
          </h3>
          <div className="flex items-center gap-1">
            {!isContractor && <CustomerBillingBadgeInline customerId={customer.id} />}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem onClick={() => onEdit(customer.id)}>
                    <Edit className="w-4 h-4 ml-2" /> עריכה
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(customer)}
                  >
                    <Trash2 className="w-4 h-4 ml-2" /> מחיקה
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        {!isContractor && (
          <div className="space-y-1 text-sm text-muted-foreground">
            {customer.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5" /> {customer.phone}
              </div>
            )}
            {customer.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5" /> {customer.email}
              </div>
            )}
            {(customer.city || customer.address) && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" /> {customer.city} {customer.address}
              </div>
            )}
          </div>
        )}
        {isContractor && customer.city && (
          <p className="text-sm text-muted-foreground">{customer.city}</p>
        )}
      </CardContent>
    </Card>
  );
}
