-- Give every existing (non-draft) brief the four variants: Español/Inglés x Beige/Negro.
--  * Completed briefs -> the four variants are completed (same stages/links/dates as the brief).
--  * In-progress briefs -> each variant starts at the brief's current stage, whatever it is.
--  * Existing delay counts are kept ONCE (on es_beige); the copies on the other three variants have
--    their "late" flags cleared so delays are not counted four times.
-- Run the backup first. To undo, run the rollback block at the bottom.

-- 1) backup
create table if not exists marketing_briefs_backup_variants as select * from marketing_briefs;

-- 2) convert
update marketing_briefs b
set variants = (
      select jsonb_agg(
        jsonb_build_object(
          'key', k.key,
          'applicable', true,
          'naReason', null,
          'currentStage', b.current_stage,
          'status', b.status,
          'stages', case when k.ord = 1 then b.stages else
              (select jsonb_agg(case when (s->'late') is not null then jsonb_set(s, '{late}', 'false') else s end order by o)
               from jsonb_array_elements(b.stages) with ordinality as t(s, o)) end,
          'lauraDelayDays', case when k.ord = 1 then coalesce(b.laura_delay_days, 0) else 0 end,
          'designDelayCount', case when k.ord = 1 then coalesce(b.design_delay_count, 0) else 0 end,
          'extraRevisionRounds', coalesce(b.extra_revision_rounds, 0),
          'completedAt', left(b.completed_at::text, 10)
        ) order by k.ord)
      from (values (1, 'es_beige'), (2, 'es_negro'), (3, 'en_beige'), (4, 'en_negro')) as k(ord, key)
    ),
    design_delay_count = 0,
    laura_delay_days = 0
where b.variants is null
  and b.status in ('completed', 'in_progress');

-- 3) check
select id, reference, status, jsonb_array_length(variants) as variantes from marketing_briefs order by id;

-- ROLLBACK (only if needed):
-- update marketing_briefs b set variants = o.variants, design_delay_count = o.design_delay_count, laura_delay_days = o.laura_delay_days
-- from marketing_briefs_backup_variants o where o.id = b.id;
