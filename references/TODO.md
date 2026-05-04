# General

- [ ] Try graphify: https://github.com/safishamsi/graphify
  - tried `repomix` instead
  - or https://www.augmentcode.com/

- [x] Try caveman pattern - put in CLAUDE.md

- [x] notes/references/aspects and maybe also fragments are softdeleted intentionally in db... this causes file to get removed when deleted, but db entry remains... this has no purpose. File is important, db is not. Hard-delete everything. Put the physical file in a trash dir if keeping it is important.

- [ ] renaming a note/ref from the filesystem is not properly picked up by the watcher... rename not propagated to maskor... fix

- [ ] Move aspects, notes, etc to a trash folder instead of hard-deleting

- [ ] If any file in the appropriate folder is missing metadata or uuid, just create it -- user might have dragged it in from another project
  - TODO: importing capabilities

- [x] Add way to rename notes, references

- [ ] Unify ref/note/aspect and even fragment editor... all should use the same editor with same capabilities, but diff metadata properties and handlers. A lot of duplicate code now.

- [ ] Find flow for using cheaper models for appropriate tasks
  - queue up tasks to a good but slow model on my home desktop! see if I can manage sufficiently good results

- [ ] Rework note/reference/aspect management... uses UUIDs for nav but slug is unique (has to be). Makes it hard to link to, if only slug is available. See `packages/frontend/src/components/fragments/fragment-metadata-form.tsx` < link to reference page is wrong

- [ ] Check if eslint has a config for disallowing one-letter variables... but how to exclude iterators from this?

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
