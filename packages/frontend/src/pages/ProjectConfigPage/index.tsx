import { useParams, useSearch, useNavigate } from "@tanstack/react-router";
import { useGetProject } from "../../api/generated/projects/projects";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { GeneralTab } from "./tabs/GeneralTab";
import { NotesTab } from "./tabs/NotesTab";
import { ReferencesTab } from "./tabs/ReferencesTab";
import { AspectsTab } from "./tabs/AspectsTab";

export const ProjectConfigPage = () => {
  const { projectId } = useParams({ from: "/projects/$projectId/config" });
  const { tab } = useSearch({ from: "/projects/$projectId/config" });
  const navigate = useNavigate({ from: "/projects/$projectId/config" });
  const { data: envelope, isLoading, isError } = useGetProject(projectId);

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (isError || !envelope)
    return <p className="p-6 text-sm text-muted-foreground">Failed to load project.</p>;

  const project = envelope.status === 200 ? envelope.data : null;
  if (!project) return <p className="p-6 text-sm text-muted-foreground">Project not found.</p>;

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
      </Tabs>
    </div>
  );
};
