import { ApiRequestError } from "@api/errors";
import { Button } from "@components/ui/button";

type Props = {
  error: unknown;
  onRetry?: () => void;
};

type DescribedError = {
  message: string;
  correlationId?: string;
  statusCode?: number;
};

const describeError = (error: unknown): DescribedError => {
  if (error instanceof ApiRequestError) {
    return {
      message: error.body.message ?? error.message,
      correlationId: error.correlationId,
      statusCode: error.statusCode,
    };
  }
  if (error instanceof Error) return { message: error.message };
  return { message: String(error) };
};

// Shared in-place fallback for a failed view load. Visually consistent with
// CommandFailureRow on the History page: destructive accent, a Details
// disclosure exposing the correlation id + technical message. Fills the
// content area so the navbar (rendered by ProjectShellLayout) persists.
export const ViewError = ({ error, onRetry }: Props) => {
  const { message, correlationId, statusCode } = describeError(error);
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-sm font-medium text-destructive">Couldn’t load this view.</p>
        <p className="text-sm text-muted-foreground">Something went wrong fetching the data.</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
      <details className="max-w-md text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Details</summary>
        <dl className="mt-1 flex flex-col gap-0.5 pl-2 text-left">
          {statusCode !== undefined && (
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium">Status</dt>
              <dd className="break-all">{statusCode}</dd>
            </div>
          )}
          {correlationId && (
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium">Correlation</dt>
              <dd className="break-all">{correlationId}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium">Detail</dt>
            <dd className="break-all">{message}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
};
