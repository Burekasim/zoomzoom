import { useEffect, useState } from "react";
import { getToken, isExpired, login, handleCallback, logout, me } from "./auth";
import { CompanyGrid } from "./components/CompanyGrid";
import { Summary } from "./components/Summary";
import { Reminders } from "./components/Reminders";
import { UserActivity } from "./components/UserActivity";
import { ThemeToggle } from "./components/ThemeToggle";

export const App = () => {
  const [authed, setAuthed] = useState(false);
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
        <h1>
          <span className="brand-mark">zz</span> zoomzoom
        </h1>
        <div className="header-right">
          <span className="user">{me().email}</span>
          <ThemeToggle />
          <button className="btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <div className="dashboard">
        <Summary refreshKey={reloadKey} />
        <UserActivity refreshKey={reloadKey} />
      </div>

      <Reminders refreshKey={reloadKey} />

      <main>
        <CompanyGrid refreshKey={reloadKey} onChanged={reload} />
      </main>
    </div>
  );
};
