import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FinanceTransaction {
  id: string;
  created_at: string;
  created_by: string;
  txn_date: string;
  direction: "income" | "expense";
  amount: number;
  currency: string;
  category: string | null;
  payment_method: string | null;
  counterparty_name: string | null;
  customer_id: string | null;
  service_call_id: string | null;
  notes: string | null;
  doc_type: string | null;
  doc_path: string | null;
  status: string;
}

export interface FinanceKPIs {
  totalIncome: number;
  totalExpenses: number;
  net: number;
}

export function useFinanceTransactions(month: string) {
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<FinanceKPIs>({ totalIncome: 0, totalExpenses: 0, net: 0 });

  const startDate = `${month}-01`;
  const endDate = (() => {
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return `${month}-${String(lastDay).padStart(2, "0")}`;
  })();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("financial_transactions")
      .select("*")
      .gte("txn_date", startDate)
      .lte("txn_date", endDate)
      .order("txn_date", { ascending: false });

    if (error) {
      console.error("Finance load error:", error);
      setTransactions([]);
    } else {
      const txns = (data || []) as FinanceTransaction[];
      setTransactions(txns);

      const totalIncome = txns.filter(t => t.direction === "income").reduce((s, t) => s + Number(t.amount), 0);
      const totalExpenses = txns.filter(t => t.direction === "expense").reduce((s, t) => s + Number(t.amount), 0);
      setKpis({ totalIncome, totalExpenses, net: totalIncome - totalExpenses });
    }
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  return { transactions, loading, kpis, refresh: load };
}
