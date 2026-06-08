import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { ActionLogEntry } from "@maskor/shared";

type Props = {
  entry: ActionLogEntry;
  projectId: string;
  children: ReactNode;
};

const linkClassName = "hover:underline";

export const EntryLink = ({ entry, projectId, children }: Props) => {
  switch (entry.target.type) {
    case "fragment":
      return (
        <Link
          to="/projects/$projectId/fragments/$fragmentId"
          params={{ projectId, fragmentId: entry.target.uuid }}
          className={linkClassName}
        >
          {children}
        </Link>
      );
    case "aspect":
      return (
        <Link
          to="/projects/$projectId/aspects/$aspectId"
          params={{ projectId, aspectId: entry.target.uuid }}
          className={linkClassName}
        >
          {children}
        </Link>
      );
    case "note":
      return (
        <Link
          to="/projects/$projectId/notes/$noteId"
          params={{ projectId, noteId: entry.target.uuid }}
          className={linkClassName}
        >
          {children}
        </Link>
      );
    case "reference":
      return (
        <Link
          to="/projects/$projectId/references/$referenceId"
          params={{ projectId, referenceId: entry.target.uuid }}
          className={linkClassName}
        >
          {children}
        </Link>
      );
    case "sequence":
      return <>{children}</>;
  }
};
