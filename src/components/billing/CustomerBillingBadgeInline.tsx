import { useCustomerBilling, BillingSummary } from "@/hooks/useCustomerBilling";
import { CustomerBillingBadge } from "./CustomerBillingBadge";

interface Props {
  customerId: string;
  /** Pass an already-fetched summary to skip the internal query (avoids N+1) */
  billing?: BillingSummary & { loading: boolean };
}

export function CustomerBillingBadgeInline({ customerId, billing: externalBilling }: Props) {
  // Only run the hook when no external billing is provided
  const internalBilling = useCustomerBilling(externalBilling ? undefined : customerId);
  const billing = externalBilling ?? internalBilling;
  return <CustomerBillingBadge summary={billing} size="sm" />;
}
