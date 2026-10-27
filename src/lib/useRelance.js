import { useState } from 'react'
import { supabase } from './supabase'
import { envoyerEmailOutlook, creerBrouillonOutlook } from './useOutlook'

// Logique partagée du bouton "Relancer" une facture client en retard par
// email — extraite de Dashboard.jsx (section "Relances à faire") pour être
// réutilisée telle quelle depuis la page "Factures clients" et l'onglet
// "Factures cli" d'un projet (voir ProjetDetail.jsx). Une facture `f` doit
// porter `f.projets.nom` et `f.projets.clients.email` (jointure vive, pas
// le client_id figé de la facture — voir le commentaire dans
// FacturesClients.jsx) pour pouvoir être relancée.
//
// Utilisation : const relance = useRelance() puis
// relance.ouvrirRelance(f, clientId) sur le clic "Relancer" (clientId
// optionnel, sert à proposer aussi les contacts secondaires du client comme
// destinataires — voir ci-dessous), et <ModalRelance {...relance} /> (voir
// components/ModalRelance.jsx) quelque part dans le JSX de la page.
export function useRelance() {
  // État d'envoi par facture (id -> 'envoye'), uniquement pour le retour
  // visuel une fois l'envoi confirmé depuis la modale.
  const [envoiRelance, setEnvoiRelance] = useState({})
  // Modale d'aperçu/édition avant envoi — { factureId, to, subject, body,
  // destinatairesDisponibles } ou null si fermée. L'email ne part jamais
  // directement au clic sur "Relancer" : on ouvre toujours cette modale
  // pour valider/corriger le contenu avant l'envoi réel.
  const [modalRelance, setModalRelance] = useState(null)
  const [modalRelanceBusy, setModalRelanceBusy] = useState(false)
  const [modalRelanceError, setModalRelanceError] = useState('')
  // Busy state séparé pour "créer un brouillon dans Outlook", distinct de
  // l'envoi direct ci-dessus.
  const [modalRelanceDraftBusy, setModalRelanceDraftBusy] = useState(false)

  function contenuRelance(f) {
    const joursRetard = f.date_echeance ? Math.floor((new Date() - new Date(f.date_echeance)) / 86400000) : null
    const sujet = 'Relance facture ' + (f.numero || '') + ' — ' + (f.projets?.nom || '')
    const corps = 'Bonjour,\n\nSauf erreur de notre part, la facture ' + (f.numero || '') +
      (f.projets?.nom ? ' (' + f.projets.nom + ')' : '') +
      ' d\'un montant de ' + Number(f.montant_ht || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' € HT' +
      (joursRetard !== null ? ', échue depuis ' + joursRetard + ' jour(s),' : '') +
      ' ne semble pas encore réglée.\n\nPourriez-vous nous indiquer où en est son règlement ?\n\nMerci d\'avance,\nCordialement'
    return { sujet, corps }
  }

  // Ouvre l'aperçu/édition avant envoi — l'email ne part jamais directement
  // au clic sur "Relancer", il faut valider (et éventuellement corriger) le
  // contenu dans la modale qui s'ouvre ensuite. `clientId` (optionnel)
  // permet de proposer aussi les contacts secondaires du client
  // (client_contacts — Facturation, Livraison...) comme destinataires à
  // cocher, même principe que ouvrirEnvoiFactureCli dans ProjetDetail.jsx :
  // avant, seul l'email principal du client était utilisable.
  async function ouvrirRelance(f, clientId) {
    if (!f.projets?.clients?.email) return
    const { sujet, corps } = contenuRelance(f)
    let contacts = []
    if (clientId) {
      const { data } = await supabase.from('client_contacts').select('*').eq('client_id', clientId).is('deleted_at', null).order('created_at')
      contacts = (data || []).filter(c => c.email)
    }
    const destinatairesDisponibles = [
      { email: f.projets.clients.email, label: (f.projets.clients.nom || 'Client') + ' (principal)' },
      ...contacts.map(c => ({ email: c.email, label: c.type + (c.nom ? ' — ' + c.nom : '') })),
    ]
    setModalRelance({ factureId: f.id, to: f.projets.clients.email, subject: sujet, body: corps, destinatairesDisponibles })
    setModalRelanceError('')
  }

  async function envoyerRelanceDepuisModal() {
    if (!modalRelance) return
    setModalRelanceBusy(true)
    setModalRelanceError('')
    try {
      await envoyerEmailOutlook({ to: modalRelance.to, subject: modalRelance.subject, body: modalRelance.body })
      setEnvoiRelance(prev => ({ ...prev, [modalRelance.factureId]: 'envoye' }))
      setModalRelance(null)
    } catch (err) {
      setModalRelanceError(err.message)
    }
    setModalRelanceBusy(false)
  }

  // Alternative à l'envoi automatique : enregistre le message comme
  // brouillon dans la boîte Outlook configurée puis l'ouvre dans un nouvel
  // onglet (Outlook sur le web), pour que la personne le relise et l'envoie
  // elle-même directement depuis Outlook.
  async function creerBrouillonDepuisModal() {
    if (!modalRelance) return
    setModalRelanceDraftBusy(true)
    setModalRelanceError('')
    try {
      const webLink = await creerBrouillonOutlook({ to: modalRelance.to, subject: modalRelance.subject, body: modalRelance.body })
      if (webLink) window.open(webLink, '_blank', 'noopener,noreferrer')
      setModalRelance(null)
    } catch (err) {
      setModalRelanceError(err.message)
    }
    setModalRelanceDraftBusy(false)
  }

  return {
    envoiRelance, ouvrirRelance,
    modalRelance, setModalRelance, modalRelanceBusy, modalRelanceError, modalRelanceDraftBusy,
    envoyerRelanceDepuisModal, creerBrouillonDepuisModal,
  }
}
