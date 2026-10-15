import { useEffect, useState, type FormEvent } from 'react'
import { Star } from 'lucide-react'
import { api, formatDate, type Page, type Review } from './api'

function Stars({ value }: { value: number }) {
  return <span className="review-stars" aria-label={`${value} sur 5`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} fill={i < Math.round(value) ? 'currentColor' : 'none'} />)}</span>
}

export function RatingSummary({ rating, count }: { rating: number | null; count: number }) {
  return <span className="rating-summary">{rating !== null ? <><Stars value={rating}/><strong>{Number(rating).toFixed(1)}</strong></> : <span className="rating-empty">Pas encore d’avis</span>}{count > 0 && <small>{count} avis</small>}</span>
}

export default function ReviewsList({ organization, trip, userId }: { organization?: number; trip?: number; userId?: number }) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [ordering, setOrdering] = useState('recent')
  const [reporting, setReporting] = useState<number | null>(null)
  const [reported, setReported] = useState<number[]>([])
  const [reportError, setReportError] = useState('')
  useEffect(() => {
    const params = new URLSearchParams({ ordering })
    if (organization) params.set('organization', String(organization))
    if (trip) params.set('trip', String(trip))
    api<Page<Review>>(`/reviews/?${params}`).then((page) => setReviews(page.results)).catch(() => setReviews([]))
  }, [organization, trip, ordering])
  const submitReport = async (event: FormEvent<HTMLFormElement>, reviewId: number) => {
    event.preventDefault(); setReportError('')
    const form = new FormData(event.currentTarget)
    try { await api('/reports/', { method: 'POST', body: JSON.stringify({ review: reviewId, reason: form.get('reason'), description: form.get('description') }) }); setReported((items) => [...items, reviewId]); setReporting(null) } catch (e) { setReportError((e as Error).message) }
  }
  return <section className="reviews-section"><div className="reviews-heading"><div><p className="eyebrow">LES RETOURS DES VOYAGEURS</p><h2>Leurs histoires.</h2></div><label className="review-sort">Trier par <select value={ordering} onChange={(event) => setOrdering(event.target.value)}><option value="recent">Plus récents</option><option value="rating">Meilleures notes</option><option value="rating_asc">Notes les plus basses</option></select></label></div>{reviews.length ? <div className="review-list">{reviews.map((review) => <article className="public-review" key={review.id}><div className="public-review-head"><Stars value={review.organization_rating}/><span>{formatDate(review.created_at)}</span></div><strong>{review.reviewer_name}</strong><p className="review-activity-name">{review.trip_title}</p>{review.comment && <p>{review.comment}</p>}<div className="review-tags">{review.communication_rating && <span>Communication {review.communication_rating}/5</span>}{review.program_rating && <span>Programme {review.program_rating}/5</span>}{review.value_rating && <span>Rapport qualité-prix {review.value_rating}/5</span>}</div>{userId && review.reviewer !== userId && (reported.includes(review.id) ? <small className="review-published-note">Signalement envoyé</small> : <div className="review-report"><button type="button" className="text-link" onClick={() => setReporting(reporting === review.id ? null : review.id)}>Signaler cet avis</button>{reporting === review.id && <form onSubmit={(event) => submitReport(event, review.id)}><select name="reason" aria-label="Motif"><option value="abusive">Contenu inapproprié</option><option value="spam">Publicité indésirable</option><option value="other">Autre motif</option></select><input name="description" maxLength={1200} placeholder="Précisez si besoin"/><button className="button button-small">Envoyer</button>{reportError && <span>{reportError}</span>}</form>}</div>)}</article>)}</div> : <p className="reviews-empty">Aucun avis publié pour le moment.</p>}</section>
}
