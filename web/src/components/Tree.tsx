import { useEffect, useState } from "react";
import { api, Company, Contact } from "../api";

type Selected =
  | { type: "company"; id: string; name: string }
  | { type: "contact"; id: string; name: string; companyId: string };

type Props = {
  refreshKey: number;
  selectedId?: string;
  onSelect: (s: Selected) => void;
  onChanged: () => void;
};

export const Tree = ({ refreshKey, selectedId, onSelect, onChanged }: Props) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contactsByCo, setContactsByCo] = useState<Record<string, Contact[]>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [newCo, setNewCo] = useState("");
  const [newContact, setNewContact] = useState<Record<string, string>>({});

  useEffect(() => {
    api.listCompanies().then(setCompanies);
  }, [refreshKey]);

  const toggle = async (c: Company) => {
    const next = new Set(open);
    if (next.has(c.id)) next.delete(c.id);
    else {
      next.add(c.id);
      if (!contactsByCo[c.id]) {
        const list = await api.listContacts(c.id);
        setContactsByCo((s) => ({ ...s, [c.id]: list }));
      }
    }
    setOpen(next);
  };

  const addCompany = async () => {
    if (!newCo.trim()) return;
    await api.createCompany(newCo.trim());
    setNewCo("");
    onChanged();
  };

  const addContact = async (companyId: string) => {
    const name = (newContact[companyId] || "").trim();
    if (!name) return;
    const c = await api.createContact(companyId, { name });
    setContactsByCo((s) => ({ ...s, [companyId]: [...(s[companyId] || []), c] }));
    setNewContact((s) => ({ ...s, [companyId]: "" }));
    onChanged();
  };

  return (
    <div className="tree">
      <div className="tree-add">
        <input
          placeholder="New company"
          value={newCo}
          onChange={(e) => setNewCo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCompany()}
        />
        <button onClick={addCompany}>+</button>
      </div>
      <ul className="companies">
        {companies.map((c) => (
          <li key={c.id} className={`company ${selectedId === c.id ? "sel" : ""}`}>
            <div className="row">
              <button className="caret" onClick={() => toggle(c)}>
                {open.has(c.id) ? "▾" : "▸"}
              </button>
              <span
                className="label"
                onClick={() => onSelect({ type: "company", id: c.id, name: c.name })}
              >
                {c.name}
              </span>
            </div>
            {open.has(c.id) && (
              <ul className="contacts">
                {(contactsByCo[c.id] ?? []).map((p) => (
                  <li
                    key={p.id}
                    className={selectedId === p.id ? "sel" : ""}
                    onClick={() =>
                      onSelect({
                        type: "contact",
                        id: p.id,
                        name: p.name,
                        companyId: c.id,
                      })
                    }
                  >
                    {p.name}
                  </li>
                ))}
                <li className="add">
                  <input
                    placeholder="New contact"
                    value={newContact[c.id] ?? ""}
                    onChange={(e) =>
                      setNewContact((s) => ({ ...s, [c.id]: e.target.value }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && addContact(c.id)}
                  />
                  <button onClick={() => addContact(c.id)}>+</button>
                </li>
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
