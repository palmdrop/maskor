import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getListProjectsSuspenseQueryOptions } from "@api/generated/projects/projects";
import { RegisterProjectDialog } from "./components/RegisterProjectDialog";
import { ProjectRow } from "./components/ProjectRow";
import { SettingsSection } from "./components/SettingsSection";
import { Button } from "@components/ui/button";

export const ProjectManagementPage = () => {
  const [registerOpen, setRegisterOpen] = useState(false);
  // Prefetched by the route loader; failures surface via the route error
  // boundary (ViewError + Retry).
  const { data: envelope } = useSuspenseQuery(getListProjectsSuspenseQueryOptions());

  const projects = envelope.status === 200 ? envelope.data : [];

  return (
    <>
      <RegisterProjectDialog open={registerOpen} onOpenChange={setRegisterOpen} />

      <div className="mx-auto max-w-2xl p-8 flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-medium">Projects</h1>
            <Button size="sm" onClick={() => setRegisterOpen(true)}>
              Register project
            </Button>
          </div>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects registered yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {projects.map((project) => (
                <ProjectRow key={project.projectUUID} project={project} />
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Settings
          </h2>
          <SettingsSection />
        </section>
      </div>
    </>
  );
};
