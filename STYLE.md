# Writing style

Applies to everything with words in it: README, site copy, effect descriptions,
option descriptions, changelog, commit messages, error strings, 404s, alt text,
code comments.

`web/docs/voice.md` on oscarbeamish.dev is the source of truth for voice. It was
derived from 23 blog posts and the about page, so it describes how Oscar already
writes rather than inventing a persona. This file adds the layer it does not
cover: not sounding like a language model wrote it.

## Two registers, don't mix them

**Agent-facing**: `recipe.md`, generated prompts, `AGENTS.md`, `CLAUDE.md`.
Optimise for zero ambiguity, not for voice. Short sentences, active voice,
imperative mood, one instruction per sentence, consistent terminology. If it is a
"handle" once, it is a "handle" every time. No personality. An agent misreading a
clever sentence produces broken code.

**Human-facing**: README, site copy, effect names and descriptions, changelog,
launch copy. This is where `voice.md` applies in full.

Never let agent-facing register leak into human-facing copy. That leak is what
makes documentation read as machine-written.

## Punctuation

**No em dashes.** The main site removed them. Use a comma, a colon, a full stop,
or brackets.

This is a house rule, not a universal one. The em dash only reads as an AI
fingerprint when it was not already part of a writer's baseline. Here the
baseline is no dashes, so a dash stands out.

No semicolons in body copy. No ellipses for trailing off. No exclamation marks:
the existing corpus contains zero in body copy. No emoji.

## Structural tells to avoid

**The false-contrast construction.** "It's not just X, it's Y." "This isn't about
X, it's about Y." "Not merely X but Y." This appeared in around 6% of all ChatGPT
conversations in a Washington Post analysis of 328,744 shared chats. It is the
strongest single tell. Never use it. State the thing directly.

**Threes.** Three adjectives, three clauses, three examples, three bullets, every
time. Real writing has ones and twos and fives. Vary it deliberately.

**Even rhythm.** Paragraphs all the same length, sentences all medium, list items
all the same shape. Rule 2 of `voice.md` prescribes the fix: fragments for
emphasis, one at a time, against ordinary sentences.

**Stock openers and closers.** "In today's fast-paced world", "Let's dive in",
"Here's the thing", "The truth is", "At the end of the day", "Ultimately", "The
bottom line", "In conclusion". Also: closing a section by restating it.

**Stock transitions.** "That said", "Moreover", "Furthermore", "Additionally",
"It's worth noting". Start the next sentence instead.

**Questions as headers.** "But what does this mean for you?" A rhetorical
question with an immediate answer is allowed roughly once per piece. That is a
gear change in body copy, not a heading.

**Bolding phrases mid-paragraph** for emphasis. Bold is for labels and headings.

**Hedge stacking.** "can help to", "may potentially", "is designed to". Say what
it does.

**Headers on short content.** Three headings on four hundred words is a machine
imposing structure on something that did not need it.

## Words that don't appear here

delve, leverage, robust, seamless, elevate, unlock, harness, navigate (except
literal navigation), landscape (except literal), realm, tapestry, testament,
crucial, pivotal, comprehensive, myriad, plethora, foster, empower, streamline,
cutting-edge, game-changing, revolutionise, transform, journey, ecosystem
(except literal), dive into, unpack, explore (except literal), boasts, features
(as a verb), designed to, aims to, passionate, innovative.

Industry vocabulary is fine and precise: shader, uniform, context, viewport, DPR,
IAB. The ban is on inflation, not on technical terms.

## What to do instead

- **Open with a short declarative claim**, then earn it. Never warm up.
- **Concrete numbers over adjectives.** Not "fast" but "under 16ms". Not "small"
  but "under 500KB". Not "many" but "twelve". Every abstract claim gets a number
  holding it up. This is the strongest habit in the corpus.
- **Domestic analogies, never technical ones.** Wardrobes and shoeboxes, not
  "like a message queue".
- **Dry understatement, aimed at a situation rather than a person.** Delivered
  flat, in the same register as the sentence before it. No puns, no winking.
- **Say the unflattering thing.** Volunteer the limits of the argument. "This
  will not work in Firefox below 129" is more convincing than any claim.
- **British spelling, plain register.** Code identifiers stay conventional:
  `color` in CSS and WebGL uniforms.

## Where humour goes

**Load-bearing copy stays straight.** The hero, effect descriptions, install
instructions, the README opening. These are the sentences someone quotes to a
colleague. A joke here reads as deflection.

**Peripheral copy is where personality goes.** 404s, empty states, hover
microcopy, section labels, console messages, loading states, alt text. Nobody
arrives for these, so a joke found there reads as care.

## Self-check before committing prose

1. Any em dashes? Replace them.
2. Any "not just X, but Y"? Rewrite.
3. Count the threes. Break at least one.
4. Are all the paragraphs the same length?
5. Is there a number where there is currently an adjective?
6. Read it aloud. Cut anything you would not say to someone at a desk.
7. Would the paragraph survive if the first sentence were deleted? If yes, it was
   a warm-up. Delete it.

## If in doubt

Write less. The defining quality of the corpus is that it refuses to raise its
voice.
