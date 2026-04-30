import { config } from "./config";
import { getToken } from "./auth";

const req = async <T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> => {
  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getToken()}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${method} ${path}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
};

export type Company = { id: string; name: string; createdAt: string };
export type Contact = {
  id: string;
  companyId: string;
  name: string;
  email?: string;
  phone?: string;
  lastContactedAt?: string;
  createdAt: string;
};
export type Task = {
  id: string;
  title: string;
  priority: "low" | "med" | "high";
  dueDate?: string;
  status: "open" | "done";
  contactIds: string[];
  createdAt: string;
};
export type Note = {
  id: string;
  text: string;
  author: string;
  createdAt: string;
};
export type Reminder = {
  id: string;
  kind: "contact_stale" | "company_stale";
  targetId: string;
  targetName: string;
  lastSeenAt?: string;
};
export type UserActivity = {
  email: string;
  lastInteractionAt: string;
  lastContactId: string;
  lastContactName: string;
};

export const api = {
  listCompanies: () => req<Company[]>("GET", "/companies"),
  createCompany: (name: string) => req<Company>("POST", "/companies", { name }),
  deleteCompany: (id: string) => req<void>("DELETE", `/companies/${id}`),

  listContacts: (companyId: string) =>
    req<Contact[]>("GET", `/companies/${companyId}/contacts`),
  createContact: (companyId: string, c: Omit<Contact, "id" | "companyId" | "createdAt">) =>
    req<Contact>("POST", `/companies/${companyId}/contacts`, c),
  deleteContact: (id: string) => req<void>("DELETE", `/contacts/${id}`),
  markContacted: (id: string) =>
    req<{ id: string; lastContactedAt: string }>(
      "POST",
      `/contacts/${id}/contacted`
    ),

  listTasks: () => req<Task[]>("GET", "/tasks"),
  createTask: (t: {
    title: string;
    priority: "low" | "med" | "high";
    dueDate?: string;
    contactIds?: string[];
  }) => req<Task>("POST", "/tasks", t),
  updateTask: (id: string, patch: Partial<Task>) =>
    req<Task>("PATCH", `/tasks/${id}`, patch),
  deleteTask: (id: string) => req<void>("DELETE", `/tasks/${id}`),

  listNotes: (parent: string) =>
    req<Note[]>("GET", `/notes?parent=${encodeURIComponent(parent)}`),
  addCompanyNote: (companyId: string, text: string) =>
    req<Note>("POST", `/companies/${companyId}/notes`, { text }),
  addContactNote: (contactId: string, text: string) =>
    req<Note>("POST", `/contacts/${contactId}/notes`, { text }),

  summary: () =>
    req<{
      companies: number;
      contacts: number;
      tasks: number;
      openTasks: number;
    }>("GET", "/summary"),
  reminders: () => req<Reminder[]>("GET", "/reminders"),
  userActivity: () => req<UserActivity[]>("GET", "/users/activity"),
};
