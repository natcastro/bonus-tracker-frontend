-- The kind of piece (category) is stored apart from the name the creator gives To Do tasks and Solicitudes.
alter table marketing_todo_tasks add column if not exists category_label text;
alter table marketing_requests add column if not exists category_label text;
