export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  city?: string | null;
  phone?: string | null;
  status: 'active' | 'inactive';
  // Additional fields for enhanced user management
  firstName?: string | null;
  lastName?: string | null;
  address?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  dateOfBirth?: string | null;
  gender?: 'male' | 'female' | 'other' | null;
  department?: string | null;
  designation?: string | null;
  employeeId?: string | null;
  joiningDate?: string | null;
  emergencyContact?: {
    name?: string | null;
    phone?: string | null;
    relationship?: string | null;
  } | null;
  preferences?: {
    language?: string | null;
    timezone?: string | null;
    notifications?: boolean | null;
  } | null;
  last_login?: string | null;
  created_at: string;
  updated_at: string;
  organizationId?: string | null;
  organizationName?: string | null;
  mustChangePassword?: boolean;
}

export type UserRole = 
  | 'super_admin'
  | 'system_support'
  | 'admin'
  | 'support_tech'
  | 'sales_marketing'
  | 'accounts'
  | 'sales'
  | 'marketing'
  | 'city_head'
  // | 'legal'
  | 'logistics'
  | 'accounting'
  // | 'vendor'
  // | 'society'
  // | 'exhibitor';

export interface StallConfig {
  id: string;
  stallNo: string;
  stallSize: string;
  stallCategory: string;
  price: number;
}

export interface Event {
  id: string;
  title: string;
  description?: string | null;
  date: string; // event_date from DB
  eventEndDate?: string | null; // event_end_date from DB
  time: string; // event_time from DB
  eventEndTime?: string | null; // event_end_time from DB
  venue: string; // venue_name from DB
  city?: string | null;
  status: 'draft' | 'upcoming' | 'published' | 'ongoing' | 'completed' | 'cancelled';
  attendees: number;
  maxCapacity: number; // max_capacity from DB
  planType?: 'Plan A' | 'Plan B' | 'Plan C' | 'Custom' | null; // plan_type from DB
  vendors: string[]; // vendor_ids from DB
  exhibitors?: string[] | null; // exhibitor_ids from DB
  venueId?: string | null; // venue_id from DB
  createdBy?: string | null; // created_by from DB
  totalRevenue: number; // total_revenue from DB
  /** Optional — analytics / reports (may come from DB or sample data) */
  satisfactionScore?: number | null;
  roiPercent?: number | null;
  // Address & Location
  addressLine1?: string | null; // address_line1 from DB
  addressLandmark?: string | null; // address_landmark from DB
  addressStandard?: string | null; // address_standard from DB
  areaSqFt?: number | null; // area_sq_ft from DB
  kindOfSpace?: string | null; // kind_of_space from DB
  isCovered?: boolean | null; // is_covered from DB
  pricingPerDay?: number | null; // pricing_per_day from DB
  facilityAreaSqFt?: number | null; // facility_area_sq_ft from DB
  noOfStalls?: number | null; // no_of_stalls from DB
  facilityCovered?: boolean | null; // facility_covered from DB
  amenities?: string | null; // amenities from DB
  noOfFlats?: number | null; // no_of_flats from DB
  latitude?: number | null; // latitude from DB
  longitude?: number | null; // longitude from DB
  formattedAddress?: string | null; // formatted_address from DB
  // Images
  eventImageUrl?: string | null; // event_image_url from DB
  layoutImageUrl?: string | null; // layout_image_url from DB
  // Pricing & Availability
  pricePerHour?: number | null; // price_per_hour from DB
  availableHours?: string | null; // available_hours from DB
  parkingSpaces?: number | null; // parking_spaces from DB
  cateringAllowed?: boolean | null; // catering_allowed from DB
  alcoholAllowed?: boolean | null; // alcohol_allowed from DB
  smokingAllowed?: boolean | null; // smoking_allowed from DB
  selectedFacilities?: string[];
  selectedAmenities?: string[];
  // Stalls Configuration
  inSiteStalls?: StallConfig[] | null; // in_site_stalls from DB
  outSiteStalls?: StallConfig[] | null; // out_site_stalls from DB
  allStalls?: string[] | null; // legacy / mixed use
  /** Stall numbers from events.all_stalls (string array) for assignment pickers */
  stallNumbersFromDb?: string[];
  organizationId?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Venue {
  id: string;
  name: string;
  location?: string | null;
  contactPerson?: string | null; // contact_person from DB
  email?: string | null;
  phone?: string | null;
  memberCount: number; // capacity from DB
  facilities: string[];
  amenities: string[];
  activeEvents: number; // active_events from DB
  totalRevenue: number; // total_revenue from DB
  status: 'active' | 'inactive' | 'pending';
  joinedDate?: string | null; // joined_date from DB
  organizationId?: string | null;
  // Extended fields
  addressLine1?: string | null; // address_line1 from DB
  addressLine2?: string | null; // address_line2 from DB
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null; // country from DB
  addressLandmark?: string | null; // address_landmark from DB
  addressStandard?: string | null; // address_standard from DB
  areaSqFt?: number | null; // area_sq_ft from DB
  kindOfSpace?: string | null; // kind_of_space from DB
  isCovered?: boolean | null; // is_covered from DB
  pricingPerDay?: number | null; // pricing_per_day from DB
  facilityAreaSqFt?: number | null; // facility_area_sq_ft from DB
  noOfStalls?: number | null; // no_of_stalls from DB
  facilityCovered?: boolean | null; // facility_covered from DB
  noOfFlats?: number | null; // no_of_flats from DB
  availableHours?: string | null; // available_hours from DB
  parkingSpaces?: number | null; // parking_spaces from DB
  cateringAllowed?: boolean | null; // catering_allowed from DB
  alcoholAllowed?: boolean | null; // alcohol_allowed from DB
  smokingAllowed?: boolean | null; // smoking_allowed from DB
  // Google Maps fields
  latitude?: number | null;
  longitude?: number | null;
  formattedAddress?: string | null; // formatted_address from DB
  description?: string | null;
  photos?: Array<{ name: string; url: string; type: string; size: number }>| null; // photos from DB
  documents?: Array<{ name: string; url: string; type: string; size: number }>| null; // documents from DB
  // Custom Contact Information
  customContacts?: Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
  }> | null; // custom_contacts from DB
  // Bank Details
  bankName?: string | null; // bank_name from DB
  bankAccountNumber?: string | null; // bank_account_number from DB
  bankHolderName?: string | null; // bank_holder_name from DB
  bankIfsc?: string | null; // bank_ifsc from DB
  bankMicr?: string | null; // bank_micr from DB
  created_at: string;
  updated_at: string;
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'acknowledged' | 'cancelled';

export interface PurchaseOrderLine {
  id?: string;
  purchase_order_id?: string;
  line_no: number;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface PurchaseOrder {
  id: string;
  organization_id: string;
  event_id: string;
  vendor_id: string;
  po_number: string;
  status: PurchaseOrderStatus;
  currency: string;
  notes?: string | null;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  purchase_order_lines?: PurchaseOrderLine[];
}

export interface Vendor {
  id: string;
  name: string;
  category: 'sound_lights' | 'catering' | 'decoration' | 'security' | 'transportation' | 'housekeeping';
  city?: string | null;
  contactPerson?: string | null; // contact_person from DB
  email?: string | null;
  phone?: string | null;
  rating?: number | null;
  completedJobs: number; // completed_jobs from DB
  status: 'active' | 'inactive';
  priceRange?: string | null; // price_range from DB
  organizationId?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Exhibitor {
  id: string;
  organizationId?: string | null;
  // Personal Information (NEW - matching AddExhibitor Step 1)
  firstName?: string | null; // first_name from DB
  lastName?: string | null; // last_name from DB
  
  // Company Information
  companyName: string; // company_name from DB
  companyDescription?: string | null; // company_description from DB
  establishedYear?: string | null; // established_year from DB
  companySize?: string | null; // company_size from DB
  website?: string | null;
  
  // Contact Information
  contactPerson?: string | null; // contact_person from DB
  designation?: string | null;
  email?: string | null;
  phone?: string | null;
  alternatePhone?: string | null; // alternate_phone from DB
  alternateEmail?: string | null; // alternate_email from DB
  
  // Business Details
  category?: string | null;
  subCategory?: string | null; // sub_category from DB
  businessType?: string | null; // business_type from DB
  gstNumber?: string | null; // gst_number from DB
  panNumber?: string | null; // pan_number from DB
  businessDescription?: string | null; // business_description from DB
  
  // Location & Address (NEW - matching AddExhibitor Step 2)
  address?: string | null;
  address1?: string | null; // address1 from DB
  address2?: string | null; // address2 from DB
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  
  // Exhibition Details
  boothPreference?: string | null; // booth_preference from DB
  boothSize?: string | null; // booth_size from DB
  specialRequirements?: string | null; // special_requirements from DB
  previousExhibitions?: string | null; // previous_exhibitions from DB
  expectedVisitors?: string | null; // expected_visitors from DB
  
  // Products & Services
  products?: string[] | null;
  services?: string[] | null;
  targetAudience?: string | null; // target_audience from DB
  
  // Payment & Billing
  registrationFee?: number | null; // registration_fee from DB
  paymentMethod?: string | null; // payment_method from DB
  billingAddress?: string | null; // billing_address from DB
  
  // Additional Information
  socialMediaLinks?: {
    linkedin?: string | null;
    facebook?: string | null;
    twitter?: string | null;
    instagram?: string | null;
  } | null; // social_media_links from DB
  
  // Documents & Images (NEW - matching AddExhibitor Steps 4 & 5)
  documentUrls?: {
    panCard?: string | null;
    aadharCard?: string | null;
    licence?: string | null;
  } | null; // document_urls from DB
  imageUrls?: string[] | null; // image_urls from DB
  /** Primary cover image for listings / portfolio (portfolio_image_url from DB) */
  portfolioImageUrl?: string | null;

  // Settings
  status: 'registered' | 'confirmed' | 'checked_in' | 'cancelled';
  paymentStatus: 'pending' | 'paid' | 'refunded'; // payment_status from DB
  sendConfirmationEmail?: boolean | null; // send_confirmation_email from DB
  allowMarketingEmails?: boolean | null; // allow_marketing_emails from DB
  
  // Legacy fields
  booth?: string | null;
  registrationDate?: string | null; // registration_date from DB
  
  created_at: string;
  updated_at: string;
}

export interface Society {
  id: string;
  name: string;
  location: string;
  contactPerson: string;
  email: string;
  phone: string;
  memberCount: number;
  facilities: string[];
  activeEvents: number;
  totalRevenue: number;
  status: 'active' | 'inactive' | 'pending';
  joinedDate: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  totalEvents: number;
  activeEvents: number;
  totalVenues: number;
  totalVendors: number;
  totalExhibitors: number;
  monthlyRevenue: number;
  revenueGrowth: number;
  userGrowth: number;
}