import { useNavigate } from "@tanstack/react-router";
import {
  ProjectUpdatePreviewSeparator,
  type ProjectUpdatePreviewSeparator as SeparatorType,
} from "@api/generated/maskorAPI.schemas";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { Button } from "@components/ui/button";
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
  onPatch: (patch: {
    showTitles?: boolean;
    showSectionHeadings?: boolean;
    separator?: SeparatorType;
  }) => void;
  onExport: () => void;
  children?: React.ReactNode;
};

export const PreviewToolbar = ({
  projectId,
  sequences,
  activeSequenceUuid,
  showTitles,
  showSectionHeadings,
  separator,
  hasSections,
  children,
  onPatch,
  onExport,
}: Props) => {
  const navigate = useNavigate();

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
            {sequences.map((sequence) => (
              <SelectItem key={sequence.uuid} value={sequence.uuid}>
                {sequence.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center gap-1.5">
        <Switch
          id="show-titles"
          checked={showTitles}
          onCheckedChange={(checked) => onPatch({ showTitles: checked })}
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
            onCheckedChange={(checked) => onPatch({ showSectionHeadings: checked })}
          />
          <Label htmlFor="show-section-headings" className="text-xs">
            Section headings
          </Label>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <Label className="text-xs shrink-0">Separator</Label>
        <Select
          value={separator}
          onValueChange={(value) => onPatch({ separator: value as SeparatorType })}
        >
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
      <div className="ml-auto flex min-w-0 items-center gap-3">
        {children}
        <Button variant="outline" size="sm" onClick={onExport}>
          Export
        </Button>
      </div>
    </header>
  );
};
