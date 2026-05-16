import { useNavigate } from "@tanstack/react-router";
import type { Project } from "@api/generated/maskorAPI.schemas";
import { Button } from "@components/ui/button";
import { useFsList } from "@api/fs";
import { ApiRequestError } from "@api/errors";

export const ProjectRow = ({ project }: { project: Project }) => {
  const navigate = useNavigate();
  const listQuery = useFsList(project.vaultPath);

  const vaultMissing =
    listQuery.isError &&
    listQuery.error instanceof ApiRequestError &&
    listQuery.error.statusCode === 404;

  return (
    <li className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium truncate">{project.name}</span>
        <span className="text-xs text-muted-foreground truncate">{project.vaultPath}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => console.log("rename", project.projectUUID)}
        >
          Rename
        </Button>
        {vaultMissing ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => console.log("locate vault", project.projectUUID)}
          >
            Locate vault…
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() =>
              navigate({
                to: "/projects/$projectId",
                params: { projectId: project.projectUUID },
              })
            }
          >
            Open
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => console.log("deregister", project.projectUUID)}
        >
          Deregister
        </Button>
      </div>
    </li>
  );
};
