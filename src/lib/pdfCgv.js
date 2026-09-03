// Conditions générales de vente de Partenaires Particuliers, jointes aux
// devis et factures clients générés par l'ERP — disponibles en français et
// en anglais (voir pdfI18n.js / le choix de langue au moment de générer le
// PDF). La version anglaise est une traduction de courtoisie ; en cas de
// litige, c'est la version française qui fait foi (voir la mention ajoutée
// en tête de l'annexe anglaise).
//
// ⚠️ Ce texte est une adaptation — à la structure et à l'esprit d'un modèle
// de CGV BTP classique — aux informations réelles de Partenaires Particuliers
// (SASU, capital, SIRET, RCS Paris, assurance AXA) et à une activité de
// conseil / AMO / OPC plutôt que de vente de biens. Ce n'est PAS un avis
// juridique : il est recommandé de le faire relire par un avocat ou un
// expert-comptable avant un usage commercial, notamment les clauses de
// paiement, de responsabilité et de compétence juridictionnelle. La
// traduction anglaise doit être relue avec la même attention.
import { ENTREPRISE } from './entreprise'
import { INK, MARGIN_L, MARGIN_R } from './pdfStyle'
import { L } from './pdfI18n'

const E = ENTREPRISE

// Comme dans pdfStyle.js : pas de toLocaleString('fr-FR') dans un PDF — sa
// espace fine insécable (U+202F) s'affiche comme un caractère parasite
// (« 30 /000 » au lieu de « 30 000 ») avec la police standard de jsPDF.
const capitalSocialFmt = String(E.capitalSocial).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export const CGV_ARTICLES = {
  fr: [
    {
      titre: 'Article 1 : Préambule',
      paragraphes: [
        `Les présentes conditions générales de vente ont pour objet de régir les relations entre, d'une part, la société ${E.nom}, ${E.formeJuridique} (${E.formeJuridiqueLongue}) au capital de ${capitalSocialFmt} euros, immatriculée au Registre du Commerce et des Sociétés de ${E.rcsVille} sous le numéro ${E.siren}, dont le siège social est situé ${E.adresse}, ${E.codePostal} ${E.ville} (ci-après « ${E.nom} » ou « le Prestataire »), et d'autre part le client (ci-après le « Client ») qui confie au Prestataire tout ou partie d'une mission de conseil, d'assistance à maîtrise d'ouvrage, d'ordonnancement, de pilotage et coordination (OPC) ou de gestion de projet d'aménagement.`,
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
  ],
  en: [
    {
      titre: 'Article 1: Preamble',
      paragraphes: [
        `These general terms and conditions of sale (the "Terms") govern the relationship between, on the one hand, ${E.nom}, a ${E.formeJuridique} (${E.formeJuridiqueLongue}) with a share capital of €${capitalSocialFmt}, registered with the Trade and Companies Register of ${E.rcsVille} under number ${E.siren}, whose registered office is located at ${E.adresse}, ${E.codePostal} ${E.ville} (hereinafter "${E.nom}" or the "Provider"), and on the other hand the client (hereinafter the "Client") who engages the Provider to carry out all or part of a consulting, project management assistance, scheduling, coordination and supervision (OPC), or development project management assignment.`,
        `Acceptance of any quote or order placed with the Provider implies unconditional acceptance of these Terms. Any reservation raised by the Client shall only be enforceable against the Provider if it has been accepted in writing and in advance by the Provider. The contractual relationship (hereinafter the "Agreement") consists, in descending order of precedence, of the accepted quote or order, followed by these Terms.`,
      ],
    },
    {
      titre: 'Article 2: Purpose of the Agreement',
      paragraphes: [
        "The Agreement specifies, in particular: the name and capacity of the parties; the nature, purpose and place of performance of the assignment; the price; the performance period; and the payment terms.",
        "Should the Client request a change to the Agreement, in particular an additional service, it shall be agreed by both parties through a written amendment specifying its impact on price and performance period.",
      ],
    },
    {
      titre: 'Article 3: Performance period',
      paragraphes: [
        "The performance period for the assignment is that specified in the accepted quote or order. Within eight (8) days of the occurrence of a force majeure event or any other legitimate cause for suspension of the Agreement, the Provider shall notify the Client in writing, with supporting evidence, specifying the foreseeable impact on the performance of the assignment.",
        "Force majeure events are those meeting the conditions of Article 1218 of the French Civil Code, as well as any delay attributable to the Client (late provision of information, documents or access required for the performance of the assignment).",
        "In the event of an unjustified delay exceeding thirty (30) days, the Client may give the Provider formal notice to perform within eight (8) days, without this giving rise to compensation exceeding 2% of the amount of the Agreement, except in the case of duly established gross negligence.",
      ],
    },
    {
      titre: 'Article 4: Pricing',
      paragraphes: [
        'The price of the assignment is set out in the quote accepted by the Client. Unless otherwise stated, prices are expressed in euros excluding VAT, with VAT at the applicable rate (' + E.tvaTauxDefaut + '% as of the date hereof) added thereto.',
      ],
    },
    {
      titre: 'Article 5: Payment terms',
      paragraphes: [
        "Unless otherwise stated in the accepted quote, the balance is payable upon receipt of invoice, within thirty (30) days of the invoice date, by bank transfer to the account details shown on the invoice.",
        "Any late payment automatically triggers, without prior notice, late-payment interest at the European Central Bank's refinancing rate plus 10 percentage points, as well as a flat-rate compensation of €40 for collection costs per unpaid invoice, in accordance with Articles L441-10 and D441-5 of the French Commercial Code. Additional compensation may be claimed, upon justification, if the collection costs actually incurred exceed this flat-rate amount.",
        'No discount is granted for early payment.',
      ],
    },
    {
      titre: 'Article 6: Performance of the assignment',
      paragraphes: [
        `${E.nom} uses its best efforts to ensure the proper performance of the Agreement and, where applicable, coordinates the actions of the various parties involved in the project. It selects any subcontractors and service providers in compliance with applicable regulations and remains solely responsible to the Client for the proper performance of any subcontracted services.`,
        "It is the Client's responsibility to provide the Provider with all information, documents and access necessary for the proper performance of its assignment, in particular those relating to the technical nature of the project. The Provider shall not be held liable for any delay, error or failure resulting from information or documents that are incorrect, incomplete, or provided late by the Client.",
      ],
    },
    {
      titre: 'Article 7: Acceptance of services and deliverables',
      paragraphes: [
        "The Client's acceptance of the services performed or deliverables provided constitutes acceptance without reservation, unless a written and reasoned notice is sent to the Provider within eight (8) days of their delivery.",
      ],
    },
    {
      titre: 'Article 8: Insurance',
      paragraphes: [
        `${E.nom} has taken out professional civil liability insurance with ${E.assurance.compagnie} covering the financial consequences of any civil liability it may incur under the Agreement. A valid certificate of insurance is provided to the Client upon request.`,
      ],
    },
    {
      titre: 'Article 9: Warranties and liability',
      paragraphes: [
        "The Provider's liability is an obligation of means in connection with its consulting, assistance and coordination assignment. It cannot be held liable for the faults, delays or failures of third-party companies, suppliers or service providers involved in the project, except where they are subcontractors directly engaged by the Provider.",
        "In any event, the Provider's liability is limited, for all damages combined, to the amount excluding VAT of the relevant Agreement, and strictly limited to direct damages, excluding any indirect or intangible damage (loss of business, loss of opportunity, harm to reputation, etc.).",
      ],
    },
    {
      titre: 'Article 10: Intellectual property and confidentiality',
      paragraphes: [
        "The documents, studies, schedules and deliverables prepared by the Provider under the Agreement remain its property until the price has been paid in full. From the date of such payment, the Client is granted a right to use these documents solely for the needs of the project concerned.",
        "Each party undertakes to keep strictly confidential any information of a confidential nature it may become aware of in the course of performing the Agreement, for its entire duration and thereafter.",
      ],
    },
    {
      titre: 'Article 11: Personal data',
      paragraphes: [
        'For the purposes of this clause, "Personal Data" has the meaning given to it under Regulation (EU) 2016/679 of 27 April 2016 (the "GDPR"). Each party, acting as data controller for the data it processes, undertakes to process any Personal Data communicated to it under the Agreement in accordance with applicable regulations.',
        `The Client has the right to access, rectify, erase and object to the processing of their data, which they may exercise by writing to ${E.nom}, ${E.adresse}, ${E.codePostal} ${E.ville}, or to ${E.contact.email}. The Client also has the right to lodge a complaint with the French data protection authority (CNIL, www.cnil.fr).`,
      ],
    },
    {
      titre: 'Article 12: Governing law and jurisdiction',
      paragraphes: [
        "The Agreement is governed by French law. In the event of a dispute, the Client agrees to seek an amicable resolution before taking any legal action against the Provider. Failing an amicable settlement, any dispute relating to the validity, interpretation or performance of the Agreement shall fall under the exclusive jurisdiction of the " + E.rcsVille + " Commercial Court, including in the event of multiple defendants or third-party proceedings.",
      ],
    },
    {
      titre: 'Article 13: Domicile',
      paragraphes: [
        "Each party elects domicile at its registered office as indicated at the head of these Terms or in the accepted quote / order.",
      ],
    },
  ],
}

// Ajoute une ou plusieurs pages au document jsPDF avec les CGV réparties
// sur deux colonnes (comme un document juridique classique), en respectant
// les sauts de page automatiques. lang = 'fr' | 'en'.
export function ajouterPagesCGV(doc, lang = 'fr') {
  const t = L[lang]
  const articles = CGV_ARTICLES[lang] || CGV_ARTICLES.fr
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
    doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    doc.text(t.cgvTitre + (suite ? t.suite : ''), MARGIN_L, 16)
    doc.setDrawColor(...INK); doc.setLineWidth(0.6)
    doc.line(MARGIN_L, 19, MARGIN_R, 19)
    doc.setLineWidth(0.2)
  }

  function nextColumn() {
    if (col === 0) { col = 1; x = col2X; y = yTop }
    else { doc.addPage(); enTetePage(true); col = 0; x = col1X; y = yTop }
  }

  doc.addPage()
  enTetePage(false)

  // Traduction de courtoisie : on précise que c'est la version française qui
  // fait foi en cas de litige (pratique standard pour un document juridique
  // bilingue).
  if (lang === 'en') {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(6.6); doc.setTextColor(107, 114, 128)
    const noteLines = doc.splitTextToSize(
      'This English version is a courtesy translation provided for information purposes only. In the event of any discrepancy or dispute, the original French version of these terms and conditions shall prevail.',
      colW
    )
    doc.text(noteLines, x, y)
    y += noteLines.length * 3.1 + 3
  }

  for (const art of articles) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.6); doc.setTextColor(...INK)
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

  doc.setTextColor(...INK)
}
