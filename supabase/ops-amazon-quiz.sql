-- Amazon Performance as a graded quiz: keeps the old rating column and adds the score and the answers.
alter table ops_amazon_performance add column if not exists score_pct numeric;
alter table ops_amazon_performance add column if not exists quiz jsonb;
