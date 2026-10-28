-- To Do tasks: the kind of piece is stored apart from the task's own name.
alter table marketing_todo_tasks add column if not exists category_label text;
