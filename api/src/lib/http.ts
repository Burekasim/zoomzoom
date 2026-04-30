import type { APIGatewayProxyResultV2 } from "aws-lambda";

export const json = (
  status: number,
  body: unknown
): APIGatewayProxyResultV2 => ({
  statusCode: status,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const ok = (body: unknown) => json(200, body);
export const created = (body: unknown) => json(201, body);
export const noContent = (): APIGatewayProxyResultV2 => ({ statusCode: 204 });
export const bad = (msg: string) => json(400, { error: msg });
export const notFound = (msg = "not found") => json(404, { error: msg });
export const serverError = (msg: string) => json(500, { error: msg });

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const parseBody = <T>(raw: string | undefined): T => {
  if (!raw) throw new HttpError(400, "missing body");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, "invalid json");
  }
};
