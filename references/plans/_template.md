# Plan title

**Date**: DD-MM-YYYY
**Status**: In progress <!-- Todo | In progress | Done -->
**Specs**: `specifications/<relevant specification>.md` <!-- Add if there is a relevant specification for this plan -->
**Closed**: DD-MM-YYYY <!-- Add when Status becomes Done -->

---

## Goal

> One specific, testable sentence: what does "done" look like?
> Vague goals prevent closure. If the goal shifts significantly, update it — but treat that as a signal to question scope.

---

## Tasks

- [ ] Task A
- [ ] Task B
- [x] Task C _(YYYY-MM-DD)_
- [-] Task D _(dropped — reason)_

<!--
Task states:
  [ ] pending
  [x] done — add completion date
  [-] dropped — add brief reason; do not silently delete

Items can be added, removed, and reshaped as the plan evolves.
Priority is decided at runtime, not encoded here. Rough ordering in the list signals relative importance.

Scope creep warning: new items should serve the goal above. If they don't, they belong in a separate plan.

Group tasks in numbered phases for larger plans and/or where implementation order is vital.

The first phase/task should always be to create a new branch based on the plan title.

The last task of each phase, or of the entire plan, should always be to commit the current batch of work using `git commit`.
-->

---

## Testing

<!--
Outstanding notes regarding testing. Always include the sentence below. Add more information only if necessary.
-->

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

## Notes

<!--
Always include the statements below at the bottom of the plan. Add additional notes if necessary.
-->

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check of the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
