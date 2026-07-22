import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../lib/apiClient';
import {
  ArrowLeft,
  Building2,
  User,
  Mail,
  Phone,
  DollarSign,
  Calendar,
  CheckCircle,
  Award,
  FileText
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { useAuth } from '../contexts/AuthContext';
import { useOrganizations } from '../hooks/useOrganizations';
import { OrganizationSelect, resolveOrganizationId } from '../components/UI/OrganizationSelect';

type SponsorshipType = 'event' | 'society' | 'platform';
type SponsorshipLevel = 'platinum' | 'gold' | 'silver' | 'bronze';
type SponsorStatus = 'active' | 'pending' | 'expired' | 'cancelled';

interface FormData {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  organizationId: string;
  sponsorshipType: SponsorshipType;
  sponsorshipLevel: SponsorshipLevel;
  amount: number;
  startDate: string;
  endDate: string;
  status: SponsorStatus;
  benefitsText: string;
}

interface FormErrors {
  [key: string]: string;
}

export const AddSponsor: React.FC = () => {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const { organizations } = useOrganizations();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    companyName: '',
    contactPerson: '',
    email: '',
    phone: '',
    organizationId: '',
    sponsorshipType: 'event',
    sponsorshipLevel: 'silver',
    amount: 0,
    startDate: '',
    endDate: '',
    status: 'pending',
    benefitsText: ''
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.companyName.trim()) newErrors.companyName = 'Company name is required';
    if (!formData.contactPerson.trim()) newErrors.contactPerson = 'Contact person is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!emailRegex.test(formData.email)) newErrors.email = 'Enter a valid email';
    if (formData.amount < 0) newErrors.amount = 'Amount cannot be negative';
    if (!formData.startDate) newErrors.startDate = 'Start date is required';
    if (!formData.endDate) newErrors.endDate = 'End date is required';
    if (formData.startDate && formData.endDate && formData.startDate > formData.endDate) {
      newErrors.endDate = 'End date must be after start date';
    }
    if (isSuperAdmin && !formData.organizationId) {
      newErrors.organizationId = 'Organization is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);
    setErrors({});

    try {
      const benefits = formData.benefitsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const { error } = await apiClient.from('sponsors').insert({
        organization_id: resolveOrganizationId(isSuperAdmin, formData.organizationId, user?.organizationId),
        company_name: formData.companyName.trim(),
        contact_person: formData.contactPerson.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || null,
        sponsorship_type: formData.sponsorshipType,
        sponsorship_level: formData.sponsorshipLevel,
        amount: Number(formData.amount),
        start_date: formData.startDate,
        end_date: formData.endDate,
        status: formData.status,
        benefits,
        events_sponsored: 0
      });

      if (error) throw new Error(error.message);
      setSubmitSuccess(true);
      setTimeout(() => navigate('/ads-sponsors'), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add sponsor.';
      setErrors({ submit: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Sponsor Added Successfully</h2>
            <p className="text-gray-600 mb-6">
              &quot;{formData.companyName}&quot; has been added. Redirecting to Ads & Sponsors…
            </p>
            <Button onClick={() => navigate('/ads-sponsors')} className="w-full">
              Go to Ads & Sponsors
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={() => navigate('/ads-sponsors')} className="flex items-center space-x-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Ads & Sponsors</span>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Add New Sponsor</h1>
            <p className="text-gray-600">Register a new sponsor partner</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Building2 className="h-5 w-5 mr-2" />
                  Company & Contact
                </h3>
              </CardHeader>
              <CardContent className="space-y-4">
                {isSuperAdmin && (
                  <OrganizationSelect
                    value={formData.organizationId}
                    onChange={(id) => handleInputChange('organizationId', id)}
                    organizations={organizations}
                    error={errors.organizationId}
                  />
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => handleInputChange('companyName', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.companyName ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="e.g. TechCorp Industries"
                  />
                  {errors.companyName && <p className="text-sm text-red-600 mt-1">{errors.companyName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person *</label>
                  <input
                    type="text"
                    value={formData.contactPerson}
                    onChange={(e) => handleInputChange('contactPerson', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.contactPerson ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Full name"
                  />
                  {errors.contactPerson && <p className="text-sm text-red-600 mt-1">{errors.contactPerson}</p>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        errors.email ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="contact@company.com"
                    />
                    {errors.email && <p className="text-sm text-red-600 mt-1">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="+91-9876543210"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Benefits
                </h3>
                <p className="text-sm text-gray-500">One benefit per line</p>
              </CardHeader>
              <CardContent>
                <textarea
                  value={formData.benefitsText}
                  onChange={(e) => handleInputChange('benefitsText', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Logo on all events&#10;Dedicated booth space&#10;Email marketing"
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Award className="h-5 w-5 mr-2" />
                  Sponsorship Details
                </h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={formData.sponsorshipType}
                    onChange={(e) => handleInputChange('sponsorshipType', e.target.value as SponsorshipType)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="event">Event</option>
                    <option value="society">Society</option>
                    <option value="platform">Platform</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                  <select
                    value={formData.sponsorshipLevel}
                    onChange={(e) => handleInputChange('sponsorshipLevel', e.target.value as SponsorshipLevel)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="platinum">Platinum</option>
                    <option value="gold">Gold</option>
                    <option value="silver">Silver</option>
                    <option value="bronze">Bronze</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.amount || ''}
                    onChange={(e) => handleInputChange('amount', e.target.value === '' ? 0 : Number(e.target.value))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.amount ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="0"
                  />
                  {errors.amount && <p className="text-sm text-red-600 mt-1">{errors.amount}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value as SponsorStatus)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Duration
                </h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => handleInputChange('startDate', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.startDate ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.startDate && <p className="text-sm text-red-600 mt-1">{errors.startDate}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => handleInputChange('endDate', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.endDate ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.endDate && <p className="text-sm text-red-600 mt-1">{errors.endDate}</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {errors.submit && (
          <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{errors.submit}</div>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/ads-sponsors')}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Adding…' : 'Add Sponsor'}
          </Button>
        </div>
      </form>
    </div>
  );
};
