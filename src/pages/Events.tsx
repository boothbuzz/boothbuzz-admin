import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Eye, MapPin, Calendar as CalendarIcon, Users, Filter, Search, X, Save, AlertTriangle, Upload, Image, Clock, Building2, DollarSign, IndianRupee, IndianRupeeIcon, CheckCircle, Info, ArrowLeft, User, AlertCircle, Check, FileText, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '../components/UI/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/UI/Table';
import { Badge } from '../components/UI/Badge';
import { Button } from '../components/UI/Button';
import { EventVendorPurchaseOrderModal } from '../components/Events/EventVendorPurchaseOrderModal';
import { EventFlyerGeneratorModal } from '../components/Events/EventFlyerGeneratorModal';
import { Event, Exhibitor } from '../types';
import { apiClient } from '../lib/apiClient';
import { useEvents, useVenues, useVendors, useExhibitors, useSponsors, toDateInputValue } from '../hooks/useSupabaseData';
import { resolveMediaUrl } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface StallConfigRow {
  id: string;
  stallNo: string;
  stallSize: string;
  stallCategory: string;
  price: number;
}

interface ExtendedEventFormData {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  eventEndDate: string;
  eventTime: string;
  eventEndTime: string;
  venueId: string;
  venueName: string;
  city: string;
  maxCapacity: number;
  planType: 'Plan A' | 'Plan B' | 'Plan C' | 'Custom';
  status: 'draft' | 'published' | 'ongoing' | 'completed' | 'cancelled';
  attendees: number;
  totalRevenue: number;
  // Image Field
  eventImage: File | null;
  eventImageUrl: string;
  // Multiple Event Images Field (null = slot loaded from DB URL only at same index)
  eventImages: (File | null)[];
  eventImageUrls: string[];
  // Layout Image Field
  layoutImage: File | null;
  layoutImageUrl: string;
  // Venue Facilities & Amenities
  venueFacilities: string[];
  venueAmenities: string[];
  // Selected Facilities & Amenities for Event
  selectedFacilities: string[];
  selectedAmenities: string[];
  // Stalls Configuration
  noOfStalls: number;
  stallSize: string;
  stallCategory: string;
  // Pricing & Availability
  pricePerHour: number;
  availableHours: string;
  parkingSpaces: number;
  cateringAllowed: boolean;
  alcoholAllowed: boolean;
  smokingAllowed: boolean;
  // Unified stall config
  allStalls: StallConfigRow[];
  /** Snapshot from events.all_stalls when modal opened */
  stallNumbersFromDb: string[];
  organizationId?: string | null;
}

interface EventRegistrationRow {
  id: string;
  event_id: string;
  exhibitor_id: string | null;
  status: string;
  /** Legacy rows only; prefer exhibitors table via exhibitor_id */
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  stall_no?: string | null;
  created_at?: string;
}

interface OrganizerOption {
  id: string;
  name: string;
}

const SPONSOR_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'title', label: 'Title Sponsorship' },
  { value: 'co_sponsor', label: 'Co-Sponsor' },
  { value: 'associate', label: 'Associate Sponsor' },
  { value: 'supporting', label: 'Supporting Sponsor' },
  { value: 'in_kind', label: 'In-Kind Sponsor' },
];

/** Legacy rows may still use status pending */
const registrationIsInterested = (reg: Pick<EventRegistrationRow, 'status'>) => {
  const s = String(reg.status ?? '').trim().toLowerCase();
  if (s === 'approved' || s === 'rejected') return false;
  return s === 'interested' || s === 'pending';
};

const registrationStatusBadgeLabel = (reg: Pick<EventRegistrationRow, 'status'>) =>
  registrationIsInterested(reg) ? 'interested' : String(reg.status ?? '').trim().toLowerCase();

/** Normalize DB/API quirks so Edit always matches saved state (case, whitespace). */
const normalizeRegistrationRow = (r: EventRegistrationRow): EventRegistrationRow => {
  const stallRaw = r.stall_no;
  const stall_no =
    stallRaw != null && String(stallRaw).trim() !== '' ? String(stallRaw).trim() : null;
  let statusRaw = String(r.status ?? '').trim().toLowerCase();
  if (statusRaw === '') statusRaw = stall_no ? 'approved' : 'pending';
  // Stall assignment is only allowed after approval in this app — heal bad rows that have stall but old status.
  if (stall_no && (statusRaw === 'interested' || statusRaw === 'pending')) {
    statusRaw = 'approved';
  }
  return { ...r, status: statusRaw, stall_no };
};

/** If duplicate event_registrations exist for the same exhibitor, keep the most meaningful row. */
const dedupeRegistrationsByExhibitor = (rows: EventRegistrationRow[]): EventRegistrationRow[] => {
  const by = new Map<string, EventRegistrationRow>();
  const score = (r: EventRegistrationRow) => {
    const s = String(r.status ?? '').toLowerCase();
    const hasStall = Boolean(r.stall_no?.trim());
    if (s === 'approved' && hasStall) return 5;
    if (s === 'approved') return 4;
    if (s === 'rejected') return 3;
    if (hasStall) return 2;
    if (s === 'interested' || s === 'pending') return 1;
    return 0;
  };
  for (const r of rows) {
    if (!r.exhibitor_id) continue;
    const cur = by.get(r.exhibitor_id);
    if (!cur) {
      by.set(r.exhibitor_id, r);
      continue;
    }
    const sc = score(r);
    const scc = score(cur);
    if (sc > scc) by.set(r.exhibitor_id, r);
    else if (sc === scc && String(r.created_at || '') > String(cur.created_at || '')) {
      by.set(r.exhibitor_id, r);
    }
  }
  return Array.from(by.values()).sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || '')),
  );
};

const processFetchedRegistrations = (rows: EventRegistrationRow[]): EventRegistrationRow[] =>
  dedupeRegistrationsByExhibitor(rows.map(normalizeRegistrationRow).filter((r) => r.exhibitor_id != null));

const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transform transition-all duration-300 translate-x-full ${type === 'success' ? 'bg-green-500 text-white' :
    type === 'error' ? 'bg-red-500 text-white' :
      'bg-blue-500 text-white'
    }`;

  notification.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <span class="mr-2">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
          <span>${message}</span>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">
          ✕
        </button>
      </div>
    `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.remove('translate-x-full');
  }, 100);

  setTimeout(() => {
    if (notification.parentElement) {
      notification.classList.add('translate-x-full');
      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove();
        }
      }, 300);
    }
  }, 5000);
};

export const Events: React.FC = () => {
  const { events, loading, refetch } = useEvents();
  const { venues } = useVenues();
  const activeVenues = venues.filter(
    (venue) => (venue.status || '').toString().toLowerCase() === 'active'
  );
  const { vendors } = useVendors();
  const activeVendors = vendors.filter(
    (v) => (v.status || '').toString().toLowerCase() === 'active'
  );
  const { exhibitors, refetch: refetchExhibitors } = useExhibitors();
  const { sponsors } = useSponsors();
  const { user, isSuperAdmin } = useAuth();
  const [organizers, setOrganizers] = useState<OrganizerOption[]>([]);
  const [selectedOrganizerId, setSelectedOrganizerId] = useState<string>('all');

  // Debug vendor data
  console.log('🔍 Vendors loaded:', vendors.length, vendors);
  const [exhibitorUpdates, setExhibitorUpdates] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    apiClient
      .from('organizations')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const rows = (data || [])
          .map((org: any) => ({
            id: String(org.id),
            name: String(org.name || '').trim(),
          }))
          .filter((org) => org.id && org.name);
        setOrganizers(rows);
      });

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  const extractUrlsFromString = (value: string): string[] => {
    // Handles values like:
    // - 'https://...'
    // - '["https://...","https://..."]'
    // - '"https://..."'
    // - escaped JSON-ish blobs containing URLs
    const matches = value.match(/https?:\/\/[^\s"'\\\],]+/g);
    return (matches || []).map((url) => url.trim()).filter(Boolean);
  };

  // Normalize image field regardless of DB shape:
  // plain URL string, JSON stringified array, actual array, quoted/escaped JSON strings.
  const parseEventImages = (eventImageUrl: unknown): string[] => {
    if (eventImageUrl == null) return [];

    if (Array.isArray(eventImageUrl)) {
      return eventImageUrl
        .flatMap((value) => parseEventImages(value))
        .filter((value) => value.length > 0);
    }

    if (typeof eventImageUrl === 'object' && eventImageUrl !== null) {
      try {
        return parseEventImages(JSON.stringify(eventImageUrl));
      } catch {
        return [];
      }
    }

    if (typeof eventImageUrl !== 'string') {
      return [];
    }

    const normalized = eventImageUrl.trim();
    if (!normalized) return [];

    try {
      const parsed = JSON.parse(normalized);
      if (parsed !== eventImageUrl) {
        return parseEventImages(parsed);
      }
    } catch {
      // Not JSON; continue with plain value handling.
    }

    const extracted = extractUrlsFromString(normalized);
    if (extracted.length > 0) {
      return extracted;
    }

    return [normalized];
  };

  const getPrimaryEventImage = (eventImageUrl: unknown): string => {
    const images = parseEventImages(eventImageUrl);
    return images[0] || '';
  };

  const getTotalStalls = (event: Event): number => {
    const plannedStalls = Number(event.noOfStalls || 0);
    if (plannedStalls > 0) return plannedStalls;
    return Array.isArray(event.allStalls) ? event.allStalls.length : 0;
  };

  /** Saved Supabase/public URLs (not blob: previews). */
  const isRemoteEventImageUrl = (url: string | null | undefined): boolean => {
    const s = String(url ?? '').trim();
    if (!s || s.startsWith('blob:')) return false;
    return /^(https?:|data:)/i.test(s) || !s.includes('://');
  };

  // Helper functions to get names from IDs
  const getVendorName = (vendorId: string) => {
    const vendor = vendors.find(v => v.id === vendorId);
    return vendor ? vendor.name : `Vendor ID: ${vendorId}`;
  };

  const getExhibitorName = (exhibitorId: string) => {
    const exhibitor = exhibitors.find(e => e.id === exhibitorId);
    return exhibitor ? exhibitor.companyName || `${exhibitor.firstName} ${exhibitor.lastName}` : `Exhibitor ID: ${exhibitorId}`;
  };

  const exhibitorField = (v: string | null | undefined) => {
    const s = v != null ? String(v).trim() : '';
    return s.length > 0 ? s : '—';
  };

  const exhibitorWebsiteHref = (url: string | null | undefined) => {
    const s = url?.trim();
    if (!s) return null;
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
  };

  const getSponsorName = (sponsorId: string) => {
    const sponsor = sponsors.find(s => s.id === sponsorId);
    return sponsor ? sponsor.companyName : `Sponsor ID: ${sponsorId}`;
  };

  const getSponsorRoleLabel = (role: string) =>
    SPONSOR_ROLE_OPTIONS.find(o => o.value === role)?.label ?? role;

  // const [localEvents, setLocalEvents] = useState<Event[]>([]); // for local UI updates if needed
  const [filter, setFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showFlyerModal, setShowFlyerModal] = useState(false);
  const [flyerEvent, setFlyerEvent] = useState<Event | null>(null);
  const [editFormData, setEditFormData] = useState<ExtendedEventFormData | null>(null);
  const [editErrors, setEditErrors] = useState<{ [key: string]: string }>({});
  const editVenueOptions = editFormData?.venueId
    ? Array.from(
      new Map(
        [...activeVenues, ...venues.filter((venue) => venue.id === editFormData.venueId)]
          .map((venue) => [venue.id, venue])
      ).values()
    )
    : activeVenues;
  const [editActiveTab, setEditActiveTab] = useState<'event' | 'exhibitor' | 'sponsor'>('event');
  const [viewActiveTab, setViewActiveTab] = useState<'event' | 'exhibitor'>('event');
  const [selectedExhibitorsForEdit, setSelectedExhibitorsForEdit] = useState<string[]>([]);
  const [exhibitorSearchTerm, setExhibitorSearchTerm] = useState('');
  const [registerExhibitorPickId, setRegisterExhibitorPickId] = useState('');

  const exhibitorMatchesSearch = (exhibitor: Exhibitor) => {
    const q = exhibitorSearchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      (exhibitor.companyName || '').toLowerCase().includes(q) ||
      (exhibitor.firstName || '').toLowerCase().includes(q) ||
      (exhibitor.lastName || '').toLowerCase().includes(q) ||
      (exhibitor.email || '').toLowerCase().includes(q) ||
      (exhibitor.phone || '').toLowerCase().includes(q) ||
      (exhibitor.alternatePhone || '').toLowerCase().includes(q) ||
      (exhibitor.category || '').toLowerCase().includes(q) ||
      (exhibitor.subCategory || '').toLowerCase().includes(q) ||
      (exhibitor.city || '').toLowerCase().includes(q) ||
      (exhibitor.state || '').toLowerCase().includes(q) ||
      (exhibitor.pincode || '').toLowerCase().includes(q)
    );
  };

  const [eventRegistrations, setEventRegistrations] = useState<EventRegistrationRow[]>([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  /** Approve flow: pick stall when event has configured stalls */
  const [approveStallModalReg, setApproveStallModalReg] = useState<EventRegistrationRow | null>(null);
  const [approveModalStallChoice, setApproveModalStallChoice] = useState('');
  // Event sponsors: { sponsorId, role } for current event (edit modal)
  const [eventSponsors, setEventSponsors] = useState<{ sponsorId: string; role: string }[]>([]);
  const [loadingEventSponsors, setLoadingEventSponsors] = useState(false);
  const [newSponsorId, setNewSponsorId] = useState('');
  const [newSponsorRole, setNewSponsorRole] = useState<string>('co_sponsor');
  const [viewEventSponsors, setViewEventSponsors] = useState<{ sponsorId: string; role: string }[]>([]);
  const [loadingViewSponsors, setLoadingViewSponsors] = useState(false);
  const [viewEventRegistrations, setViewEventRegistrations] = useState<EventRegistrationRow[]>([]);
  const [loadingViewRegistrations, setLoadingViewRegistrations] = useState(false);
  const [bulkStallSize, setBulkStallSize] = useState('');
  const [bulkStallCategory, setBulkStallCategory] = useState('');
  const [bulkStallPrice, setBulkStallPrice] = useState<number>(0);
  const [bulkStallQty, setBulkStallQty] = useState<number>(1);
  const [bulkStallPrefix, setBulkStallPrefix] = useState('A');

  // Stall removal modal state
  const [showDeleteStallModal, setShowDeleteStallModal] = useState(false);
  const [stallToRemove, setStallToRemove] = useState<{ index: number; stallNumber: string } | null>(null);

  // Vendors/Exhibitors selection
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const editVendorOptions = (() => {
    const selectedSet = new Set(selectedVendors);
    const inactiveSelected = vendors.filter(
      (v) =>
        selectedSet.has(v.id) &&
        (v.status || '').toString().toLowerCase() !== 'active'
    );
    return [...activeVendors, ...inactiveSelected];
  })();
  const [selectedExhibitors, setSelectedExhibitors] = useState<string[]>([]);

  const toggleVendor = (id: string) => {
    setSelectedVendors(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const [poVendorModal, setPoVendorModal] = useState<{ vendorId: string; mode: 'list' | 'create' } | null>(null);
  /** Vendors that have ≥1 purchase_order for the event currently open in Edit modal */
  const [eventVendorIdsWithPO, setEventVendorIdsWithPO] = useState<string[]>([]);

  const refreshEventVendorIdsWithPO = useCallback(async (eventId: string) => {
    const { data, error } = await apiClient
      .from('purchase_orders')
      .select('vendor_id')
      .eq('event_id', eventId);
    if (error || !data) {
      setEventVendorIdsWithPO([]);
      return;
    }
    const ids = [...new Set((data as { vendor_id: string }[]).map((r) => r.vendor_id))];
    setEventVendorIdsWithPO(ids);
  }, []);

  useEffect(() => {
    if (!showEditModal || !editFormData?.id) {
      setEventVendorIdsWithPO([]);
      return;
    }
    void refreshEventVendorIdsWithPO(editFormData.id);
  }, [showEditModal, editFormData?.id, refreshEventVendorIdsWithPO]);

  const toggleExhibitor = (id: string) => {
    setSelectedExhibitors(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  // Fetch exhibitor registrations when Edit modal opens for an event
  useEffect(() => {
    if (!showEditModal || !editFormData?.id) {
      setEventRegistrations([]);
      return;
    }
    let cancelled = false;
    setLoadingRegistrations(true);
    apiClient
      .from('event_registrations')
      .select('id, event_id, exhibitor_id, status, stall_no, created_at')
      .eq('event_id', editFormData.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingRegistrations(false);
        if (error) {
          console.error('Error fetching event registrations:', error);
          showNotification(
            'Could not load exhibitor registrations for this event. Check your connection and database access.',
            'error',
          );
          setEventRegistrations([]);
          return;
        }
        setEventRegistrations(processFetchedRegistrations((data as EventRegistrationRow[]) || []));
      });
    return () => { cancelled = true; };
  }, [showEditModal, editFormData?.id]);

  // Fetch event_sponsors when Edit modal opens
  useEffect(() => {
    if (!showEditModal || !editFormData?.id) {
      setEventSponsors([]);
      return;
    }
    let cancelled = false;
    setLoadingEventSponsors(true);
    apiClient
      .from('event_sponsors')
      .select('sponsor_id, role')
      .eq('event_id', editFormData.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingEventSponsors(false);
        if (error) {
          console.error('Error fetching event sponsors:', error);
          setEventSponsors([]);
          return;
        }
        setEventSponsors((data || []).map((r: { sponsor_id: string; role: string }) => ({ sponsorId: r.sponsor_id, role: r.role })));
      });
    return () => { cancelled = true; };
  }, [showEditModal, editFormData?.id]);

  // Fetch event sponsors when View modal opens
  useEffect(() => {
    if (!showViewModal || !selectedEvent?.id) {
      setViewEventSponsors([]);
      return;
    }
    let cancelled = false;
    setLoadingViewSponsors(true);
    apiClient
      .from('event_sponsors')
      .select('sponsor_id, role')
      .eq('event_id', selectedEvent.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingViewSponsors(false);
        if (error) {
          console.error('Error fetching view event sponsors:', error);
          setViewEventSponsors([]);
          return;
        }
        setViewEventSponsors(
          (data || []).map((r: { sponsor_id: string; role: string }) => ({ sponsorId: r.sponsor_id, role: r.role }))
        );
      });
    return () => { cancelled = true; };
  }, [showViewModal, selectedEvent?.id]);

  // Load registration + stall assignments for View Event (same source as Edit)
  useEffect(() => {
    if (!showViewModal || !selectedEvent?.id) {
      setViewEventRegistrations([]);
      return;
    }
    let cancelled = false;
    setLoadingViewRegistrations(true);
    apiClient
      .from('event_registrations')
      .select('id, event_id, exhibitor_id, status, stall_no, created_at')
      .eq('event_id', selectedEvent.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingViewRegistrations(false);
        if (error) {
          console.error('Error fetching view event registrations:', error);
          setViewEventRegistrations([]);
          return;
        }
        setViewEventRegistrations(processFetchedRegistrations((data as EventRegistrationRow[]) || []));
      });
    return () => {
      cancelled = true;
    };
  }, [showViewModal, selectedEvent?.id]);

  const getConfiguredStallNumbers = (): string[] => {
    if (!editFormData) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const s of editFormData.allStalls || []) {
      const row = s as StallConfigRow & { stall_no?: string };
      const n = String(row.stallNo ?? row.stall_no ?? '').trim();
      if (n && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
    if (out.length > 0) return out;
    for (const n of editFormData.stallNumbersFromDb || []) {
      const t = String(n).trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
    if (out.length > 0) return out;
    const planned = editFormData.noOfStalls || 0;
    if (planned > 0 && (!editFormData.allStalls || editFormData.allStalls.length === 0)) {
      return Array.from({ length: Math.min(Math.max(planned, 1), 200) }, (_, i) => String(i + 1));
    }
    if (editFormData.allStalls && editFormData.allStalls.length > 0) {
      return editFormData.allStalls.map((_, i) => `Stall ${i + 1}`);
    }
    return [];
  };

  const getTakenStallNumbers = (excludeRegId?: string): Set<string> => {
    const taken = new Set<string>();
    for (const r of eventRegistrations) {
      if (excludeRegId && r.id === excludeRegId) continue;
      const s = r.stall_no?.trim();
      if (s) taken.add(s);
    }
    return taken;
  };

  const getAvailableStallsForNewApproval = (reg: EventRegistrationRow): string[] => {
    const cfg = getConfiguredStallNumbers();
    const taken = getTakenStallNumbers(reg.id);
    return cfg.filter((n) => !taken.has(n));
  };

  const updateRegistrationAndSyncState = async (
    reg: EventRegistrationRow,
    patch: Partial<Pick<EventRegistrationRow, 'status' | 'stall_no'>>,
    failureLabel: string,
  ): Promise<EventRegistrationRow | null> => {
    const { data, error } = await apiClient
      .from('event_registrations')
      .update(patch)
      .eq('id', reg.id)
      .select('id, event_id, exhibitor_id, status, stall_no, created_at')
      .maybeSingle();
    if (error) {
      console.error(`Error ${failureLabel}:`, error);
      showNotification(error.message, 'error');
      return null;
    }
    if (!data) {
      showNotification(
        `Could not ${failureLabel}. Database did not return the updated row (possible permissions issue).`,
        'error',
      );
      return null;
    }
    const normalized = normalizeRegistrationRow(data as EventRegistrationRow);
    setEventRegistrations((prev) =>
      processFetchedRegistrations([
        ...prev.filter((r) => r.id !== normalized.id),
        normalized,
      ]),
    );
    return normalized;
  };

  /** Approve registration only (no stall). Stall is a separate step when the event has stalls. */
  const approveRegistrationOnly = async (reg: EventRegistrationRow): Promise<boolean> => {
    if (!reg.exhibitor_id || !editFormData) return false;
    if (String(reg.status ?? '').trim().toLowerCase() === 'approved') return true;
    const eventId = editFormData.id;
    const updatePayload = { status: 'approved' as const, stall_no: null as string | null };
    const currentIds = selectedExhibitorsForEdit || [];

    if (currentIds.includes(reg.exhibitor_id)) {
      const updated = await updateRegistrationAndSyncState(reg, updatePayload, 'approving registration');
      return Boolean(updated);
    }

    const newIds = [...currentIds, reg.exhibitor_id];
    const updated = await updateRegistrationAndSyncState(reg, updatePayload, 'approving registration');
    if (!updated) {
      return false;
    }
    const { error: updateEventError } = await apiClient.from('events').update({ exhibitor_ids: newIds }).eq('id', eventId);
    if (updateEventError) {
      console.error('Error adding exhibitor to event:', updateEventError);
      showNotification(updateEventError.message, 'error');
      return false;
    }
    setSelectedExhibitorsForEdit(newIds);
    await refetch();
    if (selectedEvent?.id === eventId) {
      setSelectedEvent((prev) => (prev ? { ...prev, exhibitors: newIds } : null));
    }
    return true;
  };

  const startApproveRegistration = (reg: EventRegistrationRow) => {
    if (!reg.exhibitor_id || !editFormData) return;
    void (async () => {
      const ok = await approveRegistrationOnly(reg);
      if (!ok) return;
      const stalls = getConfiguredStallNumbers().length > 0;
      showNotification(
        stalls ? 'Registration approved. Use Assign stall to pick a stall.' : 'Registration approved.',
        'success',
      );
      if (!stalls && reg.exhibitor_id) await syncExhibitorApprovedStatus(reg.exhibitor_id);
    })();
  };

  const startAssignStallModal = (reg: EventRegistrationRow) => {
    if (!reg.exhibitor_id || !editFormData || String(reg.status ?? '').trim().toLowerCase() !== 'approved') return;
    if (reg.stall_no?.trim()) return;
    if (getConfiguredStallNumbers().length === 0) return;
    const available = getAvailableStallsForNewApproval(reg);
    if (available.length === 0) {
      showNotification('All stalls are already assigned. Change or clear an assignment first.', 'error');
      return;
    }
    setApproveModalStallChoice(available[0] ?? '');
    setApproveStallModalReg(reg);
  };

  /** Re-pick stall for an already-approved exhibitor (same modal as assign). */
  const startChangeStallModal = (reg: EventRegistrationRow) => {
    if (!reg.exhibitor_id || !editFormData || String(reg.status ?? '').trim().toLowerCase() !== 'approved') return;
    const current = reg.stall_no?.trim();
    if (!current) return;
    if (getConfiguredStallNumbers().length === 0) return;
    const available = getAvailableStallsForNewApproval(reg);
    if (available.length === 0) {
      showNotification('No stalls available to choose from.', 'error');
      return;
    }
    setApproveModalStallChoice(available.includes(current) ? current : available[0] ?? '');
    setApproveStallModalReg(reg);
  };

  const syncExhibitorApprovedStatus = async (exhibitorId: string) => {
    const { error } = await apiClient.from('exhibitors').update({ status: 'approved' }).eq('id', exhibitorId);
    if (error) {
      showNotification('Registration saved but exhibitor status could not be updated: ' + error.message, 'error');
      return;
    }
    setExhibitorUpdates((prev) => ({ ...prev, [exhibitorId]: 'approved' }));
    await refetchExhibitors();
  };

  const handleUpdateRegistrationStall = async (reg: EventRegistrationRow, newStallRaw: string): Promise<boolean> => {
    const newStall = newStallRaw.trim() || null;
    if (newStall) {
      const configured = new Set(getConfiguredStallNumbers());
      if (!configured.has(newStall)) {
        showNotification('That stall is not in this event layout.', 'error');
        return false;
      }
      const taken = getTakenStallNumbers(reg.id);
      if (taken.has(newStall)) {
        showNotification('That stall is already assigned.', 'error');
        return false;
      }
    }
    const updated = await updateRegistrationAndSyncState(
      reg,
      { stall_no: newStall, status: 'approved' },
      'saving stall assignment',
    );
    if (!updated) {
      showNotification('Stall assignment was not saved. Please try again.', 'error');
      return false;
    }
    showNotification(newStall ? 'Stall assignment updated.' : 'Stall unassigned.', 'success');
    if (newStall && updated.exhibitor_id && String(updated.status ?? '').trim().toLowerCase() === 'approved') {
      await syncExhibitorApprovedStatus(updated.exhibitor_id);
    }
    return true;
  };

  /** Remove this exhibitor’s registration from the event (lets you add a different exhibitor later). */
  const removeExhibitorRegistrationFromEvent = async (reg: EventRegistrationRow) => {
    if (!editFormData?.id || !reg.exhibitor_id) return;
    const name = getExhibitorName(reg.exhibitor_id);
    if (
      !window.confirm(
        `Remove "${name}" from this event? Their registration and stall assignment will be cleared. You can add them again from the directory if needed.`,
      )
    ) {
      return;
    }
    const { error } = await apiClient.from('event_registrations').delete().eq('id', reg.id);
    if (error) {
      console.error(error);
      showNotification('Could not remove registration: ' + error.message, 'error');
      return;
    }
    const newIds = (selectedExhibitorsForEdit || []).filter((id) => id !== reg.exhibitor_id);
    const { error: evErr } = await apiClient
      .from('events')
      .update({ exhibitor_ids: newIds })
      .eq('id', editFormData.id);
    if (evErr) {
      showNotification('Registration removed but updating the event exhibitor list failed: ' + evErr.message, 'error');
    }
    setSelectedExhibitorsForEdit(newIds);
    setEventRegistrations((prev) => prev.filter((r) => r.id !== reg.id));
    setExhibitorUpdates((prev) => {
      const next = { ...prev };
      delete next[reg.exhibitor_id!];
      return next;
    });
    if (selectedEvent?.id === editFormData.id) {
      setSelectedEvent((prev) => (prev ? { ...prev, exhibitors: newIds } : null));
    }
    void refetch();
    showNotification('Exhibitor removed from this event.', 'success');
  };

  const handleRejectRegistration = async (reg: EventRegistrationRow) => {
    const updated = await updateRegistrationAndSyncState(
      reg,
      { status: 'rejected', stall_no: null },
      'rejecting registration',
    );
    if (!updated) {
      return;
    }
  };

  // Stalls management functions
  const validateStallCountChange = (newCount: number, currentCount: number): { isValid: boolean; message: string } => {
    const MIN_STALLS = 1;
    const MAX_STALLS = 100; // Reasonable maximum
    
    // Check minimum stalls
    if (newCount < MIN_STALLS) {
      return { 
        isValid: false, 
        message: `Minimum ${MIN_STALLS} stall required. Cannot set to ${newCount}.` 
      };
    }
    
    // Check maximum stalls
    if (newCount > MAX_STALLS) {
      return { 
        isValid: false, 
        message: `Maximum ${MAX_STALLS} stalls allowed. Cannot set to ${newCount}.` 
      };
    }
    
    // Check if reducing stalls when there are configured stalls
    if (newCount < currentCount) {
      return { 
        isValid: false, 
        message: `Cannot reduce stalls from ${currentCount} to ${newCount}. You have ${currentCount} configured stalls. Please remove excess stalls first, then reduce the count.` 
      };
    }
    
    return { isValid: true, message: '' };
  };

  const handleStallCountChange = (newCount: number) => {
    if (!editFormData) return;
    
    const currentConfiguredStalls = editFormData.allStalls.length;
    const validation = validateStallCountChange(newCount, currentConfiguredStalls);
    
    if (!validation.isValid) {
      showNotification(validation.message, 'error');
      return;
    }
    
    // If reducing stalls and there are excess stalls, show error and don't allow the change
    if (newCount < currentConfiguredStalls) {
      const excessStalls = currentConfiguredStalls - newCount;
      showNotification(
        `Cannot reduce stalls to ${newCount}. You have ${currentConfiguredStalls} configured stalls. ` +
        `Please manually remove ${excessStalls} excess stall(s) first, then reduce the count.`, 
        'error'
      );
      return; // Don't update the count
    }
    
    // Normal case - just update the count
    setEditFormData(prev => prev ? ({
      ...prev,
      noOfStalls: newCount
    }) : null);
  };

  const addStall = () => {
    if (!editFormData) return;

    const currentStallCount = editFormData.allStalls.length;
    const maxStalls = editFormData.noOfStalls || editFormData.allStalls.length;

    if (maxStalls > 0 && currentStallCount >= maxStalls) {
      showNotification(`Cannot add more stalls. Maximum limit is ${maxStalls} stalls. You have already configured ${currentStallCount} stalls.`, 'error');
      return;
    }

    setEditFormData(prev => prev ? ({
      ...prev,
      allStalls: [...prev.allStalls, { id: Date.now().toString(), stallNo: '', stallSize: '', stallCategory: '', price: 0 }]
    }) : null);
  };

  const updateStall = (index: number, field: keyof StallConfigRow, value: any) => {
    if (!editFormData) return;
    setEditFormData(prev => {
      if (!prev) return null;
      const rows = [...prev.allStalls];
      rows[index] = { ...rows[index], [field]: field === 'price' ? Number(value) || 0 : value } as StallConfigRow;
      return { ...prev, allStalls: rows };
    });
  };

  const removeStall = (index: number) => {
    if (!editFormData) return;
    
    const stallToRemove = editFormData.allStalls[index];
    const stallNumber = stallToRemove.stallNo || `Stall ${index + 1}`;
    
    // Set the stall to be removed and show confirmation modal
    setStallToRemove({ index, stallNumber });
    setShowDeleteStallModal(true);
  };

  const addBulkStalls = () => {
    if (!editFormData) return;
    const size = bulkStallSize.trim();
    const category = bulkStallCategory.trim();
    const price = Number(bulkStallPrice) || 0;
    const qty = Math.max(1, Math.floor(Number(bulkStallQty) || 0));
    const prefix = (bulkStallPrefix || 'A').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'A';

    if (!size) {
      showNotification('Select stall size for bulk add.', 'error');
      return;
    }
    if (price <= 0) {
      showNotification('Enter a valid stall price greater than 0.', 'error');
      return;
    }

    setEditFormData((prev) => {
      if (!prev) return null;
      const existing = prev.allStalls || [];
      const existingNos = new Set(existing.map((s) => String(s.stallNo || '').trim().toUpperCase()).filter(Boolean));
      const prefixedNums = existing
        .map((s) => String(s.stallNo || '').trim().toUpperCase())
        .filter((s) => s.startsWith(prefix))
        .map((s) => Number(s.slice(prefix.length)))
        .filter((n) => Number.isFinite(n) && n > 0);
      let nextNum = prefixedNums.length > 0 ? Math.max(...prefixedNums) + 1 : 1;

      const generated: StallConfigRow[] = [];
      while (generated.length < qty) {
        const stallNo = `${prefix}${nextNum}`;
        nextNum += 1;
        if (existingNos.has(stallNo)) continue;
        existingNos.add(stallNo);
        generated.push({
          id: `${Date.now()}-${generated.length}-${stallNo}`,
          stallNo,
          stallSize: size,
          stallCategory: category,
          price,
        });
      }

      const merged = [...existing, ...generated];
      const nextPlanned = Math.max(prev.noOfStalls || 0, merged.length);
      return {
        ...prev,
        noOfStalls: nextPlanned,
        allStalls: merged,
      };
    });

    showNotification(`${qty} stall(s) created: ${prefix} series.`, 'success');
  };

  const confirmRemoveStall = () => {
    if (stallToRemove && editFormData) {
      const { index, stallNumber } = stallToRemove;
      
      setEditFormData(prev => prev ? ({ 
        ...prev, 
        allStalls: prev.allStalls.filter((_, i) => i !== index) 
      }) : null);
      
      showNotification(`Removed ${stallNumber} successfully.`, 'success');
      setShowDeleteStallModal(false);
      setStallToRemove(null);
    }
  };

  const organizerScopedEvents =
    isSuperAdmin && selectedOrganizerId !== 'all'
      ? events.filter((event) => String(event.organizationId || '') === selectedOrganizerId)
      : events;

  const filteredEvents = organizerScopedEvents.filter(event => {
    const matchesFilter = filter === 'all' || event.status === filter;
    const matchesSearch = searchTerm === '' ||
      event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.venue.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.city?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'published': return 'success';
      case 'draft': return 'warning';
      case 'ongoing': return 'info';
      case 'completed': return 'default';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  const getPaymentStatusVariant = (status: string) => {
    switch (status) {
      case 'paid': return 'success';
      case 'pending': return 'warning';
      case 'refunded': return 'error';
      default: return 'default';
    }
  };

  const handleView = (event: Event) => {
    setSelectedEvent(event);
    setShowViewModal(true);
  };

  const handleOpenFlyerModal = (event: Event) => {
    setFlyerEvent(event);
    setShowFlyerModal(true);
  };

  const handleEdit = (event: Event) => {
    console.log('🔍 handleEdit called with event:', event);
    console.log('🏪 Event stalls data:', {
      inSiteStalls: event.inSiteStalls,
      allStalls: event.allStalls,
      noOfStalls: event.noOfStalls
    });
    console.log('🔍 Raw event object keys:', Object.keys(event));
    console.log('🔍 Event noOfStalls value:', event.noOfStalls);
    console.log('🔍 Event no_of_stalls value:', (event as any).no_of_stalls);
    console.log('🔍 Raw event object:', event);
    console.log('🔍 Database event object:', (event as any));
    setSelectedEvent(event);

    const eventImageUrls = parseEventImages(event.eventImageUrl)
      .map((u) => resolveMediaUrl(u))
      .filter(Boolean);

    const mappedStalls = (event.inSiteStalls || event.allStalls || []).map((stall: any, idx: number) => ({
      id: stall.id != null ? String(stall.id) : `stall-${idx}`,
      stallNo: String(stall.stallNo ?? stall.stall_no ?? '').trim(),
      stallSize: String(stall.stallSize ?? stall.stall_size ?? stall.size ?? ''),
      stallCategory: String(stall.stallCategory ?? stall.stall_category ?? stall.category ?? ''),
      price:
        typeof stall.price === 'number'
          ? stall.price
          : Number(stall.price ?? stall.stallPrice ?? stall.stall_price) || 0,
    }));

    const firstStall = mappedStalls[0];
    const prefixFromStall = (() => {
      const no = firstStall?.stallNo || '';
      const m = no.match(/^([A-Za-z]+)/);
      return m ? m[1].toUpperCase() : 'A';
    })();
    setBulkStallPrefix(prefixFromStall);
    setBulkStallSize(firstStall?.stallSize || '');
    setBulkStallPrice(firstStall?.price || 0);

    // Map Event to ExtendedEventFormData with default values for missing fields
    const editData = {
      id: event.id,
      title: event.title,
      description: event.description || '',
      eventDate: toDateInputValue(event.date || (event as any).event_date || (event as any).eventDate),
      eventEndDate: toDateInputValue(
        event.eventEndDate || (event as any).event_end_date || (event as any).eventEndDate,
      ),
      eventTime: event.time || '',
      eventEndTime: event.eventEndTime || '',
      venueId: event.venueId || '',
      venueName: event.venue,
      city: event.city || '',
      maxCapacity: event.maxCapacity,
      planType: event.planType || 'Plan A',
      status: (() => {
        const allowedStatuses = ['draft', 'published', 'ongoing', 'completed', 'cancelled'] as const;
        const status = event.status === 'upcoming' ? 'published' : event.status;
        return allowedStatuses.includes(status as any) ? status as 'draft' | 'published' | 'ongoing' | 'completed' | 'cancelled' : 'draft';
      })(),
      attendees: event.attendees,
      totalRevenue: event.totalRevenue,
      // Image Field
      eventImage: null,
      eventImageUrl: eventImageUrls[0] || '',
      // Multiple Event Images Field — parallel to eventImageUrls; null = existing remote URL at index
      eventImages: eventImageUrls.map(() => null),
      eventImageUrls,
      // Layout Image Field
      layoutImage: null,
      layoutImageUrl: resolveMediaUrl(event.layoutImageUrl || '') || '',
      // Venue Facilities & Amenities (from linked venue so edit UI can show checkboxes)
      venueFacilities: (() => {
        const v = venues.find((venue) => venue.id === event.venueId);
        return v?.facilities || [];
      })(),
      venueAmenities: (() => {
        const v = venues.find((venue) => venue.id === event.venueId);
        return v?.amenities || [];
      })(),
      // Selected Facilities & Amenities for Event
      selectedFacilities: event.selectedFacilities || [],
      selectedAmenities: event.selectedAmenities || [],
      // Stalls Configuration
      noOfStalls: event.noOfStalls || mappedStalls.length || 0,
      stallSize: firstStall?.stallSize || '',
      stallCategory: firstStall?.stallCategory || '',
      // Pricing & Availability
      pricePerHour: event.pricePerHour || 0,
      availableHours: event.availableHours || '',
      parkingSpaces: event.parkingSpaces || 0,
      cateringAllowed: event.cateringAllowed || false,
      alcoholAllowed: event.alcoholAllowed || false,
      smokingAllowed: event.smokingAllowed || false,
      // Unified stall config (support snake_case from JSONB)
      allStalls: mappedStalls,
      stallNumbersFromDb: event.stallNumbersFromDb || [],
      organizationId: event.organizationId ?? null,
    };

    console.log('📝 Mapped stalls data:', editData.allStalls);

    // Set selected vendors and exhibitors (pre-select existing ones)
    setSelectedVendors(
      (event.vendors || (event as any).vendor_ids || []).map(String).filter(Boolean),
    );
    setSelectedExhibitors(event.exhibitors || []);
    setSelectedExhibitorsForEdit(event.exhibitors || []);

    console.log('📝 Setting editFormData:', editData);
    console.log('📸 Current eventImageUrl:', event.eventImageUrl);

    setEditFormData(editData);
    setExhibitorUpdates({});
    setEditActiveTab('event');
    setShowEditModal(true);
  };

  const handleDelete = (event: Event) => {
    setSelectedEvent(event);
    setShowDeleteModal(true);
  };

  const validateEditForm = (): boolean => {
    if (!editFormData) return false;

    console.log('🔍 Starting validateEditForm with editFormData:', editFormData);

    const errors: { [key: string]: string } = {};

    // Title validation
    if (!editFormData.title.trim()) {
      errors.title = 'Event title is required';
    } else if (editFormData.title.trim().length < 3) {
      errors.title = 'Event title must be at least 3 characters';
    }

    // Description validation
    if (!editFormData.description.trim()) {
      errors.description = 'Event description is required';
    } else if (editFormData.description.trim().length < 10) {
      errors.description = 'Description must be at least 10 characters';
    }

    // Date validation — allow past dates on edit (event may already have started)
    if (!editFormData.eventDate) {
      errors.eventDate = 'Event start date is required';
    }

    // End date validation
    if (!editFormData.eventEndDate) {
      errors.eventEndDate = 'Event end date is required';
    } else if (editFormData.eventDate && editFormData.eventEndDate) {
      const startDate = new Date(editFormData.eventDate);
      const endDate = new Date(editFormData.eventEndDate);

      if (endDate < startDate) {
        errors.eventEndDate = 'Event end date cannot be before start date';
      }
    }

    // Time validation
    if (!editFormData.eventTime) {
      errors.eventTime = 'Event start time is required';
    }

    if (!editFormData.eventEndTime) {
      errors.eventEndTime = 'Event end time is required';
    }

    // Venue validation
    if (!editFormData.venueId) {
      errors.venueId = 'Please select a venue';
    }

    // City validation
    // if (!editFormData.city.trim()) {
    //   errors.city = 'City is required';
    // }

    // Capacity validation
    if (editFormData.maxCapacity < 10) {
      errors.maxCapacity = 'Maximum capacity must be at least 10';
    }

    // Stalls validation
    const configuredStalls = editFormData.allStalls.length;
    const plannedStalls = editFormData.noOfStalls || configuredStalls;
    
    if (plannedStalls < 1) {
      errors.noOfStalls = 'At least 1 stall is required';
    } else if (plannedStalls > 100) {
      errors.noOfStalls = 'Maximum 100 stalls allowed';
    } else if (configuredStalls > plannedStalls) {
      errors.noOfStalls = `You have ${configuredStalls} configured stalls but limit is set to ${plannedStalls}. Please manually remove ${configuredStalls - plannedStalls} excess stall(s) using the delete buttons below, then reduce the limit.`;
    }

    // Image validation - Make image optional for updates
    // Only require image if both current image and new image are missing
    if (!editFormData.eventImage && !editFormData.eventImageUrl) {
      // Don't require image for updates - it's optional
      // errors.eventImage = 'Event image is required';
    }

    console.log('❌ Validation errors found:', errors);
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEdit = async () => {
    if (editFormData) {
      console.log('🔍 handleSaveEdit called with data:', editFormData);

      if (!validateEditForm()) {
        console.log('❌ Form validation failed');
        return;
      }

      const uploadFlyerFile = async (file: File): Promise<string | null> => {
        const fileExt = file.name.split('.').pop() || 'jpg';
        const fileName = `flyer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${fileExt}`;
        const filePath = `event-images/${fileName}`;
        const { error: uploadError } = await apiClient.storage.from('event-images').upload(filePath, file);
        if (uploadError) {
          console.error('❌ Flyer upload failed:', uploadError);
          showNotification('Flyer upload failed: ' + uploadError.message, 'error');
          return null;
        }
        const { data: urlData } = apiClient.storage.from('event-images').getPublicUrl(filePath);
        return urlData.publicUrl;
      };

      // Walk flyer slots in order: keep remote URLs, upload new files (parallel indices)
      const finalImageUrls: string[] = [];
      for (let i = 0; i < editFormData.eventImageUrls.length; i++) {
        const url = (editFormData.eventImageUrls[i] || '').trim();
        const file = editFormData.eventImages[i];
        if (isRemoteEventImageUrl(url)) {
          finalImageUrls.push(url);
        } else if (file instanceof File) {
          const uploaded = await uploadFlyerFile(file);
          if (uploaded) finalImageUrls.push(uploaded);
        }
      }
      if (finalImageUrls.length === 0 && editFormData.eventImage instanceof File) {
        const uploaded = await uploadFlyerFile(editFormData.eventImage);
        if (uploaded) finalImageUrls.push(uploaded);
      } else if (finalImageUrls.length === 0 && isRemoteEventImageUrl(editFormData.eventImageUrl)) {
        finalImageUrls.push(editFormData.eventImageUrl.trim());
      }

      let layoutImageUrl = editFormData.layoutImageUrl;

      // Upload layout image to Supabase storage if a new layout image is selected
      if (editFormData.layoutImage) {
        try {
          console.log('📤 Uploading new layout image...');
          const fileExt = editFormData.layoutImage.name.split('.').pop();
          const fileName = `layout_${Date.now()}.${fileExt}`;
          const filePath = `event-images/${fileName}`;

          const { data: uploadData, error: uploadError } = await apiClient.storage
            .from('event-images')
            .upload(filePath, editFormData.layoutImage);

          if (uploadError) {
            console.error('❌ Layout image upload failed:', uploadError);
            // Continue without layout image upload for now
            layoutImageUrl = editFormData.layoutImageUrl || '';
            console.log('⚠️ Continuing without new layout image upload');
          } else {
            // Get public URL
            const { data: urlData } = apiClient.storage
              .from('event-images')
              .getPublicUrl(filePath);

            layoutImageUrl = urlData.publicUrl;
            console.log('✅ Layout image uploaded successfully:', layoutImageUrl);
          }
        } catch (error) {
          console.error('❌ Layout image upload error:', error);
          // Continue without layout image upload
          layoutImageUrl = editFormData.layoutImageUrl || '';
          console.log('⚠️ Continuing without new layout image upload due to error');
        }
      } else {
        layoutImageUrl = editFormData.layoutImageUrl || '';
      }

      // Sanitize status to match DB constraint
      const allowedStatuses = ['draft', 'published', 'ongoing', 'completed', 'cancelled'];
      const normalizedStatus = editFormData.status === 'published'
        ? 'published'
        : (allowedStatuses.includes(editFormData.status as any) ? editFormData.status : 'draft');

      const updateData = {
        title: editFormData.title,
        description: editFormData.description,
        event_date: editFormData.eventDate,
        event_end_date: editFormData.eventEndDate,
        event_time: editFormData.eventTime,
        event_end_time: editFormData.eventEndTime,
        venue_id: editFormData.venueId,
        venue_name: editFormData.venueName,
        city: editFormData.city,
        max_capacity: editFormData.maxCapacity,
        plan_type: editFormData.planType,
        status: normalizedStatus,
        attendees: editFormData.attendees,
        total_revenue: editFormData.totalRevenue,
        vendor_ids: selectedVendors,
        exhibitor_ids: selectedExhibitorsForEdit,
        // Image field - store as JSON array for multiple images
        event_image_url: finalImageUrls.length > 0 ? JSON.stringify(finalImageUrls) : '',
        // Layout image field
        layout_image_url: layoutImageUrl,
        // Pricing & Availability
        price_per_hour: editFormData.pricePerHour,
        available_hours: editFormData.availableHours,
        parking_spaces: editFormData.parkingSpaces,
        catering_allowed: editFormData.cateringAllowed,
        alcohol_allowed: editFormData.alcoholAllowed,
        smoking_allowed: editFormData.smokingAllowed,
        selected_facilities: editFormData.selectedFacilities,
        selected_amenities: editFormData.selectedAmenities,
        // Stalls Configuration
        no_of_stalls: editFormData.noOfStalls,
        in_site_stalls: editFormData.allStalls, // Store as JSONB array
        all_stalls: editFormData.allStalls.map(stall => stall.stallNo) // Store stall numbers as string array
      };

      console.log('📤 Updating event data:', updateData);
      
      const { error } = await apiClient
        .from('events')
        .update(updateData)
        .eq('id', editFormData.id);

      if (error) {
        console.error('❌ Update failed:', error);
        showNotification('Failed to update event: ' + error.message, 'error');
        return;
      }

      // Sync event_sponsors: replace all for this event
      const { error: deleteErr } = await apiClient
        .from('event_sponsors')
        .delete()
        .eq('event_id', editFormData.id);
      if (deleteErr) {
        console.error('❌ Event sponsors delete failed:', deleteErr);
        showNotification('Event saved but sponsors could not be updated.', 'error');
      } else if (eventSponsors.length > 0) {
        const { error: insertErr } = await apiClient
          .from('event_sponsors')
          .insert(eventSponsors.map(({ sponsorId, role }) => ({
            event_id: editFormData.id,
            sponsor_id: sponsorId,
            role,
          })));
        if (insertErr) {
          console.error('❌ Event sponsors insert failed:', insertErr);
          showNotification('Event saved but sponsors could not be updated.', 'error');
        }
      }

      console.log('✅ Update successful');
      showNotification('Event updated successfully!', 'success');
      setShowEditModal(false);
      setEditFormData(null);
      setSelectedEvent(null);
      refetch();
    }
  };

  const handleConfirmDelete = async () => {
    if (selectedEvent) {
      console.log('🗑️ Deleting event:', selectedEvent.id);
      
      const { error } = await apiClient
        .from('events')
        .delete()
        .eq('id', selectedEvent.id);

      if (error) {
        console.error('❌ Delete failed:', error);
        showNotification('Failed to delete event: ' + error.message, 'error');
      } else {
        console.log('✅ Delete successful');
        showNotification('Event deleted successfully!', 'success');
        setShowDeleteModal(false);
        setSelectedEvent(null);
        refetch();
      }
    }
  };

  const closeModals = () => {
    setShowViewModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
    setShowFlyerModal(false);
    setFlyerEvent(null);
    setShowDeleteStallModal(false);
    setSelectedEvent(null);
    setEditFormData(null);
    setEditErrors({});
    setEditActiveTab('event');
    setViewActiveTab('event');
    setSelectedExhibitorsForEdit([]);
    setExhibitorSearchTerm('');
    setEventSponsors([]);
    setNewSponsorId('');
    setNewSponsorRole('co_sponsor');
    setViewEventSponsors([]);
    setStallToRemove(null);
    setApproveStallModalReg(null);
    setRegisterExhibitorPickId('');
    setPoVendorModal(null);
    setEventVendorIdsWithPO([]);
    setExhibitorUpdates({});
  };

  // Exhibitor selection handlers for edit modal
  const toggleExhibitorSelectionEdit = (exhibitorId: string) => {
    setSelectedExhibitorsForEdit(prev =>
      prev.includes(exhibitorId)
        ? prev.filter(id => id !== exhibitorId)
        : [...prev, exhibitorId]
    );
  };

  const selectAllExhibitorsEdit = (checked: boolean) => {
    if (checked) {
      setSelectedExhibitorsForEdit(exhibitors.map(e => e.id));
    } else {
      setSelectedExhibitorsForEdit([]);
    }
  };

  // Status update: Interested resets registration+stall; Approved approves reg first (stall separate); stall modal only when approved without stall
  const updateExhibitorStatusEdit = async (exhibitorId: string, newStatus: string) => {
    const reg = editFormData ? eventRegistrations.find((r) => r.exhibitor_id === exhibitorId) : undefined;

    if (newStatus === 'interested' && reg) {
      const updated = await updateRegistrationAndSyncState(
        reg,
        { status: 'interested', stall_no: null },
        'setting registration to interested',
      );
      if (!updated) {
        return;
      }
    }

    if (newStatus === 'approved' && editFormData && reg) {
      const stallsConfigured = getConfiguredStallNumbers().length > 0;
      if (registrationIsInterested(reg) || String(reg.status ?? '').trim().toLowerCase() === 'rejected') {
        const ok = await approveRegistrationOnly(reg);
        if (!ok) return;
        if (!stallsConfigured) await syncExhibitorApprovedStatus(exhibitorId);
        else showNotification('Registration approved. Use Assign stall to pick a stall.', 'success');
        return;
      }
      if (String(reg.status ?? '').trim().toLowerCase() === 'approved' && !reg.stall_no?.trim() && stallsConfigured) {
        const available = getAvailableStallsForNewApproval(reg);
        if (available.length === 0) {
          showNotification('All stalls are already assigned. Change or clear an assignment first.', 'error');
          return;
        }
        setApproveModalStallChoice(available[0] ?? '');
        setApproveStallModalReg(reg);
        return;
      }
    }

    try {
      setExhibitorUpdates((prev) => ({ ...prev, [exhibitorId]: newStatus }));

      const { error } = await apiClient.from('exhibitors').update({ status: newStatus }).eq('id', exhibitorId);

      if (error) {
        console.error('Error updating exhibitor status:', error);
        showNotification('Failed to update status: ' + error.message, 'error');
        setExhibitorUpdates((prev) => ({
          ...prev,
          [exhibitorId]: exhibitors.find((e) => e.id === exhibitorId)?.status || 'pending',
        }));
      } else {
        showNotification('Status updated successfully!', 'success');
        await refetchExhibitors();
      }
    } catch (err) {
      console.error('Error updating exhibitor status:', err);
      showNotification('Error updating status', 'error');
    }
  };

  const handleImageUpload = (file: File) => {
    console.log('📸 handleImageUpload called with file:', file);
    if (!editFormData) {
      console.log('❌ No editFormData available');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.log('❌ Invalid file type:', file.type);
      setEditErrors(prev => ({ ...prev, eventImage: 'Please select a valid image file' }));
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      console.log('❌ File too large:', file.size);
      setEditErrors(prev => ({ ...prev, eventImage: 'Image size must be less than 5MB' }));
      return;
    }

    console.log('✅ File validation passed, updating editFormData');
    const objectUrl = URL.createObjectURL(file);
    console.log('🔗 Created object URL:', objectUrl);

    setEditFormData(prev => {
      const newData = prev ? {
        ...prev,
        eventImage: file,
        eventImageUrl: objectUrl
      } : null;
      console.log('📝 Updated editFormData:', newData);
      return newData;
    });

    // Clear error
    if (editErrors.eventImage) {
      setEditErrors(prev => ({ ...prev, eventImage: '' }));
    }
  };

  const removeImage = () => {
    if (!editFormData) return;

    setEditFormData(prev => prev ? ({
      ...prev,
      eventImage: null,
      eventImageUrl: ''
    }) : null);
  };

  const handleMultipleImageUpload = async (files: File[]) => {
    console.log('📸 handleMultipleImageUpload called with files:', files.length);
    if (!editFormData) {
      console.log('❌ No editFormData available');
      return;
    }

    // Validate number of files (max 10)
    if (files.length > 10) {
      console.log('❌ Too many files:', files.length);
      setEditErrors(prev => ({ ...prev, eventImage: 'Maximum 10 images allowed' }));
      return;
    }

    // Validate each file
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        console.log('❌ Invalid file type:', file.type);
        setEditErrors(prev => ({ ...prev, eventImage: 'Please select valid image files only' }));
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        console.log('❌ File too large:', file.size);
        setEditErrors(prev => ({ ...prev, eventImage: 'Each image must be less than 5MB' }));
        return;
      }
    }

    try {
      console.log('✅ File validation passed, updating editFormData');
      const newImageUrls: string[] = [];
      const newImages: File[] = [];

      for (const file of files) {
        const imageUrl = URL.createObjectURL(file);
        newImageUrls.push(imageUrl);
        newImages.push(file);
      }

      setEditFormData(prev => {
        const newData = prev ? {
          ...prev,
          eventImages: [...prev.eventImages, ...newImages],
          eventImageUrls: [...prev.eventImageUrls, ...newImageUrls]
        } : null;
        console.log('📝 Updated editFormData with multiple images:', newData);
        return newData;
      });

      // Clear error
      if (editErrors.eventImage) {
        setEditErrors(prev => ({ ...prev, eventImage: '' }));
      }
    } catch (error) {
      console.error('❌ Error processing images:', error);
      setEditErrors(prev => ({ ...prev, eventImage: 'Error processing images' }));
    }
  };

  const removeImageAtIndex = (index: number) => {
    if (!editFormData) return;

    setEditFormData(prev => {
      if (!prev) return null;
      
      const newImages = [...prev.eventImages];
      const newImageUrls = [...prev.eventImageUrls];
      
      if (newImageUrls[index]?.startsWith('blob:')) {
        URL.revokeObjectURL(newImageUrls[index]);
      }
      
      newImages.splice(index, 1);
      newImageUrls.splice(index, 1);
      
      const newData = {
        ...prev,
        eventImages: newImages,
        eventImageUrls: newImageUrls
      };
      
      console.log('📝 Updated editFormData after removing image at index:', index, newData);
      return newData;
    });
  };

  const handleLayoutImageUpload = (file: File) => {
    console.log('📸 handleLayoutImageUpload called with file:', file);
    if (!editFormData) {
      console.log('❌ No editFormData available');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.log('❌ Invalid file type:', file.type);
      setEditErrors(prev => ({ ...prev, layoutImage: 'Please select a valid image file' }));
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      console.log('❌ File too large:', file.size);
      setEditErrors(prev => ({ ...prev, layoutImage: 'Image size must be less than 5MB' }));
      return;
    }

    console.log('✅ Layout image validation passed, updating editFormData');
    const objectUrl = URL.createObjectURL(file);
    console.log('🔗 Created object URL:', objectUrl);

    setEditFormData(prev => {
      const newData = prev ? {
        ...prev,
        layoutImage: file,
        layoutImageUrl: objectUrl
      } : null;
      console.log('📝 Updated editFormData with layout image:', newData);
      return newData;
    });

    // Clear error
    if (editErrors.layoutImage) {
      setEditErrors(prev => ({ ...prev, layoutImage: '' }));
    }
  };

  const removeLayoutImage = () => {
    if (!editFormData) return;

    setEditFormData(prev => prev ? ({
      ...prev,
      layoutImage: null,
      layoutImageUrl: ''
    }) : null);
  };

  /** Cards below: interested for this event (interested registration and/or profile interested/pending). */
  const exhibitorIsInterestedForEventView = (exhibitor: Exhibitor): boolean => {
    const eff = (exhibitorUpdates[exhibitor.id] || exhibitor.status || '').toString().toLowerCase();
    const reg = eventRegistrations.find((r) => r.exhibitor_id === exhibitor.id);
    const onEvent = selectedExhibitorsForEdit.includes(exhibitor.id);
    if (reg != null && !registrationIsInterested(reg)) return false;
    return (
      (reg != null && registrationIsInterested(reg)) ||
      (!reg && onEvent && (eff === 'interested' || eff === 'pending'))
    );
  };

  const addExhibitorRegistrationForEvent = async (exhibitorId: string) => {
    if (!editFormData?.id || !exhibitorId) return;
    const ex = exhibitors.find((e) => e.id === exhibitorId);
    if (!ex) return;
    if (eventRegistrations.some((r) => r.exhibitor_id === exhibitorId)) {
      showNotification('This exhibitor is already registered for this event.', 'info');
      setRegisterExhibitorPickId('');
      return;
    }
    const prevSelected = selectedExhibitorsForEdit;
    const needsEventRow = !prevSelected.includes(exhibitorId);
    const newIds = needsEventRow ? [...prevSelected, exhibitorId] : [...prevSelected];

    if (needsEventRow) {
      const { error: evErr } = await apiClient
        .from('events')
        .update({ exhibitor_ids: newIds })
        .eq('id', editFormData.id);
      if (evErr) {
        console.error(evErr);
        showNotification('Could not add exhibitor to event: ' + evErr.message, 'error');
        return;
      }
      setSelectedExhibitorsForEdit(newIds);
      if (selectedEvent?.id === editFormData.id) {
        setSelectedEvent((prev) => (prev ? { ...prev, exhibitors: newIds } : null));
      }
    }

    const { data, error } = await apiClient
      .from('event_registrations')
      .insert({
        event_id: editFormData.id,
        exhibitor_id: exhibitorId,
        status: 'interested',
      })
      .select('id, event_id, exhibitor_id, status, stall_no, created_at')
      .single();

    if (error) {
      if (needsEventRow) {
        await apiClient.from('events').update({ exhibitor_ids: prevSelected }).eq('id', editFormData.id);
        setSelectedExhibitorsForEdit(prevSelected);
        if (selectedEvent?.id === editFormData.id) {
          setSelectedEvent((prev) => (prev ? { ...prev, exhibitors: prevSelected } : null));
        }
      }
      console.error(error);
      showNotification('Could not create registration: ' + error.message, 'error');
      return;
    }

    setEventRegistrations((prev) => processFetchedRegistrations([data as EventRegistrationRow, ...prev]));
    setRegisterExhibitorPickId('');
    showNotification('Exhibitor registered for this event as interested.', 'success');
    void refetch();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Events Management</h1>
          <p className="text-sm sm:text-base text-gray-600">Manage all society events and bookings</p>
        </div>
        <Link to="/events/create">
          <Button className="flex items-center space-x-2 w-full sm:w-auto justify-center">
            <Plus className="h-4 w-4" />
            <span>Create Event</span>
          </Button>
        </Link>
      </div>

      {/* Search and Filter */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search events by title, venue, or city..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            {isSuperAdmin && (
              <select
                value={selectedOrganizerId}
                onChange={(e) => setSelectedOrganizerId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Organizers</option>
                {organizers.map((organizer) => (
                  <option key={organizer.id} value={organizer.id}>
                    {organizer.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div className="flex flex-wrap gap-2">
          {['all', 'draft','published', 'ongoing', 'completed', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium capitalize transition-colors duration-200 ${filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {status === 'all' ? 'All Events' : status}
              <span className="ml-1 sm:ml-2 text-xs">
                {status === 'all'
                  ? organizerScopedEvents.length
                  : organizerScopedEvents.filter((e) => e.status === status).length}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant={viewMode === 'grid' ? 'primary' : 'outline'}
            onClick={() => setViewMode('grid')}
            className="text-xs sm:text-sm"
          >
            Grid
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'table' ? 'primary' : 'outline'}
            onClick={() => setViewMode('table')}
            className="text-xs sm:text-sm"
          >
            Table
          </Button>
        </div>
      </div>

      {/* Events Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {filteredEvents.map((event) => (
            <Card key={event.id} className="hover:shadow-md transition-shadow duration-200">
              <CardContent className="p-4 sm:p-6">
                {/* Event Image */}
                  {(() => {
                   const images = parseEventImages(event.eventImageUrl || '');
                   return images.length > 0 ? (
                     <div className="mb-4">
                       {images.length === 1 ? (
                         <img
                          src={getPrimaryEventImage(event.eventImageUrl)}
                           alt={event.title}
                           className="w-full h-32 object-cover rounded-lg border border-gray-200"
                         />
                       ) : (
                         <div className="grid grid-cols-2 gap-2">
                           {images.slice(0, 4).map((imageUrl, index) => (
                             <img
                               key={index}
                               src={imageUrl}
                               alt={`${event.title} ${index + 1}`}
                               className="w-full h-16 object-cover rounded-lg border border-gray-200"
                             />
                           ))}
                           {images.length > 4 && (
                             <div className="flex items-center justify-center bg-gray-100 rounded-lg border border-gray-200">
                               <span className="text-xs text-gray-600">+{images.length - 4} more</span>
                             </div>
                           )}
                         </div>
                       )}
                     </div>
                   ) : null;
                 })()}

                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 line-clamp-2">{event.title}</h3>
                  <Badge variant={getStatusVariant(event.status)} className="ml-2 flex-shrink-0">
                    {event.status}
                  </Badge>
                </div>

                <p className="text-gray-600 text-sm mb-4 line-clamp-2">{event.description}</p>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm text-gray-600">
                    <CalendarIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">{event.date} at {event.time}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">{event.venue}, {event.city}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Users className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>{event.attendees}/{event.maxCapacity} attendees</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Building2 className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>{getTotalStalls(event)} total stalls</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                  <div className="text-sm">
                    <span className="font-medium text-gray-900">₹{event.totalRevenue.toLocaleString()}</span>
                    <span className="text-gray-500 ml-1 hidden sm:inline">revenue</span>
                  </div>
                  <div className="flex space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => handleView(event)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleOpenFlyerModal(event)} title="Generate flyer">
                      <Sparkles className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(event)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(event)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Events Table View */}
      {viewMode === 'table' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                Events Overview ({filteredEvents.length})
              </h3>
              {/* <Button size="sm" variant="outline">
                <Filter className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Advanced Filter</span>
              </Button> */}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead className="hidden sm:table-cell">Date & Time</TableHead>
                  <TableHead className="hidden md:table-cell">Venue</TableHead>
                  {/* <TableHead>Attendees</TableHead> */}
                  <TableHead>Status</TableHead>
                  {/* <TableHead className="hidden lg:table-cell">Revenue</TableHead> */}
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-gray-900 line-clamp-1">{event.title}</div>
                        <div className="text-sm text-gray-500 sm:hidden">{event.date}</div>
                        <div className="text-sm text-gray-500 md:hidden">{event.city}</div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="text-sm">
                        <div>{event.date}</div>
                        <div className="text-gray-500">{event.time}</div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="text-sm">
                        <div>{event.venue}</div>
                        <div className="text-gray-500">{event.city}</div>
                      </div>
                    </TableCell>
                    {/* <TableCell>
                      <div className="flex items-center">
                        <div className="w-12 sm:w-16 bg-gray-200 rounded-full h-2 mr-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${(event.attendees / event.maxCapacity) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm">{event.attendees}/{event.maxCapacity}</span>
                      </div>
                    </TableCell> */}
                    <TableCell>
                      <Badge variant={getStatusVariant(event.status)}>
                        {event.status}
                      </Badge>
                    </TableCell>
                    {/* <TableCell className="hidden lg:table-cell font-medium">₹{event.totalRevenue.toLocaleString()}</TableCell> */}
                    <TableCell>
                      <div className="flex space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => handleView(event)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleOpenFlyerModal(event)} title="Generate flyer">
                          <Sparkles className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(event)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(event)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* View Event Modal */}
      {showViewModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">{selectedEvent.title}</h2>
                <button onClick={closeModals} className="text-gray-400 hover:text-gray-600">
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Tab Navigation */}
              <div className="mt-4 border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setViewActiveTab('event')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${viewActiveTab === 'event'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                  >
                    <CalendarIcon className="h-4 w-4 inline mr-2" />
                    Event Details
                  </button>
                  {/* <button
                    onClick={() => setViewActiveTab('exhibitor')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${viewActiveTab === 'exhibitor'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                  >
                    <User className="h-4 w-4 inline mr-2" />
                    Exhibitors ({selectedEvent.exhibitors?.length || 0})
                  </button> */}
                </nav>
              </div>
            </div>

            {/* Tab Content */}
            {viewActiveTab === 'event' && (
              <div className="p-6 space-y-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <CalendarIcon className="h-5 w-5 mr-2" />
                    Basic Information
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Event Title</label>
                    <p className="text-gray-900">{selectedEvent.title}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <p className="text-gray-900">{selectedEvent.description || 'No description provided'}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Event Start Date</label>
                      <div className="flex items-center">
                        <CalendarIcon className="h-4 w-4 mr-2 text-blue-500" />
                        <span className="text-gray-900">{selectedEvent.date}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Event End Date</label>
                      <div className="flex items-center">
                        <CalendarIcon className="h-4 w-4 mr-2 text-blue-500" />
                        <span className="text-gray-900">{selectedEvent.eventEndDate || 'Same day'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Event Start Time</label>
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-2 text-blue-500" />
                        <span className="text-gray-900">{selectedEvent.time}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Event End Time</label>
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-2 text-blue-500" />
                        <span className="text-gray-900">{selectedEvent.eventEndTime || 'Not specified'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Venue</label>
                      <div className="flex items-center">
                        <MapPin className="h-4 w-4 mr-2 text-blue-500" />
                        <span className="text-gray-900">{selectedEvent.venue}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                      <p className="text-gray-900">{selectedEvent.city ? selectedEvent.city : 'Not specified'}</p>
                    </div>
                  </div>
                </div>

                {/* Event Configuration */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Users className="h-5 w-5 mr-2" />
                    Event Configuration
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Maximum Capacity</label>
                      <p className="text-gray-900">{selectedEvent.maxCapacity} people</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Event Status</label>
                      <div className="mt-1">
                        <Badge variant={getStatusVariant(selectedEvent.status)} className="text-sm">
                          {selectedEvent.status.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Event Images */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Image className="h-5 w-5 mr-2" />
                    Event Images
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {parseEventImages(selectedEvent.eventImageUrl).length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Event Image</label>
                        <img
                          src={getPrimaryEventImage(selectedEvent.eventImageUrl)}
                          alt="Event"
                          className="w-full h-48 object-cover rounded-lg border border-gray-200"
                        />
                      </div>
                    )}
                    {selectedEvent.layoutImageUrl && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Layout Image</label>
                        <img
                          src={selectedEvent.layoutImageUrl}
                          alt="Layout"
                          className="w-full h-48 object-cover rounded-lg border border-gray-200"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Vendors Selection */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Users className="h-5 w-5 mr-2" />
                    Selected Vendors
                  </h3>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-4">
                    {selectedEvent.vendors && selectedEvent.vendors.length > 0 ? (
                      selectedEvent.vendors.map((vendorId: string, index: number) => (
                        <div key={index} className="text-sm text-gray-900 bg-blue-50 px-3 py-2 rounded border border-blue-200">
                          <span className="font-medium">{getVendorName(vendorId)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full text-center py-4 text-gray-500">
                        No vendors selected
                      </div>
                    )}
                  </div>
                </div>

                {/* Selected Exhibitors Display */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <User className="h-5 w-5 mr-2" />
                    Selected Exhibitors
                  </h3>
                  {loadingViewRegistrations ? (
                    <p className="text-sm text-gray-500">Loading exhibitor registrations…</p>
                  ) : null}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-4">
                    {selectedEvent.exhibitors && selectedEvent.exhibitors.length > 0 ? (
                      selectedEvent.exhibitors.map((exhibitorId: string, index: number) => {
                        const reg = viewEventRegistrations.find((r) => r.exhibitor_id === exhibitorId);
                        const st = String(reg?.status ?? '').toLowerCase();
                        return (
                          <div
                            key={index}
                            className="flex flex-col gap-1 p-3 bg-green-50 border border-green-200 rounded-lg"
                          >
                            <div className="font-medium text-gray-900 text-sm truncate">
                              {getExhibitorName(exhibitorId)}
                            </div>
                            {reg ? (
                              <div className="text-xs text-gray-700 space-y-0.5">
                                <div>
                                  Registration:{' '}
                                  <span className="font-medium capitalize">{st || '—'}</span>
                                </div>
                                {st === 'approved' && reg.stall_no?.trim() ? (
                                  <div>
                                    Stall: <span className="font-semibold text-gray-900">{reg.stall_no.trim()}</span>
                                  </div>
                                ) : st === 'approved' && !reg.stall_no?.trim() ? (
                                  <div className="text-amber-800">Stall not assigned yet</div>
                                ) : null}
                              </div>
                            ) : (
                              <p className="text-xs text-amber-800">No registration row (open Edit to sync)</p>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="col-span-full text-center py-6 bg-gray-50 border border-gray-200 rounded-lg">
                        <User className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-600 mb-2">No exhibitors selected</p>
                        <p className="text-xs text-gray-500">Exhibitors can be assigned when editing the event</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sponsors */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <DollarSign className="h-5 w-5 mr-2" />
                    Sponsors
                  </h3>
                  {loadingViewSponsors ? (
                    <p className="text-sm text-gray-500">Loading sponsors…</p>
                  ) : viewEventSponsors.length === 0 ? (
                    <div className="col-span-full text-center py-6 bg-gray-50 border border-gray-200 rounded-lg">
                      <DollarSign className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">No sponsors assigned to this event</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-4">
                      {viewEventSponsors.map(({ sponsorId, role }) => (
                        <div key={sponsorId} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="font-medium text-gray-900 text-sm">{getSponsorName(sponsorId)}</div>
                          <Badge variant="default" className="text-xs shrink-0">
                            {getSponsorRoleLabel(role)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>


                {/* Stalls Configuration */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Stalls Configuration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Number of Stalls</label>
                      <p className="text-2xl font-bold text-blue-600">
                        {(() => {
                          const plannedStalls = selectedEvent.noOfStalls || 0;
                          const configuredStalls = selectedEvent.allStalls?.length || 0;
                          // If no planned stalls but have configured stalls, use configured count as total
                          return plannedStalls > 0 ? plannedStalls : configuredStalls;
                        })()}
                      </p>
                      <p className="text-xs text-gray-500">Total planned stalls</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Configured Stalls</label>
                      <p className="text-2xl font-bold text-green-600">{selectedEvent.allStalls?.length || 0}</p>
                      <p className="text-xs text-gray-500">Stalls set up</p>
                    </div>
                    {/* <div>
                    <label className="text-sm font-medium text-gray-700">Remaining Stalls</label>
                    <p className="text-2xl font-bold text-orange-600">
                      {(() => {
                        const plannedStalls = selectedEvent.noOfStalls || 0;
                        const configuredStalls = selectedEvent.allStalls?.length || 0;
                        const totalStalls = plannedStalls > 0 ? plannedStalls : configuredStalls;
                        return Math.max(0, totalStalls - configuredStalls);
                      })()}
                    </p>
                    <p className="text-xs text-gray-500">Yet to configure</p>
                  </div> */}
                  </div>


                  {selectedEvent.allStalls && selectedEvent.allStalls.length > 0 ? (
                    <div className="mt-4">
                      <label className="text-sm font-medium text-gray-700 mb-3 block">Stalls Details</label>

                      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                        <div className="divide-y divide-gray-100">
                          {selectedEvent.allStalls.map((stall: any, index: number) => (
                            <div key={index} className="flex items-center justify-between py-2 px-3 hover:bg-gray-50">
                              <div className="flex items-center space-x-4 min-w-0 flex-1">
                                <div className="flex-shrink-0">
                                  <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-800 text-xs font-bold rounded-full">
                                    {stall.stallNo || stall.stall_no || `S${index + 1}`}
                                  </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center space-x-4 text-sm">
                                    <div className="flex-shrink-0">
                                      <span className="text-gray-500">Size:</span>
                                      <span className="ml-1 font-medium text-gray-900">
                                        {stall.stallSize || stall.stall_size || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="flex-shrink-0">
                                      <span className="text-gray-500">Category:</span>
                                      <span className="ml-1 font-medium text-gray-900">
                                        {stall.stallCategory || stall.stall_category || 'N/A'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex-shrink-0">
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    ₹{(stall.price || stall.stall_price || 0)?.toLocaleString?.() || stall.price || stall.stall_price || '0'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : selectedEvent.inSiteStalls && selectedEvent.inSiteStalls.length > 0 ? (
                    <div className="mt-4">
                      <label className="text-sm font-medium text-gray-700 mb-3 block">Stalls Details (from inSiteStalls)</label>
                      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                        <div className="divide-y divide-gray-100">
                          {selectedEvent.inSiteStalls.map((stall: any, index: number) => (
                            <div key={index} className="flex items-center justify-between py-2 px-3 hover:bg-gray-50">
                              <div className="flex items-center space-x-4 min-w-0 flex-1">
                                <div className="flex-shrink-0">
                                  <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-800 text-xs font-bold rounded-full">
                                    {stall.stallNo || stall.stall_no || `S${index + 1}`}
                                  </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center space-x-4 text-sm">
                                    <div className="flex-shrink-0">
                                      <span className="text-gray-500">Size:</span>
                                      <span className="ml-1 font-medium text-gray-900">
                                        {stall.stallSize || stall.stall_size || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="flex-shrink-0">
                                      <span className="text-gray-500">Category:</span>
                                      <span className="ml-1 font-medium text-gray-900">
                                        {stall.stallCategory || stall.stall_category || 'N/A'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex-shrink-0">
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    ₹{(stall.price || stall.stall_price || 0)?.toLocaleString?.() || stall.price || stall.stall_price || '0'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600">No stalls configured for this event.</p>
                    </div>
                  )}
                </div>

                {/* Vendors & Exhibitors */}
                {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {selectedEvent.vendors && selectedEvent.vendors.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Vendors</h3>
                      <div className="space-y-2">
                        {selectedEvent.vendors.map((vendorId: string, index: number) => (
                          <div key={index} className="text-sm text-gray-900 bg-blue-50 px-3 py-2 rounded border border-blue-200">
                            <span className="font-medium">{getVendorName(vendorId)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedEvent.exhibitors && selectedEvent.exhibitors.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Exhibitors</h3>
                      <div className="space-y-2">
                        {selectedEvent.exhibitors.map((exhibitorId: string, index: number) => (
                          <div key={index} className="text-sm text-gray-900 bg-green-50 px-3 py-2 rounded border border-green-200">
                            <span className="font-medium">{getExhibitorName(exhibitorId)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div> */}
              </div>
            )}

          </div>

          {/* Exhibitor Tab */}
          {/* {viewActiveTab === 'exhibitor' && (
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Navigation Header 
              <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Event Exhibitors</h3>
                  <p className="text-sm text-gray-600">
                    View all exhibitors for this event. Currently {exhibitors.filter(exhibitor => selectedEvent.exhibitors?.includes(exhibitor.id)).length} exhibitor(s) assigned.
                  </p>
                </div>
              </div>

              {/* Search Bar 
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search exhibitors by company, name, email, or phone..."
                  value={exhibitorSearchTerm}
                  onChange={(e) => setExhibitorSearchTerm(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
                {exhibitorSearchTerm && (
                  <button
                    onClick={() => setExhibitorSearchTerm('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>

              {/* Selection Summary
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-blue-700">
                    <strong>{exhibitors.filter(exhibitor => selectedEvent.exhibitors?.includes(exhibitor.id)).length}</strong> exhibitor(s) assigned to this event
                  </p>
                  {exhibitorSearchTerm && (
                    <p className="text-xs text-gray-600">
                      Showing {exhibitors.filter((exhibitor) => {
                        if (!selectedEvent.exhibitors?.includes(exhibitor.id)) return false;
                        if (!exhibitorSearchTerm) return true;
                        const searchLower = exhibitorSearchTerm.toLowerCase();
                        return (
                          (exhibitor.companyName || '').toLowerCase().includes(searchLower) ||
                          (exhibitor.firstName || '').toLowerCase().includes(searchLower) ||
                          (exhibitor.lastName || '').toLowerCase().includes(searchLower) ||
                          (exhibitor.email || '').toLowerCase().includes(searchLower) ||
                          (exhibitor.phone || '').toLowerCase().includes(searchLower) ||
                          (exhibitor.category || '').toLowerCase().includes(searchLower)
                        );
                      }).length} of {exhibitors.filter(exhibitor => selectedEvent.exhibitors?.includes(exhibitor.id)).length} assigned exhibitors
                  </p>
                  )}
                </div>
              </div>

              {/* Exhibitors Table 
              <div className="overflow-x-auto">
                {!exhibitors || exhibitors.length === 0 ? (
                  <div className="text-center py-8">
                    <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No exhibitors found</p>
                    <p className="text-sm text-gray-500">Add exhibitors to see them here</p>
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Company
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Contact Person
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Phone
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Category
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Payment Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {exhibitors
                        .filter((exhibitor) => {
                          if (!selectedEvent.exhibitors?.includes(exhibitor.id)) return false;
                          if (!exhibitorSearchTerm) return true;
                          const searchLower = exhibitorSearchTerm.toLowerCase();
                          return (
                            (exhibitor.companyName || '').toLowerCase().includes(searchLower) ||
                            (exhibitor.firstName || '').toLowerCase().includes(searchLower) ||
                            (exhibitor.lastName || '').toLowerCase().includes(searchLower) ||
                            (exhibitor.email || '').toLowerCase().includes(searchLower) ||
                            (exhibitor.phone || '').toLowerCase().includes(searchLower) ||
                            (exhibitor.category || '').toLowerCase().includes(searchLower)
                          );
                        })
                        .map((exhibitor) => (
                          <tr key={exhibitor.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-medium text-gray-900">
                                {exhibitor.companyName || 'N/A'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-gray-900">
                                {`${exhibitor.firstName || ''} ${exhibitor.lastName || ''}`.trim() || 'N/A'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-gray-900">{exhibitor.email || 'N/A'}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-gray-900">{exhibitor.phone || 'N/A'}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-gray-900">{exhibitor.category || 'N/A'}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant={exhibitor.status === 'confirmed' || exhibitor.status === 'checked_in' ? 'success' : 'default'}>
                                {exhibitor.status === 'confirmed' || exhibitor.status === 'checked_in' ? 'Confirmed' : 'Pending'}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-gray-900">
                                {exhibitor.paymentStatus === 'pending' ? 'Pending' :
                                  exhibitor.paymentStatus === 'paid' ? 'Paid' :
                                    exhibitor.paymentStatus === 'refunded' ? 'Refunded' : 'Pending'}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )} */}

          {/* <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
            <Button variant="outline" onClick={closeModals}>Close</Button>
            <Button onClick={() => { closeModals(); handleEdit(selectedEvent); }}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Event
            </Button>
          </div> */}
        </div>
      )}

      <EventFlyerGeneratorModal
        isOpen={showFlyerModal}
        event={flyerEvent}
        onSaved={async () => {
          await refetch();
        }}
        onClose={() => {
          setShowFlyerModal(false);
          setFlyerEvent(null);
        }}
      />

      {/* Edit Event Modal */}
      {showEditModal && editFormData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">Edit Event</h2>
                <button onClick={closeModals} className="text-gray-400 hover:text-gray-600">
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Tab Navigation */}
              <div className="mt-4 border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setEditActiveTab('event')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${editActiveTab === 'event'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                  >
                    <CalendarIcon className="h-4 w-4 inline mr-2" />
                    Event
                  </button>
                  <button
                    onClick={() => setEditActiveTab('exhibitor')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${editActiveTab === 'exhibitor'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                  >
                    <User className="h-4 w-4 inline mr-2" />
                    Exhibitor
                  </button>
                  <button
                    onClick={() => setEditActiveTab('sponsor')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${editActiveTab === 'sponsor'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                  >
                    <DollarSign className="h-4 w-4 inline mr-2" />
                    Sponsor
                  </button>
                </nav>
              </div>
            </div>

            {/* Tab Content */}
            {editActiveTab === 'event' && (
              <div className="p-6 space-y-6 overflow-y-auto"> {/* max-h-[70vh] */}
                {/* Selection Summary */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Users className="h-5 w-5 mr-2" />
                    Event Summary
                  </h3>

                  {/* <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-blue-900">Selected Vendors</p>
                        <p className="text-2xl font-bold text-blue-600">{selectedVendors.length}</p>
                      </div>
                      <Users className="h-8 w-8 text-blue-400" />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditActiveTab('exhibitor')}
                      className="mt-2 w-full text-xs"
                    >
                      Manage Vendors
                    </Button>
                  </div>
                  
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-green-900">Selected Exhibitors</p>
                        <p className="text-2xl font-bold text-green-600">{selectedExhibitorsForEdit.length}</p>
                      </div>
                      <User className="h-8 w-8 text-green-400" />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditActiveTab('exhibitor')}
                      className="mt-2 w-full text-xs"
                    >
                      Manage Exhibitors
                    </Button>
                  </div>
                  
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-purple-900">Configured Stalls</p>
                        <p className="text-2xl font-bold text-purple-600">{editFormData.allStalls.length}</p>
                      </div>
                      <Building2 className="h-8 w-8 text-purple-400" />
                    </div>
                    <p className="text-xs text-purple-600 mt-1">
                      {editFormData.noOfStalls || editFormData.allStalls.length} total planned
                    </p>
                  </div>
                </div> */}
                </div>

                {/* Exhibitor registrations */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <User className="h-5 w-5 mr-2" />
                    Exhibitor registrations
                  </h3>
                  {loadingRegistrations ? (
                    <p className="text-sm text-gray-500">Loading registrations...</p>
                  ) : eventRegistrations.length === 0 ? (
                    <p className="text-sm text-gray-500">No exhibitor registrations for this event.</p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Exhibitor</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Stall</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {eventRegistrations.map((reg) => (
                            <TableRow key={reg.id}>
                              <TableCell className="font-medium">
                                {reg.exhibitor_id ? getExhibitorName(reg.exhibitor_id) : reg.name || '—'}
                              </TableCell>
                              <TableCell>{reg.email || (reg.exhibitor_id ? exhibitors.find(e => e.id === reg.exhibitor_id)?.email : null) || '—'}</TableCell>
                              <TableCell>
                                {reg.status === 'approved' && reg.stall_no?.trim() ? (
                                  <span className="text-sm font-medium text-gray-900">{reg.stall_no.trim()}</span>
                                ) : (
                                  <span className="text-sm text-gray-500">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    reg.status === 'approved' ? 'success' : reg.status === 'rejected' ? 'error' : 'warning'
                                  }
                                  className="capitalize"
                                >
                                  {registrationStatusBadgeLabel(reg)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-2">
                                  {registrationIsInterested(reg) && (
                                    <div className="flex flex-wrap gap-2">
                                      <Button size="sm" onClick={() => startApproveRegistration(reg)}>
                                        Approve
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => handleRejectRegistration(reg)}>
                                        Reject
                                      </Button>
                                    </div>
                                  )}
                                  {reg.status === 'approved' && getConfiguredStallNumbers().length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {reg.stall_no?.trim() ? (
                                        <Button size="sm" variant="outline" onClick={() => startChangeStallModal(reg)}>
                                          Change stall
                                        </Button>
                                      ) : (
                                        <Button size="sm" onClick={() => startAssignStallModal(reg)}>
                                          Assign stall
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                  {reg.exhibitor_id && (
                                    <button
                                      type="button"
                                      className="text-left text-xs text-red-600 hover:underline"
                                      onClick={() => void removeExhibitorRegistrationFromEvent(reg)}
                                    >
                                      Remove from event
                                    </button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Basic Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <CalendarIcon className="h-5 w-5 mr-2" />
                    Basic Information
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Event Title *</label>
                    <input
                      type="text"
                      value={editFormData.title}
                      onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.title ? 'border-red-300' : 'border-gray-300'
                        }`}
                    />
                    {editErrors.title && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertTriangle className="h-4 w-4 mr-1" />
                        {editErrors.title}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                    <textarea
                      value={editFormData.description || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                      rows={3}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.description ? 'border-red-300' : 'border-gray-300'
                        }`}
                    />
                    {editErrors.description && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertTriangle className="h-4 w-4 mr-1" />
                        {editErrors.description}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Event Start Date *</label>
                      <input
                        type="date"
                        value={editFormData.eventDate}
                        onChange={(e) => setEditFormData({ ...editFormData, eventDate: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.eventDate ? 'border-red-300' : 'border-gray-300'
                          }`}
                      />
                      {editErrors.eventDate && (
                        <p className="mt-1 text-sm text-red-600 flex items-center">
                          <AlertTriangle className="h-4 w-4 mr-1" />
                          {editErrors.eventDate}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Event End Date *</label>
                      <input
                        type="date"
                        value={editFormData.eventEndDate}
                        onChange={(e) => setEditFormData({ ...editFormData, eventEndDate: e.target.value })}
                        min={editFormData.eventDate || new Date().toISOString().split('T')[0]}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.eventEndDate ? 'border-red-300' : 'border-gray-300'
                          }`}
                      />
                      {editErrors.eventEndDate && (
                        <p className="mt-1 text-sm text-red-600 flex items-center">
                          <AlertTriangle className="h-4 w-4 mr-1" />
                          {editErrors.eventEndDate}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Event Start Time *</label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          type="time"
                          value={editFormData.eventTime}
                          onChange={(e) => setEditFormData({ ...editFormData, eventTime: e.target.value })}
                          className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.eventTime ? 'border-red-300' : 'border-gray-300'
                            }`}
                        />
                      </div>
                      {editErrors.eventTime && (
                        <p className="mt-1 text-sm text-red-600 flex items-center">
                          <AlertTriangle className="h-4 w-4 mr-1" />
                          {editErrors.eventTime}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Event End Time *</label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          type="time"
                          value={editFormData.eventEndTime}
                          onChange={(e) => setEditFormData({ ...editFormData, eventEndTime: e.target.value })}
                          className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.eventEndTime ? 'border-red-300' : 'border-gray-300'
                            }`}
                        />
                      </div>
                      {editErrors.eventEndTime && (
                        <p className="mt-1 text-sm text-red-600 flex items-center">
                          <AlertTriangle className="h-4 w-4 mr-1" />
                          {editErrors.eventEndTime}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Venue *</label>
                      <select
                        value={editFormData.venueId}
                        onChange={(e) => {
                          const selectedVenue = editVenueOptions.find(v => v.id === e.target.value);
                          setEditFormData({
                            ...editFormData,
                            venueId: e.target.value,
                            venueName: selectedVenue?.name || '',
                            city: selectedVenue?.city?selectedVenue.city:selectedVenue?.location?.split(',').pop()?.trim() || ''
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select a venue</option>
                        {editVenueOptions.map((venue) => (
                          <option key={venue.id} value={venue.id}>
                            {venue.name} - {venue.location ? venue.location : venue.city?venue.city:''}
                          </option>
                        ))}
                      </select>
                    </div>

                  </div>

                  {/* Event Configuration */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <Users className="h-5 w-5 mr-2" />
                      Event Configuration
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Maximum Capacity</label>
                        <input
                          type="number"
                          value={editFormData.maxCapacity}
                          onChange={(e) => setEditFormData({ ...editFormData, maxCapacity: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Maximum attendees"
                          min="10"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Event Status</label>
                        <select
                          value={editFormData.status}
                          onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as any })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="draft">Draft</option>
                          <option value="published">Published</option>
                          <option value="ongoing">Ongoing</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>

                      {/* <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Plan Type</label>
                      <select
                        value={editFormData.planType}
                        onChange={(e) => setEditFormData({...editFormData, planType: e.target.value as any})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="Plan A">Plan A</option>
                        <option value="Plan B">Plan B</option>
                        <option value="Plan C">Plan C</option>
                        <option value="Custom">Custom</option>
                      </select>
                    </div> */}

                      {/* <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Attendees</label>
                      <input
                        type="number"
                        value={editFormData.attendees}
                        onChange={(e) => setEditFormData({...editFormData, attendees: parseInt(e.target.value) || 0})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Number of attendees"
                      />
                    </div> */}

                      {/* <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Total Revenue</label>
                      <input
                        type="number"
                        value={editFormData.totalRevenue}
                        onChange={(e) => setEditFormData({...editFormData, totalRevenue: parseFloat(e.target.value) || 0})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Total revenue"
                      />
                    </div> */}
                    </div>
                  </div>
                </div>

                {/* Pricing & Availability */}
                {/* <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <IndianRupee className="h-5 w-5 mr-2" />
                  Pricing & Availability
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Price Per Hour</label>
                    <div className="relative">
                      <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="number"
                        value={editFormData.pricePerHour}
                        onChange={(e) => setEditFormData({...editFormData, pricePerHour: Number(e.target.value)})}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter price per hour"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Available Hours</label>
                    <input
                      type="text"
                      value={editFormData.availableHours}
                      onChange={(e) => setEditFormData({...editFormData, availableHours: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., 9:00 AM - 11:00 PM"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Parking Spaces</label>
                    <input
                      type="number"
                      value={editFormData.parkingSpaces}
                      onChange={(e) => setEditFormData({...editFormData, parkingSpaces: Number(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Number of parking spaces"
                      min="0"
                    />
                  </div>
                </div>

                <div className="hidden">
                  <label className="text-sm font-medium text-gray-700 mb-3 block">Event Policies</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={editFormData.cateringAllowed}
                        onChange={(e) => setEditFormData({...editFormData, cateringAllowed: e.target.checked})}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Catering Allowed</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={editFormData.alcoholAllowed}
                        onChange={(e) => setEditFormData({...editFormData, alcoholAllowed: e.target.checked})}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Alcohol Allowed</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={editFormData.smokingAllowed}
                        onChange={(e) => setEditFormData({...editFormData, smokingAllowed: e.target.checked})}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Smoking Allowed</span>
                    </label>
                  </div>
                </div>
              </div> */}

                {/* Event Image */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Image className="h-5 w-5 mr-2" />
                    Event Flyers
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Event Flyers</label>
                    <div className="space-y-4">
                      {/* Multiple Image Upload */}
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length > 0) handleMultipleImageUpload(files);
                          }}
                          className="hidden"
                          id="edit-event-images-upload"
                        />
                        <label
                          htmlFor="edit-event-images-upload"
                          className="cursor-pointer flex flex-col items-center space-y-2"
                        >
                          <Upload className="h-8 w-8 text-gray-400" />
                          <div>
                            <p className="text-sm font-medium text-gray-700">
                              Click to upload event flyers
                            </p>
                            <p className="text-xs text-gray-500">
                              PNG, JPG, GIF up to 5MB each (Max 10 images)
                            </p>
                          </div>
                        </label>
                      </div>

                      {/* Display Uploaded Images */}
                      {editFormData.eventImageUrls.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {editFormData.eventImageUrls.map((imageUrl, index) => (
                            <div key={index} className="relative group">
                              <img
                                src={imageUrl}
                                alt={`Event flyer ${index + 1}`}
                                className="w-full h-32 object-cover rounded-lg border border-gray-300"
                              />
                              <button
                                type="button"
                                onClick={() => removeImageAtIndex(index)}
                                className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Legacy Single Image Support */}
                      {editFormData.eventImageUrl && editFormData.eventImageUrls.length === 0 && (
                        <div className="relative">
                          <img
                            src={editFormData.eventImageUrl}
                            alt="Event preview"
                            className="w-full h-48 object-cover rounded-lg border border-gray-300"
                          />
                          <button
                            type="button"
                            onClick={removeImage}
                            className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    {editErrors.eventImage && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertTriangle className="h-4 w-4 mr-1" />
                        {editErrors.eventImage}
                      </p>
                    )}
                  </div>
                </div>

                {/* Layout Image */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Image className="h-5 w-5 mr-2" />
                    Upload Layout
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Stall Layout Image</label>
                    <div className="space-y-4">
                      {editFormData.layoutImageUrl ? (
                        <div className="relative">
                          <img
                            src={editFormData.layoutImageUrl}
                            alt="Layout preview"
                            className="w-full h-64 object-contain rounded-lg border border-gray-300 bg-gray-50"
                          />
                          <button
                            type="button"
                            onClick={removeLayoutImage}
                            className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <div className="mt-2 text-sm text-gray-600">
                            Layout image: {editFormData.layoutImage?.name || 'Current layout image'}
                          </div>
                        </div>
                      ) : (
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleLayoutImageUpload(file);
                            }}
                            className="hidden"
                            id="edit-layout-image-upload"
                          />
                          <label
                            htmlFor="edit-layout-image-upload"
                            className="cursor-pointer flex flex-col items-center space-y-2"
                          >
                            <Upload className="h-8 w-8 text-gray-400" />
                            <div>
                              <p className="text-sm font-medium text-gray-700">
                                Click to upload layout image
                              </p>
                              <p className="text-xs text-gray-500">
                                PNG, JPG, GIF up to 5MB
                              </p>
                            </div>
                          </label>
                        </div>
                      )}
                      {editErrors.layoutImage && (
                        <p className="mt-1 text-sm text-red-600 flex items-center">
                          <AlertTriangle className="h-4 w-4 mr-1" />
                          {editErrors.layoutImage}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Upload an image showing the stall layout structure for this event. This helps exhibitors understand the venue arrangement.
                    </p>
                  </div>
                </div>

                {/* Vendors Selection */}
                <div className="space-y-4 border-2 border-blue-200 bg-blue-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Users className="h-5 w-5 mr-2" />
                    Select Vendors ({activeVendors.length} active
                    {editVendorOptions.length > activeVendors.length
                      ? `, ${editVendorOptions.length - activeVendors.length} inactive on event`
                      : ''}
                    )
                  </h3>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-white">
                    {editVendorOptions.length === 0 ? (
                      <div className="text-sm text-gray-500 col-span-full">No active vendors available</div>
                    ) : editVendorOptions.map(vendor => (
                      <label key={vendor.id} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                        <input
                          type="checkbox"
                          checked={selectedVendors.includes(vendor.id)}
                          onChange={() => toggleVendor(vendor.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 truncate">
                          {vendor.name}
                          {(vendor.status || '').toString().toLowerCase() !== 'active' && (
                            <span className="text-xs text-amber-600 ml-1">(inactive)</span>
                          )}
                          {selectedVendors.includes(vendor.id) && (
                            <span className="text-xs text-green-600 ml-1">✓</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500">
                    Selected: {selectedVendors.length} vendor(s)
                  </p>
                  <p className="text-xs text-gray-600">
                    Select vendors to associate with this event
                  </p>
                  {selectedVendors.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-blue-200/80 pt-3">
                      <p className="text-sm font-medium text-gray-800">Purchase orders (selected vendors)</p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {selectedVendors.map((vendorId) => (
                          <div
                            key={vendorId}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white border border-gray-200 px-3 py-2"
                          >
                            <span className="text-sm text-gray-800 truncate min-w-0 flex-1">{getVendorName(vendorId)}</span>
                            <div className="flex shrink-0 gap-2">
                              {eventVendorIdsWithPO.includes(vendorId) && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setPoVendorModal({ vendorId, mode: 'list' })}
                                >
                                  <FileText className="h-3.5 w-3.5 mr-1" />
                                  View POs
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setPoVendorModal({ vendorId, mode: 'create' })}
                              >
                                Create PO
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Selected Exhibitors Display */}
                {/* <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <User className="h-5 w-5 mr-2" />
                    Exhibitors
                  </h3>

                  {selectedExhibitorsForEdit.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600">
                          {selectedExhibitorsForEdit.length} exhibitor(s) selected for this event
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditActiveTab('exhibitor')}
                          className="text-xs"
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Manage Exhibitors
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-4">
                        {exhibitors
                          .filter(exhibitor => selectedExhibitorsForEdit.includes(exhibitor.id))
                          .map(exhibitor => (
                            <div key={exhibitor.id} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900 text-sm truncate">
                                  {exhibitor.companyName || `${exhibitor.firstName} ${exhibitor.lastName}`}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">
                                  {exhibitor.category || 'N/A'} • {exhibitor.status || 'pending'}
                                </div>
                              </div>
                              <Badge variant="success" className="text-xs">
                                <CheckCircle className="h-4 w-4" />
                              </Badge>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-gray-50 border border-gray-200 rounded-lg">
                      <User className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600 mb-2">No exhibitors selected</p>
                      <p className="text-xs text-gray-500 mb-3">Go to the Exhibitor tab to select exhibitors for this event</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditActiveTab('exhibitor')}
                      >
                        <User className="h-4 w-4 mr-1" />
                        Select Exhibitors
                      </Button>
                    </div>
                  )}
                </div> */}

                {/* Exhibitors Selection */}
                {/* <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Building2 className="h-5 w-5 mr-2" />
                  Select Exhibitors
                </h3>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-4">
                  {exhibitors.map(exhibitor => (
                    <label key={exhibitor.id} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={selectedExhibitors.includes(exhibitor.id)}
                        onChange={() => toggleExhibitor(exhibitor.id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 truncate">{exhibitor.companyName}</span>
                    </label>
                  ))}
                </div> 
                <p className="text-sm text-gray-500">
                  Selected: {selectedExhibitors.length} exhibitor(s)
                </p>
              </div>*/}

                {/* Stalls Configuration */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Building2 className="h-5 w-5 mr-2" />
                    Stalls Configuration
                  </h3>
                  
                  {/* Mismatch Warning Banner */}
                  {editFormData.allStalls.length > 0 && (editFormData.noOfStalls || editFormData.allStalls.length) !== editFormData.allStalls.length && (
                    <div className="p-4 bg-red-100 border-l-4 border-red-500 rounded-r-lg">
                      <div className="flex items-start">
                        <AlertCircle className="h-5 w-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-red-800 mb-1">
                            Stall Count Mismatch Detected
                          </h4>
                          <div className="text-sm text-red-700 mb-2">
                            <strong>Configured:</strong> {editFormData.allStalls.length} stalls | 
                            <strong> Planned:</strong> {editFormData.noOfStalls || editFormData.allStalls.length} stalls
                          </div>
                          <div className="text-sm text-red-600">
                            {editFormData.allStalls.length > (editFormData.noOfStalls || editFormData.allStalls.length) 
                              ? `⚠️ You have ${editFormData.allStalls.length - (editFormData.noOfStalls || editFormData.allStalls.length)} excess stall(s). Please remove them manually using the delete buttons below, then reduce the planned count.`
                              : `⚠️ You need ${(editFormData.noOfStalls || editFormData.allStalls.length) - editFormData.allStalls.length} more stall(s). Please add them or reduce the planned count.`
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Number of Stalls</label>
                    <input
                      type="number"
                      value={editFormData.noOfStalls || editFormData.allStalls.length}
                      onChange={(e) => handleStallCountChange(parseInt(e.target.value) || 0)}
                      className={`w-1/2 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        editErrors.noOfStalls ? 'border-red-300' : 'border-gray-300'
                      }`}
                      min="1"
                      max="100"
                    />
                    {editErrors.noOfStalls && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertTriangle className="h-4 w-4 mr-1" />
                        {editErrors.noOfStalls}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-gray-500">
                        Configured stalls: {editFormData.allStalls.length} / {editFormData.noOfStalls || editFormData.allStalls.length}
                      </p>
                      <p className="text-xs text-gray-400">
                        Min: 1 | Max: 100
                      </p>
                    </div>
                    
                    {/* Validation warning */}
                    {editFormData.allStalls.length > 0 && (editFormData.noOfStalls || editFormData.allStalls.length) !== editFormData.allStalls.length && (
                      <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg mt-2">
                        <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-red-800 mb-1">
                            ⚠️ Stall Count Mismatch
                          </div>
                          <div className="text-sm text-red-700">
                            <strong>Configured Stalls:</strong> {editFormData.allStalls.length} | 
                            <strong> Planned Stalls:</strong> {editFormData.noOfStalls || editFormData.allStalls.length}
                          </div>
                          <div className="text-xs text-red-600 mt-1">
                            {editFormData.allStalls.length > (editFormData.noOfStalls || editFormData.allStalls.length) 
                              ? `You have ${editFormData.allStalls.length - (editFormData.noOfStalls || editFormData.allStalls.length)} excess stall(s). Please remove them manually using the delete buttons below.`
                              : `You need ${(editFormData.noOfStalls || editFormData.allStalls.length) - editFormData.allStalls.length} more stall(s). Add them or reduce the limit.`
                            }
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {/* Stall Status Summary */}
                    <div className={`p-3 border rounded-lg ${
                      editFormData.allStalls.length > 0 && (editFormData.noOfStalls || editFormData.allStalls.length) !== editFormData.allStalls.length
                        ? 'bg-red-50 border-red-200' 
                        : 'bg-blue-50 border-blue-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className={`text-sm font-semibold ${
                            editFormData.allStalls.length > 0 && (editFormData.noOfStalls || editFormData.allStalls.length) !== editFormData.allStalls.length
                              ? 'text-red-900'
                              : 'text-blue-900'
                          }`}>
                            Stalls Status
                          </h4>
                          <div className={`text-xs mt-1 ${
                            editFormData.allStalls.length > 0 && (editFormData.noOfStalls || editFormData.allStalls.length) !== editFormData.allStalls.length
                              ? 'text-red-700'
                              : 'text-blue-700'
                          }`}>
                            <span className="font-medium">{editFormData.allStalls.length}</span> configured / 
                            <span className="font-medium"> {editFormData.noOfStalls || editFormData.allStalls.length}</span> planned
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs">
                            {editFormData.allStalls.length === 0 ? (
                              <span className="text-orange-600">⚠️ No stalls configured</span>
                            ) : editFormData.allStalls.length === (editFormData.noOfStalls || editFormData.allStalls.length) ? (
                              <span className="text-green-600">✅ All stalls configured</span>
                            ) : editFormData.allStalls.length > (editFormData.noOfStalls || editFormData.allStalls.length) ? (
                              <span className="text-red-600">❌ {editFormData.allStalls.length - (editFormData.noOfStalls || editFormData.allStalls.length)} excess stalls</span>
                            ) : (
                              <span className="text-blue-600">📝 {((editFormData.noOfStalls || editFormData.allStalls.length) - editFormData.allStalls.length)} more needed</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-800">
                        Configure Stalls
                      </h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex items-center space-x-2"
                        onClick={addStall}
                        disabled={(editFormData.noOfStalls || editFormData.allStalls.length) > 0 && editFormData.allStalls.length >= (editFormData.noOfStalls || editFormData.allStalls.length)}
                      >
                        <span>+ Add Stall</span>
                      </Button>
                    </div>

                    <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 space-y-3">
                      <h4 className="text-sm font-semibold text-blue-900">Bulk Add Stalls</h4>
                      <p className="text-xs text-blue-800">
                        Enter one setup and quantity. Stalls are auto-created like A1, A2, A3...
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                        <div className="md:col-span-2">
                          <label className="block text-xs text-gray-700 mb-1">Size</label>
                          <select
                            value={bulkStallSize}
                            onChange={(e) => setBulkStallSize(e.target.value)}
                            className="w-full px-3 py-2 border rounded"
                          >
                            <option value="">Select</option>
                            <option value="Small (6x6 ft)">Small (6x6 ft)</option>
                            <option value="Medium (8x8 ft)">Medium (8x8 ft)</option>
                            <option value="Large (10x10 ft)">Large (10x10 ft)</option>
                            <option value="Extra Large (12x12 ft)">Extra Large (12x12 ft)</option>
                            <option value="Custom">Custom</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700 mb-1">Price (₹)</label>
                          <input
                            type="number"
                            min={0}
                            value={bulkStallPrice}
                            onChange={(e) => setBulkStallPrice(Number(e.target.value) || 0)}
                            className="w-full px-3 py-2 border rounded"
                            placeholder="2000"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700 mb-1">Quantity</label>
                          <input
                            type="number"
                            min={1}
                            value={bulkStallQty}
                            onChange={(e) => setBulkStallQty(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full px-3 py-2 border rounded"
                            placeholder="10"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700 mb-1">Prefix</label>
                          <input
                            type="text"
                            value={bulkStallPrefix}
                            onChange={(e) => setBulkStallPrefix(e.target.value.toUpperCase())}
                            className="w-full px-3 py-2 border rounded"
                            placeholder="A"
                          />
                        </div>
                        <div>
                          <Button type="button" className="w-full" onClick={addBulkStalls}>
                            Add Bulk
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-700 mb-1">Category (optional)</label>
                        <select
                          value={bulkStallCategory}
                          onChange={(e) => setBulkStallCategory(e.target.value)}
                          className="w-full md:w-80 px-3 py-2 border rounded"
                        >
                          <option value="">None</option>
                          <option value="Food & Beverage">Food & Beverage</option>
                          <option value="Arts & Crafts">Arts & Crafts</option>
                          <option value="Technology">Technology</option>
                          <option value="Fashion & Accessories">Fashion & Accessories</option>
                          <option value="Health & Wellness">Health & Wellness</option>
                          <option value="Education">Education</option>
                          <option value="Entertainment">Entertainment</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>

                    {(editFormData.noOfStalls || editFormData.allStalls.length) > 0 && editFormData.allStalls.length >= (editFormData.noOfStalls || editFormData.allStalls.length) && (
                      <div className="flex items-center p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-yellow-600 mr-2" />
                        <span className="text-sm text-yellow-700">
                          Maximum stalls limit reached ({editFormData.allStalls.length}/{editFormData.noOfStalls || editFormData.allStalls.length})
                        </span>
                      </div>
                    )}

                    <div className="space-y-3">
                      {editFormData.allStalls.map((row, idx) => (
                        <div key={row.id} className="border border-gray-200 rounded-md p-3">
                          <div className="flex items-center mb-3">
                            <Badge variant="default" className="mr-2">#{idx + 1}</Badge>
                            <span className="text-xs text-gray-500">Stall</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-5 gap-y-3 gap-x-0 items-end space-x-2">
                            {/* Stall No */}
                            <div>
                              <label htmlFor={`stall-stallNo-${row.id}`} className="block text-xs text-gray-600 mb-1">Stall No.</label>
                              <input
                                id={`stall-stallNo-${row.id}`}
                                type="text"
                                value={row.stallNo}
                                onChange={(e) => updateStall(idx, 'stallNo', e.target.value)}
                                placeholder="e.g., A1"
                                className="w-full px-3 py-2 border rounded"
                              />
                            </div>

                            {/* Stall Size */}
                            <div>
                              <label htmlFor={`stall-stallSize-${row.id}`} className="block text-xs text-gray-600 mb-1">Size</label>
                              <select
                                id={`stall-stallSize-${row.id}`}
                                value={row.stallSize}
                                onChange={(e) => updateStall(idx, 'stallSize', e.target.value)}
                                className="w-full px-3 py-2 border rounded max-w-60 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                              >
                                <option value="">Select</option>
                                <option value="Small (6x6 ft)">Small (6x6 ft)</option>
                                <option value="Medium (8x8 ft)">Medium (8x8 ft)</option>
                                <option value="Large (10x10 ft)">Large (10x10 ft)</option>
                                <option value="Extra Large (12x12 ft)">Extra Large (12x12 ft)</option>
                                <option value="Custom">Custom</option>
                              </select>
                            </div>

                            {/* Category */}
                            <div>
                              <label htmlFor={`stall-stallCategory-${row.id}`} className="block text-sm text-gray-600 mb-1">Category</label>
                              <select
                                id={`stall-stallCategory-${row.id}`}
                                value={row.stallCategory}
                                onChange={(e) => updateStall(idx, 'stallCategory', e.target.value)}
                                className="w-full px-3 py-2 border rounded max-w-60 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                              >
                                <option value="">Select</option>
                                <option value="Food & Beverage">Food & Beverage</option>
                                <option value="Arts & Crafts">Arts & Crafts</option>
                                <option value="Technology">Technology</option>
                                <option value="Fashion & Accessories">Fashion & Accessories</option>
                                <option value="Health & Wellness">Health & Wellness</option>
                                <option value="Education">Education</option>
                                <option value="Entertainment">Entertainment</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>

                            {/* Price */}
                            <div>
                              <label htmlFor={`stall-price-${row.id}`} className="block text-xs text-gray-600 mb-1">Price (₹)</label>
                              <input
                                id={`stall-price-${row.id}`}
                                type="text"
                                value={row.price}
                                onChange={(e) => updateStall(idx, 'price', e.target.value)}
                                placeholder="e.g., 1500"
                                className="w-full px-3 py-2 border rounded"
                              />
                            </div>

                            {/* Delete Button */}
                            <div className="flex justify-start">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => removeStall(idx)}
                                className="h-[40px]"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {editFormData.allStalls.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg">
                        No stalls configured. Click "Add Stall" to get started.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Exhibitor Tab — single scrollable view: registrations + full exhibitor details */}
            {editActiveTab === 'exhibitor' && (
              <div className="p-6 space-y-6 overflow-y-auto">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pb-4 border-b border-gray-200">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Manage Event Exhibitors</h3>
                    <p className="text-sm text-gray-600">
                      Registrations table lists everyone with a record. The cards below show only{' '}
                      <strong>interested</strong> exhibitors (interested registration or profile Interested / Pending).{' '}
                      <strong>{selectedExhibitorsForEdit.length}</strong> exhibitor(s) linked to this event.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditActiveTab('event')}
                    className="flex items-center space-x-2 shrink-0"
                  >
                    <CalendarIcon className="h-4 w-4" />
                    <span>Back to Event</span>
                  </Button>
                </div>

                <div className="rounded-lg border border-indigo-200 bg-indigo-50/90 px-4 py-3 text-sm text-indigo-950">
                  <p className="font-medium text-indigo-900">Stall assignment</p>
                  <p className="mt-1 text-indigo-800/90">
                    <strong>Approve</strong> sets registration to approved (no stall yet). Then <strong>Assign stall</strong>.
                    Saved stalls load again when you open Edit. Use <strong>Change stall</strong> to switch stalls, or{' '}
                    <strong>Remove from event</strong> to unregister and add a different exhibitor.
                  </p>
                  {getConfiguredStallNumbers().length === 0 ? (
                    <p className="mt-2 text-amber-800 bg-amber-100/80 border border-amber-200 rounded-md px-2 py-1.5">
                      No stall numbers are available yet. On the <strong>Event</strong> tab, add rows under{' '}
                      <strong>Stalls configuration</strong> and fill each <strong>Stall No.</strong>, or set{' '}
                      <strong>Number of stalls</strong> so stalls 1…N are offered automatically.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-indigo-700">
                      {getConfiguredStallNumbers().length} stall number(s) available for this event.
                    </p>
                  )}
                </div>

                {/* Registrations for this event */}
                <div className="space-y-3">
                  <h4 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <User className="h-5 w-5 text-gray-600" />
                    Exhibitor registrations
                  </h4>
                  {loadingRegistrations ? (
                    <p className="text-sm text-gray-500">Loading registrations…</p>
                  ) : eventRegistrations.length === 0 ? (
                    <p className="text-sm text-gray-500">No exhibitor registrations for this event.</p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Exhibitor</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Stall</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {eventRegistrations.map((reg) => (
                            <TableRow key={reg.id}>
                              <TableCell className="font-medium">
                                {reg.exhibitor_id ? getExhibitorName(reg.exhibitor_id) : reg.name || '—'}
                              </TableCell>
                              <TableCell className="break-all max-w-[14rem]">
                                {reg.email || (reg.exhibitor_id ? exhibitors.find((e) => e.id === reg.exhibitor_id)?.email : null) || '—'}
                              </TableCell>
                              <TableCell>
                                {reg.status === 'approved' && reg.stall_no?.trim() ? (
                                  <span className="text-sm font-medium text-gray-900">{reg.stall_no.trim()}</span>
                                ) : (
                                  <span className="text-sm text-gray-500">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    reg.status === 'approved' ? 'success' : reg.status === 'rejected' ? 'error' : 'warning'
                                  }
                                  className="capitalize"
                                >
                                  {registrationStatusBadgeLabel(reg)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-2">
                                  {registrationIsInterested(reg) && (
                                    <div className="flex flex-wrap gap-2">
                                      <Button size="sm" onClick={() => startApproveRegistration(reg)}>
                                        Approve
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => handleRejectRegistration(reg)}>
                                        Reject
                                      </Button>
                                    </div>
                                  )}
                                  {reg.status === 'approved' && getConfiguredStallNumbers().length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {reg.stall_no?.trim() ? (
                                        <Button size="sm" variant="outline" onClick={() => startChangeStallModal(reg)}>
                                          Change stall
                                        </Button>
                                      ) : (
                                        <Button size="sm" onClick={() => startAssignStallModal(reg)}>
                                          Assign stall
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                  {reg.exhibitor_id && (
                                    <button
                                      type="button"
                                      className="text-left text-xs text-red-600 hover:underline"
                                      onClick={() => void removeExhibitorRegistrationFromEvent(reg)}
                                    >
                                      Remove from event
                                    </button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900">Register an exhibitor for this event</h4>
                  <p className="text-xs text-gray-600">
                    Pick anyone from your exhibitor directory. They are added to the event with status{' '}
                    <strong>Interested</strong> so they appear in the table and in the interested list below.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div className="flex-1 min-w-0">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Exhibitor</label>
                      <select
                        value={registerExhibitorPickId}
                        onChange={(e) => setRegisterExhibitorPickId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      >
                        <option value="">Choose an exhibitor…</option>
                        {exhibitors
                          .filter((e) => !eventRegistrations.some((r) => r.exhibitor_id === e.id))
                          .sort((a, b) =>
                            (a.companyName || `${a.firstName} ${a.lastName}`).localeCompare(
                              b.companyName || `${b.firstName} ${b.lastName}`,
                              undefined,
                              { sensitivity: 'base' },
                            ),
                          )
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.companyName || `${e.firstName} ${e.lastName}`.trim() || e.email || e.id}
                            </option>
                          ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      disabled={!registerExhibitorPickId}
                      onClick={() => void addExhibitorRegistrationForEvent(registerExhibitorPickId)}
                      className="shrink-0"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add to event
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search interested exhibitors by company, name, email, phone, category…"
                    value={exhibitorSearchTerm}
                    onChange={(e) => setExhibitorSearchTerm(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {exhibitorSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setExhibitorSearchTerm('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    </button>
                  )}
                </div>

                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex flex-wrap justify-between gap-2 items-center">
                    <p className="text-sm text-blue-800">
                      Cards: <strong>interested only</strong> · {selectedExhibitorsForEdit.length} linked to this event
                    </p>
                    {exhibitorSearchTerm && (
                      <p className="text-xs text-gray-600">
                        {(() => {
                          const n = exhibitors.filter((ex) => exhibitorMatchesSearch(ex) && exhibitorIsInterestedForEventView(ex)).length;
                          return `${n} interested match search`;
                        })()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {(() => {
                    const interestedExhibitors = exhibitors.filter(
                      (ex) => exhibitorMatchesSearch(ex) && exhibitorIsInterestedForEventView(ex),
                    );

                    if (exhibitors.length === 0) {
                      return (
                        <div className="text-center py-10 border border-dashed border-gray-200 rounded-lg">
                          <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-600">No exhibitors in the system</p>
                        </div>
                      );
                    }

                    if (interestedExhibitors.length === 0) {
                      return (
                        <div className="text-center py-10 border border-dashed border-gray-200 rounded-lg">
                          <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-600">No interested exhibitors to show</p>
                          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                            Interested exhibitors have an <strong>interested</strong> registration for this event, or are on
                            the event with profile status Interested / Pending. Use &quot;Register an exhibitor&quot; above to add
                            someone, or change the status on an assigned exhibitor.
                          </p>
                          {exhibitorSearchTerm && (
                            <p className="text-sm text-gray-500 mt-2">No matches for your search in that list.</p>
                          )}
                        </div>
                      );
                    }

                    return (
                      <>
                        <div className="flex flex-wrap items-center gap-3 pb-2 border-b border-gray-100">
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={
                                interestedExhibitors.length > 0 &&
                                interestedExhibitors.every((ex) => selectedExhibitorsForEdit.includes(ex.id))
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedExhibitorsForEdit((prev) => [
                                    ...new Set([...prev, ...interestedExhibitors.map((ex) => ex.id)]),
                                  ]);
                                } else {
                                  setSelectedExhibitorsForEdit((prev) =>
                                    prev.filter((id) => !interestedExhibitors.find((ex) => ex.id === id)),
                                  );
                                }
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Select all interested matching search ({interestedExhibitors.length})
                          </label>
                        </div>

                        <div className="space-y-4">
                          {interestedExhibitors.map((exhibitor) => {
                            const assigned = selectedExhibitorsForEdit.includes(exhibitor.id);
                            const href = exhibitorWebsiteHref(exhibitor.website);
                            return (
                              <div
                                key={exhibitor.id}
                                className={`rounded-lg border p-4 shadow-sm ${
                                  assigned ? 'border-green-300 bg-green-50/50' : 'border-gray-200 bg-white'
                                }`}
                              >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="flex gap-3 min-w-0 flex-1">
                                    <input
                                      type="checkbox"
                                      checked={assigned}
                                      onChange={() => toggleExhibitorSelectionEdit(exhibitor.id)}
                                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                                      aria-label={`Assign ${exhibitor.companyName || 'exhibitor'} to event`}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2 gap-y-1">
                                        <span className="text-lg font-semibold text-gray-900 break-words">
                                          {exhibitorField(exhibitor.companyName)}
                                        </span>
                                        {assigned && (
                                          <Badge variant="success" className="text-xs">
                                            On this event
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-sm text-gray-600 mt-1">
                                        Contact:{' '}
                                        {`${exhibitor.firstName || ''} ${exhibitor.lastName || ''}`.trim() || '—'}
                                      </p>
                                      {(() => {
                                        const reg = eventRegistrations.find((r) => r.exhibitor_id === exhibitor.id);
                                        if (!reg) return null;
                                        const stallPickerOpts = getConfiguredStallNumbers();
                                        const approved = reg.status === 'approved';
                                        const showStallRow = approved && stallPickerOpts.length > 0;
                                        const showAssignStall = showStallRow && !reg.stall_no?.trim();
                                        const showChangeStall = showStallRow && Boolean(reg.stall_no?.trim());
                                        return (
                                          <div className="mt-2 rounded-md border border-indigo-200 bg-white/80 px-2.5 py-2 text-xs">
                                            <span className="font-semibold text-indigo-900">Event registration</span>
                                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                              <Badge
                                                variant={
                                                  reg.status === 'approved'
                                                    ? 'success'
                                                    : reg.status === 'rejected'
                                                      ? 'error'
                                                      : 'warning'
                                                }
                                                className="text-[10px] capitalize"
                                              >
                                                {registrationStatusBadgeLabel(reg)}
                                              </Badge>
                                              <span className="text-gray-500">Stall:</span>
                                              {reg.status === 'approved' && reg.stall_no?.trim() ? (
                                                <span className="text-gray-800 font-medium">{reg.stall_no.trim()}</span>
                                              ) : (
                                                <span className="text-gray-800 font-medium">—</span>
                                              )}
                                              {registrationIsInterested(reg) && (
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  className="h-7 text-xs"
                                                  onClick={() => startApproveRegistration(reg)}
                                                >
                                                  Approve
                                                </Button>
                                              )}
                                              {showAssignStall && (
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-7 text-xs"
                                                  onClick={() => startAssignStallModal(reg)}
                                                >
                                                  Assign stall
                                                </Button>
                                              )}
                                              {showChangeStall && (
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-7 text-xs"
                                                  onClick={() => startChangeStallModal(reg)}
                                                >
                                                  Change stall
                                                </Button>
                                              )}
                                            </div>
                                            {reg.exhibitor_id && (
                                              <button
                                                type="button"
                                                className="mt-1.5 text-[11px] text-red-600 hover:underline"
                                                onClick={() => void removeExhibitorRegistrationFromEvent(reg)}
                                              >
                                                Remove from event
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0 w-full lg:w-auto">
                                    <div className="flex flex-col gap-1">
                                      <span className="text-xs text-gray-500">Exhibitor status</span>
                                      <select
                                        value={exhibitorUpdates[exhibitor.id] || exhibitor.status}
                                        onChange={(e) => updateExhibitorStatusEdit(exhibitor.id, e.target.value)}
                                        className="text-sm border border-gray-300 rounded-md px-2 py-1.5 min-w-[10rem] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      >
                                        <option value="interested">Interested</option>
                                        <option value="approved">Approved</option>
                                        <option value="declined">Declined</option>
                                      </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <span className="text-xs text-gray-500">Payment</span>
                                      <Badge
                                        variant={getPaymentStatusVariant(exhibitor.paymentStatus)}
                                        className="w-fit justify-center capitalize"
                                      >
                                        {exhibitor.paymentStatus || 'pending'}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>

                                <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-3 text-sm border-t border-gray-100 pt-4">
                                  <div>
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</dt>
                                    <dd className="text-gray-900 mt-0.5 break-all">
                                      {exhibitor.email ? (
                                        <a href={`mailto:${exhibitor.email}`} className="text-blue-700 hover:underline">
                                          {exhibitor.email}
                                        </a>
                                      ) : (
                                        '—'
                                      )}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Phone</dt>
                                    <dd className="text-gray-900 mt-0.5">
                                      {exhibitor.phone ? (
                                        <a href={`tel:${exhibitor.phone}`} className="text-blue-700 hover:underline">
                                          {exhibitor.phone}
                                        </a>
                                      ) : (
                                        '—'
                                      )}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Alternate phone</dt>
                                    <dd className="text-gray-900 mt-0.5">{exhibitorField(exhibitor.alternatePhone)}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Category</dt>
                                    <dd className="text-gray-900 mt-0.5 break-words">{exhibitorField(exhibitor.category)}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sub-category</dt>
                                    <dd className="text-gray-900 mt-0.5 break-words">{exhibitorField(exhibitor.subCategory)}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Website</dt>
                                    <dd className="text-gray-900 mt-0.5 break-all">
                                      {href ? (
                                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
                                          {exhibitor.website}
                                        </a>
                                      ) : (
                                        '—'
                                      )}
                                    </dd>
                                  </div>
                                  <div className="sm:col-span-2 xl:col-span-3">
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Address</dt>
                                    <dd className="text-gray-900 mt-0.5 break-words">
                                      {[
                                        exhibitorField(exhibitor.address1),
                                        exhibitorField(exhibitor.address2),
                                      ]
                                        .filter((line) => line !== '—')
                                        .join(', ') || '—'}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">City</dt>
                                    <dd className="text-gray-900 mt-0.5">{exhibitorField(exhibitor.city)}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">State</dt>
                                    <dd className="text-gray-900 mt-0.5">{exhibitorField(exhibitor.state)}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pincode</dt>
                                    <dd className="text-gray-900 mt-0.5">{exhibitorField(exhibitor.pincode)}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Country</dt>
                                    <dd className="text-gray-900 mt-0.5">{exhibitorField(exhibitor.country)}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Booth size</dt>
                                    <dd className="text-gray-900 mt-0.5">{exhibitorField(exhibitor.boothSize)}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">PAN</dt>
                                    <dd className="text-gray-900 mt-0.5 font-mono text-xs">{exhibitorField(exhibitor.panNumber)}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">GST</dt>
                                    <dd className="text-gray-900 mt-0.5 font-mono text-xs">{exhibitorField(exhibitor.gstNumber)}</dd>
                                  </div>
                                  <div className="sm:col-span-2 xl:col-span-3">
                                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Business description</dt>
                                    <dd className="text-gray-900 mt-0.5 whitespace-pre-wrap break-words line-clamp-6" title={exhibitor.businessDescription || undefined}>
                                      {exhibitorField(exhibitor.businessDescription)}
                                    </dd>
                                  </div>
                                </dl>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Sponsor Tab */}
            {editActiveTab === 'sponsor' && (
              <div className="p-6 space-y-6 overflow-y-auto">
                <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Event Sponsors</h3>
                    <p className="text-sm text-gray-600">
                      Assign sponsors to this event and set their role (e.g. Title, Co-Sponsor). {eventSponsors.length} sponsor(s) assigned.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEditActiveTab('event')} className="flex items-center space-x-2">
                    <CalendarIcon className="h-4 w-4" />
                    <span>Back to Event</span>
                  </Button>
                </div>

                {loadingEventSponsors ? (
                  <p className="text-sm text-gray-500">Loading sponsors…</p>
                ) : (
                  <>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Company</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead className="w-24">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {eventSponsors.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center py-6 text-gray-500">
                                No sponsors assigned. Add one below.
                              </TableCell>
                            </TableRow>
                          ) : (
                            eventSponsors.map(({ sponsorId, role }) => (
                              <TableRow key={sponsorId}>
                                <TableCell className="font-medium">{getSponsorName(sponsorId)}</TableCell>
                                <TableCell>{getSponsorRoleLabel(role)}</TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEventSponsors(prev => prev.filter(s => s.sponsorId !== sponsorId))}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex flex-wrap items-end gap-3 p-4 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sponsor</label>
                        <select
                          value={newSponsorId}
                          onChange={(e) => setNewSponsorId(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select sponsor…</option>
                          {sponsors
                            .filter(s => !eventSponsors.some(es => es.sponsorId === s.id))
                            .map(s => (
                              <option key={s.id} value={s.id}>{s.companyName}</option>
                            ))}
                        </select>
                      </div>
                      <div className="w-48">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                        <select
                          value={newSponsorRole}
                          onChange={(e) => setNewSponsorRole(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          {SPONSOR_ROLE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <Button
                        size="sm"
                        disabled={!newSponsorId}
                        onClick={() => {
                          if (!newSponsorId) return;
                          setEventSponsors(prev => [...prev, { sponsorId: newSponsorId, role: newSponsorRole }]);
                          setNewSponsorId('');
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {approveStallModalReg && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="stall-approve-title"
                  className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4"
                >
                  <h3 id="stall-approve-title" className="text-lg font-semibold text-gray-900">
                    {approveStallModalReg.stall_no?.trim() ? 'Change stall' : 'Assign stall'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {approveStallModalReg.stall_no?.trim()
                      ? 'Pick a new stall for '
                      : 'Registration is approved. Pick a stall for '}
                    <strong>
                      {approveStallModalReg.exhibitor_id
                        ? getExhibitorName(approveStallModalReg.exhibitor_id)
                        : approveStallModalReg.name ?? 'this exhibitor'}
                    </strong>
                    . Each stall can only go to one exhibitor. Use <strong>Change stall</strong> in the table to reassign
                    without losing approval, or <strong>Remove from event</strong> to drop this exhibitor and add someone
                    else.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stall number</label>
                    <select
                      value={approveModalStallChoice}
                      onChange={(e) => setApproveModalStallChoice(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      {getAvailableStallsForNewApproval(approveStallModalReg).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => {
                        setApproveStallModalReg(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={async () => {
                        const reg = approveStallModalReg;
                        const stall = approveModalStallChoice.trim();
                        const needStall = getConfiguredStallNumbers().length > 0;
                        if (!reg) return;
                        if (needStall && !stall) {
                          showNotification('Select a stall number.', 'error');
                          return;
                        }
                        const ok = await handleUpdateRegistrationStall(reg, stall);
                        if (ok) {
                          setApproveStallModalReg(null);
                        }
                      }}
                    >
                      Save stall assignment
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <Button variant="outline" onClick={closeModals}>Cancel</Button>
              <Button onClick={handleSaveEdit} className="flex items-center space-x-2">
                <Save className="h-4 w-4" />
                <span>Save Changes</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {poVendorModal && editFormData && (
        <EventVendorPurchaseOrderModal
          isOpen
          onClose={() => setPoVendorModal(null)}
          eventId={editFormData.id}
          eventTitle={editFormData.title}
          vendorId={poVendorModal.vendorId}
          vendorName={getVendorName(poVendorModal.vendorId)}
          organizationId={editFormData.organizationId ?? null}
          userId={user?.id ?? null}
          initialMode={poVendorModal.mode}
          onSaved={() => {
            showNotification('Purchase order saved.', 'success');
            if (editFormData?.id) void refreshEventVendorIdsWithPO(editFormData.id);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Delete Event</h3>
                  <p className="text-sm text-gray-600">This action cannot be undone</p>
                </div>
              </div>

              <p className="text-gray-700 mb-6">
                Are you sure you want to delete "<strong>{selectedEvent.title}</strong>"?
                This will permanently remove the event and all associated data.
              </p>

              <div className="flex justify-end space-x-3">
                <Button variant="outline" onClick={closeModals}>Cancel</Button>
                <Button variant="danger" onClick={handleConfirmDelete} className="flex items-center space-x-2">
                  <Trash2 className="h-4 w-4" />
                  <span>Delete Event</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Stall Confirmation Modal */}
      {showDeleteStallModal && stallToRemove && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Remove Stall</h3>
                  <p className="text-sm text-gray-600">This action cannot be undone</p>
                </div>
              </div>

              <p className="text-gray-700 mb-6">
                Are you sure you want to remove "<strong>{stallToRemove.stallNumber}</strong>"?
                This will permanently remove the stall configuration.
              </p>

              <div className="flex justify-end space-x-3">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowDeleteStallModal(false);
                    setStallToRemove(null);
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  variant="danger" 
                  onClick={confirmRemoveStall} 
                  className="flex items-center space-x-2"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Remove Stall</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};