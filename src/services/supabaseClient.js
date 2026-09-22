import { createClient } from '@supabase/supabase-js'

/**
 * The Supabase connection, or null when the app has not been given one.
 *
 * Put these in `.env.local` at the root of the repo (and in your host's
 * environment settings when you deploy):
 *
 *   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
 *
 * Both come from the Supabase dashboard under Settings -> API. The anon key is
 * meant to be in the browser: the row-level security rules are what keep one
 * client's work away from another, not the key. The service_role key never
 * belongs in this app.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && anonKey ? createClient(url, anonKey) : null

/** True when the app is talking to a real database rather than the mock. */
export const isLive = Boolean(supabase)
