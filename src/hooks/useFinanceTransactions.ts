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

export type FinancePeriod = "month" | "year" | "all";

export function useFinanceTransactions(period: FinancePeriod, month: string) {
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<FinanceKPIs>({ totalIncome: 0, totalExpenses: 0, net: 0 });

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const allData: FinanceTransaction[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let query = (supabase as any)
          .from("financial_transactions")
          .select("*")
          .order("txn_date", { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (period === "month") {
          const startDate = `${month}-01`;
          const [y, m] = month.split("-").map(Number);
          const lastDay = new Date(y, m, 0).getDate();
          const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
          query = query.gte("txn_date", startDate).lte("txn_date", endDate);
        } else if (period === "year") {
          const y = month.split("-")[0];
          query = query.gte("txn_date", `${y}-01-01`).lte("txn_date", `${y}-12-31`);
        }

        const { data, error } = await query;

        if (error) {
          console.error("Finance load error:", error);
          setTransactions([]);
          setLoading(false);
          return;
        }

        if (data && data.length > 0) {
          allData.push(...(data as FinanceTransaction[]));
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      setTransactions(allData);
      const totalIncome = allData.filter(t => t.direction === "income").reduce((s, t) => s + Number(t.amount), 0);
      const totalExpenses = allData.filter(t => t.direction === "expense").reduce((s, t) => s + Number(t.amount), 0);
      setKpis({ totalIncome, totalExpenses, net: totalIncome - totalExpenses });
    } catch (err) {
      console.error("Finance load error:", err);
      setTransactions([]);
    }
    setLoading(false);
  }, [period, month]);

  useEffect(() => { load(); }, [load]);

  return { transactions, loading, kpis, refresh: load };
}
