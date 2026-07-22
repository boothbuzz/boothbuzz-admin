import { useState, useEffect } from 'react';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { User, Event, Venue, Vendor, Exhibitor } from '../types';
import { parseExhibitorImageUrls } from '../utils/exhibitorPortfolio';

/** Normalize API date values to YYYY-MM-DD for <input type="date">. */
export function toDateInputValue(value: unknown): string {
  if (value == null || value === '') return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  // Local calendar date — avoids UTC day-shift for IST midnights
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeDocumentUrls(raw: unknown): {
  panCard: string | null;
  aadharCard: string | null;
  licence: string | null;
} {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    panCard: (obj.panCard ?? obj.pan_card ?? null) as string | null,
    aadharCard: (obj.aadharCard ?? obj.aadhar_card ?? null) as string | null,
    licence: (obj.licence ?? obj.license ?? null) as string | null,
  };
}

function normalizeSocialLinks(raw: unknown): {
  linkedin: string;
  facebook: string;
  twitter: string;
  instagram: string;
} {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    linkedin: String(obj.linkedin ?? ''),
    facebook: String(obj.facebook ?? ''),
    twitter: String(obj.twitter ?? ''),
    instagram: String(obj.instagram ?? ''),
  };
}

function splitContactName(contactPerson?: string | null): { firstName: string; lastName: string } {
  const parts = (contactPerson || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export type UseSupabaseDataOptions = {
  limit?: number;
  order?: { column: string; ascending?: boolean };
  /** When set and not super admin, filter by this organization (org-level users see only their org). */
  organizationId?: string | null;
  isSuperAdmin?: boolean;
  /** When true, do not filter by organization_id (e.g. show seed data to all). */
  skipOrgFilter?: boolean;
};

// Generic hook for fetching data from Supabase
export function useSupabaseData<T>(
  table: string,
  select: string = '*',
  dependencies: any[] = [],
  options: UseSupabaseDataOptions = {}
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);

      let query = apiClient
        .from(table)
        .select(select);

      // Org scoping: non–super-admin users see only their organization's data (unless skipOrgFilter)
      if (
        !options.skipOrgFilter &&
        options.organizationId != null &&
        options.organizationId !== '' &&
        options.isSuperAdmin !== true
      ) {
        query = query.eq('organization_id', options.organizationId);
      }

      if (options.order) {
        query = query.order(
          options.order.column,
          { ascending: options.order.ascending ?? false }
        );
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data: result, error } = await query;

      if (error) {
        console.error(`Error fetching ${table}:`, error);
        setError(error.message);
      } else {
        setData(result as T[] || []);
        setError(null);
      }
    } catch (err) {
      console.error(`Unexpected error fetching ${table}:`, err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [...dependencies, options.organizationId, options.isSuperAdmin, options.skipOrgFilter]);

  return { data, loading, error, refetch: () => fetchData() };
}

// Specific hooks for each entity (org-scoped: non–super-admin see only their organization)
export const useUsers = () => {
  const { user, isSuperAdmin } = useAuth();
  const { data, loading, error, refetch } = useSupabaseData<any>(
    'users',
    '*, organizations!users_organization_id_fkey ( name )',
    [user?.organizationId, isSuperAdmin],
    {
      order: { column: 'created_at', ascending: false },
      organizationId: user?.organizationId ?? null,
      isSuperAdmin,
    }
  );

  const mapped: User[] = data.map((user: any) => {
    const org = user.organizations;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      city: user.city,
      phone: user.phone,
      status: user.status,
      firstName: user.first_name,
      lastName: user.last_name,
      address: user.address,
      state: user.state,
      pincode: user.pincode,
      country: user.country,
      dateOfBirth: user.date_of_birth,
      gender: user.gender,
      department: user.department,
      designation: user.designation,
      employeeId: user.employee_id,
      joiningDate: user.joining_date,
      emergencyContact: user.emergency_contact,
      preferences: user.preferences,
      last_login: user.last_login,
      created_at: user.created_at,
      updated_at: user.updated_at,
      organizationId: user.organization_id ?? null,
      organizationName: org?.name ?? null,
    } as User;
  });

  // Never list super_admin accounts in the UI (any role)
  const users = mapped.filter((u) => u.role !== 'super_admin');

  return { users, loading, error, refetch };
};

export const useEvents = () => {
  const { user, isSuperAdmin } = useAuth();
  const { data, loading, error, refetch } = useSupabaseData<any>(
    'events',
    `*, venue:venues(name)`,
    [user?.organizationId, isSuperAdmin],
    {
      order: { column: 'created_at', ascending: false },
      limit: 50,
      organizationId: user?.organizationId ?? null,
      isSuperAdmin,
    }
  );
  
  // Transform data to match our Event interface
  const events: Event[] = data.map((event: any) => {
    const transformedEvent = {
      id: event.id,
      organizationId: event.organization_id ?? null,
      title: event.title,
      description: event.description,
      date: toDateInputValue(event.event_date),
      eventEndDate: toDateInputValue(event.event_end_date),
      time: event.event_time,
      eventEndTime: event.event_end_time,
      venue: event.venue_name || event.venue?.name || '',
      city: event.city,
      status: event.status,
      attendees: event.attendees || 0,
      maxCapacity: event.max_capacity || 0,
      planType: event.plan_type,
      vendors: event.vendor_ids || [],
      venueId: event.venue_id,
      createdBy: event.created_by,
      totalRevenue: event.total_revenue || 0,
      // JSONB may return an array; list/edit parsing expects string or array
      eventImageUrl: (() => {
        const v = event.event_image_url;
        if (v == null) return null;
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) return JSON.stringify(v);
        try {
          return JSON.stringify(v);
        } catch {
          return String(v);
        }
      })(),
      layoutImageUrl: event.layout_image_url,
      // Pricing & Availability
      pricePerHour: Number(event.price_per_hour) || 0,
      availableHours: event.available_hours || '',
      parkingSpaces: event.parking_spaces || 0,
      cateringAllowed: Boolean(event.catering_allowed),
      alcoholAllowed: Boolean(event.alcohol_allowed),
      smokingAllowed: Boolean(event.smoking_allowed),
      selectedFacilities: event.selected_facilities || [],
      selectedAmenities: event.selected_amenities || [],
      // Stalls Configuration
      exhibitors: event.exhibitor_ids || [],
      noOfStalls: event.no_of_stalls,
      inSiteStalls: event.in_site_stalls || [],
      outSiteStalls: event.out_site_stalls || [],
      allStalls: event.in_site_stalls || [], // Use in_site_stalls for the detailed stall objects
      stallNumbersFromDb: Array.isArray(event.all_stalls)
        ? event.all_stalls.map((s: unknown) => String(s).trim()).filter(Boolean)
        : [],
      created_at: event.created_at,
      updated_at: event.updated_at
    };
    
    return transformedEvent;
  });

  return { events, loading, error, refetch };
};

export const useVenues = () => {
  const { user, isSuperAdmin } = useAuth();
  const { data, loading, error, refetch } = useSupabaseData<any>(
    'venues',
    '*',
    [user?.organizationId, isSuperAdmin],
    {
      order: { column: 'name', ascending: true },
      organizationId: user?.organizationId ?? null,
      isSuperAdmin,
    }
  );
  
  // Transform data to match our Venue interface
  const venues: Venue[] = data.map((venue: any) => {
    const transformedVenue = {
      id: venue.id,
      organizationId: venue.organization_id ?? null,
      name: venue.name,
      location: venue.location,
      contactPerson: venue.contact_person,
      email: venue.email,
      phone: venue.phone,
      memberCount: venue.capacity || 0,
      facilities: venue.facilities || [],
      amenities: venue.amenities || [],
      activeEvents: venue.active_events || 0,
      totalRevenue: venue.total_revenue || 0,
      status: venue.status,
      joinedDate: venue.joined_date,
      // Extended fields
      addressLine1: venue.address_line1,
      addressLine2: venue.address_line2,
      city: venue.city,
      state: venue.state,
      pincode: venue.pincode,
      country: venue.country,
      addressLandmark: venue.address_landmark,
      addressStandard: venue.address_standard,
      areaSqFt: venue.area_sq_ft,
      kindOfSpace: venue.kind_of_space,
      isCovered: venue.is_covered,
      pricingPerDay: venue.pricing_per_day,
      facilityAreaSqFt: venue.facility_area_sq_ft,
      noOfStalls: venue.no_of_stalls,
      facilityCovered: venue.facility_covered,
      noOfFlats: venue.no_of_flats,
      availableHours: venue.available_hours,
      parkingSpaces: venue.parking_spaces,
      cateringAllowed: venue.catering_allowed,
      alcoholAllowed: venue.alcohol_allowed,
      smokingAllowed: venue.smoking_allowed,
      // Google Maps fields
      latitude: venue.latitude,
      longitude: venue.longitude,
      formattedAddress: venue.formatted_address,
      description: venue.description,
      photos: venue.photos || [],
      documents: venue.documents || [],
      // Custom Contact Information
      customContacts: venue.custom_contacts || [],
      // Bank details
      bankName: venue.bank_name,
      bankAccountNumber: venue.bank_account_number,
      bankHolderName: venue.bank_holder_name,
      bankIfsc: venue.bank_ifsc,
      bankMicr: venue.bank_micr,
      // Timestamps
      created_at: venue.created_at,
      updated_at: venue.updated_at
    };
    
    return transformedVenue;
  });

  return { venues, loading, error, refetch };
};

export const useVendors = () => {
  const { user, isSuperAdmin } = useAuth();
  const { data, loading, error, refetch } = useSupabaseData<any>(
    'vendors',
    '*',
    [user?.organizationId, isSuperAdmin],
    {
      order: { column: 'name', ascending: true },
      organizationId: user?.organizationId ?? null,
      isSuperAdmin,
    }
  );

  const vendors: Vendor[] = data.map((vendor: any) => ({
    id: vendor.id,
    organizationId: vendor.organization_id ?? null,
    name: vendor.name,
    category: vendor.category,
    city: vendor.city,
    contactPerson: vendor.contact_person,
    email: vendor.email,
    phone: vendor.phone,
    rating: vendor.rating,
    completedJobs: vendor.completed_jobs || 0,
    status: vendor.status,
    priceRange: vendor.price_range,
    created_at: vendor.created_at,
    updated_at: vendor.updated_at
  }));

  return { vendors, loading, error, refetch };
};

export const useExhibitors = () => {
  const { user, isSuperAdmin } = useAuth();
  const { data, loading, error, refetch } = useSupabaseData<any>(
    'exhibitors',
    '*',
    [user?.organizationId, isSuperAdmin],
    {
      order: { column: 'created_at', ascending: false },
      organizationId: user?.organizationId ?? null,
      isSuperAdmin,
    },
  );
  
  // Transform data to match our Exhibitor interface
  const exhibitors: Exhibitor[] = data.map((exhibitor: any) => {
    const contactPerson = exhibitor.contact_person || exhibitor.contactPerson || '';
    const fromContact = splitContactName(contactPerson);
    const firstName = exhibitor.first_name || exhibitor.firstName || fromContact.firstName || '';
    const lastName = exhibitor.last_name || exhibitor.lastName || fromContact.lastName || '';
    const companyDescription =
      exhibitor.company_description || exhibitor.companyDescription || exhibitor.business_description || '';

    return {
    id: exhibitor.id,
    organizationId: exhibitor.organization_id ?? exhibitor.organizationId ?? null,
    // Personal Information (NEW - matching AddExhibitor Step 1)
    firstName,
    lastName,
    
    // Company Information
    companyName: exhibitor.company_name || exhibitor.companyName || '',
    companyDescription,
    establishedYear: exhibitor.established_year,
    companySize: exhibitor.company_size,
    website: exhibitor.website,
    
    // Contact Information
    contactPerson: contactPerson || `${firstName} ${lastName}`.trim(),
    designation: exhibitor.designation,
    email: exhibitor.email,
    phone: exhibitor.phone,
    alternatePhone: exhibitor.alternate_phone || exhibitor.alternatePhone || '',
    alternateEmail: exhibitor.alternate_email,
    
    // Business Details
    category: exhibitor.category,
    subCategory: exhibitor.sub_category || exhibitor.subCategory,
    businessType: exhibitor.business_type,
    gstNumber: exhibitor.gst_number || exhibitor.gstNumber || '',
    panNumber: exhibitor.pan_number || exhibitor.panNumber || '',
    businessDescription: companyDescription,
    
    // Location & Address (NEW - matching AddExhibitor Step 2)
    address: exhibitor.address,
    address1:
      exhibitor.address1 ||
      exhibitor.address_line1 ||
      exhibitor.addressLine1 ||
      exhibitor.address ||
      '',
    address2:
      exhibitor.address2 ||
      exhibitor.address_line2 ||
      exhibitor.addressLine2 ||
      '',
    city: exhibitor.city || '',
    state: exhibitor.state || '',
    pincode: exhibitor.pincode || '',
    country: exhibitor.country || '',
    
    // Exhibition Details
    boothPreference: exhibitor.booth_preference,
    boothSize: exhibitor.booth_size || exhibitor.boothSize || '',
    specialRequirements: exhibitor.special_requirements,
    previousExhibitions: exhibitor.previous_exhibitions,
    expectedVisitors: exhibitor.expected_visitors,
    
    // Products & Services
    products: exhibitor.products || [],
    services: exhibitor.services || [],
    targetAudience: exhibitor.target_audience,
    
    // Payment & Billing
    registrationFee: exhibitor.registration_fee,
    paymentMethod: exhibitor.payment_method,
    billingAddress: exhibitor.billing_address,
    
    // Additional Information
    socialMediaLinks: normalizeSocialLinks(
      exhibitor.social_media_links ?? exhibitor.socialMediaLinks,
    ),
    
    // Documents & Images (NEW - matching AddExhibitor Steps 4 & 5)
    documentUrls: normalizeDocumentUrls(
      exhibitor.document_urls ?? exhibitor.documentUrls,
    ),
    imageUrls: parseExhibitorImageUrls(
      exhibitor.image_urls ?? exhibitor.imageUrls ?? null
    ),
    portfolioImageUrl:
      exhibitor.portfolio_image_url ?? exhibitor.portfolioImageUrl ?? null,

    // Settings
    status: exhibitor.status,
    paymentStatus: exhibitor.payment_status,
    sendConfirmationEmail: exhibitor.send_confirmation_email,
    allowMarketingEmails: exhibitor.allow_marketing_emails,
    
    // Legacy fields
    booth: exhibitor.booth,
    registrationDate: exhibitor.registration_date,
    
    // Timestamps
    created_at: exhibitor.created_at,
    updated_at: exhibitor.updated_at
  };
  });

  return { exhibitors, loading, error, refetch };
};

export const useSocieties = () => {
  const { data, loading, error, refetch } = useSupabaseData<any>('societies', '*', [], 
    { order: { column: 'name', ascending: true } });
  
  const societies: any[] = data.map((society: any) => ({
    id: society.id,
    name: society.name,
    location: society.location,
    contactPerson: society.contact_person,
    email: society.email,
    phone: society.phone,
    memberCount: society.member_count || 0,
    facilities: society.facilities || [],
    activeEvents: society.active_events || 0,
    totalRevenue: society.total_revenue || 0,
    status: society.status,
    joinedDate: society.joined_date,
    created_at: society.created_at,
    updated_at: society.updated_at
  }));

  return { societies, loading, error, refetch };
};

export const useSponsors = (opts?: { all?: boolean }) => {
  const { user, isSuperAdmin } = useAuth();
  const { data, loading, error, refetch } = useSupabaseData<any>(
    'sponsors',
    '*',
    [user?.organizationId, isSuperAdmin, opts?.all],
    {
      order: { column: 'created_at', ascending: false },
      organizationId: user?.organizationId ?? null,
      isSuperAdmin,
      skipOrgFilter: opts?.all === true,
    }
  );

  const sponsors = data.map((row: any) => ({
    id: row.id,
    companyName: row.company_name,
    contactPerson: row.contact_person,
    email: row.email,
    phone: row.phone ?? '',
    sponsorshipType: row.sponsorship_type,
    sponsorshipLevel: row.sponsorship_level,
    amount: Number(row.amount) || 0,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    benefits: Array.isArray(row.benefits) ? row.benefits : [],
    eventsSponsored: row.events_sponsored ?? 0,
  }));

  return { sponsors, loading, error, refetch };
};

export const useAdvertisements = (opts?: { skipOrgFilter?: boolean }) => {
  const { user, isSuperAdmin } = useAuth();
  const { data, loading, error, refetch } = useSupabaseData<any>(
    'advertisements',
    '*',
    [user?.organizationId, isSuperAdmin, opts?.skipOrgFilter],
    {
      order: { column: 'created_at', ascending: false },
      organizationId: user?.organizationId ?? null,
      isSuperAdmin,
      skipOrgFilter: opts?.skipOrgFilter === true,
    }
  );

  const advertisements = data.map((row: any) => ({
    id: row.id,
    title: row.title,
    advertiser: row.advertiser,
    type: row.type,
    placement: row.placement,
    startDate: row.start_date,
    endDate: row.end_date,
    budget: Number(row.budget) || 0,
    spent: Number(row.spent) || 0,
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    status: row.status,
    ctr: Number(row.ctr) || 0,
    cpm: Number(row.cpm) || 0,
  }));

  return { advertisements, loading, error, refetch };
};

export const useCampaigns = (opts?: { skipOrgFilter?: boolean }) => {
  const { user, isSuperAdmin } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      let query = apiClient
        .from('campaigns')
        .select('*, campaign_ads(advertisement_id)')
        .order('created_at', { ascending: false });

      if (
        opts?.skipOrgFilter !== true &&
        user?.organizationId != null &&
        user.organizationId !== '' &&
        !isSuperAdmin
      ) {
        query = query.eq('organization_id', user.organizationId);
      }

      const { data: result, error: err } = await query;
      if (err) {
        console.error('Error fetching campaigns:', err);
        setError(err.message);
      } else {
        setData(result ?? []);
        setError(null);
      }
    } catch (err) {
      console.error('Unexpected error fetching campaigns:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, [user?.organizationId, isSuperAdmin, opts?.skipOrgFilter]);

  const campaigns = data.map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    startDate: row.start_date,
    endDate: row.end_date,
    budget: Number(row.budget) || 0,
    spent: Number(row.spent) || 0,
    targetAudience: row.target_audience ?? '',
    status: row.status,
    ads: (row.campaign_ads ?? []).map((c: any) => c.advertisement_id),
    performance: {
      impressions: Number(row.performance?.impressions) ?? 0,
      clicks: Number(row.performance?.clicks) ?? 0,
      conversions: Number(row.performance?.conversions) ?? 0,
      ctr: Number(row.performance?.ctr) ?? 0,
      cpc: Number(row.performance?.cpc) ?? 0,
    },
  }));

  return { campaigns, loading, error, refetch: fetchCampaigns };
};

export const useWebsiteAds = (opts?: { skipOrgFilter?: boolean }) => {
  const { user, isSuperAdmin } = useAuth();
  const { data, loading, error, refetch } = useSupabaseData<any>(
    'website_ads',
    '*',
    [user?.organizationId, isSuperAdmin, opts?.skipOrgFilter],
    {
      order: { column: 'created_at', ascending: false },
      organizationId: user?.organizationId ?? null,
      isSuperAdmin,
      skipOrgFilter: opts?.skipOrgFilter === true,
    }
  );

  const websiteAds = data.map((row: any) => ({
    id: row.id,
    title: row.title,
    advertiser: row.advertiser ?? 'Website',
    adSection: row.section_key ?? row.ad_section ?? '',
    adType: row.media_type ?? row.ad_type ?? 'banner',
    imageUrl: row.media_url ?? row.image_url ?? '',
    redirectUrl: row.cta_url ?? row.redirect_url ?? '',
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : '',
    endDate: row.end_date ? String(row.end_date).slice(0, 10) : '',
    status: row.status ?? (row.is_active === false ? 'inactive' : 'active'),
    priority: Number(row.sort_order ?? row.priority) || 0,
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return { websiteAds, loading, error, refetch };
};

export const useVendorSubscriptionPlans = () => {
  const { data, loading, error, refetch } = useSupabaseData<any>(
    'vendor_subscription_plans',
    '*',
    [],
    {
      order: { column: 'rank_order', ascending: true },
      skipOrgFilter: true,
      isSuperAdmin: true,
    },
  );

  const plans = data.map((row: any) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? '',
    monthlyPriceInr: Number(row.monthly_price_inr) || 0,
    trialDays: Number(row.trial_days) || 0,
    isActive: row.is_active !== false,
    isPopular: row.is_popular === true,
    rankOrder: Number(row.rank_order) || 0,
    features: Array.isArray(row.features) ? row.features.map((f: unknown) => String(f)) : [],
    limits: row.limits && typeof row.limits === 'object' ? row.limits : {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return { plans, loading, error, refetch };
};

export const useVendorSubscriptions = () => {
  const { data, loading, error, refetch } = useSupabaseData<any>(
    'vendor_subscriptions',
    '*, organization:organizations(name), plan:vendor_subscription_plans(name, code)',
    [],
    { order: { column: 'created_at', ascending: false }, skipOrgFilter: true, isSuperAdmin: true },
  );

  const subscriptions = data.map((row: any) => ({
    id: row.id,
    organizationName: row.organization?.name ?? '—',
    planName: row.plan?.name ?? '—',
    planCode: row.plan?.code ?? '',
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    autoRenew: row.auto_renew === true,
    monthlyAmountInr: Number(row.monthly_price_inr) || 0,
    trialEndsAt: row.trial_ends_at ?? null,
  }));

  return { subscriptions, loading, error, refetch };
};

export const useVendorBillingInvoices = () => {
  const { data, loading, error, refetch } = useSupabaseData<any>(
    'vendor_billing_invoices',
    '*, organization:organizations(name), plan:vendor_subscription_plans(name)',
    [],
    { order: { column: 'created_at', ascending: false }, skipOrgFilter: true, isSuperAdmin: true },
  );

  const invoices = data.map((row: any) => ({
    id: row.id,
    invoiceNumber: row.invoice_number,
    organizationName: row.organization?.name ?? '—',
    planName: row.plan?.name ?? '—',
    amountInr: Number(row.amount_inr) || 0,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    paidAt: row.paid_at ?? null,
    paymentMethod: row.payment_method ?? null,
    status: row.status,
  }));

  return { invoices, loading, error, refetch };
};