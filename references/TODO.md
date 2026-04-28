# General

- [-] Try graphify: https://github.com/safishamsi/graphify
  - tried `repomix` instead
  - or https://www.augmentcode.com/

- [ ] look for bad patterns and fix them in the codebase
  - let the code be the documentation
  - for example, favor arrow functions over "function" declarations

- [ ] Add spec for command palette, similar to the one obsidian or vscode has. Could be nice for power users of maskor (me)

- [x] Have conversation with Claude about specs, check obsidian vault, check files in the project
  - create a map of all that is implemented and needs to be done
  - inspo https://ghuntley.com/ralph/
    - "Specs are formed through a conversation with the agent at the beginning phase of a project. Instead of asking the agent to implement the project, what you want to do is have a long conversation with the LLM about your requirements for what you're about to implement. Once your agent has a decent understanding of the task to be done, it's at that point that you issue a prompt to write the specifications out, one per file, in the specifications folder."
  - iterate, look at specs, look at plan, implement, review
  - https://www.augmentcode.com/
    - or other tool for mapping/indexing code base

- [-] make sure API is idempotent - retried requests should not cause side effects

- [x] Users do not set fragment pool manually, it is set by the system automatically when a fragment has sufficient metadata, is placed, etc

- [x] Fragment editor needs a discard button > to automatically move a fragment to discarded
  - the other properties, like incomplete, unplaced, are derived automatically...

- [ ] Sequences needs to be represented in a relational way... maybe create section objects and indices, add separate document for each fragment?
  - a sequence collection which holds sequence position data? same for sequence itself, sections, etc

- [ ] Investigate if orval can be used to generate zod schemas for the frontend as well... needed for fragment editor?

- [x] Saving a discarded fragment that is not in the discarded pool accidentally creates a duplicate fragment?

- [x] Only allow adding notes/references that already exist on the fragment editor

- [ ] Allow adding new aspects on the fragment editor page

- [x] Only keep one save button for both metadata and fragment content

- [ ] Add simple project selection page

- [ ] Create project configuration backend and frontend
