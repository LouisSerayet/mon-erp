// Conditions générales de vente de Partenaires Particuliers, jointes aux
// devis et factures clients générés par l'ERP.
//
// ⚠️ Ce texte est une adaptation — à la structure et à l'esprit d'un modèle
// de CGV BTP classique — aux informations réelles de Partenaires Particuliers
// (SASU, capital, SIRET, RCS Paris, assurance AXA) et à une activité de
// conseil / AMO / OPC plutôt que de vente de biens. Ce n'est PAS un avis
// juridique : il est recommandé de le faire relire par un avocat ou un
// expert-comptable avant un usage commercial, notamment les clauses de
// paiement, de responsabilité et de compétence juridictionnelle.
import { ENTREPRISE } from './entreprise'
import { NAVY, MARGIN_L, MARGIN_R } from './pdfStyle'

const E = ENTREPRISE

export const CGV_ARTICLES = [
  {
    titre: 'Article 1 : Préambule',
    paragraphes: [
      `Les présentes conditions générales de vente ont pour objet de régir les relations entre, d'une part, la société ${E.nom}, ${E.formeJuridique} (${E.formeJuridiqueLongue}) au capital de ${E.capitalSocial.toLocaleString('fr-FR')} euros, immatriculée au Registre du Commerce et des Sociétés de ${E.rcsVille} sous le numéro ${E.siren}, dont le siège social est situé ${E.adresse}, ${E.codePostal} ${E.ville} (ci-après « ${E.nom} » ou « le Prestataire »), et d'autre part le client (ci-après le « Client ») qui confie au Prestataire tout ou partie d'une mission de conseil, d'assistance à maîtrise d'ouvrage, d'ordonnancement, de pilotage et coordination (OPC) ou de gestion de projet d'aménagement.`,
      `Toute acceptation d'un devis ou toute commande passée auprès du Prestataire implique l'acceptation sans réserve des présentes conditions générales de vente. Toute réserve du Client ne lui sera opposable que si elle a fait l'objet d'une acceptation écrite et préalable du Prestataire. La relation contractuelle (ci-après « le Marché ») est constituée, par ordre hiérarchique décroissant, du devis ou de la commande accepté(e), puis des présentes conditions générales de vente.`,
    ],
  },
  {
    titre: 'Article 2 : Objet du Marché',
    paragraphes: [
      "Le Marché précise notamment : le nom et la qualité des parties ; la nature, l'objet et le lieu d'exécution de la mission ; le prix ; le délai d'exécution ; les modalités de paiement.",
      "En cas de modification du Marché à la demande du Client, notamment une prestation supplémentaire, celle-ci sera établie d'un commun accord par un avenant écrit précisant ses conséquences sur le prix et le délai d'exécution.",
    ],
  },
  {
    titre: "Article 3 : Délai d'exécution",
    paragraphes: [
      "Le délai d'exécution de la mission est celui précisé dans le devis ou la commande acceptée. Dans les huit (8) jours suivant l'apparition d'un cas de force majeure ou de toute autre cause légitime de suspension du Marché, le Prestataire en avertira le Client par écrit, pièces justificatives à l'appui, en précisant l'incidence prévisible sur le déroulement de la mission.",
      "Constituent un cas de force majeure les événements répondant aux conditions de l'article 1218 du Code civil, ainsi que tout retard imputable au Client (fourniture tardive d'informations, de documents ou d'accès nécessaires à l'exécution de la mission).",
      "En cas de retard non justifié supérieur à trente (30) jours, le Client pourra mettre le Prestataire en demeure de s'exécuter dans un délai de huit (8) jours, sans que cela ne puisse donner lieu à une indemnisation supérieure à 2 % du montant du Marché, sauf faute lourde dûment établie.",
    ],
  },
  {
    titre: 'Article 4 : Fixation du prix',
    paragraphes: [
      'Le prix de la mission est fixé dans le devis accepté par le Client. Sauf stipulation contraire, les prix sont exprimés en euros hors taxes (HT), la TVA au taux en vigueur (' + E.tvaTauxDefaut + ' % à la date des présentes) s\'y ajoutant.',
    ],
  },
  {
    titre: 'Article 5 : Modalités de paiement',
    paragraphes: [
      "Sauf stipulation contraire prévue au devis accepté, le solde est payable à réception de facture, dans un délai de trente (30) jours date de facture, par virement bancaire aux coordonnées mentionnées sur la facture.",
      "Tout retard de paiement entraîne de plein droit, sans qu'un rappel soit nécessaire, l'application d'intérêts de retard au taux directeur de la Banque centrale européenne majoré de 10 points, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 € par facture impayée, conformément aux articles L441-10 et D441-5 du Code de commerce. Une indemnisation complémentaire pourra être demandée sur justification si les frais de recouvrement exposés sont supérieurs à ce montant forfaitaire.",
      'Aucun escompte ne sera consenti en cas de paiement anticipé.',
    ],
  },
  {
    titre: "Article 6 : Conditions d'exécution de la mission",
    paragraphes: [
      `${E.nom} met tout en œuvre pour la bonne exécution du Marché et, le cas échéant, coordonne les actions des différents intervenants du projet. Elle sélectionne ses éventuels sous-traitants et prestataires dans le respect des dispositions applicables et demeure seule responsable, vis-à-vis du Client, de la bonne exécution des prestations sous-traitées.`,
      "Il appartient au Client de fournir au Prestataire toutes les informations, tous les documents et tous les accès indispensables à la bonne exécution de sa mission, notamment ceux relatifs à la nature technique du projet. La responsabilité du Prestataire ne saurait être engagée pour un retard, une erreur ou un manquement résultant d'informations ou de documents erronés, incomplets ou fournis tardivement par le Client.",
    ],
  },
  {
    titre: 'Article 7 : Réception des prestations et livrables',
    paragraphes: [
      "L'acceptation par le Client des prestations exécutées ou des livrables remis vaut réception sans réserve, sauf notification écrite et motivée adressée au Prestataire dans un délai de huit (8) jours à compter de leur remise.",
    ],
  },
  {
    titre: 'Article 8 : Assurance',
    paragraphes: [
      `${E.nom} a souscrit auprès de ${E.assurance.compagnie} une assurance responsabilité civile professionnelle couvrant les conséquences pécuniaires de la responsabilité civile pouvant lui incomber au titre du Marché. Une attestation d'assurance en cours de validité est communiquée au Client sur simple demande.`,
    ],
  },
  {
    titre: 'Article 9 : Garanties et responsabilité',
    paragraphes: [
      "La responsabilité du Prestataire est engagée au titre d'une obligation de moyens dans le cadre de sa mission de conseil, d'assistance et de coordination. Elle ne saurait être recherchée au titre des fautes, retards ou manquements des entreprises, fournisseurs ou prestataires tiers intervenant sur le projet, sauf s'il s'agit de sous-traitants mandatés directement par le Prestataire.",
      "En tout état de cause, la responsabilité du Prestataire est limitée, tous préjudices confondus, au montant HT du Marché concerné, et strictement circonscrite aux dommages directs, à l'exclusion de tout dommage indirect ou immatériel (perte d'exploitation, perte de chance, atteinte à l'image, etc.).",
    ],
  },
  {
    titre: 'Article 10 : Propriété intellectuelle et confidentialité',
    paragraphes: [
      "Les documents, études, plannings et livrables établis par le Prestataire dans le cadre du Marché demeurent sa propriété jusqu'au paiement intégral du prix. À compter de ce paiement, le Client bénéficie d'un droit d'usage de ces documents pour les seuls besoins du projet concerné.",
      "Chaque partie s'engage à conserver strictement confidentielles les informations de nature confidentielle dont elle aurait connaissance à l'occasion de l'exécution du Marché, pendant toute sa durée et après son terme.",
    ],
  },
  {
    titre: 'Article 11 : Données personnelles',
    paragraphes: [
      "Au sens de la présente clause, les « Données à caractère personnel » s'entendent au sens du Règlement (UE) 2016/679 du 27 avril 2016 (« RGPD »). Chaque partie, agissant en qualité de responsable de traitement pour ce qui la concerne, s'engage à traiter les Données à caractère personnel qui lui sont communiquées dans le cadre du Marché conformément à la réglementation applicable.",
      `Le Client dispose d'un droit d'accès, de rectification, de suppression et d'opposition qu'il peut exercer en écrivant à ${E.nom}, ${E.adresse}, ${E.codePostal} ${E.ville}, ou à ${E.contact.email}. Il dispose également du droit d'introduire une réclamation auprès de la Commission Nationale de l'Informatique et des Libertés (www.cnil.fr).`,
    ],
  },
  {
    titre: 'Article 12 : Droit applicable et clause attributive de juridiction',
    paragraphes: [
      "Le Marché est soumis au droit français. En cas de différend, le Client s'engage, avant toute action contentieuse à l'encontre du Prestataire, à en rechercher une résolution amiable. À défaut d'accord amiable, tout litige relatif à la validité, l'interprétation ou l'exécution du Marché relève de la compétence exclusive du Tribunal de Commerce de " + E.rcsVille + ", y compris en cas de pluralité de défendeurs ou d'appel en garantie.",
    ],
  },
  {
    titre: 'Article 13 : Élection de domicile',
    paragraphes: [
      "Chacune des parties fait élection de domicile à son siège social tel qu'indiqué en tête des présentes conditions générales de vente ou dans le devis / la commande accepté(e).",
    ],
  },
]

// Ajoute une ou plusieurs pages au document jsPDF avec les CGV réparties
// sur deux colonnes (comme un document juridique classique), en respectant
// les sauts de page automatiques.
export function ajouterPagesCGV(doc) {
  const gap = 8
  const colW = (MARGIN_R - MARGIN_L - gap) / 2
  const col1X = MARGIN_L
  const col2X = MARGIN_L + colW + gap
  const yTop = 26
  const yBottom = 280

  let col = 0
  let x = col1X
  let y = yTop

  function enTetePage(suite) {
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    doc.text('Conditions générales de vente' + (suite ? ' (suite)' : ''), MARGIN_L, 16)
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.6)
    doc.line(MARGIN_L, 19, MARGIN_R, 19)
    doc.setLineWidth(0.2)
  }

  function nextColumn() {
    if (col === 0) { col = 1; x = col2X; y = yTop }
    else { doc.addPage(); enTetePage(true); col = 0; x = col1X; y = yTop }
  }

  doc.addPage()
  enTetePage(false)

  for (const art of CGV_ARTICLES) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.6); doc.setTextColor(...NAVY)
    const titreLines = doc.splitTextToSize(art.titre, colW)
    if (y + titreLines.length * 3.4 > yBottom) nextColumn()
    doc.text(titreLines, x, y)
    y += titreLines.length * 3.4 + 1.8

    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(60, 60, 60)
    for (const para of art.paragraphes) {
      const lines = doc.splitTextToSize(para, colW)
      for (const line of lines) {
        if (y > yBottom) nextColumn()
        doc.text(line, x, y)
        y += 3.1
      }
      y += 1.6
    }
    y += 2.6
  }

  doc.setTextColor(...NAVY)
}
