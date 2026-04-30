import { useEffect, useState } from "react";
import { api } from "../api";

export const Summary = ({ refreshKey }: { refreshKey: number }) => {
  const [s, setS] = useState({
    companies: 0,
    contacts: 0,
    tasks: 0,
    openTasks: 0,
  });

  useEffect(() => {
    api.summary().then(setS);
  }, [refreshKey]);

  return (
    <div className="summary">
      <div><strong>{s.companies}</strong> companies</div>
      <div><strong>{s.contacts}</strong> contacts</div>
      <div><strong>{s.tasks}</strong> tasks ({s.openTasks} open)</div>
    </div>
  );
};
