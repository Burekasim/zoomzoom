import { useEffect, useState } from "react";
import { api, Company, Contact, Task, Note } from "../api";

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
  const lines = [p.name];
  if (p.email) lines.push(p.email);
  if (p.phone) lines.push(p.phone);
  lines.push(
    p.lastContactedAt
      ? `Last contacted: ${new Date(p.lastContactedAt).toLocaleDateString()}`
      : "Never contacted"
  );
  return lines.join("\n");
};

type Props = {
  company: Company;
  colorIdx: number;
  contacts: Contact[];
  tasks: Task[];
  onChanged: () => void;
};

export const CompanyCard = ({
  company,
  colorIdx,
  contacts,
  tasks,
  onChanged,
}: Props) => {
  const [newContact, setNewContact] = useState("");
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);

  // Task creation form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "med" | "high">("med");
  const [taskDue, setTaskDue] = useState("");
  const [taskContactIds, setTaskContactIds] = useState<string[]>([]);
  const [taskFormOpen, setTaskFormOpen] = useState(false);

  const addContact = async () => {
    if (!newContact.trim()) return;
    await api.createContact(company.id, { name: newContact.trim() });
    setNewContact("");
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
    if (!taskTitle.trim()) return;
    await api.createTask({
      title: taskTitle.trim(),
      priority: taskPriority,
      dueDate: taskDue || undefined,
      contactIds: taskContactIds,
      companyId: company.id,
    });
    setTaskTitle("");
    setTaskDue("");
    setTaskContactIds([]);
    setTaskPriority("med");
    setTaskFormOpen(false);
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

  return (
    <div className={`company-card color-${colorIdx}`}>
      <header className="card-header">
        <h3>{company.name}</h3>
        <button
          className="btn-ghost danger"
          title="Delete company"
          onClick={removeCompany}
        >
          ×
        </button>
      </header>

      {/* Contacts ─────────────────────────────────────────── */}
      <section className="card-section">
        <h4>People ({contacts.length})</h4>
        <ul className="contacts-list">
          {contacts.map((p) => (
            <ContactRow
              key={p.id}
              contact={p}
              expanded={expandedContactId === p.id}
              onToggle={() =>
                setExpandedContactId((x) => (x === p.id ? null : p.id))
              }
              onDelete={() => removeContact(p.id)}
              onChanged={onChanged}
            />
          ))}
        </ul>
        <div className="add-row">
          <input
            placeholder="Add person…"
            value={newContact}
            onChange={(e) => setNewContact(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addContact()}
          />
        </div>
      </section>

      {/* Tasks ────────────────────────────────────────────── */}
      <section className="card-section tasks-section">
        <h4>Tasks ({tasks.filter((t) => t.status === "open").length} open / {tasks.length})</h4>
        <ul className="tasks-list">
          {tasks.map((t) => (
            <li
              key={t.id}
              className={`task-row prio-${t.priority} ${t.status}`}
            >
              <input
                type="checkbox"
                checked={t.status === "done"}
                onChange={() => toggleTask(t)}
              />
              <span className="task-title" title={t.title}>
                {t.title}
              </span>
              <span className={`task-prio prio-${t.priority}`}>
                {t.priority}
              </span>
              <span className="task-due">
                {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : ""}
              </span>
              <button className="task-del" onClick={() => removeTask(t)}>
                ×
              </button>
            </li>
          ))}
          {tasks.length === 0 && <li className="empty-row">No tasks yet.</li>}
        </ul>

        {taskFormOpen ? (
          <div className="task-add-form">
            <input
              autoFocus
              placeholder="Task title"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createTask()}
            />
            <div className="task-add-meta">
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as any)}
              >
                <option value="low">low</option>
                <option value="med">med</option>
                <option value="high">high</option>
              </select>
              <input
                type="date"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
              />
              {contacts.length > 0 && (
                <select
                  multiple
                  value={taskContactIds}
                  onChange={(e) =>
                    setTaskContactIds(
                      Array.from(e.target.selectedOptions).map((o) => o.value)
                    )
                  }
                  title="Hold ⌘/Ctrl to select multiple"
                >
                  {contacts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="task-add-actions">
              <button className="btn-primary" onClick={createTask}>
                Add task
              </button>
              <button className="btn-ghost" onClick={() => setTaskFormOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="add-task-btn" onClick={() => setTaskFormOpen(true)}>
            + Add task
          </button>
        )}
      </section>
    </div>
  );
};

// ─── Contact row (with inline expand for notes + "I talked with him") ───

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
              {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
              {contact.phone && <span>{contact.phone}</span>}
            </div>
          )}
          <button
            className="contacted"
            onClick={markContacted}
            disabled={busy}
          >
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
