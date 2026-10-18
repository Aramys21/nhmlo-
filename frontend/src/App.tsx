import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, CircleUserRound, Clock3, Compass, Heart, LogOut, MapPin, Menu, Mountain, Search, SlidersHorizontal, Sparkles, TentTree, Waves, X } from 'lucide-react'
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { api, formatDate, money, type AdminStats, type Booking, type Category, type Notification, type Organizer, type Page, type PickupPoint, type Report, type Trip, type User } from './api'
import { RatingSummary } from './ReviewsList'
import ReviewsList from './ReviewsList'
import ReviewForm from './ReviewForm'
import { OrganizationProfilePanel, TeamPanel } from './OrganizationPanels'

const fallbackImages = [
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=85',
]
const statusLabels: Record<string, string> = { pending: 'En attente', confirmed: 'Confirmée', declined: 'Refusée', traveler_cancelled: 'Annulée par vous', organizer_cancelled: 'Annulée par l’organisateur', completed: 'Terminée' }
const categoryIcons: Record<string, ReactNode> = { randonnee: <Mountain />, excursion: <Compass />, 'voyage-organise': <Compass />, camping: <TentTree />, montagne: <Mountain />, 'plage-mer': <Waves /> }
type GeoResult = { place_id: number; display_name: string; lat: string; lon: string }

type AuthValue = { user: User | null; setUser: (user: User | null) => void; logout: () => void }
const AuthContext = createContext<AuthValue>({ user: null, setUser: () => undefined, logout: () => undefined })
function useAuthState() {
  const [user, setLocal] = useState<User | null>(() => {
    const saved = localStorage.getItem('rihla_user')
    return saved ? JSON.parse(saved) as User : null
  })
  const setUser = useCallback((next: User | null) => {
    setLocal(next)
    next ? localStorage.setItem('rihla_user', JSON.stringify(next)) : localStorage.removeItem('rihla_user')
  }, [])
  useEffect(() => {
    if (localStorage.getItem('rihla_token') && !user) {
      api<User>('/auth/me/').then(setUser).catch(() => localStorage.removeItem('rihla_token'))
    }
  }, [])
  return { user, setUser, logout: () => { localStorage.removeItem('rihla_token'); setUser(null) } }
}
function useSession() { return useContext(AuthContext) }

function App() {
  const auth = useAuthState()
  return <AuthContext.Provider value={auth}><div className="site-shell"><Header /><main><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/activites" element={<ExplorePage />} />
    <Route path="/voyage/:id" element={<TripDetailPage />} />
    <Route path="/organisateurs" element={<OrganizersPage />} />
    <Route path="/organisateurs/:id" element={<OrganizerDetailPage />} />
    <Route path="/connexion" element={<AuthPage mode="login" />} />
    <Route path="/inscription" element={<AuthPage mode="register" />} />
    <Route path="/profil" element={<ProfilePage />} />
    <Route path="/pro" element={<OrganizerDashboard />} />
    <Route path="/administration" element={<AdminDashboard />} />
    <Route path="*" element={<NotFound />} />
  </Routes></main><Footer /></div></AuthContext.Provider>
}
export default App

function Header() {
  const { user, logout } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  useEffect(() => { if (user) api<Page<Notification>>('/notifications/').then((page) => setNotifications(page.results)).catch(() => undefined); else setNotifications([]) }, [user])
  const toggleNotifications = async () => {
    const willOpen = !notificationsOpen
    setNotificationsOpen(willOpen)
    if (willOpen && user) { try { const page = await api<Page<Notification>>('/notifications/'); setNotifications(page.results) } catch { /* Keep the header usable if notifications are unavailable. */ } }
  }
  const markRead = async (notification: Notification) => {
    if (!notification.is_read) { await api(`/notifications/${notification.id}/`, { method: 'PATCH', body: JSON.stringify({ is_read: true }) }); setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, is_read: true } : item)) }
  }
  const signOut = async () => { try { await api('/auth/logout/', { method: 'POST' }) } catch { /* Clear the local session even if the API cannot be reached. */ } finally { logout() } }
  return <header className="topbar"><div className="nav-wrap">
    <Link className="brand" to="/" aria-label="NHMLO, accueil"><span className="brand-mark"><img src="/nhmlo-mark.svg" alt="" /></span><span>NHMLO</span></Link>
    <button className="mobile-menu" aria-label="Ouvrir le menu" onClick={() => setMenuOpen((v) => !v)}>{menuOpen ? <X /> : <Menu />}</button>
    <nav className={menuOpen ? 'nav-links open' : 'nav-links'}>
      <NavLink to="/activites">Explorer</NavLink><NavLink to="/activites?universe=voyages">Voyages & Évasions</NavLink><NavLink to="/activites?universe=nature">Randonnées & Camping</NavLink><NavLink to="/organisateurs">Organisations</NavLink>
    </nav>
    <div className="nav-actions">
      {user ? <><div className="notification-wrap"><button className="icon-button notification-button" title="Notifications" onClick={toggleNotifications}><Bell size={18}/>{notifications.some((n) => !n.is_read) && <span className="notification-dot"/>}</button>{notificationsOpen && <div className="notification-popover"><div className="notification-heading"><strong>Notifications</strong><span>{notifications.filter((n) => !n.is_read).length} nouvelles</span></div>{notifications.length ? notifications.slice(0, 6).map((n) => <button className={n.is_read ? 'notification-item' : 'notification-item unread'} key={n.id} onClick={() => markRead(n)}><span>{n.message}</span><small>{new Intl.DateTimeFormat('fr-DZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(n.created_at))}</small></button>) : <p className="notification-empty">Aucune notification pour le moment.</p>}</div>}</div><Link className="nav-user" to={user.role === 'admin' ? '/administration' : '/pro'}><CircleUserRound size={18} /><span>{user.first_name || user.username}</span></Link><button className="icon-button" title="Se déconnecter" onClick={signOut}><LogOut size={17} /></button></> : <><Link className="login-link" to="/connexion">Connexion</Link><Link className="button button-small" to="/inscription">Créer un compte <ArrowUpRight size={15} /></Link></>}
    </div>
  </div></header>
}

function Footer() {
  return <footer className="footer"><div className="footer-top"><Link className="brand brand-light" to="/" aria-label="NHMLO, accueil"><span className="brand-mark"><img src="/nhmlo-mark.svg" alt="" /></span><span>NHMLO</span></Link><p>Les beaux souvenirs commencent quelque part.</p><Link className="footer-publish" to="/inscription?role=organizer">Vous organisez des sorties ? <span>Rejoignez-nous <ArrowRight size={15} /></span></Link></div><div className="footer-bottom"><span>© 2026 NHMLO · Fait avec soin en Algérie</span><div><Link to="/activites">Découvrir</Link><Link to="/organisateurs">Nos organisateurs</Link><a href="mailto:bonjour@rihla.dz">Nous contacter</a></div></div></footer>
}

function HomePage() {
  const [featured, setFeatured] = useState<Trip[]>([])
  const [soon, setSoon] = useState<Trip[]>([])
  const [recent, setRecent] = useState<Trip[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState('')
  const [destination, setDestination] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    api<Page<Trip>>('/trips/?featured=true&ordering=soonest').then((p) => setFeatured(p.results.slice(0, 3))).catch(() => undefined)
    api<Page<Trip>>('/trips/?ordering=soonest').then((p) => setSoon(p.results.slice(0, 4))).catch(() => undefined)
    api<Page<Trip>>('/trips/?ordering=recent').then((p) => setRecent(p.results.slice(0, 3))).catch(() => undefined)
    api<Page<Category>>('/categories/').then((p) => setCategories(p.results)).catch(() => undefined)
  }, [])
  const search = (event: FormEvent) => { event.preventDefault(); const params = new URLSearchParams(); if (query) params.set('q', query); if (destination) params.set('destination', destination); navigate(`/activites?${params}`) }
  return <>
    <section className="hero"><div className="hero-photo" /><div className="hero-shade" /><div className="hero-divider" /><div className="hero-inner">
      <div className="eyebrow hero-eyebrow"><span className="eyebrow-line" /> À CHACUN SON ÉVASION <span className="eyebrow-line" /></div>
      <h1>Du grand air aux<br /><em>séjours d’exception.</em></h1>
      <p className="hero-copy">Randonnée, bivouac, hôtel avec piscine ou escapade à l’international :<br className="desktop-only" /> trouvez le séjour qui vous ressemble.</p>
      <form className="hero-search" onSubmit={search}>
        <label><Search size={19} /><span><small>QUE SOUHAITEZ-VOUS FAIRE ?</small><input placeholder="Randonnée, hôtel, week-end…" value={query} onChange={(e) => setQuery(e.target.value)} /></span></label>
        <span className="search-divider" />
        <label><MapPin size={19} /><span><small>OÙ ?</small><input placeholder="Ici ou ailleurs…" value={destination} onChange={(e) => setDestination(e.target.value)} /></span></label>
        <button aria-label="Rechercher"><Search size={19} /><span>Explorer</span></button>
      </form>
      <div className="hero-note"><Sparkles size={15} /> Des expériences en Algérie et à l’international</div>
    </div><div className="hero-caption"><span>36°27' N — DJURDJURA, ALGÉRIE</span><span>01 / 04</span></div>
  </section>

    <section className="universe-section" aria-label="Explorer les deux univers"><Link className="universe-card universe-premium" to="/activites?universe=voyages"><div><span>VOYAGES & ÉVASIONS</span><h2>Le goût des beaux<br/>horizons.</h2><p>Hôtels de charme, resorts avec piscine et séjours en Algérie ou à l’international.</p><span className="universe-cta">Trouver une évasion <ArrowRight size={16}/></span></div></Link><Link className="universe-card universe-nature" to="/activites?universe=nature"><div><span>RANDONNÉES & CAMPING</span><h2>Prendre le chemin<br/>des grands espaces.</h2><p>Randonnées, treks, bivouacs et aventures au grand air.</p><span className="universe-cta">Partir à l’aventure <ArrowRight size={16}/></span></div></Link></section>

    <section className="section category-section"><div className="section-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> CHOISISSEZ VOTRE RYTHME</p><h2>Une envie, un chemin.</h2></div><Link className="text-link" to="/activites">Tout explorer <ArrowRight size={16} /></Link></div>
      <div className="category-row">{(categories.length ? categories : [{ id: 0, slug: 'randonnee', name: 'Randonnée' }, { id: 1, slug: 'excursion', name: 'Excursion' }, { id: 2, slug: 'voyage-organise', name: 'Voyage' }, { id: 3, slug: 'camping', name: 'Camping' }, { id: 4, slug: 'montagne', name: 'Montagne' }, { id: 5, slug: 'plage-mer', name: 'Mer & plage' }]).map((cat) => <Link className={`category-tile category-${cat.slug}`} to={`/activites?category=${cat.slug}`} key={cat.slug}><span className="category-icon">{categoryIcons[cat.slug] ?? <Compass />}</span><span>{cat.name}</span><ArrowUpRight size={15} className="cat-arrow" /></Link>)}</div>
    </section>

    <section className="section featured-section"><div className="section-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> À NE PAS MANQUER</p><h2>Nos coups de cœur<span className="green-period">.</span></h2><p className="section-subtitle">Des escapades et aventures choisies avec soin par notre communauté.</p></div><Link className="text-link" to="/activites?featured=true">Voir toutes les escapades <ArrowRight size={16} /></Link></div>
      {featured.length ? <div className="trip-grid trip-grid-featured">{featured.map((trip, i) => <TripCard trip={trip} key={trip.id} variant={i === 0 ? 'large' : 'normal'} />)}</div> : <EmptyState title="Les premières aventures arrivent" text="Revenez bientôt découvrir les sorties proposées près de chez vous." />}
    </section>

    {recent.length > 0 && <section className="section recommended-section"><div className="section-heading"><div><p className="eyebrow"><span className="eyebrow-line"/> FRAÎCHEMENT PUBLIÉ</p><h2>Cela pourrait vous intéresser.</h2><p className="section-subtitle">Les séjours et sorties récemment publiés par les organisateurs vérifiés.</p></div><Link className="text-link" to="/activites?ordering=recent">Les nouveautés <ArrowRight size={16}/></Link></div><div className="trip-grid trip-grid-3">{recent.map((trip) => <TripCard trip={trip} key={trip.id}/>)}</div></section>}

    <section className="section upcoming-section"><div className="section-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> PROCHAINES ÉVASIONS</p><h2>À vos prochaines dates.</h2></div><Link className="text-link" to="/activites?ordering=soonest">Toutes les dates <ArrowRight size={16} /></Link></div>
      {soon.length ? <div className="trip-grid trip-grid-4">{soon.map((trip) => <TripCard trip={trip} key={trip.id} />)}</div> : <EmptyState title="À venir très bientôt" text="De nouvelles sorties sont en préparation." />}
    </section>

    <section className="organizer-band"><div className="organizer-band-image"/><div className="organizer-band-copy"><p className="eyebrow"><span className="eyebrow-line" /> NOTRE COMMUNAUTÉ</p><h2>Les bonnes aventures<br />commencent avec les<br /><em>bonnes personnes.</em></h2><p>Rencontrez les agences et clubs qui vous font découvrir l’Algérie et des destinations du monde entier.</p><Link className="button button-light" to="/organisateurs">Nos organisateurs <ArrowRight size={16} /></Link></div><div className="band-stamp"><span>ILS CONNAISSENT<br />LE CHEMIN</span><Compass size={26} /></div></section>
    <section className="trust-row"><div><span className="trust-icon"><Check /></span><span><strong>Des profils vérifiés</strong><small>Des organisateurs identifiés et validés.</small></span></div><div><span className="trust-icon"><Heart /></span><span><strong>À votre rythme</strong><small>Des expériences pour toutes les envies.</small></span></div><div><span className="trust-icon"><MapPin /></span><span><strong>Des destinations pour tous</strong><small>En Algérie comme à l’international.</small></span></div></section>
  </>
}

function coverFor(trip: Trip) { return trip.photos?.[0]?.image ? trip.photos[0].image : fallbackImages[trip.id % fallbackImages.length] }
function dateTimeForInput(value?: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)).replace(' ', 'T')
}

function TripCard({ trip, variant = 'normal' }: { trip: Trip; variant?: 'normal' | 'large' }) {
  return <article className={`trip-card ${variant === 'large' ? 'trip-card-large' : ''}`}>
    <Link to={`/voyage/${trip.id}`} className="trip-image-wrap"><img src={coverFor(trip)} alt={trip.title} className="trip-image" /><span className="trip-label">{trip.category_name || 'Évasion'}</span><span className="save-trip" role="button" tabIndex={0} title="Ajouter aux favoris" onClick={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.toggle('saved') }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.toggle('saved') } }}><Heart size={17} /></span></Link>
    <div className="trip-card-body"><div className="trip-meta"><span><MapPin size={14} />{trip.destination}</span><span><CalendarDays size={14} />{formatDate(trip.start_at)}</span></div><Link to={`/voyage/${trip.id}`}><h3>{trip.title}</h3></Link>{trip.review_count > 0 && <RatingSummary rating={trip.average_activity_rating} count={trip.review_count}/>}<div className="trip-card-bottom"><span className="organizer-mini"><span className="organizer-avatar">{trip.organizer_name?.[0] ?? 'R'}</span>{trip.organizer_name}</span><span className="card-price"><strong>{money(trip.price)}</strong><small> / personne</small></span></div><div className="trip-card-foot"><span><Clock3 size={14} />{trip.duration_days} {trip.duration_days > 1 ? 'jours' : 'journée'}</span><span>{trip.accommodation || (trip.available_seats > 0 ? `${trip.available_seats} places` : 'Complet')}</span></div></div>
  </article>
}

function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><span className="empty-icon"><Compass /></span><strong>{title}</strong><p>{text}</p></div> }
function Loading() { return <div className="loading-state"><span className="loader" />Chargement des aventures…</div> }
function ErrorMessage({ children }: { children: ReactNode }) { return <div className="form-error" role="alert">{children}</div> }

function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [trips, setTrips] = useState<Trip[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [count, setCount] = useState(0)
  const [next, setNext] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const queryString = searchParams.toString()
  const universe = searchParams.get('universe') ?? ''
  const activityOptions = universe === 'voyages'
    ? [['voyage-organise', 'Voyage organisé'], ['plage-mer', 'Séjour balnéaire'], ['sejour', 'Séjour premium'], ['hotellerie', 'Hôtel & resort'], ['experiences-exclusives', 'Expérience exclusive']]
    : [['randonnee', 'Randonnée'], ['excursion', 'Excursion'], ['camping', 'Camping'], ['montagne', 'Aventure en montagne'], ['plage-mer', 'Sortie mer & plage']]
  useEffect(() => { api<Page<Category>>('/categories/').then((p) => setCategories(p.results)).catch(() => undefined) }, [])
  useEffect(() => {
    setLoading(true); setError('')
    api<Page<Trip>>(`/trips/${queryString ? `?${queryString}` : ''}`).then((page) => { setTrips(page.results); setCount(page.count); setNext(page.next) }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [queryString])
  const patchParam = (key: string, value: string) => { const p = new URLSearchParams(searchParams); if (value) p.set(key, value); else p.delete(key); p.delete('page'); setSearchParams(p) }
  const changeUniverse = (value: string) => { const p = new URLSearchParams(searchParams); if (value) p.set('universe', value); else p.delete('universe'); p.delete('activity'); p.delete('difficulty'); p.delete('accommodation'); p.delete('page'); setSearchParams(p) }
  const loadNext = () => { if (!next) return; const page = new URL(next).searchParams.get('page'); if (page) patchParam('page', page) }
  return <div className="page-container explore-page"><div className="page-intro"><p className="eyebrow"><span className="eyebrow-line"/> DEUX UNIVERS, MILLE DESTINATIONS</p><h1>On part où ?</h1><p>Choisissez une aventure au grand air ou un séjour d’exception, en Algérie et à l’international.</p></div>
    <div className="explore-layout"><aside className="filters-panel"><div className="filter-title"><span><SlidersHorizontal size={18}/> Affiner</span><button onClick={() => setSearchParams({})}>Effacer</button></div>
      <label className="field-label">Univers<select value={universe} onChange={(e) => changeUniverse(e.target.value)}><option value="">Tous les univers</option><option value="voyages">Voyages & Évasions</option><option value="nature">Randonnées & Camping</option></select></label>
      <label className="field-label">Un mot, une destination<input value={searchParams.get('q') ?? ''} onChange={(e) => patchParam('q', e.target.value)} placeholder="Ex. Tlemcen, camping…"/></label>
      <label className="field-label">Catégorie<select value={searchParams.get('category') ?? ''} onChange={(e) => patchParam('category', e.target.value)}><option value="">Toutes les envies</option>{categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}</select></label>
      <label className="field-label">Type d’activité<select value={searchParams.get('activity') ?? ''} onChange={(e) => patchParam('activity', e.target.value)}><option value="">Tous les types</option>{activityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {universe === 'voyages' && <label className="field-label">Hébergement<input value={searchParams.get('accommodation') ?? ''} onChange={(e) => patchParam('accommodation', e.target.value)} placeholder="Hôtel, écolodge…"/></label>}
      <label className="field-label">Région ou destination<input value={searchParams.get('destination') ?? ''} onChange={(e) => patchParam('destination', e.target.value)} placeholder="Ex. Béjaïa, Istanbul"/></label>
      <label className="field-label">Organisation<input value={searchParams.get('organizer') ?? ''} onChange={(e) => patchParam('organizer', e.target.value)} placeholder="Agence, club ou association"/></label>
      <div className="filter-columns"><label className="field-label">À partir du<input type="date" value={searchParams.get('start_after') ?? ''} onChange={(e) => patchParam('start_after', e.target.value)}/></label><label className="field-label">Jusqu’au<input type="date" value={searchParams.get('start_before') ?? ''} onChange={(e) => patchParam('start_before', e.target.value)}/></label></div>
      <div className="filter-columns"><label className="field-label">Prix min. <input type="number" min="0" value={searchParams.get('price_min') ?? ''} onChange={(e) => patchParam('price_min', e.target.value)}/></label><label className="field-label">Prix max. <input type="number" min="0" value={searchParams.get('price_max') ?? ''} onChange={(e) => patchParam('price_max', e.target.value)}/></label></div>
      <div className="filter-columns"><label className="field-label">Durée min. (jours)<input type="number" min="1" value={searchParams.get('duration_min') ?? ''} onChange={(e) => patchParam('duration_min', e.target.value)}/></label><label className="field-label">Durée max. (jours)<input type="number" min="1" value={searchParams.get('duration_max') ?? ''} onChange={(e) => patchParam('duration_max', e.target.value)}/></label></div>
      {universe !== 'voyages' && <label className="field-label">Difficulté<select value={searchParams.get('difficulty') ?? ''} onChange={(e) => patchParam('difficulty', e.target.value)}><option value="">Tous les niveaux</option><option value="easy">Facile</option><option value="moderate">Modérée</option><option value="hard">Difficile</option></select></label>}
      <label className="check-label"><input type="checkbox" checked={searchParams.get('family') === 'true'} onChange={(e) => patchParam('family', e.target.checked ? 'true' : '')}/><span>Adaptée aux familles</span></label><label className="check-label"><input type="checkbox" checked={searchParams.get('available') === 'true'} onChange={(e) => patchParam('available', e.target.checked ? 'true' : '')}/><span>Places disponibles</span></label>
    </aside><section className="results-panel"><div className="results-head"><span><strong>{count}</strong> aventures à découvrir</span><label>Trier par <select value={searchParams.get('ordering') ?? 'soonest'} onChange={(e) => patchParam('ordering', e.target.value)}><option value="soonest">Départs proches</option><option value="recent">Plus récentes</option><option value="price_asc">Prix croissant</option><option value="price_desc">Prix décroissant</option></select></label></div>{error && <ErrorMessage>{error}</ErrorMessage>}{loading ? <Loading/> : trips.length ? <><div className="trip-grid trip-grid-results">{trips.map((trip) => <TripCard trip={trip} key={trip.id}/>)}</div>{next && <button className="button button-outline load-more" onClick={loadNext}>Voir la suite <ArrowDown size={15}/></button>}</> : <EmptyState title="Aucune sortie pour ces critères" text="Essayez une autre destination ou élargissez vos dates."/>}</section></div>
  </div>
}
function NotFound() { return <div className="page-container not-found"><Compass size={48} /><h1>Ce chemin ne mène nulle part.</h1><Link className="button" to="/">Revenir à l'accueil</Link></div> }

function AdminDashboard() {
  const { user } = useSession()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (!user || user.role !== 'admin') { setLoading(false); return }
    setLoading(true)
    Promise.all([api<AdminStats>('/admin/stats/'), api<Page<Report>>('/reports/?status=pending'), api<Page<Report>>('/reports/?status=in_review')]).then(([summary, pending, active]) => { setStats(summary); setReports([...pending.results, ...active.results]) }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [user, refresh])
  if (!user) return <SignInPrompt title="Administration Rihla." text="Connectez-vous avec un compte du personnel pour gérer la plateforme."/>
  if (user.role !== 'admin') return <div className="page-container"><ErrorMessage>Cette page est réservée à l'équipe d'administration.</ErrorMessage></div>
  if (loading) return <div className="page-container"><Loading/></div>
  const statusNames: Record<string, string> = { draft: 'Brouillon', pending: 'À valider', published: 'Publiées', full: 'Complètes', closed: 'Clôturées', cancelled: 'Annulées', confirmed: 'Confirmées', declined: 'Refusées', traveler_cancelled: 'Annulées par le voyageur', organizer_cancelled: 'Annulées par l’organisateur', completed: 'Terminées' }
  const updateReport = async (report: Report, status: string) => {
    setError('')
    try { await api(`/reports/${report.id}/`, { method: 'PATCH', body: JSON.stringify({ status, moderator_note: status === 'in_review' ? '' : 'Examiné par l’équipe Rihla.' }) }); setRefresh((value) => value + 1) } catch (e) { setError((e as Error).message) }
  }
  const hideReportedReview = async (report: Report) => {
    if (!report.review) return
    setError('')
    try { await api(`/reviews/${report.review}/`, { method: 'PATCH', body: JSON.stringify({ status: 'hidden', moderator_note: 'Masqué après examen d’un signalement.' }) }); await updateReport(report, 'resolved') } catch (e) { setError((e as Error).message) }
  }
  return <div className="page-container admin-page"><div className="page-intro"><p className="eyebrow"><span className="eyebrow-line"/> ESPACE D’ADMINISTRATION</p><h1>Vue d’ensemble<span className="green-period">.</span></h1><p>Examinez les organisations, les activités et les signalements de la communauté.</p></div>{error && <ErrorMessage>{error}</ErrorMessage>}{stats && <><div className="admin-stat-grid"><div><small>COMPTES VOYAGEURS</small><strong>{stats.travelers_total}</strong><span>{stats.users_total} comptes au total</span></div><div><small>ORGANISATIONS À VÉRIFIER</small><strong>{stats.organizers_pending}</strong><span>{stats.organizers_total} profils</span></div><div><small>ACTIVITÉS À VENIR</small><strong>{stats.upcoming_public_trips}</strong><span>{stats.trips_total} annonces au total</span></div><div><small>AVIS PUBLIÉS</small><strong>{stats.reviews_total}</strong><span>{stats.reviews_hidden} masqués après modération</span></div></div><div className="admin-summary-grid"><section className="admin-summary"><h2>Activités</h2>{Object.entries(stats.trips_by_status).map(([status, count]) => <div key={status}><span>{statusNames[status] ?? status}</span><strong>{count}</strong></div>)}</section><section className="admin-summary"><h2>Réservations</h2>{Object.entries(stats.bookings_by_status).map(([status, count]) => <div key={status}><span>{statusNames[status] ?? status}</span><strong>{count}</strong></div>)}</section></div></>}
    <section className="admin-reports"><div className="section-heading"><div><p className="eyebrow"><span className="eyebrow-line"/> MODÉRATION</p><h2>Signalements à examiner.</h2></div><span className="tab-count">{(stats?.reports_pending ?? 0) + (stats?.reports_in_review ?? 0)}</span></div>{reports.length ? <div className="report-list">{reports.map((report) => <article className="report-card" key={report.id}><div className="report-card-heading"><span className={`status-pill status-${report.status}`}><span/>{report.status === 'pending' ? 'À examiner' : 'En cours'}</span><small>{formatDate(report.created_at)}</small></div><strong>{report.trip_title ?? report.organizer_name ?? (report.review_author ? `Avis de ${report.review_author}` : 'Élément indisponible')}</strong><span className="report-kind">{({ inaccurate: 'Informations inexactes', safety: 'Sécurité ou conditions', abusive: 'Contenu inapproprié', spam: 'Publicité indésirable', other: 'Autre' } as Record<string, string>)[report.reason] ?? report.reason} · par {report.reporter_name}</span>{report.review_comment && <blockquote className="moderation-quote">« {report.review_comment} » · note {report.review_rating}/5</blockquote>}{report.description && <p>{report.description}</p>}{report.trip && <Link className="text-link" to={`/voyage/${report.trip}`}>Ouvrir l’activité <ArrowUpRight size={14}/></Link>}{report.organizer && <Link className="text-link" to={`/organisateurs/${report.organizer}`}>Ouvrir le profil <ArrowUpRight size={14}/></Link>}{report.review && <div className="report-actions"><button className="button button-small" onClick={() => hideReportedReview(report)}>Masquer l’avis et clôturer</button></div>}<div className="report-actions">{report.status === 'pending' && <button className="button button-outline button-small" onClick={() => updateReport(report, 'in_review')}>Prendre en charge</button>}<button className="button button-small" onClick={() => updateReport(report, 'resolved')}>Traité</button><button className="button button-outline button-small" onClick={() => updateReport(report, 'dismissed')}>Classer</button></div></article>)}</div> : <EmptyState title="Aucun signalement en attente" text="Les signalements de profils, d’activités et d’avis apparaîtront ici."/>}<Link className="admin-link" to="/admin/">Ouvrir l'administration Django <ArrowUpRight size={15}/></Link></section>
  </div>
}
function ReportForm({ trip, organizer, onClose }: { trip?: number; organizer?: number; onClose: () => void }) {
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('')
    const form = new FormData(event.currentTarget)
    try { await api('/reports/', { method: 'POST', body: JSON.stringify({ ...(trip ? { trip } : { organizer }), reason: form.get('reason'), description: form.get('description') }) }); setSent(true) } catch (e) { setError((e as Error).message) }
  }
  return <div className="report-form-card"><div className="report-form-heading"><strong>{sent ? 'Merci pour votre signalement.' : 'Signaler un problème'}</strong><button type="button" aria-label="Fermer" onClick={onClose}><X size={16}/></button></div>{sent ? <p>Notre équipe examinera ces informations.</p> : <form onSubmit={submit}><label className="field-label">Motif<select name="reason"><option value="inaccurate">Informations inexactes</option><option value="safety">Sécurité ou conditions préoccupantes</option><option value="abusive">Contenu inapproprié</option><option value="spam">Publicité indésirable</option><option value="other">Autre</option></select></label><label className="field-label">Détails<textarea name="description" rows={3} maxLength={1200} placeholder="Décrivez brièvement le problème…"/></label>{error && <ErrorMessage>{error}</ErrorMessage>}<button className="button button-small">Envoyer le signalement</button></form>}</div>
}

type MapPoint = { name: string; latitude: number; longitude: number; description?: string; estimated_time?: string | null; is_active?: boolean; kind?: 'departure' | 'pickup' | 'destination' }
function ActivityMap({ trip, interactive, point, onPick, extraPoints = [] }: { trip?: Trip; interactive?: boolean; point?: [number, number] | null; onPick?: (point: [number, number]) => void; extraPoints?: MapPoint[] }) {
  const routePoints = trip ? [
    ...(trip.meeting_latitude != null && trip.meeting_longitude != null ? [{ latitude: Number(trip.meeting_latitude), longitude: Number(trip.meeting_longitude) }] : []),
    ...trip.pickup_points.filter((item) => item.is_active).map((item) => ({ latitude: Number(item.latitude), longitude: Number(item.longitude) })),
    ...(trip.destination_latitude != null && trip.destination_longitude != null ? [{ latitude: Number(trip.destination_latitude), longitude: Number(trip.destination_longitude) }] : []),
  ] : extraPoints.filter((item) => item.is_active !== false)
  const center: [number, number] = point ?? (routePoints.length ? [Number(routePoints[0].latitude), Number(routePoints[0].longitude)] : [36.75, 3.06])
  function Recenter() { const map = useMap(); useEffect(() => { map.setView(center, map.getZoom()) }, [center[0], center[1], map]); return null }
  function ClickToPin() {
    useMapEvents({ click(event) { if (interactive && onPick) onPick([Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6))]) } })
    return null
  }
  const markers: { name: string; lat: number; lng: number; description: string; time: string | null; kind: string }[] = trip ? [
    ...(trip.meeting_latitude != null && trip.meeting_longitude != null ? [{ name: trip.meeting_name || 'Départ du bus', lat: Number(trip.meeting_latitude), lng: Number(trip.meeting_longitude), description: 'Départ du bus', time: trip.meeting_time, kind: 'departure' }] : []),
    ...trip.pickup_points.filter((p) => p.is_active).map((p) => ({ name: p.name, lat: Number(p.latitude), lng: Number(p.longitude), description: p.description, time: p.estimated_time, kind: 'pickup' })),
    ...(trip.destination_latitude != null && trip.destination_longitude != null ? [{ name: trip.destination, lat: Number(trip.destination_latitude), lng: Number(trip.destination_longitude), description: 'Destination finale', time: trip.destination_estimated_time, kind: 'destination' }] : []),
  ] : extraPoints.filter((p) => p.is_active !== false).map((p) => ({ name: p.name, lat: Number(p.latitude), lng: Number(p.longitude), description: p.description ?? '', time: p.estimated_time ?? null, kind: p.kind ?? 'pickup' }))
  return <div className="map-frame"><MapContainer center={center} zoom={7} scrollWheelZoom={false}>
    <Recenter />
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url={import.meta.env.VITE_OSM_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'} />
    {trip?.route_geojson && <GeoJSON data={trip.route_geojson} style={{ color: 'var(--valley)', weight: 4, opacity: 0.8 }} />}
    {markers.map((m, i) => <CircleMarker key={`${m.kind}-${m.name}-${i}`} center={[m.lat, m.lng]} radius={m.kind === 'departure' || m.kind === 'destination' ? 10 : 8} pathOptions={{ color: m.kind === 'pickup' ? 'var(--gold)' : 'var(--mountain)', fillColor: m.kind === 'pickup' ? 'var(--gold)' : 'var(--lake)', fillOpacity: 0.9 }}><Tooltip direction="top" offset={[0, -8]} permanent><strong>{m.name}</strong>{m.time && <><br />Prévu à {m.time.slice(0, 5)}</>}{m.description && <><br />{m.description}</>}</Tooltip></CircleMarker>)}
    {point && <CircleMarker center={point} radius={9} pathOptions={{ color: 'var(--mountain)', fillColor: 'var(--lake)', fillOpacity: 0.9 }}><Tooltip permanent>Nouveau point</Tooltip></CircleMarker>}
    {interactive && <ClickToPin />}
  </MapContainer></div>
}

function TripDetailPage() {
  const { id = '' } = useParams()
  const { user } = useSession()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [activePhoto, setActivePhoto] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [pickup, setPickup] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  useEffect(() => { api<Trip>(`/trips/${id}/`).then(setTrip).catch((e: Error) => setError(e.message)).finally(() => setLoading(false)) }, [id])
  useEffect(() => setActivePhoto(null), [id])
  const reserve = async (event: FormEvent) => {
    event.preventDefault(); if (!trip) return
    setError(''); setSuccess('')
    try {
      await api<Booking>('/bookings/', { method: 'POST', body: JSON.stringify({ trip: trip.id, quantity, pickup_point: pickup && pickup !== 'departure' ? pickup : null }) })
      setSuccess('Votre demande est envoyée. L’organisateur vous confirmera la réservation ici.')
    } catch (e) { setError((e as Error).message) }
  }
  if (loading) return <div className="page-container"><Loading /></div>
  if (!trip) return <div className="page-container"><ErrorMessage>{error || 'Cette aventure est introuvable.'}</ErrorMessage><Link to="/activites" className="text-link">Retour aux activités</Link></div>
  const canBook = trip.status === 'published' && trip.available_seats > 0 && new Date(trip.start_at) > new Date()
  return <div className="page-container detail-page">
    <div className="breadcrumb"><Link to="/activites">Explorer</Link><span>/</span><span>{trip.destination}</span></div>
    <section className="detail-hero"><img src={activePhoto ?? coverFor(trip)} alt={trip.title} /><div className="detail-hero-shade"/><div className="detail-hero-copy"><span className="trip-label detail-category">{trip.category_name}</span><h1>{trip.title}</h1><div className="detail-meta"><span><MapPin size={16}/>{trip.destination}</span><span><CalendarDays size={16}/>{formatDate(trip.start_at)}</span>{trip.end_at && <span><ArrowRight size={15}/>Retour le {formatDate(trip.end_at)}</span>}<span><Clock3 size={16}/>{trip.duration_days} jour{trip.duration_days > 1 ? 's' : ''}</span></div></div></section>
    {trip.photos.length > 1 && <div className="detail-photo-strip">{trip.photos.map((photo) => <button type="button" className={activePhoto === photo.image ? 'active' : ''} key={photo.id} onClick={() => setActivePhoto(photo.image)}><img src={photo.image} alt={photo.caption || trip.title}/>{photo.caption && <span>{photo.caption}</span>}</button>)}</div>}
    <div className="detail-layout"><div className="detail-main">
      <div className="organizer-strip"><span className="organizer-avatar organizer-avatar-large">{trip.organizer_name?.[0] ?? 'R'}</span><span><small>PROPOSÉ PAR</small><Link to={`/organisateurs/${trip.organizer}`}>{trip.organizer_name}</Link></span>{trip.organizer_verification === 'verified' && <span className="verified-pill"><Check size={14}/>Organisation vérifiée</span>}<RatingSummary rating={trip.organizer_average_rating} count={trip.organizer_review_count}/></div>
      <div className="report-action">{user ? <button className="text-link" onClick={() => setReportOpen((open) => !open)}>Signaler cette annonce</button> : <Link className="text-link" to={`/connexion?next=/voyage/${trip.id}`}>Connectez-vous pour signaler cette annonce</Link>}{reportOpen && user && <ReportForm trip={trip.id} onClose={() => setReportOpen(false)}/>}</div>
      <section className="detail-section"><p className="eyebrow"><span className="eyebrow-line"/>{trip.universe === 'voyages' ? ' VOYAGES & ÉVASIONS' : ' RANDONNÉES & CAMPING'}</p><h2>{trip.universe === 'voyages' ? 'Un séjour pensé pour vous.' : 'Un moment au grand air.'}</h2><p className="detail-description">{trip.description}</p>{trip.universe === 'voyages' && (trip.accommodation || trip.board) && <div className="stay-info">{trip.accommodation && <span><small>HÉBERGEMENT</small><strong>{trip.accommodation}</strong></span>}{trip.board && <span><small>PENSION & PRESTATIONS</small><strong>{trip.board}</strong></span>}</div>}</section>
      {trip.itinerary && <section className="detail-section"><p className="eyebrow"><span className="eyebrow-line"/> AU PROGRAMME</p><h2>Le fil de la journée.</h2><p className="detail-description preserve-lines">{trip.itinerary}</p></section>}
      <section className="detail-section"><p className="eyebrow"><span className="eyebrow-line"/> ITINÉRAIRE DU BUS</p><h2>Un trajet, plusieurs points de montée.</h2><p className="detail-description">Les horaires sont prévisionnels et peuvent changer. Le tracé routier n’est affiché que s’il a été fourni par l’organisateur.</p><ActivityMap trip={trip}/>{trip.meeting_latitude != null && trip.meeting_longitude != null && <a className="map-external-link" href={`https://www.openstreetmap.org/?mlat=${trip.meeting_latitude}&mlon=${trip.meeting_longitude}#map=14/${trip.meeting_latitude}/${trip.meeting_longitude}`} target="_blank" rel="noreferrer">Ouvrir le départ sur OpenStreetMap <ArrowUpRight size={14}/></a>}<div className="pickup-list"><strong>Étapes du trajet</strong>{(trip.meeting_name || trip.meeting_latitude != null ? [{ name: trip.meeting_name || 'Départ du bus', description: 'Départ du bus', estimated_time: trip.meeting_time, kind: 'departure' }] : []).concat(trip.pickup_points.filter((item) => item.is_active).map((item) => ({ name: item.name, description: item.description, estimated_time: item.estimated_time, kind: 'pickup' })), [{ name: trip.destination, description: 'Destination finale', estimated_time: trip.destination_estimated_time, kind: 'destination' }]).map((step, index) => <div key={`${step.kind}-${step.name}`}><span className="pickup-number">{index + 1}</span><span>{step.name}<small>{step.description}{step.estimated_time ? ` · Prévu à ${step.estimated_time.slice(0, 5)}` : ''}</small></span></div>)}</div></section>
      <div className="detail-columns">{trip.included && <section className="detail-section detail-small"><p className="eyebrow">INCLUS DANS LE PRIX</p><p className="preserve-lines">{trip.included}</p></section>}{trip.excluded && <section className="detail-section detail-small"><p className="eyebrow">À PRÉVOIR</p><p className="preserve-lines">{trip.excluded}</p></section>}</div>
      {trip.cancellation_policy && <section className="detail-section"><p className="eyebrow"><span className="eyebrow-line"/> ANNULATION</p><h2>À connaître avant de réserver.</h2><p className="detail-description preserve-lines">{trip.cancellation_policy}</p></section>}
      {trip.requirements && <section className="detail-section requirement-box"><Sparkles size={19}/><span><strong>Petit conseil</strong><p>{trip.requirements}</p></span></section>}
      <ReviewsList trip={trip.id} userId={user?.id}/>
    </div><aside className="booking-aside"><div className="booking-card"><div className="booking-price"><span>À partir de</span><strong>{money(trip.price)} <small>/ personne</small></strong></div><div className="availability"><span className="availability-dot"/>{trip.available_seats > 0 ? `${trip.available_seats} places disponibles` : 'Complet'}</div>{success && <div className="form-success"><Check size={16}/>{success}</div>}{error && <ErrorMessage>{error}</ErrorMessage>}
      {canBook ? user && !trip.organizer_current_user_role ? <form onSubmit={reserve}><label className="field-label">Nombre de places<select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>{Array.from({ length: Math.min(trip.available_seats, 8) }, (_, i) => i + 1).map((n) => <option value={n} key={n}>{n} place{n > 1 ? 's' : ''}</option>)}</select></label>{(trip.meeting_name || trip.meeting_latitude != null || trip.pickup_points.some((item) => item.is_active)) && <label className="field-label">Point de montée<select value={pickup} required onChange={(e) => setPickup(e.target.value)}><option value="">Choisir un point</option>{(trip.meeting_name || trip.meeting_latitude != null) && <option value="departure">{trip.meeting_name || 'Départ du bus'} · départ{trip.meeting_time ? ` à ${trip.meeting_time.slice(0, 5)}` : ''}</option>}{trip.pickup_points.filter((item) => item.is_active).map((p) => <option value={p.id} key={p.id}>{p.name}{p.estimated_time ? ` · ${p.estimated_time.slice(0, 5)}` : ''}</option>)}</select></label>}<div className="booking-total"><span>Total indicatif</span><strong>{money(Number(trip.price) * quantity)}</strong></div><button className="button button-wide">Demander une réservation <ArrowRight size={17}/></button><p className="no-payment"><Check size={14}/> Aucun paiement sur la plateforme</p></form> : user ? <p className="subtle-box">Les membres de l'organisation ne peuvent pas réserver leurs propres activités.</p> : <><p className="booking-hint">Les places sont confirmées par l'organisateur. Aucun paiement en ligne.</p><Link className="button button-wide" to={`/connexion?next=/voyage/${trip.id}`}>Connectez-vous pour réserver <ArrowRight size={17}/></Link><Link className="button button-outline button-wide" to={`/inscription?next=/voyage/${trip.id}`}>Créer un compte voyageur</Link></> : <div className="closed-note">{trip.available_seats === 0 ? 'Toutes les places sont prises.' : 'Les réservations sont closes pour cette date.'}</div>}
      <div className="organizer-contact"><small>UNE QUESTION ?</small><Link to={`/organisateurs/${trip.organizer}`}>Contacter l'organisateur <ArrowUpRight size={15}/></Link></div>
    </div></aside></div>
  </div>
}

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register'
  const { setUser } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const roleFromQuery = params.get('role') === 'organizer' ? 'organizer' : 'traveler'
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true)
    const form = new FormData(event.currentTarget)
    const payload: Record<string, string> = {}
    form.forEach((value, key) => payload[key] = String(value))
    try {
      const result = isRegister ? await api<{ token: string; user: User }>('/auth/register/', { method: 'POST', body: JSON.stringify(payload) }) : await api<{ token: string; user?: User }>('/auth/login/', { method: 'POST', body: JSON.stringify(payload) })
      localStorage.setItem('rihla_token', result.token)
      const user = result.user ?? await api<User>('/auth/me/')
      setUser(user)
      const next = params.get('next')
      navigate(next?.startsWith('/') ? next : user.role === 'organizer' ? '/pro' : '/profil')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <div className="auth-page"><div className="auth-visual"><img src={fallbackImages[2]} alt="Montagnes au lever du jour"/><div className="auth-visual-shade"/><Link to="/" className="brand brand-light" aria-label="NHMLO, accueil"><span className="brand-mark"><img src="/nhmlo-mark.svg" alt="" /></span><span>NHMLO</span></Link><div className="auth-quote"><Sparkles/><blockquote>« Il y a des voyages qu'on fait avec les pieds. Et d'autres qui restent avec nous. »</blockquote><span>VOTRE PROCHAINE HISTOIRE COMMENCE ICI</span></div></div><div className="auth-form-wrap"><div className="auth-form-box"><Link to="/" className="mobile-brand brand" aria-label="NHMLO, accueil"><span className="brand-mark"><img src="/nhmlo-mark.svg" alt="" /></span><span>NHMLO</span></Link><p className="eyebrow"><span className="eyebrow-line"/> {isRegister ? 'BIENVENUE DANS LE VOYAGE' : 'HEUREUX DE VOUS REVOIR'}</p><h1>{isRegister ? 'Créons votre compte.' : 'On repart ensemble ?'}</h1><p className="form-intro">{isRegister ? 'Rejoignez une communauté qui aime découvrir l’Algérie autrement.' : 'Connectez-vous pour retrouver vos réservations et vos prochaines sorties.'}</p>
      <form onSubmit={submit} className="auth-form">{isRegister && <><div className="form-row"><label className="field-label">Prénom<input name="first_name" autoComplete="given-name" required/></label><label className="field-label">Nom<input name="last_name" autoComplete="family-name" required/></label></div><label className="field-label">Je souhaite<select name="role" defaultValue={roleFromQuery}><option value="traveler">Découvrir et réserver</option><option value="organizer">Organiser des sorties</option></select></label></>}<label className="field-label">{isRegister ? 'Nom d’utilisateur' : 'Nom d’utilisateur'}<input name="username" autoComplete="username" required minLength={3}/></label>{isRegister && <label className="field-label">Adresse e-mail<input name="email" type="email" autoComplete="email" required/></label>}<label className="field-label">Mot de passe<input name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} required minLength={8}/></label>{error && <ErrorMessage>{error}</ErrorMessage>}<button className="button button-wide" disabled={busy}>{busy ? 'Un instant…' : isRegister ? 'Créer mon compte' : 'Me connecter'} <ArrowRight size={17}/></button></form>
      <p className="auth-switch">{isRegister ? 'Vous avez déjà un compte ?' : 'Pas encore de compte ?'} <Link to={isRegister ? '/connexion' : '/inscription'}>{isRegister ? 'Se connecter' : 'Créer un compte'}</Link></p><div className="auth-safe"><span><Check size={14}/> Vos données restent protégées</span><span><Check size={14}/> Pas de paiement en ligne</span></div></div></div></div>
}

function ProfilePage() {
  const { user, setUser } = useSession()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  const [reviewing, setReviewing] = useState<number | null>(null)
  useEffect(() => { if (!user) return; api<Page<Booking>>('/bookings/').then((page) => setBookings(page.results)).catch((e: Error) => setError(e.message)).finally(() => setLoading(false)) }, [user, version])
  if (!user) return <SignInPrompt title="Vos aventures, au même endroit." text="Connectez-vous pour consulter et gérer vos réservations."/>
  const cancel = async (id: number) => { try { await api(`/bookings/${id}/cancel/`, { method: 'POST' }); setVersion((value) => value + 1) } catch (e) { setError((e as Error).message) } }
  return <div className="page-container dashboard-page"><div className="page-intro"><p className="eyebrow"><span className="eyebrow-line"/> VOTRE ESPACE</p><h1>Bonjour {user.first_name || user.username}<span className="green-period">.</span></h1><p>Vos prochaines escapades et vos souvenirs se retrouvent ici.</p></div><details className="profile-edit"><summary>Modifier mes informations personnelles <ArrowUpRight size={15}/></summary><UserProfileForm user={user} onSaved={setUser}/></details><div className="dashboard-tabs"><span className="active">Mes réservations</span><Link to="/pro">Espace organisation <ArrowRight size={15}/></Link></div>{error && <ErrorMessage>{error}</ErrorMessage>}{loading ? <Loading/> : bookings.length ? <div className="booking-list">{bookings.map((booking) => <article className="booking-row booking-row-review" key={booking.id}><span className="booking-date-card"><small>{new Intl.DateTimeFormat('fr-DZ', { month: 'short', timeZone: 'Africa/Algiers' }).format(new Date(booking.start_at)).toUpperCase()}</small><strong>{new Date(booking.start_at).toLocaleDateString('fr-DZ', { day: '2-digit', timeZone: 'Africa/Algiers' })}</strong></span><span className="booking-row-main"><Link to={`/voyage/${booking.trip_id}`}><strong>{booking.trip_title}</strong></Link><small><MapPin size={14}/>{booking.destination} · {booking.quantity} place{booking.quantity > 1 ? 's' : ''}</small>{booking.pickup_name && <small className="pickup-snapshot">Montée : {booking.pickup_name}{booking.pickup_time ? ` · prévu à ${booking.pickup_time.slice(0, 5)}` : ''}{booking.pickup_description ? ` · ${booking.pickup_description}` : ''}</small>}</span><span className={`status-pill status-${booking.status}`}><span/>{statusLabels[booking.status] ?? booking.status}</span><strong className="booking-row-price">{money(Number(booking.price_per_person) * booking.quantity)}</strong>{['pending', 'confirmed'].includes(booking.status) && <button className="button button-outline button-small" onClick={() => cancel(booking.id)}>Annuler</button>}{booking.review_eligible && <button className="button button-small" onClick={() => setReviewing(reviewing === booking.id ? null : booking.id)}>Laisser un avis</button>}{booking.review_id && <span className="review-published-note">Avis publié</span>}{reviewing === booking.id && booking.review_eligible && <div className="booking-review-panel"><ReviewForm booking={booking.id} onSubmitted={() => { setReviewing(null); setVersion((value) => value + 1) }}/></div>}</article>)}</div> : <EmptyState title="Votre première escapade vous attend" text="Parcourez les séjours et aventures nature, puis envoyez une demande de réservation."/>}</div>
}
function UserProfileForm({ user, onSaved }: { user: User; onSaved: (user: User) => void }) {
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSaved(false)
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    try { const updated = await api<User>('/auth/me/', { method: 'PATCH', body: JSON.stringify(body) }); onSaved(updated); setSaved(true) } catch (e) { setError((e as Error).message) }
  }
  return <form className="profile-form" onSubmit={submit}><label className="field-label">Prénom<input name="first_name" defaultValue={user.first_name}/></label><label className="field-label">Nom<input name="last_name" defaultValue={user.last_name}/></label><label className="field-label">Adresse e-mail<input name="email" type="email" defaultValue={user.email} required/></label><button className="button button-small">Enregistrer les changements</button>{saved && <span className="profile-saved"><Check size={14}/>Profil mis à jour.</span>}{error && <ErrorMessage>{error}</ErrorMessage>}</form>
}

function SignInPrompt({ title, text }: { title: string; text: string }) { return <div className="page-container sign-in-prompt"><span className="empty-icon"><CircleUserRound/></span><p className="eyebrow">VOTRE ESPACE RIHLA</p><h1>{title}</h1><p>{text}</p><Link className="button" to="/connexion">Se connecter <ArrowRight size={16}/></Link><Link className="text-link" to="/inscription">Créer un compte</Link></div> }

function organizationKindLabel(kind: string) {
  return ({ agency: 'AGENCE DE VOYAGES', club: 'CLUB DE RANDONNÉE', association: 'ASSOCIATION' } as Record<string, string>)[kind] ?? 'ORGANISATION'
}

function OrganizersPage() {
  const [organizations, setOrganizations] = useState<Organizer[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { api<Page<Organizer>>('/organizations/').then((page) => setOrganizations(page.results)).catch(() => setOrganizations([])).finally(() => setLoading(false)) }, [])
  return <div className="page-container organizer-page"><div className="page-intro"><p className="eyebrow"><span className="eyebrow-line"/> DES ÉQUIPES QUI FONT LA DIFFÉRENCE</p><h1>Des personnes passionnées.<br/><em>Des souvenirs à partager.</em></h1><p>Découvrez agences, clubs et associations qui ouvrent les portes de l’Algérie.</p></div>{loading ? <Loading/> : organizations.length ? <div className="organizer-grid">{organizations.map((organization, index) => <Link to={`/organisateurs/${organization.id}`} className="organizer-card" key={organization.id}><div className="organizer-card-image" style={{ backgroundImage: `url(${organization.cover || organization.logo || fallbackImages[(index + 1) % fallbackImages.length]})` }}>{organization.verification === 'verified' && <span className="verified-pill"><Check size={13}/>Identité vérifiée</span>}</div><div className="organizer-card-content"><span className="organizer-avatar organizer-avatar-large">{organization.logo ? <img src={organization.logo} alt=""/> : organization.name[0]}</span><p className="eyebrow">{organizationKindLabel(organization.kind)}</p><h2>{organization.name}</h2><span className="org-location"><MapPin size={14}/>{organization.region || 'Algérie'}</span><RatingSummary rating={organization.average_rating} count={organization.review_count}/><p>{organization.about}</p><span className="text-link">Découvrir leurs activités <ArrowRight size={15}/></span></div></Link>)}</div> : <EmptyState title="Les organisations se préparent" text="Les premières équipes validées seront bientôt en ligne."/>}<section className="join-organizer"><div><p className="eyebrow">VOUS PROPOSEZ DES VOYAGES OU DES SORTIES ?</p><h2>Faites découvrir votre univers.</h2></div><Link className="button button-light" to="/pro">Créer une organisation <ArrowRight size={16}/></Link></section></div>
}

function OrganizerDetailPage() {
  const { id = '' } = useParams()
  const { user } = useSession()
  const [organization, setOrganization] = useState<Organizer | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { Promise.all([api<Organizer>(`/organizations/${id}/`), api<Page<Trip>>(`/trips/?organizer=${id}&ordering=recent`)]).then(([org, page]) => { setOrganization(org); setTrips(page.results) }).catch(() => setOrganization(null)).finally(() => setLoading(false)) }, [id])
  if (loading) return <div className="page-container"><Loading/></div>
  if (!organization) return <div className="page-container"><EmptyState title="Ce profil n’est pas disponible" text="Les profils publics s’affichent après la vérification de l’organisation."/><Link className="text-link" to="/organisateurs">Voir les organisations</Link></div>
  const publicTrips = trips.filter((trip) => ['published', 'full'].includes(trip.status))
  const futureTrips = publicTrips.filter((trip) => new Date(trip.end_at ?? trip.start_at) >= new Date())
  const pastTrips = publicTrips.filter((trip) => new Date(trip.end_at ?? trip.start_at) < new Date())
  const socialLinks = [['Site web', organization.website], ['Instagram', organization.instagram], ['Facebook', organization.facebook], ['TikTok', organization.tiktok]].filter((item) => item[1]) as [string, string][]
  return <div className="page-container organizer-detail"><div className="organization-cover" style={{ backgroundImage: `linear-gradient(90deg,rgba(13,31,24,.78),rgba(13,31,24,.22)),url(${organization.cover || fallbackImages[1]})` }}><span className="organizer-avatar org-profile-avatar">{organization.logo ? <img src={organization.logo} alt=""/> : organization.name[0]}</span><div><p className="eyebrow">{organizationKindLabel(organization.kind)}</p><h1>{organization.name}</h1><span className="org-location"><MapPin size={15}/>{organization.region || 'Algérie'}</span>{organization.verification === 'verified' && <span className="verified-pill"><Check size={14}/>Identité de l’organisation vérifiée</span>}<RatingSummary rating={organization.average_rating} count={organization.review_count}/></div></div><div className="organization-public-info"><p>{organization.about}</p><div className="organization-contact-links">{organization.public_email && <a href={`mailto:${organization.public_email}`}>{organization.public_email}</a>}{organization.public_phone && <a href={`tel:${organization.public_phone}`}>{organization.public_phone}</a>}{socialLinks.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer">{label} <ArrowUpRight size={13}/></a>)}</div></div>{user && !organization.current_user_role && <div className="report-action"><button className="text-link" onClick={() => setReportOpen((open) => !open)}>Signaler ce profil</button>{reportOpen && <ReportForm organizer={organization.id} onClose={() => setReportOpen(false)}/>}</div>}<div className="section-heading organization-section-heading"><div><p className="eyebrow"><span className="eyebrow-line"/> AU CALENDRIER</p><h2>Prochaines activités.</h2></div></div>{futureTrips.length ? <div className="trip-grid trip-grid-3">{futureTrips.map((trip) => <TripCard trip={trip} key={trip.id}/>)}</div> : <EmptyState title="Aucune activité programmée" text="Revenez bientôt pour découvrir les prochaines dates."/>}{pastTrips.length > 0 && <><div className="section-heading organization-section-heading"><div><p className="eyebrow"><span className="eyebrow-line"/> LES SOUVENIRS PARTAGÉS</p><h2>Activités passées.</h2></div></div><div className="trip-grid trip-grid-3">{pastTrips.map((trip) => <TripCard trip={trip} key={trip.id}/>)}</div></>}<ReviewsList organization={organization.id} userId={user?.id}/></div>
}
function ManagerTripRow({ trip, onEdit, onUpdated, onError }: { trip: Trip; onEdit: (trip: Trip) => void; onUpdated: () => void; onError: (message: string) => void }) {
  const [capacity, setCapacity] = useState(String(trip.capacity))
  const [saving, setSaving] = useState(false)
  useEffect(() => setCapacity(String(trip.capacity)), [trip.capacity])
  const saveCapacity = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); onError('')
    try { await api(`/trips/${trip.id}/`, { method: 'PATCH', body: JSON.stringify({ capacity: Number(capacity) }) }); onUpdated() } catch (e) { onError((e as Error).message) } finally { setSaving(false) }
  }
  const closeTrip = async () => {
    onError('')
    try { await api(`/trips/${trip.id}/close/`, { method: 'POST' }); onUpdated() } catch (e) { onError((e as Error).message) }
  }
  const cancelTrip = async () => {
    if (!window.confirm('Annuler cette sortie et prévenir les voyageurs concernés ?')) return
    onError('')
    try { await api(`/trips/${trip.id}/cancel/`, { method: 'POST' }); onUpdated() } catch (e) { onError((e as Error).message) }
  }
  const status = ({ draft: 'Brouillon', pending: 'En validation', published: 'En ligne', full: 'Complet', closed: 'Clôturée', cancelled: 'Annulée' } as Record<string, string>)[trip.status] ?? trip.status
  return <article className="manager-row"><img src={coverFor(trip)} alt=""/><div className="manager-main"><span className={`status-pill status-${trip.status}`}><span/>{status}</span><strong>{trip.title}</strong><small><MapPin size={13}/>{trip.destination} · {formatDate(trip.start_at)}</small></div><form className="manager-capacity" onSubmit={saveCapacity}><label><input aria-label={`Capacité totale pour ${trip.title}`} type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)}/><span>/ {trip.confirmed_seats} confirmées</span></label><button type="submit" disabled={saving}>{saving ? '…' : 'Mettre à jour'}</button></form><div className="manager-actions"><button className="button button-outline button-small" onClick={() => onEdit(trip)}>Modifier</button>{['published', 'full'].includes(trip.status) && <button className="button button-outline button-small" onClick={closeTrip}>Clôturer</button>}{['draft', 'pending', 'published', 'full', 'closed'].includes(trip.status) && <button className="button button-outline button-small" onClick={cancelTrip}>Annuler la sortie</button>}{trip.status === 'draft' && <button className="button button-small" onClick={async () => { try { await api(`/trips/${trip.id}/submit/`, { method: 'POST' }); onUpdated() } catch (e) { onError((e as Error).message) } }}>Soumettre <ArrowRight size={14}/></button>}</div></article>
}

function downloadPickupManifest(bookings: Booking[]) {
  const rows = [['Activité', 'Date', 'Participant', 'Places', 'Point de montée', 'Heure prévue', 'Adresse et consignes', 'Statut'], ...[...bookings].sort((a, b) => `${a.trip_title}-${a.pickup_name}`.localeCompare(`${b.trip_title}-${b.pickup_name}`)).map((booking) => [booking.trip_title, formatDate(booking.start_at), booking.traveler_name, String(booking.quantity), booking.pickup_name || 'Point à confirmer', booking.pickup_time?.slice(0, 5) ?? '', booking.pickup_description, booking.status])]
  const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = 'participants-par-point-de-ramassage.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

function OrganizerDashboard() {
  const { user } = useSession()
  const [organizations, setOrganizations] = useState<Organizer[]>([])
  const [organization, setOrganization] = useState<Organizer | null>(null)
  const [trips, setTrips] = useState<Trip[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [tab, setTab] = useState<'trips' | 'bookings' | 'new' | 'team' | 'profile'>('trips')
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    api<Page<Organizer>>('/organizations/?managed=true').then((page) => {
      setOrganizations(page.results)
      const savedId = Number(sessionStorage.getItem('rihla-organization'))
      const selected = page.results.find((item) => item.id === savedId) ?? page.results[0] ?? null
      setOrganization(selected)
      if (selected) sessionStorage.setItem('rihla-organization', String(selected.id))
      else setLoading(false)
    }).catch((e: Error) => { setError(e.message); setLoading(false) })
  }, [user?.id, refresh])
  useEffect(() => {
    if (!organization) return
    setLoading(true); setError('')
    Promise.all([api<Page<Trip>>(`/trips/?organizer=${organization.id}&ordering=recent`), api<Page<Booking>>(`/bookings/?organization=${organization.id}`)]).then(([tripPage, bookingPage]) => { setTrips(tripPage.results); setBookings(bookingPage.results) }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [organization?.id, refresh])
  if (!user) return <SignInPrompt title="Faites grandir vos aventures." text="Créez une organisation ou connectez-vous pour gérer ses activités et ses réservations."/>
  if (loading) return <div className="page-container"><Loading/></div>
  const update = () => setRefresh((value) => value + 1)
  if (!organization) return <div className="page-container dashboard-page"><div className="page-intro"><p className="eyebrow">ESPACE ORGANISATION</p><h1>Présentez votre équipe.</h1><p>Créez une agence, un club ou une association. Son profil sera examiné avant d’être présenté comme vérifié.</p></div><OrganizationProfileForm onCreated={(created) => { setOrganizations((items) => [...items, created]); setOrganization(created); setRefresh((value) => value + 1) }}/></div>
  const role = organization.current_user_role ?? ''
  const canPublish = ['owner', 'admin', 'publisher'].includes(role)
  const canManageBookings = ['owner', 'admin', 'bookings'].includes(role)
  const canManageMembers = ['owner', 'admin'].includes(role)
  const statusText = { pending: 'En vérification', verified: 'Organisation vérifiée', rejected: 'Justificatifs à corriger' }[organization.verification] ?? organization.verification
  return <div className="page-container dashboard-page"><div className="dashboard-welcome"><div><p className="eyebrow"><span className="eyebrow-line"/> ESPACE ORGANISATION</p><h1>{organization.name}<span className="green-period">.</span></h1><p>Gérez les activités, l’équipe et les réservations de votre organisation.</p></div><span className={`status-pill status-${organization.verification}`}><span/>{statusText}</span></div>{organizations.length > 1 && <label className="organization-switcher field-label">Mes organisations<select value={organization.id} onChange={(event) => { const selected = organizations.find((item) => item.id === Number(event.target.value)); if (selected) { setOrganization(selected); sessionStorage.setItem('rihla-organization', String(selected.id)); setTab('trips') } }}>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.current_user_role}</option>)}</select></label>}{error && <ErrorMessage>{error}</ErrorMessage>}<div className="dashboard-stats"><div><small>ACTIVITÉS</small><strong>{trips.length}</strong></div><div><small>DEMANDES À TRAITER</small><strong>{bookings.filter((booking) => booking.status === 'pending').length}</strong></div><div><small>PLACES CONFIRMÉES</small><strong>{bookings.filter((booking) => booking.status === 'confirmed').reduce((total, booking) => total + booking.quantity, 0)}</strong></div></div><div className="dashboard-tabs">{canPublish && <button className={tab === 'trips' ? 'active' : ''} onClick={() => setTab('trips')}>Activités</button>}{canManageBookings && <button className={tab === 'bookings' ? 'active' : ''} onClick={() => setTab('bookings')}>Réservations <span className="tab-count">{bookings.filter((booking) => booking.status === 'pending').length}</span></button>}{canPublish && <button className={tab === 'new' ? 'active' : ''} onClick={() => { setEditingTrip(null); setTab('new') }}><span className="plus-tab">+</span> Nouvelle activité</button>}{canManageMembers && <button className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>Membres</button>}{['owner', 'admin', 'profile'].includes(role) && <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>Profil public</button>}</div>
    {tab === 'trips' && canPublish && <div className="manager-list">{trips.length ? trips.map((trip) => <ManagerTripRow key={trip.id} trip={trip} onEdit={(item) => { setEditingTrip(item); setTab('new') }} onUpdated={update} onError={setError}/>) : <EmptyState title="Votre première activité" text="Ajoutez un séjour ou une aventure nature à votre catalogue."/>}<button className="button button-outline" onClick={() => { setEditingTrip(null); setTab('new') }}>Créer une activité <ArrowRight size={15}/></button></div>}
    {tab === 'bookings' && canManageBookings && <><button className="button button-outline button-small manifest-export" onClick={() => downloadPickupManifest(bookings)}>Exporter les participants par point de montée</button><div className="booking-list organizer-bookings">{bookings.length ? [...bookings].sort((a, b) => `${a.trip_title}-${a.pickup_name}`.localeCompare(`${b.trip_title}-${b.pickup_name}`)).map((booking) => <article className="booking-row" key={booking.id}><span className="booking-date-card"><small>{new Date(booking.start_at).toLocaleDateString('fr-DZ', { month: 'short', timeZone: 'Africa/Algiers' }).toUpperCase()}</small><strong>{new Date(booking.start_at).toLocaleDateString('fr-DZ', { day: '2-digit', timeZone: 'Africa/Algiers' })}</strong></span><span className="booking-row-main"><Link to={`/voyage/${booking.trip_id}`}><strong>{booking.trip_title}</strong></Link><small><CircleUserRound size={14}/>{booking.traveler_name || 'Voyageur'} · {booking.quantity} place{booking.quantity > 1 ? 's' : ''}</small><small className="pickup-snapshot"><MapPin size={14}/>{booking.pickup_name || 'Point de montée à confirmer'}{booking.pickup_time ? ` · ${booking.pickup_time.slice(0, 5)}` : ''}{booking.pickup_description ? ` · ${booking.pickup_description}` : ''}</small></span><span className={`status-pill status-${booking.status}`}><span/>{statusLabels[booking.status] ?? booking.status}</span>{booking.status === 'pending' ? <span className="booking-actions"><button className="button button-small" onClick={async () => { try { await api(`/bookings/${booking.id}/confirm/`, { method: 'POST' }); update() } catch (e) { setError((e as Error).message) } }}><Check size={14}/>Confirmer</button><button className="button button-outline button-small" onClick={async () => { try { await api(`/bookings/${booking.id}/decline/`, { method: 'POST' }); update() } catch (e) { setError((e as Error).message) } }}>Refuser</button></span> : booking.status === 'confirmed' && <button className="button button-outline button-small" onClick={async () => { try { await api(`/bookings/${booking.id}/cancel/`, { method: 'POST' }); update() } catch (e) { setError((e as Error).message) } }}>Annuler</button>}</article>) : <EmptyState title="Aucune réservation pour le moment" text="Les demandes des voyageurs apparaîtront ici."/>}</div></>}
    {tab === 'new' && canPublish && <TripForm key={`${organization.id}-${editingTrip?.id ?? 'new'}`} organizer={organization} initialTrip={editingTrip ?? undefined} onCreated={() => { setEditingTrip(null); update(); setTab('trips') }}/>} 
    {tab === 'team' && canManageMembers && <TeamPanel organization={organization} onChanged={update}/>}
    {tab === 'profile' && ['owner', 'admin', 'profile'].includes(role) && <OrganizationProfilePanel organization={organization} onSaved={update}/>}
  </div>
}
function OrganizationProfileForm({ onCreated }: { onCreated: (organization: Organizer) => void }) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError('')
    const form = new FormData(event.currentTarget)
    const documentKind = String(form.get('document_kind') || 'business')
    const documents = form.getAll('documents').filter((file): file is File => file instanceof File && file.size > 0)
    form.delete('documents'); form.delete('document_kind')
    for (const key of ['logo', 'cover']) { const file = form.get(key); if (file instanceof File && !file.size) form.delete(key) }
    try {
      const organization = await api<Organizer>('/organizations/', { method: 'POST', body: form })
      let uploadMessage = ''
      try { for (const file of documents) { const body = new FormData(); body.set('organization', String(organization.id)); body.set('kind', documentKind); body.set('file', file); await api('/organization-documents/', { method: 'POST', body }) } }
      catch (e) { uploadMessage = (e as Error).message }
      onCreated(organization)
      if (uploadMessage) setError(`Profil créé. Ajoutez les justificatifs depuis l’onglet « Profil public » : ${uploadMessage}`)
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  return <form className="editor-card" onSubmit={submit}><div className="editor-grid"><label className="field-label">Nom public de l’organisation<input name="name" required maxLength={140}/></label><label className="field-label">Type d’organisation<select name="kind"><option value="agency">Agence de voyages</option><option value="club">Club de randonnée</option><option value="association">Association</option></select></label><label className="field-label">Zone d’activité<input name="region" placeholder="Ex. Oran"/></label><label className="field-label">E-mail public<input name="public_email" type="email"/></label><label className="field-label">Téléphone<input name="public_phone"/></label><label className="field-label">Site web<input name="website" type="url" placeholder="https://"/></label><label className="field-label">Instagram<input name="instagram" type="url" placeholder="https://instagram.com/…"/></label><label className="field-label">Facebook<input name="facebook" type="url" placeholder="https://facebook.com/…"/></label><label className="field-label">TikTok<input name="tiktok" type="url" placeholder="https://tiktok.com/@…"/></label><label className="field-label">Logo<input name="logo" type="file" accept="image/*"/></label><label className="field-label">Photo de couverture<input name="cover" type="file" accept="image/*"/></label><label className="field-label field-span">Présentation<textarea name="about" rows={4} required placeholder="Présentez votre équipe, votre zone d’activité et votre approche…"/></label><label className="field-label">Type de justificatif<select name="document_kind"><option value="business">Registre ou agrément</option><option value="identity">Justificatif d’identité</option><option value="other">Autre justificatif</option></select></label><label className="field-label">Justificatifs (PDF, JPG, PNG, WebP)<input name="documents" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple/></label></div>{error && <ErrorMessage>{error}</ErrorMessage>}<div className="editor-submit"><p>Le badge de vérification ne s’affichera qu’après examen des justificatifs par l’administrateur.</p><button className="button" disabled={saving}>{saving ? 'Création…' : 'Créer l’organisation'} <ArrowRight size={16}/></button></div></form>
}
function TripForm({ organizer, initialTrip, onCreated }: { organizer: Organizer; initialTrip?: Trip; onCreated: () => void }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [universe, setUniverse] = useState<'voyages' | 'nature'>(initialTrip?.universe ?? 'nature')
  const [point, setPoint] = useState<[number, number] | null>(null)
  const [meetingPoint, setMeetingPoint] = useState<[number, number] | null>(() => initialTrip?.meeting_latitude != null && initialTrip.meeting_longitude != null ? [initialTrip.meeting_latitude, initialTrip.meeting_longitude] : null)
  const [destinationPoint, setDestinationPoint] = useState<[number, number] | null>(() => initialTrip?.destination_latitude != null && initialTrip.destination_longitude != null ? [Number(initialTrip.destination_latitude), Number(initialTrip.destination_longitude)] : null)
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeResults, setPlaceResults] = useState<GeoResult[]>([])
  const [searchingPlaces, setSearchingPlaces] = useState(false)
  const [stopName, setStopName] = useState('')
  const [stopDescription, setStopDescription] = useState('')
  const [stopTime, setStopTime] = useState('')
  const [editingStop, setEditingStop] = useState<number | null>(null)
  const [stops, setStops] = useState<PickupPoint[]>(initialTrip?.pickup_points ?? [])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState('')
  useEffect(() => { api<Page<Category>>('/categories/').then((p) => setCategories(p.results)).catch(() => undefined) }, [])
  const searchPlace = async () => {
    if (!placeQuery.trim()) return
    setSearchingPlaces(true); setError('')
    try {
      const cacheKey = `rihla-geocode:${placeQuery.trim().toLowerCase()}`
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) { setPlaceResults(JSON.parse(cached) as GeoResult[]); return }
      const lastRequest = Number(localStorage.getItem('rihla-geocode-last') || 0)
      const delay = Math.max(0, 1050 - (Date.now() - lastRequest))
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      localStorage.setItem('rihla-geocode-last', String(Date.now()))
      const endpoint = import.meta.env.VITE_GEOCODER_URL || 'https://nominatim.openstreetmap.org/search'
      const url = new URL(endpoint)
      url.searchParams.set('q', placeQuery.trim()); url.searchParams.set('format', 'jsonv2'); url.searchParams.set('limit', '5'); url.searchParams.set('countrycodes', 'dz')
      const response = await fetch(url, { headers: { 'Accept-Language': 'fr' } })
      if (!response.ok) throw new Error('Le service de recherche de lieux est momentanément indisponible.')
      const results = await response.json() as GeoResult[]
      sessionStorage.setItem(cacheKey, JSON.stringify(results)); setPlaceResults(results)
      if (!results.length) setError('Aucun lieu trouvé en Algérie. Essayez un autre nom ou placez le repère sur la carte.')
    } catch (e) { setError((e as Error).message) } finally { setSearchingPlaces(false) }
  }
  const addStop = () => { if (!point || !stopName.trim()) { setError('Choisissez un lieu sur la carte et donnez-lui un nom.'); return } setStops((list) => { const updated = [...list]; const value = { ...(editingStop === null ? { is_active: true } : updated[editingStop]), name: stopName.trim(), description: stopDescription.trim(), latitude: point[0], longitude: point[1], estimated_time: stopTime ? `${stopTime}:00` : null, position: editingStop ?? list.length }; if (editingStop === null) updated.push(value); else updated[editingStop] = value; return updated.map((item, position) => ({ ...item, position })) }); setStopName(''); setStopDescription(''); setStopTime(''); setEditingStop(null); setPoint(null); setError('') }
  const moveStop = (index: number, direction: -1 | 1) => setStops((list) => { const next = index + direction; if (next < 0 || next >= list.length) return list; const reordered = [...list]; [reordered[index], reordered[next]] = [reordered[next], reordered[index]]; return reordered.map((item, position) => ({ ...item, position })) })
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true)
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    const body: Record<string, unknown> = { ...data, organization_id: organizer.id, universe, accommodation: universe === 'voyages' ? String(data.accommodation || '') : '', board: universe === 'voyages' ? String(data.board || '') : '', category: Number(data.category), duration_days: Number(data.duration_days), capacity: Number(data.capacity), price: data.price, start_at: data.start_at, end_at: data.end_at || null, family_friendly: data.family_friendly === 'on', meeting_name: data.meeting_name || '', meeting_time: data.meeting_time || null, meeting_latitude: meetingPoint?.[0] ?? null, meeting_longitude: meetingPoint?.[1] ?? null, destination_latitude: destinationPoint?.[0] ?? null, destination_longitude: destinationPoint?.[1] ?? null, destination_estimated_time: data.destination_estimated_time || null, pickup_points: stops }
    try { const trip = await api<Trip>(initialTrip ? `/trips/${initialTrip.id}/` : '/trips/', { method: initialTrip ? 'PATCH' : 'POST', body: JSON.stringify(body) }); if (initialTrip) onCreated(); else setCreatedId(trip.id) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const submitForReview = async () => { if (!createdId) return; try { await api(`/trips/${createdId}/submit/`, { method: 'POST' }); onCreated() } catch (e) { setError((e as Error).message) } }
  const uploadPhoto = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    const files = form.getAll('image').filter((value): value is File => value instanceof File && value.size > 0)
    if (!files.length) { setUploadError('Choisissez au moins une image.'); return }
    try {
      for (const [index, file] of files.entries()) {
        const body = new FormData(); body.set('trip', String(createdId)); body.set('image', file); body.set('caption', String(form.get('caption') || '')); body.set('position', String(Number(form.get('position') || 0) + index))
        await api('/trip-photos/', { method: 'POST', body })
      }
      setUploadError(`${files.length} photo${files.length > 1 ? 's' : ''} ajoutée${files.length > 1 ? 's' : ''}.`)
    } catch (e) { setUploadError((e as Error).message) }
  }
  if (createdId) return <div className="editor-card created-card"><span className="created-check"><Check/></span><p className="eyebrow">ANNONCE ENREGISTRÉE</p><h2>Votre brouillon est prêt.</h2><p>Ajoutez les photos de la galerie puis envoyez l'annonce pour validation.</p><form className="photo-upload" onSubmit={uploadPhoto}><label className="field-label">Photos (5 Mo chacune)<input type="file" name="image" accept="image/*" required multiple/></label><label className="field-label">Légende commune<input name="caption" maxLength={140}/></label><label className="field-label">Ordre de départ<input name="position" type="number" defaultValue="0" min="0"/></label><button className="button button-outline"><Sparkles size={15}/>Ajouter les photos</button></form>{uploadError && <p className="upload-result">{uploadError}</p>}{error && <ErrorMessage>{error}</ErrorMessage>}<button className="button" onClick={submitForReview}>Envoyer pour validation <ArrowRight size={16}/></button><button className="text-link text-button" onClick={onCreated}>Terminer plus tard</button></div>
  return <form className="editor-card" onSubmit={submit}><div className="editor-intro"><span className="draft-label">{initialTrip ? 'MODIFICATION' : 'BROUILLON · NON PUBLIÉ'}</span><p>Les champs suivis d'une étoile sont nécessaires pour enregistrer.</p></div><div className="editor-grid"><label className="field-label">Univers<select name="universe" value={universe} onChange={(e) => setUniverse(e.target.value as 'voyages' | 'nature')}><option value="nature">Randonnées & Camping</option><option value="voyages">Voyages & Évasions</option></select></label><label className="field-label field-span">Titre de l'annonce *<input name="title" defaultValue={initialTrip?.title ?? ''} required maxLength={180} placeholder="Ex. Une journée sur les hauteurs du Djurdjura"/></label><label className="field-label">Catégorie *<select name="category" required defaultValue={initialTrip?.category ?? ''}><option value="" disabled>Choisir une catégorie</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field-label">Destination *<input name="destination" defaultValue={initialTrip?.destination ?? ''} required placeholder="Ex. Tikjda"/></label><label className="field-label">Région de départ<input name="departure_region" defaultValue={initialTrip?.departure_region ?? organizer.region}/></label><label className="field-label">Date et heure de départ *<input name="start_at" type="datetime-local" min={new Date(Date.now() + 3600000).toISOString().slice(0, 16)} defaultValue={dateTimeForInput(initialTrip?.start_at)} required/></label><label className="field-label">Date et heure de retour<input name="end_at" type="datetime-local" defaultValue={dateTimeForInput(initialTrip?.end_at)}/></label><label className="field-label">Durée en jours *<input name="duration_days" type="number" min="1" defaultValue={initialTrip?.duration_days ?? 1} required/></label><label className="field-label">Prix par personne (DA) *<input name="price" type="number" min="0" step="100" defaultValue={initialTrip?.price ?? ''} required/></label><label className="field-label">Capacité totale *<input name="capacity" type="number" min="1" defaultValue={initialTrip?.capacity ?? 12} required/></label><label className="field-label">Type d'activité<select name="activity_type" defaultValue={initialTrip?.activity_type ?? 'trip'}><option value="trip">Autre sortie</option><option value="randonnee">Randonnée</option><option value="excursion">Excursion</option><option value="voyage-organise">Voyage organisé</option><option value="camping">Camping</option><option value="montagne">Aventure en montagne</option><option value="plage-mer">Sortie mer et plage</option><option value="sejour">Séjour premium</option><option value="hotellerie">Hôtel & resort</option><option value="experiences-exclusives">Expérience exclusive</option></select></label>{universe === 'voyages' && <><label className="field-label">Hébergement<input name="accommodation" defaultValue={initialTrip?.accommodation ?? ""} placeholder="Hôtel, écolodge, bivouac…"/></label><label className="field-label">Pension / prestations<input name="board" defaultValue={initialTrip?.board ?? ""} placeholder="Petit-déjeuner, tout compris…"/></label></>}<label className="field-label">Difficulté<select name="difficulty" defaultValue={initialTrip?.difficulty ?? ''}><option value="">Non précisée</option><option value="easy">Facile</option><option value="moderate">Modérée</option><option value="hard">Difficile</option></select></label><label className="check-label field-span"><input name="family_friendly" type="checkbox" defaultChecked={initialTrip?.family_friendly ?? false}/><span>Adaptée aux familles</span></label><label className="field-label field-span">Description *<textarea name="description" rows={5} defaultValue={initialTrip?.description ?? ''} required/></label><label className="field-label field-span">Programme<textarea name="itinerary" rows={3} defaultValue={initialTrip?.itinerary ?? ''}/></label><label className="field-label">À prévoir<textarea name="requirements" rows={3} defaultValue={initialTrip?.requirements ?? ''}/></label><label className="field-label">Inclus dans le prix<textarea name="included" rows={3} defaultValue={initialTrip?.included ?? ''}/></label><label className="field-label">Non inclus<textarea name="excluded" rows={3} defaultValue={initialTrip?.excluded ?? ''}/></label><label className="field-label">Conditions d'annulation<textarea name="cancellation_policy" rows={3} defaultValue={initialTrip?.cancellation_policy ?? ''}/></label></div>
    <div className="editor-map-section"><div><p className="eyebrow"><span className="eyebrow-line"/> ITINÉRAIRE ET POINTS DE RAMASSAGE</p><h3>Préparez le trajet du bus.</h3><p>Placez les points réels sur la carte. Aucun tracé ni temps de route n’est calculé automatiquement.</p></div><label className="field-label">Places restantes (mise à jour manuelle)<input name="available_seats" type="number" min="0" defaultValue={initialTrip?.available_seats ?? initialTrip?.capacity ?? 12} required/></label><label className="field-label">Nom du départ<input name="meeting_name" defaultValue={initialTrip?.meeting_name ?? ''} placeholder="Ex. Gare routière d’Alger"/></label><label className="field-label">Heure prévue au départ<input name="meeting_time" type="time" defaultValue={initialTrip?.meeting_time?.slice(0, 5) ?? ''}/></label><label className="field-label">Heure prévue à destination<input name="destination_estimated_time" type="time" defaultValue={initialTrip?.destination_estimated_time?.slice(0, 5) ?? ''}/></label><div className="geo-search"><input aria-label="Rechercher un lieu en Algérie" value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} placeholder="Rechercher une ville ou un lieu en Algérie"/><button type="button" className="button button-small" onClick={() => searchPlace()} disabled={searchingPlaces}>{searchingPlaces ? 'Recherche…' : <><Search size={15}/>Rechercher</>}</button></div>{placeResults.length > 0 && <div className="geo-results">{placeResults.map((result) => <button type="button" key={result.place_id} onClick={() => { setPoint([Number(result.lat), Number(result.lon)]); setPlaceQuery(result.display_name.split(',')[0]); setPlaceResults([]) }}><MapPin size={14}/><span>{result.display_name}</span></button>)}</div>}<ActivityMap interactive point={point} onPick={setPoint} extraPoints={[...(meetingPoint ? [{ name: initialTrip?.meeting_name || 'Départ du bus', latitude: meetingPoint[0], longitude: meetingPoint[1], kind: 'departure' as const }] : []), ...stops.map((stop) => ({ ...stop, kind: 'pickup' as const })), ...(destinationPoint ? [{ name: initialTrip?.destination || 'Destination', latitude: destinationPoint[0], longitude: destinationPoint[1], kind: 'destination' as const }] : [])]}/>{point && <div className="map-point-actions"><span className="coordinates-note"><MapPin size={14}/> Repère : {point[0]}, {point[1]}</span><button type="button" className="button button-outline button-small" onClick={() => { setMeetingPoint(point); setPoint(null); setError('') }}>Définir le départ ici</button><button type="button" className="button button-outline button-small" onClick={() => { setDestinationPoint(point); setPoint(null); setError('') }}>Définir l’arrivée ici</button></div>}<div className="stop-add"><input aria-label="Nom du point de ramassage" value={stopName} onChange={(e) => setStopName(e.target.value)} placeholder="Nom de l’arrêt (ex. Gare routière)"/><input aria-label="Adresse ou consigne de rendez-vous" value={stopDescription} onChange={(e) => setStopDescription(e.target.value)} placeholder="Adresse ou consigne pour retrouver le bus"/><label className="stop-time"><span>Heure prévue</span><input aria-label="Heure prévue du ramassage" type="time" value={stopTime} onChange={(e) => setStopTime(e.target.value)}/></label><button className="button button-outline button-small" type="button" onClick={addStop}>{editingStop === null ? 'Ajouter cet arrêt' : 'Enregistrer cet arrêt'} <span>+</span></button></div>{stops.length > 0 && <div className="stops-added">{stops.map((s, i) => <div key={s.id ?? `${s.position}-${s.name}`}><span className="pickup-number">{i + 1}</span><span>{s.name}<small>{s.estimated_time?.slice(0, 5) ?? 'Horaire à préciser'} · {s.description || `${s.latitude}, ${s.longitude}`}{!s.is_active ? ' · Désactivé' : ''}</small></span><button type="button" aria-label={`Modifier ${s.name}`} onClick={() => { setEditingStop(i); setStopName(s.name); setStopDescription(s.description); setStopTime(s.estimated_time?.slice(0, 5) ?? ''); setPoint([Number(s.latitude), Number(s.longitude)]) }}>Modifier</button><button type="button" aria-label={`Monter ${s.name}`} disabled={i === 0} onClick={() => moveStop(i, -1)}>↑</button><button type="button" aria-label={`Descendre ${s.name}`} disabled={i === stops.length - 1} onClick={() => moveStop(i, 1)}>↓</button><button type="button" aria-label={`${s.is_active ? 'Désactiver' : 'Activer'} ${s.name}`} onClick={() => setStops((list) => list.map((item, index) => index === i ? { ...item, is_active: !item.is_active } : item))}>{s.is_active ? 'Désactiver' : 'Activer'}</button><button type="button" aria-label={`Supprimer ${s.name}`} onClick={() => setStops((list) => list.filter((_, index) => index !== i).map((item, position) => ({ ...item, position })))}><X size={15}/></button></div>)}</div>}<p className="map-provider-note">Carte et recherche propulsées par OpenStreetMap · horaires prévisionnels · <a href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noreferrer">conditions d'utilisation</a></p></div>{error && <ErrorMessage>{error}</ErrorMessage>}<div className="editor-submit"><p>Votre annonce sera enregistrée en brouillon. Vous pourrez la relire avant validation.</p><button className="button" disabled={busy}>{busy ? 'Enregistrement…' : initialTrip ? 'Enregistrer les modifications' : 'Enregistrer le brouillon'} <ArrowRight size={16}/></button></div></form>
}
