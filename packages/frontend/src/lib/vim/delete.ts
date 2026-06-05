let patched = false;

/**
 * Patches the vim register controller's pushText so that delete operations
 * (d, dd, D, x) also write to the system clipboard when getEnabled returns true.
 * Safe to call multiple times — the patch is applied only once per page load.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function patchDeleteClipboard(registerController: any, getEnabled: () => boolean): void {
  if (patched) return;
  patched = true;

  const original = (
    registerController.pushText as (
      registerName: string,
      operator: string,
      text: string,
      linewise: boolean,
      blockwise: boolean,
    ) => void
  ).bind(registerController);

  registerController.pushText = function (
    registerName: string,
    operator: string,
    text: string,
    linewise: boolean,
    blockwise: boolean,
  ): void {
    original(registerName, operator, text, linewise, blockwise);
    if (getEnabled() && operator === "delete" && !registerName) {
      navigator.clipboard.writeText(text).catch((error) => {
        // Clipboard write can fail if the user denies permissions or in non-secure contexts.
        console.error("Could not copy text to clipboard:", error);
      });
    }
  };
}
