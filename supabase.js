import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configurado = Boolean(url && chave)
export const SUPABASE_URL = url
export const SUPABASE_CHAVE = chave
export const supabase = configurado ? createClient(url, chave) : null
