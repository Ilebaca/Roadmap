/**
 * THE DATA LAYER — the only place the app talks to a backend.
 *
 * With Supabase keys configured it talks to the database; without them it runs
 * the mock, so the app still works as a demo. Components never know which.
 */
import { isLive, supabase } from './supabaseClient'
import { mockApi } from './mockClient'
import { liveApi } from './liveClient'

export const api = isLive ? liveApi : mockApi
export { isLive, supabase }
