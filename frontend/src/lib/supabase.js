import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL     = 'https://ojodojygymwvxchzxjsj.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qb2RvanlneW13dnhjaHp4anNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMzY3OTMsImV4cCI6MjA5MjcxMjc5M30.XQT4fofUyLo9jDvyK_gPmOeQ_J3H_fcwXPF-E1fnClE';

// Supabase client — used for direct Storage uploads only.
// All API/DB calls go through Edge Functions via api.js.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Returns the public URL for a file in a given storage bucket.
export function storagePublicUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
