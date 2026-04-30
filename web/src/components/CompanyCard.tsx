import { useEffect, useRef, useState } from "react";
import {
  api,
  Company,
  Contact,
  ContactSide,
  Task,
  Note,
  TaskUpdate,
} from "../api";

const TASK_OWNERS = ["avi", "nir", "tomer"] as const;

const ago = (iso?: string) => {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  if (d < 30) return `${Math.floor(d / 7)}w`;
  return `${Math.floor(d / 30)}mo`;
};

const contactTooltip = (p: Contact) => {
  const lines = [`${p.name} (${p.side})`];
  if (p.email) lines.push(p.email);
  if (p.phone) lines.push(p.phone);
  lines.push(
    p.lastContactedAt
      ? `Last contacted: ${new Date(p.lastContactedAt).toLocaleDateString()}`
      : "Never contacted"
  );
  return lines.join("\n");
};

// ── Per-card size persistence ─────────────────────────────────────
const SIZE_KEY = "zz_card_sizes";
type CardSize = { width: number; height: number };
const loadSize = (id: string): CardSize | undefined => {
  try {
    const all = JSON.parse(localStorage.getItem(SIZE_KEY) || "{}");
    return all[id];
  } catch {
    return undefined;
  }
};
const saveSize = (id: string, size: CardSize) => {
  try {
    const all = JSON.parse(localStorage.getItem(SIZE_KEY) || "{}");
    all[id] = size;
    localStorage.setItem(SIZE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
};

type Props = {
  company: Company;
  colorIdx: number;
  contacts: Contact[];
  tasks: Task[];
  onChanged: () => void;
  onMove: (sourceId: string, targetId: string) => void;
};

export const CompanyCard = ({
  company,
  colorIdx,
  contacts,
  tasks,
  onChanged,
  onMove,
}: Props) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [sizeStyle] = useState(() => {
    const s = loadSize(company.id);
    return s ? { width: s.width, height: s.height } : undefined;
  });

  // Persist size on user resize.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let timer: any;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        saveSize(company.id, {
          width: card.offsetWidth,
          height: card.offsetHeight,
        });
      }, 200);
    });
    ro.observe(card);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [company.id]);

  const [newContactName, setNewContactName] = useState("");
  const [newContactSide, setNewContactSide] = useState<ContactSide>("customer");
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Task-create form state
  const [tFormOpen, setTFormOpen] = useState(false);
  const [tTitle, setTTitle] = useState("");
  const [tPriority, setTPriority] = useState<"low" | "med" | "high">("med");
  const [tDue, setTDue] = useState("");
  const [tOwner, setTOwner] = useState<string>("");
  const [tContactIds, setTContactIds] = useState<string[]>([]);

  const customerContacts = contacts.filter((c) => c.side !== "aws");
  const awsContacts = contacts.filter((c) => c.side === "aws");

  const addContact = async () => {
    if (!newContactName.trim()) return;
    await api.createContact(company.id, {
      name: newContactName.trim(),
      side: newContactSide,
    });
    setNewContactName("");
    onChanged();
  };

  const addContactSide = (side: ContactSide) => async () => {
    if (!newContactName.trim()) return;
    await api.createContact(company.id, {
      name: newContactName.trim(),
      side,
    });
    setNewContactName("");
    onChanged();
  };

  const removeContact = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    await api.deleteContact(id);
    onChanged();
  };

  const removeCompany = async () => {
    if (!confirm(`Delete "${company.name}" and everything in it?`)) return;
    await api.deleteCompany(company.id);
    onChanged();
  };

  const createTask = async () => {
    if (!tTitle.trim()) return;
    await api.createTask({
      title: tTitle.trim(),
      priority: tPriority,
      dueDate: tDue || undefined,
      owner: tOwner || undefined,
      contactIds: tContactIds,
      companyId: company.id,
    });
    setTTitle("");
    setTDue("");
    setTContactIds([]);
    setTPriority("med");
    setTOwner("");
    setTFormOpen(false);
    onChanged();
  };

  const toggleTask = async (t: Task) => {
    await api.updateTask(t.id, {
      status: t.status === "open" ? "done" : "open",
    });
    onChanged();
  };
  const removeTask = async (t: Task) => {
    await api.deleteTask(t.id);
    onChanged();
  };
  const setTaskOwner = async (t: Task, owner: string) => {
    await api.updateTask(t.id, { owner: owner || null } as any);
    onChanged();
  };

  return (
    <div
      ref={cardRef}
      style={sizeStyle}
      className={`company-card color-${colorIdx} ${dragOver ? "drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const sourceId = e.dataTransfer.getData("companyId");
        if (sourceId) onMove(sourceId, company.id);
      }}
    >
      <header
        className="card-header"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("companyId", company.id);
          e.dataTransfer.effectAllowed = "move";
          if (cardRef.current) {
            e.dataTransfer.setDragImage(cardRef.current, 20, 20);
          }
        }}
        title="Drag to reorder"
      >
        <span className="drag-grip" aria-hidden>⋮⋮</span>
        <h3>{company.name}</h3>
        <button
          className="btn-ghost danger"
          title="Delete company"
          onClick={removeCompany}
        >
          ×
        </button>
      </header>

      {/* People — split into Customer and AWS ────────────────── */}
      <ContactSection
        title={`Customer (${customerContacts.length})`}
        contacts={customerContacts}
        expandedContactId={expandedContactId}
        onToggle={(id) =>
          setExpandedContactId((x) => (x === id ? null : id))
        }
        onDelete={removeContact}
        onChanged={onChanged}
      />
      <ContactSection
        title={`AWS (${awsContacts.length})`}
        contacts={awsContacts}
        expandedContactId={expandedContactId}
        onToggle={(id) =>
          setExpandedContactId((x) => (x === id ? null : id))
        }
        onDelete={removeContact}
        onChanged={onChanged}
        aws
      />

      <section className="card-section add-contact">
        <input
          placeholder="Add person…"
          value={newContactName}
          onChange={(e) => setNewContactName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addContact()}
        />
        <div className="side-buttons">
          <button
            className={newContactSide === "customer" ? "btn-primary" : ""}
            onClick={addContactSide("customer")}
            title="Add as customer-side contact"
          >
            + Customer
          </button>
          <button
            className={newContactSide === "aws" ? "btn-primary" : ""}
            onClick={addContactSide("aws")}
            title="Add as AWS-side contact"
          >
            + AWS
          </button>
        </div>
      </section>

      {/* Tasks ────────────────────────────────────────────────── */}
      <section className="card-section tasks-section">
        <h4>
          Tasks ({tasks.filter((t) => t.status === "open").length} open /{" "}
          {tasks.length})
        </h4>
        <ul className="tasks-list">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              contacts={contacts}
              expanded={expandedTaskId === t.id}
              onToggleExpand={() =>
                setExpandedTaskId((x) => (x === t.id ? null : t.id))
              }
              onCheck={() => toggleTask(t)}
              onDelete={() => removeTask(t)}
              onOwnerChange={(o) => setTaskOwner(t, o)}
              onChanged={onChanged}
            />
          ))}
          {tasks.length === 0 && <li className="empty-row">No tasks yet.</li>}
        </ul>

        {tFormOpen ? (
          <div className="task-add-form">
            <input
              autoFocus
              placeholder="Task title"
              value={tTitle}
              onChange={(e) => setTTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createTask()}
            />
            <div className="task-add-meta">
              <select
                value={tPriority}
                onChange={(e) => setTPriority(e.target.value as any)}
                title="Priority"
              >
                <option value="low">low</option>
                <option value="med">med</option>
                <option value="high">high</option>
              </select>
              <input
                type="date"
                value={tDue}
                onChange={(e) => setTDue(e.target.value)}
                title="Due date"
              />
              <select
                value={tOwner}
                onChange={(e) => setTOwner(e.target.value)}
                title="Owner (DoiT)"
              >
                <option value="">— owner —</option>
                {TASK_OWNERS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              {contacts.length > 0 && (
                <select
                  multiple
                  value={tContactIds}
                  onChange={(e) =>
                    setTContactIds(
                      Array.from(e.target.selectedOptions).map((o) => o.value)
                    )
                  }
                  title="Hold ⌘/Ctrl to select multiple contacts"
                >
                  {contacts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.side === "aws" ? "(AWS)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="task-add-actions">
              <button className="btn-primary" onClick={createTask}>
                Add task
              </button>
              <button className="btn-ghost" onClick={() => setTFormOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="add-task-btn" onClick={() => setTFormOpen(true)}>
            + Add task
          </button>
        )}
      </section>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────

const ContactSection = ({
  title,
  contacts,
  expandedContactId,
  onToggle,
  onDelete,
  onChanged,
  aws = false,
}: {
  title: string;
  contacts: Contact[];
  expandedContactId: string | null;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onChanged: () => void;
  aws?: boolean;
}) => (
  <section className={`card-section${aws ? " aws-section" : ""}`}>
    <h4>
      {aws && <span className="aws-badge">AWS</span>}
      {title}
    </h4>
    <ul className="contacts-list">
      {contacts.map((p) => (
        <ContactRow
          key={p.id}
          contact={p}
          expanded={expandedContactId === p.id}
          onToggle={() => onToggle(p.id)}
          onDelete={() => onDelete(p.id)}
          onChanged={onChanged}
        />
      ))}
      {contacts.length === 0 && <li className="empty-row">— none —</li>}
    </ul>
  </section>
);

const ContactRow = ({
  contact,
  expanded,
  onToggle,
  onDelete,
  onChanged,
}: {
  contact: Contact;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    api.listNotes(`CONTACT#${contact.id}`).then(setNotes);
  }, [expanded, contact.id]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    setBusy(true);
    try {
      const n = await api.addContactNote(contact.id, newNote.trim());
      setNotes((s) => [n, ...s]);
      setNewNote("");
    } finally {
      setBusy(false);
    }
  };

  const markContacted = async () => {
    setBusy(true);
    try {
      await api.markContacted(contact.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`contact-row ${expanded ? "expanded" : ""}`}>
      <div className="contact-summary" title={contactTooltip(contact)}>
        <button className="caret" onClick={onToggle} aria-label="Toggle details">
          {expanded ? "▾" : "▸"}
        </button>
        <span className="contact-name" onClick={onToggle}>
          {contact.name}
        </span>
        <span className="contact-when">{ago(contact.lastContactedAt)}</span>
        <button
          className="btn-ghost danger contact-del"
          title="Delete contact"
          onClick={onDelete}
        >
          ×
        </button>
      </div>
      {expanded && (
        <div className="contact-details">
          {(contact.email || contact.phone) && (
            <div className="contact-info">
              {contact.email && (
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              )}
              {contact.phone && <span>{contact.phone}</span>}
            </div>
          )}
          <button className="contacted" onClick={markContacted} disabled={busy}>
            ✓ I talked with him
          </button>
          <div className="add-note">
            <textarea
              value={newNote}
              placeholder="Add a note (contract date, issue, follow-up)…"
              onChange={(e) => setNewNote(e.target.value)}
            />
            <button onClick={addNote} disabled={busy || !newNote.trim()}>
              Save note
            </button>
          </div>
          {notes.length > 0 && (
            <ul className="notes-list">
              {notes.map((n) => (
                <li key={n.id}>
                  <div className="note-meta">
                    {n.author} · {new Date(n.createdAt).toLocaleString()}
                  </div>
                  <div className="note-text">{n.text}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
};

const TaskRow = ({
  task,
  contacts,
  expanded,
  onToggleExpand,
  onCheck,
  onDelete,
  onOwnerChange,
  onChanged,
}: {
  task: Task;
  contacts: Contact[];
  expanded: boolean;
  onToggleExpand: () => void;
  onCheck: () => void;
  onDelete: () => void;
  onOwnerChange: (owner: string) => void;
  onChanged: () => void;
}) => {
  const [updates, setUpdates] = useState<TaskUpdate[]>([]);
  const [newUpdate, setNewUpdate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    api.listTaskUpdates(task.id).then(setUpdates).catch(() => setUpdates([]));
  }, [expanded, task.id]);

  const addUpdate = async () => {
    if (!newUpdate.trim()) return;
    setBusy(true);
    try {
      const u = await api.addTaskUpdate(task.id, newUpdate.trim());
      setUpdates((s) => [u, ...s]);
      setNewUpdate("");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const assignedContacts = task.contactIds
    .map((id) => contacts.find((c) => c.id === id))
    .filter((c): c is Contact => !!c);

  return (
    <li className={`task-row prio-${task.priority} ${task.status}`}>
      <div
        className="task-summary"
        onClick={(e) => {
          // Don't expand when clicking on the checkbox or delete button
          if ((e.target as HTMLElement).closest("input,button")) return;
          onToggleExpand();
        }}
      >
        <input
          type="checkbox"
          checked={task.status === "done"}
          onChange={onCheck}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="task-title" title={task.title}>
          {task.title}
        </span>
        {task.owner && <span className="task-owner">{task.owner}</span>}
        <span className={`task-prio prio-${task.priority}`}>
          {task.priority}
        </span>
        <span className="task-due">
          {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : ""}
        </span>
        <button className="task-del" onClick={onDelete}>
          ×
        </button>
      </div>
      {expanded && (
        <div className="task-details">
          <dl>
            <dt>Status</dt>
            <dd>{task.status}</dd>
            <dt>Priority</dt>
            <dd>{task.priority}</dd>
            <dt>Due</dt>
            <dd>
              {task.dueDate
                ? new Date(task.dueDate).toLocaleDateString()
                : "—"}
            </dd>
            <dt>Created</dt>
            <dd>{new Date(task.createdAt).toLocaleString()}</dd>
            <dt>Owner</dt>
            <dd>
              <select
                value={task.owner ?? ""}
                onChange={(e) => onOwnerChange(e.target.value)}
              >
                <option value="">— unassigned —</option>
                {TASK_OWNERS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </dd>
            <dt>Contacts</dt>
            <dd>
              {assignedContacts.length === 0 ? (
                <em>none</em>
              ) : (
                <ul className="task-contact-chips">
                  {assignedContacts.map((c) => (
                    <li
                      key={c.id}
                      className={c.side === "aws" ? "aws" : "customer"}
                      title={contactTooltip(c)}
                    >
                      {c.name}
                      {c.side === "aws" && <span className="chip-tag">AWS</span>}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>

          <div className="task-updates">
            <h5>Status updates</h5>
            <div className="add-update">
              <textarea
                placeholder="Add a status update…"
                value={newUpdate}
                onChange={(e) => setNewUpdate(e.target.value)}
              />
              <button
                onClick={addUpdate}
                disabled={busy || !newUpdate.trim()}
              >
                Post
              </button>
            </div>
            {updates.length === 0 ? (
              <div className="empty-row">No updates yet.</div>
            ) : (
              <ul className="updates-list">
                {updates.map((u) => (
                  <li key={u.id}>
                    <div className="update-meta">
                      {u.author} · {new Date(u.createdAt).toLocaleString()}
                    </div>
                    <div className="update-text">{u.text}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
};
