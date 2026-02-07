import { useCustomerBilling } from "@/hooks/useCustomerBilling";
import { CustomerBillingBadge } from "./CustomerBillingBadge";

interface Props {
  customerId: string;
}

export function CustomerBillingBadgeInline({ customerId }: Props) {
  const billing = useCustomerBilling(customerId);
  return <CustomerBillingBadge summary={billing} size="sm" />;
}
