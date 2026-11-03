-- Database tests for the security hardening.
--
-- Run against a local stack:
--   supabase start
--   supabase test db
--
-- Everything runs inside one transaction and is rolled back at the end.
--
-- Note on assertions: pgTAP's two-argument throws_ok(sql, text) treats the
-- second argument as the *expected message*, not as a description. Always pass
-- four arguments (sql, errcode, errmsg, description) to stay unambiguous.

begin;

create extension if not exists pgtap with schema extensions;

select plan(50);

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- The insert trigger derives author_id from the JWT claim, so the claim has to
-- be set before writing notes.
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

-- ── Insert validation (length, content, vocabulary) ────────────────────────
select throws_ok(
  $$ insert into public.notes (body) values ('too short') $$,
  '23514',
  null,
  'short notes are rejected'
);

select throws_ok(
  $$ insert into public.notes (body) values ('you are a total b4stard and I mean it') $$,
  '23514',
  null,
  'banned content is rejected server-side'
);

select throws_ok(
  $$ insert into public.notes (body) values ('what the f u c k is this about then') $$,
  '23514',
  null,
  'letter-spaced evasion is rejected server-side'
);

select throws_ok(
  $$ insert into public.notes (body, tag) values ('a perfectly kind note with a bad tag', 'hax') $$,
  '23514',
  null,
  'tags outside the vocabulary are rejected'
);

-- ── Forged delivery fields are neutralised ─────────────────────────────────
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

-- ── Surface area ───────────────────────────────────────────────────────────
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

-- ── As the recipient ───────────────────────────────────────────────────────
set local role authenticated;
set local "request.jwt.claim.sub" to '22222222-2222-2222-2222-222222222222';

select throws_ok(
  $$ select author_id from public.notes $$,
  '42501',
  null,
  'the recipient cannot read author_id'
);

select throws_ok(
  $$ select * from public.moderation_queue $$,
  '42501',
  null,
  'clients cannot read the moderation queue'
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

-- Keep the id: once reported, the note leaves the journal, so a later lookup
-- through get_my_journal() would return NULL.
create temp table claimed_note as select id from public.get_my_journal();

select throws_ok(
  $$ select public.report_note('33333333-3333-3333-3333-333333333333', 'probe') $$,
  '42501',
  null,
  'reporting an unknown note id fails instead of acting as an existence oracle'
);

select lives_ok(
  $$ select public.report_note((select id from claimed_note), 'unkind') $$,
  'the recipient can report a note they received'
);

select lives_ok(
  $$ select public.report_note((select id from claimed_note), 'again') $$,
  'reporting twice is a no-op, not an error'
);

reset role;

-- ── S-2: the filter matches inflections, compounds and homoglyphs ──────────
-- These all passed the pre-hardening filter untouched; see
-- docs/SECURITY-REDTEAM.md.
select is(public.find_banned_content('you are a fucking idiot'), 'fuck', 'inflected -ing is caught');
select is(public.find_banned_content('he fucked this up'), 'fuck', 'past tense is caught');
select is(public.find_banned_content('what a shitty thing to say'), 'shit', 'adjectival -ty is caught');
select is(public.find_banned_content('that is bullshit'), 'bullshit', 'compound is caught');
select is(public.find_banned_content('you are an asshole'), 'asshole', 'ass-compound is caught');
select is(public.find_banned_content('you retarded piece of work'), 'retard', 'retard + -ed is caught');
select is(public.find_banned_content('the bitches on this app'), 'bitch', 'bitch + -es is caught');
select is(public.find_banned_content('you f*cking idiot'), 'fuck', 'punctuation + inflection is caught');
select is(public.find_banned_content('you fuсk ing idiot'), 'fuck', 'Cyrillic с homoglyph is caught');
select is(public.find_banned_content('you ｆｕｃｋ ing idiot'), 'fuck', 'fullwidth homoglyph is caught');
select is(public.find_banned_content('k' || chr(8203) || 'ys'), 'kys', 'zero-width space does not hide a phrase');

-- …and ordinary English still passes, which is the harder half.
select is(public.find_banned_content('classic kindness, thank you'), null, 'no false positive: classic');
select is(public.find_banned_content('please assess this honestly'), null, 'no false positive: assess');
select is(public.find_banned_content('I will assume the best'), null, 'no false positive: assume');
select is(public.find_banned_content('the assassin spared everyone'), null, 'no false positive: assassin');
select is(public.find_banned_content('damning with faint praise'), null, 'no false positive: damning');

-- ── S-1: one identity cannot receive the whole queue ───────────────────────
-- Eight notes from eight distinct authors: five may be claimed, the sixth must
-- be refused, and three stay in the pool for everyone else.
do $$
declare i int;
begin
  for i in 1..8 loop
    perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
    insert into public.notes (body) values ('A kind note for a stranger, number ' || i || '.');
  end loop;
end $$;

set local role authenticated;
set local "request.jwt.claim.sub" to '44444444-4444-4444-4444-444444444444';

select lives_ok(
  $$ select public.claim_ghost_note() from generate_series(1,5) $$,
  'five claims inside the hourly allowance are fine'
);

select throws_ok(
  $$ select public.claim_ghost_note() $$,
  '53400',
  null,
  'the sixth claim within an hour is refused'
);

reset role;

select is(
  (select count(*) from public.notes where status = 'queued') > 0,
  true,
  'the queue still has notes for other visitors after a cap hit'
);

-- Reclaim: a note delivered but never opened goes back to the pool.
update public.notes
set delivered_at = now() - interval '25 hours'
where recipient_id = '44444444-4444-4444-4444-444444444444';

select ok(
  public.reclaim_stale_notes() > 0,
  'unopened notes older than the grace period are reclaimed'
);

select is(
  (select count(*) from public.notes where recipient_id = '44444444-4444-4444-4444-444444444444'),
  0::bigint,
  'the reclaim clears the recipient so the note is claimable again'
);

select ok(
  not has_function_privilege('authenticated', 'public.reclaim_stale_notes(interval)', 'EXECUTE'),
  'clients cannot call reclaim_stale_notes()'
);

-- ── S-12: grant hygiene and paging ─────────────────────────────────────────
select ok(
  not has_table_privilege('authenticated', 'public.notes', 'UPDATE'),
  'authenticated cannot UPDATE notes'
);

select ok(
  not has_table_privilege('authenticated', 'public.notes', 'DELETE'),
  'authenticated cannot DELETE notes'
);

select is(
  (public.schema_state() -> 'migrations' ->> '20261103101500_claim_cap_and_filter_fold')::boolean,
  true,
  'schema_state reports the queue cap and filter migration'
);

select is(
  (public.schema_state() -> 'migrations' ->> '20261103090000_security_hardening')::boolean,
  true,
  'schema_state reports the hardening migration'
);

-- Three notes for a fresh recipient, then page through them.
do $$
declare i int;
begin
  for i in 1..3 loop
    perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
    insert into public.notes (body) values ('A paged kind note for a stranger, ' || i || '.');
  end loop;
end $$;

set local role authenticated;
set local "request.jwt.claim.sub" to '55555555-5555-5555-5555-555555555555';
select public.claim_ghost_note() from generate_series(1,3);

select is(
  (select count(*)::int from public.get_my_journal(2, 0)),
  2,
  'the journal honours the page limit'
);

select is(
  (select count(*)::int from public.get_my_journal(2, 2)),
  1,
  'the second page returns the remainder'
);

select is(
  (select count(*)::int from public.get_my_journal(500, 0)),
  3,
  'an oversized limit is clamped but still returns everything that exists'
);

reset role;

select * from finish();

rollback;
