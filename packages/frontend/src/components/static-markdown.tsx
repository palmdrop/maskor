import { useMemo } from "react";
import MarkdownIt from "markdown-it";

const markdownRenderer = new MarkdownIt({
  html: false,
  breaks: false,
  linkify: true,
  typographer: true,
});

export type StaticMarkdownProps = {
  content: string;
  className?: string;
};

export const StaticMarkdown = ({ content, className }: StaticMarkdownProps) => {
  const html = useMemo(() => markdownRenderer.render(content), [content]);

  return (
    <div
      className={className ?? "prose prose-stone dark:prose-invert max-w-none"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
