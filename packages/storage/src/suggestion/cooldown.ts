// In-memory cooldown set per project. Lost on restart — intentional per spec.

export const COOLDOWN_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

type CooldownEntry = {
  surfacedAt: Date;
  editedWhileSurfaced: boolean;
  userPicked: boolean;
};

export class CooldownSet {
  private readonly entries = new Map<string, CooldownEntry>();

  add(uuid: string): void {
    this.entries.set(uuid, {
      surfacedAt: new Date(),
      editedWhileSurfaced: false,
      userPicked: false,
    });
  }

  markEdited(uuid: string): void {
    const entry = this.entries.get(uuid);
    if (entry) {
      entry.editedWhileSurfaced = true;
    }
  }

  // Flags an entry as having been loaded by an explicit user action (e.g. a
  // quick-switcher pick). getNext consults this to skip avoidance accounting:
  // a fragment the user actively sought out is not "engine-surfaced and
  // rejected", so pressing Next on it must not count as avoidance.
  markUserPicked(uuid: string): void {
    const entry = this.entries.get(uuid);
    if (entry) {
      entry.userPicked = true;
    }
  }

  has(uuid: string): boolean {
    return this.entries.has(uuid);
  }

  wasEditedWhileSurfaced(uuid: string): boolean {
    return this.entries.get(uuid)?.editedWhileSurfaced ?? false;
  }

  wasUserPicked(uuid: string): boolean {
    return this.entries.get(uuid)?.userPicked ?? false;
  }

  purgeExpired(now: Date = new Date(), windowMs: number = COOLDOWN_WINDOW_MS): void {
    for (const [uuid, entry] of this.entries) {
      if (now.getTime() - entry.surfacedAt.getTime() >= windowMs) {
        this.entries.delete(uuid);
      }
    }
  }

  // Returns the subset of allUuids that are not in cooldown.
  // Fallback: if all are cooled, returns the oldest cooldown entries sorted ascending
  // by surfacedAt (with a random shuffle at the end to add jitter) so suggestion mode
  // always produces a result when any eligible fragment exists.
  getEligible(
    allUuids: string[],
    rng: () => number = Math.random,
    now: Date = new Date(),
    windowMs: number = COOLDOWN_WINDOW_MS,
  ): string[] {
    this.purgeExpired(now, windowMs);

    const eligible = allUuids.filter((uuid) => !this.entries.has(uuid));

    if (eligible.length > 0) {
      return eligible;
    }

    // All cooled — fall back to oldest cooldown entries sorted ascending by surfacedAt.
    // Apply random jitter to the result order so we don't always re-surface the same one.
    const cooledEntries = allUuids
      .filter((uuid) => this.entries.has(uuid))
      .map((uuid) => ({
        uuid,
        surfacedAt: this.entries.get(uuid)!.surfacedAt,
        jitter: rng(),
      }))
      .sort((a, b) => a.surfacedAt.getTime() - b.surfacedAt.getTime() || a.jitter - b.jitter);

    return cooledEntries.map((entry) => entry.uuid);
  }
}
