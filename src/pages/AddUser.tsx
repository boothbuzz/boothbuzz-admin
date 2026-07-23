import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../lib/apiClient';
import { 
  Save, 
  ArrowLeft, 
  User, 
  Mail, 
  MapPin, 
  Shield, 
  Eye, 
  EyeOff,
  AlertCircle,
  CheckCircle,
  Info
} from 'lucide-react';
import { PhoneInput } from '../components/UI/PhoneInput';
import { Card, CardHeader, CardContent } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';

interface FormData {
  name: string;
  email: string;
  phone: string;
  role: string;
  city: string;
  organizationId: string;
  password: string;
  confirmPassword: string;
  status: 'active' | 'inactive';
  sendWelcomeEmail: boolean;
  sendInvite: boolean;
}

interface FormErrors {
  [key: string]: string;
}

const rolePermissions = {
  super_admin: {
    label: 'Super Admin',
    description: 'Full system access and control',
    permissions: ['All system permissions', 'User management', 'System configuration', 'Global reports'],
    color: 'error'
  },
  admin: {
    label: 'City Admin',
    description: 'City-level administration',
    permissions: ['City management', 'Event management', 'Society management', 'Local reports'],
    color: 'warning'
  },
  support_tech: {
    label: 'Support Tech',
    description: 'Technical support and assistance',
    permissions: ['Event support', 'User assistance', 'Technical troubleshooting', 'System monitoring'],
    color: 'info'
  },
  sales_marketing: {
    label: 'Sales & Marketing',
    description: 'Sales and marketing operations',
    permissions: ['Lead management', 'Marketing campaigns', 'Sales reports', 'Customer relations'],
    color: 'success'
  },
  accounting: {
    label: 'Accounting',
    description: 'Financial management',
    permissions: ['Financial reports', 'Invoice management', 'Payment tracking', 'Billing operations'],
    color: 'default'
  },
  logistics: {
    label: 'Logistics',
    description: 'Vendor and supply management',
    permissions: ['Vendor management', 'Supply chain', 'Inventory management', 'Logistics coordination'],
    color: 'default'
  },
  accounts: {
    label: 'Accounts',
    description: 'Accounts and finance',
    permissions: ['Financial reports', 'Invoice management', 'Payment tracking'],
    color: 'default'
  },
  sales: {
    label: 'Sales',
    description: 'Sales operations',
    permissions: ['Lead management', 'Sales reports', 'Customer relations'],
    color: 'success'
  },
  marketing: {
    label: 'Marketing',
    description: 'Marketing operations',
    permissions: ['Marketing campaigns', 'Brand management', 'Content'],
    color: 'success'
  },
  city_head: {
    label: 'City Head',
    description: 'City-level lead',
    permissions: ['City operations', 'Local team management', 'City reports'],
    color: 'warning'
  }
};

const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Pune', 'Chennai', 'Hyderabad', 'Kolkata', 'Ahmedabad'];

const ORG_ROLES: (keyof typeof rolePermissions)[] = ['admin', 'accounts', 'sales', 'marketing', 'city_head', 'support_tech', 'logistics', 'accounting', 'sales_marketing'];

interface OrgOption {
  id: string;
  name: string;
}

export const AddUser: React.FC = () => {
  const navigate = useNavigate();
  const { hasRole, isSuperAdmin, isOrgAdmin } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    role: '',
    city: '',
    organizationId: '',
    password: '',
    confirmPassword: '',
    status: 'active',
    sendWelcomeEmail: true,
    sendInvite: false
  });

  const [errors, setErrors] = useState<FormErrors>({});

  if (!hasRole(['super_admin', 'admin'])) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to add users.</p>
        </div>
      </div>
    );
  }

  const isOrgAdminFlow = isOrgAdmin;
  const roleOptions = ORG_ROLES;
  const adminWithoutOrg = hasRole(['admin']) && !isOrgAdmin;

  React.useEffect(() => {
    if (!isSuperAdmin) return;
    apiClient.from('organizations').select('id, name').order('name').then(({ data }) => {
      setOrganizations(data || []);
    });
  }, [isSuperAdmin]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!isOrgAdminFlow) {
      if (!formData.phone.trim()) {
        newErrors.phone = 'Phone number is required';
      } else if (formData.phone.length > 10 || formData.phone.length < 10 || !/^[0-9]{10}$/.test(formData.phone)) {
        newErrors.phone = 'Phone number must be 10 digits';
      }
    }

    if (!formData.role) {
      newErrors.role = 'Role is required';
    }

    if (isSuperAdmin && !formData.organizationId) {
      newErrors.organizationId = 'Organization is required';
    }

    if (!isOrgAdminFlow && !isSuperAdmin && formData.role && !formData.city) {
      newErrors.city = 'City is required for this role';
    }

    if (isOrgAdminFlow) {
      if (!formData.password || formData.password.length < 6) {
        newErrors.password = 'Password is required (min 6 characters)';
      } else if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    } else {
      if (!formData.password) {
        newErrors.password = 'Password is required';
      } else if (formData.password.length < 8) {
        newErrors.password = 'Password must be at least 8 characters';
      } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
        newErrors.password = 'Password must contain uppercase, lowercase, and number';
      }
      if (!formData.confirmPassword) {
        newErrors.confirmPassword = 'Please confirm your password';
      } else if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminWithoutOrg) return;
    if (!validateForm()) return;
    setIsSubmitting(true);

    try {
      if (isOrgAdminFlow) {
        const { error: apiErr } = await apiClient.from('users').insert({
          email: formData.email.trim(),
          name: formData.name.trim(),
          role: formData.role,
          password: formData.password,
          phone: formData.phone?.trim() || undefined,
          city: formData.city?.trim() || undefined,
        }).execute();
        if (apiErr) throw new Error(apiErr.message);
        setSubmitSuccess(true);
        setTimeout(() => navigate('/users'), 2000);
        return;
      }

      const { error: apiErr } = await apiClient.from('users').insert({
        email: formData.email.trim(),
        name: formData.name.trim(),
        role: formData.role,
        password: formData.password,
        phone: formData.phone?.trim() || undefined,
        city: formData.city?.trim() || undefined,
        organizationId: formData.organizationId || undefined,
      }).execute();
      if (apiErr) throw new Error(apiErr.message);

      setSubmitSuccess(true);
      setTimeout(() => navigate('/users'), 2000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create user. Please try again.';
      setErrors({ submit: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedRole = formData.role ? rolePermissions[formData.role as keyof typeof rolePermissions] : null;

  if (submitSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">User Created Successfully!</h2>
            <p className="text-gray-600 mb-6">
              The new user has been created and can now log in with their credentials.
            </p>
            <div className="space-y-2">
              <Button onClick={() => navigate('/users')} className="w-full">
                Go to User Management
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setSubmitSuccess(false);
                  setFormData({
                    name: '',
                    email: '',
                    phone: '',
                    role: '',
                    city: '',
                    organizationId: '',
                    password: '',
                    confirmPassword: '',
                    status: 'active',
                    sendWelcomeEmail: true,
                    sendInvite: false
                  });
                }}
                className="w-full"
              >
                Add Another User
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
            onClick={() => navigate('/users')}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Users</span>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Add New User</h1>
            <p className="text-gray-600">Create a new user account with appropriate permissions</p>
          </div>
        </div>
      </div>

      {adminWithoutOrg && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          Your account is not linked to an organization. Contact your Super Admin to fix this. You won&apos;t be able to create users until your account is assigned to an organization.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <User className="h-5 w-5 mr-2" />
                  Basic Information
                </h3>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.name ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Enter full name"
                    />
                    {errors.name && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          errors.email ? 'border-red-300' : 'border-gray-300'
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <PhoneInput
                      label="Phone Number"
                      value={formData.phone}
                      onChange={(value) => handleInputChange('phone', value)}
                      required={!isOrgAdminFlow}
                      error={errors.phone}
                      name="phone"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => handleInputChange('status', e.target.value as 'active' | 'inactive')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Role & Permissions */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Shield className="h-5 w-5 mr-2" />
                  Role & Permissions
                </h3>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      User Role *
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) => handleInputChange('role', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.role ? 'border-red-300' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Select a role</option>
                      {roleOptions.map((key) => (
                        <option key={key} value={key}>
                          {rolePermissions[key].label}
                        </option>
                      ))}
                    </select>
                    {errors.role && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.role}
                      </p>
                    )}
                  </div>

                  {isSuperAdmin && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Organization *</label>
                      <select
                        value={formData.organizationId}
                        onChange={(e) => handleInputChange('organizationId', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          errors.organizationId ? 'border-red-300' : 'border-gray-300'
                        }`}
                      >
                        <option value="">Select organization</option>
                        {organizations.map((org) => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </select>
                      {errors.organizationId && (
                        <p className="mt-1 text-sm text-red-600 flex items-center">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          {errors.organizationId}
                        </p>
                      )}
                    </div>
                  )}

                  {!isOrgAdminFlow && !isSuperAdmin && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">City Assignment *</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <select
                          value={formData.city}
                          onChange={(e) => handleInputChange('city', e.target.value)}
                          className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            errors.city ? 'border-red-300' : 'border-gray-300'
                          }`}
                        >
                          <option value="">Select a city</option>
                          {cities.map((city) => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                        </select>
                      </div>
                      {errors.city && (
                        <p className="mt-1 text-sm text-red-600 flex items-center">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          {errors.city}
                        </p>
                      )}
                    </div>
                  )}
                  {isOrgAdminFlow && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">City (optional)</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <select
                          value={formData.city}
                          onChange={(e) => handleInputChange('city', e.target.value)}
                          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select a city</option>
                          {cities.map((city) => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {isSuperAdmin && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">City (optional)</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <select
                          value={formData.city}
                          onChange={(e) => handleInputChange('city', e.target.value)}
                          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select a city</option>
                          {cities.map((city) => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Security */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900">Security Settings</h3>
              </CardHeader>
              <CardContent className="space-y-6">
                {isOrgAdminFlow && (
                  <p className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    An invite email with login details will be sent to this address when Resend is configured on the API.
                    Set a temporary password below (the user may be asked to change it on first login).
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Password {isOrgAdminFlow ? '(min 6)' : '*'}
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={formData.password}
                          onChange={(e) => handleInputChange('password', e.target.value)}
                          className={`w-full pr-10 pl-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            errors.password ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder={isOrgAdminFlow ? 'Min 6 characters' : 'Enter password'}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errors.password && (
                        <p className="mt-1 text-sm text-red-600 flex items-center">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          {errors.password}
                        </p>
                      )}
                      {!isOrgAdminFlow && (
                        <p className="mt-1 text-xs text-gray-500">
                          Must be at least 8 characters with uppercase, lowercase, and number
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Confirm Password *
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={formData.confirmPassword}
                          onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                          className={`w-full pr-10 pl-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            errors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder="Confirm password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errors.confirmPassword && (
                        <p className="mt-1 text-sm text-red-600 flex items-center">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          {errors.confirmPassword}
                        </p>
                      )}
                    </div>
                  </div>
                {!isOrgAdminFlow && (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="sendWelcomeEmail"
                      checked={formData.sendWelcomeEmail}
                      onChange={(e) => handleInputChange('sendWelcomeEmail', e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      disabled
                    />
                    <label htmlFor="sendWelcomeEmail" className="ml-2 block text-sm text-gray-700">
                      Send welcome email with login credentials (Coming soon)
                    </label>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Role Preview */}
            {selectedRole && (
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold text-gray-900">Role Preview</h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-gray-900">{selectedRole.label}</h4>
                      <Badge variant={selectedRole.color as any}>
                        {formData.role.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-gray-600">{selectedRole.description}</p>
                    
                    <div>
                      <h5 className="text-sm font-medium text-gray-700 mb-2">Permissions:</h5>
                      <ul className="space-y-1">
                        {selectedRole.permissions.map((permission, index) => (
                          <li key={index} className="text-sm text-gray-600 flex items-center">
                            <CheckCircle className="h-3 w-3 text-green-500 mr-2 flex-shrink-0" />
                            {permission}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Help & Guidelines */}
            <Card>
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
                    <p>Choose the appropriate role based on the user's responsibilities</p>
                  </div>
                  <div className="flex items-start">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    <p>City assignment is required for all roles except Super Admin</p>
                  </div>
                  <div className="flex items-start">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    <p>Strong passwords are enforced for security</p>
                  </div>
                  <div className="flex items-start">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    <p>Welcome emails include login instructions</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="space-y-3">
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
                disabled={isSubmitting || adminWithoutOrg}
                className="w-full flex items-center justify-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Creating User...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Create User</span>
                  </>
                )}
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/users')}
                className="w-full"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};