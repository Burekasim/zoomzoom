import { useEffect, useMemo, useState } from "react";
import { api, Company, Contact, Task } from "../api";
import { me } from "../auth";

const STALE_DAYS = 14;
const ROSTER = ["avi", "nir", "tomer"] as const;
type RosterMember = (typeof ROSTER)[number];

// SSO emails look like "avi.keinan@gmail.com" / "nir.something@doit.com" — we
// pick the first segment of the local part and only accept the fixed roster.
const ownerFromEmail = (email?: string): RosterMember | "" => {
  if (!email) return "";
  const first = email.split("@")[0].toLowerCase().split(".")[0];
  return (ROSTER as readonly string[]).includes(first)
    ? (first as RosterMember)
    : "";
};

const daysSince = (iso?: string) => {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
};

const fmtDays = (d: number) =>
  d === Infinity ? "never" : d < 1 ? "today" : `${Math.floor(d)}d ago`;

const fmtDue = (iso?: string) => {
  if (!iso) return "";
  const d = (new Date(iso).getTime() - Date.now()) / 86400000;
  if (d < 0) return `${Math.ceil(-d)}d overdue`;
  if (d < 1) return "today";
  return `in ${Math.ceil(d)}d`;
};

export const MyDigest = ({
  refreshKey,
  onChanged,
}: {
  refreshKey: number;
  onChanged: () => void;
}) => {
  const [open, setOpen] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const myEmail = me().email ?? "";
  const myOwner = ownerFromEmail(myEmail);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [cs, ts] = await Promise.all([
        api.listCompanies(),
        api.listTasks(),
      ]);
      const contactLists = await Promise.all(cs.map((c) => api.listContacts(c.id)));
      setCompanies(cs);
      setContacts(contactLists.flat());
      setTasks(ts);
      setLoading(false);
    })();
  }, [refreshKey]);

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name]));
    return (id?: string) => (id ? m.get(id) ?? "" : "");
  }, [companies]);

  const myTasks = useMemo(() => {
    if (!myOwner) return [];
    const prio = { high: 0, med: 1, low: 2 } as const;
    return tasks
      .filter((t) => t.status === "open" && t.owner === myOwner)
      .sort((a, b) => {
        if (a.priority !== b.priority)
          return prio[a.priority] - prio[b.priority];
        return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
      });
  }, [tasks, myOwner]);

  const stalePeople = useMemo(() => {
    if (!myEmail) return [];
    return contacts
      .filter(
        (c) =>
          c.lastContactedBy === myEmail &&
          daysSince(c.lastContactedAt) > STALE_DAYS
      )
      .sort(
        (a, b) =>
          (a.lastContactedAt ?? "").localeCompare(b.lastContactedAt ?? "")
      );
  }, [contacts, myEmail]);

  const markContacted = async (id: string) => {
    await api.markContacted(id);
    onChanged();
  };

  return (
    <aside className={`my-digest ${open ? "open" : "closed"}`}>
      <button
        className="digest-toggle"
        onClick={() => setOpen((v) => !v)}
        title={open ? "Hide digest" : "Show digest"}
      >
        {open ? "▾" : "▴"} My digest
        {!loading && (
          <span className="digest-badge">
            {myTasks.length + stalePeople.length}
          </span>
        )}
      </button>

      {open && (
        <div className="digest-body">
          {!myOwner && (
            <div className="digest-empty">
              Your email <code>{myEmail || "unknown"}</code> doesn't map to an
              owner (avi/nir/tomer). Tasks won't filter to you.
            </div>
          )}

          <section>
            <h4>
              My open tasks <span className="muted">({myTasks.length})</span>
            </h4>
            {myTasks.length === 0 ? (
              <div className="digest-empty">Nothing assigned to you.</div>
            ) : (
              <ul className="digest-tasks">
                {myTasks.map((t) => (
                  <li key={t.id}>
                    <span className={`prio prio-${t.priority}`}>
                      {t.priority}
                    </span>
                    <span className="title" title={t.title}>
                      {t.title}
                    </span>
                    <span className="meta">
                      {companyName(t.companyId) || "—"}
                      {t.dueDate && (
                        <>
                          {" · "}
                          <span
                            className={
                              new Date(t.dueDate).getTime() < Date.now()
                                ? "overdue"
                                : ""
                            }
                          >
                            {fmtDue(t.dueDate)}
                          </span>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4>
              People I've gone quiet on{" "}
              <span className="muted">({stalePeople.length})</span>
            </h4>
            {stalePeople.length === 0 ? (
              <div className="digest-empty">All caught up.</div>
            ) : (
              <ul className="digest-people">
                {stalePeople.map((c) => (
                  <li key={c.id}>
                    <span className="who" title={c.email || c.name}>
                      {c.name}
                    </span>
                    <span className="meta">
                      {companyName(c.companyId)} ·{" "}
                      {fmtDays(daysSince(c.lastContactedAt))}
                    </span>
                    <button
                      className="btn-mini"
                      onClick={() => markContacted(c.id)}
                      title="I talked with them"
                    >
                      ✓
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </aside>
  );
};
