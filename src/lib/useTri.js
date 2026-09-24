import { useState } from 'react'

// Tri générique par clic sur un en-tête de colonne, pour toutes les listes
// de l'ERP (Factures clients/fournisseurs, Commandes, Fournisseurs,
// Clients, Dépenses, Projets...) — voir aussi src/components/ThTri.jsx pour
// l'en-tête cliquable lui-même. 1er clic sur une colonne : tri croissant,
// 2e clic sur la même colonne : décroissant, 3e clic : retour à l'ordre par
// défaut (aucun tri actif, ordre naturel des données).
//
// `defautCle`/`defautSens` fixent le tri actif au chargement de la page
// (ex. { cle: 'date', sens: 'desc' } pour "le plus récent en premier") —
// laisser `defautCle` à null pour démarrer sans tri (ordre déjà pertinent
// de la requête, ex. Historique trié par date de modification).
export function useTri(defautCle = null, defautSens = 'asc') {
  const [tri, setTri] = useState({ cle: defautCle, sens: defautSens })

  function trierPar(nouvelleCle) {
    setTri(prev => {
      if (prev.cle !== nouvelleCle) return { cle: nouvelleCle, sens: 'asc' }
      if (prev.sens === 'asc') return { cle: nouvelleCle, sens: 'desc' }
      return { cle: null, sens: 'asc' }
    })
  }

  return { cle: tri.cle, sens: tri.sens, trierPar }
}

// Applique le tri à un tableau selon la config de colonnes fournie, sans
// modifier `items` (toujours une copie triée, comme .filter()/.map()).
// `colonnes` : { [cle]: item => valeur comparable } — une valeur numérique
// (montant, quantité) ou une chaîne (nom, date au format ISO "AAAA-MM-JJ",
// qui se compare déjà correctement telle quelle). `null`/`undefined`
// remontent toujours en fin de liste, quel que soit le sens, pour ne pas
// faire remonter en premier une facture sans échéance par exemple.
export function appliquerTri(items, cle, sens, colonnes) {
  if (!cle || !colonnes[cle]) return items
  const getValeur = colonnes[cle]
  return [...items].sort((a, b) => {
    const va = getValeur(a)
    const vb = getValeur(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base', numeric: true })
    return sens === 'desc' ? -cmp : cmp
  })
}
