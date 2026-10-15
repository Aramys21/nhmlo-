import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Trash2 } from 'lucide-react'
import { API, api, type Organization, type OrganizationDocument, type OrganizationMember, type Page } from './api'

export function TeamPanel({ organization, onChanged }: { organization: Organization; onChanged: () => void }) {
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const load = () => api<Page<OrganizationMember>>(`/organizations/${organization.id}/members/`).then((page) => setMembers(page.results)).catch((e: Error) => setError(e.message))
  useEffect(() => { load() }, [organization.id])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSaving(true)
    const formElement = event.currentTarget
    const values = Object.fromEntries(new FormData(formElement).entries())
    try { await api(`/organizations/${organization.id}/members/`, { method: 'POST', body: JSON.stringify(values) }); formElement.reset(); await load(); onChanged() } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  const remove = async (member: OrganizationMember) => {
    try { await api(`/organizations/${organization.id}/members/${member.id}/`, { method: 'DELETE' }); await load() } catch (e) { setError((e as Error).message) }
  }
  const labels: Record<string, string> = { owner: 'Propriétaire', admin: 'Administrateur', publisher: 'Publication des activités', bookings: 'Gestion des réservations', profile: 'Modification du profil' }
  return <section className="org-panel"><div className="section-heading"><div><p className="eyebrow">ACCÈS À L’ÉQUIPE</p><h2>Membres autorisés.</h2></div></div><p className="panel-explainer">Ajoutez des personnes qui possèdent déjà un compte Rihla, puis attribuez uniquement les accès dont elles ont besoin.</p>{error && <p className="review-error">{error}</p>}<div className="team-list">{members.map((member) => <div className="team-row" key={member.id}><span className="organizer-avatar">{member.username[0]?.toUpperCase()}</span><span><strong>{member.username}</strong><small>{member.email}</small></span><span className="team-role">{labels[member.role] ?? member.role}</span>{member.role !== 'owner' && <button type="button" aria-label={`Retirer ${member.username}`} onClick={() => remove(member)}><Trash2 size={15}/></button>}</div>)}</div>{['owner', 'admin'].includes(organization.current_user_role ?? '') && <form className="team-add-form" onSubmit={submit}><label className="field-label">Adresse e-mail du membre<input name="user_email" type="email" required placeholder="membre@exemple.dz"/></label><label className="field-label">Droits<select name="role"><option value="publisher">Publier et gérer les activités</option><option value="bookings">Gérer les réservations</option><option value="profile">Modifier le profil public</option>{organization.current_user_role === 'owner' && <option value="admin">Administrer les membres et le profil</option>}</select></label><button className="button button-small" disabled={saving}>{saving ? 'Ajout…' : 'Ajouter le membre'} <ArrowRight size={14}/></button></form>}</section>
}

export function OrganizationProfilePanel({ organization, onSaved }: { organization: Organization; onSaved: () => void }) {
  const [error, setError] = useState('')
  const [documents, setDocuments] = useState<OrganizationDocument[]>([])
  const [saving, setSaving] = useState(false)
  useEffect(() => { api<Page<OrganizationDocument>>(`/organization-documents/?organization=${organization.id}`).then((page) => setDocuments(page.results)).catch(() => setDocuments([])) }, [organization.id])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSaving(true)
    const form = new FormData(event.currentTarget)
    for (const key of ['logo', 'cover']) { const file = form.get(key); if (file instanceof File && !file.size) form.delete(key) }
    try { await api(`/organizations/${organization.id}/`, { method: 'PATCH', body: form }); onSaved() } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  const uploadDocuments = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('')
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const files = form.getAll('file').filter((file): file is File => file instanceof File && file.size > 0)
    if (!files.length) { setError('Choisissez au moins un justificatif.'); return }
    try { for (const file of files) { const body = new FormData(); body.set('organization', String(organization.id)); body.set('kind', String(form.get('kind'))); body.set('file', file); await api('/organization-documents/', { method: 'POST', body }) }; const page = await api<Page<OrganizationDocument>>(`/organization-documents/?organization=${organization.id}`); setDocuments(page.results); formElement.reset() } catch (e) { setError((e as Error).message) }
  }
  const downloadDocument = async (doc: OrganizationDocument) => {
    try {
      const token = localStorage.getItem('rihla_token')
      const response = await fetch(`${API}/organization-documents/${doc.id}/download/`, { headers: token ? { Authorization: `Token ${token}` } : {} })
      if (!response.ok) throw new Error('Le téléchargement de ce justificatif a échoué.')
      const objectUrl = URL.createObjectURL(await response.blob())
      const anchor = window.document.createElement('a'); anchor.href = objectUrl; anchor.download = `justificatif-${doc.id}`; anchor.click(); URL.revokeObjectURL(objectUrl)
    } catch (e) { setError((e as Error).message) }
  }
  const deleteDocument = async (document: OrganizationDocument) => {
    try { await api(`/organization-documents/${document.id}/`, { method: 'DELETE' }); setDocuments((items) => items.filter((item) => item.id !== document.id)) } catch (e) { setError((e as Error).message) }
  }
  const mayEdit = ['owner', 'admin', 'profile'].includes(organization.current_user_role ?? '')
  if (!mayEdit) return <section className="org-panel"><p className="panel-explainer">Votre rôle ne permet pas de modifier le profil. Demandez cet accès à un administrateur de l’organisation.</p></section>
  const documentNames: Record<string, string> = { business: 'Registre ou agrément', identity: 'Justificatif d’identité', other: 'Autre justificatif' }
  return <section className="org-panel"><div className="section-heading"><div><p className="eyebrow">PRÉSENCE PUBLIQUE</p><h2>Votre organisation.</h2></div></div><form className="org-profile-form" onSubmit={submit}><label className="field-label">Nom public<input name="name" required defaultValue={organization.name}/></label><label className="field-label">Type d’organisation<select name="kind" defaultValue={organization.kind}><option value="agency">Agence de voyages</option><option value="club">Club de randonnée</option><option value="association">Association</option></select></label><label className="field-label">Zone d’activité<input name="region" defaultValue={organization.region}/></label><label className="field-label">E-mail public<input name="public_email" type="email" defaultValue={organization.public_email}/></label><label className="field-label">Téléphone<input name="public_phone" defaultValue={organization.public_phone}/></label><label className="field-label">Site web<input name="website" type="url" defaultValue={organization.website}/></label><label className="field-label">Instagram<input name="instagram" type="url" defaultValue={organization.instagram} placeholder="https://instagram.com/…"/></label><label className="field-label">Facebook<input name="facebook" type="url" defaultValue={organization.facebook}/></label><label className="field-label">TikTok<input name="tiktok" type="url" defaultValue={organization.tiktok}/></label><label className="field-label">Logo<input name="logo" type="file" accept="image/*"/></label><label className="field-label">Photo de couverture<input name="cover" type="file" accept="image/*"/></label><label className="field-label field-span">Présentation<textarea name="about" rows={4} defaultValue={organization.about}/></label>{error && <p className="review-error">{error}</p>}<button className="button button-small" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer le profil'} <ArrowRight size={14}/></button></form><div className="verification-box"><strong>{organization.verification === 'verified' ? 'Organisation vérifiée' : organization.verification === 'rejected' ? 'Des compléments sont demandés' : 'Vérification en attente'}</strong><p>{organization.verification_note || 'La vérification concerne les justificatifs administratifs de l’organisation, pas la qualité de ses activités.'}</p><form className="document-form" onSubmit={uploadDocuments}><label className="field-label">Type de justificatif<select name="kind"><option value="business">Registre ou agrément</option><option value="identity">Justificatif d’identité</option><option value="other">Autre justificatif</option></select></label><label className="field-label">Documents (PDF, JPG, PNG, WebP)<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple required/></label><button type="submit" className="button button-outline button-small">Ajouter des justificatifs</button></form>{documents.map((document) => <div className="document-row" key={document.id}><span>{documentNames[document.kind] ?? document.kind} · {new Date(document.created_at).toLocaleDateString('fr-DZ')}</span><button type="button" onClick={() => downloadDocument(document)} aria-label="Télécharger le justificatif"><ArrowRight size={14}/></button><button type="button" onClick={() => deleteDocument(document)} aria-label="Supprimer le justificatif"><Trash2 size={14}/></button></div>)}</div></section>
}
