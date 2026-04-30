import { useEffect, useState } from "react";
import { api, Company, Contact, Task } from "../api";
import { CompanyCard } from "./CompanyCard";

const PALETTE_SIZE = 8;
const colorFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % PALETTE_SIZE;
};

export const CompanyGrid = ({
  refreshKey,
  onChanged,
}: {
  refreshKey: number;
  onChanged: () => void;
}) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contactsByCo, setContactsByCo] = useState<Record<string, Contact[]>>({});
  const [tasksByCo, setTasksByCo] = useState<Record<string, Task[]>>({});
  const [loading, setLoading] = useState(true);
  const [newCo, setNewCo] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const cs = await api.listCompanies();
      setCompanies(cs);
      const [contactPairs, tasks] = await Promise.all([
        Promise.all(
          cs.map((c) =>
            api.listContacts(c.id).then((list) => [c.id, list] as const)
          )
        ),
        api.listTasks(),
      ]);
      setContactsByCo(Object.fromEntries(contactPairs));
      const tMap: Record<string, Task[]> = {};
      for (const t of tasks) {
        if (t.companyId) (tMap[t.companyId] ||= []).push(t);
      }
      // sort each company's tasks: open before done, then by priority then due
      const prioRank = { high: 0, med: 1, low: 2 } as const;
      for (const k in tMap) {
        tMap[k].sort((a, b) => {
          if (a.status !== b.status) return a.status === "open" ? -1 : 1;
          if (a.priority !== b.priority)
            return prioRank[a.priority] - prioRank[b.priority];
          return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
        });
      }
      setTasksByCo(tMap);
      setLoading(false);
    })();
  }, [refreshKey]);

  const addCompany = async () => {
    if (!newCo.trim()) return;
    await api.createCompany(newCo.trim());
    setNewCo("");
    onChanged();
  };

  return (
    <div className="company-grid-wrap">
      <div className="company-grid">
        {companies.map((c) => (
          <CompanyCard
            key={c.id}
            company={c}
            colorIdx={colorFor(c.id)}
            contacts={contactsByCo[c.id] ?? []}
            tasks={tasksByCo[c.id] ?? []}
            onChanged={onChanged}
          />
        ))}
        <div className="company-add-card">
          <input
            placeholder="New company name"
            value={newCo}
            onChange={(e) => setNewCo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCompany()}
          />
          <button className="btn-primary" onClick={addCompany}>
            + Company
          </button>
        </div>
      </div>
      {loading && companies.length === 0 && (
        <div className="loading">Loading…</div>
      )}
    </div>
  );
};
