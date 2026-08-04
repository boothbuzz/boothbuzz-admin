import React, { useState } from 'react';
import { Plus, Edit, Trash2, Eye, MapPin, Users, Calendar, DollarSign, Search, Filter, X, Save, AlertTriangle, Building2, ArrowLeft, AlertCircle, Image as ImageIcon, FileText, Mail, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '../components/UI/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/UI/Table';
import { Badge } from '../components/UI/Badge';
import { Button } from '../components/UI/Button';
import { Venue } from '../types';
import { apiClient } from '../lib/apiClient';
import { resolveMediaUrl } from '../lib/api';
import { useVenues } from '../hooks/useSupabaseData';
import { sanitizePhoneInput, isValidIndianMobile } from '../utils/phone';
import { COUNTRIES } from '../data/locations';
import statesData from '../data/states.json';

/** Match Add New Venue — default checkbox options */
const defaultFacilities = [
  'Auditorium',
  'Community Hall',
  'Garden Area',
  'Parking',
  'Outdoor Space'
];

const defaultAmenities = [
  'Security',
  'Catering Kitchen',
  'Sound System',
  'Air Conditioning',
  'Fire Safety'
];

interface ExtendedVenueFormData {
  id: string;
  name: string;
  location: string;
  contactPerson: string;
  contactRole: string;
  email: string;
  phone: string;
  memberCount: number;
  facilities: string[];
  amenities: string[];
  description: string;
  status: 'active' | 'inactive' | 'pending';
  // Extended Fields
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  addressLandmark: string;
  addressStandard: string;
  areaSqFt: number;
  kindOfSpace: string;
  isCovered: boolean;
  pricingPerDay: number;
  facilityAreaSqFt: number;
  noOfStalls: number;
  facilityCovered: boolean;
  noOfFlats: number;
  // Google Maps fields
  latitude: number;
  longitude: number;
  formattedAddress: string;
  // Files
  photos: Array<{ name: string; url: string; type: string; size: number }>;
  documents: Array<{ name: string; url: string; type: string; size: number }>;
  // Custom Contact Information
  customContacts: Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
  }>;
  // Additional Settings (matching AddVenue)
  availableHours: string;
  parkingSpaces: number;
  cateringAllowed: boolean;
  alcoholAllowed: boolean;
  smokingAllowed: boolean;
  // Bank
  bankName: string;
  bankAccountNumber: string;
  bankHolderName: string;
  bankIfsc: string;
  bankMicr: string;
}

export const Venues: React.FC = () => {
  const { venues, loading, error, refetch } = useVenues();

  const [localVenues, setLocalVenues] = useState<Venue[]>([]); // for local UI updates if needed
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editFormData, setEditFormData] = useState<ExtendedVenueFormData | null>(null);
  const [editErrors, setEditErrors] = useState<{ [key: string]: string }>({});
  const [customFacility, setCustomFacility] = useState('');
  const [customAmenity, setCustomAmenity] = useState('');

  const filteredVenues = venues.filter(venue => {
    const matchesFilter = filter === 'all' || venue.status === filter;
    const matchesSearch = searchTerm === '' ||
      venue.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venue.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venue.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'inactive': return 'error';
      case 'pending': return 'warning';
      default: return 'default';
    }
  };

  const mediaFromVenueRow = (
    entries: unknown,
  ): Array<{ name: string; url: string; type: string; size: number }> => {
    if (!Array.isArray(entries)) return [];
    return entries
      .map((item: any) => {
        if (!item) return null;
        if (typeof item === 'string') {
          const url = resolveMediaUrl(item);
          return url ? { name: item.split('/').pop() || 'file', url, type: '', size: 0 } : null;
        }
        const url = resolveMediaUrl(item.url || item.path);
        if (!url) return null;
        return {
          name: String(item.name || url.split('/').pop() || 'file'),
          url,
          type: String(item.type || ''),
          size: Number(item.size) || 0,
        };
      })
      .filter((x): x is { name: string; url: string; type: string; size: number } => !!x);
  };

  const handleView = async (venue: Venue) => {
    // Prefer DB-persisted media metadata (files live under UPLOAD_DIR /files/...)
    let photos = mediaFromVenueRow(venue.photos);
    let documents = mediaFromVenueRow(venue.documents);

    // Legacy fallback: list from storage only if row has no media metadata
    if (!photos.length || !documents.length) {
      const [bucketPhotos, bucketDocs] = await Promise.all([
        photos.length ? Promise.resolve([]) : fetchPhotosFromBucket(venue.name),
        documents.length ? Promise.resolve([]) : fetchDocumentsFromBucket(venue.name),
      ]);
      if (!photos.length) photos = bucketPhotos;
      if (!documents.length) documents = bucketDocs;
    }

    setSelectedVenue({ ...venue, photos, documents });
    setShowViewModal(true);
  };

  // Helper function to fetch photos from venue-photos bucket
  const fetchPhotosFromBucket = async (venueName: string): Promise<Array<{ name: string; url: string; type: string; size: number }>> => {
    try {
      console.log('🔍 Fetching photos for venue:', venueName);

      // Generate multiple possible slug variations to match your Supabase folder structure
      const possibleSlugs = [
        venueName.toLowerCase().replace(/\s+/g, '-'),           // crystal-ball
        venueName.toLowerCase().replace(/\s+/g, '_'),           // crystal_ball
        venueName.toLowerCase().replace(/\s+/g, ''),            // crystalball
        venueName.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, ''), // crystal.ball (clean)
        slugifyVenue(venueName)                                // crystal-ball (original function)
      ];

      console.log('🔍 Possible slugs:', possibleSlugs);

      // First, check if we can access the bucket at all
      const { data: bucketTest, error: bucketError } = await apiClient.storage
        .from('venue-photos')
        .list('', { limit: 1 });

      if (bucketError) {
        console.error('❌ Cannot access venue-photos bucket:', bucketError);
        return [];
      }

      console.log('✅ Bucket access successful');

      // Try all possible slug variations to find photos
      let photoFiles = null;
      let foundSlug = null;

      for (const trySlug of possibleSlugs) {
        console.log(`🔍 Trying slug: ${trySlug}`);

        const { data: tryFiles, error: tryError } = await apiClient.storage
          .from('venue-photos')
          .list(trySlug);

        if (!tryError && tryFiles && tryFiles.length > 0) {
          console.log(`✅ Found ${tryFiles.length} photos in slug: ${trySlug}`);
          photoFiles = tryFiles;
          foundSlug = trySlug;
          break;
        } else {
          console.log(`⚠️ No photos found in slug: ${trySlug}`);
        }
      }

      // If no photos found with any slug, try to list all folders and find a match
      if (!photoFiles) {
        console.log('🔍 No photos found with any slug, checking all folders...');

        const { data: allFolders, error: folderError } = await apiClient.storage
          .from('venue-photos')
          .list('', { limit: 100 });

        if (!folderError && allFolders) {
          console.log('📁 Available folders:', allFolders.map(f => f.name));

          // Try fuzzy matching
          const possibleMatch = allFolders.find(f =>
            f.name.toLowerCase().includes(venueName.toLowerCase()) ||
            venueName.toLowerCase().includes(f.name.toLowerCase())
          );

          if (possibleMatch) {
            console.log('🎯 Found fuzzy matching folder:', possibleMatch.name);
            const { data: matchedFiles, error: matchedError } = await apiClient.storage
              .from('venue-photos')
              .list(possibleMatch.name);

            if (!matchedError && matchedFiles && matchedFiles.length > 0) {
              console.log('✅ Found photos in fuzzy matched folder:', possibleMatch.name);
              photoFiles = matchedFiles;
              foundSlug = possibleMatch.name;
            }
          }
        }
      }

      if (!photoFiles || photoFiles.length === 0) {
        console.log('❌ No photos found for venue:', venueName);
        return [];
      }

      // Convert bucket files to photo objects
      const photoPromises = photoFiles.map(async (file) => {
        const filePath = `${foundSlug}/${file.name}`;

        // Get signed URL since bucket is not public
        const { data: signedUrl, error: signedError } = await apiClient.storage
          .from('venue-photos')
          .createSignedUrl(filePath, 3600); // 1 hour expiry

        if (signedError) {
          console.error('❌ Error creating signed URL:', signedError);
          return null;
        }

        // Clean up the filename: remove timestamp, replace underscores with spaces, remove extension
        const cleanName = file.name
          .replace(/^\d+_/, '') // Remove timestamp prefix
          .replace(/\.(jpg|jpeg|png|gif|webp)$/i, '') // Remove file extension
          .replace(/_+/g, ' ') // Replace multiple underscores with single space
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .trim(); // Remove leading/trailing spaces

        const photoObj = {
          name: cleanName || 'Untitled Image',
          url: signedUrl?.signedUrl || '',
          type: `image/${file.name.split('.').pop()?.toLowerCase() || 'jpeg'}`,
          size: file.metadata?.size || 0
        };

        // Log the URL generation process
        console.log(`🔗 Generated signed URL for ${file.name}:`, {
          filePath,
          signedUrl: signedUrl?.signedUrl,
          finalUrl: photoObj.url
        });

        console.log(`📸 Photo: ${cleanName} -> ${photoObj.url}`);
        return photoObj;
      });

      const photos = await Promise.all(photoPromises);
      console.log('📸 Total photos fetched:', photos.length);
      return photos.filter((p): p is { name: string; url: string; type: string; size: number } => p !== null && p.url !== ''); // Only return valid photos

    } catch (error) {
      console.error('❌ Error fetching photos:', error);
      return [];
    }
  };

  // Helper function to fetch documents from venue-documents bucket
  const fetchDocumentsFromBucket = async (venueName: string): Promise<Array<{ name: string; url: string; type: string; size: number }>> => {
    try {
      const slug = slugifyVenue(venueName);

      // List all files in the venue-documents bucket for this venue
      const { data: docFiles, error: docError } = await apiClient.storage
        .from('venue-documents')
        .list(slug);

      if (docError) {
        return [];
      }

      if (!docFiles || docFiles.length === 0) {
        return [];
      }

      // Convert bucket files to document objects
      const docPromises = docFiles.map(async (file) => {
        const filePath = `${slug}/${file.name}`;

        // Get signed URL since bucket is likely not public
        const { data: signedUrl, error: signedError } = await apiClient.storage
          .from('venue-documents')
          .createSignedUrl(filePath, 3600); // 1 hour expiry

        if (signedError) {
          console.error('❌ Error creating signed URL for document:', signedError);
          return null;
        }

        const docObj = {
          name: file.name.replace(/^\d+_/, '').replace(/\.(pdf|doc|docx|txt|jpg|jpeg|png)$/i, ''),
          url: signedUrl.signedUrl,
          type: file.metadata?.mimetype || `application/${file.name.split('.').pop()?.toLowerCase() || 'octet-stream'}`,
          size: file.metadata?.size || 0
        };

        return docObj;
      });

      const documents = await Promise.all(docPromises);
      return documents.filter((d): d is { name: string; url: string; type: string; size: number } => d !== null);

    } catch (error) {
      return [];
    }
  };

  const handleEdit = async (venue: Venue) => {
    setSelectedVenue(venue);

    let photos = mediaFromVenueRow(venue.photos);
    let documents = mediaFromVenueRow(venue.documents);
    if (!photos.length || !documents.length) {
      const [bucketPhotos, bucketDocs] = await Promise.all([
        photos.length ? Promise.resolve([]) : fetchPhotosFromBucket(venue.name),
        documents.length ? Promise.resolve([]) : fetchDocumentsFromBucket(venue.name),
      ]);
      if (!photos.length) photos = bucketPhotos;
      if (!documents.length) documents = bucketDocs;
    }

    // Map Venue to ExtendedVenueFormData with existing values
    const editData = {
      id: venue.id,
      name: venue.name || '',
      location: venue.location || '',
      contactPerson: venue.contactPerson || '',
      contactRole: (venue as any).contactRole || (venue as any).contact_role || '',
      email: venue.email || '',
      phone: venue.phone || '',
      memberCount: venue.memberCount || 0,
      facilities: venue.facilities || [],
      amenities: venue.amenities || [],
      description: venue.description || '',
      status: venue.status || 'pending',
      // Extended Fields
      addressLine1: venue.addressLine1 || '',
      addressLine2: (venue as any).address_line2 || (venue as any).addressLine2 || '',
      city: (venue as any).city || '',
      state: (venue as any).state || '',
      pincode: (venue as any).pincode || '',
      country: (venue as any).country || 'India',
      addressLandmark: venue.addressLandmark || '',
      addressStandard: venue.addressStandard || '',
      areaSqFt: venue.areaSqFt || 0,
      kindOfSpace: venue.kindOfSpace || '',
      isCovered: venue.isCovered || false,
      pricingPerDay: venue.pricingPerDay || 0,
      facilityAreaSqFt: venue.facilityAreaSqFt || 0,
      noOfStalls: venue.noOfStalls || 0,
      facilityCovered: venue.facilityCovered || false,
      noOfFlats: venue.noOfFlats || 0,
      // Google Maps fields
      latitude: venue.latitude || 0,
      longitude: venue.longitude || 0,
      formattedAddress: venue.formattedAddress || '',
      // Files - fetched from storage buckets
      photos: photos,
      documents: documents,
      // Custom Contact Information
      customContacts: venue.customContacts || [],
      // Additional Settings (matching AddVenue)
      availableHours: venue.availableHours || '',
      parkingSpaces: venue.parkingSpaces || 0,
      cateringAllowed: venue.cateringAllowed || false,
      alcoholAllowed: venue.alcoholAllowed || false,
      smokingAllowed: venue.smokingAllowed || false,
      // Bank
      bankName: (venue as any).bankName || (venue as any).bank_name || '',
      bankAccountNumber: (venue as any).bankAccountNumber || (venue as any).bank_account_number || '',
      bankHolderName: (venue as any).bankHolderName || (venue as any).bank_holder_name || '',
      bankIfsc: (venue as any).bankIfsc || (venue as any).bank_ifsc || '',
      bankMicr: (venue as any).bankMicr || (venue as any).bank_micr || ''
    };



    setEditFormData(editData);
    setShowEditModal(true);
  };

  const handleDelete = (venue: Venue) => {
    setSelectedVenue(venue);
    setShowDeleteModal(true);
  };

  const checkForDuplicates = async (excludeId?: string): Promise<{ hasDuplicates: boolean; message: string }> => {
    if (!editFormData) return { hasDuplicates: false, message: '' };

    try {
      // Check for duplicate venue names
      let nameQuery = apiClient
        .from('venues')
        .select('id, name')
        .ilike('name', editFormData.name.trim());

      if (excludeId) {
        nameQuery = nameQuery.neq('id', excludeId);
      }

      const { data: nameDuplicates, error: nameError } = await nameQuery;

      if (nameError) throw nameError;

      if (nameDuplicates && nameDuplicates.length > 0) {
        return {
          hasDuplicates: true,
          message: `A venue with the name "${editFormData.name}" already exists. Please choose a different name.`
        };
      }

      // Check for duplicate addresses
      let addressQuery = apiClient
        .from('venues')
        .select('id, name, address_line1')
        .ilike('address_line1', editFormData.addressLine1?.trim() || '');

      if (excludeId) {
        addressQuery = addressQuery.neq('id', excludeId);
      }

      const { data: addressDuplicates, error: addressError } = await addressQuery;

      if (addressError) throw addressError;

      if (addressDuplicates && addressDuplicates.length > 0) {
        return {
          hasDuplicates: true,
          message: `A venue with the address "${editFormData.addressLine1}" already exists (${addressDuplicates[0].name}). Please verify the address.`
        };
      }

      return { hasDuplicates: false, message: '' };
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return { hasDuplicates: false, message: '' };
    }
  };

  const validateEditForm = (): boolean => {
    if (!editFormData) return false;

    const errors: { [key: string]: string } = {};

    // Basic validation
    if (!editFormData.name.trim()) {
      errors.name = 'Venue name is required';
    }
    // if (!editFormData.location.trim()) {
    //   errors.location = 'Location is required';
    // }
    if (!editFormData.contactPerson.trim()) {
      errors.contactPerson = 'Contact person is required';
    }
    // if (!editFormData.email.trim()) {
    //   errors.email = 'Email is required';
    // } else
    if (!/\S+@\S+\.\S+/.test(editFormData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    if (!editFormData.phone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!isValidIndianMobile(editFormData.phone)) {
      errors.phone = 'Phone number must be exactly 10 digits';
    }
    // if ((editFormData.memberCount || 0) <= 0) {
    //   errors.memberCount = 'Capacity must be greater than 0';
    // }
    if (!editFormData.addressLine1.trim()) {
      errors.addressLine1 = 'Address line 1 is required';
    }
    // if (!editFormData.city.trim()) {
    //   errors.city = 'City is required';
    // }
    if (!editFormData.state.trim()) {
      errors.state = 'State is required';
    }
    if (!editFormData.pincode) {
      errors.pincode = 'Pincode is required';
    } else if (!/^[0-9]{6}$/.test(editFormData.pincode)) {
      errors.pincode = 'Pincode must be 6 digits';
    }
    if (!editFormData.country.trim()) {
      errors.country = 'Country is required';
    }
    // Bank — optional; validate format only when filled
    const accountRegex = /^[0-9]{9,18}$/;
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
    if (editFormData.bankName.trim() && editFormData.bankName.trim().length < 2) {
      errors.bankName = 'Bank name must be at least 2 characters';
    }
    if (editFormData.bankAccountNumber.trim() && !accountRegex.test(editFormData.bankAccountNumber.trim())) {
      errors.bankAccountNumber = 'Account number must be 9-18 digits';
    }
    if (editFormData.bankHolderName.trim() && editFormData.bankHolderName.trim().length < 2) {
      errors.bankHolderName = 'Account holder name must be at least 2 characters';
    }
    if (editFormData.bankIfsc.trim() && !ifscRegex.test(editFormData.bankIfsc.trim())) {
      errors.bankIfsc = 'Invalid IFSC format (e.g., HDFC0001234)';
    }
    // const micrRegex = /^[0-9]{9}$/;
    // if (!editFormData.bankMicr.trim()) {
    //   errors.bankMicr = 'MICR is required';
    // } else if (!micrRegex.test(editFormData.bankMicr.trim())) {
    //   errors.bankMicr = 'MICR must be 9 digits';
    // }

    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Utility to create a safe slug from venue name for storage paths
  const slugifyVenue = (name: string) =>
    (name || 'venue')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-_]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

  // Helper: compress image without noticeable quality loss
  async function compressImage(file: File, maxSizePx: number = 1600, quality: number = 0.85): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const reader = new FileReader();
      reader.onload = () => {
        if (!reader.result) {
          resolve(file);
          return;
        }
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          const scale = Math.min(1, maxSizePx / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(file);
                return;
              }
              const output = new File([blob], file.name.replace(/\.(png|jpg|jpeg)$/i, '.jpg'), { type: 'image/jpeg' });
              resolve(output);
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = () => resolve(file);
        img.src = reader.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  // Helper: upload a file to a storage bucket and return public URL
  async function uploadToBucket(bucket: string, path: string, file: File): Promise<{ url: string }> {
    const { data: up, error: upErr } = await apiClient.storage.from(bucket).upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = apiClient.storage.from(bucket).getPublicUrl(up.path);
    return { url: pub.publicUrl };
  }







  const handleSaveEdit = async () => {
    if (editFormData) {


      // Validate the final form
      if (!validateEditForm()) {
        showNotification('Please fix the validation errors before saving.', 'error');
        return;
      }

      // Check for duplicates
      const duplicateCheck = await checkForDuplicates(editFormData.id);
      if (duplicateCheck.hasDuplicates) {
        showNotification(duplicateCheck.message, 'error');
        return;
      }

      // Upload new files to media store, keep existing URLs, then save both on the venue row
      type VenueFileMeta = { name: string; url: string; type: string; size: number };
      let finalPhotos: VenueFileMeta[] = [];
      let finalDocs: VenueFileMeta[] = [];
      try {
        const slug = slugifyVenue(editFormData.name);

        finalPhotos = [];
        for (const p of (editFormData.photos as any[]) || []) {
          if (p && p._file instanceof File) {
            const raw = p._file as File;
            const optimized = await compressImage(raw, 1600, 0.85);
            const safeName = raw.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
            const path = `${slug}/${Date.now()}_${safeName}`;
            const { url } = await uploadToBucket('venue-photos', path, optimized);
            finalPhotos.push({
              name: p.name || `${editFormData.name} - ${raw.name}`,
              url,
              type: optimized.type || raw.type || 'image/jpeg',
              size: optimized.size || raw.size,
            });
          } else if (p?.url) {
            finalPhotos.push({
              name: p.name || 'photo',
              url: p.url,
              type: p.type || 'image/jpeg',
              size: p.size || 0,
            });
          }
        }

        finalDocs = [];
        for (const d of (editFormData.documents as any[]) || []) {
          if (d && d._file && typeof d._file !== 'string' && d._file instanceof File) {
            const file = d._file as File;
            let toUpload = file;
            if (/image\//i.test(file.type)) {
              toUpload = await compressImage(file, 1600, 0.85);
            }
            const safeName = toUpload.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
            const path = `${slug}/${Date.now()}_${safeName}`;
            const { url } = await uploadToBucket('venue-documents', path, toUpload);
            finalDocs.push({
              name: d.name || `${editFormData.name} - ${file.name}`,
              url,
              type: toUpload.type || file.type || 'application/octet-stream',
              size: toUpload.size || file.size,
            });
          } else if (d?.url) {
            finalDocs.push({
              name: d.name || 'document',
              url: d.url,
              type: d.type || 'application/octet-stream',
              size: d.size || 0,
            });
          }
        }
      } catch (uploadErr: any) {
        console.error('Upload error:', uploadErr);
        showNotification('Failed to upload files: ' + (uploadErr?.message || uploadErr), 'error');
        return;
      }

      const updateData = {
        // Basic Information
        name: editFormData.name,
        location: editFormData.location,
        description: editFormData.description,
        status: editFormData.status,

        // Contact Information
        contact_person: editFormData.contactPerson,
        contact_role: editFormData.contactRole,
        email: editFormData.email,
        phone: editFormData.phone,

        // Capacity & Facilities
        capacity: editFormData.memberCount,
        facilities: editFormData.facilities,
        amenities: editFormData.amenities,

        // Extended Fields
        address_line1: editFormData.addressLine1,
        address_line2: editFormData.addressLine2 || '',
        city: editFormData.city || null,
        state: editFormData.state || null,
        pincode: editFormData.pincode || null,
        country: editFormData.country || 'India',
        address_landmark: editFormData.addressLandmark,
        address_standard: editFormData.addressStandard,
        area_sq_ft: editFormData.areaSqFt,
        kind_of_space: editFormData.kindOfSpace,
        is_covered: editFormData.isCovered,
        pricing_per_day: editFormData.pricingPerDay,
        facility_area_sq_ft: editFormData.facilityAreaSqFt,
        no_of_stalls: editFormData.noOfStalls,
        facility_covered: editFormData.facilityCovered,
        no_of_flats: editFormData.noOfFlats,

        // Google Maps fields
        latitude: editFormData.latitude,
        longitude: editFormData.longitude,
        formatted_address: editFormData.formattedAddress,

        // Files: bytes on media store + metadata on venue row
        photos: finalPhotos,
        documents: finalDocs,

        // Custom Contact Information
        custom_contacts: editFormData.customContacts,
        // Bank
        bank_name: editFormData.bankName || null,
        bank_account_number: editFormData.bankAccountNumber || null,
        bank_holder_name: editFormData.bankHolderName || null,
        bank_ifsc: editFormData.bankIfsc || null,
        bank_micr: editFormData.bankMicr || null,

        // Additional Settings
        available_hours: editFormData.availableHours,
        parking_spaces: editFormData.parkingSpaces,
        catering_allowed: editFormData.cateringAllowed,
        alcohol_allowed: editFormData.alcoholAllowed,
        smoking_allowed: editFormData.smokingAllowed
      };



      try {
        const { data, error } = await apiClient
          .from('venues')
          .update(updateData)
          .eq('id', editFormData.id)
          .select();

        if (error) {
          console.error('Supabase update error:', error);
          showNotification('Failed to update venue: ' + error.message, 'error');
        } else {


          showNotification('Venue updated successfully!', 'success');
          setShowEditModal(false);
          setEditFormData(null);
          setSelectedVenue(null);

          // Force a refetch with a small delay to ensure database has updated
          setTimeout(() => {

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

  const handleConfirmDelete = async () => {
    if (selectedVenue) {
      const { error } = await apiClient
        .from('venues')
        .delete()
        .eq('id', selectedVenue.id);

      if (error) {
        showNotification('Failed to delete venue: ' + error.message, 'error');
      } else {
        showNotification('Venue deleted successfully!', 'success');
        setShowDeleteModal(false);
        setSelectedVenue(null);
        refetch();
      }
    }
  };

  // Notification function
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

    // Animate in
    setTimeout(() => {
      notification.classList.remove('translate-x-full');
    }, 100);

    // Auto remove after 5 seconds
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

  const closeModals = () => {
    setShowViewModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
    setSelectedVenue(null);
    setEditFormData(null);
    setEditErrors({});
  };

  // Custom Contact Management Functions
  const addCustomContact = () => {
    if (!editFormData) return;

    const newContact = {
      id: Date.now().toString(),
      name: '',
      email: '',
      phone: '',
      role: ''
    };

    setEditFormData(prev => ({
      ...prev!,
      customContacts: [...(prev?.customContacts || []), newContact]
    }));
  };

  const updateCustomContact = (id: string, field: string, value: string) => {
    if (!editFormData) return;

    setEditFormData(prev => ({
      ...prev!,
      customContacts: (prev?.customContacts || []).map(contact =>
        contact.id === id ? { ...contact, [field]: value } : contact
      )
    }));
  };

  const removeCustomContact = (id: string) => {
    if (!editFormData) return;

    setEditFormData(prev => ({
      ...prev!,
      customContacts: (prev?.customContacts || []).filter(contact => contact.id !== id)
    }));
  };

  const handleEditFacilityToggle = (facility: string) => {
    if (!editFormData) return;
    setEditFormData(prev => {
      if (!prev) return prev;
      const has = prev.facilities.includes(facility);
      return {
        ...prev,
        facilities: has ? prev.facilities.filter(f => f !== facility) : [...prev.facilities, facility]
      };
    });
  };

  const handleAddCustomFacilityEdit = () => {
    if (!editFormData || !customFacility.trim()) return;
    const f = customFacility.trim();
    if (editFormData.facilities.includes(f)) return;
    setEditFormData({ ...editFormData, facilities: [...editFormData.facilities, f] });
    setCustomFacility('');
  };

  const handleRemoveCustomFacilityEdit = (facility: string) => {
    if (!editFormData || defaultFacilities.includes(facility)) return;
    setEditFormData({ ...editFormData, facilities: editFormData.facilities.filter(x => x !== facility) });
  };

  const handleEditAmenityToggle = (amenity: string) => {
    if (!editFormData) return;
    setEditFormData(prev => {
      if (!prev) return prev;
      const has = prev.amenities.includes(amenity);
      return {
        ...prev,
        amenities: has ? prev.amenities.filter(a => a !== amenity) : [...prev.amenities, amenity]
      };
    });
  };

  const handleAddCustomAmenityEdit = () => {
    if (!editFormData || !customAmenity.trim()) return;
    const a = customAmenity.trim();
    if (editFormData.amenities.includes(a)) return;
    setEditFormData({ ...editFormData, amenities: [...editFormData.amenities, a] });
    setCustomAmenity('');
  };

  const handleRemoveCustomAmenityEdit = (amenity: string) => {
    if (!editFormData || defaultAmenities.includes(amenity)) return;
    setEditFormData({ ...editFormData, amenities: editFormData.amenities.filter(x => x !== amenity) });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Venue Management</h1>
          <p className="text-gray-600">Manage venue partnerships and accounts</p>
        </div>
        <Link to="/venues/add">
          <Button className="flex items-center space-x-2 w-full sm:w-auto justify-center">
            <Plus className="h-4 w-4" />
            <span>Add Venue</span>
          </Button>
        </Link>
      </div>

      {/* Venue Stats */}
      {/* <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Venues</p>
                <p className="text-2xl font-bold text-gray-900">{venues.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <Calendar className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Upcoming Events</p>
                <p className="text-2xl font-bold text-gray-900">
                  {venues.reduce((sum, v) => sum + v.activeEvents, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Capacity</p>
                <p className="text-2xl font-bold text-gray-900">
                  {venues.reduce((sum, v) => sum + v.memberCount, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <DollarSign className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900">
                  ₹{(venues.reduce((sum, v) => sum + v.totalRevenue, 0) / 100000).toFixed(1)}L
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div> */}

      {/* Search and Filter */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search venues by name, location, or contact person..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2">
        {['active', 'pending', 'inactive'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium capitalize transition-colors duration-200 ${filter === status
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            {status === 'pending' ? 'Pending' : status === 'active' ? 'Active' : 'Inactive'}
            {/* <span className="ml-1 sm:ml-2 text-xs">
              {status === 'all' ? venues.length : venues.filter(v => v.status === status).length}
            </span> */}
          </button>
        ))}
      </div>

      {/* Venues Grid */}
      {/* <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredVenues.length > 0 ? (
          filteredVenues.map((venue) => (
            <Card key={venue.id} className="hover:shadow-md transition-shadow duration-200">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 line-clamp-1">{venue.name}</h3>
                  <Badge variant={getStatusVariant(venue.status)}>
                    {venue.status}
                  </Badge>
                </div>
                
                <div className="space-y-3 mb-4">
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">{venue.location?venue.location: venue.addressLine1 + ' ' + venue.addressLine2 + ' ' + venue.city + ' ' + venue.state + ' ' + venue.pincode}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Users className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>{venue.memberCount.toLocaleString()} capacity</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>{venue.activeEvents} Upcoming events</span>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Facilities:</p>
                  <div className="flex flex-wrap gap-1">
                    {venue.facilities.slice(0, 3).map((facility, index) => (
                      <Badge key={index} variant="default" className="text-xs">
                        {facility}
                      </Badge>
                    ))}
                    {venue.facilities.length > 3 && (
                      <Badge variant="default" className="text-xs">
                        +{venue.facilities.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                  <div className="text-sm">
                    <span className="font-medium text-gray-900">₹{venue.totalRevenue.toLocaleString()}</span>
                    <span className="text-gray-500 ml-1 hidden sm:inline">revenue</span>
                  </div>
                  <div className="flex space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => handleView(venue)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(venue)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(venue)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full">
            <Card className="bg-gray-50 border-gray-200">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Building2 className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {loading ? 'Loading venues...' : 'No venues found'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {loading 
                    ? 'Please wait while we load your venues...'
                    : searchTerm 
                      ? `No venues match your search for "${searchTerm}"`
                      : filter !== 'all'
                        ? `No venues with status "${filter}" found`
                        : 'No venues have been added yet.'
                  }
                </p>
                {!loading && (
                  <div className="space-x-2">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSearchTerm('');
                        setFilter('all');
                      }}
                    >
                      Clear Filters
                    </Button>
                    <Link to="/venues/add">
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Add First Venue
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div> */}

      {/* Venues Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">
              Venues Overview ({filteredVenues.length})
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
                <TableHead>Venue</TableHead>
                <TableHead>Contact Person</TableHead>
                {/* <TableHead className="hidden md:table-cell">Capacity</TableHead> */}
                {/* <TableHead className="hidden lg:table-cell">Active Events</TableHead> */}
                {/* <TableHead>Revenue</TableHead> */}
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVenues.map((venue) => (
                <TableRow key={venue.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium text-gray-900 line-clamp-1">{venue.name}</div>
                      <div className="text-sm text-gray-500 flex items-center">
                        <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                        {/* <span className="truncate">{venue.location}</span> */}
                        <span className="truncate">{venue.location ? venue.location : venue.addressLine1 + ' ' + venue.addressLine2 + ' ' + venue.city + ' ' + venue.state + ' ' + venue.pincode}</span>
                      </div>
                      <div className="text-sm text-gray-500 md:hidden">
                        {venue.memberCount.toLocaleString()} capacity
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{venue.contactPerson}</div>
                      <div className="text-sm text-gray-500 truncate">{venue.email}</div>
                    </div>
                  </TableCell>
                  {/* <TableCell className="hidden md:table-cell font-medium">{venue.memberCount.toLocaleString()}</TableCell> */}
                  {/* <TableCell className="hidden lg:table-cell">
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-2 text-blue-500" />
                      {venue.activeEvents}
                    </div>
                  </TableCell> */}
                  {/* <TableCell className="font-medium">₹{venue.totalRevenue.toLocaleString()}</TableCell> */}
                  <TableCell>
                    <Badge variant={getStatusVariant(venue.status)}>
                      {venue.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => handleView(venue)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(venue)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(venue)}>
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

      {/* View Venue Modal */}
      {showViewModal && selectedVenue && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">{selectedVenue.name}</h2>
                <button onClick={closeModals} className="text-gray-400 hover:text-gray-600">
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Photos Gallery */}
              <div className="mb-4">
                <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Photos ({selectedVenue.photos?.length || 0})
                </h4>

              </div>


              {selectedVenue.photos && selectedVenue.photos.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {selectedVenue.photos.map((p: any, idx: number) => (
                    <div key={idx} className="group relative bg-gray-50 rounded-lg overflow-hidden">
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="block">
                        <img
                          src={p.url}
                          alt={p.name}
                          className="w-full h-40 object-cover hover:scale-105 transition-transform duration-200"
                          onLoad={() => {
                            console.log('✅ Image loaded successfully:', p.url);
                          }}
                          onError={(e) => {
                            console.log('❌ Image failed to load:', p.url);
                            console.log('❌ Image error details:', e);
                            console.log('❌ Photo object:', p);
                            // Try alternative URL construction
                            const altUrl = p.url.replace('/storage/v1/object/public/', '/storage/v1/object/sign/');
                            console.log('🔄 Trying alternative URL:', altUrl);
                            e.currentTarget.src = altUrl;
                          }}
                        />
                      </a>

                      {/* Image info overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                          <div className="font-medium text-sm truncate mb-1">{p.name}</div>
                          <div className="text-xs text-gray-200 flex items-center justify-between">
                            <span>{p.type.split('/')[1]?.toUpperCase() || 'IMAGE'}</span>
                            <span>{p.size > 0 ? `${(p.size / 1024 / 1024).toFixed(2)} MB` : 'Size unknown'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Click indicator */}
                      <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        Click to view
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <ImageIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">No photos found</p>
                  <p className="text-sm text-gray-500">Images will appear here once uploaded to the venue-photos bucket</p>
                  <p className="text-xs text-gray-400 mt-2">Check console for debugging info</p>
                </div>
              )}

              {/* Documents List */}
              {selectedVenue.documents && selectedVenue.documents.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center"><FileText className="h-4 w-4 mr-2" />Documents</h4>
                  <div className="space-y-2">
                    {selectedVenue.documents.map((d: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="truncate">{d.name}</span>
                        <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Location</h4>
                  <div className="flex items-center text-sm">
                    <MapPin className="h-4 w-4 mr-2 text-blue-500" />
                    <span>{selectedVenue.location ? selectedVenue.location : selectedVenue.addressLine1 + ' ' + selectedVenue.addressLine2 + ' ' + selectedVenue.city + ' ' + selectedVenue.state + ' ' + selectedVenue.pincode}</span>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Contact Person</h4>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{selectedVenue.contactPerson}</div>
                    {(selectedVenue as any).contactRole && (
                      <div className="text-sm text-gray-600">
                        <Badge variant="default" className="text-xs mr-2">
                          {(selectedVenue as any).contactRole}
                        </Badge>
                      </div>
                    )}
                    <div className="text-sm text-gray-600">{selectedVenue.email}</div>
                    <div className="text-sm text-gray-600">{selectedVenue.phone}</div>
                  </div>
                </div>

                {/* Additional Contact Information */}
                {selectedVenue.customContacts && selectedVenue.customContacts.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                      <Users className="h-4 w-4 mr-2" />
                      Additional Contact Information
                    </h4>
                    <div className="space-y-3">
                      {selectedVenue.customContacts.map((contact, index) => (
                        <div key={contact.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="text-sm font-medium text-gray-900">
                              Contact Person {index + 1}
                            </h5>
                            {contact.role && (
                              <Badge variant="default" className="text-xs">
                                {contact.role}
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-gray-900">{contact.name}</div>
                            <div className="text-sm text-gray-600">{contact.email}</div>
                            <div className="text-sm text-gray-600">{contact.phone}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* <div>
                  <h4 className="font-medium text-gray-900 mb-3">Capacity</h4>
                  <div className="flex items-center text-sm">
                    <Users className="h-4 w-4 mr-2 text-blue-500" />
                    <span>{selectedVenue.memberCount.toLocaleString()} people</span>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Active Events</h4>
                  <div className="flex items-center text-sm">
                    <Calendar className="h-4 w-4 mr-2 text-blue-500" />
                    <span>{selectedVenue.activeEvents} events</span>
                  </div>
                </div> 

                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Total Revenue</h4>
                  <div className="text-2xl font-bold text-green-600">
                    ₹{selectedVenue.totalRevenue.toLocaleString()}
                  </div>
                </div>*/}

                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Status</h4>
                  <Badge variant={getStatusVariant(selectedVenue.status)} className="text-sm">
                    {selectedVenue.status.toUpperCase()}
                  </Badge>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-3">Facilities</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedVenue.facilities.map((facility, index) => (
                    <Badge key={index} variant="default" className="text-sm">
                      {facility}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-3">Amenities</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedVenue.amenities.map((amenity, index) => (
                    <Badge key={index} variant="default" className="text-sm">
                      {amenity}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-3">Created Date</h4>
                <div className="text-sm text-gray-600">
                  {new Date(selectedVenue.joinedDate || '').toLocaleDateString()}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <Button variant="outline" onClick={closeModals}>Close</Button>
              <Button className="flex items-center space-x-2" onClick={() => { closeModals(); handleEdit(selectedVenue); }}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Venue
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Venue Modal */}
      {showEditModal && editFormData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Edit Venue</h2>
                  <p className="text-gray-600">Update venue information</p>
                </div>
                <button onClick={closeModals} className="text-gray-400 hover:text-gray-600">
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="p-6">



              <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }} className="space-y-6">
                <div className="space-y-6">
                    {/* Basic Information — layout matches Add New Venue */}
                    <Card>
                      <CardHeader>
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                          <Building2 className="h-5 w-5 mr-2" />
                          Basic Information
                        </h3>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Venue Name *</label>
                          <input
                            type="text"
                            value={editFormData.name}
                            onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.name ? 'border-red-300' : 'border-gray-300'}`}
                            placeholder="Enter venue name"
                          />
                          {editErrors.name && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertCircle className="h-4 w-4 mr-1" />
                              {editErrors.name}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Address Line 1 *</label>
                          <input
                            type="text"
                            value={editFormData.addressLine1}
                            onChange={(e) => setEditFormData({ ...editFormData, addressLine1: e.target.value })}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.addressLine1 ? 'border-red-300' : 'border-gray-300'}`}
                            placeholder="Flat/Lane/Building..."
                          />
                          {editErrors.addressLine1 && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertCircle className="h-4 w-4 mr-1" />
                              {editErrors.addressLine1}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Address Line 2</label>
                          <input
                            type="text"
                            value={editFormData.addressLine2}
                            onChange={(e) => setEditFormData({ ...editFormData, addressLine2: e.target.value })}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.addressLine2 ? 'border-red-300' : 'border-gray-300'}`}
                            placeholder="Apartment, suite, etc."
                          />
                          {editErrors.addressLine2 && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertCircle className="h-4 w-4 mr-1" />
                              {editErrors.addressLine2}
                            </p>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">State *</label>
                            <select
                              value={editFormData.state}
                              onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value, city: '' })}
                              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.state ? 'border-red-300' : 'border-gray-300'}`}
                            >
                              <option value="">Select State</option>
                              {statesData.map((state) => (
                                <option key={state.id} value={state.name}>{state.name}</option>
                              ))}
                            </select>
                            {editErrors.state && (
                              <p className="mt-1 text-sm text-red-600 flex items-center">
                                <AlertCircle className="h-4 w-4 mr-1" />
                                {editErrors.state}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">City *</label>
                            <select
                              value={editFormData.city}
                              onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                              disabled={!editFormData.state}
                              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 ${editErrors.city ? 'border-red-300' : 'border-gray-300'}`}
                            >
                              <option value="">Select City</option>
                              {editFormData.state &&
                                statesData
                                  .find((s) => s.name === editFormData.state)
                                  ?.cities.map((city) => (
                                    <option key={city} value={city}>{city}</option>
                                  ))}
                            </select>
                            {editErrors.city && (
                              <p className="mt-1 text-sm text-red-600 flex items-center">
                                <AlertCircle className="h-4 w-4 mr-1" />
                                {editErrors.city}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Country *</label>
                            <select
                              value={editFormData.country}
                              onChange={(e) => setEditFormData({ ...editFormData, country: e.target.value })}
                              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.country ? 'border-red-300' : 'border-gray-300'}`}
                            >
                              {COUNTRIES.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Pincode *</label>
                            <input
                              type="text"
                              value={editFormData.pincode}
                              onChange={(e) => setEditFormData({ ...editFormData, pincode: e.target.value })}
                              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.pincode ? 'border-red-300' : 'border-gray-300'}`}
                              placeholder="6-digit PIN"
                              maxLength={6}
                            />
                            {editErrors.pincode && (
                              <p className="mt-1 text-sm text-red-600 flex items-center">
                                <AlertCircle className="h-4 w-4 mr-1" />
                                {editErrors.pincode}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                      <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">No. of Flats</label>
                            <input
                              type="number"
                              value={editFormData.noOfFlats}
                              onChange={(e) => setEditFormData({ ...editFormData, noOfFlats: parseInt(e.target.value, 10) || 0 })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Enter number of flats"
                              min={0}
                            />
                          </div>
                        </div>
                      </CardContent>
                      <CardContent className="space-y-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                          <textarea
                            value={editFormData.description}
                            onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Describe the venue and its features..."
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                            <select
                              value={editFormData.status}
                              onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as 'active' | 'inactive' | 'pending' })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="pending">Pending</option>
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                            {editErrors.status && (
                              <p className="mt-1 text-sm text-red-600 flex items-center">
                                <AlertCircle className="h-4 w-4 mr-1" />
                                {editErrors.status}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Contact Information */}
                    <Card>
                      <CardHeader>
                        <h3 className="text-lg font-semibold text-gray-900">Contact Information</h3>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Contact Person *</label>
                            <input
                              type="text"
                              value={editFormData.contactPerson}
                              onChange={(e) => setEditFormData({ ...editFormData, contactPerson: e.target.value })}
                              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.contactPerson ? 'border-red-300' : 'border-gray-300'}`}
                              placeholder="Enter contact person name"
                            />
                            {editErrors.contactPerson && (
                              <p className="mt-1 text-sm text-red-600 flex items-center">
                                <AlertCircle className="h-4 w-4 mr-1" />
                                {editErrors.contactPerson}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                            <input
                              type="text"
                              value={editFormData.contactRole}
                              onChange={(e) => setEditFormData({ ...editFormData, contactRole: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Manager, Coordinator, etc."
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                              <input
                                type="email"
                                value={editFormData.email}
                                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                                className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.email ? 'border-red-300' : 'border-gray-300'}`}
                                placeholder="Enter email address"
                              />
                            </div>
                            {editErrors.email && (
                              <p className="mt-1 text-sm text-red-600 flex items-center">
                                <AlertCircle className="h-4 w-4 mr-1" />
                                {editErrors.email}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">+91</span>
                              <input
                                type="tel"
                                value={editFormData.phone}
                                onChange={(e) =>
                                  setEditFormData({
                                    ...editFormData,
                                    phone: sanitizePhoneInput(e.target.value),
                                  })
                                }
                                maxLength={10}
                                inputMode="numeric"
                                className={`w-full pl-14 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${editErrors.phone ? 'border-red-300' : 'border-gray-300'}`}
                                placeholder="9876543210"
                              />
                            </div>
                            {editErrors.phone && (
                              <p className="mt-1 text-sm text-red-600 flex items-center">
                                <AlertCircle className="h-4 w-4 mr-1" />
                                {editErrors.phone}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Maximum Capacity *
                          </label>
                          <input
                            type="number"
                            value={editFormData.memberCount}
                            onChange={(e) => setEditFormData({...editFormData, memberCount: parseInt(e.target.value) || 0})}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              editErrors.memberCount ? 'border-red-300' : 'border-gray-300'
                            }`}
                            placeholder="Enter maximum capacity"
                            min="1"
                          />
                          {editErrors.memberCount && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <AlertCircle className="h-4 w-4 mr-1" />
                              {editErrors.memberCount}
                            </p>
                          )}
                        </div> */}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                            <Users className="h-5 w-5 mr-2" />
                            Additional Contact Information
                          </h3>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addCustomContact}
                            className="flex items-center space-x-2"
                          >
                            <Plus className="h-4 w-4" />
                            <span>Add Contact</span>
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {editFormData.customContacts.length === 0 ? (
                          <div className="text-center text-gray-500">
                            <p className="text-sm">Click "Add Contact" to add multiple contact persons</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {editFormData.customContacts.map((contact, index) => (
                              <div key={contact.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                <div className="flex items-center justify-between mb-4">
                                  <h4 className="text-sm font-medium text-gray-900">
                                    Contact Person {index + 1}
                                  </h4>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => removeCustomContact(contact.id)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Name
                                    </label>
                                    <input
                                      type="text"
                                      value={contact.name}
                                      onChange={(e) => updateCustomContact(contact.id, 'name', e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      placeholder="Enter contact name"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Role
                                    </label>
                                    <input
                                      type="text"
                                      value={contact.role}
                                      onChange={(e) => updateCustomContact(contact.id, 'role', e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      placeholder="Manager, Coordinator, etc."
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Email
                                    </label>
                                    <input
                                      type="email"
                                      value={contact.email}
                                      onChange={(e) => updateCustomContact(contact.id, 'email', e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      placeholder="Enter email address"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Phone
                                    </label>
                                    <input
                                      type="tel"
                                      value={contact.phone}
                                      onChange={(e) => updateCustomContact(contact.id, 'phone', e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      placeholder="+91-9876543210"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {editFormData.customContacts.length > 0 && (
                          <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                            <p className="flex items-center">
                              <Info className="h-4 w-4 mr-2 flex-shrink-0" />
                              Additional contacts will be stored with the venue and can be used for event coordination.
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Facilities & Amenities — same control style as Add New Venue */}
                    <Card>
                      <CardHeader>
                        <h3 className="text-lg font-semibold text-gray-900">Facilities & Amenities</h3>
                      </CardHeader>
                      <CardContent className="space-y-8">
                        <div>
                          <h4 className="text-md font-medium text-gray-800 mb-4">Facilities</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {defaultFacilities.map((facility) => (
                              <label key={facility} className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editFormData.facilities.includes(facility)}
                                  onChange={() => handleEditFacilityToggle(facility)}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <span className="text-sm text-gray-700">{facility}</span>
                              </label>
                            ))}
                          </div>
                          <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Add Custom Facility</label>
                            <div className="flex space-x-2">
                              <input
                                type="text"
                                value={customFacility}
                                onChange={(e) => setCustomFacility(e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Enter custom facility"
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustomFacilityEdit())}
                              />
                              <Button type="button" onClick={handleAddCustomFacilityEdit} variant="outline" className="flex items-center space-x-2">
                                <Plus className="h-4 w-4" />
                                <span>Add</span>
                              </Button>
                            </div>
                          </div>
                          {editFormData.facilities.filter((f) => !defaultFacilities.includes(f)).length > 0 && (
                            <div className="mt-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Custom Facilities</label>
                              <div className="flex flex-wrap gap-2">
                                {editFormData.facilities
                                  .filter((f) => !defaultFacilities.includes(f))
                                  .map((facility) => (
                                    <div key={facility} className="flex items-center space-x-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-md">
                                      <span className="text-sm">{facility}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveCustomFacilityEdit(facility)}
                                        className="text-blue-600 hover:text-blue-800"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="border-t border-gray-200 pt-6">
                          <h4 className="text-md font-medium text-gray-800 mb-4">Amenities</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {defaultAmenities.map((amenity) => (
                              <label key={amenity} className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editFormData.amenities.includes(amenity)}
                                  onChange={() => handleEditAmenityToggle(amenity)}
                                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                                />
                                <span className="text-sm text-gray-700">{amenity}</span>
                              </label>
                            ))}
                          </div>
                          <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Add Custom Amenity</label>
                            <div className="flex space-x-2">
                              <input
                                type="text"
                                value={customAmenity}
                                onChange={(e) => setCustomAmenity(e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                placeholder="Enter custom amenity"
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustomAmenityEdit())}
                              />
                              <Button type="button" onClick={handleAddCustomAmenityEdit} variant="outline" className="flex items-center space-x-2">
                                <Plus className="h-4 w-4" />
                                <span>Add</span>
                              </Button>
                            </div>
                          </div>
                          {editFormData.amenities.filter((a) => !defaultAmenities.includes(a)).length > 0 && (
                            <div className="mt-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Custom Amenities</label>
                              <div className="flex flex-wrap gap-2">
                                {editFormData.amenities
                                  .filter((a) => !defaultAmenities.includes(a))
                                  .map((amenity) => (
                                    <div key={amenity} className="flex items-center space-x-1 bg-green-100 text-green-800 px-2 py-1 rounded-md">
                                      <span className="text-sm">{amenity}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveCustomAmenityEdit(amenity)}
                                        className="text-green-600 hover:text-green-800"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Bank Details */}
                    <Card>
                      <CardHeader>
                        <h3 className="text-lg font-semibold text-gray-900">Bank Details</h3>
                        <p className="text-sm text-gray-500 mt-1">Optional — leave blank if not available.</p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                            <input type="text" value={editFormData.bankName} onChange={(e) => setEditFormData({ ...editFormData, bankName: e.target.value })} className={`w-full px-3 py-2 border rounded-lg ${editErrors.bankName ? 'border-red-300' : 'border-gray-300'}`} placeholder="Enter bank name" />
                            {editErrors.bankName && (<p className="mt-1 text-sm text-red-600 flex items-center"><AlertCircle className="h-4 w-4 mr-1" />{editErrors.bankName}</p>)}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account Number</label>
                            <input type="text" value={editFormData.bankAccountNumber} onChange={(e) => setEditFormData({ ...editFormData, bankAccountNumber: e.target.value })} className={`w-full px-3 py-2 border rounded-lg ${editErrors.bankAccountNumber ? 'border-red-300' : 'border-gray-300'}`} placeholder="Enter bank account number" />
                            {editErrors.bankAccountNumber && (<p className="mt-1 text-sm text-red-600 flex items-center"><AlertCircle className="h-4 w-4 mr-1" />{editErrors.bankAccountNumber}</p>)}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Holder Name</label>
                            <input type="text" value={editFormData.bankHolderName} onChange={(e) => setEditFormData({ ...editFormData, bankHolderName: e.target.value })} className={`w-full px-3 py-2 border rounded-lg ${editErrors.bankHolderName ? 'border-red-300' : 'border-gray-300'}`} placeholder="Enter bank holder name" />
                            {editErrors.bankHolderName && (<p className="mt-1 text-sm text-red-600 flex items-center"><AlertCircle className="h-4 w-4 mr-1" />{editErrors.bankHolderName}</p>)}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Bank IFSC</label>
                            <input type="text" value={editFormData.bankIfsc} onChange={(e) => setEditFormData({ ...editFormData, bankIfsc: e.target.value })} className={`w-full px-3 py-2 border rounded-lg ${editErrors.bankIfsc ? 'border-red-300' : 'border-gray-300'}`} placeholder="Enter bank IFSC" />
                            {editErrors.bankIfsc && (<p className="mt-1 text-sm text-red-600 flex items-center"><AlertCircle className="h-4 w-4 mr-1" />{editErrors.bankIfsc}</p>)}
                          </div>
                          {/* <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">MICR *</label>
                             <input type="text" value={editFormData.bankMicr} onChange={(e)=>setEditFormData({...editFormData, bankMicr: e.target.value})} className={`w-full px-3 py-2 border rounded-lg ${editErrors.bankMicr ? 'border-red-300' : 'border-gray-300'}`} />
                             {editErrors.bankMicr && (<p className="mt-1 text-sm text-red-600 flex items-center"><AlertCircle className="h-4 w-4 mr-1" />{editErrors.bankMicr}</p>)}
                           </div> */}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Venue Photos — same structure as Add New Venue */}
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900">Venue Photos</h3>
                        <p className="text-sm text-gray-600">Upload JPG, JPEG, PNG files up to 5 MB each</p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <div
                            className="border-2 border-dashed rounded-lg p-4 text-center text-gray-500 hover:bg-gray-50 cursor-pointer"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const files = Array.from(e.dataTransfer.files).filter((f) => /image\/(jpeg|jpg|png)/i.test(f.type) && f.size <= 5 * 1024 * 1024);
                              if (files.length) {
                                setEditFormData({
                                  ...editFormData,
                                  photos: [
                                    ...editFormData.photos,
                                    ...files.map((f: any) => ({ name: f.name, url: URL.createObjectURL(f), type: f.type, size: f.size, _file: f }))
                                  ] as any
                                });
                              }
                            }}
                          >
                            Drag & drop images here or
                            <label className="text-blue-600 ml-1 underline cursor-pointer">
                              browse
                              <input type="file" accept="image/jpeg,image/jpg,image/png" multiple className="hidden" onChange={(e) => {
                                const files = Array.from(e.target.files || []).filter((f) => /image\/(jpeg|jpg|png)/i.test(f.type) && f.size <= 5 * 1024 * 1024);
                                if (files.length) {
                                  setEditFormData({
                                    ...editFormData,
                                    photos: [
                                      ...editFormData.photos,
                                      ...files.map((f: any) => ({ name: f.name, url: URL.createObjectURL(f), type: f.type, size: f.size, _file: f }))
                                    ] as any
                                  });
                                }
                              }} />
                            </label>
                          </div>



                          {editFormData.photos && editFormData.photos.length > 0 ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3">
                              {/* {console.log('🔍 Photos in editFormData:', editFormData.photos)} */}
                              {editFormData.photos.map((p: any, idx: number) => (
                                <div key={idx} className="relative group bg-gray-50 rounded-lg overflow-hidden">
                                  <img
                                    src={p.url}
                                    alt={p.name}
                                    className="w-full h-36 object-cover hover:scale-105 transition-transform duration-200"
                                    onLoad={() => {
                                      console.log('✅ Edit modal image loaded successfully:', p.url);
                                    }}
                                    onError={(e) => {
                                      console.log('❌ Edit modal image failed to load:', p.url);
                                      console.log('❌ Photo object:', p);
                                      // Try alternative URL construction
                                      const altUrl = p.url.replace('/storage/v1/object/public/', '/storage/v1/object/sign/');
                                      console.log('🔄 Trying alternative URL in edit modal:', altUrl);
                                      e.currentTarget.src = altUrl;
                                    }}
                                  />

                                  {/* Remove button */}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const photoToRemove = editFormData.photos[idx];


                                      // Remove from local state
                                      setEditFormData({
                                        ...editFormData,
                                        photos: editFormData.photos.filter((_, i) => i !== idx)
                                      });


                                    }}
                                    className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>

                                  {/* Image info overlay */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    <div className="absolute bottom-0 left-0 right-0 p-2 text-white">
                                      <div className="text-xs font-medium truncate mb-1">{p.name}</div>
                                      <div className="text-xs text-gray-200">
                                        {p.type.split('/')[1]?.toUpperCase() || 'IMAGE'} • {p.size > 0 ? `${(p.size / 1024 / 1024).toFixed(2)} MB` : 'Size unknown'}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
                              <ImageIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                              <p className="text-sm text-gray-600">No photos uploaded yet</p>
                              <p className="text-xs text-gray-500">Upload photos to showcase your venue</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Venue Documents */}
                    <Card>
                      <CardHeader>
                        <h3 className="text-lg font-semibold text-gray-900">Venue Documents</h3>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 gap-2">
                          <div className="flex flex-row items-center justify-between flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" className="w-fit flex items-center space-x-2" onClick={() => setEditFormData({ ...editFormData, documents: [...editFormData.documents, { name: '', url: '', type: '', size: 0, _file: null } as any] })}>
                              <Plus className="h-4 w-4" />
                              <span>Add Document</span>
                            </Button>
                            <p className="text-sm text-gray-600">Accepted: PDF or images. Max 10MB per file</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                            {editFormData.documents && editFormData.documents.length > 0 ? (
                              <div className="space-y-2 text-sm">
                                {editFormData.documents.map((d: any, idx: number) => (
                                  <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center border rounded p-2">
                                    <input
                                      type="text"
                                      value={d.name}
                                      onChange={(e) => {
                                        const docs = [...editFormData.documents] as any[];
                                        docs[idx] = { ...docs[idx], name: e.target.value };
                                        setEditFormData({ ...editFormData, documents: docs as any });
                                      }}
                                      placeholder="Document name"
                                      className="w-full px-3 py-2 border rounded-lg"
                                    />
                                    <input
                                      type="file"
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (!f) return;
                                        const allowed = f.type === 'application/pdf' || f.type === 'application/octet-stream' || /image\/(jpeg|jpg|png)/i.test(f.type);
                                        const valid = f.size <= 10 * 1024 * 1024;
                                        if (!allowed || !valid) return;
                                        const docs = [...editFormData.documents] as any[];
                                        docs[idx] = { ...docs[idx], url: URL.createObjectURL(f), type: f.type, size: f.size, _file: f };
                                        setEditFormData({ ...editFormData, documents: docs as any });
                                      }}
                                    />
                                    <div className="flex items-center justify-between">
                                      <span className="text-gray-600">{d.size ? `${(d.size / 1024 / 1024).toFixed(2)} MB` : 'No file selected'}</span>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const docToRemove = editFormData.documents[idx];


                                          // Remove from local state
                                          setEditFormData({
                                            ...editFormData,
                                            documents: editFormData.documents.filter((_, i) => i !== idx)
                                          });

                                          // TODO: Optionally delete from storage bucket if needed

                                        }}
                                        className="text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
                                <FileText className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                                <p className="text-sm text-gray-600">No documents uploaded yet</p>
                                <p className="text-xs text-gray-500">Upload documents like permits, licenses, etc.</p>
                              </div>
                            )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Extra venue details, map text & policies (fields not on main Add form card) */}
                    <Card>
                      <CardHeader>
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                          <MapPin className="h-5 w-5 mr-2" />
                          Venue details & location
                        </h3>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Landmark</label>
                            <input
                              type="text"
                              value={editFormData.addressLandmark}
                              onChange={(e) => setEditFormData({ ...editFormData, addressLandmark: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Near hospital/mall etc."
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Location (summary)</label>
                            <input
                              type="text"
                              value={editFormData.location}
                              onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="City, State, Country"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Standard Address Format</label>
                          <textarea
                            value={editFormData.addressStandard}
                            onChange={(e) => setEditFormData({ ...editFormData, addressStandard: e.target.value })}
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="123, Street, City, PIN"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Area (sq ft)
                            </label>
                            <input
                              type="number"
                              value={editFormData.areaSqFt}
                              onChange={(e) => setEditFormData({ ...editFormData, areaSqFt: parseInt(e.target.value) || 0 })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Total area"
                              min="0"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Kind of Space
                            </label>
                            <input
                              type="text"
                              value={editFormData.kindOfSpace}
                              onChange={(e) => setEditFormData({ ...editFormData, kindOfSpace: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="e.g., Indoor, Outdoor, Mixed"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Pricing Per Day
                            </label>
                            <input
                              type="number"
                              value={editFormData.pricingPerDay}
                              onChange={(e) => setEditFormData({ ...editFormData, pricingPerDay: parseInt(e.target.value) || 0 })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Daily rate"
                              min="0"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Facility Area (sq ft)
                            </label>
                            <input
                              type="number"
                              value={editFormData.facilityAreaSqFt}
                              onChange={(e) => setEditFormData({ ...editFormData, facilityAreaSqFt: parseInt(e.target.value, 10) || 0 })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Enter facility area"
                              min={0}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              No. of Stalls
                            </label>
                            <input
                              type="number"
                              value={editFormData.noOfStalls}
                              onChange={(e) => setEditFormData({ ...editFormData, noOfStalls: parseInt(e.target.value) || 0 })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Available stalls"
                              min="0"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Available Hours
                            </label>
                            <input
                              type="text"
                              value={editFormData.availableHours}
                              onChange={(e) => setEditFormData({ ...editFormData, availableHours: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="e.g., 9:00 AM - 11:00 PM"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Parking Spaces
                            </label>
                            <input
                              type="number"
                              value={editFormData.parkingSpaces}
                              onChange={(e) => setEditFormData({ ...editFormData, parkingSpaces: parseInt(e.target.value) || 0 })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Available parking spaces"
                              min="0"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={editFormData.isCovered}
                              onChange={(e) => setEditFormData({ ...editFormData, isCovered: e.target.checked })}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Covered Space</span>
                          </label>

                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={editFormData.facilityCovered}
                              onChange={(e) => setEditFormData({ ...editFormData, facilityCovered: e.target.checked })}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Facility Covered</span>
                          </label>

                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={editFormData.cateringAllowed}
                              onChange={(e) => setEditFormData({ ...editFormData, cateringAllowed: e.target.checked })}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Catering Allowed</span>
                          </label>

                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={editFormData.alcoholAllowed}
                              onChange={(e) => setEditFormData({ ...editFormData, alcoholAllowed: e.target.checked })}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Alcohol Allowed</span>
                          </label>

                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={editFormData.smokingAllowed}
                              onChange={(e) => setEditFormData({ ...editFormData, smokingAllowed: e.target.checked })}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Smoking Allowed</span>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                            <input
                              type="number"
                              step="any"
                              value={editFormData.latitude}
                              onChange={(e) => setEditFormData({ ...editFormData, latitude: parseFloat(e.target.value) || 0 })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Latitude"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                            <input
                              type="number"
                              step="any"
                              value={editFormData.longitude}
                              onChange={(e) => setEditFormData({ ...editFormData, longitude: parseFloat(e.target.value) || 0 })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Longitude"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Formatted Address</label>
                          <textarea
                            rows={2}
                            value={editFormData.formattedAddress}
                            onChange={(e) => setEditFormData({ ...editFormData, formattedAddress: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Google formatted address"
                          />
                        </div>
                      </CardContent>
                    </Card>
                </div>
                <div className="space-y-3">
                  <Button
                    type="submit"
                    className="w-full flex items-center justify-center space-x-2"
                  >
                    <Save className="h-4 w-4" />
                    <span>Save Changes</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeModals}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedVenue && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Delete Venue</h3>
                  <p className="text-sm text-gray-600">This action cannot be undone</p>
                </div>
              </div>

              <p className="text-gray-700 mb-6">
                Are you sure you want to delete "<strong>{selectedVenue.name}</strong>"?
                This will permanently remove the venue and all associated data.
              </p>

              <div className="flex justify-end space-x-3">
                <Button variant="outline" onClick={closeModals}>Cancel</Button>
                <Button variant="danger" onClick={handleConfirmDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Venue
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};