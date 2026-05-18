# General

- [ ] Try graphify: https://github.com/safishamsi/graphify
  - tried `repomix` instead
  - or https://www.augmentcode.com/

- [x] perform planned sequence action log name fix: `references/plans/sequence-action-log-human-readable.md`

- [ ] start implementing `references/plans/drafting-first-slice.md`

- [x] start implementing the preview mode, see new `preview.md` spec

- [ ] remove pieces in favor of dropping partial data directly in the fragments dir, maskor automatically adds missing metdata
  - make sure to update all relevant specs to avoid confusing the poor poor agents!

- [ ] create way of exporting a dump of discarded fragments! you might want to save them all

- [ ] add ability to re-order sections

- [ ] inspiration manager - add images, floating over the project...
  - maybe this is a separate app: like a digital are.na frame?

- [x] ralph flow might eat too many tokens for my budget... old plan structure is worse on context but doesn't force the agent to rebuild the relevant context
  - ralph, for many related user stories, is probably worse. Use it when you have actually scattered work, not when creating large, new features
  - TODO: introduce commits and branches in old plan flow, and make sure the agent always update the specs with shipped items

- [-] create ralph prd for generating preview page of project (pre-export), i.e all fragments after each other
  - user can set if titles should be visible or not
  - if section titles should be visible

- [ ] create a spec for "snapshots" or versions, i.e saving a draft. The user should be able to go back to old drafts easily, then back again. Making changes in an old draft is not allowed, unless the user restores, or creates a new project based on that draft.
  - maybe use git in the background? commit, tag, checkout? or some other system

- [x] Feature to create new fragment from within Maskor

- [x] In the suggestion page, merge the top bar for saving, discarding and hitting next... no need for two top bars

- [ ] Place frontend components in appropriate subfolders -- right now, everything is on root level

- [ ] Create system for tracking todos, future ideas, etc... stub fragments for things that should be written, etc

- [x] filename stubs strips åäö -- allow any title that the filesystem supports. ÅÄÖ should be fine?

- [x] process specs, vision and plans and create 1) timeline (maybe not though?), 2) a set of features, implemented and not implemented
  - and also, make sure to mark the status of each spec - complete? implemented? no?
  - idea is to be able to extract a set of user stories, or tasks, todos, whatever, for the ralph-like workflow below to consume
  - also important that I wire in automatic git commits here, to make the log clear (making it easier for me and the agent)
  - AND plan up a process file, see below

- [ ] arcs probably need a way to have a name that is different from the aspect?
  - or discuss this with the agent > how to handle this? an arc pertaining to an aspect, for example character development - however, that character could have multiple related arcs? should all these get aspects of their own? yes?
  - implicit link between arcs and aspects? a 1-to-1 relationship?

- [ ] when doing things with sequences, the action log shows UUIDs instead of titles

- [x] add import aliases in frontend - all import paths are ugly

- [x] try a ralph-like workflow, inspo https://www.youtube.com/watch?v=_IK18goX4X8
  - progress file
  - IMPLEMENT FROM THIS: https://github.com/snarktank/ralph/tree/main
  - PIN! i.e short summary of project setup, see https://www.youtube.com/watch?v=4Nna09dG_c0
    - used to give initial context, for example, before discussing specs
    - TODO: try with spec for adding links/comments
    - use specifications/vision.md
  - pool of tasks or user stories to complete
  - derive from specs somehow?
  - TODO: go over all the plans and specs, figure out what is already done, and figure out what's left to do.
  - https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
  - TRANSITION from multi-phase-planning to prd.json, small tasks pool
  - use notifying utility to send a push notification to my phone when done...

- [ ] a system for pinning a fragment for continuous writing, until done
  - useful for when just starting a fragment, but not ready to release it into the remaining pool yet

- [x] Try caveman pattern - put in CLAUDE.md

- [x] notes/references/aspects and maybe also fragments are softdeleted intentionally in db... this causes file to get removed when deleted, but db entry remains... this has no purpose. File is important, db is not. Hard-delete everything. Put the physical file in a trash dir if keeping it is important.

- [x] refactor fragments to use the key as title like aspects and notes does... check the filename as key plan for this

- [x] fragments now have both key-based naming AND titles, displayed a bit differently in different locations. Fix

- [x] fragments store aspects in "properties", however, this is vague... properties are always aspects. Rename?

- [ ] consider mermaid for exporting/rendering graphs, visualizations, in obsidian
  - one idea is to port maskor to a obsidian plugin... but I also want it as a standalone app?

- [ ] The new project statistics fragment table should have a toggle for including discarded fragments

- [ ] add links -- same as obsidian, compatible format! but enhanced, perhaps tiptap has a slash syntax for commands?

- [x] saving with :w in vim mode no longer works, why?

- [ ] add comment concept: it is important to be able to add comments... perhaps this could be solved using notes? or a new concept entirely?

- [x] renaming a note/ref from the filesystem is not properly picked up by the watcher... rename not propagated to maskor... fix
  - NOTE: this is hard to fix since I decided to use the filename as the key... fragments have no way of mapping back to the aspect. Need to go back to UUIDs for storing fragment->aspect relations, OR accept this, and encourage renaming through maskor?

- [ ] make sure orphaned aspects are still visible in the metadata editor. Should probably have an indicator for this.

- [ ] Move aspects, notes, etc to a trash folder instead of hard-deleting

- [x] Refactor watcher code, lots of code duplication and huge file size

- [ ] Investigate logger... is the pattern good? where to see logs? how to write intentional logs for me to read?

- [ ] If any file in the appropriate folder is missing metadata or uuid, just create it -- user might have dragged it in from another project
  - TODO: importing capabilities

- [x] File import flow: import an entire file that gets split into multiple fragments. Distinct from the current piece-conversion path (1 file → 1 fragment) — needs a splitter (by heading, by paragraph, by length, by user-selected delimiter) and a confirmation UI. When implemented, log as a `fragment:imported` (or similar) action in the action log; payload includes `sourceFileName` and `fragmentCount`. See `specifications/action-log.md`.

- [x] Add way to rename notes, references

- [x] Unify ref/note/aspect and even fragment editor... all should use the same editor with same capabilities, but diff metadata properties and handlers. A lot of duplicate code now.

- [ ] Find flow for using cheaper models for appropriate tasks
  - queue up tasks to a good but slow model on my home desktop! see if I can manage sufficiently good results

- [x] Rework note/reference/aspect management... uses UUIDs for nav but slug is unique (has to be). Makes it hard to link to, if only slug is available. See `packages/frontend/src/components/fragments/fragment-metadata-form.tsx` < link to reference page is wrong

- [-] Check if eslint has a config for disallowing one-letter variables... but how to exclude iterators from this?

- [ ] look for bad patterns and fix them in the codebase
  - let the code be the documentation
  - for example, favor arrow functions over "function" declarations

- [ ] Add spec for command palette, similar to the one obsidian or vscode has. Could be nice for power users of maskor (me)
  - merge this with keyboard shortcut implementation > a way to execute commands AND map keyboard shortcuts in a sensible, global way

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

- [x] Sequences needs to be represented in a relational way... maybe create section objects and indices, add separate document for each fragment?
  - a sequence collection which holds sequence position data? same for sequence itself, sections, etc

- [-] fix `useBlocker` in `FragmentPage`: blocker fires even when no changes have been done. Commented-out now for development purposes.

- [ ] Skip the blocker entirely and commit the edits to local storage temporarily. This could cause issues with server and frontend being out of sync. Detect using hash check. Add conflict resolution page.

- [x] Investigate if orval can be used to generate zod schemas for the frontend as well... needed for fragment editor?

- [x] Saving a discarded fragment that is not in the discarded pool accidentally creates a duplicate fragment?

- [x] Only allow adding notes/references that already exist on the fragment editor

- [x] Allow adding new aspects on the fragment editor page

- [x] Only keep one save button for both metadata and fragment content

- [x] Add simple project selection page

- [x] Create project configuration backend and frontend
