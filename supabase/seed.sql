-- Local development seed data (applied by `supabase db reset`).
--
-- The notes land in the queue as 'queued' with no recipient, exactly like a
-- note written through the UI. The author ids are synthetic: notes.author_id
-- has no foreign key to auth.users, so this works without creating accounts.
insert into public.notes (author_id, body, tag, created_at)
values
  ('00000000-0000-4000-8000-000000000001',
   'You are doing better than you think. Keep going, stranger.',
   'Encouragement', now() - interval '3 hours'),
  ('00000000-0000-4000-8000-000000000002',
   'Thank you for existing. The world is a little brighter because you are in it.',
   'Gratitude', now() - interval '2 hours'),
  ('00000000-0000-4000-8000-000000000003',
   'I am proud of you for getting through today. That counts for something.',
   'Proud of you', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-000000000004',
   'Whatever you are carrying right now, you do not have to carry it perfectly.',
   'Calm', now() - interval '30 minutes');
