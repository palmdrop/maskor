type Body = { error?: string; message?: string; hint?: string };

export class ApiRequestError extends Error {
  public readonly statusCode: number;
  public readonly body: Body;
  // Present when the backend already recorded this failure as a command:error
  // entry (read from the X-Correlation-Id response header). Its presence tells
  // the command error handler not to post a duplicate frontend entry.
  public readonly correlationId?: string;

  constructor(statusCode: number, body: Body, correlationId?: string) {
    super(body.message ?? `Request failed with status ${statusCode}`);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
    this.body = body;
    this.correlationId = correlationId;
  }
}
