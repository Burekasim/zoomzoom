import { useEffect, useState } from "react";
import { getToken, isExpired, login, handleCallback, logout, me } from "./auth";
import { Tree } from "./components/Tree";
import { Detail } from "./components/Detail";
import { Tasks } from "./components/Tasks";
import { Summary } from "./components/Summary";
import { Reminders } from "./components/Reminders";

type Selection =
  | { type: "company"; id: string; name: string }
  | { type: "contact"; id: string; name: string; companyId: string }
  | null;

export const App = () => {
  const [authed, setAuthed] = useState(false);
  const [sel, setSel] = useState<Selection>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      if (window.location.pathname === "/callback") {
        await handleCallback();
        window.location.replace("/");
        return;
      }
      const t = getToken();
      if (!t || isExpired(t)) {
        await login();
        return;
      }
      setAuthed(true);
    })();
  }, []);

  if (!authed) return <div className="loading">Loading…</div>;

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div className="app">
      <header>
        <h1>zoomzoom</h1>
        <span className="user">{me().email}</span>
        <button onClick={logout}>Sign out</button>
      </header>

      <Summary refreshKey={reloadKey} />
      <Reminders refreshKey={reloadKey} />

      <main className={sel ? "with-detail" : "without-detail"}>
        <aside className="tree-pane">
          <Tree
            refreshKey={reloadKey}
            onSelect={setSel}
            selectedId={sel?.id}
            onChanged={reload}
          />
        </aside>
        {sel && (
          <section className="detail-pane">
            <Detail key={sel.id} sel={sel} onChanged={reload} />
          </section>
        )}
        <section className="tasks-pane">
          <Tasks refreshKey={reloadKey} onChanged={reload} />
        </section>
      </main>
    </div>
  );
};
