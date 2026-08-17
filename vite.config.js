import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Sépare les librairies tierces (qui ne changent presque jamais)
        // du code applicatif (qui change à chaque déploiement) — sans ça,
        // le moindre commit invalide le même gros chunk contenant React,
        // react-router-dom et supabase-js, forçant tous les utilisateurs à
        // retélécharger ~130kB gzip de vendor à chaque mise à jour, alors
        // que le navigateur aurait pu le garder en cache.
        // Ce projet build avec rolldown (Vite 8) qui, contrairement à
        // Rollup classique, n'accepte que la forme fonction pour
        // manualChunks (la forme objet plante le build avec "manualChunks
        // is not a function").
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('/react-router-dom/') || id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor'
        },
      },
    },
  },
})
