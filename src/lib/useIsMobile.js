import { useEffect, useState } from 'react'

// Bascule l'interface en mode "consultation mobile" (barre de navigation en
// bas, listes empilées à la place des tableaux larges) en dessous de cette
// largeur — couvre iPhone en portrait comme en paysage.
const BREAKPOINT = 820

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= BREAKPOINT : false
  )

  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth <= BREAKPOINT)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return isMobile
}
