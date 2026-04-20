# General

- [ ] Users do not set fragment pool manually, it is set by the system automatically when a fragment has sufficient metadata, is placed, etc

- [ ] Fragment editor needs a discard button > to automatically move a fragment to discarded
  - the other properties, like incomplete, unplaced, are derived automatically...
  - NOTE: This makes me think that the pool property is not needed. However, we should probably have a way of detecting if a fragment is incomplete... and make it possible to search this? but what if a fragment is placed and then becomes incomplete due to a deleted metadata property?

- [ ] Sequences needs to be represented in a relational way... maybe create section objects and indices, add separate document for each fragment?
  - a sequence collection which holds sequence position data? same for sequence itself, sections, etc

- [ ] Investigate if orval can be used to generate zod schemas for the frontend as well... needed for fragment editor?

- [ ] Saving a discarded fragment that is not in the discarded pool accidentally creates a duplicate fragment?

- [ ] Only allow adding notes/references that already exist on the fragment editor

- [ ] Allow adding new aspects on the fragment editor page

- [ ] Only keep one save button for both metadata and fragment content

- [ ] Add simple project selection page

- [ ] Create project configuration backend and frontend
