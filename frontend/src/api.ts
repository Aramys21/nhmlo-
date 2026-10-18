import type { GeoJsonObject } from 'geojson'

export const API = '/api/v1'

export type User = { id: number; username: string; email: string; first_name: string; last_name: string; role: 'traveler' | 'organizer' | 'admin' }
export type Category = { id: number; name: string; slug: string; description: string }
export type PickupPoint = { id?: number; name: string; description: string; latitude: number; longitude: number; estimated_time: string | null; position: number; is_active: boolean }
export type Photo = { id: number; image: string; caption: string; position: number }
export type Trip = {
  id: number; organizer: number; organizer_name: string; organizer_verification: string; organizer_current_user_role: string | null; organizer_average_rating: number | null; organizer_review_count: number; category: number; category_name: string
  title: string; description: string; universe: 'voyages' | 'nature'; activity_type: string; accommodation: string; board: string; destination: string; destination_latitude: number | null; destination_longitude: number | null; destination_estimated_time: string | null; departure_region: string; start_at: string; end_at: string | null
  duration_days: number; price: string; capacity: number; confirmed_seats: number; available_seats: number; difficulty: string; family_friendly: boolean
  review_count: number; average_activity_rating: number | null
  itinerary: string; requirements: string; included: string; excluded: string; cancellation_policy: string; meeting_name: string; meeting_time: string | null
  meeting_latitude: number | null; meeting_longitude: number | null; pickup_points: PickupPoint[]; photos: Photo[]; status: string; featured: boolean
  route_geojson: GeoJsonObject | null
}
export type Booking = { id: number; trip_id: number; trip_title: string; destination: string; start_at: string; end_at: string | null; price_per_person: string; traveler_name: string; pickup_point: number | null; pickup_point_name: string | null; pickup_name: string; pickup_description: string; pickup_latitude: string | null; pickup_longitude: string | null; pickup_time: string | null; quantity: number; status: string; review_id: number | null; review_eligible: boolean; created_at: string }
export type Organization = { id: number; owner: number; owner_name: string; kind: string; name: string; about: string; region: string; logo: string; cover: string; public_email: string; public_phone: string; website: string; instagram: string; facebook: string; tiktok: string; verification: string; verification_note: string; average_rating: number | null; review_count: number; current_user_role: string | null }
export type Organizer = Organization
export type OrganizationMember = { id: number; user: number; username: string; email: string; user_email?: string; role: string; created_at: string }
export type OrganizationDocument = { id: number; kind: string; created_at: string }
export type Review = { id: number; booking_id: number; reviewer: number; reviewer_name: string; organization: number; organization_name: string; trip: number; trip_title: string; organization_rating: number; activity_rating: number | null; communication_rating: number | null; program_rating: number | null; value_rating: number | null; comment: string; status: string; moderator_note: string; created_at: string }
export type Notification = { id: number; message: string; booking: number | null; is_read: boolean; created_at: string }
export type Report = { id: number; reporter: number; reporter_name: string; trip: number | null; trip_title: string | null; organizer: number | null; organizer_name: string | null; review: number | null; review_comment: string | null; review_rating: number | null; review_author: string | null; reason: string; description: string; status: string; moderator_note: string; created_at: string; updated_at: string }
export type AdminStats = { users_total: number; travelers_total: number; organizers_total: number; organizers_pending: number; trips_total: number; trips_by_status: Record<string, number>; upcoming_public_trips: number; bookings_by_status: Record<string, number>; confirmed_seats: number; reports_pending: number; reports_in_review: number; reviews_total: number; reviews_hidden: number }
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] }

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('rihla_token')
  const headers = new Headers(options.headers)
  if (token) headers.set('Authorization', `Token ${token}`)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API}${path}`, { ...options, headers })
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const detail = body?.detail ?? body?.non_field_errors?.[0] ?? (body && Object.entries(body).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`).join(' · ')) ?? 'Une erreur est survenue.'
    throw new ApiError(String(detail), response.status)
  }
  return body as T
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-DZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Algiers' }).format(new Date(value))
}
export function money(value: string | number) {
  return `${new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(Number(value))} DA`
}

