import { useEffect, useState } from "react";
import { api, Task, Company, Contact } from "../api";

export const Tasks = ({
  refreshKey,
  onChanged,
}: {
  refreshKey: number;
  onChanged: () => void;
}) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contactsByCo, setContactsByCo] = useState<Record<string, Contact[]>>({});
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "med" | "high">("med");
  const [dueDate, setDueDate] = useState("");
  const [contactIds, setContactIds] = useState<string[]>([]);

  useEffect(() => {
    api.listTasks().then(setTasks);
  }, [refreshKey]);

  useEffect(() => {
    (async () => {
      const cs = await api.listCompanies();
      setCompanies(cs);
      const m: Record<string, Contact[]> = {};
      for (const c of cs) m[c.id] = await api.listContacts(c.id);
      setContactsByCo(m);
    })();
  }, [refreshKey]);

  const create = async () => {
    if (!title.trim()) return;
    await api.createTask({
      title: title.trim(),
      priority,
      dueDate: dueDate || undefined,
      contactIds,
    });
    setTitle("");
    setDueDate("");
    setContactIds([]);
    onChanged();
  };

  const toggleStatus = async (t: Task) => {
    await api.updateTask(t.id, { status: t.status === "open" ? "done" : "open" });
    onChanged();
  };
  const remove = async (t: Task) => {
    await api.deleteTask(t.id);
    onChanged();
  };

  const allContacts = companies.flatMap((c) =>
    (contactsByCo[c.id] ?? []).map((p) => ({ ...p, companyName: c.name }))
  );

  return (
    <div className="tasks">
      <h2>Tasks</h2>
      <div className="task-create">
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
          <option value="low">low</option>
          <option value="med">med</option>
          <option value="high">high</option>
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <select
          multiple
          value={contactIds}
          onChange={(e) =>
            setContactIds(Array.from(e.target.selectedOptions).map((o) => o.value))
          }
        >
          {allContacts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.companyName})
            </option>
          ))}
        </select>
        <button onClick={create}>Add</button>
      </div>
      <ul className="task-list">
        {tasks.map((t) => (
          <li key={t.id} className={`prio-${t.priority} ${t.status}`}>
            <input
              type="checkbox"
              checked={t.status === "done"}
              onChange={() => toggleStatus(t)}
            />
            <span className="title">{t.title}</span>
            <span className="prio">{t.priority}</span>
            <span className="due">{t.dueDate ?? ""}</span>
            <span className="assigned">
              {t.contactIds.length} contact{t.contactIds.length === 1 ? "" : "s"}
            </span>
            <button onClick={() => remove(t)}>×</button>
          </li>
        ))}
        {tasks.length === 0 && <li className="empty">No tasks yet.</li>}
      </ul>
    </div>
  );
};
