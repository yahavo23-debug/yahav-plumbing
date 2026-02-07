import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BillingSummary {
  balance: number;
  totalCharges: number;
  totalPayments: number;
  totalCredits: number;
  overdueSince: string | null;
  overdueDays: number;
  overdueMonths: number;
  lastPaymentDate: string | null;
  hasLegalAction: boolean;
  legalActionNote: string | null;
  status: "credit" | "clear" | "debt" | "overdue" | "legal";
  loading: boolean;
}

export function useCustomerBilling(customerId: string | undefined) {
  const [summary, setSummary] = useState<BillingSummary>({
    balance: 0,
    totalCharges: 0,
    totalPayments: 0,
    totalCredits: 0,
    overdueSince: null,
    overdueDays: 0,
    overdueMonths: 0,
    lastPaymentDate: null,
    hasLegalAction: false,
    legalActionNote: null,
    status: "clear",
    loading: true,
  });

  const refresh = useCallback(async () => {
    if (!customerId) return;

    const [ledgerRes, customerRes] = await Promise.all([
      (supabase as any)
        .from("customer_ledger")
        .select("entry_type, amount, entry_date")
        .eq("customer_id", customerId)
        .order("entry_date", { ascending: true }),
      supabase
        .from("customers")
        .select("has_legal_action, legal_action_note")
        .eq("id", customerId)
        .single(),
    ]);

    const entries = (ledgerRes.data || []) as {
      entry_type: string;
      amount: number;
      entry_date: string;
    }[];

    const totalCharges = entries
      .filter((e) => e.entry_type === "charge")
      .reduce((s, e) => s + Number(e.amount), 0);
    const totalPayments = entries
      .filter((e) => e.entry_type === "payment")
      .reduce((s, e) => s + Number(e.amount), 0);
    const totalCredits = entries
      .filter((e) => e.entry_type === "credit")
      .reduce((s, e) => s + Number(e.amount), 0);

    const balance = totalCharges - totalPayments - totalCredits;

    // Find earliest unpaid charge date
    let overdueSince: string | null = null;
    if (balance > 0) {
      const firstCharge = entries.find((e) => e.entry_type === "charge");
      overdueSince = firstCharge?.entry_date || null;
    }

    const now = new Date();
    let overdueDays = 0;
    let overdueMonths = 0;
    if (overdueSince) {
      const since = new Date(overdueSince);
      const diffMs = now.getTime() - since.getTime();
      overdueDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      overdueMonths = Math.floor(overdueDays / 30);
    }

    const lastPayment = [...entries]
      .filter((e) => e.entry_type === "payment")
      .sort(
        (a, b) =>
          new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
      )[0];

    const hasLegalAction = (customerRes.data as any)?.has_legal_action ?? false;
    const legalActionNote =
      (customerRes.data as any)?.legal_action_note ?? null;

    let status: BillingSummary["status"] = "clear";
    if (hasLegalAction) status = "legal";
    else if (balance > 0 && overdueDays > 90) status = "overdue";
    else if (balance > 0) status = "debt";
    else if (balance < 0) status = "credit";

    setSummary({
      balance,
      totalCharges,
      totalPayments,
      totalCredits,
      overdueSince,
      overdueDays,
      overdueMonths,
      lastPaymentDate: lastPayment?.entry_date || null,
      hasLegalAction,
      legalActionNote,
      status,
      loading: false,
    });
  }, [customerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...summary, refresh };
}
