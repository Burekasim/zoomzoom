import {
  ScanCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE, now, nid } from "../lib/ddb.js";

const DAY = 86_400_000;
const CONTACT_THRESHOLD_DAYS = 14;
const COMPANY_THRESHOLD_DAYS = 30;

interface ContactItem {
  PK: string;
  SK: string;
  id: string;
  companyId: string;
  name: string;
  lastContactedAt?: string;
  createdAt: string;
}

export const handler = async () => {
  const contacts = await scanAll<ContactItem>("begins_with(SK, :c)", {
    ":c": "CONTACT#",
  });
  const companies = await scanAll<{ PK: string; id: string; name: string }>(
    "PK = :p",
    { ":p": "MARK" } // unused — we'll use Query below
  );
  // We don't actually use the dummy scan; query company list via GSI1 instead.
  const companyList = await queryGSI("ALL#COMPANY");

  const nowMs = Date.now();
  const reminders: Array<{
    id: string;
    kind: "contact_stale" | "company_stale";
    targetId: string;
    targetName: string;
    lastSeenAt?: string;
  }> = [];

  // contact-level: missing lastContactedAt or older than threshold
  for (const c of contacts) {
    const last = c.lastContactedAt ?? c.createdAt;
    const age = nowMs - new Date(last).getTime();
    if (age > CONTACT_THRESHOLD_DAYS * DAY) {
      reminders.push({
        id: `contact-${c.id}`,
        kind: "contact_stale",
        targetId: c.id,
        targetName: c.name,
        lastSeenAt: last,
      });
    }
  }

  // company-level: max(contact.lastContactedAt) across its contacts older than threshold
  const byCompany = new Map<string, { name: string; latest: string }>();
  for (const it of companyList) {
    byCompany.set(it.id, { name: it.name, latest: it.createdAt });
  }
  for (const c of contacts) {
    const last = c.lastContactedAt ?? c.createdAt;
    const cur = byCompany.get(c.companyId);
    if (cur && last > cur.latest) cur.latest = last;
  }
  for (const [companyId, { name, latest }] of byCompany) {
    const age = nowMs - new Date(latest).getTime();
    if (age > COMPANY_THRESHOLD_DAYS * DAY) {
      reminders.push({
        id: `company-${companyId}`,
        kind: "company_stale",
        targetId: companyId,
        targetName: name,
        lastSeenAt: latest,
      });
    }
  }

  // wipe previous reminder partition then write fresh ones
  const existing = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :p",
      ExpressionAttributeValues: { ":p": "REMINDER#system" },
    })
  );
  for (const it of existing.Items ?? []) {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { PK: it.PK, SK: it.SK },
      })
    );
  }
  const ts = now();
  for (const r of reminders) {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: "REMINDER#system",
          SK: `${ts}#${r.id}`,
          ...r,
          generatedAt: ts,
        },
      })
    );
  }

  return { count: reminders.length };
};

const scanAll = async <T>(
  filter: string,
  values: Record<string, any>
): Promise<T[]> => {
  const out: T[] = [];
  let key: any = undefined;
  do {
    const r: any = await ddb.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: filter,
        ExpressionAttributeValues: values,
        ExclusiveStartKey: key,
      })
    );
    out.push(...(r.Items ?? []));
    key = r.LastEvaluatedKey;
  } while (key);
  return out;
};

const queryGSI = async (gsi1pk: string) => {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :p",
      ExpressionAttributeValues: { ":p": gsi1pk },
    })
  );
  return (r.Items ?? []) as Array<{ id: string; name: string; createdAt: string }>;
};
