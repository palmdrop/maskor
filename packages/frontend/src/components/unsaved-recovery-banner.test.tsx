import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UnsavedRecoveryBanner, formatRelativeTime } from "./unsaved-recovery-banner";

describe("formatRelativeTime", () => {
  const now = new Date("2026-05-19T12:00:00.000Z");

  it("returns 'just now' for very recent times", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 10 * 1000), now)).toBe("just now");
  });

  it("returns minute counts beyond ~1 minute", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 5 * 60 * 1000), now)).toBe("5 minutes ago");
  });

  it("returns hour counts beyond ~1 hour", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 3 * 60 * 60 * 1000), now)).toBe(
      "3 hours ago",
    );
  });

  it("returns 'yesterday' for ~1 day ago", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 30 * 60 * 60 * 1000), now)).toBe(
      "yesterday",
    );
  });

  it("returns day counts beyond ~2 days", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), now)).toBe(
      "5 days ago",
    );
  });
});

describe("UnsavedRecoveryBanner", () => {
  it("renders the relative time in the banner copy", () => {
    const cachedAt = new Date(Date.now() - 5 * 60 * 1000);
    render(<UnsavedRecoveryBanner cachedAt={cachedAt} onDismiss={() => {}} />);
    expect(screen.getByRole("status").textContent).toMatch(/5 minutes ago/);
  });

  it("calls onDismiss when the Restore from server button is clicked", () => {
    const onDismiss = vi.fn();
    render(<UnsavedRecoveryBanner cachedAt={new Date()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /restore from server/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
