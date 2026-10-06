# Event prompts: scoping proposal

Scoping only; nothing here is built. The goal is a time-boxed, place-boxed
version of a board: a host (a wedding, a work offsite, a birthday party)
wants a short list of prompts that only exist for that one gathering, answered
only by people who were there, with the results collected in one place
afterward.

## Data model sketch

Two new tables, reusing the prompt/completion machinery boards already use
rather than inventing a parallel one.

```
events
  id, host_account_id, name, starts_at, ends_at,
  join_code TEXT UNIQUE,              -- short code/link, no account required to view
  guest_content_visibility TEXT       -- 'host_only' | 'guests' (default 'host_only')
  created_at

event_prompts
  id, event_id, category, prompt_text, created_at
  -- one row per prompt the host queues up; same category enum prompts already use

event_guests
  event_id, account_id NULLABLE,      -- NULL until a guest claims the slot with an account
  guest_name TEXT,                    -- display name for an account-less guest
  joined_at

event_completions
  id, event_prompt_id, guest_id (-> event_guests), media_type, media_data_url,
  caption, created_at
```

`event_completions` deliberately does not reuse `prompt_completions`. Guest
content needs to key off `event_guests` (which may have no `account_id`), and
keeping it a separate table means a guest's throwaway event photos never
leak into their real completion history or completion score if they also
have a Prompt account.

## Fit with existing boards/prompts models

An event is **not** a board: boards are permanent, discoverable, and tied to
a real account's follow/subscriber graph. An event is disposable (it has an
end date, after which it goes read-only), and its membership is a flat guest
list joined by a shared code/link, not a subscription. Reusing `boards` would
mean bolting an expiry date and an anonymous-join path onto a model that
currently assumes every participant is a real, logged-in account, which is
more retrofitting than the two small new tables above cost.

The category enum, media capture flow (photo/video/voice), and caption UI
are the one piece worth sharing as-is: `event_prompts.category` and
`event_completions.media_type` intentionally match the existing `Category`
type and completion shape so the same capture components can be reused
without modification.

## Guest-content privacy defaults

- An event is **host-only by default**: only the host can see submissions as
  they come in. The host can flip `guest_content_visibility` to `'guests'`
  to let everyone at the event see everyone else's answers (opt-in, not
  opt-out, matching the adult-content and Top Fans defaults already set
  elsewhere in this app).
- A guest who joins without a Prompt account never gets one created for
  them; `event_guests.account_id` stays NULL. Their content is scoped to
  that one event and is never attributed to a real account unless they
  explicitly sign up and the host (or they, if self-serve claiming is ever
  added) links the guest row to it.
- Nothing from an event is ever pulled into the public feed, search, or
  Explore. It's reachable only via the event's own join code/link.

## Host results collection

The host's view is a single page per event: every `event_prompt` with its
`event_completions` grouped underneath, guest name and timestamp on each.
Export is a zip of media files plus a CSV (guest name, prompt, caption,
timestamp), the same shape as the admin panel's existing CSV export, so no
new export plumbing is needed, just a new query behind it.

## Recommended smallest first version

1. Host creates an event (name, start/end, 3-5 queued prompts) and gets a
   join link/code.
2. Anyone with the link can join as a guest by name alone, no account
   required, and complete the queued prompts in order, one capture per
   prompt per guest.
3. Host sees a live results page (host-only visibility, no toggle yet) and
   can export it as a CSV plus media zip once the event ends.

Everything else above (guest visibility toggle, letting a guest claim their
submissions with a real account afterward, recurring/template events) is a
deliberate v2-of-this-feature cut, not a v1 requirement.
