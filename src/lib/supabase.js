import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mpxhdkhayoxjzqsagkhp.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1weGhka2hheW94anpxc2Fna2hwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NTg4MjIsImV4cCI6MjA5NzQzNDgyMn0.ohbwRkOCazVHp007ZD01xq2RJn9gSkeEEMtaeMsmX68'

export const supabase = createClient(supabaseUrl, supabaseKey)
