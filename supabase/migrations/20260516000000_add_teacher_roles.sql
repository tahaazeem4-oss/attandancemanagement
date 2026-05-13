-- Add explicit teacher sub-role support.
alter table public.teachers
  add column if not exists teacher_role text;

alter table public.teachers
  drop constraint if exists teachers_teacher_role_check;

alter table public.teachers
  add constraint teachers_teacher_role_check
  check (teacher_role in ('class_teacher', 'floor_incharge', 'subject_teacher'));

-- Backfill based on existing class assignments.
with assignment_counts as (
  select teacher_id, count(*)::int as assignment_count
  from public.teacher_classes
  group by teacher_id
)
update public.teachers t
set teacher_role = case
  when coalesce(ac.assignment_count, 0) = 0 then 'subject_teacher'
  when coalesce(ac.assignment_count, 0) = 1 then 'class_teacher'
  else 'floor_incharge'
end
from assignment_counts ac
where ac.teacher_id = t.id
  and (t.teacher_role is null or t.teacher_role not in ('class_teacher', 'floor_incharge', 'subject_teacher'));

update public.teachers
set teacher_role = 'subject_teacher'
where teacher_role is null;

alter table public.teachers
  alter column teacher_role set default 'subject_teacher';

alter table public.teachers
  alter column teacher_role set not null;
