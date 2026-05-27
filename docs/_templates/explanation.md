---
title: <Title in sentence case>
type: explanation
summary: <One sentence. Why this subsystem works the way it does and what it
         covers. Shows up in folder README and `grep '^summary:' docs/**/*.md`,
         so be specific.>
status: draft               # draft | stable | deprecated
owner: "@ivan"
audience: loupe-devs
last-reviewed: YYYY-MM-DD   # today
tags: []
---

# <Title>

<One-paragraph framing: what this subsystem is and what question this doc
answers. A reader should know within 30 seconds whether to keep reading.>

## The shape of the problem

<What the system has to deal with. Constraints, inputs, the messy reality.
Skip if the title already says it.>

## How it works

<The mental model. Diagrams, sequences, key invariants. Cite code paths
(`src/...:LN`) where useful, but the prose is the source of truth — code
moves, this doc explains intent.>

## Trade-offs and non-goals

<What we deliberately *didn't* do, and why. The most-stolen-from section
in 12 months; future-you will thank you.>

## Open questions

<Things we still aren't sure about. Mark as `<TODO: ...>` so they're
greppable.>
