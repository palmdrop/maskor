# Current focus

Study the specified plan, that has just been implemented. There are some issues I need you to fix.

1. In `OverviewPage`, you've used `fragment.content`, however, `content` does not exist on the `IndexedFragment` type. This is by design: this type should just pertain to the database entry for the fragment, which does not contain content. A suggestion is to use a separate query that JUST queries fragment title, UUID, and an excerpt of the content. This could be done after an initial fragment list lookup, that just gives titles and UUIDs, to populate the frontend. Then additional fragment data can be loaded afterwards.

2. Drag and drop works, but when a fragment is dropped, the animation returns it to it's initial position. Then, when the animation is over, the fragments update to reflect the new state. That is, the functionality is there, but the animations are broken.

3. Every time I move a fragment, the sequence is updated using PATCH. The request returns the new, updated sequence. However, we still refetch the sequence again immediately afterwards. This feels unnecessary.

4. The drop area when moving fragments between a sequence and the unused pool is strangely small. Dragging into the sequence, I have to place teh fragment pretty much in the middle, instead of anywhere within the sequence borders.

Before implementing, discuss my findings and suggestions. Push back if you have better ideas.

## Active spec

`@specifications/sequencer.md`

## Active plan(s)

`@references/plans/sequencer-manual-placement.md`

## Key context
