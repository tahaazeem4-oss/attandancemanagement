-- Teacher → Subject mapping
-- Allows admins to assign one or multiple subjects to each teacher.
-- When the timetable cell editor loads, teachers are filtered to those
-- who are assigned to the selected subject.

create table if not exists public.teacher_subject_assignments (
  id             bigint generated always as identity primary key,
  teacher_id     bigint not null references public.teachers(id)  on delete cascade,
  subject_id     bigint not null references public.subjects(id)  on delete cascade,
  school_id      bigint not null references public.schools(id)   on delete cascade,
  assigned_by_role text,
  assigned_by_id   bigint,
  created_at     timestamptz default now(),
  constraint teacher_subject_assignments_unique unique (teacher_id, subject_id)
);

create index if not exists idx_tsa_teacher on public.teacher_subject_assignments(teacher_id);
create index if not exists idx_tsa_school  on public.teacher_subject_assignments(school_id);
create index if not exists idx_tsa_subject on public.teacher_subject_assignments(subject_id);
