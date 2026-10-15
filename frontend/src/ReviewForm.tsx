import { useState, type FormEvent } from 'react'
import { ArrowRight, Star } from 'lucide-react'
import { api } from './api'

function ScoreInput({ name, label, value, onChange, optional = false }: { name: string; label: string; value: number | null; onChange: (value: number | null) => void; optional?: boolean }) {
  return <fieldset className="review-score"><legend>{label}{optional && <small> · facultatif</small>}</legend><div>{[1, 2, 3, 4, 5].map((score) => <button type="button" key={`${name}-${score}`} className={value !== null && score <= value ? 'selected' : ''} aria-label={`${score} sur 5`} onClick={() => onChange(score)}><Star size={18} fill={value !== null && score <= value ? 'currentColor' : 'none'} /></button>)}{optional && value !== null && <button type="button" className="review-clear" onClick={() => onChange(null)}>Effacer</button>}</div></fieldset>
}

export default function ReviewForm({ booking, onSubmitted }: { booking: number; onSubmitted: () => void }) {
  const [organizationRating, setOrganizationRating] = useState<number | null>(null)
  const [activityRating, setActivityRating] = useState<number | null>(null)
  const [communicationRating, setCommunicationRating] = useState<number | null>(null)
  const [programRating, setProgramRating] = useState<number | null>(null)
  const [valueRating, setValueRating] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('')
    if (!organizationRating) { setError('Choisissez une note pour l’organisation.'); return }
    setSaving(true)
    const form = new FormData(event.currentTarget)
    try {
      await api('/reviews/', { method: 'POST', body: JSON.stringify({ booking, organization_rating: organizationRating, activity_rating: activityRating, communication_rating: communicationRating, program_rating: programRating, value_rating: valueRating, comment: form.get('comment') }) })
      onSubmitted()
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  return <form className="review-form" onSubmit={submit}><ScoreInput name="organization" label="Votre expérience avec l’organisation" value={organizationRating} onChange={setOrganizationRating}/><ScoreInput name="activity" label="L’activité" value={activityRating} onChange={setActivityRating} optional/><div className="review-criteria"><ScoreInput name="communication" label="Communication" value={communicationRating} onChange={setCommunicationRating} optional/><ScoreInput name="program" label="Programme respecté" value={programRating} onChange={setProgramRating} optional/><ScoreInput name="value" label="Rapport qualité-prix" value={valueRating} onChange={setValueRating} optional/></div><label className="field-label">Un mot à partager ?<textarea name="comment" rows={3} maxLength={1800} placeholder="Comment s’est passée votre aventure ?"/></label>{error && <p className="review-error">{error}</p>}<button className="button button-small" disabled={saving}>{saving ? 'Envoi…' : 'Publier mon avis'} <ArrowRight size={14}/></button></form>
}
