import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { pushFactureClientPennylane, pushFactureFrsPennylane, syncFactureClientStatut, syncFactureFrsStatut, updateFactureClientPennylane, updateFactureFrsPennylane } from '../lib/usePennylane'
import { useIsMobile } from '../lib/useIsMobile'
import { calculerLigne, getNatureLigne, natureLigneVersChamps, ligneCompteDansTotal, natureLigneDepuisTexte, NATURE_LIGNE_OPTIONS, calculerEcheance, fmtEUR as fmt, fmtDateFr as fmtDate } from '../lib/calculs'
import { NAVY, GRAY, fmt as fmtEUR, enTeteDocument, blocMetaEtDestinataire, blocTotaux, blocConditionsEtSignature, blocCoordonneesBancaires, piedDePage, lignesAdresse, TABLE_STYLE, TABLE_HEAD_STYLE, TABLE_FOOT_STYLE, TABLE_ALT_ROW_STYLE } from '../lib/pdfStyle'
import { ajouterPagesCGV } from '../lib/pdfCgv'
import { L, fmtMontant, fmtDate as fmtDatePdf } from '../lib/pdfI18n'
import { getBankAccounts, getTransactionsPourRapprochement } from '../lib/useQonto'
import { rapprocherFactures, appliquerRapprochement } from '../lib/rapprochement'
import { envoyerEmailOutlook, creerBrouillonOutlook } from '../lib/useOutlook'
import { colors, fonts, eyebrow, sectionTitle, quietLink, marker, statutProjetMarker } from '../lib/theme'

const TABS = [
  { id: 'infos', label: 'Infos' },
  { id: 'lignes', label: 'Lignes' },
  { id: 'commandes', label: 'Commandes frs' },
  { id: 'factures_frs', label: 'Factures frs' },
  { id: 'factures_cli', label: 'Factures clients' },
  { id: 'rentabilite', label: 'Rentabilité' },
  { id: 'documents', label: 'Documents' },
]

// 'Brouillon' = devis en cours de préparation, pas encore envoyé au client ;
// 'Perdu' = devis refusé / projet abandonné (statut terminal, hors flux normal).
const STATUTS_PROJET = ['Brouillon', 'Devis envoyé', 'Devis signé', 'En cours', 'Finalisation', 'Clôturé', 'Perdu']
const STATUTS_CMD = ['Brouillon', 'Validée', 'Annulée']
const STATUTS_FFRS = ['À payer', 'Payée']
const STATUTS_FCLI = ['À envoyer', 'Envoyée', 'Payée']
// Couleurs de statut, cohérentes avec les autres pages de l'app — voir
// STATUT_COMMANDE_MARKER (Fournisseurs.jsx) et STATUT_MARKER
// (FacturesClients.jsx / FacturesFournisseurs.jsx / CommandesFournisseurs.jsx)
// pour ces mêmes statuts ailleurs dans l'app.
const STATUT_COMMANDE_MARKER = { 'Brouillon': colors.inkFaint, 'Validée': colors.success, 'Annulée': colors.danger }
const STATUT_FFRS_MARKER = { 'À payer': colors.warning, 'Payée': colors.success }
const STATUT_FCLI_MARKER = { 'À envoyer': colors.inkFaint, 'Envoyée': colors.focus, 'Payée': colors.success }
// Accent utilisé pour les éléments hors statut (marge/coefficient, synchro
// Pennylane, pièces jointes) — distinct de colors.focus déjà réservé à la
// colonne Achat dans les tableaux de lignes, pour garder ces informations
// visuellement séparées.
const ACCENT_MARGE = '#6b5b7a'
// Supabase Storage n'a pas de vrais dossiers : list('projets/<id>') renvoie
// aussi "officiels" comme une entrée (c'est le sous-dossier utilisé par la
// section "Documents officiels" juste au-dessus, voir uploads plus bas)
// et les éventuels fichiers techniques (.emptyFolderPlaceholder...). Cette
// fonction filtre ces entrées fantômes pour ne garder que les vrais
// documents affichés dans "Documents du projet".
const estUnDocumentReel = d => !!d.name && !d.name.startsWith('.') && d.name !== 'officiels'
// Taux de TVA sélectionnables sur un projet (devis + facture client — les
// commandes fournisseurs ont leur propre régime, voir "regime_tva" et
// generateCmdPDF, car un même projet peut mêler fournisseurs classiques et
// sous-traitants BTP en autoliquidation).
const TAUX_TVA_OPTIONS = [20, 10, 5.5, 0]

const inputUnderline = {
  width: '100%', padding: '8px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}
const fieldLabel = { display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }
const btnPrimary = { background: colors.ink, color: colors.surface, border: 'none', padding: '9px 18px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }
const btnGhost = { background: 'none', color: colors.inkMuted, border: '1px solid ' + colors.line, padding: '9px 16px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }
const btnPrimarySmall = { ...btnPrimary, padding: '6px 14px', fontSize: 12 }
// Style des champs d'édition inline dans les tableaux — souligné, teinte
// warning tant que la ligne a des changements non enregistrés (voir
// cellInput dans Depenses.jsx pour le même principe).
const cellInput = isEdited => ({
  padding: '3px 6px', border: 'none', borderBottom: '1px solid ' + (isEdited ? colors.warning : 'transparent'),
  fontSize: 12, background: 'transparent', boxSizing: 'border-box', width: '100%', fontFamily: fonts.display, color: colors.ink,
})

export default function ProjetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  // Un lien depuis le Dashboard (ex: "Factures clients à encaisser") peut
  // demander d'arriver directement sur le bon onglet — et sur la bonne
  // ligne (focusId, voir plus bas) — plutôt que sur "Infos" par défaut, ce
  // qui évitait de devoir rechercher la facture à la main pour la
  // télécharger. `tab` n'est lu qu'à l'ouverture (état initial) : changer
  // d'onglet ensuite ne dépend plus de location.state.
  const [tab, setTab] = useState(location.state?.tab || 'infos')
  // Ligne à mettre en évidence/scroller au chargement (commande, facture
  // frs ou cli) — voir l'useEffect de scroll plus bas et les `id`
  // `row-<id>` posés sur les <tr> correspondants.
  const focusId = location.state?.focusId || null
  const [projet, setProjet] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fournisseurs, setFournisseurs] = useState([])
  const [commandes, setCommandes] = useState([])
  const [facturesFrs, setFacturesFrs] = useState([])
  const [facturesCli, setFacturesCli] = useState([])
  const [lignes, setLignes] = useState([])
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [editInfos, setEditInfos] = useState(false)
  const [formInfos, setFormInfos] = useState({})
  const [infosError, setInfosError] = useState('')
  const [formCmd, setFormCmd] = useState({ fournisseur_id: '', numero: '', description: '', montant_ht: '', statut: 'Brouillon', date_commande: '', regime_tva: 'normale' })
  const [formFfrs, setFormFfrs] = useState({ fournisseur_id: '', commande_id: '', numero: '', montant_ht: '', statut: 'À payer', date_facture: '', date_echeance: '' })
  // type_facture / paiement_comptant : voir sql/facture_cli_type_migration.sql
  // — choisis une seule fois à la création, non modifiables ensuite (comme
  // le numéro). paiement_comptant n'a de sens que pour une facture d'acompte.
  const [formFcli, setFormFcli] = useState({ numero: '', montant_ht: '', statut: 'À envoyer', date_facture: '', date_echeance: '', type_facture: 'avancement', paiement_comptant: false })
  // Saisie auxiliaire "% du devis" pour la nouvelle facture client — ne va
  // pas en base (seul montant_ht est stocké), sert juste à calculer le
  // montant HT à partir d'un pourcentage d'avancement (situation de travaux).
  const [formFcliPct, setFormFcliPct] = useState('')
  const [fileFfrs, setFileFfrs] = useState(null) // PDF sélectionné pour la nouvelle facture fournisseur
  const [pennylaneBusy, setPennylaneBusy] = useState(null) // id de la facture en cours de synchro
  const [pennylaneError, setPennylaneError] = useState('')
  const [rapprochementBusy, setRapprochementBusy] = useState(null) // 'cli' | 'frs' | 'confirm:<id>' en cours
  const [rapprochementError, setRapprochementError] = useState('')
  const [suggestionsQontoCli, setSuggestionsQontoCli] = useState([])
  const [suggestionsQontoFrs, setSuggestionsQontoFrs] = useState([])
  const [facCliEditees, setFacCliEditees] = useState({}) // édition inline factures clients
  const [facFrsEditees, setFacFrsEditees] = useState({}) // édition inline factures fournisseurs
  const [lignesEditees, setLignesEditees] = useState({}) // { [id]: {champ: valeur} }
  const [savingLignes, setSavingLignes] = useState(false)
  const [dupliquerBusy, setDupliquerBusy] = useState(false) // duplication du projet (devis + lignes) en cours
  // Fenêtre de confirmation "maison" plutôt que window.confirm() : sur
  // Safari, si l'utilisateur a un jour coché « Empêcher cette page de
  // créer d'autres boîtes de dialogue » (proposé par Safari après une
  // confirm()/alert() quelconque), TOUTES les confirm()/alert() suivantes
  // de la page sont bloquées silencieusement — clic sur "Dupliquer" sans
  // le moindre message ni erreur. Une modale intégrée à l'ERP ne dépend
  // plus de cette fonctionnalité navigateur.
  const [confirmDupliquerOuvert, setConfirmDupliquerOuvert] = useState(false)
  // Sélection multiple de lignes de devis (onglet Lignes) pour suppression
  // groupée — voir supprimerLignesSelectionnees. Une modale "maison" est
  // utilisée pour la confirmation, comme pour la duplication de projet
  // ci-dessus (même raison : éviter tout window.confirm()).
  const [lignesSelectionnees, setLignesSelectionnees] = useState(() => new Set())
  const [confirmSuppressionLignesOuvert, setConfirmSuppressionLignesOuvert] = useState(false)
  const [suppressionLignesBusy, setSuppressionLignesBusy] = useState(false)
  const [lotsReduits, setLotsReduits] = useState({}) // { [lotNumero]: true/false }
  const [showAddLigne, setShowAddLigne] = useState(false)
  const [ligneError, setLigneError] = useState('')
  const [showAddLot, setShowAddLot] = useState(false)
  const [formLot, setFormLot] = useState({ numero: '', categorie: '', descriptif: '' })
  const [savingLot, setSavingLot] = useState(false)
  const [lotError, setLotError] = useState('')
  // Édition d'un lot existant (N°, catégorie, descriptif) — voir
  // ouvrirEditionLot/enregistrerEditionLot. `lotEnEdition` retient le
  // numéro du lot en cours d'édition (avant renommage éventuel), ou null.
  const [lotEnEdition, setLotEnEdition] = useState(null)
  const [formLotEdit, setFormLotEdit] = useState({ numero: '', categorie: '', descriptif: '' })
  const [savingLotEdit, setSavingLotEdit] = useState(false)
  const [lotEditError, setLotEditError] = useState('')
  const [showValidation, setShowValidation] = useState(false) // modale de validation étape
  const [validationDoc, setValidationDoc] = useState(null) // fichier uploadé
  const [validationDate, setValidationDate] = useState('') // date de début
  const [validationError, setValidationError] = useState('')
  const [validating, setValidating] = useState(false)
  // prix_vente_ht : saisi uniquement pour la nature "Honoraire" (vente
  // seule, sans achat) — voir le formulaire "Nouvelle ligne" et
  // ajouterLigne, qui l'utilise à la place de prix_achat_ht × coeff.
  const [formLigne, setFormLigne] = useState({ lot: '', descriptif: '', unite: '', qte: '', prix_achat_ht: '', coeff: '1.30', prix_vente_ht: '', type: 'ligne', nature: 'negoce' })
  const [savingLigne, setSavingLigne] = useState(false)
  const [modeLignes, setModeLignes] = useState({}) // { [ligneId]: 'ac' | 'vc' | 'av' }
  // Garde-fous anti double-clic : sans ça, un clic rapide en double (ou un
  // double-tap mobile) pendant l'aller-retour réseau peut créer deux
  // commandes/factures pour une seule saisie — pour une facture client,
  // ça consomme même deux numéros de facture réels (next_facture_numero)
  // pour une seule facture voulue, ce qui n'est pas anodin (numérotation
  // légale, pas de "renumérotation" propre possible après coup).
  const [savingCmd, setSavingCmd] = useState(false)
  const [savingFactureFrs, setSavingFactureFrs] = useState(false)
  const [savingFactureCli, setSavingFactureCli] = useState(false)

  // Échéance de facture auto-calculée depuis les conditions de paiement du
  // tiers (voir calculerEcheance dans lib/calculs.js) — true = le champ
  // "Date échéance" du formulaire de création suit automatiquement la date
  // de facture / le tiers sélectionné ; false = déverrouillé après
  // confirmation explicite de l'utilisateur pour une saisie manuelle (voir
  // le bouton 🔓 à côté du champ). Même principe pour les factures déjà
  // créées : `echeanceXxxDeverrouillees` liste les factures dont l'échéance
  // a été modifiée à la main dans cette session (une confirmation est
  // redemandée pour chaque nouvelle facture, comme pour cmdDeverrouillees).
  const [echeanceFfrsVerrouillee, setEcheanceFfrsVerrouillee] = useState(true)
  const [echeanceFcliVerrouillee, setEcheanceFcliVerrouillee] = useState(true)
  const [echeanceFrsDeverrouillees, setEcheanceFrsDeverrouillees] = useState(new Set())
  const [echeanceCliDeverrouillees, setEcheanceCliDeverrouillees] = useState(new Set())

  // Nature effective d'une ligne (negoce/option/variante_active/
  // variante_inactive/texte), en tenant compte d'une édition non encore
  // enregistrée — même principe que getLigneVal pour qte/prix, pour que le
  // sélecteur "Nature" et l'export PDF restent cohérents avec ce qui est
  // affiché à l'écran sans obliger à sauvegarder d'abord.
  function getNatureEff(l) {
    const cat = getLigneVal(l, 'categorie_ligne') || 'negoce'
    const activeRaw = getLigneVal(l, 'variante_active')
    const active = activeRaw === '' ? true : activeRaw
    return getNatureLigne(cat, active)
  }

  function editLigneNature(ligneId, nature) {
    const champs = natureLigneVersChamps(nature)
    setLignesEditees(prev => {
      const enCours = { ...(prev[ligneId] || {}), ...champs }
      if (nature === 'honoraire') {
        // Bascule vers "Honoraire" (vente seule) : force achat et coeff à
        // vide/zéro et recalcule le total à partir du prix de vente actuel
        // — même logique que calculerLigne (mode 'honoraire'), pour qu'un
        // achat déjà saisi avant la bascule ne reste pas compté.
        const ligne = lignes.find(l => l.id === ligneId)
        const qte = parseFloat(enCours.qte ?? ligne?.qte) || 0
        const puVente = parseFloat(enCours.prix_unit_ht ?? ligne?.prix_unit_ht) || 0
        enCours.prix_achat_ht = '0'
        enCours.coeff = ''
        enCours.total_ht = qte * puVente
        enCours.total_achat = 0
      }
      return { ...prev, [ligneId]: enCours }
    })
  }
  function generateDevisPDF(lang = 'fr') {
    const t = L[lang]
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    // Valeurs "effectives" (édition en cours non enregistrée comprise, via
    // getLigneVal — même logique que ce qui s'affiche à l'écran) plutôt que
    // les valeurs brutes de `lignes` (dernier état enregistré en base) : sans
    // ça, éditer une ligne puis exporter le devis SANS avoir cliqué sur
    // "Enregistrer les modifications" produisait un devis à 0 € — le PDF
    // lisait les totaux stockés en base, pas ce qui est réellement affiché
    // à l'écran au moment de l'export.
    const lignesEff = lignes.map(l => {
      if (l.type !== 'ligne') return l
      const qte = parseFloat(getLigneVal(l, 'qte')) || 0
      const prixUnit = parseFloat(getLigneVal(l, 'prix_unit_ht')) || 0
      const prixAchat = parseFloat(getLigneVal(l, 'prix_achat_ht')) || 0
      // Nature (négoce/option/variante/texte) elle aussi lue via getLigneVal,
      // pour qu'un changement de nature pas encore sauvegardé soit déjà pris
      // en compte à l'export — même logique que pour qte/prix ci-dessus.
      const categorieLigne = getLigneVal(l, 'categorie_ligne') || 'negoce'
      const varianteActiveRaw = getLigneVal(l, 'variante_active')
      const varianteActive = varianteActiveRaw === '' ? true : varianteActiveRaw
      return { ...l, qte, prix_unit_ht: prixUnit, prix_achat_ht: prixAchat, total_ht: qte * prixUnit, total_achat: qte * prixAchat, categorie_ligne: categorieLigne, variante_active: varianteActive }
    })
    const lotsData = lignesEff.filter(l => l.type === 'lot').map(lot => {
      // Options / variantes non retenues / texte n'entrent jamais dans le
      // total du lot ni n'apparaissent dans son détail — voir plus bas la
      // section "Options" séparée et ligneCompteDansTotal (lib/calculs.js).
      const enfants = lignesEff.filter(l => l.type === 'ligne' && l.lot === lot.numero && ligneCompteDansTotal(l))
      return {
        ...lot,
        total_ht: enfants.reduce((s, l) => s + (l.total_ht || 0), 0),
        total_achat: enfants.reduce((s, l) => s + (l.total_achat || 0), 0),
      }
    })
    const lignesParLot = lignesEff.reduce((acc, l) => {
      if (l.type !== 'lot') { const lot = l.lot || 'sans'; if (!acc[lot]) acc[lot] = []; acc[lot].push(l) }
      return acc
    }, {})
    // Lignes/titres créés sans être rattachés à un lot — un devis simple
    // (pas de découpage en lots) n'a QUE des lignes comme ça. Il faut les
    // compter dans le total ET les faire apparaître dans le détail, sinon un
    // devis sans lot ressort systématiquement à 0 € avec un PDF vide.
    const lignesSansLot = lignesEff.filter(l => (l.type === 'ligne' || l.type === 'titre') && !l.lot)
    // Options proposées (toutes, tous lots confondus) : hors total principal,
    // regroupées dans leur propre section en fin de devis avec un sous-total
    // à part — voir plus bas "PAGE OPTIONS".
    const lignesOptions = lignesEff.filter(l => l.type === 'ligne' && l.categorie_ligne === 'option')
    const totalOptions = lignesOptions.reduce((s, l) => s + (l.total_ht || 0), 0)
    // Formatage sans séparateur de milliers problématique — voir fmtMontant
    // (lib/pdfI18n.js) pour la raison (caractère parasite affiché par jsPDF).
    const fmtN = n => (n > 0 ? fmtMontant(n, lang) + ' EUR' : '—')
    const totalHT = lotsData.reduce((s, l) => s + (l.total_ht || 0), 0)
      + lignesSansLot.filter(l => l.type === 'ligne' && ligneCompteDansTotal(l)).reduce((s, l) => s + (l.total_ht || 0), 0)
    // Taux de TVA du projet (réglage "TVA" dans l'onglet Infos) — 20 % par
    // défaut, mais peut être ramené à 10 / 5,5 / 0 % (client exonéré, taux
    // réduit...). Ne concerne que devis + facture client, pas les commandes
    // fournisseurs (leur TVA dépend du fournisseur, pas du client).
    const tauxTva = Number(projet.taux_tva ?? 20)
    const totalTVA = totalHT * (tauxTva / 100)
    const totalTTC = totalHT + totalTVA
    const numero = 'DEV-' + projet.nom.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10).toUpperCase() + '-' + new Date().getFullYear()

    // ── PAGE 1 : PRÉSENTATION ─────────────────────────────────
    let y = enTeteDocument(doc, { titre: t.titreDevis, lang })
    y = blocMetaEtDestinataire(doc, y, {
      metaGauche: [
        [t.numeroDevis, numero],
        [t.date, fmtDatePdf(new Date(), lang)],
        [t.validite, t.jours30],
      ],
      destinataire: { titre: t.client, lignes: [projet.clients?.nom, ...lignesAdresse(projet.clients, lang)] },
    })

    // Nom du projet — retour à la ligne automatique si le nom est long,
    // sinon il continuait hors de la page (texte coupé sur le bord droit)
    // au lieu de passer à la ligne.
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
    const nomLignes = doc.splitTextToSize(projet.nom, 182)
    doc.text(nomLignes, 14, y); y += nomLignes.length * 5.5 + 0.5
    if (projet.adresse_chantier) {
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY)
      const adresseLignes = doc.splitTextToSize(projet.adresse_chantier, 182)
      doc.text(adresseLignes, 14, y); y += adresseLignes.length * 4.5 + 1.5
    }
    y += 2

    // Infos projet
    if (projet.date_debut || projet.date_fin_prevue) {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...NAVY)
      if (projet.date_debut) doc.text(t.debutTravaux + fmtDatePdf(projet.date_debut, lang), 14, y)
      if (projet.date_fin_prevue) doc.text(t.finPrevue + fmtDatePdf(projet.date_fin_prevue, lang), 111, y)
      y += 6
    }
    if (projet.surface) {
      doc.setFontSize(8)
      doc.text(t.surface + projet.surface + ' m²', 14, y)
      y += 6
    }
    if (projet.acces_livraison) {
      doc.setFontSize(8)
      doc.text(t.accesLivraison + projet.acces_livraison, 14, y)
      y += 6
    }
    if (projet.notes) {
      // Hauteur du cadre calculée sur le nombre réel de lignes après
      // retour à la ligne automatique — avant, le cadre avait une hauteur
      // fixe (20mm, ~2 lignes) : une note un peu longue (3 lignes ou plus)
      // débordait hors du cadre jaune et venait chevaucher le texte suivant
      // (synthèse des lots / nom du projet suivant selon les cas).
      doc.setFontSize(8); doc.setFont('helvetica', 'italic')
      const notesLines = doc.splitTextToSize(projet.notes, 174)
      const notesBoxH = Math.max(20, notesLines.length * 4 + 10)
      doc.setFillColor(255, 251, 235)
      doc.roundedRect(14, y, 182, notesBoxH, 2, 2, 'F')
      doc.setTextColor(120, 80, 0)
      doc.text(notesLines, 18, y + 7)
      y += notesBoxH + 6
    }
    y += 4

    // ── SYNTHÈSE DES LOTS (page dédiée, juste après la page 1) ────────
    // Récap "un lot = une ligne = un prix" avant le détail page par page
    // qui suit — pour que le client voie d'un coup d'œil la répartition du
    // prix par lot sans avoir à feuilleter tout le devis. Ne liste que les
    // lots qui ont effectivement une page détail plus bas (même filtre que
    // lignesReellesLot dans la boucle "PAGES DÉTAIL PAR LOT" ci-dessous) —
    // un lot vide ou uniquement composé d'Options n'apparaît pas ici non
    // plus. Tableau sobre (mêmes styles que les tableaux détaillés plus
    // bas) — pas de couleurs par lot ni de pourcentage, juste le nom du lot
    // et son prix.
    const lotsAvecDetail = lotsData.filter(lot => {
      const lg = lignesParLot[lot.numero] || []
      return lg.some(l => l.type === 'ligne' && l.categorie_ligne !== 'option' && !(l.categorie_ligne === 'variante' && l.variante_active === false))
    })
    const totalSansLotSynthese = lignesSansLot.filter(l => l.type === 'ligne' && ligneCompteDansTotal(l)).reduce((s, l) => s + (l.total_ht || 0), 0)
    if (lotsAvecDetail.length || totalSansLotSynthese > 0) {
      doc.addPage()
      y = 26

      // Bandeau de titre, même traitement visuel que les bandeaux des pages
      // de détail par lot plus bas (fond marine, titre blanc) — cohérent
      // avec le reste du document. Marge verticale généreuse entre le
      // titre et la note en dessous pour ne jamais laisser les deux se
      // toucher, même sur un petit écran/export basse résolution.
      doc.setFillColor(...NAVY); doc.rect(0, 0, 210, 18, 'F')
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
      doc.text(t.syntheseLots, 14, 10.5)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
      doc.text(t.syntheseLotsNote, 14, 15.5)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
      doc.text(fmtN(totalHT), 196, 11, { align: 'right' })
      doc.setTextColor(...NAVY)

      const bodySynthese = lotsAvecDetail.map(lot => ([
        t.lot(lot.numero),
        lot.categorie || '',
        lot.total_ht > 0 ? fmtMontant(lot.total_ht, lang) : '',
      ]))
      if (totalSansLotSynthese > 0) bodySynthese.push([t.horsLot, '', fmtMontant(totalSansLotSynthese, lang)])

      autoTable(doc, {
        startY: y,
        head: [[t.colNumero, t.colCategorie, t.colTotalHtEur]],
        body: bodySynthese,
        foot: [['', t.totalHtFoot, totalHT > 0 ? fmtMontant(totalHT, lang) : '']],
        styles: { ...TABLE_STYLE, fontSize: 9, cellPadding: 3 },
        headStyles: TABLE_HEAD_STYLE,
        footStyles: TABLE_FOOT_STYLE,
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
        },
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: { left: 14, right: 14 },
      })
      y = doc.lastAutoTable.finalY + 10
    }

    if (y > 220) { doc.addPage(); y = 20 }
    y = blocTotaux(doc, y, { totalHt: totalHT, totalTva: totalTVA, totalTtc: totalTTC, tauxTva, lang })
    if (y > 250) { doc.addPage(); y = 20 }
    blocConditionsEtSignature(doc, y, { bullets: t.bulletsDevisDetaille(tauxTva), lang })

    // ── PAGES DÉTAIL PAR LOT ─────────────────────────────────
    for (const lot of lotsData) {
      const lgLot = lignesParLot[lot.numero] || []
      // Un lot qui ne contient (encore) que des Options — ou des variantes
      // non retenues — n'a rien à montrer sur sa propre page : ses Options
      // apparaissent quand même, mais regroupées dans la section "Options
      // proposées" plus bas (avec le repère du lot d'origine).
      const lignesReellesLot = lgLot.filter(l => l.type === 'ligne' && l.categorie_ligne !== 'option' && !(l.categorie_ligne === 'variante' && l.variante_active === false))
      if (!lignesReellesLot.length) continue
      doc.addPage()

      // Header lot
      doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 16, 'F')
      doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
      doc.text(t.lot(lot.numero) + ' — ' + (lot.categorie || ''), 14, 10)
      if (lot.descriptif) { doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text(lot.descriptif, 14, 15) }
      doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      doc.text(fmtN(lot.total_ht), 196, 10, { align: 'right' })
      doc.setTextColor(30, 41, 59)

      const body = []
      for (let li = 0; li < lgLot.length; li++) {
        const l = lgLot[li]
        // Une Option n'apparaît pas ici — elle est listée à part dans la
        // section "Options" en fin de devis, avec son propre sous-total.
        // Une Variante non retenue n'apparaît pas non plus sur le devis
        // envoyé au client (seule l'alternative choisie compte).
        if (l.type === 'ligne' && (l.categorie_ligne === 'option' || (l.categorie_ligne === 'variante' && l.variante_active === false))) continue
        if (l.type === 'titre' || (l.type === 'ligne' && l.categorie_ligne === 'texte')) {
          // On n'ajoute le titre/texte que s'il y a au moins une ligne avec montant après lui
          const hasLignesAvecMontant = lgLot.slice(li + 1).some(
            ll => ll.type !== 'titre' && ll.categorie_ligne !== 'texte' && ll.categorie_ligne !== 'option'
              && !(ll.categorie_ligne === 'variante' && ll.variante_active === false) && (ll.total_ht > 0 || ll.prix_unit_ht > 0)
          )
          if (hasLignesAvecMontant || l.categorie_ligne === 'texte') {
            body.push([{ content: (l.descriptif || '').toUpperCase(), colSpan: 6,
              styles: { fontStyle: l.type === 'titre' ? 'bold' : 'italic', fillColor: [241, 245, 249], textColor: [71, 85, 105], fontSize: 7 } }])
          }
        } else {
          // Ignorer les lignes sans montant ni prix
          if (!l.total_ht && !l.prix_unit_ht && !l.qte) continue
          body.push([
            l.numero || '',
            l.descriptif || '',
            l.unite || '',
            l.qte > 0 ? String(l.qte) : '',
            l.prix_unit_ht > 0 ? fmtMontant(l.prix_unit_ht, lang) : '',
            l.total_ht > 0 ? fmtMontant(l.total_ht, lang) : '',
          ])
        }
      }

      autoTable(doc, {
        startY: 20,
        head: [[t.colNumero, t.colDesignation, t.colUnite, t.colQte, t.colPuHtEur, t.colTotalHtEur]],
        body,
        foot: [['', '', '', '', t.totalLot(lot.numero), lot.total_ht > 0 ? fmtMontant(lot.total_ht, lang) : '']],
        styles: { ...TABLE_STYLE, fontSize: 7.5, cellPadding: 2 },
        headStyles: TABLE_HEAD_STYLE,
        footStyles: TABLE_FOOT_STYLE,
        columnStyles: {
          0: { cellWidth: 14 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 14, halign: 'center' },
          3: { cellWidth: 12, halign: 'right' },
          4: { cellWidth: 28, halign: 'right' },
          5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
        },
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: { left: 14, right: 14 },
      })
    }

    // ── PAGE DÉTAIL : LIGNES SANS LOT ─────────────────────────
    if (lignesSansLot.length) {
      const totalSansLot = lignesSansLot.filter(l => l.type === 'ligne' && ligneCompteDansTotal(l)).reduce((s, l) => s + (l.total_ht || 0), 0)
      doc.addPage()
      doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 16, 'F')
      doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
      doc.text(t.lignesSansLot, 14, 10)
      doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      doc.text(fmtN(totalSansLot), 196, 10, { align: 'right' })
      doc.setTextColor(30, 41, 59)

      const body = []
      for (let li = 0; li < lignesSansLot.length; li++) {
        const l = lignesSansLot[li]
        // Voir la même logique dans les pages détail par lot ci-dessus :
        // Options et Variantes non retenues n'apparaissent pas sur le devis.
        if (l.type === 'ligne' && (l.categorie_ligne === 'option' || (l.categorie_ligne === 'variante' && l.variante_active === false))) continue
        if (l.type === 'titre' || (l.type === 'ligne' && l.categorie_ligne === 'texte')) {
          const hasLignesAvecMontant = lignesSansLot.slice(li + 1).some(
            ll => ll.type !== 'titre' && ll.categorie_ligne !== 'texte' && ll.categorie_ligne !== 'option'
              && !(ll.categorie_ligne === 'variante' && ll.variante_active === false) && (ll.total_ht > 0 || ll.prix_unit_ht > 0)
          )
          if (hasLignesAvecMontant || l.categorie_ligne === 'texte') {
            body.push([{ content: (l.descriptif || '').toUpperCase(), colSpan: 6,
              styles: { fontStyle: l.type === 'titre' ? 'bold' : 'italic', fillColor: [241, 245, 249], textColor: [71, 85, 105], fontSize: 7 } }])
          }
        } else {
          if (!l.total_ht && !l.prix_unit_ht && !l.qte) continue
          body.push([
            l.numero || '',
            l.descriptif || '',
            l.unite || '',
            l.qte > 0 ? String(l.qte) : '',
            l.prix_unit_ht > 0 ? fmtMontant(l.prix_unit_ht, lang) : '',
            l.total_ht > 0 ? fmtMontant(l.total_ht, lang) : '',
          ])
        }
      }

      autoTable(doc, {
        startY: 20,
        head: [[t.colNumero, t.colDesignation, t.colUnite, t.colQte, t.colPuHtEur, t.colTotalHtEur]],
        body,
        foot: [['', '', '', '', t.totalHt.toUpperCase(), totalSansLot > 0 ? fmtMontant(totalSansLot, lang) : '']],
        styles: { ...TABLE_STYLE, fontSize: 7.5, cellPadding: 2 },
        headStyles: TABLE_HEAD_STYLE,
        footStyles: TABLE_FOOT_STYLE,
        columnStyles: {
          0: { cellWidth: 14 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 14, halign: 'center' },
          3: { cellWidth: 12, halign: 'right' },
          4: { cellWidth: 28, halign: 'right' },
          5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
        },
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: { left: 14, right: 14 },
      })
    }

    // ── PAGE OPTIONS ───────────────────────────────────────────
    // Regroupe TOUTES les lignes marquées "Option" (tous lots confondus) :
    // proposées au client mais volontairement hors du TOTAL HT ci-dessus —
    // voir lignesOptions/totalOptions plus haut et ligneCompteDansTotal
    // (lib/calculs.js) pour la règle de calcul.
    if (lignesOptions.length) {
      doc.addPage()
      doc.setFillColor(217, 119, 6); doc.rect(0, 0, 210, 16, 'F')
      doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
      doc.text(t.optionsProposees, 14, 10)
      doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      doc.text(fmtN(totalOptions), 196, 10, { align: 'right' })
      doc.setFontSize(7); doc.setFont('helvetica', 'normal')
      doc.text(t.optionsNote, 14, 15)
      doc.setTextColor(30, 41, 59)

      // Regroupées par lot d'origine (un sous-en-tête "LOT X — Catégorie"
      // par groupe, même si ce lot n'a pas sa propre page détail ci-dessus)
      // pour rester compréhensible — sinon une longue liste d'options sans
      // repère ne dit plus à quoi elles se rattachent.
      const ligneOptionVersRow = l => ([
        l.numero || '',
        l.descriptif || '',
        l.unite || '',
        l.qte > 0 ? String(l.qte) : '',
        l.prix_unit_ht > 0 ? fmtMontant(l.prix_unit_ht, lang) : '',
        l.total_ht > 0 ? fmtMontant(l.total_ht, lang) : '',
      ])
      const enteteGroupe = libelle => ([{ content: libelle.toUpperCase(), colSpan: 6,
        styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 80, 0], fontSize: 7 } }])

      const bodyOptions = []
      for (const lot of lotsData) {
        const optsDuLot = lignesOptions.filter(l => l.lot === lot.numero && (l.total_ht > 0 || l.prix_unit_ht > 0 || l.qte > 0))
        if (!optsDuLot.length) continue
        bodyOptions.push(enteteGroupe(t.lot(lot.numero) + ' — ' + (lot.categorie || '')))
        for (const l of optsDuLot) bodyOptions.push(ligneOptionVersRow(l))
      }
      const optsSansLot = lignesOptions.filter(l => !l.lot && (l.total_ht > 0 || l.prix_unit_ht > 0 || l.qte > 0))
      if (optsSansLot.length) {
        bodyOptions.push(enteteGroupe(t.lignesSansLot))
        for (const l of optsSansLot) bodyOptions.push(ligneOptionVersRow(l))
      }

      autoTable(doc, {
        startY: 20,
        head: [[t.colNumero, t.colDesignation, t.colUnite, t.colQte, t.colPuHtEur, t.colTotalHtEur]],
        body: bodyOptions,
        foot: [['', '', '', '', t.totalOptions, totalOptions > 0 ? fmtMontant(totalOptions, lang) : '']],
        styles: { ...TABLE_STYLE, fontSize: 7.5, cellPadding: 2 },
        headStyles: { ...TABLE_HEAD_STYLE, fillColor: [217, 119, 6] },
        footStyles: { ...TABLE_FOOT_STYLE, fillColor: [254, 243, 199], textColor: [120, 80, 0] },
        columnStyles: {
          0: { cellWidth: 14 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 14, halign: 'center' },
          3: { cellWidth: 12, halign: 'right' },
          4: { cellWidth: 28, halign: 'right' },
          5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
        },
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: { left: 14, right: 14 },
      })
    }

    // ── CONDITIONS GÉNÉRALES DE VENTE (annexe) ────────────────
    ajouterPagesCGV(doc, lang)
    piedDePage(doc, projet.nom, lang)
    doc.save(projet.nom.replace(/[^a-z0-9]/gi, '_') + t.devisSuffix)
  }

    const [modeCalc, setModeCalc] = useState('achat_coeff') // 'achat_coeff' | 'vente_coeff' | 'achat_vente'
  const [cmdEditees, setCmdEditees] = useState({}) // édition inline commandes
  // Ids de commandes "Validée" dont on a déjà confirmé la remodification (le
  // temps de la session) — une commande Validée est normalement figée, la
  // reprendre doit être une action volontaire et confirmée. Voir editCmd().
  const [cmdDeverrouillees, setCmdDeverrouillees] = useState(new Set())
  const [showPdfPreview, setShowPdfPreview] = useState(null) // commande en preview PDF
  // Modale d'aperçu/édition avant envoi d'un email (facture client ou
  // commande fournisseur), PDF joint automatiquement — voir
  // ouvrirEnvoiFactureCli / ouvrirEnvoiCommande / envoyerEmailDepuisModal.
  // Même principe que la modale de relance du Dashboard : l'email ne part
  // jamais directement au clic sur "Envoyer".
  const [envoiEmailModal, setEnvoiEmailModal] = useState(null)
  const [envoiEmailBusy, setEnvoiEmailBusy] = useState(false)
  const [envoiEmailError, setEnvoiEmailError] = useState('')
  // Busy state séparé pour "créer un brouillon dans Outlook" (voir
  // creerBrouillonEmailDepuisModal) — distinct de l'envoi direct ci-dessus.
  const [envoiEmailDraftBusy, setEnvoiEmailDraftBusy] = useState(false)
  const [showLignesSelector, setShowLignesSelector] = useState(false) // sélecteur lignes projet
  const [documents, setDocuments] = useState({ projet: [], officiels: [] }) // documents du projet
  const [cmdDocs, setCmdDocs] = useState({}) // { [cmdId]: [docs] }
  const [uploadingDoc, setUploadingDoc] = useState(null) // cmdId ou 'projet'
  const [expandedCmd, setExpandedCmd] = useState(null) // commande ouverte pour voir ses docs

  useEffect(() => { fetchAll() }, [id])

  // Une fois les données chargées, scrolle jusqu'à la ligne visée par
  // focusId (arrivée depuis un lien du Dashboard) et la met en évidence.
  useEffect(() => {
    if (!focusId || loading) return
    const el = document.getElementById('row-' + focusId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId, loading])

  // Échéance de la nouvelle facture fournisseur recalculée à la volée
  // (pas via useEffect+setState pour éviter un rendu en cascade — voir
  // react-hooks/set-state-in-effect) dès que la date de facture ou le
  // fournisseur sélectionné change, tant que le champ n'a pas été
  // déverrouillé manuellement (voir echeanceFfrsVerrouillee, et les
  // onChange de date_facture / fournisseur_id / le bouton ↺ plus bas).
  function echeanceFfrsAuto(dateFacture, fournisseurId) {
    const frs = fournisseurs.find(x => x.id === fournisseurId)
    return calculerEcheance(dateFacture, frs?.delai_paiement_jours ?? 30, frs?.delai_paiement_fin_mois ?? false)
  }
  // Même logique pour la nouvelle facture client, à partir des conditions
  // de paiement du client du projet — sauf si `comptant` est vrai (facture
  // d'acompte avec la case "Paiement comptant" cochée), auquel cas
  // l'échéance est calculée à 0 jour (= date de facture), quel que soit le
  // délai de paiement habituel du client. Voir formFcli.paiement_comptant.
  function echeanceFcliAuto(dateFacture, comptant = false) {
    if (comptant) return calculerEcheance(dateFacture, 0, false)
    return calculerEcheance(dateFacture, projet?.clients?.delai_paiement_jours ?? 30, projet?.clients?.delai_paiement_fin_mois ?? false)
  }

  function editLigne(ligneId, champ, valeur, ligne) {
    setLignesEditees(prev => {
      const enCours = prev[ligneId] || {}
      // Une ligne Honoraire (vente seule, sans achat) ignore le mode local
      // ac/vc/av choisi par l'utilisateur — voir calculerLigne (mode
      // 'honoraire') et NATURE_LIGNE_OPTIONS.
      const categorieLigne = enCours.categorie_ligne ?? ligne.categorie_ligne ?? 'negoce'
      const modeLocal = categorieLigne === 'honoraire' ? 'honoraire' : (modeLignes[ligneId] || 'ac')
      // Logique de calcul extraite dans lib/calculs.js (calculerLigne) pour
      // être testable indépendamment de React — voir calculs.test.js.
      const current = calculerLigne({ modeLocal, champ, valeur, current: enCours, ligne })
      return { ...prev, [ligneId]: current }
    })
  }

  function getLigneVal(ligne, champ) {
    if (lignesEditees[ligne.id] && lignesEditees[ligne.id][champ] !== undefined) {
      return lignesEditees[ligne.id][champ]
    }
    const val = ligne[champ]
    if (val === null || val === undefined) return ''
    // Pour les champs numériques, retourner le nombre brut (pas formaté)
    if (['qte', 'prix_unit_ht', 'prix_achat_ht', 'total_ht', 'total_achat', 'coeff'].includes(champ)) {
      return val === 0 ? '' : val
    }
    return val
  }

  // Recalcule le CA du projet (montant_ht) à partir des lots ET des lignes
  // sans lot, pour que l'onglet Rentabilité affiche le bon prévisionnel.
  // NB : si lignesArr est null/undefined (échec de la requête précédente), on
  // ne touche à rien pour ne pas écraser une valeur correcte avec du vide.
  // Si lignesArr est un tableau valide (même vide), on resynchronise TOUJOURS,
  // y compris à 0 — sinon supprimer toutes les lignes d'un projet laisse un
  // montant_ht fantôme qui fausse ensuite l'onglet Rentabilité.
  async function syncMontantHtProjet(lignesArr) {
    if (!lignesArr) return
    const totalVente = lignesArr.reduce((s, l) => {
      if (l.type === 'lot') return s + (l.total_ht || 0)
      // Options / variantes non retenues / texte n'entrent jamais dans le
      // total principal du devis — voir ligneCompteDansTotal (lib/calculs.js).
      if (l.type === 'ligne' && !l.lot && ligneCompteDansTotal(l)) return s + (l.total_ht || 0)
      return s
    }, 0)
    await supabase.from('projets').update({ montant_ht: totalVente }).eq('id', id)
    setProjet(prev => ({ ...prev, montant_ht: totalVente }))
  }

  // Recalcule et enregistre le total (vente + achat) d'un lot à partir de
  // ses lignes actuelles — nécessaire car le total d'un lot est un champ
  // stocké sur sa propre ligne "en-tête" (pas recalculé à la volée à
  // l'affichage), pour rester cohérent avec l'import Excel qui fonctionne
  // pareil. Sans cet appel après ajout/suppression d'une ligne, le total du
  // lot resterait figé sur son ancienne valeur. `lignesArr` doit être un
  // jeu de lignes déjà à jour (post-mutation) ; retourne ce même tableau
  // avec le lot concerné patché, prêt pour setLignes.
  async function resynchroniserLot(lignesArr, numeroLot) {
    if (!numeroLot) return lignesArr
    const lot = lignesArr.find(l => l.type === 'lot' && l.numero === numeroLot)
    if (!lot) return lignesArr
    // Options / variantes non retenues / texte n'entrent jamais dans le
    // total du lot — voir ligneCompteDansTotal (lib/calculs.js).
    const enfants = lignesArr.filter(l => l.type === 'ligne' && l.lot === numeroLot && ligneCompteDansTotal(l))
    const totalHt = enfants.reduce((s, l) => s + (l.total_ht || 0), 0)
    const totalAchat = enfants.reduce((s, l) => s + (l.total_achat || 0), 0)
    await supabase.from('projet_lignes').update({ total_ht: totalHt, total_achat: totalAchat }).eq('id', lot.id)
    return lignesArr.map(l => l.id === lot.id ? { ...l, total_ht: totalHt, total_achat: totalAchat } : l)
  }

  async function ajouterLigne() {
    if (!formLigne.descriptif.trim()) return
    setLigneError('')
    setSavingLigne(true)
    const qte = parseFloat(formLigne.qte) || 0
    const estHonoraire = formLigne.nature === 'honoraire'
    // Une ligne Honoraire n'a pas d'achat : le prix de vente est saisi
    // directement (formLigne.prix_vente_ht) plutôt que dérivé d'un achat ×
    // coefficient — voir le formulaire "Nouvelle ligne" et calculerLigne
    // (mode 'honoraire') pour la même logique côté édition inline.
    const prixAchat = estHonoraire ? 0 : (parseFloat(formLigne.prix_achat_ht) || 0)
    const coeff = estHonoraire ? 0 : (parseFloat(formLigne.coeff) || 1)
    const prixVente = estHonoraire ? (parseFloat(formLigne.prix_vente_ht) || 0) : prixAchat * coeff
    const totalHt = qte * prixVente
    const totalAchat = estHonoraire ? 0 : qte * prixAchat
    const maxOrdre = Math.max(...lignes.map(l => l.ordre || 0), 0)
    const { categorie_ligne, variante_active } = natureLigneVersChamps(formLigne.nature || 'negoce')
    const { error } = await supabase.from('projet_lignes').insert([{
      projet_id: id,
      type: 'ligne',
      lot: formLigne.lot || null,
      descriptif: formLigne.descriptif.trim(),
      unite: formLigne.unite,
      qte,
      prix_achat_ht: prixAchat,
      prix_unit_ht: prixVente,
      coeff,
      total_ht: totalHt,
      total_achat: totalAchat,
      ordre: maxOrdre + 1,
      categorie_ligne,
      variante_active,
    }])
    if (!error) {
      let { data: lg } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).is('deleted_at', null).order('ordre')
      lg = await resynchroniserLot(lg || [], formLigne.lot || null)
      setLignes(lg)
      await syncMontantHtProjet(lg)
      setShowAddLigne(false)
      setFormLigne({ lot: '', descriptif: '', unite: '', qte: '', prix_achat_ht: '', coeff: '1.30', prix_vente_ht: '', type: 'ligne', nature: 'negoce' })
    } else {
      // Avant ce correctif, une erreur ici (ex. colonne manquante si
      // categorie_ligne_migration.sql n'a pas été exécuté) refermait
      // silencieusement le formulaire sans rien ajouter ni expliquer
      // pourquoi — voir ajouterLot/lotError pour le même principe.
      setLigneError(error.message)
    }
    setSavingLigne(false)
  }

  async function ajouterLot() {
    setLotError('')
    const numero = formLot.numero.trim()
    const categorie = formLot.categorie.trim()
    if (!numero) { setLotError('Le numéro de lot est obligatoire.'); return }
    if (!categorie) { setLotError('La catégorie est obligatoire.'); return }
    if (lots.some(l => l.numero.toLowerCase() === numero.toLowerCase())) {
      setLotError('Un lot avec ce numéro existe déjà.')
      return
    }
    setSavingLot(true)
    const maxOrdre = Math.max(...lignes.map(l => l.ordre || 0), 0)
    const { error } = await supabase.from('projet_lignes').insert([{
      projet_id: id,
      type: 'lot',
      numero,
      categorie,
      descriptif: formLot.descriptif.trim(),
      total_ht: 0,
      total_achat: 0,
      ordre: maxOrdre + 1,
      categorie_ligne: 'negoce',
      variante_active: true,
    }])
    if (error) { setLotError(error.message); setSavingLot(false); return }
    const { data: lg } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).is('deleted_at', null).order('ordre')
    setLignes(lg || [])
    setShowAddLot(false)
    setFormLot({ numero: '', categorie: '', descriptif: '' })
    setSavingLot(false)
  }

  function ouvrirEditionLot(lot) {
    setLotEnEdition(lot.numero)
    setFormLotEdit({ numero: lot.numero, categorie: lot.categorie || '', descriptif: lot.descriptif || '' })
    setLotEditError('')
  }

  function annulerEditionLot() {
    setLotEnEdition(null)
    setLotEditError('')
  }

  // Modifie le texte d'un lot existant (N°, catégorie, descriptif). Le N°
  // de lot sert de clé de rattachement aux lignes qu'il contient
  // (projet_lignes.lot === lot.numero) : s'il change, on répercute le
  // renommage sur toutes ses lignes enfants pour qu'elles restent
  // rattachées au bon lot, et on fait suivre son état plié/déplié
  // (lotsReduits) au nouveau numéro.
  async function enregistrerEditionLot() {
    if (savingLotEdit) return // garde-fou anti double-clic
    setLotEditError('')
    const ancienNumero = lotEnEdition
    const numero = formLotEdit.numero.trim()
    const categorie = formLotEdit.categorie.trim()
    if (!numero) { setLotEditError('Le numéro de lot est obligatoire.'); return }
    if (!categorie) { setLotEditError('La catégorie est obligatoire.'); return }
    if (numero.toLowerCase() !== ancienNumero.toLowerCase() && lots.some(l => l.numero.toLowerCase() === numero.toLowerCase())) {
      setLotEditError('Un lot avec ce numéro existe déjà.')
      return
    }
    const lotLigne = lignes.find(l => l.type === 'lot' && l.numero === ancienNumero)
    if (!lotLigne) { setLotEnEdition(null); return }
    setSavingLotEdit(true)
    const { error } = await supabase.from('projet_lignes').update({ numero, categorie, descriptif: formLotEdit.descriptif.trim() }).eq('id', lotLigne.id)
    if (error) { setLotEditError(error.message); setSavingLotEdit(false); return }
    if (numero !== ancienNumero) {
      const enfants = lignes.filter(l => l.type !== 'lot' && l.lot === ancienNumero)
      if (enfants.length > 0) {
        const { error: errEnfants } = await supabase.from('projet_lignes').update({ lot: numero }).in('id', enfants.map(l => l.id))
        if (errEnfants) { setLotEditError(errEnfants.message); setSavingLotEdit(false); return }
      }
      setLotsReduits(prev => {
        if (!(ancienNumero in prev)) return prev
        const { [ancienNumero]: valeurPliee, ...reste } = prev
        return { ...reste, [numero]: valeurPliee }
      })
    }
    const { data: lg } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).is('deleted_at', null).order('ordre')
    setLignes(lg || [])
    setLotEnEdition(null)
    setSavingLotEdit(false)
  }

  async function supprimerLigne(ligneId) {
    if (!confirm('Supprimer cette ligne ? (récupérable depuis la Corbeille)')) return
    const ligneSupprimee = lignes.find(l => l.id === ligneId)
    const { error } = await supabase.from('projet_lignes').update({ deleted_at: new Date().toISOString() }).eq('id', ligneId)
    if (error) { alert('Erreur lors de la suppression : ' + error.message); return }
    let { data: lg } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).is('deleted_at', null).order('ordre')
    lg = await resynchroniserLot(lg || [], ligneSupprimee?.lot || null)
    setLignes(lg)
    await syncMontantHtProjet(lg)
    // Si cette ligne était cochée pour une suppression groupée en cours de
    // préparation, on la retire de la sélection (elle n'existe plus).
    setLignesSelectionnees(prev => {
      if (!prev.has(ligneId)) return prev
      const next = new Set(prev); next.delete(ligneId); return next
    })
  }

  // Sélection multiple de lignes (checkboxes, onglet Lignes) → suppression
  // groupée en un seul appel Supabase (`.in('id', ids)`), même principe que
  // supprimerLot pour ses lignes enfants. Une ligne peut appartenir à
  // plusieurs lots différents à la fois dans la sélection : on resynchronise
  // donc chaque lot concerné après coup, pas un seul.
  async function supprimerLignesSelectionnees() {
    if (suppressionLignesBusy) return // garde-fou anti double-clic
    const ids = Array.from(lignesSelectionnees)
    if (ids.length === 0) { setConfirmSuppressionLignesOuvert(false); return }
    setSuppressionLignesBusy(true)
    const lotsAffectes = new Set(lignes.filter(l => ids.includes(l.id) && l.lot).map(l => l.lot))
    const { error } = await supabase.from('projet_lignes').update({ deleted_at: new Date().toISOString() }).in('id', ids)
    if (error) {
      alert('Erreur lors de la suppression : ' + error.message)
      setSuppressionLignesBusy(false)
      return
    }
    let { data: lg } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).is('deleted_at', null).order('ordre')
    lg = lg || []
    for (const numeroLot of lotsAffectes) {
      lg = await resynchroniserLot(lg, numeroLot)
    }
    setLignes(lg)
    await syncMontantHtProjet(lg)
    setLignesSelectionnees(new Set())
    setConfirmSuppressionLignesOuvert(false)
    setSuppressionLignesBusy(false)
  }

  function toggleLigneSelection(ligneId) {
    setLignesSelectionnees(prev => {
      const next = new Set(prev)
      if (next.has(ligneId)) next.delete(ligneId)
      else next.add(ligneId)
      return next
    })
  }

  // Coche/décoche en une fois toutes les lignes d'un groupe (un lot, ou les
  // lignes sans lot) — utilisé par la case "tout sélectionner" de chaque
  // tableau. `idsGroupe` est déjà filtré aux lignes réelles (type 'ligne'),
  // les titres ne sont jamais sélectionnables.
  function toggleSelectionGroupe(idsGroupe) {
    const tousDejaSelectionnes = idsGroupe.length > 0 && idsGroupe.every(i => lignesSelectionnees.has(i))
    setLignesSelectionnees(prev => {
      const next = new Set(prev)
      if (tousDejaSelectionnes) idsGroupe.forEach(i => next.delete(i))
      else idsGroupe.forEach(i => next.add(i))
      return next
    })
  }

  async function supprimerLot(lot) {
    // Les lignes rattachées à ce lot (l.lot === lot.numero) ne sont
    // rattachables à aucun autre groupe si on ne supprime que la ligne
    // "lot" elle-même : elles resteraient en base avec un `lot` pointant
    // vers un numéro qui n'existe plus, invisibles nulle part dans l'UI (ni
    // dans un lot, ni dans "Lignes sans lot"). On supprime donc le lot et
    // toutes ses lignes ensemble — tout reste récupérable depuis la
    // Corbeille pendant 30 jours, comme une suppression de ligne classique.
    const enfants = lignes.filter(l => l.type !== 'lot' && l.lot === lot.numero)
    const message = enfants.length > 0
      ? `Supprimer le lot "LOT ${lot.numero} — ${lot.categorie}" et ses ${enfants.length} ligne(s) ? (récupérables depuis la Corbeille)`
      : `Supprimer le lot "LOT ${lot.numero} — ${lot.categorie}" ? (récupérable depuis la Corbeille)`
    if (!confirm(message)) return
    const ids = [lot.id, ...enfants.map(l => l.id)]
    const { error } = await supabase.from('projet_lignes').update({ deleted_at: new Date().toISOString() }).in('id', ids)
    if (error) { alert('Erreur lors de la suppression du lot : ' + error.message); return }
    const { data: lg } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).is('deleted_at', null).order('ordre')
    setLignes(lg || [])
    await syncMontantHtProjet(lg || [])
    setLignesSelectionnees(prev => {
      if (!ids.some(i => prev.has(i))) return prev
      const next = new Set(prev); ids.forEach(i => next.delete(i)); return next
    })
  }

  async function saveLignes() {
    setSavingLignes(true)
    const updates = Object.entries(lignesEditees)
    const echecs = []
    const reussies = []
    for (const [ligneId, changes] of updates) {
      // Recalculer total_ht et total_achat si qte ou prix changent
      const ligne = lignes.find(l => l.id === ligneId)
      if (ligne) {
        const qte = parseFloat(changes.qte ?? ligne.qte) || 0
        const prixUnit = parseFloat(changes.prix_unit_ht ?? ligne.prix_unit_ht) || 0
        const prixAchat = parseFloat(changes.prix_achat_ht ?? ligne.prix_achat_ht) || 0
        const coeff = parseFloat(changes.coeff ?? ligne.coeff) || 0
        const payload = {
          ...changes,
          qte,
          prix_unit_ht: prixUnit,
          prix_achat_ht: prixAchat,
          total_ht: qte * prixUnit,
          total_achat: qte * prixAchat,
          coeff,
        }
        const { error } = await supabase.from('projet_lignes').update(payload).eq('id', ligneId)
        if (error) echecs.push(ligne.descriptif || ligneId); else reussies.push(ligneId)
      }
    }
    // On ne retire du mode "édition" que les lignes réellement sauvegardées,
    // pour ne pas faire croire qu'un enregistrement en échec a réussi.
    setLignesEditees(prev => {
      const n = { ...prev }
      for (const lId of reussies) delete n[lId]
      return n
    })
    if (echecs.length) alert('Erreur : certaines lignes n\'ont pas pu être enregistrées (' + echecs.join(', ') + ').')
    const { data: lg } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).is('deleted_at', null).order('ordre')
    const lgData = lg || []
    setLignes(lgData)

    // Recalculer et mettre à jour les totaux de chaque lot
    const lotsData = lgData.filter(l => l.type === 'lot')
    const lignesData = lgData.filter(l => l.type === 'ligne')
    for (const lot of lotsData) {
      // Options / variantes non retenues / texte n'entrent jamais dans le
      // total du lot — voir ligneCompteDansTotal (lib/calculs.js).
      const lgLot = lignesData.filter(l => l.lot === lot.numero && ligneCompteDansTotal(l))
      const newTotalHt = lgLot.reduce((s, l) => s + (l.total_ht || 0), 0)
      const newTotalAchat = lgLot.reduce((s, l) => s + (l.total_achat || 0), 0)
      await supabase.from('projet_lignes').update({ total_ht: newTotalHt, total_achat: newTotalAchat }).eq('id', lot.id)
    }

    // Recharger avec les lots mis à jour
    const { data: lgFinal } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).is('deleted_at', null).order('ordre')
    setLignes(lgFinal || [])

    // Mettre à jour montant_ht du projet (lots + lignes sans lot)
    await syncMontantHtProjet(lgFinal || [])

    setSavingLignes(false)
  }

  async function fetchAll() {
    setLoading(true)
    const [{ data: p }, { data: f }, { data: cmd }, { data: ffrs }, { data: fcli }, { data: lg }] = await Promise.all([
      supabase.from('projets').select('*, clients(id, nom, email, telephone, adresse, rue, code_postal, ville, pays, pennylane_customer_id, delai_paiement_jours, delai_paiement_fin_mois)').eq('id', id).single(),
      supabase.from('fournisseurs').select('id, nom, email, rue, code_postal, ville, pays, pennylane_supplier_id, delai_paiement_jours, delai_paiement_fin_mois').is('deleted_at', null).order('nom'),
      supabase.from('commandes').select('*, fournisseurs(nom)').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('factures_frs').select('*, fournisseurs(id, nom, email, rue, code_postal, ville, pays, pennylane_supplier_id), commandes(numero)').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('factures_cli').select('*').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('projet_lignes').select('*').eq('projet_id', id).is('deleted_at', null).order('ordre'),
    ])
    setProjet(p)
    setFournisseurs(f || [])
    setCommandes(cmd || [])
    setFacturesFrs(ffrs || [])
    setFacturesCli(fcli || [])
    setLignes(lg || [])
    // Fetch documents - deux dossiers
    const [{ data: docsProjet }, { data: docsOfficiels }] = await Promise.all([
      supabase.storage.from('documents').list('projets/' + id, { sortBy: { column: 'created_at', order: 'desc' } }),
      supabase.storage.from('documents').list('projets/' + id + '/officiels', { sortBy: { column: 'created_at', order: 'desc' } }),
    ])
    setDocuments({ projet: (docsProjet || []).filter(estUnDocumentReel), officiels: docsOfficiels || [] })
    setLoading(false)
  }

  async function fetchCmdDocs(cmdId) {
    const { data } = await supabase.storage.from('documents').list('commandes/' + cmdId, { sortBy: { column: 'created_at', order: 'desc' } })
    setCmdDocs(prev => ({ ...prev, [cmdId]: data || [] }))
  }

  async function uploadDoc(file, path, onDone) {
    const fileName = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fullPath = path + '/' + fileName
    const { error } = await supabase.storage.from('documents').upload(fullPath, file)
    if (error) { alert('Erreur upload : ' + error.message); return }
    onDone()
  }

  async function deleteDoc(path) {
    if (!confirm('Supprimer ce document ?')) return
    await supabase.storage.from('documents').remove([path])
    const { data } = await supabase.storage.from('documents').list('projets/' + id, { sortBy: { column: 'created_at', order: 'desc' } })
    setDocuments(prev => ({ ...prev, projet: (data || []).filter(estUnDocumentReel) }))
  }

  async function deleteCmdDoc(cmdId, path) {
    if (!confirm('Supprimer ce document ?')) return
    await supabase.storage.from('documents').remove([path])
    fetchCmdDocs(cmdId)
  }

  function getDocUrl(path) {
    const { data } = supabase.storage.from('documents').getPublicUrl(path)
    return data.publicUrl
  }

  // ── Import Excel lignes ───────────────────────────────────────
  // XLSX (~420kB) est chargé à la demande, seulement quand l'utilisateur
  // importe vraiment un fichier Excel — plutôt que sur chaque ouverture de
  // page projet (voir aussi jsPDF, importé statiquement plus haut : lui
  // reste statique car utilisé sur la quasi-totalité des visites de cette
  // page, contrairement à l'import Excel qui est occasionnel).
  async function parseExcel(file) {
    const XLSX = await import('xlsx')
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
          const lignes = []
          let currentLot = null
          let totalGeneral = 0
          for (let i = 1; i < rows.length; i++) {
            const r = rows[i]
            const num = String(r[0] || '').trim()
            const categorie = String(r[1] || '').trim()
            const descriptif = String(r[2] || '').trim()
            const unite = String(r[3] || '').trim()
            const qte = parseFloat(r[4]) || 0
            const prixUnit = parseFloat(r[5]) || 0
            const totalPrixUnit = parseFloat(r[6]) || 0
            const coeff = parseFloat(r[7]) || 0
            const prixAchat = parseFloat(r[8]) || 0
            const totalAchat = parseFloat(r[9]) || 0
            const fournisseur = String(r[10] || '').trim()
            // Colonne "Nature" (12e, optionnelle) — Négoce / Option / Variante
            // retenue / Variante alt. / Texte, voir NATURE_LIGNE_OPTIONS. Un
            // fichier construit avant l'ajout de cette colonne (ou une
            // cellule vide/mal orthographiée) retombe sur "Négoce", comme
            // avant — l'import ne casse jamais pour ça.
            const { categorie_ligne: categorieLigne, variante_active: varianteActive } = natureLigneVersChamps(natureLigneDepuisTexte(r[11]))
            if (!num && !categorie && !descriptif) continue
            if (descriptif.toLowerCase() === 'total' && totalPrixUnit > 0) { totalGeneral = totalPrixUnit; continue }
            const isLot = /^\d+$/.test(num) && categorie && totalPrixUnit > 0
            // categorie_ligne/variante_active sont explicitement fournis même pour
            // lot/titre (qui n'utilisent pas la Nature) : la colonne est NOT NULL
            // en base, mieux vaut ne jamais dépendre du DEFAULT de la migration
            // pour que l'import ne casse jamais sur ces lignes.
            if (isLot) { currentLot = num; lignes.push({ type: 'lot', numero: num, categorie, descriptif, total_ht: totalPrixUnit, total_achat: totalAchat, coeff, categorie_ligne: 'negoce', variante_active: true }); continue }
            const isTitre = num && !categorie && !unite && qte === 0 && prixUnit === 0 && descriptif
            if (isTitre) { lignes.push({ type: 'titre', numero: num, descriptif, lot: currentLot, categorie_ligne: 'negoce', variante_active: true }); continue }
            if (num || descriptif) lignes.push({ type: 'ligne', numero: num, lot: currentLot, descriptif, unite, qte, prix_unit_ht: prixUnit, total_ht: totalPrixUnit, coeff, prix_achat_ht: prixAchat, total_achat: totalAchat, fournisseur, categorie_ligne: categorieLigne, variante_active: varianteActive })
          }
          resolve({ lignes, totalGeneral })
        } catch (err) { reject(err) }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }

  async function handleImportLignes(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true); setImportError('')
    try {
      const { lignes: parsed, totalGeneral } = await parseExcel(file)
      // Le résultat de ce delete était jusqu'ici ignoré : si jamais il
      // échouait (erreur réseau, contrainte...), l'import continuait quand
      // même et insérait les nouvelles lignes par-dessus les anciennes —
      // doublant silencieusement tous les totaux du projet. On vérifie
      // maintenant l'erreur avant de poursuivre, comme pour l'insert juste
      // en dessous.
      const { error: errDelete } = await supabase.from('projet_lignes').delete().eq('projet_id', id)
      if (errDelete) throw errDelete
      const toInsert = parsed.map((l, idx) => ({ ...l, projet_id: id, ordre: idx }))
      const { error } = await supabase.from('projet_lignes').insert(toInsert)
      if (error) throw error

      // Recalcule le total de chaque lot à partir de ses lignes réellement
      // comptées (hors Options / variantes non retenues / texte) : la
      // formule Excel qui a produit le total_ht importé du lot ne connaît
      // pas la colonne "Nature" et somme toutes les lignes sans distinction
      // — voir ligneCompteDansTotal (lib/calculs.js).
      const { data: lg } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).is('deleted_at', null).order('ordre')
      const lgApresImport = lg || []
      const lotsImportes = lgApresImport.filter(l => l.type === 'lot')
      const lignesImportees = lgApresImport.filter(l => l.type === 'ligne')
      for (const lot of lotsImportes) {
        const lgLot = lignesImportees.filter(l => l.lot === lot.numero && ligneCompteDansTotal(l))
        const newTotalHt = lgLot.reduce((s, l) => s + (l.total_ht || 0), 0)
        const newTotalAchat = lgLot.reduce((s, l) => s + (l.total_achat || 0), 0)
        if (newTotalHt !== lot.total_ht || newTotalAchat !== lot.total_achat) {
          await supabase.from('projet_lignes').update({ total_ht: newTotalHt, total_achat: newTotalAchat }).eq('id', lot.id)
        }
      }
      const { data: lgFinal } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).is('deleted_at', null).order('ordre')
      setLignes(lgFinal || [])

      // Total général du projet : priorité à une ligne "TOTAL" explicite de
      // l'Excel (override volontaire), sinon recalculé à partir des lots et
      // lignes sans lot fraîchement importés (hors Options, etc.)
      if (totalGeneral > 0) {
        await supabase.from('projets').update({ montant_ht: totalGeneral }).eq('id', id)
        setProjet(prev => ({ ...prev, montant_ht: totalGeneral }))
      } else {
        await syncMontantHtProjet(lgFinal || [])
      }
    } catch (err) { setImportError("Erreur import : " + err.message) }
    setImporting(false); e.target.value = ''
  }

  // ── Save infos ────────────────────────────────────────────────
  async function saveInfos() {
    setInfosError('')
    // .select().single() force la requête à renvoyer la ligne mise à jour
    // (ou une erreur explicite si aucune ligne n'a été affectée, ex. policy
    // RLS qui bloque silencieusement) — avant ce correctif, une erreur ici
    // (contrainte invalide sur un des champs, etc.) refermait le formulaire
    // sans rien enregistrer ni expliquer pourquoi : l'ancien nom (et les
    // autres champs) réapparaissait dès le prochain chargement de la page,
    // sans aucun indice sur la cause.
    const { data, error } = await supabase.from('projets').update(formInfos).eq('id', id).select().single()
    if (error) { setInfosError(error.message); return }
    setProjet(prev => ({ ...prev, ...data }))
    setEditInfos(false)
  }

  // ── Duplication (devis + projet) ────────────────────────────────
  // Repart d'un devis déjà chiffré pour un projet similaire, sans tout
  // ressaisir : crée une nouvelle fiche projet (statut remis à "Devis
  // envoyé", dates de chantier vidées puisqu'elles ne s'appliquent pas au
  // nouveau) et copie toutes les lignes du devis (lots, lignes, titres)
  // dessus. Ne duplique volontairement ni les commandes, ni les factures,
  // ni les documents — seulement le chiffrage.
  // Le bouton "Dupliquer" du header ouvre juste la modale de confirmation
  // (setConfirmDupliquerOuvert(true)) ; c'est son bouton "Dupliquer" à
  // elle qui appelle confirmerDuplication() ci-dessous.
  async function confirmerDuplication() {
    if (dupliquerBusy) return // garde-fou anti double-clic
    setConfirmDupliquerOuvert(false)
    const nomCopie = projet.nom + ' (copie)'
    setDupliquerBusy(true)
    try {
      const { data: nouveauProjet, error } = await supabase.from('projets').insert([{
        nom: nomCopie,
        client_id: projet.client_id || null,
        statut: 'Brouillon',
        date_debut: null,
        date_fin_prevue: null,
        surface: projet.surface || null,
        adresse_chantier: projet.adresse_chantier || null,
        acces_livraison: projet.acces_livraison || null,
        notes: projet.notes || null,
        montant_ht: projet.montant_ht || 0,
        taux_tva: projet.taux_tva ?? 20,
      }]).select().single()
      if (error) throw error

      if (lignes.length > 0) {
        // On ne recopie que les colonnes de contenu — pas l'id, le projet_id
        // ni les dates, qui doivent être régénérés pour cette copie.
        const nouvellesLignes = lignes.map(l => ({
          type: l.type,
          lot: l.lot,
          numero: l.numero,
          categorie: l.categorie,
          descriptif: l.descriptif,
          unite: l.unite,
          qte: l.qte,
          prix_unit_ht: l.prix_unit_ht,
          prix_achat_ht: l.prix_achat_ht,
          total_ht: l.total_ht,
          total_achat: l.total_achat,
          coeff: l.coeff,
          fournisseur: l.fournisseur,
          ordre: l.ordre,
          categorie_ligne: l.categorie_ligne,
          variante_active: l.variante_active,
          projet_id: nouveauProjet.id,
        }))
        const { error: errLignes } = await supabase.from('projet_lignes').insert(nouvellesLignes)
        if (errLignes) throw errLignes
      }

      navigate('/projets/' + nouveauProjet.id)
    } catch (err) {
      alert('Erreur lors de la duplication : ' + err.message)
    }
    setDupliquerBusy(false)
  }

  // Statut "Perdu" : sortie du flux normal (devis refusé / projet
  // abandonné). Accessible tant que le projet n'est pas encore "En cours"
  // (on ne marque pas perdu un chantier déjà lancé — voir bouton dans le
  // header). Réactivable ensuite vers "Brouillon" si besoin.
  async function marquerProjetPerdu() {
    if (!confirm('Marquer "' + projet.nom + '" comme perdu ? Le projet sortira du flux actif mais restera consultable.')) return
    const { error } = await supabase.from('projets').update({ statut: 'Perdu' }).eq('id', id)
    if (error) { alert('Erreur lors du changement de statut : ' + error.message); return }
    setProjet(prev => ({ ...prev, statut: 'Perdu' }))
  }

  async function reactiverProjetPerdu() {
    const { error } = await supabase.from('projets').update({ statut: 'Brouillon' }).eq('id', id)
    if (error) { alert('Erreur lors du changement de statut : ' + error.message); return }
    setProjet(prev => ({ ...prev, statut: 'Brouillon' }))
  }

  // ── Commandes ─────────────────────────────────────────────────
  function genNumeroCommande(projet, existingCommandes) {
    const nomCourt = (projet?.nom || 'PROJ').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase()
    const n = (existingCommandes?.length || 0) + 1
    const num = String(n).padStart(3, '0')
    return 'PP-' + nomCourt + '-' + num
  }

  async function ajouterCommande() {
    if (savingCmd) return
    setError('')
    if (!formCmd.description.trim()) { setError('La description est obligatoire.'); return }
    setSavingCmd(true)
    const numeroAuto = formCmd.numero || genNumeroCommande(projet, commandes)
    const { error } = await supabase.from('commandes').insert([{
      ...formCmd,
      numero: numeroAuto,
      projet_id: id,
      montant_ht: parseFloat(formCmd.montant_ht) || 0,
      fournisseur_id: formCmd.fournisseur_id || null,
      date_commande: formCmd.date_commande || new Date().toISOString().split('T')[0]
    }])
    if (error) { setError(error.message); setSavingCmd(false); return }
    setShowForm(false)
    setFormCmd({ fournisseur_id: '', numero: '', description: '', montant_ht: '', statut: 'Brouillon', date_commande: '', regime_tva: 'normale' })
    const { data } = await supabase.from('commandes').select('*, fournisseurs(nom)').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
    setCommandes(data || [])
    setSavingCmd(false)
  }

  async function saveCmd(cmdId) {
    const changes = cmdEditees[cmdId]
    if (!changes) return
    const payload = { ...changes }
    // NB : "!== undefined" et pas "if (changes.montant_ht)" — sinon vider le
    // champ (chaîne vide) est ignoré silencieusement au lieu d'être remis à 0,
    // et l'ancienne valeur brute ('' ) part telle quelle vers une colonne numérique.
    if (changes.montant_ht !== undefined) payload.montant_ht = parseFloat(changes.montant_ht) || 0
    const { error } = await supabase.from('commandes').update(payload).eq('id', cmdId)
    if (error) { alert('Erreur lors de l\'enregistrement : ' + error.message); return }
    setCmdEditees(prev => { const n = { ...prev }; delete n[cmdId]; return n })
    // Reverrouille : une prochaine modification (même dans la même session)
    // redemandera confirmation si la commande est (re)passée Validée.
    setCmdDeverrouillees(prev => { const n = new Set(prev); n.delete(cmdId); return n })
    const { data } = await supabase.from('commandes').select('*, fournisseurs(nom)').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
    setCommandes(data || [])
  }

  function getCmdVal(cmd, champ) {
    if (cmdEditees[cmd.id] && cmdEditees[cmd.id][champ] !== undefined) return cmdEditees[cmd.id][champ]
    return cmd[champ] ?? ''
  }

  function editCmd(cmdId, champ, valeur) {
    // Une commande Validée est censée être figée — avant d'accepter la
    // toute première modification de cette commande dans cette session, on
    // demande confirmation. Une fois confirmée, les modifications suivantes
    // (ex. plusieurs frappes dans un champ texte) passent sans re-demander,
    // jusqu'à l'enregistrement (voir saveCmd) qui reverrouille.
    const cmd = commandes.find(c => c.id === cmdId)
    if (cmd && cmd.statut === 'Validée' && !cmdDeverrouillees.has(cmdId)) {
      const ok = confirm('Cette commande est validée. Voulez-vous vraiment la modifier ?')
      if (!ok) return
      setCmdDeverrouillees(prev => new Set(prev).add(cmdId))
    }
    setCmdEditees(prev => ({ ...prev, [cmdId]: { ...(prev[cmdId] || {}), [champ]: valeur } }))
  }

  function generateCmdPDF(cmd, lang = 'fr') {
    const t = L[lang]
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    let y = enTeteDocument(doc, { titre: t.titreCommande, lang })
    y = blocMetaEtDestinataire(doc, y, {
      metaGauche: [
        [t.numeroCommande, cmd.numero || '—'],
        [t.date, cmd.date_commande ? fmtDatePdf(cmd.date_commande, lang) : fmtDatePdf(new Date(), lang)],
        [t.projetLabel, projet?.nom || '—'],
      ],
      destinataire: { titre: t.fournisseur, lignes: [cmd.fournisseurs?.nom, ...lignesAdresse(cmd.fournisseurs, lang)] },
    })
    if (projet?.adresse_chantier) {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY)
      doc.text(t.adresseChantier + projet.adresse_chantier, 14, y); y += 8
    }

    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
    doc.text(t.objetCommande, 14, y); y += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    const descLines = doc.splitTextToSize(cmd.description || '', 182)
    doc.text(descLines, 14, y)
    y += descLines.length * 5 + 6

    autoTable(doc, {
      startY: y,
      head: [[t.colDescription, t.colMontantHt]],
      body: [[cmd.description || '', fmtEUR(cmd.montant_ht, lang)]],
      styles: TABLE_STYLE,
      headStyles: TABLE_HEAD_STYLE,
      alternateRowStyles: TABLE_ALT_ROW_STYLE,
      columnStyles: { 1: { halign: 'right', cellWidth: 40, fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    })

    y = doc.lastAutoTable.finalY + 10
    if (y > 220) { doc.addPage(); y = 20 }
    const totalHt = cmd.montant_ht || 0
    // Autoliquidation (sous-traitance BTP, article 283 du CGI) : le
    // fournisseur ne facture pas de TVA, c'est Partenaires Particuliers qui
    // la déclare et la paie — donc pas de ligne TVA sur ce bon de commande,
    // juste la mention légale obligatoire. Réglage par commande (contraire
    // au taux du devis/facture client, qui est par projet) car un même
    // projet mélange souvent fournitures (TVA normale) et sous-traitants
    // BTP (autoliquidation).
    const autoliquidation = cmd.regime_tva === 'autoliquidation'
    const totalTva = autoliquidation ? 0 : totalHt * 0.20
    const totalTtc = totalHt + totalTva
    y = blocTotaux(doc, y, { totalHt, totalTva, totalTtc, showTva: !autoliquidation, lang })
    if (autoliquidation) {
      doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...GRAY)
      const mentionLines = doc.splitTextToSize(t.mentionAutoliquidation, 182)
      doc.text(mentionLines, 14, y)
      y += 4.5 * mentionLines.length + 2
    }

    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY)
    doc.text(t.statutLabel + (cmd.statut || ''), 14, y)

    piedDePage(doc, cmd.numero || projet?.nom || '', lang)
    return doc
  }

  // ── Facture client : même charte graphique que le devis, mais SANS les
  // CGV en annexe (contrairement au devis) et AVEC les coordonnées
  // bancaires pour le règlement — deux différences volontaires demandées
  // spécifiquement pour la facture, pas les autres documents. Pas de bloc
  // signature non plus (une facture n'a pas besoin d'un "bon pour accord").
  function generateFactureCliPDF(f, lang = 'fr') {
    const t = L[lang]
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const totalHt = f.montant_ht || 0
    const tauxTva = Number(projet?.taux_tva ?? 20)
    const totalTva = totalHt * (tauxTva / 100)
    const totalTtc = totalHt + totalTva
    const description = t.prestations + (projet?.nom || '')
    // Facture d'acompte : titre distinct ("FACTURE D'ACOMPTE") et, si réglée
    // comptant, conditions de paiement sans mention de délai de 30 jours —
    // voir sql/facture_cli_type_migration.sql et lib/pdfI18n.js.
    const titreDoc = f.type_facture === 'acompte' ? t.titreFactureAcompte : t.titreFacture
    const bullets = f.paiement_comptant ? t.bulletsFactureComptant(tauxTva) : t.bulletsFacture(tauxTva)

    let y = enTeteDocument(doc, { titre: titreDoc, lang })
    y = blocMetaEtDestinataire(doc, y, {
      metaGauche: [
        [t.numeroFacture, f.numero || '—'],
        [t.date, f.date_facture ? fmtDatePdf(f.date_facture, lang) : fmtDatePdf(new Date(), lang)],
        [t.echeance, f.date_echeance ? fmtDatePdf(f.date_echeance, lang) : '—'],
        // Réf. bon de commande client — un seul numéro par projet (voir
        // onglet Infos), repris automatiquement quand il est renseigné.
        ...(projet?.numero_bon_commande_client ? [[t.referenceBonCommandeClient, projet.numero_bon_commande_client]] : []),
      ],
      destinataire: { titre: t.client, lignes: [projet?.clients?.nom, ...lignesAdresse(projet?.clients, lang)] },
    })

    autoTable(doc, {
      startY: y,
      head: [[t.colDesignation, t.colMontantHt]],
      body: [[description, fmtEUR(totalHt, lang)]],
      styles: TABLE_STYLE,
      headStyles: TABLE_HEAD_STYLE,
      alternateRowStyles: TABLE_ALT_ROW_STYLE,
      columnStyles: { 1: { halign: 'right', cellWidth: 40, fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    })

    y = doc.lastAutoTable.finalY + 10
    if (y > 220) { doc.addPage(); y = 20 }
    y = blocTotaux(doc, y, { totalHt, totalTva, totalTtc, tauxTva, lang })
    if (y > 250) { doc.addPage(); y = 20 }
    y = blocConditionsEtSignature(doc, y, { bullets, avecSignature: false, lang })
    if (y > 260) { doc.addPage(); y = 20 }
    blocCoordonneesBancaires(doc, y, { lang })

    piedDePage(doc, f.numero || projet?.nom || '', lang)
    return doc
  }

  // ── Envoi d'email (facture client / commande fournisseur) avec PDF joint ──
  // Même principe que la relance du Dashboard ("Ca doit pas partir direct") :
  // aucun envoi n'est déclenché directement au clic sur "Envoyer", tout passe
  // par la modale d'aperçu/édition ci-dessous (voir envoiEmailModal, plus
  // bas dans le rendu).
  function pdfEnBase64(doc) {
    const dataUri = doc.output('datauristring')
    return dataUri.split('base64,')[1] || ''
  }

  function ouvrirEnvoiFactureCli(f) {
    const email = projet?.clients?.email
    if (!email) { alert('Ce client n\'a pas d\'adresse email enregistrée.'); return }
    const doc = generateFactureCliPDF(f, 'fr')
    const sujet = 'Facture ' + (f.numero || '') + (projet?.nom ? ' — ' + projet.nom : '')
    // Une facture d'acompte réglée comptant a une échéance = date de
    // facture (voir echeanceFcliAuto) : "à régler avant le [aujourd'hui]"
    // serait trompeur, on préfère l'annoncer explicitement comme comptant.
    const mentionEcheance = f.paiement_comptant
      ? ', à régler comptant dès réception'
      : (f.date_echeance ? ', à régler avant le ' + new Date(f.date_echeance).toLocaleDateString('fr-FR') : '')
    const corps = 'Bonjour,\n\nVeuillez trouver ci-joint la facture ' + (f.numero || '') +
      (projet?.nom ? ' relative au projet ' + projet.nom : '') +
      ', d\'un montant de ' + Number(f.montant_ht || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' € HT' +
      mentionEcheance +
      '.\n\nN\'hésitez pas à revenir vers nous pour toute question.\n\nCordialement'
    setEnvoiEmailModal({
      type: 'facture_cli',
      id: f.id,
      to: email,
      subject: sujet,
      body: corps,
      attachment: { name: (f.numero || 'facture') + '.pdf', contentType: 'application/pdf', contentBytes: pdfEnBase64(doc) },
    })
    setEnvoiEmailError('')
  }

  function ouvrirEnvoiCommande(cmd) {
    const fournisseur = fournisseurs.find(fr => fr.id === cmd.fournisseur_id)
    const email = fournisseur?.email
    if (!email) { alert('Ce fournisseur n\'a pas d\'adresse email enregistrée.'); return }
    const doc = generateCmdPDF({ ...cmd, fournisseurs: fournisseur }, 'fr')
    const sujet = 'Commande ' + (cmd.numero || '') + (projet?.nom ? ' — ' + projet.nom : '')
    const corps = 'Bonjour,\n\nVeuillez trouver ci-joint notre commande ' + (cmd.numero || '') +
      (projet?.nom ? ' pour le projet ' + projet.nom : '') +
      ', d\'un montant de ' + Number(cmd.montant_ht || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' € HT' +
      '.\n\nMerci de nous confirmer sa bonne réception.\n\nCordialement'
    setEnvoiEmailModal({
      type: 'commande',
      id: cmd.id,
      to: email,
      subject: sujet,
      body: corps,
      attachment: { name: (cmd.numero || 'commande') + '.pdf', contentType: 'application/pdf', contentBytes: pdfEnBase64(doc) },
    })
    setEnvoiEmailError('')
  }

  async function envoyerEmailDepuisModal() {
    if (!envoiEmailModal) return
    setEnvoiEmailBusy(true)
    setEnvoiEmailError('')
    try {
      await envoyerEmailOutlook({
        to: envoiEmailModal.to,
        subject: envoiEmailModal.subject,
        body: envoiEmailModal.body,
        attachments: envoiEmailModal.attachment ? [envoiEmailModal.attachment] : undefined,
      })
      // Facture client envoyée depuis l'état "À envoyer" : on fait passer
      // son statut à "Envoyée" pour refléter l'action (sans écraser un
      // statut déjà plus avancé, ex. Payée).
      if (envoiEmailModal.type === 'facture_cli') {
        const facture = facturesCli.find(f => f.id === envoiEmailModal.id)
        if (facture && facture.statut === 'À envoyer') {
          await supabase.from('factures_cli').update({ statut: 'Envoyée' }).eq('id', envoiEmailModal.id)
          const { data } = await supabase.from('factures_cli').select('*').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
          setFacturesCli(data || [])
        }
      }
      setEnvoiEmailModal(null)
    } catch (err) {
      setEnvoiEmailError(err.message)
    }
    setEnvoiEmailBusy(false)
  }

  // Alternative à l'envoi automatique : enregistre le message (avec sa
  // pièce jointe) comme brouillon dans la boîte Outlook configurée puis
  // l'ouvre dans un nouvel onglet, pour que Louis le relise et l'envoie
  // lui-même directement depuis Outlook.
  async function creerBrouillonEmailDepuisModal() {
    if (!envoiEmailModal) return
    setEnvoiEmailDraftBusy(true)
    setEnvoiEmailError('')
    try {
      const webLink = await creerBrouillonOutlook({
        to: envoiEmailModal.to,
        subject: envoiEmailModal.subject,
        body: envoiEmailModal.body,
        attachments: envoiEmailModal.attachment ? [envoiEmailModal.attachment] : undefined,
      })
      if (webLink) window.open(webLink, '_blank', 'noopener,noreferrer')
      setEnvoiEmailModal(null)
    } catch (err) {
      setEnvoiEmailError(err.message)
    }
    setEnvoiEmailDraftBusy(false)
  }

  async function ajouterFactureFrs() {
    if (savingFactureFrs) return
    setError('')
    if (!formFfrs.numero.trim()) { setError('Le numéro est obligatoire.'); return }
    setSavingFactureFrs(true)
    const { data: inserted, error } = await supabase.from('factures_frs').insert([{ ...formFfrs, projet_id: id, montant_ht: parseFloat(formFfrs.montant_ht) || 0, fournisseur_id: formFfrs.fournisseur_id || null, commande_id: formFfrs.commande_id || null }]).select().single()
    if (error) { setError(error.message); setSavingFactureFrs(false); return }

    // Si un PDF a été joint, on l'archive dans le stockage du projet — ce
    // fichier servira aussi de justificatif lors de l'envoi vers Pennylane.
    if (fileFfrs && inserted) {
      const fileName = 'facture_' + inserted.id + '_' + fileFfrs.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = 'projets/' + id + '/factures_frs/' + fileName
      const { error: uploadErr } = await supabase.storage.from('documents').upload(path, fileFfrs)
      if (!uploadErr) {
        await supabase.from('factures_frs').update({ fichier_path: path }).eq('id', inserted.id)
      }
    }

    setShowForm(false); setFormFfrs({ fournisseur_id: '', commande_id: '', numero: '', montant_ht: '', statut: 'À payer', date_facture: '', date_echeance: '' }); setFileFfrs(null); setEcheanceFfrsVerrouillee(true)
    const { data } = await supabase.from('factures_frs').select('*, fournisseurs(id, nom, email, rue, code_postal, ville, pays, pennylane_supplier_id), commandes(numero)').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
    setFacturesFrs(data || [])
    setSavingFactureFrs(false)
  }

  // ── Pennylane : envoi / synchro des factures ──────────────────
  async function envoyerFactureCliVersPennylane(facture) {
    setPennylaneError(''); setPennylaneBusy(facture.id)
    try {
      if (!projet.clients) throw new Error('Ce projet n\'a pas de client associé.')
      await pushFactureClientPennylane(facture, projet.clients, projet.nom)
      const { data } = await supabase.from('factures_cli').select('*').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
      setFacturesCli(data || [])
    } catch (err) {
      setPennylaneError(err.message)
    }
    setPennylaneBusy(null)
  }

  async function actualiserFactureCliPennylane(facture) {
    setPennylaneError(''); setPennylaneBusy(facture.id)
    try {
      await syncFactureClientStatut(facture)
      const { data } = await supabase.from('factures_cli').select('*').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
      setFacturesCli(data || [])
    } catch (err) {
      setPennylaneError(err.message)
    }
    setPennylaneBusy(null)
  }

  async function envoyerFactureFrsVersPennylane(facture) {
    setPennylaneError(''); setPennylaneBusy(facture.id)
    try {
      if (!facture.fournisseurs) throw new Error('Cette facture n\'a pas de fournisseur associé.')
      if (!facture.fichier_path) throw new Error('Aucun PDF joint à cette facture — supprime-la et recrée-la avec le fichier, ou ajoute cette fonctionnalité de complément.')
      const { data: blob, error: dlErr } = await supabase.storage.from('documents').download(facture.fichier_path)
      if (dlErr) throw new Error('Impossible de récupérer le PDF : ' + dlErr.message)
      const file = new File([blob], facture.fichier_path.split('/').pop(), { type: 'application/pdf' })
      await pushFactureFrsPennylane(facture, facture.fournisseurs, file)
      const { data } = await supabase.from('factures_frs').select('*, fournisseurs(id, nom, email, rue, code_postal, ville, pays, pennylane_supplier_id), commandes(numero)').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
      setFacturesFrs(data || [])
    } catch (err) {
      setPennylaneError(err.message)
    }
    setPennylaneBusy(null)
  }

  async function actualiserFactureFrsPennylane(facture) {
    setPennylaneError(''); setPennylaneBusy(facture.id)
    try {
      await syncFactureFrsStatut(facture)
      const { data } = await supabase.from('factures_frs').select('*, fournisseurs(id, nom, email, rue, code_postal, ville, pays, pennylane_supplier_id), commandes(numero)').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
      setFacturesFrs(data || [])
    } catch (err) {
      setPennylaneError(err.message)
    }
    setPennylaneBusy(null)
  }

  // ── Rapprochement Qonto (limité aux factures de ce projet) ────
  // Même logique que la page globale "Rapprochement" (lib/rapprochement.js),
  // mais restreinte aux factures ouvertes de ce projet — pratique pour une
  // vérification rapide sans quitter la fiche projet.
  async function recupererToutesLesTransactionsQonto() {
    const comptes = await getBankAccounts()
    const lots = await Promise.all(comptes.map(c => getTransactionsPourRapprochement(c)))
    return lots.flat()
  }

  async function recupererTransactionsDejaLiees() {
    // Important : on ignore les lignes supprimées (deleted_at) — sinon une
    // facture envoyée à la Corbeille garde sa transaction "réservée" pour
    // toujours et bloque tout rapprochement futur sur cette transaction.
    const [{ data: liensCli }, { data: liensFrs }, { data: liensDep }] = await Promise.all([
      supabase.from('factures_cli').select('qonto_transaction_id').not('qonto_transaction_id', 'is', null).is('deleted_at', null),
      supabase.from('factures_frs').select('qonto_transaction_id').not('qonto_transaction_id', 'is', null).is('deleted_at', null),
      supabase.from('depenses_generales').select('qonto_transaction_id').not('qonto_transaction_id', 'is', null).is('deleted_at', null),
    ])
    return new Set([
      ...(liensCli || []).map(l => l.qonto_transaction_id),
      ...(liensFrs || []).map(l => l.qonto_transaction_id),
      ...(liensDep || []).map(l => l.qonto_transaction_id),
    ])
  }

  async function verifierQontoCli() {
    setRapprochementError(''); setRapprochementBusy('cli')
    try {
      const [transactions, exclues] = await Promise.all([recupererToutesLesTransactionsQonto(), recupererTransactionsDejaLiees()])
      const ouvertes = facturesCli.filter(f => f.statut !== 'Payée')
      const resultats = rapprocherFactures(ouvertes, transactions, 'credit', exclues)
      const exactes = resultats.filter(r => r.confiance === 'exact')
      // appliquerRapprochement peut renvoyer une erreur (ex. policy RLS qui
      // bloque silencieusement la mise à jour) — jusqu'ici ignorée ici, la
      // facture disparaissait de la liste "à vérifier" comme si tout s'était
      // bien passé alors que rien n'avait été enregistré. Voir le même
      // correctif sur la page globale Rapprochement.jsx.
      let echecs = 0
      for (const match of exactes) {
        const { error: errMatch } = await appliquerRapprochement(supabase, 'factures_cli', match)
        if (errMatch) echecs++
      }
      const idsAppliques = new Set(exactes.map(r => r.facture.id))
      setSuggestionsQontoCli(resultats.filter(r => r.confiance === 'montant' && !idsAppliques.has(r.facture.id)))
      if (exactes.length > 0) {
        const { data } = await supabase.from('factures_cli').select('*').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
        setFacturesCli(data || [])
      }
      if (echecs > 0) setRapprochementError(echecs + ' correspondance(s) trouvée(s) mais non enregistrée(s) — la migration sql/qonto_migration.sql a-t-elle été exécutée dans Supabase ?')
    } catch (err) {
      setRapprochementError(err.message)
    }
    setRapprochementBusy(null)
  }

  async function verifierQontoFrs() {
    setRapprochementError(''); setRapprochementBusy('frs')
    try {
      const [transactions, exclues] = await Promise.all([recupererToutesLesTransactionsQonto(), recupererTransactionsDejaLiees()])
      const ouvertes = facturesFrs.filter(f => f.statut !== 'Payée')
      const resultats = rapprocherFactures(ouvertes, transactions, 'debit', exclues)
      const exactes = resultats.filter(r => r.confiance === 'exact')
      let echecs = 0
      for (const match of exactes) {
        const { error: errMatch } = await appliquerRapprochement(supabase, 'factures_frs', match)
        if (errMatch) echecs++
      }
      const idsAppliques = new Set(exactes.map(r => r.facture.id))
      setSuggestionsQontoFrs(resultats.filter(r => r.confiance === 'montant' && !idsAppliques.has(r.facture.id)))
      if (exactes.length > 0) {
        const { data } = await supabase.from('factures_frs').select('*, fournisseurs(id, nom, email, rue, code_postal, ville, pays, pennylane_supplier_id), commandes(numero)').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
        setFacturesFrs(data || [])
      }
      if (echecs > 0) setRapprochementError(echecs + ' correspondance(s) trouvée(s) mais non enregistrée(s) — la migration sql/qonto_migration.sql a-t-elle été exécutée dans Supabase ?')
    } catch (err) {
      setRapprochementError(err.message)
    }
    setRapprochementBusy(null)
  }

  async function confirmerSuggestionQonto(table, match) {
    const cle = 'confirm:' + match.facture.id
    setRapprochementBusy(cle)
    const { error: err } = await appliquerRapprochement(supabase, table, match)
    if (err) {
      setRapprochementError(err.message)
    } else if (table === 'factures_cli') {
      setSuggestionsQontoCli(prev => prev.filter(r => r.facture.id !== match.facture.id))
      const { data } = await supabase.from('factures_cli').select('*').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
      setFacturesCli(data || [])
    } else {
      setSuggestionsQontoFrs(prev => prev.filter(r => r.facture.id !== match.facture.id))
      const { data } = await supabase.from('factures_frs').select('*, fournisseurs(id, nom, email, rue, code_postal, ville, pays, pennylane_supplier_id), commandes(numero)').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
      setFacturesFrs(data || [])
    }
    setRapprochementBusy(null)
  }

  async function ajouterFactureCli() {
    // Double-clic/double-tap pendant l'aller-retour réseau = deux appels à
    // next_facture_numero() pour une seule facture voulue par l'utilisateur
    // : la numérotation légale est séquentielle et non modifiable, donc ce
    // n'est pas juste "une ligne en trop facile à supprimer", le numéro
    // sauté reste un trou dans la séquence. D'où le garde-fou ci-dessous.
    if (savingFactureCli) return
    setError('')
    setSavingFactureCli(true)
    // Le numéro n'est plus saisi à la main : la loi impose une suite
    // séquentielle et non modifiable pour les factures émises, donc il est
    // généré côté base de données (fonction next_facture_numero(), voir
    // sql/05_numerotation_factures.sql) au moment de la création.
    const { data: numeroGenere, error: errNumero } = await supabase.rpc('next_facture_numero')
    if (errNumero) { setError('Impossible de générer le numéro de facture : ' + errNumero.message); setSavingFactureCli(false); return }
    const { error } = await supabase.from('factures_cli').insert([{ ...formFcli, numero: numeroGenere, projet_id: id, client_id: projet?.client_id || null, montant_ht: parseFloat(formFcli.montant_ht) || 0 }])
    if (error) { setError(error.message); setSavingFactureCli(false); return }
    setShowForm(false); setFormFcli({ numero: '', montant_ht: '', statut: 'À envoyer', date_facture: '', date_echeance: '', type_facture: 'avancement', paiement_comptant: false }); setFormFcliPct(''); setEcheanceFcliVerrouillee(true)
    const { data } = await supabase.from('factures_cli').select('*').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
    setFacturesCli(data || [])
    setSavingFactureCli(false)
  }

  // ── Édition inline factures clients / fournisseurs ─────────────
  // L'ERP reste la source : si la facture est déjà liée à Pennylane,
  // la sauvegarde locale pousse aussi la mise à jour là-bas.
  function getFacCliVal(f, champ) {
    if (facCliEditees[f.id] && facCliEditees[f.id][champ] !== undefined) return facCliEditees[f.id][champ]
    return f[champ] ?? ''
  }
  function editFacCli(fId, champ, valeur, facture) {
    setFacCliEditees(prev => {
      const courant = { ...(prev[fId] || {}), [champ]: valeur }
      // Modifier la date de facture recalcule l'échéance dans la foulée,
      // tant que cette facture n'a pas été déverrouillée pour une échéance
      // manuelle (voir editFacCliEcheance) — en respectant le paiement
      // comptant de cette facture si c'est une facture d'acompte réglée
      // comptant (voir formFcli.paiement_comptant / echeanceFcliAuto).
      if (champ === 'date_facture' && !echeanceCliDeverrouillees.has(fId)) {
        const comptant = facture?.type_facture === 'acompte' && facture?.paiement_comptant
        courant.date_echeance = comptant
          ? calculerEcheance(valeur, 0, false)
          : calculerEcheance(valeur, projet?.clients?.delai_paiement_jours ?? 30, projet?.clients?.delai_paiement_fin_mois ?? false)
      }
      return { ...prev, [fId]: courant }
    })
  }
  // Modification manuelle directe de l'échéance d'une facture existante —
  // demande une confirmation la première fois (par facture, par session),
  // même principe que editCmd/cmdDeverrouillees pour les commandes.
  function editFacCliEcheance(fId, valeur) {
    if (!echeanceCliDeverrouillees.has(fId)) {
      const ok = confirm('L\'échéance de cette facture est calculée automatiquement à partir des conditions de paiement du client. Voulez-vous la modifier manuellement ?')
      if (!ok) return
      setEcheanceCliDeverrouillees(prev => new Set(prev).add(fId))
    }
    editFacCli(fId, 'date_echeance', valeur)
  }
  async function saveFacCli(facture) {
    const changes = facCliEditees[facture.id]
    if (!changes) return
    const payload = { ...changes }
    if (changes.montant_ht !== undefined) payload.montant_ht = parseFloat(changes.montant_ht) || 0
    const { error } = await supabase.from('factures_cli').update(payload).eq('id', facture.id)
    if (error) { alert('Erreur lors de l\'enregistrement : ' + error.message); return }
    setFacCliEditees(prev => { const n = { ...prev }; delete n[facture.id]; return n })
    // Reverrouille l'échéance : une prochaine modification (même dans la
    // même session) redemandera confirmation, comme pour cmdDeverrouillees.
    setEcheanceCliDeverrouillees(prev => { const n = new Set(prev); n.delete(facture.id); return n })
    const { data } = await supabase.from('factures_cli').select('*').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
    setFacturesCli(data || [])

    if (facture.pennylane_invoice_id) {
      setPennylaneError(''); setPennylaneBusy(facture.id)
      try {
        await updateFactureClientPennylane({ ...facture, ...payload }, projet.nom)
        const { data: refreshed } = await supabase.from('factures_cli').select('*').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
        setFacturesCli(refreshed || [])
      } catch (err) {
        setPennylaneError('Mise à jour locale OK, mais échec de la synchro Pennylane : ' + err.message)
      }
      setPennylaneBusy(null)
    }
  }

  function getFacFrsVal(f, champ) {
    if (facFrsEditees[f.id] && facFrsEditees[f.id][champ] !== undefined) return facFrsEditees[f.id][champ]
    return f[champ] ?? ''
  }
  function editFacFrs(fId, champ, valeur) {
    setFacFrsEditees(prev => {
      const courant = { ...(prev[fId] || {}), [champ]: valeur }
      if (champ === 'date_facture' && !echeanceFrsDeverrouillees.has(fId)) {
        const frs = facturesFrs.find(f => f.id === fId)?.fournisseurs
        courant.date_echeance = calculerEcheance(valeur, frs?.delai_paiement_jours ?? 30, frs?.delai_paiement_fin_mois ?? false)
      }
      return { ...prev, [fId]: courant }
    })
  }
  // Modification manuelle directe de l'échéance d'une facture existante —
  // demande une confirmation la première fois (par facture, par session),
  // même principe que editCmd/cmdDeverrouillees pour les commandes.
  function editFacFrsEcheance(fId, valeur) {
    if (!echeanceFrsDeverrouillees.has(fId)) {
      const ok = confirm('L\'échéance de cette facture est calculée automatiquement à partir des conditions de paiement du fournisseur. Voulez-vous la modifier manuellement ?')
      if (!ok) return
      setEcheanceFrsDeverrouillees(prev => new Set(prev).add(fId))
    }
    editFacFrs(fId, 'date_echeance', valeur)
  }
  async function saveFacFrs(facture) {
    const changes = facFrsEditees[facture.id]
    if (!changes) return
    const payload = { ...changes }
    if (changes.montant_ht !== undefined) payload.montant_ht = parseFloat(changes.montant_ht) || 0
    const { error } = await supabase.from('factures_frs').update(payload).eq('id', facture.id)
    if (error) { alert('Erreur lors de l\'enregistrement : ' + error.message); return }
    setFacFrsEditees(prev => { const n = { ...prev }; delete n[facture.id]; return n })
    // Reverrouille l'échéance : une prochaine modification (même dans la
    // même session) redemandera confirmation, comme pour cmdDeverrouillees.
    setEcheanceFrsDeverrouillees(prev => { const n = new Set(prev); n.delete(facture.id); return n })
    const { data } = await supabase.from('factures_frs').select('*, fournisseurs(id, nom, email, rue, code_postal, ville, pays, pennylane_supplier_id), commandes(numero)').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
    setFacturesFrs(data || [])

    if (facture.pennylane_invoice_id) {
      setPennylaneError(''); setPennylaneBusy(facture.id)
      try {
        await updateFactureFrsPennylane({ ...facture, ...payload })
        const { data: refreshed } = await supabase.from('factures_frs').select('*, fournisseurs(id, nom, email, rue, code_postal, ville, pays, pennylane_supplier_id), commandes(numero)').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false })
        setFacturesFrs(refreshed || [])
      } catch (err) {
        setPennylaneError('Mise à jour locale OK, mais échec de la synchro Pennylane : ' + err.message)
      }
      setPennylaneBusy(null)
    }
  }

  async function supprimer(table, itemId) {
    if (!confirm('Supprimer ? (récupérable depuis la Corbeille)')) return
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', itemId)
    if (error) { alert('Erreur lors de la suppression : ' + error.message); return }
    if (table === 'commandes') { const { data } = await supabase.from('commandes').select('*, fournisseurs(nom)').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false }); setCommandes(data || []) }
    if (table === 'factures_frs') { const { data } = await supabase.from('factures_frs').select('*, fournisseurs(id, nom, email, rue, code_postal, ville, pays, pennylane_supplier_id), commandes(numero)').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false }); setFacturesFrs(data || []) }
    if (table === 'factures_cli') { const { data } = await supabase.from('factures_cli').select('*').eq('projet_id', id).is('deleted_at', null).order('created_at', { ascending: false }); setFacturesCli(data || []) }
  }

  const totalCommandes = commandes.reduce((s, c) => s + (c.montant_ht || 0), 0)
  const totalFfrs = facturesFrs.reduce((s, f) => s + (f.montant_ht || 0), 0)
  const totalFcli = facturesCli.reduce((s, f) => s + (f.montant_ht || 0), 0)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: colors.inkFaint }}>Chargement...</div>
  if (!projet) return <div style={{ padding: 40, textAlign: 'center', color: colors.danger }}>Projet introuvable</div>

  const lots = lignes.filter(l => l.type === 'lot')
  const lignesParLot = lignes.reduce((acc, l) => {
    if (l.type !== 'lot') { const lot = l.lot || 'sans'; if (!acc[lot]) acc[lot] = []; acc[lot].push(l) }
    return acc
  }, {})

  // ── Budgets prévisionnels du devis (lots + lignes sans lot), pour guider
  // la saisie des commandes fournisseurs et factures clients : combien a-t-on
  // prévu au devis, combien est déjà engagé/facturé, combien reste-t-il ?
  // Voir les encarts "Budget" dans les formulaires Commandes / Factures clients.
  // Options / variantes non retenues / texte n'entrent jamais dans les
  // totaux prévisionnels — voir ligneCompteDansTotal (lib/calculs.js).
  const lignesSansLotGlobal = lignes.filter(l => l.type === 'ligne' && !l.lot && ligneCompteDansTotal(l))
  const totalVenteGlobal = lots.reduce((s, l) => s + (l.total_ht || 0), 0) + lignesSansLotGlobal.reduce((s, l) => s + (l.total_ht || 0), 0)
  const totalAchatGlobal = lots.reduce((s, l) => s + (l.total_achat || 0), 0) + lignesSansLotGlobal.reduce((s, l) => s + (l.total_achat || 0), 0)
  // Une commande "Annulée" ne consomme pas le budget achat.
  const totalCommandesActives = commandes.filter(c => c.statut !== 'Annulée').reduce((s, c) => s + (c.montant_ht || 0), 0)
  const resteAchatDisponible = totalAchatGlobal - totalCommandesActives
  const resteAFacturer = totalVenteGlobal - totalFcli

  return (
    <div style={{ fontFamily: fonts.display, color: colors.ink, height: '100vh', display: 'flex', flexDirection: 'column', background: colors.bg }}>
      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      {/* Header */}
      <div style={{ background: colors.surface, borderBottom: '1px solid ' + colors.line, padding: isMobile ? '10px 14px' : '14px 24px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 8 : 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16 }}>
          <button onClick={() => navigate('/projets')} style={{ ...quietLink, flexShrink: 0 }}>← Projets</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: colors.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{projet.nom}</h1>
            <div style={{ fontSize: 12, color: colors.inkFaint, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {projet.clients?.nom || ''}
              {projet.date_debut ? ' · ' + fmtDate(projet.date_debut) + (projet.date_fin_prevue ? ' → ' + fmtDate(projet.date_fin_prevue) : '') : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, justifyContent: isMobile ? 'space-between' : 'flex-start' }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: colors.ink, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(projet.montant_ht)}</div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.inkMuted }}>
            <span style={marker(statutProjetMarker[projet.statut])} />{projet.statut}
          </span>
          <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
            <button onClick={() => generateDevisPDF('fr')} title="Devis PDF en français" style={quietLink}>Devis FR</button>
            <button onClick={() => generateDevisPDF('en')} title="Devis PDF in English" style={quietLink}>Devis EN</button>
            <button onClick={() => setConfirmDupliquerOuvert(true)} disabled={dupliquerBusy} title="Dupliquer ce projet (devis + lignes) pour en repartir" style={quietLink}>
              {dupliquerBusy ? 'Duplication...' : 'Dupliquer'}
            </button>
            {['Brouillon', 'Devis envoyé', 'Devis signé'].includes(projet.statut) && (
              <button onClick={marquerProjetPerdu} title="Marquer ce devis/projet comme perdu" style={{ ...quietLink, color: colors.danger, borderBottomColor: colors.danger }}>
                Marquer perdu
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation de duplication — modale "maison" plutôt que
          window.confirm(), voir le commentaire sur confirmDupliquerOuvert
          plus haut (contournement d'un blocage silencieux possible sous
          Safari). */}
      {confirmDupliquerOuvert && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.4)', zIndex: 200, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ background: colors.surface, padding: isMobile ? 20 : 28, width: isMobile ? '100%' : 460, maxWidth: '100%', boxSizing: 'border-box', border: '1px solid ' + colors.line }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>Dupliquer ce projet ?</h3>
            <p style={{ fontSize: 13, color: colors.inkMuted, marginBottom: 20 }}>
              Une nouvelle fiche « {projet.nom} (copie) » sera créée avec les mêmes lignes de devis (lots, lignes, titres) — hors commandes et factures.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDupliquerOuvert(false)} style={btnGhost}>Annuler</button>
              <button onClick={confirmerDuplication} disabled={dupliquerBusy}
                style={{ ...btnPrimary, cursor: dupliquerBusy ? 'default' : 'pointer', opacity: dupliquerBusy ? 0.7 : 1 }}>
                {dupliquerBusy ? 'Duplication...' : 'Dupliquer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale d'aperçu/édition avant envoi d'un email (facture client ou
          commande fournisseur, PDF joint) — voir ouvrirEnvoiFactureCli() /
          ouvrirEnvoiCommande() / envoyerEmailDepuisModal(). Placée hors des
          onglets pour rester visible quel que soit l'onglet actif. L'email
          ne part jamais tant qu'on n'a pas validé son contenu ici. */}
      {envoiEmailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ background: colors.surface, padding: 28, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', border: '1px solid ' + colors.line }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>
              {envoiEmailModal.type === 'facture_cli' ? 'Envoyer la facture par email' : 'Envoyer la commande par email'}
            </h3>

            {envoiEmailError && (
              <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 14, fontSize: 13 }}>
                {envoiEmailError}
              </div>
            )}

            <label style={fieldLabel}>À</label>
            <input value={envoiEmailModal.to} onChange={e => setEnvoiEmailModal(p => ({ ...p, to: e.target.value }))}
              style={{ ...inputUnderline, marginBottom: 14 }} />

            <label style={fieldLabel}>Objet</label>
            <input value={envoiEmailModal.subject} onChange={e => setEnvoiEmailModal(p => ({ ...p, subject: e.target.value }))}
              style={{ ...inputUnderline, marginBottom: 14 }} />

            <label style={fieldLabel}>Message</label>
            <textarea value={envoiEmailModal.body} onChange={e => setEnvoiEmailModal(p => ({ ...p, body: e.target.value }))} rows={9}
              style={{ ...inputUnderline, marginBottom: 10, resize: 'vertical' }} />

            {envoiEmailModal.attachment && (
              <div style={{ fontSize: 12, color: colors.inkMuted, marginBottom: 20 }}>
                Pièce jointe : {envoiEmailModal.attachment.name}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={creerBrouillonEmailDepuisModal} disabled={envoiEmailBusy || envoiEmailDraftBusy || !envoiEmailModal.to} style={quietLink}>
                {envoiEmailDraftBusy ? 'Création du brouillon...' : 'ou créer un brouillon dans Outlook'}
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setEnvoiEmailModal(null)} disabled={envoiEmailBusy} style={btnGhost}>Annuler</button>
                <button onClick={envoyerEmailDepuisModal} disabled={envoiEmailBusy || envoiEmailDraftBusy || !envoiEmailModal.to} style={btnPrimary}>
                  {envoiEmailBusy ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onglets */}
      <div style={{ background: colors.surface, borderBottom: '1px solid ' + colors.line, display: 'flex', paddingLeft: 16, overflowX: 'auto', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => {
              setTab(t.id); setShowForm(false); setError('')
              // Vide la sélection de lignes en quittant l'onglet Lignes,
              // pour ne pas retrouver une sélection obsolète (voire des id
              // de lignes qui n'existent plus) en y revenant plus tard.
              if (t.id !== 'lignes') setLignesSelectionnees(new Set())
            }}
            style={{ padding: '11px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', fontFamily: fonts.display,
              fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? colors.ink : colors.inkFaint,
              borderBottom: tab === t.id ? '2px solid ' + colors.ink : '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? 14 : 24 }}>

        {/* ── INFOS ── */}
        {tab === 'infos' && (
          <div style={{ maxWidth: 720 }}>
            <div style={{ background: colors.surface, border: '1px solid ' + colors.line }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid ' + colors.line, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={sectionTitle}>Informations du projet</div>
                {!editInfos && (
                  <button onClick={() => { setEditInfos(true); setInfosError(''); setFormInfos({ nom: projet.nom, statut: projet.statut, surface: projet.surface || '', adresse_chantier: projet.adresse_chantier || '', date_debut: projet.date_debut || '', date_fin_prevue: projet.date_fin_prevue || '', notes: projet.notes || '', acces_livraison: projet.acces_livraison || '', taux_tva: projet.taux_tva ?? 20, numero_bon_commande_client: projet.numero_bon_commande_client || '' }) }}
                    style={quietLink}>Modifier</button>
                )}
              </div>

              {/* Bandeau progression */}
            {projet.statut === 'Perdu' ? (
              <div style={{ borderLeft: '2px solid ' + colors.danger, padding: '16px 20px', margin: '0 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, color: colors.ink }}>
                  Ce devis/projet a été marqué comme <strong>perdu</strong> — il est sorti du flux actif.
                </div>
                <button onClick={reactiverProjetPerdu} style={quietLink}>
                  Réactiver (repasser en Brouillon)
                </button>
              </div>
            ) : (() => {
              const flux = ['Brouillon', 'Devis envoyé', 'Devis signé', 'En cours', 'Finalisation', 'Clôturé']
              const currentIdx = flux.indexOf(projet.statut)
              const nextStatut = flux[currentIdx + 1]
              const prevStatut = flux[currentIdx - 1]

              // Descriptions des preuves requises
              const preuves = {
                'Devis signé': { label: 'Uploader le devis signé', type: 'upload' },
                'En cours': { label: 'Renseigner la date de début de chantier', type: 'date' },
                'Finalisation': { label: 'Toutes les commandes doivent être en statut "Validée"', type: 'auto' },
                'Clôturé': { label: 'Toutes les factures clients doivent être "Payées"', type: 'auto' },
              }

              async function validerEtape() {
                setValidationError('')
                setValidating(true)
                const preuve = preuves[nextStatut]

                if (preuve?.type === 'upload') {
                  if (!validationDoc) { setValidationError('Veuillez uploader le devis signé.'); setValidating(false); return }
                  const fileName = Date.now() + '_' + validationDoc.name.replace(/[^a-zA-Z0-9._-]/g, '_')
                  const { error: uploadError } = await supabase.storage.from('documents').upload('projets/' + id + '/officiels/' + fileName, validationDoc)
                  if (uploadError) { setValidationError('Erreur upload : ' + uploadError.message); setValidating(false); return }
                  // Rafraîchir les docs officiels
                  const { data: newDocs } = await supabase.storage.from('documents').list('projets/' + id + '/officiels')
                  setDocuments(prev => ({ ...prev, officiels: newDocs || [] }))
                }

                if (preuve?.type === 'date') {
                  if (!validationDate) { setValidationError('Veuillez renseigner la date de début.'); setValidating(false); return }
                  const { error: dateError } = await supabase.from('projets').update({ date_debut: validationDate }).eq('id', id)
                  if (dateError) { setValidationError('Erreur : ' + dateError.message); setValidating(false); return }
                  setProjet(prev => ({ ...prev, date_debut: validationDate }))
                }

                if (preuve?.type === 'auto' && nextStatut === 'Finalisation') {
                  const cmdNonValidees = commandes.filter(c => c.statut !== 'Validée' && c.statut !== 'Annulée')
                  if (cmdNonValidees.length > 0) { setValidationError(cmdNonValidees.length + ' commande(s) ne sont pas encore en statut "Validée".'); setValidating(false); return }
                }

                if (preuve?.type === 'auto' && nextStatut === 'Clôturé') {
                  const factNonPayees = facturesCli.filter(f => f.statut !== 'Payée')
                  if (factNonPayees.length > 0) { setValidationError(factNonPayees.length + ' facture(s) client ne sont pas encore "Payées".'); setValidating(false); return }
                }

                const { error: statutError } = await supabase.from('projets').update({ statut: nextStatut }).eq('id', id)
                if (statutError) { setValidationError('Erreur : ' + statutError.message); setValidating(false); return }
                setProjet(prev => ({ ...prev, statut: nextStatut }))
                setShowValidation(false)
                setValidationDoc(null)
                setValidationDate('')
                setValidating(false)
              }

              return (
                <>
                {/* Modale de validation */}
                {showValidation && nextStatut && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.5)', zIndex: 200, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
                    <div style={{ background: colors.surface, padding: isMobile ? 20 : 28, width: isMobile ? '100%' : 460, maxWidth: '100%', maxHeight: isMobile ? '90vh' : 'none', overflow: 'auto', boxSizing: 'border-box', border: '1px solid ' + colors.line }}>
                      <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>Passer à : {nextStatut}</h3>
                      <p style={{ fontSize: 13, color: colors.inkMuted, marginBottom: 20 }}>
                        Pour valider ce changement d'étape, merci de fournir la preuve requise.
                      </p>

                      {validationError && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 14, fontSize: 13 }}>{validationError}</div>}

                      {preuves[nextStatut]?.type === 'upload' && (
                        <div style={{ marginBottom: 16 }}>
                          <label style={fieldLabel}>{preuves[nextStatut].label}</label>
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                            onChange={e => setValidationDoc(e.target.files[0])}
                            style={{ fontSize: 13, fontFamily: fonts.display }} />
                          {validationDoc && <div style={{ fontSize: 12, color: colors.success, marginTop: 6 }}>{validationDoc.name}</div>}
                        </div>
                      )}

                      {preuves[nextStatut]?.type === 'date' && (
                        <div style={{ marginBottom: 16 }}>
                          <label style={fieldLabel}>{preuves[nextStatut].label}</label>
                          <input type="date" value={validationDate} onChange={e => setValidationDate(e.target.value)}
                            style={inputUnderline} />
                        </div>
                      )}

                      {preuves[nextStatut]?.type === 'auto' && (
                        <div style={{ borderLeft: '2px solid ' + colors.line, padding: '8px 14px', marginBottom: 16, fontSize: 13, color: colors.inkMuted }}>
                          {preuves[nextStatut].label}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setShowValidation(false); setValidationError(''); setValidationDoc(null); setValidationDate('') }} style={btnGhost}>Annuler</button>
                        <button onClick={validerEtape} disabled={validating} style={btnPrimary}>
                          {validating ? '...' : 'Valider'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ background: colors.surface, borderBottom: '1px solid ' + colors.line, padding: '16px 20px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>Avancement du projet</div>
                    <div style={{ display: 'flex', gap: 18 }}>
                      {prevStatut && (
                        <button onClick={async () => {
                          if (!confirm('Revenir à "' + prevStatut + '" ?')) return
                          const { error } = await supabase.from('projets').update({ statut: prevStatut }).eq('id', id)
                          if (error) { alert('Erreur lors du changement de statut : ' + error.message); return }
                          setProjet(prev => ({ ...prev, statut: prevStatut }))
                        }} style={quietLink}>
                          ← Revenir
                        </button>
                      )}
                      {nextStatut && (
                        <button onClick={() => setShowValidation(true)} style={quietLink}>
                          Passer à : {nextStatut}
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    {flux.map((s, idx) => {
                      const done = idx <= currentIdx
                      const active = idx === currentIdx
                      return (
                        <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                            <div style={{ width: 24, height: 24, background: done ? colors.ink : colors.line, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, border: active ? '2px solid ' + colors.ink : 'none' }}>
                              <span style={{ color: done ? colors.surface : colors.inkFaint }}>{idx + 1}</span>
                            </div>
                            <div style={{ fontSize: 9, color: done ? colors.ink : colors.inkFaint, fontWeight: active ? 700 : 400, marginTop: 4, textAlign: 'center', whiteSpace: 'nowrap' }}>{s}</div>
                          </div>
                          {idx < flux.length - 1 && (
                            <div style={{ height: 1, flex: 0.5, background: idx < currentIdx ? colors.ink : colors.line, marginBottom: 16 }} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                </>
              )
            })()}

            {editInfos ? (
                <div style={{ padding: isMobile ? 14 : 20 }}>
                  {infosError && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 14, fontSize: 13 }}>{infosError}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={fieldLabel}>Nom du projet</label>
                      <input value={formInfos.nom || ''} onChange={e => setFormInfos(p => ({ ...p, nom: e.target.value }))}
                        style={inputUnderline} />
                    </div>
                    <div>
                      <label style={fieldLabel}>Statut</label>
                      <select value={formInfos.statut || ''} onChange={e => setFormInfos(p => ({ ...p, statut: e.target.value }))}
                        style={{ ...inputUnderline, cursor: 'pointer' }}>
                        {STATUTS_PROJET.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={fieldLabel}>Surface (m²)</label>
                      <input value={formInfos.surface || ''} onChange={e => setFormInfos(p => ({ ...p, surface: e.target.value }))} placeholder="465"
                        style={inputUnderline} />
                    </div>
                    <div>
                      <label style={fieldLabel}>Date début</label>
                      <input type="date" value={formInfos.date_debut || ''} onChange={e => setFormInfos(p => ({ ...p, date_debut: e.target.value }))}
                        style={inputUnderline} />
                    </div>
                    <div>
                      <label style={fieldLabel}>Date fin prévue</label>
                      <input type="date" value={formInfos.date_fin_prevue || ''} onChange={e => setFormInfos(p => ({ ...p, date_fin_prevue: e.target.value }))}
                        style={inputUnderline} />
                    </div>
                    <div>
                      <label style={fieldLabel}>TVA (devis / facture client)</label>
                      <select value={formInfos.taux_tva ?? 20} onChange={e => setFormInfos(p => ({ ...p, taux_tva: parseFloat(e.target.value) }))}
                        style={{ ...inputUnderline, cursor: 'pointer' }}>
                        {TAUX_TVA_OPTIONS.map(tx => <option key={tx} value={tx}>{tx === 0 ? '0 % (non applicable)' : tx + ' %'}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={fieldLabel}>Adresse chantier</label>
                      <input value={formInfos.adresse_chantier || ''} onChange={e => setFormInfos(p => ({ ...p, adresse_chantier: e.target.value }))} placeholder="12 rue de la Paix, 75001 Paris"
                        style={inputUnderline} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={fieldLabel}>Accès / Livraison</label>
                      <input value={formInfos.acces_livraison || ''} onChange={e => setFormInfos(p => ({ ...p, acces_livraison: e.target.value }))} placeholder="Livraison quai nord, accès badge..."
                        style={inputUnderline} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={fieldLabel}>N° bon de commande client</label>
                      <input value={formInfos.numero_bon_commande_client || ''} onChange={e => setFormInfos(p => ({ ...p, numero_bon_commande_client: e.target.value }))} placeholder="Ex : PO-2026-0142"
                        style={inputUnderline} />
                      <div style={{ fontSize: 11, color: colors.inkFaint, marginTop: 3 }}>Repris automatiquement sur toutes les factures clients générées pour ce projet.</div>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={fieldLabel}>Notes</label>
                      <textarea value={formInfos.notes || ''} onChange={e => setFormInfos(p => ({ ...p, notes: e.target.value }))} rows={3}
                        style={{ ...inputUnderline, resize: 'vertical' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => { setEditInfos(false); setInfosError('') }} style={btnGhost}>Annuler</button>
                    <button onClick={saveInfos} style={btnPrimary}>Sauvegarder</button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: isMobile ? 14 : 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px 32px' }}>
                    {[
                      ['Client', projet.clients?.nom],
                      ['Statut', projet.statut],
                      ['Surface', projet.surface ? projet.surface + ' m²' : null],
                      ['Montant HT', fmt(projet.montant_ht)],
                      ['TVA', (projet.taux_tva ?? 20) === 0 ? '0 % (non applicable)' : (projet.taux_tva ?? 20) + ' %'],
                      ['Date début', fmtDate(projet.date_debut)],
                      ['Date fin prévue', fmtDate(projet.date_fin_prevue)],
                      ['Adresse chantier', projet.adresse_chantier],
                      ['Accès / Livraison', projet.acces_livraison],
                      ['N° bon de commande client', projet.numero_bon_commande_client],
                    ].map(([label, value]) => value ? (
                      <div key={label}>
                        <div style={fieldLabel}>{label}</div>
                        <div style={{ fontSize: 14, color: colors.ink, fontWeight: 500 }}>{value}</div>
                      </div>
                    ) : null)}
                  </div>
                  {projet.notes && (
                    <div style={{ marginTop: 16, padding: '10px 14px', borderLeft: '2px solid ' + colors.line, fontSize: 13, color: colors.inkMuted }}>
                      {projet.notes}
                    </div>
                  )}
                  {projet.clients && (
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid ' + colors.line, fontSize: 13 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{projet.clients.nom}</div>
                      {projet.clients.email && <div style={{ color: colors.inkMuted }}>{projet.clients.email}</div>}
                      {projet.clients.telephone && <div style={{ color: colors.inkMuted }}>{projet.clients.telephone}</div>}
                      {projet.clients.adresse && <div style={{ color: colors.inkMuted }}>{projet.clients.adresse}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── LIGNES ── */}
        {tab === 'lignes' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                Lignes du projet
                {lignes.length > 0 && <span style={{ marginLeft: 8, fontSize: 13, color: colors.inkMuted, fontWeight: 400 }}>{lots.length} lots · {lignes.filter(l => l.type === 'ligne').length} lignes</span>}
              </div>
              <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                <button onClick={() => setShowAddLot(!showAddLot)} style={quietLink}>
                  + Nouveau lot
                </button>
                <button onClick={() => setShowAddLigne(!showAddLigne)} style={quietLink}>
                  + Ligne manuelle
                </button>
                <label style={{ ...btnPrimarySmall, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {importing ? 'Import...' : 'Importer Excel'}
                  <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportLignes} />
                </label>
              </div>
            </div>

            {importError && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{importError}</div>}

            {/* Barre d'action groupée — apparaît dès qu'au moins une ligne
                est cochée (checkbox dans la colonne N° de chaque tableau
                ci-dessous). Suppression groupée en un seul appel plutôt
                qu'un clic sur ✕ par ligne. */}
            {lignesSelectionnees.size > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '2px solid ' + colors.focus, padding: '9px 14px', marginBottom: 16, position: 'sticky', top: 0, zIndex: 5, background: colors.bg }}>
                <span style={{ fontSize: 13, color: colors.ink, fontWeight: 500 }}>
                  {lignesSelectionnees.size} ligne{lignesSelectionnees.size > 1 ? 's' : ''} sélectionnée{lignesSelectionnees.size > 1 ? 's' : ''}
                </span>
                <div style={{ display: 'flex', gap: 18 }}>
                  <button onClick={() => setLignesSelectionnees(new Set())} style={quietLink}>
                    Annuler
                  </button>
                  <button onClick={() => setConfirmSuppressionLignesOuvert(true)} style={{ ...quietLink, color: colors.danger, borderBottomColor: colors.danger }}>
                    Supprimer
                  </button>
                </div>
              </div>
            )}

            {/* Confirmation "maison" (voir confirmDupliquerOuvert plus haut
                pour la même logique anti-Safari) avant suppression groupée. */}
            {confirmSuppressionLignesOuvert && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.4)', zIndex: 200, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: 14 }}>
                <div style={{ background: colors.surface, padding: isMobile ? 20 : 28, width: isMobile ? '100%' : 460, maxWidth: '100%', boxSizing: 'border-box', border: '1px solid ' + colors.line }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>Supprimer {lignesSelectionnees.size} ligne{lignesSelectionnees.size > 1 ? 's' : ''} ?</h3>
                  <p style={{ fontSize: 13, color: colors.inkMuted, marginBottom: 20 }}>
                    Les lignes sélectionnées seront supprimées (récupérables depuis la Corbeille pendant 30 jours).
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => setConfirmSuppressionLignesOuvert(false)} disabled={suppressionLignesBusy} style={btnGhost}>
                      Annuler
                    </button>
                    <button onClick={supprimerLignesSelectionnees} disabled={suppressionLignesBusy}
                      style={{ background: colors.danger, color: colors.surface, border: 'none', padding: '9px 16px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer', fontWeight: 500, opacity: suppressionLignesBusy ? 0.7 : 1 }}>
                      {suppressionLignesBusy ? 'Suppression...' : 'Supprimer'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Formulaire nouveau lot — saisie libre (numéro + catégorie),
                utile quand le projet n'a pas encore de lots (ex. pas
                d'import Excel) et qu'il n'y a donc rien à choisir dans le
                menu déroulant "N° Lot" du formulaire de ligne. */}
            {showAddLot && (
              <div style={{ background: colors.surface, border: '1px solid ' + colors.line, padding: 20, marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Nouveau lot</h4>
                {lotError && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{lotError}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={fieldLabel}>N° Lot *</label>
                    <input value={formLot.numero} onChange={e => setFormLot(p => ({ ...p, numero: e.target.value }))} placeholder="Ex. 01"
                      style={inputUnderline} />
                  </div>
                  <div>
                    <label style={fieldLabel}>Catégorie *</label>
                    <input value={formLot.categorie} onChange={e => setFormLot(p => ({ ...p, categorie: e.target.value }))} placeholder="Ex. Électricité"
                      style={inputUnderline} />
                  </div>
                  <div>
                    <label style={fieldLabel}>Descriptif</label>
                    <input value={formLot.descriptif} onChange={e => setFormLot(p => ({ ...p, descriptif: e.target.value }))} placeholder="Optionnel"
                      style={inputUnderline} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setShowAddLot(false); setLotError(''); setFormLot({ numero: '', categorie: '', descriptif: '' }) }} style={btnGhost}>Annuler</button>
                  <button onClick={ajouterLot} disabled={savingLot} style={btnPrimary}>
                    {savingLot ? 'Création...' : 'Créer le lot'}
                  </button>
                </div>
              </div>
            )}

            {/* Formulaire ajout ligne manuelle */}
            {showAddLigne && (
              <div style={{ background: colors.surface, border: '1px solid ' + colors.line, padding: 20, marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Nouvelle ligne</h4>
                {ligneError && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{ligneError}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={fieldLabel}>N° Lot</label>
                    <select value={formLigne.lot} onChange={e => setFormLigne(p => ({ ...p, lot: e.target.value }))}
                      style={{ ...inputUnderline, cursor: 'pointer' }}>
                      <option value=''>— Sans lot —</option>
                      {lots.map(l => <option key={l.numero} value={l.numero}>LOT {l.numero} — {l.categorie}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '2 / -1' }}>
                    <label style={fieldLabel}>Désignation *</label>
                    <input value={formLigne.descriptif} onChange={e => setFormLigne(p => ({ ...p, descriptif: e.target.value }))}
                      placeholder="Description de la prestation"
                      style={inputUnderline} />
                  </div>
                  <div>
                    <label style={fieldLabel}>Unité</label>
                    <input value={formLigne.unite} onChange={e => setFormLigne(p => ({ ...p, unite: e.target.value }))} placeholder="m², ens, U..."
                      style={inputUnderline} />
                  </div>
                  <div>
                    <label style={fieldLabel}>Quantité</label>
                    <input type="number" min="0" value={formLigne.qte} onChange={e => setFormLigne(p => ({ ...p, qte: e.target.value }))} placeholder="1"
                      style={inputUnderline} />
                  </div>
                  {formLigne.nature === 'honoraire' ? (
                    <div>
                      <label style={fieldLabel}>Prix de vente HT (€) — sans achat</label>
                      <input type="number" min="0" value={formLigne.prix_vente_ht} onChange={e => setFormLigne(p => ({ ...p, prix_vente_ht: e.target.value }))} placeholder="0"
                        style={inputUnderline} />
                    </div>
                  ) : (<>
                    <div>
                      <label style={fieldLabel}>Prix achat HT (€)</label>
                      <input type="number" min="0" value={formLigne.prix_achat_ht} onChange={e => setFormLigne(p => ({ ...p, prix_achat_ht: e.target.value }))} placeholder="0"
                        style={inputUnderline} />
                    </div>
                    <div>
                      <label style={fieldLabel}>Coefficient</label>
                      <input type="number" min="0" value={formLigne.coeff} onChange={e => setFormLigne(p => ({ ...p, coeff: e.target.value }))} placeholder="1.30"
                        style={inputUnderline} />
                    </div>
                  </>)}
                  <div>
                    <label style={fieldLabel}>Nature</label>
                    <select value={formLigne.nature} onChange={e => setFormLigne(p => ({ ...p, nature: e.target.value }))}
                      style={{ ...inputUnderline, cursor: 'pointer' }}>
                      {NATURE_LIGNE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                {/* Preview du prix vente */}
                {formLigne.nature === 'honoraire' ? (
                  formLigne.prix_vente_ht && (
                    <div style={{ fontSize: 12, color: colors.success, marginBottom: 12, fontWeight: 500 }}>
                      → Prix vente HT : {parseFloat(formLigne.prix_vente_ht).toFixed(2)} €
                      {formLigne.qte ? ` · Total : ${(parseFloat(formLigne.qte) * parseFloat(formLigne.prix_vente_ht)).toFixed(2)} €` : ''} · sans achat (honoraire)
                    </div>
                  )
                ) : (
                  formLigne.prix_achat_ht && formLigne.coeff && (
                    <div style={{ fontSize: 12, color: colors.success, marginBottom: 12, fontWeight: 500 }}>
                      → Prix vente HT : {(parseFloat(formLigne.prix_achat_ht) * parseFloat(formLigne.coeff)).toFixed(2)} €
                      {formLigne.qte ? ` · Total : ${(parseFloat(formLigne.qte) * parseFloat(formLigne.prix_achat_ht) * parseFloat(formLigne.coeff)).toFixed(2)} €` : ''}
                    </div>
                  )
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setShowAddLigne(false)} style={btnGhost}>Annuler</button>
                  <button onClick={ajouterLigne} disabled={savingLigne} style={btnPrimary}>
                    {savingLigne ? '...' : '+ Ajouter'}
                  </button>
                </div>
              </div>
            )}

            {/* Sélecteur de mode de calcul */}
            <div style={{ display: 'flex', gap: 18, marginBottom: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: colors.inkMuted, fontWeight: 500 }}>Mode de calcul :</span>
              {[
                { id: 'achat_coeff', label: 'Achat × Coeff → Vente' },
                { id: 'vente_coeff', label: 'Vente ÷ Coeff → Achat' },
                { id: 'achat_vente', label: 'Vente ÷ Achat → Coeff' },
              ].map(m => (
                <button key={m.id} onClick={() => setModeCalc(m.id)}
                  style={{ background: 'none', border: 'none', padding: '0 0 3px', borderBottom: '1px solid ' + (modeCalc === m.id ? colors.ink : 'transparent'),
                    color: modeCalc === m.id ? colors.ink : colors.inkMuted,
                    cursor: 'pointer', fontSize: 12, fontFamily: fonts.display, fontWeight: modeCalc === m.id ? 600 : 400 }}>
                  {m.label}
                </button>
              ))}
            </div>

            {Object.keys(lignesEditees).length > 0 && (
              <div style={{ borderLeft: '2px solid ' + colors.warning, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <span style={{ fontSize: 13, color: colors.ink, fontWeight: 500 }}>{Object.keys(lignesEditees).length} ligne(s) modifiée(s) non sauvegardée(s)</span>
                <div style={{ display: 'flex', gap: 18 }}>
                  <button onClick={() => setLignesEditees({})} style={quietLink}>Annuler</button>
                  <button onClick={saveLignes} disabled={savingLignes} style={quietLink}>
                    {savingLignes ? 'Sauvegarde...' : 'Sauvegarder'}
                  </button>
                </div>
              </div>
            )}

            {lignes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line }}>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6, color: colors.ink }}>Aucune ligne</div>
                <div style={{ fontSize: 13 }}>Importe ton Excel (même format que le devis)</div>
              </div>
            ) : (<>
              {/* Récap global */}
              {(() => {
                // Inclure aussi les lignes sans lot — hors Options / variantes
                // non retenues / texte, voir ligneCompteDansTotal.
                const lignesSansLot = (lignesParLot['sans'] || []).filter(l => l.type === 'ligne' && ligneCompteDansTotal(l))
                const venteLotsOnly = lots.reduce((s, l) => s + (l.total_ht || 0), 0)
                const achatLotsOnly = lots.reduce((s, l) => s + (l.total_achat || 0), 0)
                const venteSansLot = lignesSansLot.reduce((s, l) => s + (l.total_ht || 0), 0)
                const achatSansLot = lignesSansLot.reduce((s, l) => s + (l.total_achat || 0), 0)
                const totalVenteGlobal = venteLotsOnly + venteSansLot
                const totalAchatGlobal = achatLotsOnly + achatSansLot
                const margeGlobal = totalVenteGlobal - totalAchatGlobal
                const tauxGlobal = totalVenteGlobal > 0 ? ((margeGlobal / totalVenteGlobal) * 100).toFixed(1) : 0
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid ' + colors.line }}>
                    {[
                      { label: 'Total Vente HT', value: totalVenteGlobal, color: colors.success },
                      { label: 'Total Achat HT', value: totalAchatGlobal, color: colors.focus },
                      { label: 'Marge brute', value: margeGlobal, color: margeGlobal >= 0 ? colors.success : colors.danger },
                      { label: 'Taux de marge', value: tauxGlobal + '%', color: ACCENT_MARGE, isText: true },
                    ].map(({ label, value, color, isText }) => (
                      <div key={label}>
                        <div style={eyebrow}>{label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 6, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{isText ? value : Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'}</div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {lots.map(lot => {
                const estReduit = lotsReduits[lot.numero]
                const totalVenteLot = lot.total_ht || 0
                const totalAchatLot = lot.total_achat || 0
                const margeLot = totalVenteLot - totalAchatLot
                // Lignes réellement sélectionnables de ce lot (les titres
                // n'ont pas de checkbox) — sert à la case "tout cocher" de
                // l'en-tête du tableau.
                const idsGroupeLot = (lignesParLot[lot.numero] || []).filter(l => l.type === 'ligne').map(l => l.id)
                const toutSelectionneLot = idsGroupeLot.length > 0 && idsGroupeLot.every(i => lignesSelectionnees.has(i))
                return (
                <div key={lot.numero} style={{ marginBottom: 12, border: '1px solid ' + colors.line }}>
                  <div onClick={() => setLotsReduits(prev => ({ ...prev, [lot.numero]: !prev[lot.numero] }))}
                    style={{ background: colors.bg, borderBottom: '1px solid ' + colors.line, color: colors.ink, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 14, color: colors.inkFaint, transition: 'transform 0.2s', display: 'inline-block', transform: estReduit ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>LOT {lot.numero} — {lot.categorie}{lot.descriptif ? ' · ' + lot.descriptif : ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: colors.success, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>Vente : {Number(totalVenteLot).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                      <span style={{ fontSize: 12, color: colors.focus, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>Achat : {Number(totalAchatLot).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                      <span style={{ fontSize: 12, color: margeLot >= 0 ? colors.success : colors.danger, fontWeight: 600, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>Marge : {Number(margeLot).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                      <button onClick={e => { e.stopPropagation(); ouvrirEditionLot(lot) }} title="Modifier ce lot (N°, catégorie, descriptif)" style={{ ...quietLink, padding: 0 }}>Modifier</button>
                      <button onClick={e => { e.stopPropagation(); supprimerLot(lot) }} title="Supprimer ce lot" style={{ ...quietLink, color: colors.danger, borderBottomColor: colors.danger, padding: 0 }}>Supprimer</button>
                    </div>
                  </div>
                  {lotEnEdition === lot.numero && (
                    <div style={{ background: colors.bg, borderBottom: '1px solid ' + colors.line, padding: 16 }}>
                      {lotEditError && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{lotEditError}</div>}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={fieldLabel}>N° Lot *</label>
                          <input value={formLotEdit.numero} onChange={e => setFormLotEdit(p => ({ ...p, numero: e.target.value }))}
                            style={inputUnderline} />
                        </div>
                        <div>
                          <label style={fieldLabel}>Catégorie *</label>
                          <input value={formLotEdit.categorie} onChange={e => setFormLotEdit(p => ({ ...p, categorie: e.target.value }))}
                            style={inputUnderline} />
                        </div>
                        <div>
                          <label style={fieldLabel}>Descriptif</label>
                          <input value={formLotEdit.descriptif} onChange={e => setFormLotEdit(p => ({ ...p, descriptif: e.target.value }))} placeholder="Optionnel"
                            style={inputUnderline} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={annulerEditionLot} disabled={savingLotEdit} style={btnGhost}>Annuler</button>
                        <button onClick={enregistrerEditionLot} disabled={savingLotEdit}
                          style={{ ...btnPrimary, cursor: savingLotEdit ? 'default' : 'pointer', opacity: savingLotEdit ? 0.7 : 1 }}>
                          {savingLotEdit ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                      </div>
                    </div>
                  )}
                  {!estReduit && <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: colors.bg, borderBottom: '1px solid ' + colors.line }}>
                        <th style={{ padding: '7px 10px', textAlign: 'left', color: colors.inkMuted, fontWeight: 500, width: 50 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {idsGroupeLot.length > 0 && (
                              <input type="checkbox" checked={toutSelectionneLot} onChange={() => toggleSelectionGroupe(idsGroupeLot)}
                                title="Tout sélectionner dans ce lot" style={{ cursor: 'pointer' }} />
                            )}
                            N°
                          </div>
                        </th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', color: colors.inkMuted, fontWeight: 500 }}>Désignation</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center', color: colors.inkMuted, fontWeight: 500, width: 50 }}>Unité</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: colors.inkMuted, fontWeight: 500, width: 50 }}>Qté</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: colors.success, fontWeight: 600, width: 95 }}>P.U. Vente</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: colors.success, fontWeight: 600, width: 100 }}>Total Vente</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: colors.inkMuted, fontWeight: 500, width: 60 }}>Coeff.</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: colors.focus, fontWeight: 600, width: 95 }}>P.U. Achat</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: colors.focus, fontWeight: 600, width: 100 }}>Total Achat</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center', color: colors.inkMuted, fontWeight: 500, width: 80 }}>Mode</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center', color: colors.inkMuted, fontWeight: 500, width: 110 }}>Nature</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(lignesParLot[lot.numero] || []).map((l, i) => {
                        const isEdited = !!lignesEditees[l.id]
                        const inputStyle = cellInput(isEdited)
                        if (l.type === 'titre') return (
                          <tr key={i} style={{ background: colors.bg }}>
                            <td style={{ padding: '6px 10px', color: colors.inkMuted, fontWeight: 600, fontSize: 11 }}>{l.numero}</td>
                            <td colSpan={10} style={{ padding: '6px 10px', color: colors.inkMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{l.descriptif}</td>
                          </tr>
                        )
                        const qte = parseFloat(getLigneVal(l, 'qte')) || 0
                        const puVente = parseFloat(getLigneVal(l, 'prix_unit_ht')) || 0
                        const puAchat = parseFloat(getLigneVal(l, 'prix_achat_ht')) || 0
                        const totalVente = qte * puVente
                        const totalAchat = qte * puAchat
                        const nature = getNatureEff(l)
                        // Une ligne Honoraire (vente seule) n'a pas de notion
                        // d'achat/coeff — le mode ac/vc/av choisi par
                        // l'utilisateur est ignoré, voir editLigne.
                        const estHonoraire = nature === 'honoraire'
                        const modeLocal = estHonoraire ? 'honoraire' : (modeLignes[l.id] || 'ac')
                        const compteDansTotal = nature !== 'option' && nature !== 'texte' && nature !== 'variante_inactive'
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid ' + colors.line, opacity: compteDansTotal ? 1 : 0.7 }}>
                            <td style={{ padding: '4px 6px', color: colors.inkFaint, whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <input type="checkbox" checked={lignesSelectionnees.has(l.id)} onChange={() => toggleLigneSelection(l.id)}
                                  style={{ cursor: 'pointer' }} />
                                <span style={{ fontSize: 11 }}>{l.numero}</span>
                                <button onClick={() => supprimerLigne(l.id)}
                                  style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1, opacity: 0.6 }}
                                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                  onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>✕</button>
                              </div>
                            </td>
                            <td style={{ padding: '4px 6px', color: colors.ink }}>
                              <input value={getLigneVal(l, 'descriptif')} title={getLigneVal(l, 'descriptif')} onChange={e => editLigne(l.id, 'descriptif', e.target.value, l)}
                                style={{ ...inputStyle, textAlign: 'left' }} />
                            </td>
                            <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                              <input value={getLigneVal(l, 'unite')} onChange={e => editLigne(l.id, 'unite', e.target.value, l)}
                                style={{ ...inputStyle, width: 44, textAlign: 'center' }} />
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              <input type="number" min="0" value={getLigneVal(l, 'qte')} onChange={e => editLigne(l.id, 'qte', e.target.value, l)}
                                style={inputStyle} />
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              {/* P.U. Vente — bloqué en mode A×C (calculé) */}
                              {modeLocal === 'ac' ? (
                                <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: colors.inkFaint }}>
                                  {getLigneVal(l, 'prix_unit_ht') || '—'}
                                </div>
                              ) : (
                                <input type="number" min="0" value={getLigneVal(l, 'prix_unit_ht')} onChange={e => editLigne(l.id, 'prix_unit_ht', e.target.value, l)}
                                  style={{ ...inputStyle, color: colors.success }} />
                              )}
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: totalVente > 0 ? colors.success : colors.inkFaint, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
                              {totalVente > 0 ? Number(totalVente).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              {/* Coeff — sans objet pour une ligne Honoraire, bloqué en mode V÷A (calculé) */}
                              {estHonoraire ? (
                                <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: colors.inkFaint }}>—</div>
                              ) : modeLocal === 'av' ? (
                                <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: colors.inkFaint }}>
                                  {getLigneVal(l, 'coeff') || '—'}
                                </div>
                              ) : (
                                <input type="number" min="0" value={getLigneVal(l, 'coeff')} onChange={e => editLigne(l.id, 'coeff', e.target.value, l)}
                                  style={{ ...inputStyle, color: ACCENT_MARGE }} />
                              )}
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              {/* P.U. Achat — sans objet pour une ligne Honoraire, bloqué en mode V÷C (calculé) */}
                              {estHonoraire ? (
                                <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: colors.inkFaint }}>—</div>
                              ) : modeLocal === 'vc' ? (
                                <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: colors.inkFaint }}>
                                  {getLigneVal(l, 'prix_achat_ht') || '—'}
                                </div>
                              ) : (
                                <input type="number" min="0" value={getLigneVal(l, 'prix_achat_ht')} onChange={e => editLigne(l.id, 'prix_achat_ht', e.target.value, l)}
                                  style={{ ...inputStyle, color: colors.focus }} />
                              )}
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: totalAchat > 0 ? colors.focus : colors.inkFaint, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
                              {estHonoraire ? '—' : totalAchat > 0 ? Number(totalAchat).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </td>
                            <td style={{ padding: '4px 4px', whiteSpace: 'nowrap' }}>
                              {estHonoraire ? (
                                <span style={{ fontSize: 10, color: colors.inkFaint }} title="Ligne Honoraire : vente seule, sans achat">vente seule</span>
                              ) : (
                                <div style={{ display: 'flex', gap: 8 }}>
                                  {[['ac', 'A×C'], ['vc', 'V÷C'], ['av', 'V÷A']].map(([mode, label]) => (
                                    <button key={mode} onClick={() => setModeLignes(prev => ({ ...prev, [l.id]: mode }))}
                                      style={{ background: 'none', border: 'none', padding: '0 0 2px', borderBottom: '1px solid ' + (modeLocal === mode ? colors.ink : 'transparent'),
                                        color: modeLocal === mode ? colors.ink : colors.inkFaint,
                                        cursor: 'pointer', fontSize: 10, fontFamily: fonts.display, fontWeight: modeLocal === mode ? 600 : 400 }}>
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              <select value={nature} onChange={e => editLigneNature(l.id, e.target.value)} title="Nature de la ligne — pilote si elle compte dans le total du devis"
                                style={{ width: '100%', padding: '3px 4px', border: 'none', borderBottom: '1px solid ' + (compteDansTotal ? colors.line : colors.warning), fontSize: 10, cursor: 'pointer', background: 'transparent', color: colors.ink, fontFamily: fonts.display }}>
                                {NATURE_LIGNE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.shortLabel}</option>)}
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>}
                </div>
              )
              })}
              {/* Lignes sans lot */}
              {(lignesParLot['sans'] || []).filter(l => l.type === 'ligne' || l.type === 'titre').length > 0 && (
                <div style={{ marginBottom: 12, border: '1px solid ' + colors.line }}>
                  <div style={{ background: colors.bg, borderBottom: '1px solid ' + colors.line, color: colors.ink, padding: '10px 16px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Lignes sans lot</span>
                    <span style={{ fontSize: 12, color: colors.success, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
                      Vente : {Number((lignesParLot['sans'] || []).filter(l => l.type === 'ligne' && ligneCompteDansTotal(l)).reduce((s, l) => s + (l.total_ht || 0), 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: colors.bg, borderBottom: '1px solid ' + colors.line }}>
                        <th style={{ padding: '7px 10px', textAlign: 'left', color: colors.inkMuted, fontWeight: 500, width: 50 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {(() => {
                              const idsGroupeSansLot = (lignesParLot['sans'] || []).filter(l => l.type === 'ligne').map(l => l.id)
                              if (idsGroupeSansLot.length === 0) return null
                              const toutSelectionne = idsGroupeSansLot.every(i => lignesSelectionnees.has(i))
                              return <input type="checkbox" checked={toutSelectionne} onChange={() => toggleSelectionGroupe(idsGroupeSansLot)}
                                title="Tout sélectionner" style={{ cursor: 'pointer' }} />
                            })()}
                            N°
                          </div>
                        </th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', color: colors.inkMuted, fontWeight: 500 }}>Désignation</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center', color: colors.inkMuted, fontWeight: 500, width: 50 }}>Unité</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: colors.inkMuted, fontWeight: 500, width: 50 }}>Qté</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: colors.success, fontWeight: 600, width: 95 }}>P.U. Vente</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: colors.success, fontWeight: 600, width: 100 }}>Total Vente</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: colors.inkMuted, fontWeight: 500, width: 60 }}>Coeff.</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: colors.focus, fontWeight: 600, width: 95 }}>P.U. Achat</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: colors.focus, fontWeight: 600, width: 100 }}>Total Achat</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center', color: colors.inkMuted, fontWeight: 500, width: 80 }}>Mode</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center', color: colors.inkMuted, fontWeight: 500, width: 110 }}>Nature</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(lignesParLot['sans'] || []).map((l, i) => {
                        const isEdited = !!lignesEditees[l.id]
                        const inputStyle = cellInput(isEdited)
                        if (l.type === 'titre') return (
                          <tr key={i} style={{ background: colors.bg }}>
                            <td style={{ padding: '6px 10px', color: colors.inkMuted, fontWeight: 600, fontSize: 11 }}>{l.numero}</td>
                            <td colSpan={10} style={{ padding: '6px 10px', color: colors.inkMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{l.descriptif}</td>
                          </tr>
                        )
                        const qte = parseFloat(getLigneVal(l, 'qte')) || 0
                        const puVente = parseFloat(getLigneVal(l, 'prix_unit_ht')) || 0
                        const puAchat = parseFloat(getLigneVal(l, 'prix_achat_ht')) || 0
                        const totalVente = qte * puVente
                        const totalAchat = qte * puAchat
                        const nature = getNatureEff(l)
                        // Une ligne Honoraire (vente seule) n'a pas de notion
                        // d'achat/coeff — le mode ac/vc/av choisi par
                        // l'utilisateur est ignoré, voir editLigne.
                        const estHonoraire = nature === 'honoraire'
                        const modeLocal = estHonoraire ? 'honoraire' : (modeLignes[l.id] || 'ac')
                        const compteDansTotal = nature !== 'option' && nature !== 'texte' && nature !== 'variante_inactive'
                        return (
                          <>
                          <tr key={i} style={{ borderBottom: '1px solid ' + colors.line, opacity: compteDansTotal ? 1 : 0.7 }}>
                            <td style={{ padding: '4px 6px', color: colors.inkFaint, whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <input type="checkbox" checked={lignesSelectionnees.has(l.id)} onChange={() => toggleLigneSelection(l.id)}
                                  style={{ cursor: 'pointer' }} />
                                <span style={{ fontSize: 11 }}>{l.numero}</span>
                                <button onClick={() => supprimerLigne(l.id)} style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: 11, padding: '0 2px', opacity: 0.6 }}
                                  onMouseEnter={e => e.currentTarget.style.opacity='1'} onMouseLeave={e => e.currentTarget.style.opacity='0.6'}>✕</button>
                              </div>
                            </td>
                            <td style={{ padding: '4px 6px', color: colors.ink }}>
                              <input value={getLigneVal(l, 'descriptif')} title={getLigneVal(l, 'descriptif')} onChange={e => editLigne(l.id, 'descriptif', e.target.value, l)}
                                style={{ ...inputStyle, textAlign: 'left' }} />
                            </td>
                            <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                              <input value={getLigneVal(l, 'unite')} onChange={e => editLigne(l.id, 'unite', e.target.value, l)}
                                style={{ ...inputStyle, width: 44, textAlign: 'center' }} />
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              <input type="number" min="0" value={getLigneVal(l, 'qte')} onChange={e => editLigne(l.id, 'qte', e.target.value, l)}
                                style={inputStyle} />
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              {modeLocal === 'ac' ? <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: colors.inkFaint }}>{getLigneVal(l, 'prix_unit_ht') || '—'}</div>
                              : <input type="number" min="0" value={getLigneVal(l, 'prix_unit_ht')} onChange={e => editLigne(l.id, 'prix_unit_ht', e.target.value, l)} style={{ ...inputStyle, color: colors.success }} />}
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: totalVente > 0 ? colors.success : colors.inkFaint, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
                              {totalVente > 0 ? Number(totalVente).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              {estHonoraire ? <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: colors.inkFaint }}>—</div>
                              : modeLocal === 'av' ? <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: colors.inkFaint }}>{getLigneVal(l, 'coeff') || '—'}</div>
                              : <input type="number" min="0" value={getLigneVal(l, 'coeff')} onChange={e => editLigne(l.id, 'coeff', e.target.value, l)} style={{ ...inputStyle, color: ACCENT_MARGE }} />}
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              {estHonoraire ? <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: colors.inkFaint }}>—</div>
                              : modeLocal === 'vc' ? <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: colors.inkFaint }}>{getLigneVal(l, 'prix_achat_ht') || '—'}</div>
                              : <input type="number" min="0" value={getLigneVal(l, 'prix_achat_ht')} onChange={e => editLigne(l.id, 'prix_achat_ht', e.target.value, l)} style={{ ...inputStyle, color: colors.focus }} />}
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: totalAchat > 0 ? colors.focus : colors.inkFaint, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
                              {estHonoraire ? '—' : totalAchat > 0 ? Number(totalAchat).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </td>
                            <td style={{ padding: '4px 4px', whiteSpace: 'nowrap' }}>
                              {estHonoraire ? (
                                <span style={{ fontSize: 10, color: colors.inkFaint }} title="Ligne Honoraire : vente seule, sans achat">vente seule</span>
                              ) : (
                                <div style={{ display: 'flex', gap: 8 }}>
                                  {[['ac', 'A×C'], ['vc', 'V÷C'], ['av', 'V÷A']].map(([mode, label]) => (
                                    <button key={mode} onClick={() => setModeLignes(prev => ({ ...prev, [l.id]: mode }))}
                                      style={{ background: 'none', border: 'none', padding: '0 0 2px', borderBottom: '1px solid ' + (modeLocal === mode ? colors.ink : 'transparent'), color: modeLocal === mode ? colors.ink : colors.inkFaint, cursor: 'pointer', fontSize: 10, fontFamily: fonts.display, fontWeight: modeLocal === mode ? 600 : 400 }}>
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              <select value={nature} onChange={e => editLigneNature(l.id, e.target.value)} title="Nature de la ligne — pilote si elle compte dans le total du devis"
                                style={{ width: '100%', padding: '3px 4px', border: 'none', borderBottom: '1px solid ' + (compteDansTotal ? colors.line : colors.warning), fontSize: 10, cursor: 'pointer', background: 'transparent', color: colors.ink, fontFamily: fonts.display }}>
                                {NATURE_LIGNE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.shortLabel}</option>)}
                              </select>
                            </td>
                          </tr>
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>)}
          </div>
        )}

        {/* ── COMMANDES ── */}
        {tab === 'commandes' && (
          <div>
            {/* PDF Preview Modal */}
            {showPdfPreview && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: colors.surface, padding: 28, width: 520, border: '1px solid ' + colors.line }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Aperçu — {showPdfPreview.numero}</h3>
                  <div style={{ borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line, padding: '16px 0', marginBottom: 20, fontSize: 13, lineHeight: 1.7 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                      <div><div style={fieldLabel}>N° Commande</div><div style={{ fontWeight: 600 }}>{showPdfPreview.numero}</div></div>
                      <div><div style={fieldLabel}>Date</div><div>{fmtDate(showPdfPreview.date_commande)}</div></div>
                      <div><div style={fieldLabel}>Fournisseur</div><div style={{ fontWeight: 600 }}>{showPdfPreview.fournisseurs?.nom || '—'}</div></div>
                      <div><div style={fieldLabel}>Montant HT</div><div style={{ fontWeight: 700, color: colors.success, fontSize: 15, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(showPdfPreview.montant_ht)}</div></div>
                      <div><div style={fieldLabel}>TVA</div><div>{showPdfPreview.regime_tva === 'autoliquidation' ? 'Autoliquidation (0 %)' : 'Normale (20 %)'}</div></div>
                    </div>
                    <div><div style={fieldLabel}>Description</div><div style={{ color: colors.ink }}>{showPdfPreview.description}</div></div>
                    <div style={{ marginTop: 12 }}><div style={fieldLabel}>Projet</div><div>{projet?.nom}</div></div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowPdfPreview(null)} style={btnGhost}>Fermer</button>
                    <button onClick={() => { generateCmdPDF(showPdfPreview, 'fr').save((showPdfPreview.numero || 'commande') + '.pdf'); setShowPdfPreview(null) }} style={btnPrimary}>
                      PDF FR
                    </button>
                    <button onClick={() => { generateCmdPDF(showPdfPreview, 'en').save((showPdfPreview.numero || 'commande') + '_EN.pdf'); setShowPdfPreview(null) }} style={btnPrimary}>
                      PDF EN
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Commandes fournisseurs · <span style={{ color: colors.focus, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalCommandes)}</span></div>
              <button onClick={() => { setShowForm(true); setError('');
                setFormCmd({ fournisseur_id: '', numero: genNumeroCommande(projet, commandes), description: '', montant_ht: '', statut: 'Brouillon', date_commande: new Date().toISOString().split('T')[0], regime_tva: 'normale' }) }}
                style={btnPrimary}>
                + Nouvelle commande
              </button>
            </div>

            {showForm && (
              <div style={{ background: colors.surface, padding: 20, border: '1px solid ' + colors.line, marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Nouvelle commande</h4>
                {error && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{error}</div>}
                {(() => {
                  const saisie = parseFloat(formCmd.montant_ht) || 0
                  const resteApres = resteAchatDisponible - saisie
                  return (
                    <div style={{ borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line, padding: '12px 0', marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      <div>
                        <div style={fieldLabel}>Budget achat (devis)</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalAchatGlobal)}</div>
                      </div>
                      <div>
                        <div style={fieldLabel}>Déjà commandé</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: colors.focus, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalCommandesActives)}</div>
                      </div>
                      <div>
                        <div style={fieldLabel}>{saisie > 0 ? 'Reste après cette commande' : 'Reste disponible'}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: resteApres >= 0 ? colors.success : colors.danger, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(resteApres)}</div>
                      </div>
                      {resteApres < 0 && (
                        <div style={{ gridColumn: '1 / -1', fontSize: 11, color: colors.danger, marginTop: 2 }}>
                          Ce montant dépasse le budget achat prévu au devis de {fmt(Math.abs(resteApres))}.
                        </div>
                      )}
                    </div>
                  )
                })()}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={fieldLabel}>Fournisseur</label>
                    <select value={formCmd.fournisseur_id} onChange={e => setFormCmd(p => ({ ...p, fournisseur_id: e.target.value }))}
                      style={{ ...inputUnderline, cursor: 'pointer' }}>
                      <option value=''>— Aucun —</option>
                      {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={fieldLabel}>N° commande (auto)</label>
                    <input value={formCmd.numero} onChange={e => setFormCmd(p => ({ ...p, numero: e.target.value }))}
                      style={inputUnderline} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label style={{ ...fieldLabel, marginBottom: 0 }}>Description *</label>
                      <button onClick={() => setShowLignesSelector(!showLignesSelector)} style={quietLink}>
                        Depuis lignes projet
                      </button>
                    </div>
                    {showLignesSelector && (
                      <div style={{ border: '1px solid ' + colors.line, padding: 10, marginBottom: 8, maxHeight: 200, overflow: 'auto' }}>
                        <div style={{ fontSize: 11, color: colors.inkMuted, marginBottom: 6 }}>Cliquer sur un lot ou une ligne pour l'utiliser :</div>
                        {lignes.filter(l => l.type === 'lot').map(lot => (
                          <div key={lot.id}>
                            <div onClick={() => { setFormCmd(p => ({ ...p, description: 'LOT ' + lot.numero + ' — ' + (lot.categorie || '') + (lot.descriptif ? ' · ' + lot.descriptif : ''), montant_ht: lot.total_achat || lot.total_ht || '' })); setShowLignesSelector(false) }}
                              style={{ padding: '5px 8px', cursor: 'pointer', fontWeight: 600, fontSize: 12, color: colors.ink, background: colors.neutralChip, marginBottom: 2 }}>
                              LOT {lot.numero} — {lot.categorie} · {lot.total_achat > 0 ? Number(lot.total_achat).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <input value={formCmd.description} onChange={e => setFormCmd(p => ({ ...p, description: e.target.value }))} placeholder="Ex: Cloisons vitrées lot 3"
                      style={inputUnderline} />
                  </div>
                  <div>
                    <label style={fieldLabel}>Montant HT (€)</label>
                    <input type="number" min="0" value={formCmd.montant_ht} onChange={e => setFormCmd(p => ({ ...p, montant_ht: e.target.value }))}
                      style={inputUnderline} />
                  </div>
                  <div>
                    <label style={fieldLabel}>Date commande</label>
                    <input type="date" value={formCmd.date_commande} onChange={e => setFormCmd(p => ({ ...p, date_commande: e.target.value }))}
                      style={inputUnderline} />
                  </div>
                  <div>
                    <label style={fieldLabel}>Statut</label>
                    <select value={formCmd.statut} onChange={e => setFormCmd(p => ({ ...p, statut: e.target.value }))}
                      style={{ ...inputUnderline, cursor: 'pointer' }}>
                      {STATUTS_CMD.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={fieldLabel}>TVA</label>
                    <select value={formCmd.regime_tva || 'normale'} onChange={e => setFormCmd(p => ({ ...p, regime_tva: e.target.value }))}
                      title="Autoliquidation : le fournisseur facture hors taxe, vous déclarez la TVA vous-même (sous-traitance BTP, article 283 du CGI)."
                      style={{ ...inputUnderline, cursor: 'pointer' }}>
                      <option value="normale">Normale (20 %)</option>
                      <option value="autoliquidation">Autoliquidation (sous-traitance BTP)</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowForm(false); setError(''); setShowLignesSelector(false) }} style={btnGhost}>Annuler</button>
                  <button onClick={ajouterCommande} disabled={savingCmd} style={btnPrimary}>{savingCmd ? 'Création...' : 'Créer la commande'}</button>
                </div>
              </div>
            )}

            {commandes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: colors.ink }}>Aucune commande</div>
              </div>
            ) : (
              <div style={{ background: colors.surface, border: '1px solid ' + colors.line, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: colors.bg, borderBottom: '1px solid ' + colors.line }}>
                      {['Code CF', 'Statut', 'Date', 'Fournisseur', 'Description', 'Achat HT', 'TVA', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Achat HT' ? 'right' : 'left', color: colors.inkMuted, fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {commandes.map((c) => {
                      const isEdited = !!cmdEditees[c.id]
                      const inStyle = cellInput(isEdited)
                      return (
                        <>
                        <tr key={c.id} id={'row-' + c.id} style={{ borderBottom: '1px solid ' + colors.line, borderLeft: c.id === focusId ? '2px solid ' + colors.focus : 'none' }}>
                          <td style={{ padding: '8px 14px', fontWeight: 600, color: colors.ink, fontSize: 12, whiteSpace: 'nowrap' }}>
                            <input value={getCmdVal(c, 'numero')} onChange={e => editCmd(c.id, 'numero', e.target.value)}
                              style={{ ...inStyle, width: 140, fontWeight: 600, color: colors.ink }} />
                          </td>
                          <td style={{ padding: '8px 14px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.inkMuted }}>
                              <span style={marker(STATUT_COMMANDE_MARKER[getCmdVal(c, 'statut')])} />
                              <select value={getCmdVal(c, 'statut')} onChange={e => { editCmd(c.id, 'statut', e.target.value) }}
                                style={{ border: 'none', background: 'transparent', fontSize: 11, cursor: 'pointer', color: colors.inkMuted, fontFamily: fonts.display }}
                                title={c.statut === 'Validée' ? 'Commande validée — une confirmation sera demandée avant modification' : ''}>
                                {STATUTS_CMD.map(s => <option key={s}>{s}</option>)}
                              </select>
                            </span>
                          </td>
                          <td style={{ padding: '8px 14px', color: colors.inkFaint, whiteSpace: 'nowrap' }}>
                            <input type="date" value={getCmdVal(c, 'date_commande')} onChange={e => editCmd(c.id, 'date_commande', e.target.value)}
                              style={{ ...inStyle, width: 120, color: colors.inkMuted }} />
                          </td>
                          <td style={{ padding: '8px 14px' }}>
                            <select value={getCmdVal(c, 'fournisseur_id') || ''} onChange={e => editCmd(c.id, 'fournisseur_id', e.target.value)}
                              style={{ ...inStyle, width: 160, cursor: 'pointer' }}>
                              <option value=''>— Aucun —</option>
                              {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '8px 14px' }}>
                            <input value={getCmdVal(c, 'description')} onChange={e => editCmd(c.id, 'description', e.target.value)}
                              style={{ ...inStyle, minWidth: 200 }} />
                          </td>
                          <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                            <input type="number" min="0" value={getCmdVal(c, 'montant_ht')} onChange={e => editCmd(c.id, 'montant_ht', e.target.value)}
                              style={{ ...inStyle, width: 100, textAlign: 'right', fontWeight: 600, color: colors.ink, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }} />
                          </td>
                          <td style={{ padding: '8px 14px' }}>
                            <select value={getCmdVal(c, 'regime_tva') || 'normale'} onChange={e => editCmd(c.id, 'regime_tva', e.target.value)}
                              title="Autoliquidation : le fournisseur facture hors taxe, vous déclarez la TVA vous-même (sous-traitance BTP, article 283 du CGI)."
                              style={{ border: 'none', borderBottom: '1px solid ' + (getCmdVal(c, 'regime_tva') === 'autoliquidation' ? colors.warning : 'transparent'), background: 'transparent', fontSize: 11, cursor: 'pointer', padding: '3px 2px', fontFamily: fonts.display,
                                color: getCmdVal(c, 'regime_tva') === 'autoliquidation' ? colors.warning : colors.inkMuted }}>
                              <option value="normale">Normale</option>
                              <option value="autoliquidation">Autoliq.</option>
                            </select>
                          </td>
                          <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                              {isEdited && (
                                <button onClick={() => saveCmd(c.id)} style={quietLink}>Enregistrer</button>
                              )}
                              <button onClick={() => setShowPdfPreview({ ...c, ...cmdEditees[c.id], fournisseurs: fournisseurs.find(f => f.id === (cmdEditees[c.id]?.fournisseur_id || c.fournisseur_id)) })}
                                style={quietLink}>PDF</button>
                              {c.statut === 'Validée' && (
                                <button onClick={() => ouvrirEnvoiCommande(c)} title="Envoyer la commande par email (PDF joint)" style={quietLink}>Envoyer</button>
                              )}
                              <button onClick={() => { if (expandedCmd === c.id) { setExpandedCmd(null) } else { setExpandedCmd(c.id); fetchCmdDocs(c.id) } }} style={{ ...quietLink, color: ACCENT_MARGE, borderBottomColor: ACCENT_MARGE }}>
                                Pièces{cmdDocs[c.id]?.length > 0 ? ' (' + cmdDocs[c.id].length + ')' : ''}
                              </button>
                              <button onClick={() => supprimer('commandes', c.id)} style={{ ...quietLink, color: colors.danger, borderBottomColor: colors.danger }}>Supprimer</button>
                            </div>
                          </td>
                        </tr>
                        {/* Zone documents commande */}
                        {expandedCmd === c.id && (
                          <tr key={c.id + '_docs'} style={{ background: colors.bg }}>
                            <td colSpan={8} style={{ padding: '12px 20px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: ACCENT_MARGE }}>Pièces jointes — {c.numero}</span>
                                <label style={{ ...quietLink, cursor: 'pointer' }}>
                                  {uploadingDoc === c.id ? '...' : '+ Ajouter'}
                                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }}
                                    onChange={async (e) => {
                                      const file = e.target.files[0]; if (!file) return
                                      setUploadingDoc(c.id)
                                      await uploadDoc(file, 'commandes/' + c.id, () => fetchCmdDocs(c.id))
                                      setUploadingDoc(null)
                                      e.target.value = ''
                                    }} />
                                </label>
                              </div>
                              {!cmdDocs[c.id] || cmdDocs[c.id].length === 0 ? (
                                <div style={{ fontSize: 12, color: colors.inkFaint, fontStyle: 'italic' }}>Aucun document — ajoutez le devis fournisseur, bon de livraison...</div>
                              ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                                  {cmdDocs[c.id].map(doc => (
                                    <div key={doc.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 12 }}>
                                      <a href={getDocUrl('commandes/' + c.id + '/' + doc.name)} target="_blank" rel="noopener noreferrer" style={{ ...quietLink, color: ACCENT_MARGE, borderBottomColor: ACCENT_MARGE, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {doc.name.replace(/^\d+_/, '')}
                                      </a>
                                      <button onClick={() => deleteCmdDoc(c.id, 'commandes/' + c.id + '/' + doc.name)}
                                        style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── FACTURES FRS ── */}
        {tab === 'factures_frs' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Factures fournisseurs · <span style={{ color: colors.warning, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalFfrs)}</span></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={verifierQontoFrs} disabled={rapprochementBusy === 'frs'} style={btnGhost}>
                  {rapprochementBusy === 'frs' ? 'Vérification...' : 'Vérifier sur Qonto'}
                </button>
                <button onClick={() => { setShowForm(true); setError(''); setEcheanceFfrsVerrouillee(true) }} style={btnPrimary}>+ Nouvelle facture</button>
              </div>
            </div>
            {rapprochementError && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{rapprochementError}</div>}
            {suggestionsQontoFrs.length > 0 && (
              <div style={{ borderLeft: '2px solid ' + colors.warning, padding: '10px 14px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 8 }}>Correspondances Qonto à valider ({suggestionsQontoFrs.length})</div>
                {suggestionsQontoFrs.map(r => (
                  <div key={r.facture.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid ' + colors.line }}>
                    <div style={{ fontSize: 12 }}>
                      <strong>{r.facture.numero}</strong> ({fmt(r.facture.montant_ht)} HT) ↔ {r.transaction.label || r.transaction.reference || 'Transaction Qonto'} — {(Number(r.transaction.amount_cents || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € ({r.base})
                    </div>
                    <button onClick={() => confirmerSuggestionQonto('factures_frs', r)} disabled={rapprochementBusy === 'confirm:' + r.facture.id} style={quietLink}>
                      {rapprochementBusy === 'confirm:' + r.facture.id ? '...' : 'Marquer payée'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {showForm && (
              <div style={{ background: colors.surface, padding: 20, border: '1px solid ' + colors.line, marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Nouvelle facture fournisseur</h4>
                {error && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{error}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div><label style={fieldLabel}>N° facture *</label>
                    <input value={formFfrs.numero} onChange={e => setFormFfrs(p => ({ ...p, numero: e.target.value }))} placeholder="FAC-2026-001"
                      style={inputUnderline} /></div>
                  <div><label style={fieldLabel}>Fournisseur</label>
                    <select value={formFfrs.fournisseur_id} onChange={e => { const fournisseur_id = e.target.value; setFormFfrs(p => ({ ...p, fournisseur_id, date_echeance: echeanceFfrsVerrouillee ? echeanceFfrsAuto(p.date_facture, fournisseur_id) : p.date_echeance })) }}
                      style={{ ...inputUnderline, cursor: 'pointer' }}>
                      <option value=''>— Aucun —</option>{fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}</select></div>
                  <div><label style={fieldLabel}>Commande liée</label>
                    <select value={formFfrs.commande_id} onChange={e => setFormFfrs(p => ({ ...p, commande_id: e.target.value }))}
                      style={{ ...inputUnderline, cursor: 'pointer' }}>
                      <option value=''>— Aucune —</option>{commandes.map(c => <option key={c.id} value={c.id}>{c.numero || c.description}</option>)}</select></div>
                  <div><label style={fieldLabel}>Montant HT (€)</label>
                    <input type="number" min="0" value={formFfrs.montant_ht} onChange={e => setFormFfrs(p => ({ ...p, montant_ht: e.target.value }))}
                      style={inputUnderline} /></div>
                  <div><label style={fieldLabel}>Date facture</label>
                    <input type="date" value={formFfrs.date_facture} onChange={e => { const date_facture = e.target.value; setFormFfrs(p => ({ ...p, date_facture, date_echeance: echeanceFfrsVerrouillee ? echeanceFfrsAuto(date_facture, p.fournisseur_id) : p.date_echeance })) }}
                      style={inputUnderline} /></div>
                  <div><label style={fieldLabel}>Date échéance {echeanceFfrsVerrouillee && <span style={{ color: colors.inkFaint, fontWeight: 400, textTransform: 'none' }}>(auto)</span>}</label>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <input type="date" value={formFfrs.date_echeance} disabled={echeanceFfrsVerrouillee} onChange={e => setFormFfrs(p => ({ ...p, date_echeance: e.target.value }))}
                        style={{ ...inputUnderline, flex: 1, color: echeanceFfrsVerrouillee ? colors.inkMuted : colors.ink }} />
                      {echeanceFfrsVerrouillee ? (
                        <button type="button" title="Modifier l'échéance manuellement"
                          onClick={() => { if (confirm('L\'échéance est calculée automatiquement à partir des conditions de paiement du fournisseur. La modifier manuellement ?')) setEcheanceFfrsVerrouillee(false) }}
                          style={quietLink}>Déverrouiller</button>
                      ) : (
                        <button type="button" title="Revenir au calcul automatique" onClick={() => { setEcheanceFfrsVerrouillee(true); setFormFfrs(p => ({ ...p, date_echeance: echeanceFfrsAuto(p.date_facture, p.fournisseur_id) })) }}
                          style={quietLink}>Auto</button>
                      )}
                    </div></div>
                  <div><label style={fieldLabel}>Statut</label>
                    <select value={formFfrs.statut} onChange={e => setFormFfrs(p => ({ ...p, statut: e.target.value }))}
                      style={{ ...inputUnderline, cursor: 'pointer' }}>
                      {STATUTS_FFRS.map(s => <option key={s}>{s}</option>)}</select></div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={fieldLabel}>PDF de la facture (reçu du fournisseur — requis pour l'envoi vers Pennylane)</label>
                    <input type="file" accept="application/pdf" onChange={e => setFileFfrs(e.target.files[0] || null)}
                      style={{ width: '100%', fontSize: 13, fontFamily: fonts.display }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowForm(false); setError(''); setFileFfrs(null) }} style={btnGhost}>Annuler</button>
                  <button onClick={ajouterFactureFrs} disabled={savingFactureFrs} style={btnPrimary}>{savingFactureFrs ? 'Ajout...' : 'Ajouter'}</button>
                </div>
              </div>
            )}
            {pennylaneError && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>Pennylane : {pennylaneError}</div>}
            {facturesFrs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: colors.ink }}>Aucune facture fournisseur</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: colors.surface, border: '1px solid ' + colors.line, fontSize: 13 }}>
                <thead><tr style={{ background: colors.bg, borderBottom: '1px solid ' + colors.line }}>
                  {['N°', 'Fournisseur', 'Commande', 'Date', 'Échéance', 'Montant HT', 'Statut', 'Pennylane', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Montant HT' ? 'right' : 'left', color: colors.inkMuted, fontWeight: 500 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {facturesFrs.map((f) => {
                    const isEdited = !!facFrsEditees[f.id]
                    const inStyle = cellInput(isEdited)
                    const enRetard = f.statut === 'À payer' && f.date_echeance && new Date(f.date_echeance) < new Date()
                    return (
                    <tr key={f.id} id={'row-' + f.id} style={{ borderBottom: '1px solid ' + colors.line, borderLeft: f.id === focusId ? '2px solid ' + colors.focus : enRetard ? '2px solid ' + colors.danger : 'none' }}>
                      <td style={{ padding: '8px 14px', fontWeight: 500 }}>
                        <input value={getFacFrsVal(f, 'numero')} onChange={e => editFacFrs(f.id, 'numero', e.target.value)} style={{ ...inStyle, width: 110, fontWeight: 600 }} />
                      </td>
                      <td style={{ padding: '10px 14px' }}>{f.fournisseurs?.nom || '—'}</td>
                      <td style={{ padding: '10px 14px', color: colors.inkFaint, fontSize: 12 }}>{f.commandes?.numero || '—'}</td>
                      <td style={{ padding: '8px 14px', color: colors.inkFaint }}>
                        <input type="date" value={getFacFrsVal(f, 'date_facture')} onChange={e => editFacFrs(f.id, 'date_facture', e.target.value)} style={{ ...inStyle, width: 130 }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <input type="date" value={getFacFrsVal(f, 'date_echeance')} onChange={e => editFacFrsEcheance(f.id, e.target.value)}
                          style={{ ...inStyle, width: 130, color: enRetard ? colors.danger : colors.ink }} />
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                        <input type="number" min="0" value={getFacFrsVal(f, 'montant_ht')} onChange={e => editFacFrs(f.id, 'montant_ht', e.target.value)} style={{ ...inStyle, width: 90, textAlign: 'right', fontWeight: 600, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.inkMuted }}>
                          <span style={marker(STATUT_FFRS_MARKER[getFacFrsVal(f, 'statut')])} />
                          <select value={getFacFrsVal(f, 'statut')} onChange={e => editFacFrs(f.id, 'statut', e.target.value)}
                            style={{ border: 'none', background: 'transparent', fontSize: 11, cursor: 'pointer', color: colors.inkMuted, fontFamily: fonts.display }}>
                            {STATUTS_FFRS.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </span>
                        {enRetard && (
                          <div style={{ fontSize: 10, marginTop: 4, color: colors.danger, fontWeight: 600 }}>
                            Impayée (en retard)
                          </div>
                        )}
                        {f.qonto_transaction_id ? (
                          <div title={'Rapproché avec une transaction Qonto (' + (f.qonto_match_confiance === 'exact' ? 'numéro + montant' : 'montant seul') + '), le ' + (f.qonto_matched_at ? new Date(f.qonto_matched_at).toLocaleDateString('fr-FR') : '?')}
                            style={{ fontSize: 10, marginTop: 4, color: colors.focus }}>
                            Qonto{f.qonto_match_confiance === 'montant' ? ' (manuel)' : ''}
                          </div>
                        ) : f.statut === 'Payée' ? (
                          <div style={{ fontSize: 10, marginTop: 4, color: colors.inkFaint }}>saisi manuellement</div>
                        ) : null}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {f.pennylane_invoice_id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 11, color: ACCENT_MARGE, fontWeight: 500 }}>{f.pennylane_statut || 'Envoyée'}</span>
                            <button onClick={() => actualiserFactureFrsPennylane(f)} disabled={pennylaneBusy === f.id} style={{ ...quietLink, color: ACCENT_MARGE, borderBottomColor: ACCENT_MARGE }}>
                              {pennylaneBusy === f.id ? '...' : 'Actualiser'}
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => envoyerFactureFrsVersPennylane(f)} disabled={pennylaneBusy === f.id} style={quietLink}>
                            {pennylaneBusy === f.id ? 'Envoi...' : 'Envoyer'}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                          {isEdited && (
                            <button onClick={() => saveFacFrs(f)} disabled={pennylaneBusy === f.id} style={quietLink}>Enregistrer</button>
                          )}
                          <button onClick={() => supprimer('factures_frs', f.id)} style={{ ...quietLink, color: colors.danger, borderBottomColor: colors.danger }}>Supprimer</button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}

        {/* ── FACTURES CLI ── */}
        {tab === 'factures_cli' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Factures clients · <span style={{ color: colors.success, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalFcli)}</span></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={verifierQontoCli} disabled={rapprochementBusy === 'cli'} style={btnGhost}>
                  {rapprochementBusy === 'cli' ? 'Vérification...' : 'Vérifier sur Qonto'}
                </button>
                <button onClick={() => { setShowForm(true); setError(''); setEcheanceFcliVerrouillee(true) }} style={btnPrimary}>+ Nouvelle facture</button>
              </div>
            </div>
            {rapprochementError && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{rapprochementError}</div>}
            {suggestionsQontoCli.length > 0 && (
              <div style={{ borderLeft: '2px solid ' + colors.success, padding: '10px 14px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 8 }}>Correspondances Qonto à valider ({suggestionsQontoCli.length})</div>
                {suggestionsQontoCli.map(r => (
                  <div key={r.facture.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid ' + colors.line }}>
                    <div style={{ fontSize: 12 }}>
                      <strong>{r.facture.numero}</strong> ({fmt(r.facture.montant_ht)} HT) ↔ {r.transaction.label || r.transaction.reference || 'Transaction Qonto'} — {(Number(r.transaction.amount_cents || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € ({r.base})
                    </div>
                    <button onClick={() => confirmerSuggestionQonto('factures_cli', r)} disabled={rapprochementBusy === 'confirm:' + r.facture.id} style={quietLink}>
                      {rapprochementBusy === 'confirm:' + r.facture.id ? '...' : 'Marquer payée'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {showForm && (
              <div style={{ background: colors.surface, padding: 20, border: '1px solid ' + colors.line, marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Nouvelle facture client</h4>
                {error && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{error}</div>}
                {(() => {
                  const saisie = parseFloat(formFcli.montant_ht) || 0
                  const resteApres = resteAFacturer - saisie
                  const pctSaisi = totalVenteGlobal > 0 ? (saisie / totalVenteGlobal * 100) : 0
                  return (
                    <div style={{ borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line, padding: '12px 0', marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      <div>
                        <div style={fieldLabel}>Budget vente (devis)</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalVenteGlobal)}</div>
                      </div>
                      <div>
                        <div style={fieldLabel}>Déjà facturé</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: colors.success, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalFcli)}{totalVenteGlobal > 0 && <span style={{ fontSize: 11, color: colors.inkMuted, fontWeight: 400 }}> · {(totalFcli / totalVenteGlobal * 100).toFixed(1)}%</span>}</div>
                      </div>
                      <div>
                        <div style={fieldLabel}>{saisie > 0 ? 'Reste après cette facture' : 'Reste à facturer'}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: resteApres >= 0 ? colors.success : colors.danger, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(resteApres)}</div>
                      </div>
                      {saisie > 0 && (
                        <div style={{ gridColumn: '1 / -1', fontSize: 11, color: colors.inkMuted }}>
                          Cette facture représente <strong style={{ color: colors.ink }}>{pctSaisi.toFixed(1)}%</strong> du budget vente du devis.
                        </div>
                      )}
                      {resteApres < 0 && (
                        <div style={{ gridColumn: '1 / -1', fontSize: 11, color: colors.danger }}>
                          Ce montant dépasse le reste à facturer sur le devis de {fmt(Math.abs(resteApres))}.
                        </div>
                      )}
                    </div>
                  )
                })()}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div><label style={fieldLabel}>N° facture</label>
                    <div style={{ fontSize: 13, color: colors.inkFaint, fontStyle: 'italic', padding: '8px 2px' }}>
                      Généré automatiquement à la création
                    </div></div>
                  <div><label style={fieldLabel}>Montant HT (€)</label>
                    <input type="number" min="0" value={formFcli.montant_ht} onChange={e => { setFormFcli(p => ({ ...p, montant_ht: e.target.value })); setFormFcliPct('') }}
                      style={inputUnderline} /></div>
                  <div><label style={fieldLabel}>— ou % du devis</label>
                    <div style={{ position: 'relative' }}>
                      <input type="number" min="0" max="100" value={formFcliPct} placeholder="Ex: 30" disabled={totalVenteGlobal <= 0}
                        onChange={e => {
                          const pct = e.target.value
                          setFormFcliPct(pct)
                          const montant = totalVenteGlobal > 0 && pct !== '' ? (totalVenteGlobal * parseFloat(pct) / 100) : ''
                          setFormFcli(p => ({ ...p, montant_ht: montant === '' ? '' : montant.toFixed(2) }))
                        }}
                        style={{ ...inputUnderline, paddingRight: 20 }} />
                      <span style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: colors.inkFaint }}>%</span>
                    </div></div>
                  <div><label style={fieldLabel}>Date facture</label>
                    <input type="date" value={formFcli.date_facture} onChange={e => { const date_facture = e.target.value; setFormFcli(p => ({ ...p, date_facture, date_echeance: echeanceFcliVerrouillee ? echeanceFcliAuto(date_facture, p.type_facture === 'acompte' && p.paiement_comptant) : p.date_echeance })) }}
                      style={inputUnderline} /></div>
                  <div><label style={fieldLabel}>Date échéance {echeanceFcliVerrouillee && <span style={{ color: colors.inkFaint, fontWeight: 400, textTransform: 'none' }}>(auto)</span>}</label>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <input type="date" value={formFcli.date_echeance} disabled={echeanceFcliVerrouillee} onChange={e => setFormFcli(p => ({ ...p, date_echeance: e.target.value }))}
                        style={{ ...inputUnderline, flex: 1, color: echeanceFcliVerrouillee ? colors.inkMuted : colors.ink }} />
                      {echeanceFcliVerrouillee ? (
                        <button type="button" title="Modifier l'échéance manuellement"
                          onClick={() => { if (confirm('L\'échéance est calculée automatiquement à partir des conditions de paiement du client. La modifier manuellement ?')) setEcheanceFcliVerrouillee(false) }}
                          style={quietLink}>Déverrouiller</button>
                      ) : (
                        <button type="button" title="Revenir au calcul automatique" onClick={() => { setEcheanceFcliVerrouillee(true); setFormFcli(p => ({ ...p, date_echeance: echeanceFcliAuto(p.date_facture, p.type_facture === 'acompte' && p.paiement_comptant) })) }}
                          style={quietLink}>Auto</button>
                      )}
                    </div></div>
                  <div><label style={fieldLabel}>Statut</label>
                    <select value={formFcli.statut} onChange={e => setFormFcli(p => ({ ...p, statut: e.target.value }))}
                      style={{ ...inputUnderline, cursor: 'pointer' }}>
                      {STATUTS_FCLI.map(s => <option key={s}>{s}</option>)}</select></div>
                  <div><label style={fieldLabel}>Type de facture</label>
                    <select value={formFcli.type_facture} onChange={e => {
                        const type_facture = e.target.value
                        // La case "paiement comptant" n'a de sens que pour une
                        // facture d'acompte — on la réinitialise en repassant
                        // sur "avancement" pour ne pas garder un état caché.
                        const paiement_comptant = type_facture === 'acompte' ? formFcli.paiement_comptant : false
                        setFormFcli(p => ({ ...p, type_facture, paiement_comptant, date_echeance: echeanceFcliVerrouillee ? echeanceFcliAuto(p.date_facture, type_facture === 'acompte' && paiement_comptant) : p.date_echeance }))
                      }}
                      style={{ ...inputUnderline, cursor: 'pointer' }}>
                      <option value="avancement">Facture d'avancement</option>
                      <option value="acompte">Facture d'acompte</option>
                    </select></div>
                  {formFcli.type_facture === 'acompte' && (
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: colors.ink, cursor: 'pointer' }}>
                        <input type="checkbox" checked={formFcli.paiement_comptant} onChange={e => {
                            const paiement_comptant = e.target.checked
                            setFormFcli(p => ({ ...p, paiement_comptant, date_echeance: echeanceFcliVerrouillee ? echeanceFcliAuto(p.date_facture, paiement_comptant) : p.date_echeance }))
                          }} />
                        Paiement comptant <span style={{ color: colors.inkFaint }}>(pas de délai de 30 jours — échéance = date de facture)</span>
                      </label>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowForm(false); setError('') }} style={btnGhost}>Annuler</button>
                  <button onClick={ajouterFactureCli} disabled={savingFactureCli} style={btnPrimary}>{savingFactureCli ? 'Ajout...' : 'Ajouter'}</button>
                </div>
              </div>
            )}
            {pennylaneError && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>Pennylane : {pennylaneError}</div>}
            {facturesCli.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: colors.ink }}>Aucune facture client</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: colors.surface, border: '1px solid ' + colors.line, fontSize: 13 }}>
                <thead><tr style={{ background: colors.bg, borderBottom: '1px solid ' + colors.line }}>
                  {['N°', 'Date', 'Échéance', 'Montant HT', 'Statut', 'Pennylane', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Montant HT' ? 'right' : 'left', color: colors.inkMuted, fontWeight: 500 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {facturesCli.map((f) => {
                    const isEdited = !!facCliEditees[f.id]
                    const inStyle = cellInput(isEdited)
                    const enRetard = f.statut === 'Envoyée' && f.date_echeance && new Date(f.date_echeance) < new Date()
                    return (
                    <tr key={f.id} id={'row-' + f.id} style={{ borderBottom: '1px solid ' + colors.line, borderLeft: f.id === focusId ? '2px solid ' + colors.focus : enRetard ? '2px solid ' + colors.danger : 'none' }}>
                      <td style={{ padding: '8px 14px', fontWeight: 600, color: colors.ink }} title="Numéro non modifiable (obligation légale de numérotation séquentielle)">
                        {f.numero}
                        {f.type_facture === 'acompte' && (
                          <div style={{ marginTop: 3, fontSize: 10, fontWeight: 500, color: ACCENT_MARGE }}>
                            Acompte{f.paiement_comptant ? ' · comptant' : ''}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 14px', color: colors.inkFaint }}>
                        <input type="date" value={getFacCliVal(f, 'date_facture')} onChange={e => editFacCli(f.id, 'date_facture', e.target.value, f)} style={{ ...inStyle, width: 130 }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <input type="date" value={getFacCliVal(f, 'date_echeance')} onChange={e => editFacCliEcheance(f.id, e.target.value)}
                          style={{ ...inStyle, width: 130, color: enRetard ? colors.danger : colors.ink }} />
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                        <input type="number" min="0" value={getFacCliVal(f, 'montant_ht')} onChange={e => editFacCli(f.id, 'montant_ht', e.target.value)} style={{ ...inStyle, width: 90, textAlign: 'right', fontWeight: 600, color: colors.success, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.inkMuted }}>
                          <span style={marker(STATUT_FCLI_MARKER[getFacCliVal(f, 'statut')])} />
                          <select value={getFacCliVal(f, 'statut')} onChange={e => editFacCli(f.id, 'statut', e.target.value)}
                            style={{ border: 'none', background: 'transparent', fontSize: 11, cursor: 'pointer', color: colors.inkMuted, fontFamily: fonts.display }}>
                            {STATUTS_FCLI.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </span>
                        {enRetard && (
                          <div style={{ fontSize: 10, marginTop: 4, color: colors.danger, fontWeight: 600 }}>
                            Impayée (en retard)
                          </div>
                        )}
                        {f.qonto_transaction_id ? (
                          <div title={'Rapproché avec une transaction Qonto (' + (f.qonto_match_confiance === 'exact' ? 'numéro + montant' : 'montant seul') + '), le ' + (f.qonto_matched_at ? new Date(f.qonto_matched_at).toLocaleDateString('fr-FR') : '?')}
                            style={{ fontSize: 10, marginTop: 4, color: colors.focus }}>
                            Qonto{f.qonto_match_confiance === 'montant' ? ' (manuel)' : ''}
                          </div>
                        ) : f.statut === 'Payée' ? (
                          <div style={{ fontSize: 10, marginTop: 4, color: colors.inkFaint }}>saisi manuellement</div>
                        ) : null}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {f.pennylane_invoice_id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 11, color: ACCENT_MARGE, fontWeight: 500 }}>{f.pennylane_statut || 'Envoyée'}</span>
                            <button onClick={() => actualiserFactureCliPennylane(f)} disabled={pennylaneBusy === f.id} style={{ ...quietLink, color: ACCENT_MARGE, borderBottomColor: ACCENT_MARGE }}>
                              {pennylaneBusy === f.id ? '...' : 'Actualiser'}
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => envoyerFactureCliVersPennylane(f)} disabled={pennylaneBusy === f.id} style={quietLink}>
                            {pennylaneBusy === f.id ? 'Envoi...' : 'Envoyer'}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                          {isEdited && (
                            <button onClick={() => saveFacCli(f)} disabled={pennylaneBusy === f.id} style={quietLink}>Enregistrer</button>
                          )}
                          <button onClick={() => generateFactureCliPDF(f, 'fr').save((f.numero || 'facture') + '.pdf')}
                            title="PDF en français" style={quietLink}>FR</button>
                          <button onClick={() => generateFactureCliPDF(f, 'en').save((f.numero || 'facture') + '_EN.pdf')}
                            title="PDF in English" style={quietLink}>EN</button>
                          <button onClick={() => ouvrirEnvoiFactureCli(f)} title="Envoyer la facture par email (PDF joint)" style={quietLink}>Envoyer</button>
                          <button onClick={() => supprimer('factures_cli', f.id)} style={{ ...quietLink, color: colors.danger, borderBottomColor: colors.danger }}>Supprimer</button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}

        {/* ── RENTABILITÉ ── */}
        {tab === 'rentabilite' && (() => {
          // Calculs prévisionnels depuis les LOTS + les lignes sans lot
          // (mêmes totaux que ceux affichés dans l'onglet Lignes) — hors
          // Options / variantes non retenues / texte, voir ligneCompteDansTotal.
          const lignesSansLot = (lignesParLot['sans'] || []).filter(l => l.type === 'ligne' && ligneCompteDansTotal(l))
          const venteLotsOnly = lots.reduce((s, l) => s + (l.total_ht || 0), 0)
          const achatLotsOnly = lots.reduce((s, l) => s + (l.total_achat || 0), 0)
          const venteSansLot = lignesSansLot.reduce((s, l) => s + (l.total_ht || 0), 0)
          const achatSansLot = lignesSansLot.reduce((s, l) => s + (l.total_achat || 0), 0)
          const venteTotalLignes = venteLotsOnly + venteSansLot
          const achatPrevu = achatLotsOnly + achatSansLot

          // CA = montant du marché si renseigné, sinon total vente des lignes du projet
          const ca = projet.montant_ht || venteTotalLignes || 0
          const margePrevu = ca - achatPrevu
          const tauxMargePrevu = ca > 0 ? ((margePrevu / ca) * 100).toFixed(1) : 0

          // Trois temps de lecture du budget achat/vente d'un projet :
          //  1. Prévisionnel : ce qui a été chiffré au devis (lignes projet)
          //  2. En cours     : ce qui est réellement engagé — commandes
          //                    fournisseurs émises côté achat (hors
          //                    "Annulée", voir totalCommandesActives) ; côté
          //                    vente, rien de plus fiable que le devis tant
          //                    que la facturation n'est pas là, donc on
          //                    reprend le CA prévisionnel tel quel.
          //  3. Réel         : ce qui a été effectivement facturé — factures
          //                    fournisseurs reçues côté achat (et non plus
          //                    les commandes, qui ne sont qu'un engagement),
          //                    factures clients émises côté vente.
          // Tant qu'aucune commande / facture n'existe, un achat "à 0" ne veut
          // rien dire (ce n'est pas "on a dépensé 0 et donc tout est marge",
          // c'est juste "rien n'a encore été saisi") — sans ce garde-fou, un
          // projet fraîchement créé affiche une marge "en cours"/"réelle" à
          // 100%, verte, alors qu'il n'y a simplement aucune donnée. On
          // n'affiche donc un chiffre en cours/réel que s'il y a au moins une
          // commande/facture derrière.
          const aCommandesActives = commandes.some(c => c.statut !== 'Annulée')
          const aFacturesFrs = facturesFrs.length > 0
          const aFacturesCli = facturesCli.length > 0

          const caEnCours = ca
          const achatEnCours = aCommandesActives ? totalCommandesActives : null
          const margeEnCours = achatEnCours !== null ? caEnCours - achatEnCours : null
          const tauxMargeEnCours = margeEnCours !== null && caEnCours > 0 ? ((margeEnCours / caEnCours) * 100).toFixed(1) : null

          const caReel = aFacturesCli ? totalFcli : null
          const achatReel = aFacturesFrs ? totalFfrs : null
          const margeReelle = (caReel !== null || achatReel !== null) ? (caReel || 0) - (achatReel || 0) : null
          const tauxMargeReelle = margeReelle !== null && caReel > 0 ? ((margeReelle / caReel) * 100).toFixed(1) : null

          // Écarts (réel vs prévisionnel — la comparaison qui compte au
          // final) : uniquement quand il y a vraiment un réel à comparer,
          // sinon un "-1 500 € d'écart" ne ferait que comparer le devis à du
          // vide et laisserait croire à tort qu'on est sous le budget.
          const ecartAchatEnCours = achatEnCours !== null ? achatEnCours - achatPrevu : null
          const ecartAchat = achatReel !== null ? achatReel - achatPrevu : null
          const ecartMarge = margeReelle !== null ? margeReelle - margePrevu : null

          const col = (val, positifBon = true) => {
            if (val === 0) return colors.inkFaint
            if (positifBon) return val > 0 ? colors.success : colors.danger
            return val > 0 ? colors.danger : colors.success
          }

          return (
            <div style={{ maxWidth: 720 }}>
              <div style={sectionTitle}>Rentabilité</div>

              {/* Tableau comparatif */}
              <div style={{ overflow: isMobile ? 'auto' : 'hidden', marginBottom: 20 }}>
                <div style={{ minWidth: isMobile ? 620 : 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', borderBottom: '1px solid ' + colors.line, borderTop: '1px solid ' + colors.line }}>
                  <div style={{ padding: '10px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.inkFaint }}></div>
                  <div style={{ padding: '10px 12px', fontSize: 11, fontWeight: 600, textAlign: 'right', color: colors.focus, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prévisionnel</div>
                  <div style={{ padding: '10px 12px', fontSize: 11, fontWeight: 600, textAlign: 'right', color: colors.warning, textTransform: 'uppercase', letterSpacing: '0.05em' }}>En cours</div>
                  <div style={{ padding: '10px 12px', fontSize: 11, fontWeight: 600, textAlign: 'right', color: colors.success, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Réel</div>
                  <div style={{ padding: '10px 12px', fontSize: 11, fontWeight: 600, textAlign: 'right', color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Écart</div>
                </div>

                {[
                  { label: "Chiffre d'affaires (vente)", prev: ca, enCours: caEnCours, reel: caReel, showEcart: false },
                  { label: 'Coût achats', prev: achatPrevu, enCours: achatEnCours, reel: achatReel, showEcart: true, ecartPositifMauvais: true },
                  { label: 'Marge brute', prev: margePrevu, enCours: margeEnCours, reel: margeReelle, showEcart: true, ecartPositifMauvais: false, bold: true },
                  { label: 'Taux de marge', prev: tauxMargePrevu + '%', enCours: tauxMargeEnCours !== null ? tauxMargeEnCours + '%' : '—', reel: tauxMargeReelle !== null ? tauxMargeReelle + '%' : '—', showEcart: false, isTaux: true },
                ].map(({ label, prev, enCours, reel, showEcart, ecartPositifMauvais, bold, isTaux }, i) => {
                  const ecart = isTaux ? null : (typeof reel === 'number' && typeof prev === 'number' ? reel - prev : null)
                  return (
                    <div key={label} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', borderBottom: i < 3 ? '1px solid ' + colors.line : 'none' }}>
                      <div style={{ padding: '12px', fontSize: 13, fontWeight: bold ? 700 : 500, color: colors.ink }}>{label}</div>
                      <div style={{ padding: '12px', textAlign: 'right', fontSize: 13, fontWeight: bold ? 700 : 500, color: colors.focus, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
                        {isTaux ? prev : fmt(prev)}
                      </div>
                      <div style={{ padding: '12px', textAlign: 'right', fontSize: 13, fontWeight: bold ? 700 : 500, color: colors.warning, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
                        {isTaux ? enCours : fmt(enCours)}
                      </div>
                      <div style={{ padding: '12px', textAlign: 'right', fontSize: 13, fontWeight: bold ? 700 : 500, color: colors.success, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
                        {isTaux ? reel : fmt(reel)}
                      </div>
                      <div style={{ padding: '12px', textAlign: 'right', fontSize: 13, fontWeight: bold ? 700 : 400, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
                        {showEcart && ecart !== null ? (
                          <span style={{ color: col(ecart, !ecartPositifMauvais), fontWeight: 600 }}>
                            {ecart > 0 ? '+' : ''}{fmt(ecart)}
                          </span>
                        ) : '—'}
                      </div>
                    </div>
                  )
                })}
                </div>
              </div>
              <div style={{ fontSize: 11, color: colors.inkFaint, marginTop: -14, marginBottom: 20 }}>
                En cours = commandé aux fournisseurs (achat) — la vente reprend le prévisionnel tant qu'elle n'est pas facturée. Réel = effectivement facturé (factures fournisseurs et clients).
              </div>

              {/* Avancement achat (commandé) et vente (facturé) — complètent
                  le tableau ci-dessus sans porter de jugement bon/mauvais
                  (un chantier en cours n'est normalement ni commandé ni
                  facturé à 100%, ce n'est pas un écart au sens "dérapage"). */}
              {ca > 0 && (
                <div style={{ fontSize: 12, color: colors.inkMuted, marginBottom: 6 }}>
                  Facturé aux clients à ce jour : <strong style={{ color: colors.ink, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(caReel)}</strong> ({(caReel / ca * 100).toFixed(1)}% du CA prévu) · Reste à facturer : <strong style={{ color: colors.ink, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(Math.max(0, ca - caReel))}</strong>
                </div>
              )}
              {achatPrevu > 0 && (
                <div style={{ fontSize: 12, color: colors.inkMuted, marginBottom: 16 }}>
                  Commandé aux fournisseurs à ce jour : <strong style={{ color: colors.ink, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(achatEnCours)}</strong> ({(achatEnCours / achatPrevu * 100).toFixed(1)}% du budget achat
                  {ecartAchatEnCours > 0 && <span style={{ color: colors.danger }}> · +{fmt(ecartAchatEnCours)} vs devis</span>}) · Facturé par les fournisseurs : <strong style={{ color: colors.ink, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(achatReel)}</strong>
                </div>
              )}

              {/* Cartes résumé */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 20, marginBottom: 20, paddingTop: 16, borderTop: '1px solid ' + colors.line }}>
                <div>
                  <div style={eyebrow}>Marge prévisionnelle</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: margePrevu >= 0 ? colors.ink : colors.danger, marginTop: 6, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(margePrevu)}</div>
                  <div style={{ fontSize: 12, color: colors.inkFaint, marginTop: 2 }}>Taux : {tauxMargePrevu}%</div>
                </div>
                <div>
                  <div style={eyebrow}>Marge en cours (commandes)</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: margeEnCours === null ? colors.inkFaint : (margeEnCours >= 0 ? colors.ink : colors.danger), marginTop: 6, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{margeEnCours === null ? 'Aucune commande' : fmt(margeEnCours)}</div>
                  <div style={{ fontSize: 12, color: colors.inkFaint, marginTop: 2 }}>Taux : {tauxMargeEnCours !== null ? tauxMargeEnCours + '%' : '—'}</div>
                </div>
                <div>
                  <div style={eyebrow}>Marge réelle (factures)</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: margeReelle === null ? colors.inkFaint : (margeReelle >= 0 ? colors.ink : colors.danger), marginTop: 6, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{margeReelle === null ? 'Aucune facture' : fmt(margeReelle)}</div>
                  <div style={{ fontSize: 12, color: colors.inkFaint, marginTop: 2 }}>Taux : {tauxMargeReelle !== null ? tauxMargeReelle + '%' : '—'}</div>
                </div>
              </div>

              {/* Écart global — seulement quand il y a un vrai réel (au moins
                  une facture) à comparer au prévisionnel, sinon le calcul
                  compare le devis à du vide et affiche à tort "meilleure
                  marge que prévu". */}
              {ca > 0 && ecartMarge !== null && (
                <div style={{ borderLeft: '2px solid ' + (ecartMarge >= 0 ? colors.success : colors.danger), padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: ecartMarge >= 0 ? colors.success : colors.danger }}>
                      {ecartMarge >= 0 ? 'Meilleure marge que prévu' : 'Marge inférieure au prévisionnel'}
                    </div>
                    <div style={{ fontSize: 12, color: colors.inkMuted, marginTop: 4 }}>
                      Écart achat : <strong style={{ color: col(ecartAchat, false), fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{ecartAchat > 0 ? '+' : ''}{fmt(ecartAchat)}</strong>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: ecartMarge >= 0 ? colors.success : colors.danger, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{ecartMarge > 0 ? '+' : ''}{fmt(ecartMarge)}</div>
                    <div style={{ fontSize: 11, color: colors.inkFaint }}>sur la marge</div>
                  </div>
                </div>
              )}
              {ca > 0 && ecartMarge === null && (
                <div style={{ padding: '10px 0', borderTop: '1px solid ' + colors.line, fontSize: 12, color: colors.inkMuted }}>
                  Pas encore de facture client ou fournisseur sur ce projet — la marge réelle s'affichera dès la première facture.
                </div>
              )}

              {/* Info si pas de lignes du tout */}
              {lots.length === 0 && lignesSansLot.length === 0 && (
                <div style={{ marginTop: 12, borderLeft: '2px solid ' + colors.warning, padding: '10px 16px', fontSize: 12, color: colors.inkMuted }}>
                  Importez les lignes du projet (onglet Lignes) pour voir le prévisionnel avec coefficients
                </div>
              )}
            </div>
          )
        })()}

        {/* ── DOCUMENTS ── */}
        {tab === 'documents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 720 }}>

            {/* Dossier Documents officiels */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid ' + colors.line, paddingBottom: 10, marginBottom: 12 }}>
                <div style={sectionTitle}>Documents officiels</div>
                <label style={{ ...quietLink, cursor: 'pointer' }}>
                  {uploadingDoc === 'officiels' ? '...' : '+ Ajouter'}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files[0]; if (!file) return
                      setUploadingDoc('officiels')
                      const fileName = 'officiel_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
                      await supabase.storage.from('documents').upload('projets/' + id + '/officiels/' + fileName, file)
                      const { data } = await supabase.storage.from('documents').list('projets/' + id + '/officiels')
                      setDocuments(prev => ({ ...prev, officiels: data || [] }))
                      setUploadingDoc(null)
                      e.target.value = ''
                    }} />
                </label>
              </div>
              {(!documents.officiels || documents.officiels.length === 0) ? (
                <div style={{ padding: '16px 0', color: colors.inkFaint, fontSize: 13 }}>
                  Devis signé, ordre de service, PV de réception...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {documents.officiels.map(doc => (
                    <div key={doc.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid ' + colors.line }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={getDocUrl('projets/' + id + '/officiels/' + doc.name)} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 13, color: colors.ink, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', borderBottom: '1px solid ' + colors.line }}>
                          {doc.name.replace(/^officiel_\d+_/, '')}
                        </a>
                      </div>
                      <button onClick={async () => {
                        if (!confirm('Supprimer ?')) return
                        await supabase.storage.from('documents').remove(['projets/' + id + '/officiels/' + doc.name])
                        const { data } = await supabase.storage.from('documents').list('projets/' + id + '/officiels')
                        setDocuments(prev => ({ ...prev, officiels: data || [] }))
                      }} style={{ ...quietLink, color: colors.danger, borderBottomColor: colors.danger }}>Supprimer</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dossier Documents du projet */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid ' + colors.line, paddingBottom: 10, marginBottom: 12 }}>
                <div style={sectionTitle}>Documents du projet</div>
                <label style={{ ...quietLink, cursor: 'pointer' }}>
                  {uploadingDoc === 'projet' ? '...' : '+ Ajouter'}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files[0]; if (!file) return
                      setUploadingDoc('projet')
                      await uploadDoc(file, 'projets/' + id, async () => {
                        const { data } = await supabase.storage.from('documents').list('projets/' + id)
                        setDocuments(prev => ({ ...prev, projet: (data || []).filter(estUnDocumentReel) }))
                      })
                      setUploadingDoc(null)
                      e.target.value = ''
                    }} />
                </label>
              </div>
              {(!documents.projet || documents.projet.filter(estUnDocumentReel).length === 0) ? (
                <div style={{ padding: '16px 0', color: colors.inkFaint, fontSize: 13 }}>
                  Plans, photos chantier, rapports...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {(documents.projet || []).filter(estUnDocumentReel).map(doc => (
                    <div key={doc.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid ' + colors.line }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={getDocUrl('projets/' + id + '/' + doc.name)} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 13, color: colors.ink, textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: '1px solid ' + colors.line }}>
                          {doc.name.replace(/^\d+_/, '')}
                        </a>
                      </div>
                      <button onClick={() => deleteDoc('projets/' + id + '/' + doc.name)}
                        style={{ ...quietLink, color: colors.danger, borderBottomColor: colors.danger }}>Supprimer</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
