-- Database tests for the security hardening.
--
-- Run with a local Supabase stack:
--   supabase start
--   supabase test db
--
-- Everything runs inside one transaction and is rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

-- Fixtures: two anonymous users. The insert trigger derives author_id from the
-- JWT claim, so the claim has to be set before writing notes.
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

insert into public.notes (body, tag)
values ('You are doing better than you think, stranger.', 'Calm');

select is(
  (select status from public.notes),
  'queued',
  'a new note lands in the queue'
);

select is(
  (select recipient_id from public.notes),
  null,
  'a new note has no recipient'
);

select throws_ok(
  $$ insert into public.notes (body) values ('too short') $$,
  'short notes are rejected'
);

select throws_ok(
  $$ insert into public.notes (body) values ('you are a total b4stard and I mean it') $$,
  'banned content is rejected server-side'
);

select throws_ok(
  $$ insert into public.notes (body, tag) values ('a perfectly kind note with a bad tag', 'hax') $$,
  'tags outside the vocabulary are rejected'
);

-- Forged delivery fields are neutralised by the trigger.
insert into public.notes (author_id, body, status, recipient_id, delivered_at)
values (
  '11111111-1111-1111-1111-111111111111',
  'Injected straight into a victims journal.',
  'delivered',
  '22222222-2222-2222-2222-222222222222',
  now()
);

select is(
  (select status from public.notes where body = 'Injected straight into a victims journal.'),
  'queued',
  'a forged delivered/recipient pair is forced back to queued'
);

select is(
  (select recipient_id from public.notes where body = 'Injected straight into a victims journal.'),
  null,
  'a forged recipient is discarded'
);

-- Reader functions exist and are granted to authenticated only.
select has_function('public', 'get_my_journal', 'journal reader exists');
select has_function('public', 'get_my_stats', 'stats reader exists');

select ok(
  not has_table_privilege('authenticated', 'public.notes', 'SELECT'),
  'authenticated cannot SELECT from notes'
);

select ok(
  not has_table_privilege('authenticated', 'public.reports', 'INSERT'),
  'authenticated cannot INSERT into reports directly'
);

-- Act as the recipient.
set local role authenticated;
set local "request.jwt.claim.sub" to '22222222-2222-2222-2222-222222222222';

select throws_ok(
  $$ select author_id from public.notes $$,
  'the recipient cannot read author_id'
);

select is(
  (select count(*)::int from public.get_my_journal()),
  0,
  'the journal is empty before claiming'
);

select is(
  (select count(*)::int from public.claim_ghost_note()),
  1,
  'claiming returns a note'
);

select is(
  (select count(*)::int from public.get_my_journal()),
  1,
  'the claimed note appears in the journal'
);

select is(
  (select received from public.get_my_stats()),
  1::bigint,
  'stats count the received note'
);

select throws_ok(
  $$ select public.report_note('33333333-3333-3333-3333-333333333333', 'probe') $$,
  'reporting an unknown note id fails instead of acting as an existence oracle'
);

select lives_ok(
  $$ select public.report_note((select id from public.get_my_journal()), 'unkind') $$,
  'the recipient can report a note they received'
);

select lives_ok(
  $$ select public.report_note((select id from public.get_my_journal()), 'again') $$,
  'reporting twice is a no-op, not an error'
);

reset role;

select * from finish();

rollback;
