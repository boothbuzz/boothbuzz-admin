import React, { useState } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  CheckCircle,
  Clock,
  Users,
  DollarSign,
  X,
  Save,
  AlertCircle,
  Upload,
  User,
  MapPin,
  FileText,
  Download,
  Building,
  XCircle,
  Mail,
  Globe,
  Phone,
  Calendar,
  CreditCard,
  Eye,
  Send,
  Filter,
  Info,
  ArrowLeft,
  AlertTriangle
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '../components/UI/Card';
import { Badge } from '../components/UI/Badge';
import { Button } from '../components/UI/Button';
import { PhoneInput } from '../components/UI/PhoneInput';
import { isValidIndianMobile } from '../utils/phone';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/UI/Table';
import { useExhibitors } from '../hooks/useSupabaseData';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../lib/apiClient';
import { csvFilename, downloadCsv } from '../lib/exportCsv';
import { uploadExhibitorPublicImage } from '../lib/exhibitorStorage';
import {
  exhibitorPortfolioDisplayUrl,
  parseExhibitorImageUrls,
  exhibitorUploadedImageUrls,
} from '../utils/exhibitorPortfolio';
import {
  ExhibitorStorageImage,
  LocalFileImagePreview,
} from '../components/Exhibitor/ExhibitorStorageImage';
import { getDefaultExhibitorProfileUrl, normalizePersistableImageUrl } from '../constants/exhibitorDefaultProfile';
import { normalizeExhibitorImageUrlsForWrite } from '../lib/exhibitorImageDb';
import statesData from '../data/states.json';

// Interface matching AddExhibitor exactly
interface ExhibitorFormData {
  id?: string;
  // Personal Information
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  alternatePhone: string;
  
  // Address
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  
  // Business Information
  companyName: string;
  website: string;
  category: string;
  subCategory: string;
  panNumber: string;
  gstNumber: string;
  boothSize: string;
  businessDescription: string;
  socialMediaLinks: {
    facebook: string;
    linkedin: string;
    instagram: string;
    twitter: string;
  };
  
  // Documents (supports both files and URLs)
  documents: {
    panCard: File | null;
    aadharCard: File | null;
    licence: File | null;
  };
  documentUrls?: {
    panCard?: string | null;
    aadharCard?: string | null;
    licence?: string | null;
  };
  
  // Images (supports both files and URLs)
  images: File[];
  imageUrls?: string[];
  portfolioImageUrl?: string;
  portfolioImage?: File | null;
  
  // Status
  status: 'interested' | 'approved' | 'declined';
  paymentStatus: 'pending' | 'paid' | 'refunded';
}

interface ExhibitorFilters {
  status: string;
  paymentStatus: string;
  category: string;
  subCategory: string;
  city: string;
  search: string;
}

interface EventSubcategoryRow {
  name: string;
  sort_order: number;
}

interface EventCategoryRow {
  name: string;
  sort_order: number;
  event_subcategories?: EventSubcategoryRow[];
}

const boothSizes = ['3x3 meters', '3x6 meters', '6x6 meters', '6x9 meters', '9x9 meters', 'Custom Size'];
// States and cities are now loaded from JSON data

/** When first_name/last_name are empty in DB, derive from contact_person or company so form state matches what the user sees (avoids false "required" errors). */
function resolveEditPersonalNames(exhibitor: {
  firstName?: string;
  lastName?: string;
  contactPerson?: string | null;
  companyName?: string;
}): { firstName: string; lastName: string } {
  const first = (exhibitor.firstName || '').trim();
  const last = (exhibitor.lastName || '').trim();
  if (first || last) {
    return { firstName: first, lastName: last };
  }
  const cp = (exhibitor.contactPerson || '').trim();
  if (cp) {
    const parts = cp.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
    }
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  }
  const company = (exhibitor.companyName || '').trim();
  if (company) {
    const parts = company.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
    }
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  }
  return { firstName: '', lastName: '' };
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function exhibitorMatchesSearch(
  exhibitor: {
    companyName?: string | null;
    contactPerson?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    alternatePhone?: string | null;
    city?: string | null;
    state?: string | null;
    category?: string | null;
    subCategory?: string | null;
    panNumber?: string | null;
    gstNumber?: string | null;
    website?: string | null;
  },
  query: string,
): boolean {
  const term = normalizeSearchText(query);
  if (!term) return true;

  const fullName = [exhibitor.firstName, exhibitor.lastName].map(normalizeSearchText).filter(Boolean).join(' ');
  const haystack = [
    exhibitor.companyName,
    exhibitor.contactPerson,
    fullName,
    exhibitor.firstName,
    exhibitor.lastName,
    exhibitor.email,
    exhibitor.phone,
    exhibitor.alternatePhone,
    exhibitor.city,
    exhibitor.state,
    exhibitor.category,
    exhibitor.subCategory,
    exhibitor.panNumber,
    exhibitor.gstNumber,
    exhibitor.website,
  ]
    .map(normalizeSearchText)
    .filter(Boolean)
    .join(' ');

  const words = term.split(/\s+/).filter(Boolean);
  return words.every((word) => haystack.includes(word));
}

/** Comma-separated sub_category: trim segments, drop empties, dedupe (order preserved). */
function normalizeSubCategoriesCsv(raw: string | null | undefined): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (!seen.has(part)) {
      seen.add(part);
      out.push(part);
    }
  }
  return out.join(', ');
}

/**
 * Map saved sub-category labels to canonical names from event_subcategories so checkboxes match.
 * Case-insensitive match; drops duplicate canonical entries.
 */
function reconcileSubCategoriesToCanonical(savedCsv: string, canonicalList: string[]): string {
  const saved = normalizeSubCategoriesCsv(savedCsv)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!canonicalList.length) return saved.join(', ');
  const seen = new Set<string>();
  const out: string[] = [];
  const lowerMap = new Map<string, string>();
  for (const c of canonicalList) {
    lowerMap.set(c.toLowerCase(), c);
  }
  for (const s of saved) {
    const exact = canonicalList.find((c) => c === s);
    const use = exact || lowerMap.get(s.toLowerCase()) || s;
    if (!seen.has(use)) {
      seen.add(use);
      out.push(use);
    }
  }
  return out.join(', ');
}

// File handling functions (stores placeholder data since no storage exists)
const handleDocumentUpload = async (file: File, fileName: string): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const filePath = `${fileName}.${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await apiClient.storage
      .from('exhibitor-documents')
      .upload(filePath, file, {
        upsert: true
      });

    if (error) {
      console.error('Error uploading document:', error);
      return null;
    }

    // Get signed URL since bucket is not public
    const { data: signedUrl, error: signedError } = await apiClient.storage
      .from('exhibitor-documents')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (signedError) {
      console.error('Error creating signed URL for document:', signedError);
      return null;
    }

    console.log(`📄 Document uploaded successfully:`, signedUrl.signedUrl);
    return signedUrl.signedUrl;
  } catch (error) {
    console.error('Error uploading document:', error);
    return null;
    }
};

const handleImageUploads = async (images: File[], exhibitorName: string): Promise<string[]> => {
  const uploadedUrls: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const { url, error } = await uploadExhibitorPublicImage(
      images[i],
      'gallery',
      `${exhibitorName}_edit_${i + 1}`
    );
    if (url) uploadedUrls.push(url);
    else console.error(`Edit gallery image ${i + 1} upload failed:`, error);
  }
  return uploadedUrls;
};

export const Exhibitors: React.FC = () => {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const { exhibitors, loading, error, refetch } = useExhibitors();
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<Record<string, string[]>>({});
  
  // DEBUG: Log all exhibitors' document/image status
  React.useEffect(() => {
    if (exhibitors.length > 0) {
      console.log('🔍 ALL EXHIBITORS DOCUMENT/IMAGE STATUS:');
      exhibitors.forEach((exhibitor, index) => {
        console.log(`${index + 1}. ${exhibitor.companyName || 'Unknown Company'}:`, {
          id: exhibitor.id,
          documentUrls: exhibitor.documentUrls,
          imageUrls: exhibitor.imageUrls,
          hasDocuments: !!(exhibitor.documentUrls?.panCard || exhibitor.documentUrls?.aadharCard || exhibitor.documentUrls?.licence),
          hasImages: Array.isArray(exhibitor.imageUrls) && exhibitor.imageUrls.length > 0
        });
      });
    }
  }, [exhibitors]);
  
  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStep, setEditStep] = useState(1);
  const [editData, setEditData] = useState<ExhibitorFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    alternatePhone: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    companyName: '',
    website: '',
    category: '',
    subCategory: '',
    panNumber: '',
    gstNumber: '',
    boothSize: '',
    businessDescription: '',
    socialMediaLinks: {
      facebook: '',
      linkedin: '',
      instagram: '',
      twitter: ''
    },
    documents: {
      panCard: null,
      aadharCard: null,
      licence: null
    },
    images: [],
    portfolioImageUrl: '',
    portfolioImage: null,
    status: 'interested',
    paymentStatus: 'pending'
  });
  const [editErrors, setEditErrors] = useState<{[key: string]: string}>({});
  const [saving, setSaving] = useState(false);
  
  // Missing state variables
  const [selectedExhibitors, setSelectedExhibitors] = useState<string[]>([]);
  const [selectedExhibitor, setSelectedExhibitor] = useState<any>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editFormData, setEditFormData] = useState<any>(null);
  const [emailFormData, setEmailFormData] = useState({ subject: '', message: '', sendCopy: false });
  const [newProduct, setNewProduct] = useState('');
  const [newService, setNewService] = useState('');
  const [existingDocuments, setExistingDocuments] = useState<{[key: string]: string}>({});
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const editSubCategories = editFormData?.category ? (subCategoryOptions[editFormData.category] || []) : [];
  const selectedEditSubCategories = (editFormData?.subCategory || '')
    .split(',')
    .map((v: string) => v.trim())
    .filter(Boolean);

  const toggleEditSubCategory = (subCategory: string) => {
    if (!editFormData) return;
    const next = selectedEditSubCategories.includes(subCategory)
      ? selectedEditSubCategories.filter((v: string) => v !== subCategory)
      : [...selectedEditSubCategories, subCategory];
    const nextValue = normalizeSubCategoriesCsv(next.join(', '));
    setEditFormData({ ...editFormData, subCategory: nextValue });
    validateField('subCategory', nextValue);
  };
  
  // Filters
  const [filters, setFilters] = useState<ExhibitorFilters>({
    status: 'all',
    paymentStatus: 'all',
    category: 'all',
    search: '',
    subCategory: 'all',
    city: 'all'
  });

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transform transition-all duration-300 translate-x-full ${
      type === 'success' ? 'bg-green-500 text-white' :
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

  React.useEffect(() => {
    const loadEventTaxonomy = async () => {
      const { data, error } = await apiClient
        .from('event_categories')
        .select('name, sort_order, event_subcategories(name, sort_order)')
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('Failed to load event categories:', error);
        return;
      }

      const categories = (data || []) as EventCategoryRow[];
      setCategoryOptions(categories.map((c) => c.name));

      const subCategoryMap: Record<string, string[]> = {};
      categories.forEach((category) => {
        const sortedSubs = [...(category.event_subcategories || [])].sort(
          (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
        );
        subCategoryMap[category.name] = sortedSubs.map((sub) => sub.name);
      });
      setSubCategoryOptions(subCategoryMap);
    };

    loadEventTaxonomy();
  }, []);

  // When taxonomy loads (or edit modal opens), align saved sub_category text with canonical option labels so checkboxes show selected and toggles don't duplicate entries.
  React.useEffect(() => {
    if (!showEditModal) return;
    setEditFormData((prev: any) => {
      if (!prev?.category) return prev;
      const canon = subCategoryOptions[prev.category];
      if (!canon?.length) return prev;
      const normalized = normalizeSubCategoriesCsv(prev.subCategory || '');
      const reconciled = reconcileSubCategoriesToCanonical(normalized, canon);
      return reconciled === normalized ? prev : { ...prev, subCategory: reconciled };
    });
  }, [showEditModal, subCategoryOptions, editFormData?.id, editFormData?.category]);

  const filteredExhibitors = exhibitors.filter(exhibitor => {
    const matchesStatus = filters.status === 'all' || exhibitor.status === filters.status;
    const matchesPayment = filters.paymentStatus === 'all' || exhibitor.paymentStatus === filters.paymentStatus;
    const matchesCategory = filters.category === 'all' || exhibitor.category === filters.category;
    const exhibitorSubCategories = (exhibitor.subCategory || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
    const matchesSubCategory = filters.subCategory === 'all' || exhibitorSubCategories.includes(filters.subCategory);
    const matchesCity = filters.city === 'all' || exhibitor.city === filters.city;
    const matchesSearch = exhibitorMatchesSearch(exhibitor, filters.search);

    return matchesStatus && matchesPayment && matchesCategory && matchesSubCategory && matchesCity && matchesSearch;
  });

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'interested': return 'info';
      case 'approved': return 'success';
      case 'declined': return 'error';
      default: return 'warning';
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'interested': return <Clock className="h-4 w-4" />;
      case 'approved': return <CheckCircle className="h-4 w-4" />;
      case 'declined': return <XCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  // const stats = {
  //   total: exhibitors.length,
  //   interested: exhibitors.filter(e => e.status === 'interested').length,
  //   approved: exhibitors.filter(e => e.status === 'approved').length,
  //   declined: exhibitors.filter(e => e.status === 'declined').length,
  //   paidAmount: exhibitors.filter(e => e.paymentStatus === 'paid').length * 15000,
  //   pendingAmount: exhibitors.filter(e => e.paymentStatus === 'pending').length * 15000
  // };

  const categories = [...new Set(exhibitors.map(e => e.category))];
  const cities = [...new Set(exhibitors.map(e => e.city))];



  const businessTypes = ['Private Limited', 'Public Limited', 'Partnership', 'Sole Proprietorship', 'LLP', 'NGO', 'Government'];
  const boothSizes = ['3x3 meters', '3x6 meters', '6x6 meters', '6x9 meters', '9x9 meters', 'Custom Size'];
  // States are now loaded from JSON data

  const handleSelectExhibitor = (id: string) => {
    setSelectedExhibitors(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedExhibitors.length === filteredExhibitors.length) {
      setSelectedExhibitors([]);
    } else {
      setSelectedExhibitors(filteredExhibitors.map(e => e.id));
    }
  };

  const exportExhibitorsToCsv = (items: typeof exhibitors) => {
    const headers = [
      'Company Name',
      'Contact Person',
      'Email',
      'Phone',
      'City',
      'State',
      'Category',
      'Sub Category',
      'Status',
      'Payment Status',
      'Booth Size',
      'Registration Date',
      'Website',
    ];

    const rows = items.map((exhibitor) => [
      exhibitor.companyName || '',
      exhibitor.contactPerson ||
        `${exhibitor.firstName || ''} ${exhibitor.lastName || ''}`.trim(),
      exhibitor.email || '',
      exhibitor.phone || '',
      exhibitor.city || '',
      exhibitor.state || '',
      exhibitor.category || '',
      exhibitor.subCategory || '',
      exhibitor.status || '',
      exhibitor.paymentStatus || '',
      exhibitor.boothSize || '',
      exhibitor.registrationDate
        ? new Date(exhibitor.registrationDate).toLocaleDateString()
        : '',
      exhibitor.website || '',
    ]);

    const ok = downloadCsv(csvFilename('exhibitors-export'), headers, rows);
    if (!ok) {
      showNotification('No exhibitor data to export.', 'info');
    }
    return ok;
  };

  const handleExport = () => {
    if (exportExhibitorsToCsv(filteredExhibitors)) {
      showNotification(`Exported ${filteredExhibitors.length} exhibitor(s).`, 'success');
    }
  };

  const handleBulkAction = (action: string) => {
    if (action === 'export') {
      const toExport =
        selectedExhibitors.length > 0
          ? filteredExhibitors.filter((e) => selectedExhibitors.includes(e.id))
          : filteredExhibitors;
      if (exportExhibitorsToCsv(toExport)) {
        showNotification(`Exported ${toExport.length} exhibitor(s).`, 'success');
      }
      setSelectedExhibitors([]);
      return;
    }

    console.log(`Bulk action: ${action} for exhibitors:`, selectedExhibitors);
    setSelectedExhibitors([]);
  };

  const handleView = (exhibitor: any) => {
    setSelectedExhibitor(exhibitor);
    setShowViewModal(true);
  };

  const handleEdit = (exhibitor: any) => {
    if (!isSuperAdmin) {
      showNotification('Only Super Admin can edit exhibitors.', 'error');
      return;
    }
    console.log('🔍 Edit exhibitor called with data:', exhibitor);
    console.log('📄 Document URLs:', exhibitor.documentUrls);
    console.log('🖼️ Image URLs:', exhibitor.imageUrls);
    setSelectedExhibitor(exhibitor);
    
    // Set existing documents and images for display
    const docUrls = {
      panCard: exhibitor.documentUrls?.panCard || '',
      aadharCard: exhibitor.documentUrls?.aadharCard || '',
      licence: exhibitor.documentUrls?.licence || ''
    };
    console.log('📋 Setting existingDocuments:', docUrls);
    setExistingDocuments(docUrls);
    
    const imgUrls = parseExhibitorImageUrls(exhibitor.imageUrls ?? (exhibitor as { image_urls?: unknown }).image_urls);
    console.log('🖼️ Setting existingImages:', imgUrls);
    setExistingImages(imgUrls);

    const { firstName: resolvedFirstName, lastName: resolvedLastName } = resolveEditPersonalNames(exhibitor);
    setEditErrors({});

    // Map Exhibitor to ExtendedExhibitorFormData with NEW structure matching AddExhibitor exactly
    setEditFormData({
      id: exhibitor.id,
      
      // Personal Information (Step 1 - matching AddExhibitor)
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      email: exhibitor.email || '',
      phone: exhibitor.phone || '',
      alternatePhone: exhibitor.alternatePhone || '',
      
      // Address (Step 2 - matching AddExhibitor)
      address1: exhibitor.address1 || '',
      address2: exhibitor.address2 || '',
      city: exhibitor.city || '',
      state: exhibitor.state || '',
      pincode: exhibitor.pincode || '',
      country: exhibitor.country || 'India',
      
      // Business Information (Step 3 - matching AddExhibitor)
      companyName: exhibitor.companyName || '',
      website: exhibitor.website || '',
      category: exhibitor.category || '',
      subCategory: normalizeSubCategoriesCsv(
        exhibitor.subCategory ?? exhibitor.sub_category ?? ''
      ),
      panNumber: exhibitor.panNumber || '',
      gstNumber: exhibitor.gstNumber || '',
      boothSize: exhibitor.boothSize || '',
      businessDescription: exhibitor.businessDescription || '',
      socialMediaLinks: {
        facebook: exhibitor.socialMediaLinks?.facebook || '',
        linkedin: exhibitor.socialMediaLinks?.linkedin || '',
        instagram: exhibitor.socialMediaLinks?.instagram || '',
        twitter: exhibitor.socialMediaLinks?.twitter || ''
      },
      
      // Documents (Step 4 - matching AddExhibitor)
      documents: {
        panCard: null,
        aadharCard: null,
        licence: null
      },
      documentUrls: exhibitor.documentUrls || {
        panCard: null,
        aadharCard: null,
        licence: null
      },
      
      // Upload Images (Step 5 - matching AddExhibitor)
      images: [],
      imageUrls: imgUrls,
      portfolioImageUrl: exhibitor.portfolioImageUrl || '',
      portfolioImage: null,

      // Settings
      status: exhibitor.status || 'interested',
      paymentStatus: exhibitor.paymentStatus || 'pending',
      sendConfirmationEmail: exhibitor.sendConfirmationEmail === true,
      allowMarketingEmails: exhibitor.allowMarketingEmails === true,
      
      // ========== LEGACY FIELDS (COMMENTED OUT - NOT IN ADDEXHIBITOR) ==========
      // products: exhibitor.products || [],
      // services: exhibitor.services || [],
      // companyDescription: exhibitor.companyDescription || '',
      // establishedYear: exhibitor.establishedYear || '',
      // companySize: exhibitor.companySize || '',
      // designation: exhibitor.designation || '',
      // alternateEmail: exhibitor.alternateEmail || '',
      // businessType: exhibitor.businessType || '',
      // boothPreference: exhibitor.boothPreference || '',
      // specialRequirements: exhibitor.specialRequirements || '',
      // previousExhibitions: exhibitor.previousExhibitions || '',
      // expectedVisitors: exhibitor.expectedVisitors || '',
      // targetAudience: exhibitor.targetAudience || '',
      // registrationFee: exhibitor.registrationFee || 15000,
      // paymentMethod: exhibitor.paymentMethod || 'online',
      // billingAddress: exhibitor.billingAddress || '',
      // contactPerson: exhibitor.contactPerson || '',
      // address: exhibitor.address || '',
    });
    setEditStep(1);
    setShowEditModal(true);
  };

  const handleEmail = (exhibitor: any) => {
    setSelectedExhibitor(exhibitor);
    setEmailFormData({
      subject: `Regarding your exhibition at our upcoming event`,
      message: `Dear ${exhibitor.contactPerson},\n\nWe hope this email finds you well. We are writing to you regarding your participation in our upcoming exhibition event.\n\nBest regards,\nEvent Management Team`,
      sendCopy: false
    });
    setShowEmailModal(true);
  };

  const handleDelete = (exhibitor: any) => {
    if (!isSuperAdmin) {
      showNotification('Only Super Admin can delete exhibitors.', 'error');
      return;
    }
    setSelectedExhibitor(exhibitor);
    setShowDeleteModal(true);
  };

  const handleSaveEdit = async () => {
    if (!isSuperAdmin) {
      showNotification('Only Super Admin can edit exhibitors.', 'error');
      return;
    }
    if (editFormData) {
      if (!validateEditMandatoryFields()) {
        showNotification('Please complete required fields: name, email, phone, company, and main category.', 'error');
        return;
      }
      console.log('Starting exhibitor update with data:', editFormData);
      
      try {
        // Create exhibitor name for file naming
        const exhibitorName = `${editFormData.firstName}_${editFormData.lastName}_${editFormData.companyName}`.replace(/\s+/g, '_');
        
        // Upload new documents to Supabase Storage (keeping existing ones)
        const documentUrls: { [key: string]: string } = { ...existingDocuments };
        
        if (editFormData.documents.panCard) {
          console.log('📄 Processing new PAN Card...');
          const panCardUrl = await handleDocumentUpload(editFormData.documents.panCard, `${exhibitorName}_pan_card`);
          if (panCardUrl) documentUrls.panCard = panCardUrl;
        }
        
        if (editFormData.documents.aadharCard) {
          console.log('📄 Processing new Aadhar Card...');
          const aadharCardUrl = await handleDocumentUpload(editFormData.documents.aadharCard, `${exhibitorName}_aadhar_card`);
          if (aadharCardUrl) documentUrls.aadharCard = aadharCardUrl;
        }
        
        if (editFormData.documents.licence) {
          console.log('📄 Processing new Licence...');
          const licenceUrl = await handleDocumentUpload(editFormData.documents.licence, `${exhibitorName}_licence`);
          if (licenceUrl) documentUrls.licence = licenceUrl;
        }
        
        // Process new images (keeping existing ones); drop blob previews and invalid entries
        let imageUrls = normalizeExhibitorImageUrlsForWrite([...existingImages]);
        if (editFormData.images.length > 0) {
          console.log('🖼️ Processing new images...');
          const newImageUrls = await handleImageUploads(editFormData.images, exhibitorName);
          if (newImageUrls.length !== editFormData.images.length) {
            showNotification(
              `Only ${newImageUrls.length} of ${editFormData.images.length} new images uploaded. Check Storage bucket "exhibitor-images" and policies.`,
              'error'
            );
            setSaving(false);
            return;
          }
          imageUrls = normalizeExhibitorImageUrlsForWrite([...imageUrls, ...newImageUrls]);
        }

        console.log('📋 Final documentUrls:', documentUrls);
        console.log('🖼️ Final imageUrls:', imageUrls);

        let portfolio_image_url: string | null = normalizePersistableImageUrl(editFormData.portfolioImageUrl);
        if (editFormData.portfolioImage) {
          const pr = await uploadExhibitorPublicImage(
            editFormData.portfolioImage,
            'portfolio',
            `${exhibitorName}_portfolio`
          );
          if (pr.url) portfolio_image_url = pr.url;
          else {
            showNotification(
              pr.error || 'Portfolio image upload failed. Check Storage bucket "exhibitor-images".',
              'error'
            );
            setSaving(false);
            return;
          }
        }
        if (!portfolio_image_url && imageUrls.length > 0) {
          portfolio_image_url = imageUrls[0];
        }
        if (!portfolio_image_url) {
          portfolio_image_url = getDefaultExhibitorProfileUrl();
        }

      const updateData = {
        // Personal Information (NEW - matching AddExhibitor Step 1)
        first_name: editFormData.firstName,
        last_name: editFormData.lastName,
        email: editFormData.email,
        phone: editFormData.phone,
        alternate_phone: editFormData.alternatePhone,
        
        // Address (NEW - matching AddExhibitor Step 2)
        address1: editFormData.address1,
        address2: editFormData.address2,
        city: editFormData.city,
        state: editFormData.state,
        pincode: editFormData.pincode,
        country: editFormData.country,
        
        // Business Information (NEW - matching AddExhibitor Step 3)
        company_name: editFormData.companyName,
        website: editFormData.website,
        category: editFormData.category,
        sub_category: editFormData.subCategory,
        pan_number: editFormData.panNumber,
        gst_number: editFormData.gstNumber,
        booth_size: editFormData.boothSize,
        business_description: editFormData.businessDescription,
        social_media_links: {
          facebook: editFormData.socialMediaLinks.facebook,
          linkedin: editFormData.socialMediaLinks.linkedin,
          instagram: editFormData.socialMediaLinks.instagram,
          twitter: editFormData.socialMediaLinks.twitter
        },
        
        // Document URLs (NEW - matching AddExhibitor)
        document_urls: documentUrls,
        
        // Image URLs (NEW - matching AddExhibitor)
        image_urls: imageUrls,
        portfolio_image_url,

        // Settings
        status: editFormData.status,
        payment_status: editFormData.paymentStatus,
        send_confirmation_email: editFormData.sendConfirmationEmail,
        allow_marketing_emails: editFormData.allowMarketingEmails
        
        // ========== LEGACY FIELDS (COMMENTED OUT - NOT IN ADDEXHIBITOR) ==========
        // company_description: editFormData.companyDescription,
        // established_year: editFormData.establishedYear,
        // company_size: editFormData.companySize,
        // contact_person: editFormData.contactPerson,
        // designation: editFormData.designation,
        // alternate_email: editFormData.alternateEmail,
        // business_type: editFormData.businessType,
        // address: editFormData.address,
        // booth_preference: editFormData.boothPreference,
        // special_requirements: editFormData.specialRequirements,
        // previous_exhibitions: editFormData.previousExhibitions,
        // expected_visitors: editFormData.expectedVisitors,
        // products: editFormData.products,
        // services: editFormData.services,
        // target_audience: editFormData.targetAudience,
        // registration_fee: editFormData.registrationFee,
        // payment_method: editFormData.paymentMethod,
        // billing_address: editFormData.billingAddress,
      };
      
      console.log('Update data being sent:', updateData);
      console.log('Updating exhibitor ID:', editFormData.id);

        const { data, error } = await apiClient
          .from('exhibitors')
          .update(updateData)
          .eq('id', editFormData.id)
          .select();

        if (error) {
          console.error('Supabase update error:', error);
          showNotification('Failed to update exhibitor: ' + error.message, 'error');
        } else {
          console.log('Update successful - returned data:', data);
          console.log('Number of rows updated:', data?.length || 0);
          console.log('Updated exhibitor data:', data?.[0]);
          
          showNotification('Exhibitor updated successfully!', 'success');
          setShowEditModal(false);
          setEditFormData(null);
          setSelectedExhibitor(null);
          
          // Force a refetch with a small delay to ensure database has updated
          setTimeout(() => {
            console.log('Refetching exhibitor data...');
            refetch();
          }, 500);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        showNotification('Unexpected error occurred: ' + err, 'error');
      }
    } else {
      console.error('No editFormData available');
      showNotification('No data to update', 'error');
    }
  };

  const handleSendEmail = () => {
    // Simulate email sending
    showNotification('Email sent successfully!', 'success');
    setShowEmailModal(false);
    setSelectedExhibitor(null);
  };

  const handleConfirmDelete = async () => {
    if (!isSuperAdmin) {
      showNotification('Only Super Admin can delete exhibitors.', 'error');
      setShowDeleteModal(false);
      return;
    }
    if (selectedExhibitor) {
      const { error } = await apiClient
        .from('exhibitors')
        .delete()
        .eq('id', selectedExhibitor.id);

      if (error) {
        showNotification('Failed to delete exhibitor: ' + error.message, 'error');
      } else {
        showNotification('Exhibitor deleted successfully!', 'success');
        setShowDeleteModal(false);
        setSelectedExhibitor(null);
        refetch();
      }
    }
  };

  const closeModals = () => {
    setShowViewModal(false);
    setShowEditModal(false);
    setShowEmailModal(false);
    setShowDeleteModal(false);
    setSelectedExhibitor(null);
    setEditFormData(null);
    setEditStep(1);
    setEditErrors({});
    setEmailFormData({ subject: '', message: '', sendCopy: false });
    setNewProduct('');
    setNewService('');
  };

  const addProduct = () => {
    if (newProduct.trim() && editFormData && !editFormData.products.includes(newProduct.trim())) {
      setEditFormData((prev: any) => prev ? {
        ...prev,
        products: [...prev.products, newProduct.trim()]
      } : null);
      setNewProduct('');
    }
  };

  const removeProduct = (index: number) => {
    if (editFormData) {
      setEditFormData({
        ...editFormData,
        products: editFormData.products.filter((_: any, i: any) => i !== index)
      });
    }
  };

  const addService = () => {
    if (newService.trim() && editFormData && !editFormData.services.includes(newService.trim())) {
      setEditFormData((prev: any) => prev ? {
        ...prev,
        services: [...prev.services, newService.trim()]
      } : null);
      setNewService('');
    }
  };

  const removeService = (index: number) => {
    if (editFormData) {
      setEditFormData({
        ...editFormData,
        services: editFormData.services.filter((_: any, i: any) => i !== index)
      });
    }
  };

  const validateEditMandatoryFields = (): boolean => {
    if (!editFormData) return false;
    const errors: { [key: string]: string } = {};
    if (!editFormData.firstName?.trim()) errors.firstName = 'First name is required';
    if (!editFormData.lastName?.trim()) errors.lastName = 'Last name is required';
    if (!editFormData.email?.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editFormData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    if (!editFormData.phone?.trim()) errors.phone = 'Phone number is required';
    else if (!isValidIndianMobile(editFormData.phone)) {
      errors.phone = 'Contact number must be exactly 10 digits';
    }
    if (editFormData.alternatePhone?.trim() && !isValidIndianMobile(editFormData.alternatePhone)) {
      errors.alternatePhone = 'Alternate contact number must be exactly 10 digits';
    }
    if (!editFormData.companyName?.trim()) errors.companyName = 'Company name is required';
    if (!editFormData.category?.trim()) errors.category = 'Main category is required';
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateEditStep = (step: number): boolean => {
    if (!editFormData) {
      return false;
    }

    if (step === 1) {
      return validateEditMandatoryFields();
    }

    if (step === 2 || step === 4 || step === 5 || step === 6) {
      setEditErrors({});
      return true;
    }

    if (step === 3) {
      const errors: { [key: string]: string } = {};
      if (editFormData.panNumber?.trim()) {
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        if (!panRegex.test(editFormData.panNumber.trim())) {
          errors.panNumber = 'PAN number must be in format: ABCDE1234F';
        }
      }
      if (editFormData.gstNumber?.trim()) {
        const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        if (!gstRegex.test(editFormData.gstNumber.trim())) {
          errors.gstNumber = 'GST number must be in format: 22AAAAA0000A1Z5';
        }
      }
      setEditErrors(errors);
      return Object.keys(errors).length === 0;
    }

    return true;
  };

  const clearFieldError = (fieldName: string) => {
    setEditErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[fieldName];
      return newErrors;
    });
  };

  const validateField = (fieldName: string, value: string, validationType?: string) => {
    let isValid = true;
    let errorMessage = '';

    // Handle empty or null values
    const trimmedValue = value?.trim() || '';

    switch (fieldName) {
      case 'firstName':
      case 'lastName':
      case 'address1':
      case 'city':
      case 'state':
      case 'country':
      case 'subCategory':
      case 'boothSize':
        break;

      case 'companyName':
        if (!trimmedValue) {
          isValid = false;
          errorMessage = 'Company name is required';
        }
        break;

      case 'category':
        if (!trimmedValue) {
          isValid = false;
          errorMessage = 'Main category is required';
        }
        break;

      case 'pincode':
        if (trimmedValue && !/^[0-9]{6}$/.test(trimmedValue)) {
          isValid = false;
          errorMessage = 'Pin code must be exactly 6 digits';
        }
        break;

      case 'email':
        if (!trimmedValue) {
          isValid = false;
          errorMessage = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedValue)) {
          isValid = false;
          errorMessage = 'Please enter a valid email address';
        }
        break;

      case 'phone':
        if (!trimmedValue) {
          isValid = false;
          errorMessage = 'Phone number is required';
        } else {
          const clean = trimmedValue.replace(/[\s\-\(\)]/g, '');
          if (clean.length !== 10 || !/^[0-9]{10}$/.test(clean)) {
            isValid = false;
            errorMessage = 'Contact number must be exactly 10 digits';
          }
        }
        break;

      case 'panNumber':
        if (trimmedValue) {
          const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
          if (!panRegex.test(trimmedValue)) {
            isValid = false;
            errorMessage = 'PAN number must be in format: ABCDE1234F';
          }
        }
        break;

      case 'gstNumber':
        if (trimmedValue) {
          const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
          if (!gstRegex.test(trimmedValue)) {
            isValid = false;
            errorMessage = 'GST number must be in format: 22AAAAA0000A1Z5';
          }
        }
        break;
    }

    if (isValid) {
      clearFieldError(fieldName);
    } else {
      setEditErrors(prev => ({ ...prev, [fieldName]: errorMessage }));
    }

    return isValid;
  };

  const nextEditStep = () => {
    if (validateEditStep(editStep)) {
      setEditStep((prev: any) => Math.min(prev + 1, 6));
      setEditErrors({});
    } else {
      showNotification(
        editStep === 1
          ? 'Please complete required fields: name, email, phone, company, and main category.'
          : 'Please fix the highlighted fields before continuing.',
        'error'
      );
    }
  };

  const skipOptionalEditToReview = () => {
    if (validateEditMandatoryFields()) {
      setEditStep(6);
      setEditErrors({});
    } else {
      showNotification('Please complete required fields: name, email, phone, company, and main category.', 'error');
    }
  };

  const prevEditStep = () => {
    setEditStep((prev: any) => Math.max(prev - 1, 1));
  };



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Exhibitor Management</h1>
          <p className="text-gray-600">Manage exhibitor registrations, booth assignments, and payments</p>
        </div>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
          <Button
            variant="outline"
            className="flex items-center space-x-2 w-full sm:w-auto justify-center"
            onClick={handleExport}
            disabled={filteredExhibitors.length === 0}
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </Button>
          <Link to="/exhibitors/add">
            <Button className="flex items-center space-x-2 w-full sm:w-auto justify-center">
              <Plus className="h-4 w-4" />
              <span>Add Exhibitor</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {/* <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              <Building className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs sm:text-sm text-gray-600">Total Exhibitors</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-green-600">{stats.confirmed}</div>
            <div className="text-xs sm:text-sm text-gray-600">Confirmed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-blue-600">{stats.interested}</div>
            <div className="text-xs sm:text-sm text-gray-600">Interested</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-purple-600">{stats.checkedIn}</div>
            <div className="text-xs sm:text-sm text-gray-600">Checked In</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              <XCircle className="h-5 w-5 sm:h-6 sm:w-6 text-red-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-red-600">{stats.cancelled}</div>
            <div className="text-xs sm:text-sm text-gray-600">Cancelled</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-green-600">₹{(stats.paidAmount / 100000).toFixed(1)}L</div>
            <div className="text-xs sm:text-sm text-gray-600">Paid Amount</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-yellow-600">₹{(stats.pendingAmount / 100000).toFixed(1)}L</div>
            <div className="text-xs sm:text-sm text-gray-600">Pending Amount</div>
          </CardContent>
        </Card>
      </div> */}

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
            <div className="lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search exhibitors..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="interested">Interested</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
            </select>
            <select
              value={filters.paymentStatus}
              onChange={(e) => setFilters(prev => ({ ...prev, paymentStatus: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Payments</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
            </select>
            <select
              value={filters.category}
              onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Categories</option>
              {categories.map(category => (
                <option key={category || ''} value={category || ''}>{category || ''}</option>
              ))}
            </select>
            <select
              value={filters.subCategory}
              onChange={(e) => setFilters(prev => ({ ...prev, subCategory: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Sub Categories</option>
              {[...new Set(exhibitors
                .filter(e => filters.category === 'all' || e.category === filters.category)
                .flatMap(e => (e.subCategory || '').split(',').map(v => v.trim()))
                .filter(Boolean))].map(subCategory => (
                <option key={subCategory || ''} value={subCategory || ''}>{subCategory || ''}</option>
              ))}
            </select>
            <select
              value={filters.city}
              onChange={(e) => setFilters(prev => ({ ...prev, city: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Cities</option>
              {cities.map(city => (
                <option key={city || ''} value={city || ''}>{city || ''}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedExhibitors.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-blue-900">
                  {selectedExhibitors.length} exhibitor(s) selected
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => handleBulkAction('confirm')}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Confirm
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulkAction('email')}>
                  <Mail className="h-4 w-4 mr-1" />
                  Send Email
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulkAction('export')}>
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedExhibitors([])}>
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Exhibitors Table */}
      <Card>
        {/* <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">
              Exhibitors Overview ({filteredExhibitors.length})
            </h3>
            <div className="flex space-x-2">
              <Button size="sm" variant="outline">
                <Filter className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Advanced Filters</span>
              </Button>
            </div>
          </div>
        </CardHeader> */}
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={selectedExhibitors.length === filteredExhibitors.length && filteredExhibitors.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </TableHead>
                <TableHead className="w-20">Portfolio</TableHead>
                                    <TableHead>Company</TableHead>
                    <TableHead>Contact Person</TableHead>
                    <TableHead className="hidden md:table-cell">Category</TableHead>
                    <TableHead className="hidden lg:table-cell">Sub Category</TableHead>
                    {/* <TableHead className="hidden xl:table-cell">Booth</TableHead> */}
                    <TableHead className="hidden 2xl:table-cell">Registration Date</TableHead>
                    <TableHead>Status</TableHead>
                    {/* <TableHead>Payment</TableHead> */}
                    <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center">
                    Loading exhibitors...
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-red-500">
                    Error loading exhibitors: {error}
                  </TableCell>
                </TableRow>
              ) : (
                filteredExhibitors.map(exhibitor => (
                  <TableRow key={exhibitor.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedExhibitors.includes(exhibitor.id)}
                        onChange={() => handleSelectExhibitor(exhibitor.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </TableCell>
                    <TableCell className="align-middle">
                      <ExhibitorStorageImage
                        src={exhibitorPortfolioDisplayUrl({
                          portfolioImageUrl: exhibitor.portfolioImageUrl,
                          imageUrls: exhibitor.imageUrls,
                          companyName: exhibitor.companyName,
                          id: exhibitor.id,
                        })}
                        alt=""
                        className="h-12 w-12 rounded-lg object-cover border border-gray-200 bg-gray-100"
                        loading="lazy"
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium text-gray-900 line-clamp-1">{exhibitor.companyName}</div>
                        <div className="text-sm text-gray-500 flex items-center">
                          <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span className="truncate">{exhibitor.city}</span>
                        </div>
                        <div className="text-sm text-gray-500 md:hidden">
                          {exhibitor.category}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{exhibitor.contactPerson || exhibitor.firstName + ' ' + exhibitor.lastName}</div>
                        <div className="text-sm text-gray-500 flex items-center truncate">
                          <Mail className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span className="truncate">{exhibitor.email || 'N/A'}</span>
                        </div>
                        <div className="text-sm text-gray-500 flex items-center">
                          <Phone className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span>{exhibitor.phone || 'N/A'}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="default">{exhibitor.category || 'N/A'}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge variant="info">{exhibitor.subCategory || 'N/A'}</Badge>
                    </TableCell>
                    {/* <TableCell className="hidden xl:table-cell">
                      <div className="flex items-center">
                        <Building className="h-4 w-4 mr-2 text-blue-500" />
                        <span className="font-medium">{exhibitor.booth || 'N/A'}</span>
                      </div>
                    </TableCell> */}
                    <TableCell className="hidden 2xl:table-cell">
                      <div className="flex items-center text-sm text-gray-900">
                        <Calendar className="h-4 w-4 mr-1" />
                        {exhibitor.registrationDate ? new Date(exhibitor.registrationDate).toLocaleDateString() : 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        {getStatusIcon(exhibitor.status)}
                        <Badge variant={getStatusVariant(exhibitor.status)} className="ml-2">
                          <span className="hidden sm:inline">{exhibitor.status.replace('_', ' ')}</span>
                          <span className="sm:hidden">{exhibitor.status.split('_')[0]}</span>
                        </Badge>
                      </div>
                    </TableCell>
                      {/* <TableCell>
                      <div className="flex items-center">
                        <CreditCard className="h-4 w-4 mr-1" />
                        <Badge variant={getPaymentStatusVariant(exhibitor.paymentStatus)}>
                          {exhibitor.paymentStatus}
                        </Badge>
                      </div>
                      </TableCell> */}
                    <TableCell>
                      <div className="flex space-x-1">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handleView(exhibitor)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isSuperAdmin && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => handleEdit(exhibitor)}
                          className="hidden sm:inline-flex"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => handleEmail(exhibitor)}
                          className="hidden sm:inline-flex"
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                        {isSuperAdmin && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => handleDelete(exhibitor)}
                          className="hidden lg:inline-flex"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View Exhibitor Modal */}
      {showViewModal && selectedExhibitor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">Exhibitor Details</h2>
                <button onClick={closeModals} className="text-gray-400 hover:text-gray-600">
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <ExhibitorStorageImage
                  src={exhibitorPortfolioDisplayUrl({
                    portfolioImageUrl: selectedExhibitor.portfolioImageUrl,
                    imageUrls: selectedExhibitor.imageUrls,
                    companyName: selectedExhibitor.companyName,
                    id: selectedExhibitor.id,
                  })}
                  alt={selectedExhibitor.companyName || 'Exhibitor'}
                  className="h-28 w-28 sm:h-32 sm:w-32 rounded-xl object-cover border border-gray-200 shadow-sm shrink-0"
                />
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Portfolio</p>
                  <h3 className="text-xl font-bold text-gray-900">{selectedExhibitor.companyName}</h3>
                  <p className="text-sm text-gray-600 mt-1">{selectedExhibitor.category || 'Category'} · {selectedExhibitor.city || 'City'}</p>
                </div>
              </div>

              {/* Personal Information (Step 1) */}
                    <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <User className="h-5 w-5 mr-2" />
                  Personal Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                    <label className="text-sm font-medium text-gray-700">First Name</label>
                    <p className="text-gray-900">{selectedExhibitor.firstName || selectedExhibitor.companyName.split(' ')[0]}</p>
                    </div>
                    <div>
                    <label className="text-sm font-medium text-gray-700">Last Name</label>
                    <p className="text-gray-900">{selectedExhibitor.lastName || selectedExhibitor.companyName.split(' ')[1]}</p>
                    </div>
                    <div>
                    <label className="text-sm font-medium text-gray-700">Email ID</label>
                      <p className="text-gray-900">{selectedExhibitor.email || 'N/A'}</p>
                    </div>
                    <div>
                    <label className="text-sm font-medium text-gray-700">Contact Number</label>
                      <p className="text-gray-900">{selectedExhibitor.phone || 'N/A'}</p>
                    </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Alternate Contact Number</label>
                      <p className="text-gray-900">{selectedExhibitor.alternatePhone || 'N/A'}</p>
                    </div>
                    </div>
              </div>

              {/* Address Information (Step 2) */}
                    <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <MapPin className="h-5 w-5 mr-2" />
                  Address Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Address Line 1</label>
                    <p className="text-gray-900">{selectedExhibitor.address1 || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Address Line 2</label>
                    <p className="text-gray-900">{selectedExhibitor.address2 || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">City</label>
                      <p className="text-gray-900">{selectedExhibitor.city || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">State</label>
                      <p className="text-gray-900">{selectedExhibitor.state || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Pincode</label>
                      <p className="text-gray-900">{selectedExhibitor.pincode || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Country</label>
                      <p className="text-gray-900">{selectedExhibitor.country || 'N/A'}</p>
                    </div>
                </div>
              </div>

              {/* Business Information (Step 3) */}
                    <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Building className="h-5 w-5 mr-2" />
                  Business Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Company Name</label>
                    <p className="text-gray-900">{selectedExhibitor.companyName || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Company Website</label>
                    <p className="text-gray-900">
                      {selectedExhibitor.website ? (
                        <a href={selectedExhibitor.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {selectedExhibitor.website}
                        </a>
                      ) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Category</label>
                    <p className="text-gray-900">{selectedExhibitor.category || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Sub Category</label>
                    <p className="text-gray-900">{selectedExhibitor.subCategory || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">PAN Number</label>
                      <p className="text-gray-900">{selectedExhibitor.panNumber || 'N/A'}</p>
                    </div>
                    <div>
                    <label className="text-sm font-medium text-gray-700">GST Number</label>
                    <p className="text-gray-900">{selectedExhibitor.gstNumber || 'N/A'}</p>
                    </div>
                    <div>
                    <label className="text-sm font-medium text-gray-700">Preferred Booth Size</label>
                      <p className="text-gray-900">{selectedExhibitor.boothSize || 'N/A'}</p>
                    </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Business Description</label>
                    <p className="text-gray-900">{selectedExhibitor.businessDescription || 'N/A'}</p>
                  </div>
                  
                  {/* Social Media Links */}
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Social Media Links</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                    <div>
                        <span className="text-xs text-gray-500">Facebook:</span>
                        <p className="text-sm text-gray-900">
                          {selectedExhibitor.socialMediaLinks?.facebook ? (
                            <a href={selectedExhibitor.socialMediaLinks.facebook} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              Link
                            </a>
                          ) : 'N/A'}
                        </p>
                    </div>
                      <div>
                        <span className="text-xs text-gray-500">LinkedIn:</span>
                        <p className="text-sm text-gray-900">
                          {selectedExhibitor.socialMediaLinks?.linkedin ? (
                            <a href={selectedExhibitor.socialMediaLinks.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              Link
                            </a>
                          ) : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Instagram:</span>
                        <p className="text-sm text-gray-900">
                          {selectedExhibitor.socialMediaLinks?.instagram ? (
                            <a href={selectedExhibitor.socialMediaLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              Link
                            </a>
                          ) : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Twitter:</span>
                        <p className="text-sm text-gray-900">
                          {selectedExhibitor.socialMediaLinks?.twitter ? (
                            <a href={selectedExhibitor.socialMediaLinks.twitter} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              Link
                            </a>
                          ) : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Documents (Step 4) */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Documents
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">PAN Card</label>
                    <div className="mt-1">
                      {selectedExhibitor.documentUrls?.panCard ? (
                        <a href={selectedExhibitor.documentUrls.panCard} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                          ✓ View Document
                        </a>
                      ) : (
                        <span className="text-gray-500 text-sm">Not uploaded</span>
                      )}
                      </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Aadhar Card</label>
                    <div className="mt-1">
                      {selectedExhibitor.documentUrls?.aadharCard ? (
                        <a href={selectedExhibitor.documentUrls.aadharCard} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                          ✓ View Document
                        </a>
                      ) : (
                        <span className="text-gray-500 text-sm">Not uploaded</span>
                      )}
                      </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Licence </label>
                    <div className="mt-1">
                      {selectedExhibitor.documentUrls?.licence ? (
                        <a href={selectedExhibitor.documentUrls.licence} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                          ✓ View Document
                        </a>
                      ) : (
                        <span className="text-gray-500 text-sm">Not uploaded</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Images (gallery + cover, deduped; excludes default placeholder-only) */}
                    <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Upload className="h-5 w-5 mr-2" />
                  Uploaded images
                </h3>
                {(() => {
                  const uploaded = exhibitorUploadedImageUrls({
                    portfolioImageUrl: selectedExhibitor.portfolioImageUrl,
                    imageUrls: selectedExhibitor.imageUrls,
                  });
                  return uploaded.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {uploaded.map((imageUrl, index) => (
                        <div key={`${imageUrl}-${index}`} className="relative">
                          <ExhibitorStorageImage
                            src={imageUrl}
                            alt={`Company image ${index + 1}`}
                            className="w-full h-32 object-cover rounded-lg border border-gray-200 bg-gray-50"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No gallery images uploaded (only default profile may be set).</p>
                  );
                })()}
                    </div>

              {/* Status Information */}
                    <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Status Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                    <label className="text-sm font-medium text-gray-700">Registration Status</label>
                    <div className="mt-1">
                      <Badge variant={selectedExhibitor.status === 'interested' ? 'info' : selectedExhibitor.status === 'approved' ? 'success' : 'error'}>
                        {selectedExhibitor.status?.toUpperCase() || 'INTERESTED'}
                      </Badge>
                    </div>
                  </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Payment Status</label>
                    <div className="mt-1">
                      <Badge variant={selectedExhibitor.paymentStatus === 'paid' ? 'success' : selectedExhibitor.paymentStatus === 'pending' ? 'warning' : 'default'}>
                        {selectedExhibitor.paymentStatus?.toUpperCase() || 'PENDING'}
                        </Badge>
                      </div>
                    </div>
                    </div>
                    </div>
              </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <Button variant="outline" onClick={closeModals}>Close</Button>
                {isSuperAdmin && (
                <Button onClick={() => { closeModals(); handleEdit(selectedExhibitor); }}>
                  <Edit className="h-4 w-4 mr-2" />
                Edit Exhibitor
                </Button>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Exhibitor Modal */}
      {showEditModal && editFormData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">Edit Exhibitor - {editFormData.companyName}</h2>
                <button onClick={closeModals} className="text-gray-400 hover:text-gray-600">
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              {/* Step Indicator */}
              <div className="mt-4">
                <div className="flex items-center justify-center space-x-4">
                  {[1, 2, 3, 4, 5, 6].map((step) => (
                    <div key={step} className="flex items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        editStep >= step 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-200 text-gray-600'
                      }`}>
                        {step}
                      </div>
                      {step < 6 && (
                        <div className={`w-12 h-1 mx-2 ${
                          editStep > step ? 'bg-blue-600' : 'bg-gray-200'
                        }`} />
                      )}
                    </div>
                  ))}
                </div>
                <div className="text-center mt-2 text-sm text-gray-600">
                  {editStep === 1 && 'Personal information & company'}
                  {editStep === 2 && 'Address (optional)'}
                  {editStep === 3 && 'Business details (optional)'}
                  {editStep === 4 && 'Documents (optional)'}
                  {editStep === 5 && 'Images (optional)'}
                  {editStep === 6 && 'Review & update'}
                </div>
              </div>
            </div>
            
            <div className="p-6">
              {/* Step 1: Personal Information */}
              {editStep === 1 && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                        <User className="h-5 w-5 mr-2" />
                        Personal Information
                      </h3>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            First Name *
                          </label>
                          <input
                            type="text"
                            value={editFormData.firstName}
                            onChange={(e) => {
                              setEditFormData({...editFormData, firstName: e.target.value});
                              validateField('firstName', e.target.value);
                            }}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              editErrors.firstName ? 'border-red-300' : 'border-gray-300'
                            }`}
                            placeholder="Enter first name"
                          />
                          {editErrors.firstName && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              {editErrors.firstName}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Last Name *
                          </label>
                          <input
                            type="text"
                            value={editFormData.lastName}
                            onChange={(e) => {
                              setEditFormData({...editFormData, lastName: e.target.value});
                              validateField('lastName', e.target.value);
                            }}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              editErrors.lastName ? 'border-red-300' : 'border-gray-300'
                            }`}
                            placeholder="Enter last name"
                          />
                          {editErrors.lastName && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              {editErrors.lastName}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Email ID *
                          </label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                              type="email"
                              value={editFormData.email || ''}
                              onChange={(e) => {
                                setEditFormData({...editFormData, email: e.target.value});
                                validateField('email', e.target.value);
                              }}
                              className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                editErrors.email ? 'border-red-300' : 'border-gray-300'
                              }`}
                              placeholder="Enter email address"
                            />
                          </div>
                          {editErrors.email && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              {editErrors.email}
                            </p>
                          )}
                        </div>

                        <div>
                          <PhoneInput
                            label="Contact Number"
                            value={editFormData.phone || ''}
                            onChange={(value) => {
                              setEditFormData({...editFormData, phone: value});
                              validateField('phone', value);
                            }}
                            required={true}
                            error={editErrors.phone}
                            name="phone"
                            placeholder="9876543210"
                          />
                        </div>
                      </div>

                      <div>
                        <PhoneInput
                          label="Alternate Contact Number"
                          value={editFormData.alternatePhone || ''}
                          onChange={(value) => setEditFormData({...editFormData, alternatePhone: value})}
                          required={false}
                          error={editErrors.alternatePhone}
                          name="alternatePhone"
                          placeholder="9876543210"
                        />
                      </div>

                      <div className="border-t border-gray-200 pt-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Company Name *
                            </label>
                            <input
                              type="text"
                              value={editFormData.companyName || ''}
                              onChange={(e) => {
                                setEditFormData({ ...editFormData, companyName: e.target.value });
                                validateField('companyName', e.target.value);
                              }}
                              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                editErrors.companyName ? 'border-red-300' : 'border-gray-300'
                              }`}
                              placeholder="Enter company name"
                            />
                            {editErrors.companyName && (
                              <p className="mt-1 text-sm text-red-600 flex items-center">
                                <AlertTriangle className="h-4 w-4 mr-1" />
                                {editErrors.companyName}
                              </p>
                            )}
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Main Category *
                            </label>
                            <select
                              value={editFormData.category || ''}
                              onChange={(e) => {
                                setEditFormData({ ...editFormData, category: e.target.value, subCategory: '' });
                                validateField('category', e.target.value);
                              }}
                              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                editErrors.category ? 'border-red-300' : 'border-gray-300'
                              }`}
                            >
                              <option value="">Select category</option>
                              {categoryOptions.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                            {editErrors.category && (
                              <p className="mt-1 text-sm text-red-600 flex items-center">
                                <AlertTriangle className="h-4 w-4 mr-1" />
                                {editErrors.category}
                              </p>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-gray-500">
                          Later steps are optional — you can skip to review when these required fields are complete.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Step 2: Contact & Business Details */}
              {editStep === 2 && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                        <MapPin className="h-5 w-5 shrink-0" />
                        <span>Address</span>
                        <span className="text-sm font-normal text-gray-500">(optional)</span>
                      </h3>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Address Line 1
                        </label>
                        <input
                          type="text"
                          value={editFormData.address1 || ''}
                          onChange={(e) => {
                            setEditFormData({...editFormData, address1: e.target.value});
                            validateField('address1', e.target.value);
                          }}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            editErrors.address1 ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder="Enter street address"
                        />
                        {editErrors.address1 && (
                          <p className="mt-1 text-sm text-red-600 flex items-center">
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            {editErrors.address1}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Address Line 2 
                        </label>
                        <input
                          type="text"
                          value={editFormData.address2 || ''}
                          onChange={(e) => setEditFormData({...editFormData, address2: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Apartment, suite, unit, building, floor, etc."
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            State
                          </label>
                          <select
                            value={editFormData.state || ''}
                            onChange={(e) => {
                              setEditFormData({...editFormData, state: e.target.value, city: ''}); // Clear city when state changes
                              validateField('state', e.target.value);
                            }}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              editErrors.state ? 'border-red-300' : 'border-gray-300'
                            }`}
                          >
                            <option value="">Select state</option>
                            {statesData.map((state) => (
                              <option key={state.id} value={state.name}>
                                {state.name}
                              </option>
                            ))}
                          </select>
                          {editErrors.state && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              {editErrors.state}
                            </p>
                          )}
                        </div>
<div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            City
                          </label>
                          <select
                            value={editFormData.city || ''}
                            onChange={(e) => {
                              setEditFormData({...editFormData, city: e.target.value});
                              validateField('city', e.target.value);
                            }}
                            disabled={!editFormData.state}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 ${
                              editErrors.city ? 'border-red-300' : 'border-gray-300'
                            }`}
                          >
                            <option value="">Select city</option>
                            {editFormData.state && statesData
                              .find(s => s.name === editFormData.state)?.cities
                              .map(city => (
                                <option key={city} value={city}>{city}</option>
                              ))}
                          </select>
                          {editErrors.city && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              {editErrors.city}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Pincode
                          </label>
                          <input
                            type="text"
                            value={editFormData.pincode || ''}
                            onChange={(e) => {
                              setEditFormData({...editFormData, pincode: e.target.value});
                              validateField('pincode', e.target.value);
                            }}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              editErrors.pincode ? 'border-red-300' : 'border-gray-300'
                            }`}
                            placeholder="400001"
                          />
                          {editErrors.pincode && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              {editErrors.pincode}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Country
                          </label>
                          <select
                            value={editFormData.country || 'India'}
                            onChange={(e) => {
                              setEditFormData({...editFormData, country: e.target.value});
                              validateField('country', e.target.value);
                            }}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              editErrors.country ? 'border-red-300' : 'border-gray-300'
                            }`}
                          >
                            <option value="India">India</option>
                          </select>
                          {editErrors.country && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              {editErrors.country}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Step 3: Business Information */}
              {editStep === 3 && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                        <Building className="h-5 w-5 shrink-0" />
                        <span>Business Information</span>
                        <span className="text-sm font-normal text-gray-500">(optional)</span>
                      </h3>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Company Website <span className="text-gray-500 font-normal">(optional)</span>
                        </label>
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <input
                            type="url"
                            value={editFormData.website || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, website: e.target.value })}
                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="https://company.com"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Sub Category <span className="text-gray-500 font-normal">(optional)</span>
                        </label>
                        <div
                          className={`max-h-40 overflow-y-auto border rounded-lg p-3 space-y-2 ${
                            editErrors.subCategory ? 'border-red-300' : 'border-gray-300'
                          } ${!editFormData.category ? 'bg-gray-100' : 'bg-white'}`}
                        >
                          {!editFormData.category && (
                            <p className="text-sm text-amber-700">
                              Choose a <strong>Main Category</strong> first. Sub-categories stay optional after that.
                            </p>
                          )}
                          {editFormData.category && editSubCategories.length === 0 && (
                            <p className="text-sm text-gray-500">No sub-categories available for this category</p>
                          )}
                          {editFormData.category &&
                            editSubCategories.map((subCat) => (
                              <label key={subCat} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedEditSubCategories.includes(subCat)}
                                  onChange={() => toggleEditSubCategory(subCat)}
                                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span>{subCat}</span>
                              </label>
                            ))}
                        </div>
                        {editErrors.subCategory && (
                          <p className="mt-1 text-sm text-red-600 flex items-center">
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            {editErrors.subCategory}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            PAN Number <span className="text-gray-500 font-normal">(optional)</span>
                          </label>
                          <input
                            type="text"
                            value={editFormData.panNumber || ''}
                            onChange={(e) => {
                              const pan = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
                              setEditFormData({ ...editFormData, panNumber: pan });
                              validateField('panNumber', pan);
                            }}
                            maxLength={10}
                            autoCapitalize="characters"
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase ${
                              editErrors.panNumber ? 'border-red-300' : 'border-gray-300'
                            }`}
                            placeholder="ABCDE1234F"
                          />
                          <p className="mt-1 text-xs text-gray-500">10 characters · format ABCDE1234F · uppercase</p>
                          {editErrors.panNumber && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertCircle className="h-4 w-4 mr-1" />
                              {editErrors.panNumber}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            GST Number 
                          </label>
                          <input
                            type="text"
                            value={editFormData.gstNumber || ''}
                            onChange={(e) => {
                              const gst = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
                              setEditFormData({ ...editFormData, gstNumber: gst });
                              validateField('gstNumber', gst);
                            }}
                            maxLength={15}
                            autoCapitalize="characters"
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase ${
                              editErrors.gstNumber ? 'border-red-300' : 'border-gray-300'
                            }`}
                            placeholder="22AAAAA0000A1Z5"
                          />
                          <p className="mt-1 text-xs text-gray-500">Max 15 characters · uppercase</p>
                          {editErrors.gstNumber && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              {editErrors.gstNumber}
                            </p>
                          )}
                        </div>
                        </div>

                        <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Preferred Booth Size <span className="text-gray-500">(Optional)</span>
                        </label>
                          <select
                            value={editFormData.boothSize || ''}
                            onChange={(e) => {
                              setEditFormData({...editFormData, boothSize: e.target.value});
                              validateField('boothSize', e.target.value);
                            }}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              editErrors.boothSize ? 'border-red-300' : 'border-gray-300'
                            }`}
                          >
                            <option value="">Select booth size</option>
                          {boothSizes.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                            ))}
                          </select>
                          {editErrors.boothSize && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              {editErrors.boothSize}
                            </p>
                          )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Business Description 
                        </label>
                        <textarea
                          value={editFormData.businessDescription || ''}
                          onChange={(e) => setEditFormData({...editFormData, businessDescription: e.target.value})}
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Describe your business, products, and services..."
                        />
                      </div>

                      {/* Social Media Links */}
                        <div>
                        <h4 className="text-md font-medium text-gray-900 mb-4">Social Media Links </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Facebook
                            </label>
                          <input
                              type="url"
                              value={editFormData.socialMediaLinks?.facebook || ''}
                              onChange={(e) => setEditFormData({
                                ...editFormData,
                                socialMediaLinks: {...editFormData.socialMediaLinks, facebook: e.target.value}
                              })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="https://facebook.com/..."
                          />
                        </div>

                      <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              LinkedIn
                            </label>
                          <input
                            type="url"
                            value={editFormData.socialMediaLinks?.linkedin || ''}
                            onChange={(e) => setEditFormData({
                              ...editFormData, 
                              socialMediaLinks: {...editFormData.socialMediaLinks, linkedin: e.target.value}
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="https://linkedin.com/company/..."
                          />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Instagram
                            </label>
                          <input
                            type="url"
                              value={editFormData.socialMediaLinks?.instagram || ''}
                            onChange={(e) => setEditFormData({
                              ...editFormData, 
                                socialMediaLinks: {...editFormData.socialMediaLinks, instagram: e.target.value}
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="https://instagram.com/..."
                          />
                      </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Twitter
                            </label>
                          <input
                            type="url"
                            value={editFormData.socialMediaLinks?.twitter || ''}
                            onChange={(e) => setEditFormData({
                              ...editFormData, 
                              socialMediaLinks: {...editFormData.socialMediaLinks, twitter: e.target.value}
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="https://twitter.com/..."
                          />
                        </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Step 4: Documents */}
              {editStep === 4 && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                        <FileText className="h-5 w-5 mr-2" />
                        Documents
                      </h3>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            PAN Card <span className="text-gray-500 font-normal">(optional)</span>
                          </label>
                          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                            <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-600 mb-2">
                              Click to upload PAN Card
                            </p>
                            <input
                              type="file"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                if (editFormData && file) {
                                  setEditFormData({
                                    ...editFormData,
                                    documents: {
                                      ...editFormData.documents,
                                      panCard: file
                                    }
                                  });
                                }
                              }}
                              className="hidden"
                              accept=".pdf,.jpg,.jpeg,.png"
                              id="edit-panCard-upload"
                            />
                            <label 
                              htmlFor="edit-panCard-upload" 
                              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
                            >
                              Choose File
                            </label>
                            {editFormData?.documents.panCard && (
                              <p className="text-xs text-green-600 mt-2">
                                ✓ {editFormData.documents.panCard.name}
                              </p>
                            )}
                            {!editFormData?.documents.panCard && existingDocuments.panCard && (
                              <p className="text-xs text-green-600 mt-2">
                                ✓ PAN Card Uploaded
                              </p>
                            )}
                          </div>
                          {editErrors.panCard && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertCircle className="h-4 w-4 mr-1" />
                              {editErrors.panCard}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Aadhar Card <span className="text-gray-500 font-normal">(optional)</span>
                          </label>
                          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                            <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-600 mb-2">
                              Click to upload Aadhar Card
                            </p>
                            <input
                              type="file"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                if (editFormData && file) {
                                  setEditFormData({
                                    ...editFormData,
                                    documents: {
                                      ...editFormData.documents,
                                      aadharCard: file
                                    }
                                  });
                                }
                              }}
                              className="hidden"
                              accept=".pdf,.jpg,.jpeg,.png"
                              id="edit-aadharCard-upload"
                            />
                            <label 
                              htmlFor="edit-aadharCard-upload" 
                              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
                            >
                              Choose File
                            </label>
                            {editFormData?.documents.aadharCard && (
                              <p className="text-xs text-green-600 mt-2">
                                ✓ {editFormData.documents.aadharCard.name}
                              </p>
                            )}
                            {!editFormData?.documents.aadharCard && existingDocuments.aadharCard && (
                              <p className="text-xs text-green-600 mt-2">
                                ✓ Aadhar Card Uploaded
                              </p>
                            )}
                          </div>
                          {editErrors.aadharCard && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertCircle className="h-4 w-4 mr-1" />
                              {editErrors.aadharCard}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Licence 
                          </label>
                          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                            <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-600 mb-2">
                              Click to upload Licence
                            </p>
                            <input
                              type="file"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                if (editFormData && file) {
                                  setEditFormData({
                                    ...editFormData,
                                    documents: {
                                      ...editFormData.documents,
                                      licence: file
                                    }
                                  });
                                }
                              }}
                              className="hidden"
                              accept=".pdf,.jpg,.jpeg,.png"
                              id="edit-licence-upload"
                            />
                            <label 
                              htmlFor="edit-licence-upload" 
                              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
                            >
                              Choose File
                            </label>
                            {editFormData?.documents.licence && (
                              <p className="text-xs text-green-600 mt-2">
                                ✓ {editFormData.documents.licence.name}
                              </p>
                            )}
                            {!editFormData?.documents.licence && existingDocuments.licence && (
                              <p className="text-xs text-green-600 mt-2">
                                ✓ Licence Uploaded
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex">
                          <Info className="h-5 w-5 text-blue-400 mt-0.5 mr-3" />
                          <div className="text-sm">
                            <h4 className="font-medium text-blue-900">Document Guidelines</h4>
                            <ul className="mt-2 text-blue-700 space-y-1">
                              <li>• Upload clear, readable images or PDFs</li>
                              <li>• Maximum file size: 100KB per document</li>
                              <li>• Images will be automatically compressed if too large</li>
                              <li>• PDF files over 100KB need manual compression</li>
                              <li>• Accepted formats: PDF, JPG, JPEG, PNG</li>
                              <li>• Documents are optional unless your process requires them</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Step 5: Upload Images */}
              {editStep === 5 && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                        <Upload className="h-5 w-5 mr-2" />
                        Upload Images
                      </h3>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-lg border border-blue-200 bg-blue-50/80 p-4">
                        <label className="block text-sm font-medium text-gray-900 mb-2">Portfolio image (cover)</label>
                        <p className="text-xs text-gray-600 mb-3">
                          Shown in the exhibitor list. Uses your cover URL, or the first gallery image, until you pick a new file.
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          {editFormData.portfolioImage ? (
                            <LocalFileImagePreview
                              file={editFormData.portfolioImage}
                              alt="New portfolio"
                              className="h-20 w-20 rounded-lg object-cover border border-gray-200"
                            />
                          ) : (
                            <ExhibitorStorageImage
                              src={exhibitorPortfolioDisplayUrl({
                                portfolioImageUrl: editFormData.portfolioImageUrl,
                                imageUrls: existingImages,
                                companyName: editFormData.companyName,
                                id: editFormData.id,
                              })}
                              alt="Current portfolio"
                              className="h-20 w-20 rounded-lg object-cover border border-gray-200 bg-gray-50"
                            />
                          )}
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id="edit-portfolio-upload"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            if (editFormData && file) {
                              setEditFormData({ ...editFormData, portfolioImage: file });
                            }
                          }}
                        />
                        <label
                          htmlFor="edit-portfolio-upload"
                          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
                        >
                          Replace portfolio image
                        </label>
                      </div>

                      {/* Existing Images Section - Matching AddExhibitor Format */}
                      {existingImages.length > 0 && (
                        <div className="mt-3">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">
                            Selected Images ({existingImages.length})
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {existingImages.map((imageUrl, index) => (
                              <div key={`${imageUrl}-${index}`} className="relative">
                                <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                                  <ExhibitorStorageImage
                                    src={imageUrl}
                                    alt={`Gallery ${index + 1}`}
                                    className="w-full h-full object-cover rounded-lg"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {existingImages.length > 0 ? 'Upload Additional Images' : 'Upload Images'}
                        </label>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                          <p className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                          <Upload className="h-8 w-8 text-gray-400 mb-2 ml-4" />
                            {/* Upload Company Images */}
                         
                          {/* <p className="text-xs text-gray-600 mb-3">
                            Upload images of your company, products, or booth setup
                          </p> */}
                          <input
                            type="file"
                            multiple
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              if (files.length > 0) {
                                setEditFormData((prev: any) => ({
                                  ...prev,
                                  images: [...prev.images, ...files]
                                }));
                              }
                            }}
                            className="hidden"
                            accept="image/*"
                            id="edit-images-upload"
                          />
                          <label 
                            htmlFor="edit-images-upload"
                            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
                          >
                            Choose Images
                          </label>
                          </p>

                          {editFormData.images.length > 0 && (
                          <div className="mt-4">
                            <h4 className="text-sm font-medium text-gray-700 mb-3">
                              Selected Images ({editFormData.images.length})
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {editFormData.images.map((file: any, index: any) => (
                                <div key={index} className="relative">
                                  <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                                    <LocalFileImagePreview
                                      file={file}
                                      alt={`New upload ${index + 1}`}
                                      className="w-full h-full object-cover rounded-lg"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditFormData((prev: any) => ({
                                        ...prev,
                                        images: prev.images.filter((_: any, i: any) => i !== index)
                                      }));
                                    }}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                  <p className="text-xs text-gray-600 mt-1 truncate">
                                    {file.name}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        </div>
                        
                        
                      </div>

                      {editErrors.images && (
                        <div className="mt-4">
                          <p className="text-sm text-red-600 flex items-center">
                            <AlertCircle className="h-4 w-4 mr-1" />
                            {editErrors.images}
                          </p>
                        </div>
                      )}

                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="flex">
                          <Info className="h-4 w-4 text-green-400 mt-0.5 mr-2" />
                          <div className="text-xs">
                            <h4 className="font-medium text-green-900">Image Guidelines</h4>
                            <ul className="mt-1 text-green-700 space-y-0.5">
                              <li>• Upload high-quality images of your products or company</li>
                              <li>• Maximum file size: 100KB per image</li>
                              <li>• Large images will be automatically compressed</li>
                              <li>• Accepted formats: JPG, JPEG, PNG</li>
                              <li>• You can upload multiple images</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Step 6: Review & Update */}
              {editStep === 6 && (
                <div className="space-y-6">
                  {/* Simple Review Summary */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
                      <CheckCircle className="h-5 w-5 mr-2" />
                      📋 Update Summary
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                      <div>
                        <h5 className="font-medium text-gray-900 mb-2">Company Information</h5>
                        <p><strong>Company:</strong> {editFormData.companyName || 'Not provided'}</p>
                        <p><strong>Contact Person:</strong> {editFormData.contactPerson || 'Not provided'}</p>
                        <p><strong>Email:</strong> {editFormData.email || 'Not provided'}</p>
                        <p><strong>Phone:</strong> {editFormData.phone || 'Not provided'}</p>
                        {editFormData.alternatePhone && <p><strong>Alt Phone:</strong> {editFormData.alternatePhone}</p>}
                      </div>
                      
                      <div>
                        <h5 className="font-medium text-gray-900 mb-2">Business Details</h5>
                        <p><strong>Category:</strong> {editFormData.category || 'Not provided'}</p>
                        <p><strong>Sub Category:</strong> {editFormData.subCategory || 'Not provided'}</p>
                        {editFormData.website && <p><strong>Website:</strong> {editFormData.website}</p>}
                        {editFormData.gstNumber && <p><strong>GST:</strong> {editFormData.gstNumber}</p>}
                        {editFormData.panNumber && <p><strong>PAN:</strong> {editFormData.panNumber}</p>}
                      </div>
                      
                      <div>
                        <h5 className="font-medium text-gray-900 mb-2">Location</h5>
                        <p><strong>Address:</strong> {editFormData.address || 'Not provided'}</p>
                        <p><strong>City:</strong> {editFormData.city || 'Not provided'}</p>
                        <p><strong>State:</strong> {editFormData.state || 'Not provided'}</p>
                        <p><strong>Pincode:</strong> {editFormData.pincode || 'Not provided'}</p>
                        <p><strong>Country:</strong> {editFormData.country || 'Not provided'}</p>
                      </div>
                      
                      <div>
                        <h5 className="font-medium text-gray-900 mb-2">Status & Payment</h5>
                        <p><strong>Status:</strong> {editFormData.status || 'Not set'}</p>
                        <p><strong>Payment Status:</strong> {editFormData.paymentStatus || 'Not set'}</p>
                        <p><strong>Registration Fee:</strong> ₹{(editFormData.registrationFee || 15000).toLocaleString()}</p>
                        <p><strong>Payment Method:</strong> {editFormData.paymentMethod || 'Not provided'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex">
                      <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 mr-3" />
                      <div className="text-sm">
                        <h4 className="font-medium text-green-900">Ready to Update</h4>
                        <p className="mt-1 text-green-700">
                          Please review the information above and click "Save Changes" to update the exhibitor details.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between pt-6 border-t border-gray-200">
                <div>
                  {editStep > 1 && (
                    <Button variant="outline" onClick={prevEditStep}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Previous
                    </Button>
                  )}
                </div>
                
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="outline" onClick={closeModals}>
                    Cancel
                  </Button>
                  {editStep === 1 && (
                    <Button type="button" variant="outline" onClick={skipOptionalEditToReview}>
                      Skip optional — Review
                    </Button>
                  )}
                  {editStep < 6 ? (
                    <Button onClick={nextEditStep}>
                      Next
                      <ArrowLeft className="h-4 w-4 ml-2 rotate-180" />
                    </Button>
                  ) : (
                    <Button onClick={handleSaveEdit} className="flex items-center space-x-2">
                      <Save className="h-4 w-4" />
                      <span>Save Changes</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Exhibitor Modal */}
      {showEmailModal && selectedExhibitor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">Send Email</h2>
                <button onClick={closeModals} className="text-gray-400 hover:text-gray-600">
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Recipient</h4>
                <div className="text-sm text-gray-600">
                  <div><strong>{selectedExhibitor.contactPerson || 'N/A'}</strong></div>
                  <div>{selectedExhibitor.companyName || 'N/A'}</div>
                  <div>{selectedExhibitor.email || 'N/A'}</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
                <input
                  type="text"
                  value={emailFormData.subject}
                  onChange={(e) => setEmailFormData({...emailFormData, subject: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter email subject"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                <textarea
                  value={emailFormData.message}
                  onChange={(e) => setEmailFormData({...emailFormData, message: e.target.value})}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your message"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="sendCopy"
                  checked={emailFormData.sendCopy}
                  onChange={(e) => setEmailFormData({...emailFormData, sendCopy: e.target.checked})}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="sendCopy" className="ml-2 block text-sm text-gray-700">
                  Send a copy to myself
                </label>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <Button variant="outline" onClick={closeModals}>Cancel</Button>
              <Button onClick={handleSendEmail} className="flex items-center space-x-2">
                <Send className="h-4 w-4" />
                <span>Send Email</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Super Admin only) */}
      {showDeleteModal && selectedExhibitor && isSuperAdmin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Delete Exhibitor</h3>
                  <p className="text-sm text-gray-600">This action cannot be undone</p>
                </div>
              </div>
              
              <p className="text-gray-700 mb-6">
                Are you sure you want to delete "<strong>{selectedExhibitor.companyName || 'N/A'}</strong>"? This
                will permanently remove the exhibitor and all associated data.
              </p>

              <div className="flex justify-end space-x-3">
                <Button variant="outline" onClick={closeModals}>Cancel</Button>
                <Button variant="danger" onClick={handleConfirmDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Exhibitor
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};