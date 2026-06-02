// Coordinates a focus hand-off when a command moves focus while a Picker (command palette /
// quick-switcher) is closing.
//
// The Picker captures the element focused before it opened and restores focus to it on close
// (`onCloseAutoFocus` → editor). That restore fires *after* the close animation, so it clobbers any
// focus a command moved during its run (e.g. the comment gesture focusing the new comment field).
//
// A command that intends to move focus registers a claim. The closing Picker consumes the claim and
// runs it *instead of* restoring focus to the editor — and because it runs from `onCloseAutoFocus`
// (after the dialog has unmounted and released its focus trap), the command's target actually sticks.

type FocusClaim = () => void;

let pendingClaim: FocusClaim | null = null;

// How long a claim survives if no Picker consumes it. Long enough to outlast a Picker's close
// animation (~100ms), short enough to rarely collide with an unrelated later Picker close. When the
// command is invoked without any Picker open (e.g. a toolbar button), nothing consumes the claim and
// it simply expires — the command focuses directly in that case.
const CLAIM_TTL_MS = 200;

export const claimFocusOnPickerClose = (claim: FocusClaim): void => {
  pendingClaim = claim;
  setTimeout(() => {
    if (pendingClaim === claim) pendingClaim = null;
  }, CLAIM_TTL_MS);
};

// Consume the pending claim, if any. Called by a Picker as it closes.
export const consumeFocusClaim = (): FocusClaim | null => {
  const claim = pendingClaim;
  pendingClaim = null;
  return claim;
};
