import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  validateEmail, 
  validatePhone, 
  validatePinCode, 
  validateRequiredText,
  validateNumber
} from '../utils/validation';
import {
  Save,
  ArrowLeft,
  Building,
  User,
  Mail,
  MapPin,
  Calendar,
  CreditCard,
  FileText,
  Package,
  AlertCircle,
  CheckCircle,
  Info,
  Upload,
  X,
  Plus,
  Eye,
  EyeOff,
  Globe,
  Users,
  Truck,
  Shield
} from 'lucide-react';
import { PhoneInput } from '../components/UI/PhoneInput';
import { isValidIndianMobile } from '../utils/phone';
import { Card, CardHeader, CardContent } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../lib/apiClient';
import { uploadExhibitorPublicImage } from '../lib/exhibitorStorage';
import { exhibitorImageUrlsColumnValue } from '../lib/exhibitorImageDb';
import { getDefaultExhibitorProfileUrl } from '../constants/exhibitorDefaultProfile';
import statesData from '../data/states.json';

interface FormData {
  // Legacy fields for backward compatibility
  products: string[];
  services: string[];
  companyDescription: string;
  establishedYear: string;
  companySize: string;
  designation: string;
  alternateEmail: string;
  businessType: string;
  boothPreference: string;
  specialRequirements: string;
  previousExhibitions: string;
  expectedVisitors: string;
  targetAudience: string;
  registrationFee: number;
  paymentMethod: string;
  billingAddress: string;
  contactPerson: string;
  address: string;
  // Personal Information
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  alternatePhone: string;

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

  // Address
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;


  // Documents
  documents: {
    panCard: File | null;
    aadharCard: File | null;
    licence: File | null;
  };

  // Upload Images
  images: File[];
  /** Single cover / portfolio image (stored as portfolio_image_url) */
  portfolioImage: File | null;

  // Settings
  status: 'interested' | 'approved' | 'declined';
  paymentStatus: 'pending' | 'paid' | 'partial';
  sendConfirmationEmail: boolean;
  allowMarketingEmails: boolean;
}

interface FormErrors {
  [key: string]: string;
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

const businessTypes = ['Private Limited', 'Public Limited', 'Partnership', 'Sole Proprietorship', 'LLP', 'NGO', 'Government'];
const companySizes = ['1-10 employees', '11-50 employees', '51-200 employees', '201-500 employees', '500+ employees'];
const boothSizes = ['3x3 meters', '3x6 meters', '6x6 meters', '6x9 meters', '9x9 meters', 'Custom Size'];

export const AddExhibitor: React.FC = () => {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<Record<string, string[]>>({});

  const [formData, setFormData] = useState<FormData>({
    // Personal Information
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    alternatePhone: '',

    // Business Information
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

    // Address
    address1: '',
    address2: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',

    // Documents
    documents: {
      panCard: null,
      aadharCard: null,
      licence: null
    },

    // Upload Images
    images: [],
    portfolioImage: null,

    // Settings
    status: 'interested',
    paymentStatus: 'pending',

    // Add all missing fields to match FormData type
    sendConfirmationEmail: false,
    allowMarketingEmails: false,

    // Add missing fields based on FormData interface
    products: [],
    services: [],
    companyDescription: '',
    establishedYear: '',
    businessType: '',
    companySize: '',
    designation: '',
    alternateEmail: '',
    boothPreference: '',
    specialRequirements: '',
    previousExhibitions: '',
    expectedVisitors: '',
    targetAudience: '',
    registrationFee: 15000,
    paymentMethod: 'online',
    billingAddress: '',
    contactPerson: '',
    address: ''
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [newProduct, setNewProduct] = useState('');
  const [newService, setNewService] = useState('');
  const selectedSubCategories = subCategoryOptions[formData.category] || [];
  const selectedSubCategoryValues = formData.subCategory
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const toggleSubCategory = (subCategory: string) => {
    const next = selectedSubCategoryValues.includes(subCategory)
      ? selectedSubCategoryValues.filter((v) => v !== subCategory)
      : [...selectedSubCategoryValues, subCategory];
    handleInputChange('subCategory', next.join(', '));
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

  // Only super admins, admins, and sales/marketing can access this page
  if (!hasRole(['super_admin', 'admin', 'sales_marketing'])) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to add exhibitors.</p>
        </div>
      </div>
    );
  }

  const validateMandatoryFields = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Invalid email format';
    if (!formData.phone.trim()) newErrors.phone = 'Contact number is required';
    else if (!isValidIndianMobile(formData.phone)) newErrors.phone = 'Contact number must be exactly 10 digits';
    if (formData.alternatePhone.trim()) {
      if (formData.alternatePhone.length !== 10) newErrors.alternatePhone = 'Alternate contact number must be exactly 10 digits';
      else if (!/^[0-9]{10}$/.test(formData.alternatePhone)) newErrors.alternatePhone = 'Alternate contact number must contain only digits';
    }
    if (!formData.companyName.trim()) newErrors.companyName = 'Company name is required';
    if (!formData.category) newErrors.category = 'Main category is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep = (step: number): boolean => {
    if (step === 1 || step === 6) {
      return validateMandatoryFields();
    }
    if (step >= 2 && step <= 5) {
      setErrors({});
      return true;
    }
    return true;
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      if (field.includes('.')) {
        const [parent, child] = field.split('.') as [keyof FormData, string];;
        return {
          ...prev,
          [parent]: {
            ...(prev[parent] as any),
            [child]: value
          }
        };
      }
      return { ...prev, [field]: value };
    });

    // Real-time validation
    let validationResult = null;
    
    switch (field) {
      case 'firstName':
        validationResult = validateRequiredText(value, 'First name', 2, 50);
        break;
      case 'lastName':
        validationResult = validateRequiredText(value, 'Last name', 2, 50);
        break;
      case 'email':
        validationResult = validateEmail(value);
        break;
      case 'phone':
        validationResult = validatePhone(value);
        break;
      case 'alternatePhone':
        if (value.trim()) {
          validationResult = validatePhone(value);
        } else {
          // Clear error for optional field when empty
          validationResult = { isValid: true, message: '' };
        }
        break;
      case 'address1':
        if (!value.trim()) {
          validationResult = { isValid: true, message: '' };
        } else {
          validationResult = validateRequiredText(value, 'Address', 5, 200);
        }
        break;
      case 'city':
        if (!value.trim()) {
          validationResult = { isValid: true, message: '' };
        } else {
          validationResult = validateRequiredText(value, 'City', 2, 50);
        }
        break;
      case 'state':
        validationResult = { isValid: true, message: '' };
        break;
      case 'pincode':
        if (!value.trim()) {
          validationResult = { isValid: true, message: '' };
        } else {
          validationResult = validatePinCode(value);
        }
        break;
      case 'country':
        validationResult = { isValid: true, message: '' };
        break;
      case 'companyName':
        validationResult = validateRequiredText(value, 'Company name', 2, 100);
        break;
      case 'website':
        if (value.trim() && !/^https?:\/\/.+/.test(value.trim())) {
          validationResult = { isValid: false, message: 'Website must start with http:// or https://' };
        } else {
          validationResult = { isValid: true, message: '' };
        }
        break;
      case 'category':
        if (!value.trim()) {
          validationResult = { isValid: false, message: 'Main category is required' };
        } else {
          validationResult = { isValid: true, message: '' };
        }
        break;
      case 'subCategory':
        validationResult = { isValid: true, message: '' };
        break;
      case 'panNumber':
        if (!value.trim()) {
          validationResult = { isValid: true, message: '' };
        } else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(value.trim())) {
          validationResult = { isValid: false, message: 'PAN must be in format: ABCDE1234F' };
        } else {
          validationResult = { isValid: true, message: '' };
        }
        break;
      case 'gstNumber':
        if (!value.trim()) {
          // GST is not mandatory, so no error for empty field
          validationResult = { isValid: true, message: '' };
        } else if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[Z]{1}[A-Z0-9]{1}$/.test(value.trim())) {
          validationResult = { isValid: false, message: 'GST must be in format: 22AAAAA0000A1Z5' };
        } else {
          validationResult = { isValid: true, message: '' };
        }
        break;
      case 'boothSize':
        if (!value.trim()) {
          // Booth size is not mandatory, so no error for empty field
          validationResult = { isValid: true, message: '' };
        } else {
          validationResult = validateRequiredText(value, 'Booth size', 2, 50);
        }
        break;
      case 'businessDescription':
        if (!value.trim()) {
          // Business description is not mandatory, so no error for empty field
          validationResult = { isValid: true, message: '' };
        } else if (value.trim().length < 10) {
          validationResult = { isValid: false, message: 'Business description must be at least 10 characters' };
        } else {
          validationResult = validateRequiredText(value, 'Business description', 10, 500);
        }
        break;
    }

    // Update errors based on validation result
    if (validationResult && !validationResult.isValid) {
      setErrors(prev => ({ ...prev, [field]: validationResult.message }));
    } else {
      // Clear error for this field if validation passed or field is empty (for non-mandatory fields)
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // File compression functions
  const compressImage = (file: File, maxSizeKB: number = 100): Promise<File> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions to reduce file size
        let { width, height } = img;
        const maxDimension = 1024; // Max width/height

        if (width > height && width > maxDimension) {
          height = (height * maxDimension) / width;
          width = maxDimension;
        } else if (height > maxDimension) {
          width = (width * maxDimension) / height;
          height = maxDimension;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);

        // Try different quality levels to get under size limit
        const tryCompress = (quality: number): void => {
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: file.type,
                  lastModified: Date.now()
                });

                // Check if compressed file is under limit
                if (compressedFile.size <= maxSizeKB * 1024 || quality <= 0.1) {
                  resolve(compressedFile);
                } else {
                  // Try with lower quality
                  tryCompress(quality - 0.1);
                }
              } else {
                reject(new Error('Compression failed'));
              }
            },
            file.type,
            quality
          );
        };

        // Start with 90% quality
        tryCompress(0.9);
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  const compressPDF = async (file: File, maxSizeKB: number = 100): Promise<File> => {
    // For PDF files, we can't easily compress them in the browser
    // So we'll just return the original file and show a message
    // In a real app, you'd send this to a server for compression
    if (file.size <= maxSizeKB * 1024) {
      return file;
    }

    // If PDF is too large, we can't compress it client-side
    throw new Error(`PDF file is ${Math.round(file.size / 1024)}KB. Please compress it to under ${maxSizeKB}KB using online tools.`);
  };

  const compressFile = async (file: File, maxSizeKB: number = 100): Promise<File> => {
    if (file.size <= maxSizeKB * 1024) {
      return file; // File is already small enough
    }

    if (file.type.startsWith('image/')) {
      return await compressImage(file, maxSizeKB);
    } else if (file.type === 'application/pdf') {
      return await compressPDF(file, maxSizeKB);
    } else {
      throw new Error(`Cannot compress ${file.type} files. Please reduce file size manually.`);
    }
  };

  const handleFileUpload = async (field: string, file: File | null) => {
    if (file) {
      try {
        // Clear any previous errors
        setErrors(prev => ({ ...prev, [field]: '' }));

        // Show loading state
        setErrors(prev => ({ ...prev, [field]: 'Processing file...' }));

        // Validate file type first
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
          setErrors(prev => ({ ...prev, [field]: 'Please upload only PDF, JPG, JPEG, or PNG files' }));
          return;
        }

        // Compress file if needed
        const compressedFile = await compressFile(file, 100);

        // Clear loading state
        setErrors(prev => ({ ...prev, [field]: '' }));

        // Update form data with compressed file
        setFormData(prev => ({
          ...prev,
          documents: {
            ...prev.documents,
            [field]: compressedFile
          }
        }));

        // Show success message if file was compressed
        if (compressedFile.size < file.size) {
          const originalSizeKB = Math.round(file.size / 1024);
          const compressedSizeKB = Math.round(compressedFile.size / 1024);
          console.log(`File compressed from ${originalSizeKB}KB to ${compressedSizeKB}KB`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to process file';
        setErrors(prev => ({ ...prev, [field]: errorMessage }));
      }
    } else {
      // Clear file if null
      setFormData(prev => ({
        ...prev,
        documents: {
          ...prev.documents,
          [field]: null
        }
      }));
    }
  };

  const uploadDocumentToSupabase = async (file: File, fileName: string): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${fileName}.${fileExt}`;

      const { data, error } = await apiClient.storage
        .from('exhibitor-documents')
        .upload(filePath, file, {
          upsert: true
        });

      if (error) {
        console.error('Error uploading file:', error);
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

      return signedUrl.signedUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      return null;
    }
  };

  const uploadGalleryImagesToSupabase = async (images: File[], exhibitorName: string): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const { url, error } = await uploadExhibitorPublicImage(
        images[i],
        'gallery',
        `${exhibitorName}_img_${i + 1}`
      );
      if (url) uploadedUrls.push(url);
      else console.error(`Gallery image ${i + 1} upload failed:`, error);
    }
    return uploadedUrls;
  };

  const addProduct = () => {
    if (
      typeof newProduct === 'string' &&
      newProduct.trim() &&
      Array.isArray(formData.products) &&
      !formData.products.includes(newProduct.trim())
    ) {
      setFormData(prev => ({
        ...prev,
        products: [...(prev.products || []), newProduct.trim()]
      }));
      setNewProduct('');
    }
  };

  const removeProduct = (index: number) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.filter((_, i) => i !== index)
    }));
  };

  const addService = () => {
    if (newService.trim() && !formData.services.includes(newService.trim())) {
      setFormData(prev => ({
        ...prev,
        services: [...prev.services, newService.trim()]
      }));
      setNewService('');
    }
  };

  const removeService = (index: number) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index)
    }));
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 6));
    }
  };

  const skipOptionalToReview = () => {
    if (validateMandatoryFields()) {
      setCurrentStep(6);
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateMandatoryFields()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Create exhibitor name for file naming
      const exhibitorName = `${formData.firstName}_${formData.lastName}_${formData.companyName}`.replace(/\s+/g, '_');

      // Upload documents to Supabase Storage
      const documentUrls: { [key: string]: string } = {};

      if (formData.documents.panCard) {
        const panCardUrl = await uploadDocumentToSupabase(formData.documents.panCard, `${exhibitorName}_pan_card`);
        if (panCardUrl) documentUrls.panCard = panCardUrl;
      }

      if (formData.documents.aadharCard) {
        const aadharCardUrl = await uploadDocumentToSupabase(formData.documents.aadharCard, `${exhibitorName}_aadhar_card`);
        if (aadharCardUrl) documentUrls.aadharCard = aadharCardUrl;
      }

      if (formData.documents.licence) {
        const licenceUrl = await uploadDocumentToSupabase(formData.documents.licence, `${exhibitorName}_licence`);
        if (licenceUrl) documentUrls.licence = licenceUrl;
      }

      let portfolioUrl: string | null = null;
      if (formData.portfolioImage) {
        const pr = await uploadExhibitorPublicImage(
          formData.portfolioImage,
          'portfolio',
          `${exhibitorName}_portfolio`
        );
        portfolioUrl = pr.url;
        if (!portfolioUrl) {
          throw new Error(
            pr.error ||
              'Portfolio image upload failed. In Supabase: create bucket "exhibitor-images" (public read) and allow authenticated uploads — see migration 20250402100000_exhibitors_image_urls_and_storage.sql.'
          );
        }
      }

      const imageUrlsRaw =
        formData.images.length > 0 ? await uploadGalleryImagesToSupabase(formData.images, exhibitorName) : [];
      const imageUrls = exhibitorImageUrlsColumnValue(imageUrlsRaw);

      if (formData.images.length > 0 && imageUrls.length !== formData.images.length) {
        throw new Error(
          `Only ${imageUrls.length} of ${formData.images.length} gallery images uploaded. Check Storage bucket "exhibitor-images" and policies (see migration 20250402100000).`
        );
      }

      const portfolio_image_url =
        portfolioUrl || imageUrls[0] || getDefaultExhibitorProfileUrl();

      const insertData = {
        // Personal Information
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        alternate_phone: formData.alternatePhone,

        // Business Information
        company_name: formData.companyName,
        website: formData.website,
        category: formData.category,
        sub_category: formData.subCategory,
        pan_number: formData.panNumber,
        gst_number: formData.gstNumber,
        booth_size: formData.boothSize,
        business_description: formData.businessDescription,
        social_media_links: {
          facebook: formData.socialMediaLinks.facebook,
          linkedin: formData.socialMediaLinks.linkedin,
          instagram: formData.socialMediaLinks.instagram,
          twitter: formData.socialMediaLinks.twitter
        },

        // Address
        address1: formData.address1,
        address2: formData.address2,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,
        country: formData.country,

        // Document URLs
        document_urls: documentUrls,

        // Image URLs
        image_urls: imageUrls,
        portfolio_image_url: portfolio_image_url,

        // Settings
        status: formData.status,
        payment_status: formData.paymentStatus
      };

      const { data, error } = await apiClient
        .from('exhibitors')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      showNotification('Exhibitor registered successfully!', 'success');
      setSubmitSuccess(true);

      // Redirect after success
      setTimeout(() => {
        navigate('/exhibitors');
      }, 2000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to register exhibitor. Please try again.';
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

  const steps = [
    { number: 1, title: 'Personal & company', icon: User },
    { number: 2, title: 'Address (optional)', icon: MapPin },
    { number: 3, title: 'Business (optional)', icon: Building },
    { number: 4, title: 'Documents (optional)', icon: FileText },
    { number: 5, title: 'Upload Images', icon: Upload },
    { number: 6, title: 'Review & Submit', icon: CheckCircle }
  ];

  if (submitSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Exhibitor Added Successfully!</h2>
            <p className="text-gray-600 mb-6">
              The exhibitor "{formData.companyName}" has been added to the system.
            </p>
            <div className="space-y-2">
              <Button onClick={() => navigate('/exhibitors')} className="w-full">
                Go to Exhibitor Management
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSubmitSuccess(false);
                  setCurrentStep(1);
                  // Reset form data
                }}
                className="w-full"
              >
                Add Another Exhibitor
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
            onClick={() => navigate('/exhibitors')}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Exhibitors</span>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Add New Exhibitor</h1>
            <p className="text-gray-600">Register a new exhibitor for upcoming events</p>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${currentStep >= step.number
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-gray-300 text-gray-500'
                  }`}>
                  {currentStep > step.number ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <step.icon className="h-5 w-5" />
                  )}
                </div>
                <div className="ml-3 hidden sm:block">
                  <p className={`text-sm font-medium ${currentStep >= step.number ? 'text-blue-600' : 'text-gray-500'
                    }`}>
                    Step {step.number}
                  </p>
                  <p className={`text-xs ${currentStep >= step.number ? 'text-blue-600' : 'text-gray-500'
                    }`}>
                    {step.title}
                  </p>
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-12 sm:w-20 h-0.5 mx-4 ${currentStep > step.number ? 'bg-blue-600' : 'bg-gray-300'
                    }`} />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-3">
          {/* Step 1: Personal Information */}
          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <User className="h-5 w-5 mr-2" />
                  Personal information & company
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
                      value={formData.firstName}
                      onChange={(e) => handleInputChange('firstName', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.firstName ? 'border-red-300' : 'border-gray-300'
                        }`}
                      placeholder="Enter first name"
                    />
                    {errors.firstName && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.firstName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => handleInputChange('lastName', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.lastName ? 'border-red-300' : 'border-gray-300'
                        }`}
                      placeholder="Enter last name"
                    />
                    {errors.lastName && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.lastName}
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
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.email ? 'border-red-300' : 'border-gray-300'
                          }`}
                        placeholder="Enter email address"
                      />
                    </div>
                    {errors.email && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.email}
                      </p>
                    )}
                  </div>

                  <div>
                    <PhoneInput
                      label="Contact Number"
                      value={formData.phone}
                      onChange={(value) => handleInputChange('phone', value)}
                      required={true}
                      error={errors.phone}
                      name="phone"
                      placeholder="9876543210"
                    />
                  </div>
                </div>

                <div>
                  <PhoneInput
                    label="Alternate Contact Number"
                    value={formData.alternatePhone}
                    onChange={(value) => handleInputChange('alternatePhone', value)}
                    required={false}
                    error={errors.alternatePhone}
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
                        value={formData.companyName}
                        onChange={(e) => handleInputChange('companyName', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.companyName ? 'border-red-300' : 'border-gray-300'
                          }`}
                        placeholder="Enter company name"
                      />
                      {errors.companyName && (
                        <p className="mt-1 text-sm text-red-600 flex items-center">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          {errors.companyName}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Main Category *
                      </label>
                      <select
                        value={formData.category}
                        onChange={(e) => {
                          handleInputChange('category', e.target.value);
                          handleInputChange('subCategory', '');
                        }}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.category ? 'border-red-300' : 'border-gray-300'
                          }`}
                      >
                        <option value="">Select category</option>
                        {categoryOptions.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                      {errors.category && (
                        <p className="mt-1 text-sm text-red-600 flex items-center">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          {errors.category}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">
                    Everything after this step is optional — you can skip ahead to review once these required fields are complete.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Address */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <MapPin className="h-5 w-5 mr-2" />
                  Address{' '}
                  <span className="text-sm font-normal text-gray-500 ml-2">(optional)</span>
                </h3>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address Line 1
                  </label>
                  <input
                    type="text"
                    value={formData.address1}
                    onChange={(e) => handleInputChange('address1', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.address1 ? 'border-red-300' : 'border-gray-300'
                      }`}
                    placeholder="Enter street address"
                  />
                  {errors.address1 && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.address1}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address Line 2 
                  </label>
                  <input
                    type="text"
                    value={formData.address2}
                    onChange={(e) => handleInputChange('address2', e.target.value)}
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
                        value={formData.state}
                        onChange={(e) => {
                          handleInputChange('state', e.target.value);
                          handleInputChange('city', ''); // Clear city when state changes
                        }}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.state ? 'border-red-300' : 'border-gray-300'
                          }`}
                      >
                      <option value="">Select state</option>
                      {statesData.map((state) => (
                        <option key={state.id} value={state.name}>
                          {state.name}
                        </option>
                      ))}
                    </select>
                    {errors.state && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.state}
                      </p>
                    )}
                  </div>
                                      <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        City
                      </label>
                      <select
                        value={formData.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        disabled={!formData.state}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 ${errors.city ? 'border-red-300' : 'border-gray-300'
                          }`}
                      >
                        <option value="">Select city</option>
                        {formData.state && statesData
                          .find(s => s.name === formData.state)?.cities
                          .map(city => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                      </select>
                      {errors.city && (
                        <p className="mt-1 text-sm text-red-600 flex items-center">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          {errors.city}
                        </p>
                      )}
                    </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pincode
                    </label>
                    <input
                      type="text"
                      value={formData.pincode}
                      onChange={(e) => handleInputChange('pincode', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.pincode ? 'border-red-300' : 'border-gray-300'
                        }`}
                      placeholder="400001"
                    />
                    {errors.pincode && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.pincode}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Country
                    </label>
                    <select
                      value={formData.country}
                      onChange={(e) => handleInputChange('country', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="India">India</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Business Information */}
          {currentStep === 3 && (
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
                      value={formData.website}
                      onChange={(e) => handleInputChange('website', e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="https://company.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sub Category <span className="text-gray-500 font-normal">(optional)</span>
                  </label>
                  <div className={`max-h-40 overflow-y-auto border rounded-lg p-3 space-y-2 ${errors.subCategory ? 'border-red-300' : 'border-gray-300'} ${!formData.category ? 'bg-gray-50' : 'bg-white'}`}>
                    {!formData.category && (
                      <p className="text-sm text-amber-700">
                        Choose a <strong>Main Category</strong> first (Personal Information step). Sub-categories stay optional after that.
                      </p>
                    )}
                    {formData.category && selectedSubCategories.length === 0 && (
                      <p className="text-sm text-gray-500">No sub-categories available for this category</p>
                    )}
                    {formData.category && selectedSubCategories.map((subCat) => (
                      <label key={subCat} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedSubCategoryValues.includes(subCat)}
                          onChange={() => toggleSubCategory(subCat)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{subCat}</span>
                      </label>
                    ))}
                  </div>
                  {errors.subCategory && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.subCategory}
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
                      value={formData.panNumber}
                      onChange={(e) =>
                        handleInputChange('panNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))
                      }
                      maxLength={10}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase ${errors.panNumber ? 'border-red-300' : 'border-gray-300'
                        }`}
                      placeholder="ABCDE1234F"
                      autoCapitalize="characters"
                    />
                    <p className="mt-1 text-xs text-gray-500">10 characters · format ABCDE1234F · uppercase</p>
                    {errors.panNumber && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.panNumber}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      GST Number 
                    </label>
                    <input
                      type="text"
                      value={formData.gstNumber}
                      onChange={(e) => handleInputChange('gstNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15))}
                      maxLength={15}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase ${errors.gstNumber ? 'border-red-300' : 'border-gray-300'}`}
                      placeholder="27AAAAA0000A1Z5"
                      autoCapitalize="characters"
                    />
                    <p className="mt-1 text-xs text-gray-500">Max 15 characters · uppercase</p>
                    {errors.gstNumber && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.gstNumber}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preferred Booth Size <span className="text-gray-500">(Optional)</span>
                  </label>
                  <select
                    value={formData.boothSize}
                    onChange={(e) => handleInputChange('boothSize', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.boothSize ? 'border-red-300' : 'border-gray-300'}`}
                  >
                    <option value="">Select booth size</option>
                    {boothSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                  {errors.boothSize && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.boothSize}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Business Description 
                  </label>
                  <textarea
                    value={formData.businessDescription}
                    onChange={(e) => handleInputChange('businessDescription', e.target.value)}
                    rows={4}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.businessDescription ? 'border-red-300' : 'border-gray-300'}`}
                    placeholder="Describe your business, products, and services..."
                  />
                  {errors.businessDescription && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.businessDescription}
                    </p>
                  )}
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
                        value={formData.socialMediaLinks.facebook}
                        onChange={(e) => handleInputChange('socialMediaLinks.facebook', e.target.value)}
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
                        value={formData.socialMediaLinks.linkedin}
                        onChange={(e) => handleInputChange('socialMediaLinks.linkedin', e.target.value)}
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
                        value={formData.socialMediaLinks.instagram}
                        onChange={(e) => handleInputChange('socialMediaLinks.instagram', e.target.value)}
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
                        value={formData.socialMediaLinks.twitter}
                        onChange={(e) => handleInputChange('socialMediaLinks.twitter', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="https://twitter.com/..."
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Documents */}
          {currentStep === 4 && (
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
                        onChange={(e) => handleFileUpload('panCard', e.target.files?.[0] || null)}
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        id="panCard-upload"
                      />
                      <label
                        htmlFor="panCard-upload"
                        className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
                      >
                        Choose File
                      </label>
                      {formData.documents.panCard && (
                        <p className="text-xs text-green-600 mt-2">
                          ✓ {formData.documents.panCard.name}
                        </p>
                      )}
                    </div>
                    {errors.panCard && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.panCard}
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
                        onChange={(e) => handleFileUpload('aadharCard', e.target.files?.[0] || null)}
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        id="aadharCard-upload"
                      />
                      <label
                        htmlFor="aadharCard-upload"
                        className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
                      >
                        Choose File
                      </label>
                      {formData.documents.aadharCard && (
                        <p className="text-xs text-green-600 mt-2">
                          ✓ {formData.documents.aadharCard.name}
                        </p>
                      )}
                    </div>
                    {errors.aadharCard && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.aadharCard}
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
                        onChange={(e) => handleFileUpload('licence', e.target.files?.[0] || null)}
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        id="licence-upload"
                      />
                      <label
                        htmlFor="licence-upload"
                        className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
                      >
                        Choose File
                      </label>
                      {formData.documents.licence && (
                        <p className="text-xs text-green-600 mt-2">
                          ✓ {formData.documents.licence.name}
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
          )}

          {/* Step 5: Upload Images */}
          {currentStep === 5 && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Upload className="h-5 w-5 mr-2" />
                  Upload Images
                </h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-blue-200 bg-blue-50/80 p-4">
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Portfolio image (cover photo)
                  </label>
                  <p className="text-xs text-gray-600 mb-3">
                    Shown on exhibitor lists. If you skip this, the first gallery image below will be used.
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id="portfolio-image-upload"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (!file.type.startsWith('image/')) {
                        setErrors((prev) => ({ ...prev, portfolioImage: 'Please choose an image file.' }));
                        return;
                      }
                      try {
                        const compressed = await compressFile(file, 100);
                        setFormData((prev) => ({ ...prev, portfolioImage: compressed }));
                        setErrors((prev) => ({ ...prev, portfolioImage: '' }));
                      } catch (err) {
                        setErrors((prev) => ({
                          ...prev,
                          portfolioImage: err instanceof Error ? err.message : 'Could not process image',
                        }));
                      }
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <label
                      htmlFor="portfolio-image-upload"
                      className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
                    >
                      Choose portfolio image
                    </label>
                    {formData.portfolioImage && (
                      <>
                        <div className="h-20 w-20 rounded-lg overflow-hidden border border-gray-200 bg-white">
                          <img
                            src={URL.createObjectURL(formData.portfolioImage)}
                            alt="Portfolio preview"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, portfolioImage: null }))}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                  {errors.portfolioImage && (
                    <p className="mt-2 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1 shrink-0" />
                      {errors.portfolioImage}
                    </p>
                  )}
                </div>

                <div>
                  {/* <label className="block text-sm font-medium text-gray-700 mb-2">
                      Images
                    </label> */}
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
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        const validFiles: File[] = [];

                        // Show processing message
                        if (files.length > 0) {
                          setErrors(prev => ({ ...prev, images: 'Processing images...' }));
                        }

                        for (const file of files) {
                          try {
                            // Check file type first
                            if (!file.type.startsWith('image/')) {
                              setErrors(prev => ({
                                ...prev,
                                images: `File "${file.name}" is not a valid image.`
                              }));
                              continue;
                            }

                            // Compress image if needed
                            const compressedFile = await compressFile(file, 100);
                            validFiles.push(compressedFile);

                            // Log compression info
                            if (compressedFile.size < file.size) {
                              const originalSizeKB = Math.round(file.size / 1024);
                              const compressedSizeKB = Math.round(compressedFile.size / 1024);
                              console.log(`Image "${file.name}" compressed from ${originalSizeKB}KB to ${compressedSizeKB}KB`);
                            }

                          } catch (error) {
                            setErrors(prev => ({
                              ...prev,
                              images: `Failed to process "${file.name}": ${error instanceof Error ? error.message : 'Unknown error'}`
                            }));
                            continue;
                          }
                        }

                        if (validFiles.length > 0) {
                          // Clear errors if files are valid
                          setErrors(prev => ({ ...prev, images: '' }));
                          setFormData(prev => ({
                            ...prev,
                            images: [...prev.images, ...validFiles]
                          }));
                        }
                      }}
                      className="hidden"
                      accept="image/*"
                      id="images-upload"
                    />
                    <label
                      htmlFor="images-upload"
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
                    >
                      Choose Images
                    </label>
                    </p>
                    {formData.images.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">
                          Selected Images ({formData.images.length})
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {formData.images.map((file, index) => (
                            <div key={index} className="relative">
                              <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                                <img
                                  src={URL.createObjectURL(file)}
                                  alt={`Preview ${index + 1}`}
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData(prev => ({
                                    ...prev,
                                    images: prev.images.filter((_, i) => i !== index)
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

                  {errors.images && (
                    <div className="mt-4">
                      <p className="text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.images}
                      </p>
                    </div>
                  )}
                </div>



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
          )}

          {/* Step 6: Review & Submit */}
          {currentStep === 6 && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <CheckCircle className="h-5 w-5 mr-2" />
                  Review & Submit
                </h3>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Simple Review Summary */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-blue-900 mb-4">📋 Registration Summary</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div>
                      <h5 className="font-medium text-gray-900 mb-2">Personal Information</h5>
                      <p><strong>Name:</strong> {formData.firstName} {formData.lastName}</p>
                      <p><strong>Email:</strong> {formData.email}</p>
                      <p><strong>Phone:</strong> {formData.phone}</p>
                      {formData.alternatePhone && <p><strong>Alt Phone:</strong> {formData.alternatePhone}</p>}
                    </div>

                    <div>
                      <h5 className="font-medium text-gray-900 mb-2">Company Information</h5>
                      <p><strong>Company:</strong> {formData.companyName || 'Not provided'}</p>
                      <p><strong>Category:</strong> {formData.category || 'Not provided'}</p>
                      <p><strong>Sub Category:</strong> {formData.subCategory || 'Not provided'}</p>
                      {formData.website && <p><strong>Website:</strong> {formData.website}</p>}
                    </div>

                    <div>
                      <h5 className="font-medium text-gray-900 mb-2">Address</h5>
                      {formData.address1?.trim() || formData.city || formData.state || formData.pincode?.trim() ? (
                        <>
                          <p><strong>Address:</strong> {formData.address1 || '—'}</p>
                          {formData.address2 && <p>{formData.address2}</p>}
                          <p>{[formData.city, formData.state].filter(Boolean).join(', ') || '—'}{formData.pincode ? ` - ${formData.pincode}` : ''}</p>
                          <p>{formData.country || '—'}</p>
                        </>
                      ) : (
                        <p className="text-gray-600">Not provided</p>
                      )}
                    </div>

                    <div>
                      <h5 className="font-medium text-gray-900 mb-2">Documents & Images</h5>
                      <p><strong>PAN Card:</strong> {formData.documents.panCard ? 'Uploaded' : 'Not provided'}</p>
                      <p><strong>Aadhar Card:</strong> {formData.documents.aadharCard ? 'Uploaded' : 'Not provided'}</p>
                      <p><strong>Licence:</strong> {formData.documents.licence ? 'Uploaded' : 'Not provided'}</p>
                      <p><strong>Portfolio:</strong> {formData.portfolioImage ? 'Yes' : formData.images.length ? 'Uses first gallery image' : 'None'}</p>
                      <p><strong>Gallery images:</strong> {formData.images.length} uploaded</p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex">
                    <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 mr-3" />
                    <div className="text-sm">
                      <h4 className="font-medium text-green-900">Ready to Submit</h4>
                      <p className="mt-1 text-green-700">
                        Please review the information above and click "Register Exhibitor" to complete the registration.
                      </p>
                    </div>
                  </div>
                </div>


              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Current Step Info */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900">Current Step</h3>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  {React.createElement(steps[currentStep - 1].icon, { className: "h-8 w-8 text-blue-600" })}
                </div>
                <h4 className="font-medium text-gray-900">{steps[currentStep - 1].title}</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Step {currentStep} of {steps.length}
                </p>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(currentStep / steps.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Navigation Buttons */}
          <div className="space-y-3">
            {currentStep < 6 ? (
              <>
                <Button
                  onClick={nextStep}
                  className="w-full flex items-center justify-center space-x-2"
                >
                  <span>Continue to Next Step</span>
                  <ArrowLeft className="h-4 w-4 rotate-180" />
                </Button>
                {currentStep === 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={skipOptionalToReview}
                    className="w-full text-sm"
                  >
                    Skip optional steps — go to Review
                  </Button>
                )}
                {currentStep > 1 && (
                  <Button
                    variant="outline"
                    onClick={prevStep}
                    className="w-full flex items-center justify-center space-x-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Previous Step</span>
                  </Button>
                )}
              </>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Registering...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Register Exhibitor</span>
                  </>
                )}
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => navigate('/exhibitors')}
              className="w-full"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};