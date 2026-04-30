import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE, now, nid } from "../lib/ddb.js";
import {
  ok,
  created,
  noContent,
  notFound,
  serverError,
  parseBody,
  HttpError,
  json,
} from "../lib/http.js";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Ev = APIGatewayProxyEventV2WithJWTAuthorizer;

interface Company {
  id: string;
  name: string;
  createdAt: string;
}
interface Contact {
  id: string;
  companyId: string;
  name: string;
  email?: string;
  phone?: string;
  side: "customer" | "aws"; // who the contact represents
  lastContactedAt?: string;
  lastContactedBy?: string;
  createdAt: string;
}
interface Task {
  id: string;
  title: string;
  priority: "low" | "med" | "high";
  dueDate?: string;
  status: "open" | "done";
  companyId?: string;
  contactIds: string[];
  owner?: string;
  createdAt: string;
}

export const handler = async (
  event: Ev
): Promise<APIGatewayProxyResultV2> => {
  // Reject anything that didn't come through CloudFront. CloudFront injects
  // x-origin-verify with a value matching ORIGIN_SECRET; direct hits to the
  // API Gateway URL won't have it.
  const expected = process.env.ORIGIN_SECRET;
  if (expected) {
    const got =
      event.headers["x-origin-verify"] ??
      event.headers["X-Origin-Verify"];
    if (got !== expected) return json(403, { error: "forbidden" });
  }

  const method = event.requestContext.http.method as Method;
  let path = event.rawPath.replace(/\/+$/, "") || "/";
  // Strip the /api prefix added by the CloudFront → API Gateway path.
  if (path.startsWith("/api/")) path = path.slice(4);
  else if (path === "/api") path = "/";

  try {
    return await route(method, path, event);
  } catch (e: any) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error(e);
    return serverError(e.message ?? "internal error");
  }
};

const route = async (m: Method, p: string, e: Ev) => {
  // companies
  if (p === "/companies" && m === "GET") return listCompanies();
  if (p === "/companies" && m === "POST") return createCompany(e);
  let mt = p.match(/^\/companies\/([^/]+)$/);
  if (mt && m === "GET") return getCompany(mt[1]);
  if (mt && m === "PATCH") return updateCompany(mt[1], e);
  if (mt && m === "DELETE") return deleteCompany(mt[1]);
  mt = p.match(/^\/companies\/([^/]+)\/contacts$/);
  if (mt && m === "GET") return listContacts(mt[1]);
  if (mt && m === "POST") return createContact(mt[1], e);
  mt = p.match(/^\/companies\/([^/]+)\/notes$/);
  if (mt && m === "POST") return createNote(`COMPANY#${mt[1]}`, e);

  // contacts
  mt = p.match(/^\/contacts\/([^/]+)$/);
  if (mt && m === "GET") return getContact(mt[1]);
  if (mt && m === "PATCH") return updateContact(mt[1], e);
  if (mt && m === "DELETE") return deleteContact(mt[1]);
  mt = p.match(/^\/contacts\/([^/]+)\/contacted$/);
  if (mt && m === "POST") return markContacted(mt[1], e);
  mt = p.match(/^\/contacts\/([^/]+)\/notes$/);
  if (mt && m === "POST") return createNote(`CONTACT#${mt[1]}`, e);

  // notes
  if (p === "/notes" && m === "GET") {
    const parent = e.queryStringParameters?.parent;
    if (!parent) throw new HttpError(400, "missing ?parent");
    return listNotes(parent);
  }

  // tasks
  if (p === "/tasks" && m === "GET") return listTasks();
  if (p === "/tasks" && m === "POST") return createTask(e);
  mt = p.match(/^\/tasks\/([^/]+)$/);
  if (mt && m === "PATCH") return updateTask(mt[1], e);
  if (mt && m === "DELETE") return deleteTask(mt[1]);
  mt = p.match(/^\/tasks\/([^/]+)\/updates$/);
  if (mt && m === "GET") return listTaskUpdates(mt[1]);
  if (mt && m === "POST") return addTaskUpdate(mt[1], e);

  // summary + reminders + per-user activity
  if (p === "/summary" && m === "GET") return getSummary();
  if (p === "/reminders" && m === "GET") return listReminders();
  if (p === "/users/activity" && m === "GET") return listUserActivity();

  return notFound(`no route for ${m} ${p}`);
};

// ---------- companies ----------

const listCompanies = async () => {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :p",
      ExpressionAttributeValues: { ":p": "ALL#COMPANY" },
    })
  );
  return ok(
    (r.Items ?? []).map((it) => ({
      id: it.id,
      name: it.name,
      createdAt: it.createdAt,
    }))
  );
};

const getCompany = async (id: string) => {
  const r = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `COMPANY#${id}`, SK: "META" },
    })
  );
  if (!r.Item) return notFound();
  return ok({ id: r.Item.id, name: r.Item.name, createdAt: r.Item.createdAt });
};

const createCompany = async (e: Ev) => {
  const body = parseBody<{ name: string }>(e.body);
  if (!body.name?.trim()) throw new HttpError(400, "name required");
  const c: Company = { id: nid(), name: body.name.trim(), createdAt: now() };
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `COMPANY#${c.id}`,
        SK: "META",
        GSI1PK: "ALL#COMPANY",
        GSI1SK: c.name.toLowerCase(),
        ...c,
      },
    })
  );
  return created(c);
};

const updateCompany = async (id: string, e: Ev) => {
  const body = parseBody<{ name?: string }>(e.body);
  if (!body.name) throw new HttpError(400, "no fields");
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `COMPANY#${id}`, SK: "META" },
      UpdateExpression: "SET #n = :n, GSI1SK = :s",
      ExpressionAttributeNames: { "#n": "name" },
      ExpressionAttributeValues: { ":n": body.name, ":s": body.name.toLowerCase() },
      ConditionExpression: "attribute_exists(PK)",
    })
  );
  return ok({ id, name: body.name });
};

const deleteCompany = async (id: string) => {
  // cascade: company meta + all CONTACT#* under same PK + notes
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :p",
      ExpressionAttributeValues: { ":p": `COMPANY#${id}` },
    })
  );
  for (const it of r.Items ?? []) {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { PK: it.PK, SK: it.SK },
      })
    );
  }
  return noContent();
};

// ---------- contacts ----------

const listContacts = async (companyId: string) => {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :p AND begins_with(SK, :s)",
      ExpressionAttributeValues: {
        ":p": `COMPANY#${companyId}`,
        ":s": "CONTACT#",
      },
    })
  );
  return ok(
    (r.Items ?? []).map((it) => ({
      id: it.id,
      companyId: it.companyId,
      name: it.name,
      email: it.email,
      phone: it.phone,
      side: (it.side as "customer" | "aws") ?? "customer",
      lastContactedAt: it.lastContactedAt,
      lastContactedBy: it.lastContactedBy,
      createdAt: it.createdAt,
    }))
  );
};

const createContact = async (companyId: string, e: Ev) => {
  const body = parseBody<{
    name: string;
    email?: string;
    phone?: string;
    side?: "customer" | "aws";
  }>(e.body);
  if (!body.name?.trim()) throw new HttpError(400, "name required");
  const c: Contact = {
    id: nid(),
    companyId,
    name: body.name.trim(),
    email: body.email,
    phone: body.phone,
    side: body.side === "aws" ? "aws" : "customer",
    createdAt: now(),
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `COMPANY#${companyId}`,
        SK: `CONTACT#${c.id}`,
        GSI1PK: `CONTACT#${c.id}`,
        GSI1SK: "META",
        ...c,
      },
    })
  );
  return created(c);
};

const findContact = async (id: string) => {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :p AND GSI1SK = :s",
      ExpressionAttributeValues: { ":p": `CONTACT#${id}`, ":s": "META" },
    })
  );
  return r.Items?.[0];
};

const getContact = async (id: string) => {
  const it = await findContact(id);
  if (!it) return notFound();
  return ok({
    id: it.id,
    companyId: it.companyId,
    name: it.name,
    email: it.email,
    phone: it.phone,
    side: (it.side as "customer" | "aws") ?? "customer",
    lastContactedAt: it.lastContactedAt,
    lastContactedBy: it.lastContactedBy,
    createdAt: it.createdAt,
  });
};

const updateContact = async (id: string, e: Ev) => {
  const it = await findContact(id);
  if (!it) return notFound();
  const body = parseBody<{ name?: string; email?: string; phone?: string }>(
    e.body
  );
  const sets: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, any> = {};
  for (const k of ["name", "email", "phone"] as const) {
    if (body[k] !== undefined) {
      sets.push(`#${k} = :${k}`);
      names[`#${k}`] = k;
      values[`:${k}`] = body[k];
    }
  }
  if (sets.length === 0) throw new HttpError(400, "no fields");
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: it.PK, SK: it.SK },
      UpdateExpression: "SET " + sets.join(", "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
  return ok({ id, ...body });
};

const deleteContact = async (id: string) => {
  const it = await findContact(id);
  if (!it) return notFound();
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: it.PK, SK: it.SK },
    })
  );
  return noContent();
};

const markContacted = async (id: string, e: Ev) => {
  const it = await findContact(id);
  if (!it) return notFound();
  const ts = now();
  const author =
    (e.requestContext.authorizer.jwt.claims.email as string) ?? "unknown";

  // Update the contact record with both the timestamp and who logged it.
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: it.PK, SK: it.SK },
      UpdateExpression: "SET lastContactedAt = :t, lastContactedBy = :u",
      ExpressionAttributeValues: { ":t": ts, ":u": author },
    })
  );

  // Upsert a per-user activity record so we can show "last interaction"
  // by SSO user on the dashboard. GSI1 lets us list all users sorted.
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `USER#${author}`,
        SK: "LAST_INTERACTION",
        GSI1PK: "USERS#ALL",
        GSI1SK: ts,
        email: author,
        lastInteractionAt: ts,
        lastContactId: it.id,
        lastContactName: it.name,
      },
    })
  );

  return ok({ id, lastContactedAt: ts, lastContactedBy: author });
};

// ---------- notes ----------

const createNote = async (parentPK: string, e: Ev) => {
  const body = parseBody<{ text: string }>(e.body);
  if (!body.text?.trim()) throw new HttpError(400, "text required");
  const ts = now();
  const id = nid();
  const author = (e.requestContext.authorizer.jwt.claims.email as string) ?? "unknown";
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: parentPK,
        SK: `NOTE#${ts}#${id}`,
        id,
        text: body.text.trim(),
        author,
        createdAt: ts,
      },
    })
  );
  return created({ id, text: body.text, author, createdAt: ts });
};

const listNotes = async (parent: string) => {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :p AND begins_with(SK, :s)",
      ExpressionAttributeValues: { ":p": parent, ":s": "NOTE#" },
      ScanIndexForward: false,
    })
  );
  return ok(
    (r.Items ?? []).map((it) => ({
      id: it.id,
      text: it.text,
      author: it.author,
      createdAt: it.createdAt,
    }))
  );
};

// ---------- tasks ----------

const listTasks = async () => {
  // Open tasks first (sorted by due date), then done. Two queries against GSI1.
  const open = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :p",
      ExpressionAttributeValues: { ":p": "STATUS#open" },
    })
  );
  const done = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :p",
      ExpressionAttributeValues: { ":p": "STATUS#done" },
    })
  );
  const items = [...(open.Items ?? []), ...(done.Items ?? [])].map((it) => ({
    id: it.id,
    title: it.title,
    priority: it.priority,
    dueDate: it.dueDate,
    status: it.status,
    companyId: it.companyId,
    contactIds: it.contactIds ?? [],
    owner: it.owner,
    createdAt: it.createdAt,
  }));
  return ok(items);
};

const createTask = async (e: Ev) => {
  const body = parseBody<{
    title: string;
    priority: "low" | "med" | "high";
    dueDate?: string;
    companyId?: string;
    contactIds?: string[];
    owner?: string;
  }>(e.body);
  if (!body.title?.trim()) throw new HttpError(400, "title required");
  if (!["low", "med", "high"].includes(body.priority))
    throw new HttpError(400, "invalid priority");
  const t: Task = {
    id: nid(),
    title: body.title.trim(),
    priority: body.priority,
    dueDate: body.dueDate,
    status: "open",
    companyId: body.companyId,
    contactIds: body.contactIds ?? [],
    owner: body.owner,
    createdAt: now(),
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `TASK#${t.id}`,
        SK: "META",
        GSI1PK: "STATUS#open",
        GSI1SK: t.dueDate ?? "9999-12-31",
        ...t,
      },
    })
  );
  // link rows for assigned contacts (so we can list a contact's tasks later if needed)
  for (const cid of t.contactIds) {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `CONTACT#${cid}`,
          SK: `TASK#${t.id}`,
          GSI1PK: `TASK#${t.id}`,
          GSI1SK: `CONTACT#${cid}`,
        },
      })
    );
  }
  return created(t);
};

const updateTask = async (id: string, e: Ev) => {
  const body = parseBody<{
    title?: string;
    priority?: "low" | "med" | "high";
    dueDate?: string | null;
    status?: "open" | "done";
    owner?: string | null;
  }>(e.body);
  const sets: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, any> = {};
  if (body.title !== undefined) {
    sets.push("#t = :t");
    names["#t"] = "title";
    values[":t"] = body.title;
  }
  if (body.priority !== undefined) {
    sets.push("priority = :p");
    values[":p"] = body.priority;
  }
  if (body.dueDate !== undefined) {
    sets.push("dueDate = :d, GSI1SK = :gd");
    values[":d"] = body.dueDate ?? null;
    values[":gd"] = body.dueDate ?? "9999-12-31";
  }
  if (body.status !== undefined) {
    sets.push("#s = :s, GSI1PK = :gp");
    names["#s"] = "status";
    values[":s"] = body.status;
    values[":gp"] = `STATUS#${body.status}`;
  }
  if (body.owner !== undefined) {
    sets.push("#o = :o");
    names["#o"] = "owner";
    values[":o"] = body.owner ?? null;
  }
  if (sets.length === 0) throw new HttpError(400, "no fields");
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `TASK#${id}`, SK: "META" },
      UpdateExpression: "SET " + sets.join(", "),
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
      ExpressionAttributeValues: values,
    })
  );
  return ok({ id, ...body });
};

const deleteTask = async (id: string) => {
  // Delete every item under PK=TASK#<id>: META and all UPDATE# entries.
  const own = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :p",
      ExpressionAttributeValues: { ":p": `TASK#${id}` },
    })
  );
  for (const it of own.Items ?? []) {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { PK: it.PK, SK: it.SK },
      })
    );
  }
  // Plus all CONTACT-side link rows pointing at this task.
  const links = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :p",
      ExpressionAttributeValues: { ":p": `TASK#${id}` },
    })
  );
  for (const it of links.Items ?? []) {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { PK: it.PK, SK: it.SK },
      })
    );
  }
  return noContent();
};

// ---------- task status updates (comment thread) ----------

const listTaskUpdates = async (taskId: string) => {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :p AND begins_with(SK, :s)",
      ExpressionAttributeValues: { ":p": `TASK#${taskId}`, ":s": "UPDATE#" },
      ScanIndexForward: false,
    })
  );
  return ok(
    (r.Items ?? []).map((it) => ({
      id: it.id,
      text: it.text,
      author: it.author,
      createdAt: it.createdAt,
    }))
  );
};

const addTaskUpdate = async (taskId: string, e: Ev) => {
  const body = parseBody<{ text: string }>(e.body);
  if (!body.text?.trim()) throw new HttpError(400, "text required");
  const ts = now();
  const id = nid();
  const author =
    (e.requestContext.authorizer.jwt.claims.email as string) ?? "unknown";
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `TASK#${taskId}`,
        SK: `UPDATE#${ts}#${id}`,
        id,
        text: body.text.trim(),
        author,
        createdAt: ts,
      },
    })
  );
  return created({ id, text: body.text.trim(), author, createdAt: ts });
};

// ---------- summary + reminders ----------

const getSummary = async () => {
  const [companies, contacts, tasks] = await Promise.all([
    countByGSI("ALL#COMPANY"),
    countContacts(),
    countTasks(),
  ]);
  return ok({
    companies,
    contacts,
    tasks: tasks.total,
    openTasks: tasks.open,
  });
};

const countByGSI = async (pk: string) => {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :p",
      Select: "COUNT",
      ExpressionAttributeValues: { ":p": pk },
    })
  );
  return r.Count ?? 0;
};

const countContacts = async () => {
  // Scan filtered to CONTACT items. Acceptable at v1 scale.
  const r = await ddb.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "begins_with(SK, :c)",
      ExpressionAttributeValues: { ":c": "CONTACT#" },
      Select: "COUNT",
    })
  );
  return r.Count ?? 0;
};

const countTasks = async () => {
  const open = await countByGSI("STATUS#open");
  const done = await countByGSI("STATUS#done");
  return { open, total: open + done };
};

const listUserActivity = async () => {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :p",
      ExpressionAttributeValues: { ":p": "USERS#ALL" },
      ScanIndexForward: false, // newest interactions first
    })
  );
  return ok(
    (r.Items ?? []).map((it) => ({
      email: it.email,
      lastInteractionAt: it.lastInteractionAt,
      lastContactId: it.lastContactId,
      lastContactName: it.lastContactName,
    }))
  );
};

const listReminders = async () => {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :p",
      ExpressionAttributeValues: { ":p": "REMINDER#system" },
      ScanIndexForward: false,
    })
  );
  return ok(
    (r.Items ?? []).map((it) => ({
      id: it.id,
      kind: it.kind,
      targetId: it.targetId,
      targetName: it.targetName,
      lastSeenAt: it.lastSeenAt,
      generatedAt: it.generatedAt,
    }))
  );
};
