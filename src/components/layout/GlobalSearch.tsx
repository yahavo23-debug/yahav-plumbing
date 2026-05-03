import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search, Users, Wrench, X } from "lucide-react";
import { getJobTypeLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Result {
  type: "customer" | "call";
  id: string;
  title: string;
  subtitle?: string;
  path: string;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Keyboard shortcut: Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query.trim()), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const search = async (q: string) => {
    setLoading(true);
    const [custRes, callRes] = await Promise.all([
      supabase
        .from("customers")
        .select("id, name, phone, city")
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,city.ilike.%${q}%`)
        .limit(5),
      supabase
        .from("service_calls")
        .select("id, job_type, description, customers(name)")
        .or(`description.ilike.%${q}%,job_type.ilike.%${q}%`)
        .limit(4),
    ]);

    const customers: Result[] = (custRes.data || []).map((c) => ({
      type: "customer",
      id: c.id,
      title: c.name,
      subtitle: [c.phone, c.city].filter(Boolean).join(" • "),
      path: `/customers/${c.id}`,
    }));

    const calls: Result[] = (callRes.data || []).map((c: any) => ({
      type: "call",
      id: c.id,
      title: c.customers?.name || "לקוח לא ידוע",
      subtitle: getJobTypeLabel(c.job_type) + (c.description ? ` • ${c.description.slice(0, 40)}` : ""),
      path: `/service-calls/${c.id}`,
    }));

    setResults([...customers, ...calls]);
    setSelected(0);
    setLoading(false);
  };

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
    setQuery("");
    setResults([]);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) go(results[selected].path);
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex items-center gap-2 px-3 h-9 rounded-lg border border-border bg-background hover:bg-accent transition-colors text-sm text-muted-foreground w-full max-w-xs"
      >
        <Search className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-right">חיפוש...</span>
        <kbd className="hidden sm:inline text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border">⌘K</kbd>
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl border border-border overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="w-5 h-5 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="חפש לקוח, קריאת שירות..."
                className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground text-right"
                dir="rtl"
                autoComplete="off"
              />
              {query && (
                <button onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}>
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div className="py-2 max-h-80 overflow-y-auto">
                {results.map((r, i) => (
                  <button
                    key={r.id}
                    onClick={() => go(r.path)}
                    onMouseEnter={() => setSelected(i)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-right transition-colors",
                      selected === i ? "bg-accent" : "hover:bg-accent/50"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      r.type === "customer" ? "bg-primary/10" : "bg-orange-100"
                    )}>
                      {r.type === "customer"
                        ? <Users className="w-4 h-4 text-primary" />
                        : <Wrench className="w-4 h-4 text-orange-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{r.title}</p>
                      {r.subtitle && <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">מחפש...</div>
            )}
            {!loading && query && results.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">לא נמצאו תוצאות עבור "{query}"</div>
            )}
            {!query && (
              <div className="px-4 py-4 text-center text-xs text-muted-foreground">
                חפש לפי שם לקוח, טלפון, עיר, או סוג קריאה
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
