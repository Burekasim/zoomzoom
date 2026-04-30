import { useEffect, useState } from "react";
import { api, UserActivity as UA } from "../api";
import { me } from "../auth";

const ago = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
};

export const UserActivity = ({ refreshKey }: { refreshKey: number }) => {
  const [items, setItems] = useState<UA[]>([]);
  useEffect(() => {
    api.userActivity().then(setItems).catch(() => setItems([]));
  }, [refreshKey]);

  if (items.length === 0) return null;
  const myEmail = me().email;

  return (
    <div className="user-activity">
      <h3>Last interactions by user</h3>
      <ul>
        {items.map((u) => (
          <li key={u.email} className={u.email === myEmail ? "self" : ""}>
            <span className="who">{u.email}</span>
            <span className="what">→ {u.lastContactName}</span>
            <span
              className="when"
              title={new Date(u.lastInteractionAt).toLocaleString()}
            >
              {ago(u.lastInteractionAt)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
