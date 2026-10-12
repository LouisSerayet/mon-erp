import { useState } from 'react'
import { fmtEUR as fmt, fmtDateFr } from '../lib/calculs'
import { colors, fonts, eyebrow, sectionTitle, quietLink } from '../lib/theme'

// Section TVA (collectée / déductible / nette) sur une période donnée —
// extrait de Resultat.jsx (Compte de résultat) pour être réutilisé tel
// quel dans l'onglet TVA de Trésorerie (voir Tresorerie.jsx) : même calcul,
// mêmes règles (autoliquidation, taux par ligne...), même rendu — un seul
// endroit à corriger si jamais une règle doit changer, au lieu de risquer
// que les deux pages divergent silencieusement (voir lib/tva.js).
//
// `data` : le résultat de calculerTva()/fetchTva() (lib/tva.js) — ne fait
// aucun calcul lui-même, uniquement du rendu. `titre` est personnalisable
// (le libellé par défaut suppose déjà un contexte "sur une période" donné
// par l'appelant, via le sélecteur de dates affiché juste au-dessus).
export function BlocTva({ data, isMobile, titre = 'TVA sur la période' }) {
  // État local (quel détail est déplié) — purement présentationnel, pas
  // besoin que l'appelant le connaisse ou le fasse persister.
  const [detailOuvert, setDetailOuvert] = useState(null) // null | 'collectee' | 'deductible'

  if (!data) return null

  return (
    <div>
      <h2 style={sectionTitle}>{titre}</h2>
      <p style={{ fontSize: 12, color: colors.inkFaint, margin: '10px 0 20px', maxWidth: 620 }}>
        Ordre de grandeur, pas une déclaration : calculé sur les factures avec date, émises ou reçues sur la période choisie.
        {data.nbAutoliquidation > 0 && (
          <> {data.nbAutoliquidation} facture{data.nbAutoliquidation > 1 ? 's' : ''} fournisseur{data.nbAutoliquidation > 1 ? 's' : ''} en autoliquidation ({fmt(data.montantAutoliquidation)}) neutre{data.nbAutoliquidation > 1 ? 's' : ''} pour la TVA, donc exclue{data.nbAutoliquidation > 1 ? 's' : ''} du calcul.</>
        )}
        {' '}À confirmer avec Pennylane ou ton comptable avant de reverser quoi que ce soit.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)' }}>
        {[
          { label: 'TVA collectée', value: fmt(data.tvaCollectee), sub: 'Sur les factures clients', detailKey: 'collectee' },
          { label: 'TVA déductible', value: fmt(data.tvaDeductible), sub: 'Achats ' + fmt(data.tvaDeductibleAchats) + ' + dépenses ' + fmt(data.tvaDeductibleDepenses), detailKey: 'deductible' },
          {
            label: data.tvaNette >= 0 ? 'TVA à reverser' : 'Crédit de TVA',
            value: fmt(Math.abs(data.tvaNette)),
            sub: data.tvaNette >= 0 ? 'Collectée − déductible' : 'Déductible > collectée',
            color: data.tvaNette >= 0 ? colors.warning : colors.success,
          },
        ].map((k, i) => (
          <div key={k.label} style={{ padding: isMobile ? '16px 0' : '0 24px', borderLeft: (!isMobile && i > 0) ? '1px solid ' + colors.line : 'none', borderTop: (isMobile && i > 1) ? '1px solid ' + colors.line : 'none' }}>
            <div style={eyebrow}>{k.label}</div>
            <div style={{ fontFamily: fonts.mono, fontSize: 20, fontWeight: 500, margin: '8px 0 4px', fontVariantNumeric: 'tabular-nums', color: k.color || colors.ink }}>{k.value}</div>
            <div style={{ fontSize: 11, color: colors.inkFaint }}>{k.sub}</div>
            {k.detailKey && (
              <button onClick={() => setDetailOuvert(p => (p === k.detailKey ? null : k.detailKey))} style={{ ...quietLink, fontSize: 11, marginTop: 8, display: 'inline-block' }}>
                {detailOuvert === k.detailKey ? 'Masquer le détail' : 'Voir le détail'}
              </button>
            )}
          </div>
        ))}
      </div>

      {detailOuvert === 'collectee' && (
        <div style={{ marginTop: 24, borderTop: '1px solid ' + colors.line, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: isMobile ? 560 : 'auto' }}>
            <thead>
              <tr style={{ color: colors.inkFaint, fontSize: 10.5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 500 }}>Date</th>
                <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 500 }}>Facture</th>
                <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 500 }}>Projet</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 500 }}>Montant HT</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 500 }}>Taux</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 500 }}>TVA</th>
              </tr>
            </thead>
            <tbody>
              {data.detailCollectee.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '20px 8px', textAlign: 'center', color: colors.inkFaint }}>Aucune facture client sur cette période.</td></tr>
              ) : data.detailCollectee.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid ' + colors.line }}>
                  <td style={{ padding: '9px 8px', color: colors.inkMuted, whiteSpace: 'nowrap' }}>{fmtDateFr(l.date)}</td>
                  <td style={{ padding: '9px 8px' }}>{l.ref}</td>
                  <td style={{ padding: '9px 8px', color: colors.inkMuted }}>{l.secondaire}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(l.montantHt)}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', color: colors.inkMuted }}>{l.taux} %</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(l.tva)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailOuvert === 'deductible' && (
        <div style={{ marginTop: 24, borderTop: '1px solid ' + colors.line, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: isMobile ? 640 : 'auto' }}>
            <thead>
              <tr style={{ color: colors.inkFaint, fontSize: 10.5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 500 }}>Date</th>
                <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 500 }}>Référence</th>
                <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 500 }}>Source</th>
                <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 500 }}>Détail</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 500 }}>Montant HT</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 500 }}>Taux</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 500 }}>TVA</th>
              </tr>
            </thead>
            <tbody>
              {data.detailDeductible.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '20px 8px', textAlign: 'center', color: colors.inkFaint }}>Aucun achat ou dépense sur cette période.</td></tr>
              ) : data.detailDeductible.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid ' + colors.line }}>
                  <td style={{ padding: '9px 8px', color: colors.inkMuted, whiteSpace: 'nowrap' }}>{fmtDateFr(l.date)}</td>
                  <td style={{ padding: '9px 8px' }}>{l.ref}</td>
                  <td style={{ padding: '9px 8px', color: l.source === 'Autoliquidation (neutre)' ? colors.warning : colors.inkMuted, whiteSpace: 'nowrap' }}>{l.source}</td>
                  <td style={{ padding: '9px 8px', color: colors.inkMuted }}>{l.secondaire}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(l.montantHt)}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', color: colors.inkMuted }}>{l.taux} %</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(l.tva)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
