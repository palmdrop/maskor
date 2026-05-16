import { useRef, useState } from "react";
import { UploadIcon, Loader2Icon } from "lucide-react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@components/ui/select";
import { useImportFragments } from "@api/generated/fragments/fragments";
import type { ImportResult } from "@api/generated/maskorAPI.schemas";

type HeadingLevel = "1" | "2" | "3" | "4" | "5" | "6";
type Format = "markdown" | "docx" | "plaintext";

function formatFromExtension(filename: string): Format | null {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "md") return "markdown";
  if (extension === "docx") return "docx";
  if (extension === "txt") return "plaintext";
  return null;
}

type ImportDialogProps = {
  projectId: string;
  onImported: () => void;
};

export const ImportDialog = ({ projectId, onImported }: ImportDialogProps) => {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<Format | null>(null);
  const [headingLevel, setHeadingLevel] = useState<HeadingLevel>("1");
  const [delimiter, setDelimiter] = useState("---");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: importFragments, isPending } = useImportFragments();

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setFile(null);
      setFormat(null);
      setHeadingLevel("1");
      setDelimiter("---");
      setError(null);
      setResult(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
    setOpen(next);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);
    setResult(null);
    if (selected) {
      setFormat(formatFromExtension(selected.name));
    } else {
      setFormat(null);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      setError("Please select a file.");
      return;
    }
    if (!format) {
      setError("Unsupported file type. Use .md, .txt, or .docx.");
      return;
    }

    setError(null);

    let options: string;
    if (format === "plaintext") {
      options = JSON.stringify({ format, delimiter });
    } else {
      options = JSON.stringify({ format, headingLevel: Number(headingLevel) });
    }

    try {
      const response = await importFragments({
        projectId,
        data: { file, options },
      });

      if (response.status === 200) {
        setResult(response.data);
        onImported();
        if (response.data.errors.length === 0) {
          setOpen(false);
        }
      } else {
        setError(
          (response.data as { error?: string })?.error ?? "Import failed. Please try again.",
        );
      }
    } catch {
      setError("Network error. Please try again.");
    }
  };

  const showHeadingLevel = format === "markdown" || format === "docx";
  const showDelimiter = format === "plaintext";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="self-start">
          <UploadIcon />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import file as fragments</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-file">File</Label>
            <input
              id="import-file"
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.docx"
              onChange={handleFileChange}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {showHeadingLevel && (
            <div className="flex flex-col gap-1.5">
              <Label>Split on heading level</Label>
              <Select
                value={headingLevel}
                onValueChange={(value) => setHeadingLevel(value as HeadingLevel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">H1 only</SelectItem>
                  <SelectItem value="2">H1 and H2</SelectItem>
                  <SelectItem value="3">H1 through H3</SelectItem>
                  <SelectItem value="4">H1 through H4</SelectItem>
                  <SelectItem value="5">H1 through H5</SelectItem>
                  <SelectItem value="6">H1 through H6</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {showDelimiter && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-delimiter">Delimiter</Label>
              <Input
                id="import-delimiter"
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
                placeholder="e.g. ---"
              />
            </div>
          )}
          {result && (
            <p className="text-xs text-muted-foreground">
              Created {result.created.length} fragment{result.created.length !== 1 ? "s" : ""}
              {result.errors.length > 0 && (
                <span className="text-destructive">
                  {" "}
                  ({result.errors.length} failed)
                </span>
              )}
              .
            </p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isPending || !file}>
            {isPending && <Loader2Icon className="animate-spin" />}
            {isPending ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
