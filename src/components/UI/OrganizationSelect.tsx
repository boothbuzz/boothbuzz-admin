import React from 'react';
import { AlertCircle, Building2 } from 'lucide-react';
import { OrganizationOption } from '../../hooks/useOrganizations';

type Props = {
  value: string;
  onChange: (organizationId: string) => void;
  organizations: OrganizationOption[];
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Super-admin organization picker. Render only when `isSuperAdmin`. */
export const OrganizationSelect: React.FC<Props> = ({
  value,
  onChange,
  organizations,
  error,
  required = true,
  disabled = false,
  className = '',
}) => {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Organization {required ? '*' : ''}
      </label>
      <div className="relative">
        <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            error ? 'border-red-300' : 'border-gray-300'
          } ${disabled ? 'bg-gray-50 text-gray-500' : ''}`}
        >
          <option value="">Select organization</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-600 flex items-center">
          <AlertCircle className="h-4 w-4 mr-1" />
          {error}
        </p>
      )}
    </div>
  );
};

/** Resolve org id to send on create: picker for super admin, session org otherwise. */
export function resolveOrganizationId(
  isSuperAdmin: boolean,
  selectedOrganizationId: string | undefined | null,
  sessionOrganizationId: string | null | undefined,
): string | null {
  if (isSuperAdmin) {
    return selectedOrganizationId?.trim() || null;
  }
  return sessionOrganizationId ?? null;
}
