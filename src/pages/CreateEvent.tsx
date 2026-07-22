import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../lib/apiClient';
import { validateEmail, validatePhone, validatePinCode, validateRequiredText, validateNumber } from '../utils/validation';
import {
  Save,
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Clock,
  AlertCircle,
  CheckCircle,
  Info,
  Building2,
  User,
  Upload,
  X,
  Image,
  DollarSign,
  IndianRupeeIcon,
  Trash2
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { useAuth } from '../contexts/AuthContext';
import { useVenues, useVendors, useExhibitors } from '../hooks/useSupabaseData';
import { useOrganizations } from '../hooks/useOrganizations';
import { OrganizationSelect, resolveOrganizationId } from '../components/UI/OrganizationSelect';
// @ts-ignore
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker, MobileTimePicker } from '@mui/x-date-pickers';
import dayjs, { Dayjs } from 'dayjs';

interface StallConfigRow {
  id: string;
  stallNo: string;
  stallSize: string;
  stallCategory: string;
  price: number;
}

interface FormData {
  title: string;
  description: string;
  eventDate: string;
  eventEndDate: string;
  eventTime: string;
  eventEndTime: string;
  venueId: string;
  venueName: string;
  organizationId: string;
  city: string;
  maxCapacity: number;
  planType: 'Plan A' | 'Plan B' | 'Plan C' | 'Custom';
  status: 'draft' | 'published' | 'ongoing' | 'completed' | 'cancelled';
  attendees: number;
  totalRevenue: number;
  // Image Field
  eventImage: File | null;
  eventImageUrl: string;
  // Multiple Event Images Field
  eventImages: File[];
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
}

interface FormErrors {
  [key: string]: string;
}

const planTypes = [
  { value: 'Plan A', label: 'Plan A - Basic Package', description: 'Essential event setup with basic amenities' },
  { value: 'Plan B', label: 'Plan B - Standard Package', description: 'Enhanced setup with additional services' },
  { value: 'Plan C', label: 'Plan C - Premium Package', description: 'Full-service premium event experience' },
  { value: 'Custom', label: 'Custom Package', description: 'Tailored solution for specific requirements' }
];

export const CreateEvent: React.FC = () => {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const { organizations } = useOrganizations();
  const { venues, loading: venuesLoading } = useVenues();
  const activeVenues = venues.filter(
    (venue) => (venue.status || '').toString().toLowerCase() === 'active'
  );
  const { vendors, loading: vendorsLoading } = useVendors();
  // const { exhibitors, loading: exhibitorsLoading } = useExhibitors();
  
  // Debug vendor data
  console.log('🔍 CreateEvent - Vendors loaded:', vendors.length, vendors);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Helper: format date as dd/MM/yyyy
  const formatDDMMYYYY = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  // Helper: compute clock hand rotation from HH:mm
  const getClockAngle = (time: string) => {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return (h % 12) * 30 + (m / 60) * 30; // hour hand
  };

  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    eventDate: '',
    eventEndDate: '',
    eventTime: '',
    eventEndTime: '',
    venueId: '',
    venueName: '',
    organizationId: '',
    city: '',
    maxCapacity: 100,
    planType: 'Plan A',
    status: 'draft',
    attendees: 0,
    totalRevenue: 0,
    // Image Field
    eventImage: null,
    eventImageUrl: '',
    // Multiple Event Images Field
    eventImages: [],
    eventImageUrls: [],
    // Layout Image Field
    layoutImage: null,
    layoutImageUrl: '',
    // Venue Facilities & Amenities
    venueFacilities: [],
    venueAmenities: [],
    // Selected Facilities & Amenities for Event
    selectedFacilities: [],
    selectedAmenities: [],
    // Stalls Configuration
    noOfStalls: 0,
    stallSize: '',
    stallCategory: '',
    // Pricing & Availability
    pricePerHour: 0,
    availableHours: '',
    parkingSpaces: 0,
    cateringAllowed: false,
    alcoholAllowed: false,
    smokingAllowed: false,
    // Unified stall config
    allStalls: []
  });

  // Vendors/Exhibitors selection
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [selectedExhibitors, setSelectedExhibitors] = useState<string[]>([]);

  const toggleVendor = (id: string) => {
    setSelectedVendors(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const toggleExhibitor = (id: string) => {
    setSelectedExhibitors(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const [errors, setErrors] = useState<FormErrors>({});
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [bulkStallSize, setBulkStallSize] = useState('');
  const [bulkStallCategory, setBulkStallCategory] = useState('');
  const [bulkStallPrice, setBulkStallPrice] = useState<number>(0);
  const [bulkStallQty, setBulkStallQty] = useState<number>(1);
  const [bulkStallPrefix, setBulkStallPrefix] = useState('A');

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Title validation
    if (!formData.title.trim()) {
      newErrors.title = 'Event title is required';
    } else if (formData.title.trim().length < 3) {
      newErrors.title = 'Event title must be at least 3 characters';
    }

    // Description validation
    if (!formData.description.trim()) {
      newErrors.description = 'Event description is required';
    } else if (formData.description.trim().length < 10) {
      newErrors.description = 'Description must be at least 10 characters';
    }

    // Date validation
    if (!formData.eventDate) {
      newErrors.eventDate = 'Event start date is required';
    } else {
      const eventDate = new Date(formData.eventDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (eventDate < today) {
        newErrors.eventDate = 'Event start date cannot be in the past';
      }
    }

    // End date validation
    if (!formData.eventEndDate) {
      newErrors.eventEndDate = 'Event end date is required';
    } else if (formData.eventDate && formData.eventEndDate) {
      const startDate = new Date(formData.eventDate);
      const endDate = new Date(formData.eventEndDate);

      if (endDate < startDate) {
        newErrors.eventEndDate = 'Event end date cannot be before start date';
      }
    }

    // Time validation
    if (!formData.eventTime) {
      newErrors.eventTime = 'Event start time is required';
    }

    if (!formData.eventEndTime) {
      newErrors.eventEndTime = 'Event end time is required';
    }

    // Venue validation
    if (!formData.venueId) {
      newErrors.venueId = 'Please select a venue';
    }

    if (isSuperAdmin && !formData.organizationId) {
      newErrors.organizationId = 'Organization is required';
    }

    // City validation
    // if (!formData.city.trim()) {
    //   newErrors.city = 'City is required';
    // }

    // Capacity validation
    if (formData.maxCapacity < 10) {
      newErrors.maxCapacity = 'Maximum capacity must be at least 10';
    }

    // Image validation - Make optional for now
    // if (!formData.eventImage && !formData.eventImageUrl) {
    //   newErrors.eventImage = 'Event Flyers is required';
    // }

    // Pricing validation
    if (formData.pricePerHour < 0) {
      newErrors.pricePerHour = 'Price per hour cannot be negative';
    }

    if (formData.parkingSpaces < 0) {
      newErrors.parkingSpaces = 'Parking spaces cannot be negative';
    }

    // Ensure stall allocation matches number of stalls
    const totalConfigured = formData.allStalls.length;
    if (formData.noOfStalls < 0) {
      newErrors.noOfStalls = 'Number of stalls cannot be negative';
    } else if (formData.noOfStalls > 0 && totalConfigured !== formData.noOfStalls) {
      newErrors.noOfStalls = `Configured stalls (${totalConfigured}) must equal Number of Stalls (${formData.noOfStalls})`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Real-time validation
    let validationResult = null;
    
    switch (field) {
      case 'title':
        validationResult = validateRequiredText(value, 'Event title', 3, 100);
        break;
      case 'description':
        validationResult = validateRequiredText(value, 'Event description', 10, 1000);
        break;
      case 'city':
        validationResult = validateRequiredText(value, 'City', 2, 50);
        break;
      case 'maxCapacity':
        validationResult = validateNumber(value, 'Maximum capacity', 10, 10000);
        break;
      case 'noOfStalls':
        validationResult = validateNumber(value, 'Number of stalls', 0, 1000);
        break;
      case 'pricePerHour':
        validationResult = validateNumber(value, 'Price per hour', 0, 100000);
        break;
      case 'parkingSpaces':
        validationResult = validateNumber(value, 'Parking spaces', 0, 10000);
        break;
    }

    // Update errors based on validation result
    if (validationResult && !validationResult.isValid) {
      setErrors(prev => ({ ...prev, [field]: validationResult.message }));
    } else if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }

    // Auto-populate venue name, city, and org (for super admin) when venue is selected
    if (field === 'venueId' && value) {
      const selectedVenue = activeVenues.find(v => v.id === value);

      if (selectedVenue) {
        const updatedData: Partial<FormData> = {
          venueName: selectedVenue.name,
          city: selectedVenue.city ? selectedVenue.city : selectedVenue.location?.split(',').pop()?.trim() || '',
          maxCapacity: selectedVenue.memberCount || 100,
          venueFacilities: selectedVenue.facilities || [],
          venueAmenities: selectedVenue.amenities || [],
          noOfStalls: selectedVenue.noOfStalls || 0,
        };
        if (isSuperAdmin && selectedVenue.organizationId) {
          updatedData.organizationId = selectedVenue.organizationId;
        }

        setFormData(prev => ({
          ...prev,
          ...updatedData,
        }));
      }
    }
  };

  const handleImageUpload = (file: File) => {

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setErrors(prev => ({ ...prev, eventImage: 'Please select a valid image file' }));
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, eventImage: 'Image size must be less than 5MB' }));
      return;
    }


    const imageUrl = URL.createObjectURL(file);

    setFormData(prev => ({
      ...prev,
      eventImage: file,
      eventImageUrl: imageUrl
    }));

    // Clear error
    if (errors.eventImage) {
      setErrors(prev => ({ ...prev, eventImage: '' }));
    }

  };

  const removeImage = () => {
    setFormData(prev => ({
      ...prev,
      eventImage: null,
      eventImageUrl: ''
    }));
  };

  const handleMultipleImageUpload = async (files: File[]) => {
    // Validate number of files (max 10)
    if (files.length > 10) {
      setErrors(prev => ({ ...prev, eventImage: 'Maximum 10 images allowed' }));
      return;
    }

    // Validate each file
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setErrors(prev => ({ ...prev, eventImage: 'Please select valid image files only' }));
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setErrors(prev => ({ ...prev, eventImage: 'Each image must be less than 5MB' }));
        return;
      }
    }

    try {
      const newImageUrls: string[] = [];
      const newImages: File[] = [];

      for (const file of files) {
        const imageUrl = URL.createObjectURL(file);
        newImageUrls.push(imageUrl);
        newImages.push(file);
      }

      setFormData(prev => ({
        ...prev,
        eventImages: [...prev.eventImages, ...newImages],
        eventImageUrls: [...prev.eventImageUrls, ...newImageUrls]
      }));

      // Clear error
      if (errors.eventImage) {
        setErrors(prev => ({ ...prev, eventImage: '' }));
      }
    } catch (error) {
      console.error('Error processing images:', error);
      setErrors(prev => ({ ...prev, eventImage: 'Error processing images' }));
    }
  };

  const removeImageAtIndex = (index: number) => {
    setFormData(prev => {
      const newImages = [...prev.eventImages];
      const newImageUrls = [...prev.eventImageUrls];
      
      // Revoke the object URL to free memory
      URL.revokeObjectURL(newImageUrls[index]);
      
      newImages.splice(index, 1);
      newImageUrls.splice(index, 1);
      
      return {
        ...prev,
        eventImages: newImages,
        eventImageUrls: newImageUrls
      };
    });
  };

  const handleLayoutImageUpload = (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setErrors(prev => ({ ...prev, layoutImage: 'Please select a valid image file' }));
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, layoutImage: 'Image size must be less than 5MB' }));
      return;
    }

    const imageUrl = URL.createObjectURL(file);

    setFormData(prev => ({
      ...prev,
      layoutImage: file,
      layoutImageUrl: imageUrl
    }));

    // Clear error
    if (errors.layoutImage) {
      setErrors(prev => ({ ...prev, layoutImage: '' }));
    }
  };

  const removeLayoutImage = () => {
    setFormData(prev => ({
      ...prev,
      layoutImage: null,
      layoutImageUrl: ''
    }));
  };

  const handleFacilityToggle = (facility: string) => {
    setFormData(prev => ({
      ...prev,
      selectedFacilities: prev.selectedFacilities.includes(facility)
        ? prev.selectedFacilities.filter(f => f !== facility)
        : [...prev.selectedFacilities, facility]
    }));
  };

  const handleAmenityToggle = (amenity: string) => {
    setFormData(prev => ({
      ...prev,
      selectedAmenities: prev.selectedAmenities.includes(amenity)
        ? prev.selectedAmenities.filter(a => a !== amenity)
        : [...prev.selectedAmenities, amenity]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('🚀 Event creation started...');
    console.log('📋 Form data:', formData);

    if (!validateForm()) {
      console.log('❌ Form validation failed');
      console.log('🔍 Validation errors:', errors);
      return;
    }

    console.log('✅ Form validation passed');
    setIsSubmitting(true);

    try {
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

      const isRemote = (url: string) => /^https?:\/\//i.test(url.trim());

      const finalImageUrls: string[] = [];
      for (let i = 0; i < formData.eventImageUrls.length; i++) {
        const url = (formData.eventImageUrls[i] || '').trim();
        const file = formData.eventImages[i];
        if (isRemote(url)) {
          finalImageUrls.push(url);
        } else if (file instanceof File) {
          const uploaded = await uploadFlyerFile(file);
          if (uploaded) finalImageUrls.push(uploaded);
        }
      }
      if (finalImageUrls.length === 0 && formData.eventImage instanceof File) {
        const uploaded = await uploadFlyerFile(formData.eventImage);
        if (uploaded) finalImageUrls.push(uploaded);
      }

      let layoutImageUrl = formData.layoutImageUrl;

      // Upload layout image to Supabase storage if a new layout image is selected
      if (formData.layoutImage) {
        try {
          const fileExt = formData.layoutImage.name.split('.').pop();
          const fileName = `layout_${Date.now()}.${fileExt}`;
          const filePath = `event-images/${fileName}`;

          console.log('📤 Attempting layout image upload:', filePath);

          const { data: uploadData, error: uploadError } = await apiClient.storage
            .from('event-images')
            .upload(filePath, formData.layoutImage);

          if (uploadError) {
            console.error('❌ Layout image upload failed:', uploadError);
            // Continue without layout image upload for now
            layoutImageUrl = formData.layoutImageUrl || '';
          } else {
            console.log('✅ Layout image upload successful:', uploadData.path);
            const { data: urlData } = apiClient.storage
              .from('event-images')
              .getPublicUrl(filePath);
            layoutImageUrl = urlData.publicUrl;
          }
        } catch (error) {
          console.error('❌ Layout image upload error:', error);
          // Continue without layout image upload
          layoutImageUrl = formData.layoutImageUrl || '';
        }
      } else {
        layoutImageUrl = formData.layoutImageUrl || '';
      }

      // Sanitize status to match DB constraint
      const allowedStatuses = ['draft', 'published', 'ongoing', 'completed', 'cancelled'];
      const normalizedStatus = formData.status === 'published'
        ? 'published'
        : (allowedStatuses.includes(formData.status as any) ? formData.status : 'draft');

      const insertData = {
        title: formData.title,
        description: formData.description,
        event_date: formData.eventDate,
        event_end_date: formData.eventEndDate,
        event_time: formData.eventTime,
        event_end_time: formData.eventEndTime,
        venue_id: formData.venueId,
        venue_name: formData.venueName,
        city: formData.city,
        max_capacity: formData.maxCapacity,
        plan_type: formData.planType,
        status: normalizedStatus,
        attendees: formData.attendees,
        total_revenue: formData.totalRevenue,
        created_by: user?.id || null,
        organization_id: resolveOrganizationId(isSuperAdmin, formData.organizationId, user?.organizationId),
        vendor_ids: selectedVendors,
        exhibitor_ids: selectedExhibitors,
        // Image field - store as JSON array for multiple images
        event_image_url: finalImageUrls.length > 0 ? JSON.stringify(finalImageUrls) : '',
        // Layout image field
        layout_image_url: layoutImageUrl,
        // Pricing & Availability
        price_per_hour: formData.pricePerHour,
        available_hours: formData.availableHours,
        parking_spaces: formData.parkingSpaces,
        catering_allowed: formData.cateringAllowed,
        alcohol_allowed: formData.alcoholAllowed,
        smoking_allowed: formData.smokingAllowed,
        // Stalls Configuration
        no_of_stalls: formData.noOfStalls,
        in_site_stalls: formData.allStalls, // Store as JSONB array
        all_stalls: formData.allStalls.map(stall => stall.stallNo) // Store stall numbers as string array
      };


      console.log('📤 Inserting event data:', insertData);
      
      const { data, error } = await apiClient
        .from('events')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('❌ Database error:', error);
        throw new Error(error.message);
      }

      console.log('✅ Event created successfully:', data);
      setSubmitSuccess(true);
      showNotification('Event created successfully!', 'success');

      // Redirect after success
      setTimeout(() => {
        navigate('/events');
      }, 2000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create event. Please try again.';
      setErrors({ submit: errorMessage });
      showNotification(errorMessage, 'error');
    } finally {
      setIsSubmitting(false);
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

  // helpers to manage stall rows
  const addStall = () => {
    const currentStallCount = formData.allStalls.length;
    const maxStalls = formData.noOfStalls;
    
    if (maxStalls > 0 && currentStallCount >= maxStalls) {
      alert(`Cannot add more stalls. Maximum limit is ${maxStalls} stalls. You have already configured ${currentStallCount} stalls.`);
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      allStalls: [...prev.allStalls, { id: Date.now().toString(), stallNo: '', stallSize: '', stallCategory: '', price: 0 }]
    }));
  };
  const updateStall = (index: number, field: keyof StallConfigRow, value: any) => {
    setFormData(prev => {
      const rows = [...prev.allStalls];
      rows[index] = { ...rows[index], [field]: field === 'price' ? Number(value) || 0 : value } as StallConfigRow;
      return { ...prev, allStalls: rows };
    });
  };
  const removeStall = (index: number) => {
    setFormData(prev => ({ ...prev, allStalls: prev.allStalls.filter((_, i) => i !== index) }));
  };

  const addBulkStalls = () => {
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
    if (qty <= 0) {
      showNotification('Quantity must be at least 1.', 'error');
      return;
    }

    setFormData((prev) => {
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



  if (submitSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Event Created Successfully!</h2>
            <p className="text-gray-600 mb-6">
              The event "{formData.title}" has been created and is now available in the events list.
            </p>
            <div className="space-y-2">
              <Button onClick={() => navigate('/events')} className="w-full">
                Go to Events
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSubmitSuccess(false);
                  setFormData({
                    title: '',
                    description: '',
                    eventDate: '',
                    eventEndDate: '',
                    eventTime: '',
                    eventEndTime: '',
                    venueId: '',
                    venueName: '',
                    organizationId: '',
                    city: '',
                    maxCapacity: 100,
                    planType: 'Plan A',
                    status: 'draft',
                    attendees: 0,
                    totalRevenue: 0,
                    eventImage: null,
                    eventImageUrl: '',
                    // Multiple Event Images Field
                    eventImages: [],
                    eventImageUrls: [],
                    layoutImage: null,
                    layoutImageUrl: '',
                    venueFacilities: [],
                    venueAmenities: [],
                    // Selected Facilities & Amenities for Event
                    selectedFacilities: [],
                    selectedAmenities: [],
                    // Stalls Configuration
                    noOfStalls: 0,
                    stallSize: '',
                    stallCategory: '',
                    // Pricing & Availability
                    pricePerHour: 0,
                    availableHours: '',
                    parkingSpaces: 0,
                    cateringAllowed: false,
                    alcoholAllowed: false,
                    smokingAllowed: false,
                    // Unified stall config
                    allStalls: []
                  });
                }}
                className="w-full"
              >
                Create Another Event
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            onClick={() => navigate('/events')}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Events</span>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Create New Event</h1>
            <p className="text-gray-600">Plan and organize a new event</p>
          </div>
        </div>
      </div>


        <form onSubmit={handleSubmit} className="justify-between space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* <div className="lg:col-span-2 space-y-6">
              
            </div> */}
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Event Details
                </h3>
              </CardHeader>
              <CardContent className="space-y-6">
                {isSuperAdmin && (
                  <OrganizationSelect
                    value={formData.organizationId}
                    onChange={(id) => handleInputChange('organizationId', id)}
                    organizations={organizations}
                    error={errors.organizationId}
                  />
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Event Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.title ? 'border-red-300' : 'border-gray-300'
                      }`}
                    placeholder="Enter event title"
                  />
                  {errors.title && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.title}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Event Description *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={4}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.description ? 'border-red-300' : 'border-gray-300'
                      }`}
                    placeholder="Describe your event..."
                  />
                  {errors.description && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.description}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Event Start Date *
                    </label>
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                      <DatePicker
                        label="Event Start Date"
                        value={formData.eventDate ? dayjs(formData.eventDate) : null}
                        onChange={(v: Dayjs | null) => handleInputChange('eventDate', v ? v.format('YYYY-MM-DD') : '')}
                        format="DD/MM/YYYY"
                        slotProps={{ textField: { size: 'small', fullWidth: true, error: !!errors.eventDate } }}
                      />
                    </LocalizationProvider>
                    <div className="text-xs text-gray-500 mt-1">{formData.eventDate ? formatDDMMYYYY(formData.eventDate) : ''}</div>
                    {errors.eventDate && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.eventDate}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Event End Date *
                    </label>
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                      <DatePicker
                        label="Event End Date"
                        value={formData.eventEndDate ? dayjs(formData.eventEndDate) : null}
                        onChange={(v: Dayjs | null) => handleInputChange('eventEndDate', v ? v.format('YYYY-MM-DD') : '')}
                        minDate={formData.eventDate ? dayjs(formData.eventDate) : undefined}
                        format="DD/MM/YYYY"
                        slotProps={{ textField: { size: 'small', fullWidth: true, error: !!errors.eventEndDate } }}
                      />
                    </LocalizationProvider>
                    <div className="text-xs text-gray-500 mt-1">{formData.eventEndDate ? formatDDMMYYYY(formData.eventEndDate) : ''}</div>
                    {errors.eventEndDate && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.eventEndDate}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Event Start Time *
                    </label>
                    <select
                      value={formData.eventTime}
                      onChange={(e) => handleInputChange('eventTime', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.eventTime ? 'border-red-300' : 'border-gray-300'
                        }`}
                    >
                      <option value="">Select start time</option>
                      <option value="06:00">06:00 AM</option>
                      <option value="06:30">06:30 AM</option>
                      <option value="07:00">07:00 AM</option>
                      <option value="07:30">07:30 AM</option>
                      <option value="08:00">08:00 AM</option>
                      <option value="08:30">08:30 AM</option>
                      <option value="09:00">09:00 AM</option>
                      <option value="09:30">09:30 AM</option>
                      <option value="10:00">10:00 AM</option>
                      <option value="10:30">10:30 AM</option>
                      <option value="11:00">11:00 AM</option>
                      <option value="11:30">11:30 AM</option>
                      <option value="12:00">12:00 PM</option>
                      <option value="12:30">12:30 PM</option>
                      <option value="13:00">01:00 PM</option>
                      <option value="13:30">01:30 PM</option>
                      <option value="14:00">02:00 PM</option>
                      <option value="14:30">02:30 PM</option>
                      <option value="15:00">03:00 PM</option>
                      <option value="15:30">03:30 PM</option>
                      <option value="16:00">04:00 PM</option>
                      <option value="16:30">04:30 PM</option>
                      <option value="17:00">05:00 PM</option>
                      <option value="17:30">05:30 PM</option>
                      <option value="18:00">06:00 PM</option>
                      <option value="18:30">06:30 PM</option>
                      <option value="19:00">07:00 PM</option>
                      <option value="19:30">07:30 PM</option>
                      <option value="20:00">08:00 PM</option>
                      <option value="20:30">08:30 PM</option>
                      <option value="21:00">09:00 PM</option>
                      <option value="21:30">09:30 PM</option>
                      <option value="22:00">10:00 PM</option>
                      <option value="22:30">10:30 PM</option>
                      <option value="23:00">11:00 PM</option>
                      <option value="23:30">11:30 PM</option>
                    </select>
                    {errors.eventTime && (
                      <p className="mt-1 text-sm text-red-600 flex items-center"><AlertCircle className="h-4 w-4 mr-1" />{errors.eventTime}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Event End Time *
                    </label>
                    <select
                      value={formData.eventEndTime}
                      onChange={(e) => handleInputChange('eventEndTime', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.eventEndTime ? 'border-red-300' : 'border-gray-300'
                        }`}
                    >
                      <option value="">Select end time</option>
                      <option value="06:00">06:00 AM</option>
                      <option value="06:30">06:30 AM</option>
                      <option value="07:00">07:00 AM</option>
                      <option value="07:30">07:30 AM</option>
                      <option value="08:00">08:00 AM</option>
                      <option value="08:30">08:30 AM</option>
                      <option value="09:00">09:00 AM</option>
                      <option value="09:30">09:30 AM</option>
                      <option value="10:00">10:00 AM</option>
                      <option value="10:30">10:30 AM</option>
                      <option value="11:00">11:00 AM</option>
                      <option value="11:30">11:30 AM</option>
                      <option value="12:00">12:00 PM</option>
                      <option value="12:30">12:30 PM</option>
                      <option value="13:00">01:00 PM</option>
                      <option value="13:30">01:30 PM</option>
                      <option value="14:00">02:00 PM</option>
                      <option value="14:30">02:30 PM</option>
                      <option value="15:00">03:00 PM</option>
                      <option value="15:30">03:30 PM</option>
                      <option value="16:00">04:00 PM</option>
                      <option value="16:30">04:30 PM</option>
                      <option value="17:00">05:00 PM</option>
                      <option value="17:30">05:30 PM</option>
                      <option value="18:00">06:00 PM</option>
                      <option value="18:30">06:30 PM</option>
                      <option value="19:00">07:00 PM</option>
                      <option value="19:30">07:30 PM</option>
                      <option value="20:00">08:00 PM</option>
                      <option value="20:30">08:30 PM</option>
                      <option value="21:00">09:00 PM</option>
                      <option value="21:30">09:30 PM</option>
                      <option value="22:00">10:00 PM</option>
                      <option value="22:30">10:30 PM</option>
                      <option value="23:00">11:00 PM</option>
                      <option value="23:30">11:30 PM</option>
                    </select>
                    {errors.eventEndTime && (
                      <p className="mt-1 text-sm text-red-600 flex items-center"><AlertCircle className="h-4 w-4 mr-1" />{errors.eventEndTime}</p>
                    )}
                  </div>
                </div>

                {/* Event Image Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Event Flyers *
                  </label>
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
                        id="event-images-upload"
                      />
                      <label
                        htmlFor="event-images-upload"
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
                    {formData.eventImageUrls.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {formData.eventImageUrls.map((imageUrl, index) => (
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
                    {formData.eventImageUrl && formData.eventImageUrls.length === 0 && (
                      <div className="relative">
                        <img
                          src={formData.eventImageUrl}
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
                  {errors.eventImage && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.eventImage}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Venue & Location */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Building2 className="h-5 w-5 mr-2" />
                  Venue & Location
                </h3>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Venue *
                  </label>
                  <select
                    value={formData.venueId}
                    onChange={(e) => handleInputChange('venueId', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.venueId ? 'border-red-300' : 'border-gray-300'
                      }`}
                    disabled={venuesLoading || (!venuesLoading && activeVenues.length === 0)}
                  >
                    <option value="">
                      {venuesLoading
                        ? 'Loading venues...'
                        : activeVenues.length === 0
                          ? 'No venues available'
                          : 'Select a venue'}
                    </option>
                    {activeVenues.map((venue) => (
                      <option key={venue.id} value={venue.id}>
                         {venue.name} - {venue?.location?venue.location:venue.city} {/*(Capacity: {venue.memberCount}) */}
                      </option>
                    ))}
                  </select>
                  {!venuesLoading && activeVenues.length === 0 && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-medium">Create a venue first</p>
                      <p className="mt-1 text-amber-800">
                        Events need a venue. Recommended order: Venues → Vendors → Exhibitors → Events.
                      </p>
                      <Link
                        to="/venues/add"
                        className="mt-2 inline-flex text-sm font-medium text-blue-700 hover:text-blue-800 underline"
                      >
                        Add a venue
                      </Link>
                    </div>
                  )}
                  {errors.venueId && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.venueId}
                    </p>
                  )}
                </div>

                {/*<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Venue Name
                    </label>
                    <input
                      type="text"
                      value={formData.venueName}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                      placeholder="Auto-filled when venue is selected"
                    />
                  </div> 

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      City *
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.city ? 'border-red-300' : 'border-gray-300'
                          }`}
                        placeholder="Enter city"
                      />
                    </div>
                    {errors.city && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.city}
                      </p>
                    )}
                  </div>
                </div>*/}

                {/* Venue Facilities & Amenities Selection */}
                {(formData.venueFacilities.length > 0 || formData.venueAmenities.length > 0) && (
                  <div className="mt-6 space-y-6">
                    {/* Facilities Selection */}
                    {formData.venueFacilities.length > 0 && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center">
                          <Building2 className="h-4 w-4 mr-2" />
                          Select Facilities for Event ({formData.selectedFacilities.length} selected)
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {formData.venueFacilities.map((facility) => (
                            <label key={facility} className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={formData.selectedFacilities.includes(facility)}
                                onChange={() => handleFacilityToggle(facility)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-700">{facility}</span>
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-blue-600 mt-2">
                          Select the facilities you want to use for this event
                        </p>
                      </div>
                    )}

                    {/* Amenities Selection */}
                    {formData.venueAmenities.length > 0 && (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <h4 className="text-sm font-semibold text-green-800 mb-3 flex items-center">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Select Amenities for Event ({formData.selectedAmenities.length} selected)
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {formData.venueAmenities.map((amenity) => (
                            <label key={amenity} className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={formData.selectedAmenities.includes(amenity)}
                                onChange={() => handleAmenityToggle(amenity)}
                                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                              />
                              <span className="text-sm text-gray-700">{amenity}</span>
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-green-600 mt-2">
                          Select the amenities you want to use for this event
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Vendors Section */}
                <div className="mt-4 border-2 border-blue-200 bg-blue-50 p-4 rounded-lg">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                    <Users className="h-4 w-4 mr-2" />
                    Vendors ({selectedVendors.length} selected) - {vendors.length} available
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-32 overflow-auto p-2 border rounded-lg bg-white">
                    {vendorsLoading ? (
                      <div className="text-sm text-gray-500">Loading vendors...</div>
                    ) : vendors.length === 0 ? (
                      <div className="text-sm text-gray-500">No vendors available</div>
                    ) : vendors.map(v => (
                      <label key={v.id} className="flex items-center justify-between px-3 py-2 border rounded hover:bg-gray-50">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{v.name}</div>
                          <div className="text-xs text-gray-600 truncate">{v.category} • {v.city || 'N/A'}</div>
                        </div>
                        <input type="checkbox" checked={selectedVendors.includes(v.id)} onChange={() => toggleVendor(v.id)} className="h-4 w-4" />
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Select vendors to associate with this event
                  </p>
                </div>

                {/* Exhibitors Section */}
                {/* <div className="mt-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Exhibitors ({selectedExhibitors.length} selected)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-32 overflow-auto p-2 border rounded-lg">
                    {exhibitorsLoading ? (
                      <div className="text-sm text-gray-500">Loading exhibitors...</div>
                    ) : exhibitors.map(ex => (
                      <label key={ex.id} className="flex items-center justify-between px-3 py-2 border rounded">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{ex.companyName}</div>
                          <div className="text-xs text-gray-600 truncate">{ex.category || 'N/A'} • {ex.city || 'N/A'}</div>
                        </div>
                        <input type="checkbox" checked={selectedExhibitors.includes(ex.id)} onChange={() => toggleExhibitor(ex.id)} className="h-4 w-4" />
                      </label>
                    ))}
                  </div>
                </div> */}
              </CardContent>
            </Card>



            {/* Event Configuration */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Event Configuration
                </h3>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Maximum Capacity *
                    </label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="number"
                        value={formData.maxCapacity}
                        onChange={(e) => handleInputChange('maxCapacity', parseInt(e.target.value) || 0)}
                        className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.maxCapacity ? 'border-red-300' : 'border-gray-300'
                          }`}
                        placeholder="Maximum attendees"
                        min="10"
                      />
                    </div>
                    {errors.maxCapacity && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.maxCapacity}
                      </p>
                    )}
                  </div>


                </div>

                {/* <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Plan Type
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {planTypes.map((plan) => (
                      <label key={plan.value} className="cursor-pointer">
                        <input
                          type="radio"
                          name="planType"
                          value={plan.value}
                          checked={formData.planType === plan.value}
                          onChange={(e) => handleInputChange('planType', e.target.value)}
                          className="sr-only"
                        />
                        <div className={`p-4 border-2 rounded-lg transition-colors duration-200 ${
                          formData.planType === plan.value
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <div className="font-medium text-gray-900">{plan.label}</div>
                          <div className="text-sm text-gray-600 mt-1">{plan.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div> */}
              </CardContent>
            </Card>

            {/* Stalls Configuration */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Building2 className="h-5 w-5 mr-2" />
                  Stalls Configuration
                </h3>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Number of Stalls</label>
                    <input
                      type="number"
                      value={formData.noOfStalls}
                      onChange={(e) => handleInputChange('noOfStalls', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min={0}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Configured stalls: {formData.allStalls.length} / {formData.noOfStalls}
                    </p>
                    {errors.noOfStalls && (
                      <p className="mt-1 text-sm text-red-600 flex items-center"><AlertCircle className="h-4 w-4 mr-1" />{errors.noOfStalls}</p>
                    )}
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

                  {/* Single Stalls Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-800">
                        Stalls ({formData.allStalls.length}{formData.noOfStalls > 0 ? `/${formData.noOfStalls}` : ''})
                      </h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex items-center space-x-2"
                        onClick={addStall}
                        disabled={formData.noOfStalls > 0 && formData.allStalls.length >= formData.noOfStalls}
                      >
                        <span>+ Add Stall</span>
                      </Button>
                    </div>
                    
                    {formData.noOfStalls > 0 && formData.allStalls.length >= formData.noOfStalls && (
                      <div className="flex items-center p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-yellow-600 mr-2" />
                        <span className="text-sm text-yellow-700">
                          Maximum stalls limit reached ({formData.allStalls.length}/{formData.noOfStalls})
                        </span>
                      </div>
                    )}

                    <div className="space-y-3">
                      {formData.allStalls.map((row, idx) => (
                        <div key={row.id} className="border border-gray-200 rounded-md p-3">
                          <div className="flex items-center mb-3">
                            <Badge variant="default" className="mr-2">#{idx + 1}</Badge>
                            <span className="text-xs text-gray-500">Stall</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-5 gap-y-3 gap-x-0 items-end">
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

                            {/* Category */}
                            <div>
                              <label htmlFor={`stall-stallCategory-${row.id}`} className="block text-xs text-gray-600 mb-1">Category</label>
                              <select
                                id={`stall-stallCategory-${row.id}`}
                                value={row.stallCategory}
                                onChange={(e) => updateStall(idx, 'stallCategory', e.target.value)}
                                className="w-full px-3 py-2 border rounded"
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
                  </div>

                </div>
              </CardContent>
            </Card>

            {/* Upload Layout */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Image className="h-5 w-5 mr-2" />
                  Upload Layout
                </h3>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Stall Layout Image
                  </label>
                  <div className="space-y-4">
                    {formData.layoutImageUrl ? (
                      <div className="relative">
                        <img
                          src={formData.layoutImageUrl}
                          alt="Layout preview"
                          className="w-full h-64 object-contain rounded-lg border border-gray-300 bg-gray-50"
                        />
                        <button
                          type="button"
                          onClick={removeLayoutImage}
                          className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-2 hover:bg-red-600 transition-colors"
                          title="Remove layout image"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <div className="mt-2 text-sm text-gray-600">
                          Layout image selected: {formData.layoutImage?.name}
                        </div>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
                        <label
                          htmlFor="layout-image-upload"
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
                        <input
                          id="layout-image-upload"
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleLayoutImageUpload(file);
                          }}
                          className="hidden"
                        />
                      </div>
                    )}
                    {errors.layoutImage && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.layoutImage}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Upload an image showing the stall layout structure for this event. This helps exhibitors understand the venue arrangement.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Pricing & Availability */}
            {/* <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <IndianRupeeIcon className="h-5 w-5 mr-2" />
                  Pricing & Availability
                </h3>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Price Per Hour
                    </label>
                    <div className="relative">
                      <IndianRupeeIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="number"
                        value={formData.pricePerHour}
                        onChange={(e) => handleInputChange('pricePerHour', Number(e.target.value))}
                        className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          errors.pricePerHour ? 'border-red-300' : 'border-gray-300'
                        }`}
                        placeholder="Enter price per hour"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    {errors.pricePerHour && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.pricePerHour}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Available Hours
                    </label>
                    <input
                      type="text"
                      value={formData.availableHours}
                      onChange={(e) => handleInputChange('availableHours', e.target.value)}
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
                      value={formData.parkingSpaces}
                      onChange={(e) => handleInputChange('parkingSpaces', Number(e.target.value))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.parkingSpaces ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Number of parking spaces"
                      min="0"
                    />
                    {errors.parkingSpaces && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.parkingSpaces}
                      </p>
                    )}
                  </div>
                </div>

                <div className="hidden">
                  <label className="text-sm font-medium text-gray-700 mb-3 block">
                    Event Policies
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.cateringAllowed}
                        onChange={(e) => handleInputChange('cateringAllowed', e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Catering Allowed</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.alcoholAllowed}
                        onChange={(e) => handleInputChange('alcoholAllowed', e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Alcohol Allowed</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.smokingAllowed}
                        onChange={(e) => handleInputChange('smokingAllowed', e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Smoking Allowed</span>
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card> */}

            {/* Event Status */}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Event Status
                </h3>
              </CardHeader>
              <CardContent>
                <select
                  value={formData.status}
                  onChange={(e) => handleInputChange('status', e.target.value)}
                  className="w-1/2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="space-y-3 justify-end flex flex-row gap-3 items-end">
              {errors.submit && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    {errors.submit}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || venuesLoading}
                className="w-full flex items-center justify-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Creating Event...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Create Event</span>
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/events')}
                className="w-full"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </div>
          

          {/* Sidebar */}
          {/* <div className="space-y-6"> */}
            {/* Event Summary */}
            {/* <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900">Event Summary</h3>
              </CardHeader>
              <CardContent>
                // Event Image Preview 
                {formData.eventImageUrl && (
                  <div className="mb-4">
                    <img
                      src={formData.eventImageUrl}
                      alt="Event preview"
                      className="w-full h-32 object-cover rounded-lg border border-gray-200"
                    />
                  </div>
                )}
                <div className="space-y-4">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900">
                      {formData.maxCapacity > 0 ? formData.maxCapacity.toLocaleString() : '0'}
                    </div>
                    <div className="text-sm text-gray-600">Maximum Capacity</div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Start Date:</span>
                      <span className="font-medium">{formData.eventDate ? formatDDMMYYYY(formData.eventDate) : 'Not set'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">End Date:</span>
                      <span className="font-medium">{formData.eventEndDate ? formatDDMMYYYY(formData.eventEndDate) : 'Not set'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Start Time:</span>
                      <span className="font-medium">{formData.eventTime || 'Not set'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">End Time:</span>
                      <span className="font-medium">{formData.eventEndTime || 'Not set'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Venue:</span>
                      <span className="font-medium truncate">{formData.venueName || 'Not selected'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">City:</span>
                      <span className="font-medium">{formData.city || 'Not set'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Plan:</span>
                      <span className="font-medium">{formData.planType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Status:</span>
                      <Badge variant={formData.status === 'upcoming' ? 'success' : 'warning'}>
                        {formData.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card> */}

            {/* Guidelines */}
            {/* <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Info className="h-5 w-5 mr-2" />
                  Guidelines
                </h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-gray-600">
                  <div className="flex items-start">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    <p>Choose a descriptive title that clearly identifies your event</p>
                  </div>
                  <div className="flex items-start">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    <p>Select an appropriate venue based on expected attendance</p>
                  </div>
                  <div className="flex items-start">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    <p>Set realistic capacity limits for safety and comfort</p>
                  </div>
                  <div className="flex items-start">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    <p>Provide accurate venue details and amenities</p>
                  </div>
                  <div className="flex items-start">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    <p>Use draft status for planning, publish when ready</p>
                  </div>
                </div>
              </CardContent>
            </Card> */}

            
          {/* </div> */}
        </div>
      </form>
    </div>
  );
};
