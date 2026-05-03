import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, MapPin, Mail, MoreVertical, Edit, Trash2, Crown, MessageCircle } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { CustomerBillingBadgeInline } from "@/components/billing/CustomerBillingBadgeInline";
import { useCustomerBilling } from "@/hooks/useCustomerBilling";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { leadSourceColors, leadSourceLabels } from "@/lib/constants";

type Customer = Tables<"customers">;

interface CustomerCardProps {
  customer: Customer;
  isAdmin: boolean;
  isContractor: boolean;
  hasPendingCall: boolean;
  isReturning?: boolean;
  onEdit: (id: string) => void;
  onDelete: (customer: Customer) => void;
}

function toWhatsApp(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? "972" + digits.slice(1) : digits;
  return `https://wa.me/${intl}`;
}

export function CustomerCard({ customer, isAdmin, isContractor, hasPendingCall, isReturning, onEdit, onDelete }: CustomerCardProps) {
  const navigate = useNavigate();
  const billing = useCustomerBilling(customer.id);

  const isDebt = !billing.loading && (billing.status === "debt" || billing.status === "overdue" || billing.status === "legal");
  const showGold = !isDebt && !hasPendingCall && isReturning;

  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-md transition-shadow",
        isDebt && "border-destructive/50 bg-destructive/5",
        !isDebt && hasPendingCall && "border-purple-500/50 bg-purple-500/5",
        showGold && "border-amber-500/50 bg-amber-500/5"
      )}
      onClick={() => navigate(`/customers/${customer.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {(customer as any).lead_source && leadSourceColors[(customer as any).lead_source] && (
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${leadSourceColors[(customer as any).lead_source]}`}
                title={leadSourceLabels[(customer as any).lead_source] || (customer as any).lead_source}
              />
            )}
            <h3 className={cn(
              "font-semibold text-lg",
              isDebt && "text-destructive",
              !isDebt && hasPendingCall && "text-purple-600 dark:text-purple-400",
              showGold && "text-amber-600 dark:text-amber-400"
            )}>
              {customer.name}
              {showGold && <Crown className="inline w-4 h-4 mr-1 text-amber-500" />}
            </h3>
          </div>
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
                <Phone className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">{customer.phone}</span>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <a
                    href={`tel:${customer.phone}`}
                    className="p-1 rounded hover:bg-primary/10 text-primary transition-colors"
                    title="התקשר"
                  >
                    <Phone className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={toWhatsApp(customer.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-green-100 text-green-600 transition-colors"
                    title="WhatsApp"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </a>
                </div>
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
