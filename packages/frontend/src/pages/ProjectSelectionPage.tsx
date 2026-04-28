import { useNavigate } from "@tanstack/react-router";
import { useListProjects } from "../api/generated/projects/projects";

export const ProjectSelectionPage = () => {
  const navigate = useNavigate();
  const { data: envelope, isLoading, isError } = useListProjects();

  if (isLoading) {
    return <p>Loading projects...</p>;
  }

  if (isError || !envelope) {
    return <p>Failed to load projects.</p>;
  }

  const projects = envelope.status === 200 ? envelope.data : [];

  if (projects.length === 0) {
    return <p>No projects registered. Use the API to register one.</p>;
  }

  return (
    <ul>
      {projects.map((project) => (
        <li key={project.projectUUID}>
          <button
            onClick={() =>
              navigate({ to: "/projects/$projectId", params: { projectId: project.projectUUID } })
            }
          >
            {project.name}
          </button>
        </li>
      ))}
    </ul>
  );
};
