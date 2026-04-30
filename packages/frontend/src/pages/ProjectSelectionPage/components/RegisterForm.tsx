import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateProject,
  getListProjectsQueryKey,
} from "../../../api/generated/projects/projects";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

export const RegisterForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const queryClient = useQueryClient();
  const createProject = useCreateProject();
  const [name, setName] = useState("");
  const [vaultPath, setVaultPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await createProject.mutateAsync({ data: { name, vaultPath } });
      if (result.status === 201) {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setName("");
        setVaultPath("");
        onSuccess();
      } else {
        setError(result.data.message ?? "Registration failed.");
      }
    } catch {
      setError("Registration failed. Check your connection and try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="project-name">Name</Label>
        <Input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My novel"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="vault-path">Vault path</Label>
        <Input
          id="vault-path"
          value={vaultPath}
          onChange={(e) => setVaultPath(e.target.value)}
          placeholder="/Users/me/writing/vault"
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={createProject.isPending} className="self-start">
        Register project
      </Button>
    </form>
  );
};
