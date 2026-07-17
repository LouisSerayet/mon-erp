import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './lib/supabase'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [clients, setClients] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [projets, setProjets] = useState([])
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    const [{ data: c }, { data: f }, { data: p }] = await Promise.all([
      supabase.from('clients').select('*').order('nom'),
      supabase.from('fournisseurs').select('*').order('nom'),
      supabase.from('projets').select('*, clients(nom)').order('created_at', { ascending: false }),
    ])
    setClients(c || [])
    setFournisseurs(f || [])
    setProjets(p || [])
    setReady(true)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return (
    <DataContext.Provider value={{ clients, fournisseurs, projets, refresh, ready }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  return useContext(DataContext)
}
