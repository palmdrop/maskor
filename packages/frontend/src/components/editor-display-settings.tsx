import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Slider } from "./ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Switch } from "./ui/switch";

type Props = {
  fontSize: number;
  maxParagraphWidth: number;
  // Live (un-committed) updates drive the slider; commit persists to the project config.
  onFontSizeChange: (value: number) => void;
  onFontSizeCommit: (value: number) => void;
  onMaxParagraphWidthChange: (value: number) => void;
  onMaxParagraphWidthCommit: (value: number) => void;
  // Vim clipboard toggle is shown only in vim mode.
  vimMode: boolean;
  vimClipboardSync: boolean;
  onToggleVimClipboardSync: (checked: boolean) => void;
};

// The "Aa" display-settings popover: font size, paragraph width, and (in vim mode) the yank/delete
// clipboard toggle. Presentation only — the shell owns the persistence handlers.
export function EditorDisplaySettings({
  fontSize,
  maxParagraphWidth,
  onFontSizeChange,
  onFontSizeCommit,
  onMaxParagraphWidthChange,
  onMaxParagraphWidthCommit,
  vimMode,
  vimClipboardSync,
  onToggleVimClipboardSync,
}: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" title="Display settings" aria-label="Display settings">
          Aa
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Font size</Label>
            <span className="text-xs text-muted-foreground tabular-nums">{fontSize}px</span>
          </div>
          <Slider
            min={12}
            max={24}
            step={1}
            value={[fontSize]}
            onValueChange={([value]) => onFontSizeChange(value!)}
            onValueCommit={([value]) => onFontSizeCommit(value!)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Paragraph width</Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {maxParagraphWidth}ch
            </span>
          </div>
          <Slider
            min={40}
            max={120}
            step={4}
            value={[maxParagraphWidth]}
            onValueChange={([value]) => onMaxParagraphWidthChange(value!)}
            onValueCommit={([value]) => onMaxParagraphWidthCommit(value!)}
          />
        </div>
        {vimMode && (
          <div className="flex items-center justify-between">
            <Label className="text-xs">Yank/delete to clipboard</Label>
            <Switch
              checked={vimClipboardSync}
              onCheckedChange={(checked) => onToggleVimClipboardSync(checked)}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
