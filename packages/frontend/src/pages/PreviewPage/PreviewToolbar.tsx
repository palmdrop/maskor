import { useNavigate } from "@tanstack/react-router";
import { useUpdateProject } from "@api/generated/projects/projects";
import {
  ProjectUpdatePreviewSeparator,
  type ProjectUpdatePreviewSeparator as SeparatorType,
} from "@api/generated/maskorAPI.schemas";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@components/ui/select";

type Props = {
  projectId: string;
  sequences: Sequence[];
  activeSequenceUuid: string;
  showTitles: boolean;
  showSectionHeadings: boolean;
  separator: SeparatorType;
  hasSections: boolean;
};

export const PreviewToolbar = ({
  projectId,
  sequences,
  activeSequenceUuid,
  showTitles,
  showSectionHeadings,
  separator,
  hasSections,
}: Props) => {
  const navigate = useNavigate();
  const { mutate: updateProject } = useUpdateProject();

  const patch = (preview: {
    showTitles?: boolean;
    showSectionHeadings?: boolean;
    separator?: SeparatorType;
  }) => {
    updateProject({ projectId, data: { preview } });
  };

  const handleSequenceChange = (sequenceUuid: string) => {
    void navigate({
      to: "/projects/$projectId/preview",
      params: { projectId },
      search: { sequence: sequenceUuid },
    });
  };

  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 shrink-0 border-b border-border bg-background px-4 py-2">
      {sequences.length > 1 && (
        <Select value={activeSequenceUuid} onValueChange={handleSequenceChange}>
          <SelectTrigger className="h-7 text-xs w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sequences.map((seq) => (
              <SelectItem key={seq.uuid} value={seq.uuid}>
                {seq.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center gap-1.5">
        <Switch
          id="show-titles"
          checked={showTitles}
          onCheckedChange={(checked) => patch({ showTitles: checked })}
        />
        <Label htmlFor="show-titles" className="text-xs">
          Fragment titles
        </Label>
      </div>

      {hasSections && (
        <div className="flex items-center gap-1.5">
          <Switch
            id="show-section-headings"
            checked={showSectionHeadings}
            onCheckedChange={(checked) => patch({ showSectionHeadings: checked })}
          />
          <Label htmlFor="show-section-headings" className="text-xs">
            Section headings
          </Label>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <Label className="text-xs shrink-0">Separator</Label>
        <Select value={separator} onValueChange={(val) => patch({ separator: val as SeparatorType })}>
          <SelectTrigger className="h-7 text-xs w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ProjectUpdatePreviewSeparator["blank-line"]}>Blank line</SelectItem>
            <SelectItem value={ProjectUpdatePreviewSeparator["horizontal-rule"]}>
              Horizontal rule
            </SelectItem>
            <SelectItem value={ProjectUpdatePreviewSeparator.none}>None</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </header>
  );
};
