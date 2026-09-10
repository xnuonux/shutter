# Shutter — handoff context

**Written 2026-09-10 for a model working on Shutter from outside Dom's Codex machine.**
Codex usage is exhausted until Sep 15; this repo exists so work can continue from ChatGPT.

Read this first, then `docs/current-checkpoint.md`, then `docs/product-blueprint.md`.

---

## What Shutter is

A local production room for original animated stories. Keep a cast and a place, direct
individual shots, preserve exact references, generate local takes, review continuity.
It runs entirely on Dom's machine and binds to localhost only.

It is a working production slice, not a finished cinema platform.

## What actually works right now

Per `docs/current-checkpoint.md` (2026-09-10):

- **Direct, Canvas and Edit** — the studio redesign is implemented and browser-verified.
- **Paid H3 Max integration** and a source-range/coverage timeline.
- **41 tests pass.**
- Production `prod_ba9072b5-21f0-4973-b413-05678795ef46` is at revision 20, seven selected
  takes restored, timeline revision 10, an 868-frame cut.
- Executing adapter is **Wan 2.2 TI2V 5B**. MiniMax H3 Ref2VA is the intended multimodal
  target; its territorial license and this machine's performance are unresolved.

## The next milestone (M1)

Asset-backed source placement, an editable draft before every shot has a selected render,
stable preview, and explicit source/take replacement that preserves trims and coverage.

**No new provider and no paid generation is needed for M1.** Sound controls and scene-state
timing come after. Claude and additional providers are explicitly deferred.

---

## Constraints that are not negotiable

These are Dom's standing rules for this project. A proposal that violates one is wrong even
if it is otherwise good.

- **No paid generation without explicit approval.** Tracked available balance was $4.72154 at
  the last checkpoint. Preparation is separate from generation, and an uncertain submission is
  never automatically repeated.
- **Nothing here authorizes arbitrary shell or editor code from an agent** (product-blueprint §7).
- **Stabilise fundamentals before adding another provider.**
- A successfully decoded video is still only a *candidate* until visually reviewed. A review cut
  is a working selection, not an assertion that continuity was approved.
- No publication, merge, or cleanup milestones were authorised as of this handoff.

---

## What is NOT in this repo, and why it matters

`.gitignore` excludes `data/`, `work/`, `node_modules/`, `*.log`, `.env*`.

**`data/` is 183 MB and holds the SQLite journal plus every original asset and rendered take.**
It is deliberately excluded. Consequences for anyone working from this repo:

- **You cannot run the app and see real content.** `npm start` will open an empty studio.
- You cannot verify a change against the real production, timeline, or takes.
- Any claim about how a shot, take or cut behaves has to be checked on Dom's machine.

So: **reason about source and docs, propose changes, but do not assert runtime behaviour you
could not have observed.** Say what would need to be run locally to confirm.

## Running it (on a machine that has `data/`)

Requires Node.js 24+. No package installation needed.

```powershell
cd C:/dev/shutter
npm start
```

Then open `http://127.0.0.1:4677`.

---

## The conversation

`docs/handoff/source-conversation.md` is the Codex session this project was built in —
173 turns, tool calls and reasoning traces stripped out.

Two things to know about it:

1. **It is redacted.** Every character passed a credential scrubber. A `[REDACTED:...]` marker
   is a real secret that was removed, not a placeholder to fill in. Zero credentials survived
   a re-scan of the exported file.
2. **The session compacted 8 times while it ran.** The earliest exchanges were summarised by
   Codex before this export existed. This is the conversation as the session retained it, not
   as it was originally typed. Treat early history as a summary, not a verbatim record.
