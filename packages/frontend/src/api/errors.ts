type Body = { error?: string; message?: string; hint?: string };

export class ApiRequestError extends Error {
  public readonly statusCode: number;
  public readonly body: Body;

  constructor(statusCode: number, body: Body) {
    super(body.message ?? `Request failed with status ${statusCode}`);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
    this.body = body;
  }
}
