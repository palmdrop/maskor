import { useParams, useSearch, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getGetProjectSuspenseQueryOptions } from "@api/generated/projects/projects";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/tabs";
import { GeneralTab } from "./tabs/GeneralTab";
import { NotesTab } from "./tabs/NotesTab";
import { ReferencesTab } from "./tabs/ReferencesTab";
import { AspectsTab } from "./tabs/AspectsTab";
import { DiagnosticsTab } from "./tabs/DiagnosticsTab";
import { useWarnings } from "@hooks/useWarnings";

export const ProjectConfigPage = () => {
  const { projectId } = useParams({ from: "/projects/$projectId/config" });
  const { tab } = useSearch({ from: "/projects/$projectId/config" });
  const navigate = useNavigate({ from: "/projects/$projectId/config" });
  // Prefetched by the route loader (and already warmed by ProjectShellLayout);
  // a failed load surfaces via the route error boundary (ViewError + Retry).
  const { data: envelope } = useSuspenseQuery(getGetProjectSuspenseQueryOptions(projectId));
  const { warnings } = useWarnings(projectId);

  const project = envelope.status === 200 ? envelope.data : null;
  if (!project) return null;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto p-2">
      <Tabs
        value={tab}
        onValueChange={(value) => navigate({ search: { tab: value as typeof tab } })}
        className="flex-1 flex-col"
      >
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="aspects">Aspects</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="references">References</TabsTrigger>
          <TabsTrigger value="diagnostics">
            Diagnostics
            {!!warnings.length && (
              <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 text-xs text-amber-600">
                {warnings.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralTab project={project} />
        </TabsContent>
        <TabsContent value="aspects">
          <AspectsTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="notes">
          <NotesTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="references">
          <ReferencesTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="diagnostics">
          <DiagnosticsTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
