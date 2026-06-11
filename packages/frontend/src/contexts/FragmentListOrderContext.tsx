import { createContext, useContext, type ReactNode } from "react";

// The ordered uuids of the fragments currently rendered by FragmentListPage —
// search filter and show-discarded toggle already applied. FragmentListPage owns
// the filter state; the editor it renders in its <Outlet/> (FragmentPage) reads
// this list to drive Previous/Next over exactly what the list shows.
const FragmentListOrderContext = createContext<readonly string[] | null>(null);

export const useFragmentListOrder = () => useContext(FragmentListOrderContext);

export const FragmentListOrderProvider = ({
  orderedFragmentUuids,
  children,
}: {
  orderedFragmentUuids: readonly string[];
  children: ReactNode;
}) => (
  <FragmentListOrderContext.Provider value={orderedFragmentUuids}>
    {children}
  </FragmentListOrderContext.Provider>
);
