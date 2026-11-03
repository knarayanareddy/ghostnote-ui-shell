# Moderating Kindling

Reports used to be write-only: `reports` had RLS that only let a reporter read
their own rows, and nothing in the codebase could ever read the queue. This
document is the read path.

## Access

`public.moderation_queue` is a view over `reports ⋈ notes`. **All** privileges on
it are revoked from `anon` and `authenticated`, so it is not exposed through the
API. Read it with the **service role** — from the Supabase SQL editor, or with
the service key in a trusted script:

```sql
select *
from public.moderation_queue
order by reported_at desc
limit 50;
```

Columns: `report_id, reported_at, reason, note_id, body, tag, note_status,
note_created_at, author_id`. `author_id` is the only place sender identity is
visible — never expose it outside this flow.

## Triage

1. **Hide the note.** This removes it from the author's "sent" stats and from the
   moderation queue. It does *not* delete the row, so it stays auditable, and
   reports are kept (`ON DELETE CASCADE` would otherwise erase the evidence).

   ```sql
   update public.notes
   set status = 'deleted'
   where id = '<note_id>';
   ```

2. **Ban an abusive author** (blocks further notes through the trigger's
   author check — add the row, the insert trigger fails with a rate-limit style
   error):

   ```sql
   create table if not exists public.blocked_authors (
     author_id uuid primary key,
     blocked_at timestamptz not null default now(),
     reason text
   );

   insert into public.blocked_authors (author_id, reason)
   values ('<author_id>', 'repeated harassment')
   on conflict (author_id) do nothing;
   ```

   Then extend `public.enforce_note_insert` with:

   ```sql
   if exists (select 1 from public.blocked_authors b where b.author_id = NEW.author_id) then
     raise exception 'this account cannot send notes' using errcode = '42501';
   end if;
   ```

   (Not included in the shipped migration: blocking is an operational decision,
   not part of the product schema.)

3. **Check for repeat offenders.** Same author, multiple reports:

   ```sql
   select n.author_id, count(*) as reports
   from public.reports r
   join public.notes n on n.id = r.note_id
   group by n.author_id
   having count(*) > 1
   order by reports desc;
   ```

## Volume expectations

- Reports: 20/day per reporter (enforced in `report_note`).
- Notes: 10/hour per author (enforced in `enforce_note_insert`).

Both constants live in `supabase/migrations/20261103090000_security_hardening.sql`
and are safe to tune with a follow-up migration.
