// Résout le contact à afficher sur un document PDF (devis, facture, bon de
// commande) : celui de l'utilisateur qui a créé le projet — voir
// projets.created_by_email (projet_createur_migration.sql) et la fiche
// "Mes informations" que chacun peut renseigner (src/pages/Parametres.jsx,
// table profils_utilisateurs — voir profils_utilisateurs_migration.sql).
// Repli sur les coordonnées de la société (ENTREPRISE.contact) si le
// créateur n'a pas encore renseigné sa fiche, ou si le projet n'a pas de
// créateur connu (créé avant la mise en place du suivi et sans trace dans
// l'historique).
import { supabase } from './supabase'
import { ENTREPRISE } from './entreprise'

// Charge tous les profils en une seule requête (table forcément petite —
// une ligne par utilisateur de l'ERP) plutôt qu'une requête par projet :
// évite un aller-retour Supabase par facture lors d'un export groupé
// (voir Exports.jsx, qui peut générer des dizaines de PDF d'un coup).
// Retourne une Map email -> { nom, telephone }.
export async function chargerProfilsParEmail() {
  const { data } = await supabase.from('profils_utilisateurs').select('email, nom, telephone')
  const map = new Map()
  for (const p of data || []) map.set(p.email, p)
  return map
}

// `projet` : l'objet projet (avec created_by_email) tel que renvoyé par
// les requêtes existantes — voir ProjetDetail.jsx et Exports.jsx.
// `profilsParEmail` : la Map renvoyée par chargerProfilsParEmail ci-dessus.
export function contactPourProjet(projet, profilsParEmail) {
  const profil = projet?.created_by_email ? profilsParEmail?.get(projet.created_by_email) : null
  if (profil?.nom) {
    return { nom: profil.nom, tel: profil.telephone || ENTREPRISE.contact.tel, email: projet.created_by_email }
  }
  return { nom: ENTREPRISE.contact.nom, tel: ENTREPRISE.contact.tel, email: ENTREPRISE.contact.email }
}
