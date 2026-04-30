import { useEffect, useState } from "react";
import { api, Reminder } from "../api";

export const Reminders = ({ refreshKey }: { refreshKey: number }) => {
  const [items, setItems] = useState<Reminder[]>([]);

  useEffect(() => {
    api.reminders().then(setItems).catch(() => setItems([]));
  }, [refreshKey]);

  if (items.length === 0) return null;
  return (
    <div className="reminders">
      <strong>Reminders ({items.length})</strong>
      <ul>
        {items.map((r) => (
          <li key={r.id} className={r.kind}>
            {r.kind === "contact_stale" ? "Contact" : "Company"}{" "}
            <em>{r.targetName}</em> hasn't been contacted since{" "}
            {r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleDateString() : "—"}
          </li>
        ))}
      </ul>
    </div>
  );
};
