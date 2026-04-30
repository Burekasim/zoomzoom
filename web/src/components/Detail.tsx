import { useEffect, useState } from "react";
import { api, Note } from "../api";

type Sel =
  | { type: "company"; id: string; name: string }
  | { type: "contact"; id: string; name: string; companyId: string };

export const Detail = ({
  sel,
  onChanged,
}: {
  sel: Sel;
  onChanged: () => void;
}) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const parentKey =
    sel.type === "company" ? `COMPANY#${sel.id}` : `CONTACT#${sel.id}`;

  useEffect(() => {
    api.listNotes(parentKey).then(setNotes);
  }, [parentKey]);

  const addNote = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const n =
        sel.type === "company"
          ? await api.addCompanyNote(sel.id, text.trim())
          : await api.addContactNote(sel.id, text.trim());
      setNotes((s) => [n, ...s]);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  const markContacted = async () => {
    if (sel.type !== "contact") return;
    setBusy(true);
    try {
      await api.markContacted(sel.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="detail">
      <h2>
        <span className="badge">{sel.type}</span> {sel.name}
      </h2>
      {sel.type === "contact" && (
        <button className="contacted" onClick={markContacted} disabled={busy}>
          I talked with him
        </button>
      )}
      <h3>Notes</h3>
      <div className="add-note">
        <textarea
          placeholder="contract dates, issues, anything important…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button onClick={addNote} disabled={busy}>
          Add note
        </button>
      </div>
      <ul className="notes">
        {notes.map((n) => (
          <li key={n.id}>
            <div className="meta">
              {n.author} · {new Date(n.createdAt).toLocaleString()}
            </div>
            <div className="text">{n.text}</div>
          </li>
        ))}
        {notes.length === 0 && <li className="empty">No notes yet.</li>}
      </ul>
    </div>
  );
};
