import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Phone } from 'lucide-react';
import { validatePhone } from '../../utils/validation';
import { sanitizePhoneInput, PHONE_PLACEHOLDER, PHONE_HINT } from '../../utils/phone';

interface PhoneValidationInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** @deprecated India-only 10-digit is the product standard; ignored. */
  allowInternational?: boolean;
}

export const PhoneValidationInput: React.FC<PhoneValidationInputProps> = ({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  className = '',
  placeholder = PHONE_PLACEHOLDER,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const showValidation = hasInteracted || isFocused;
  const validationResult = validatePhone(value);
  const isError = Boolean(value) && validationResult && !validationResult.isValid;
  const isSuccess = Boolean(value) && validationResult && validationResult.isValid;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(sanitizePhoneInput(e.target.value));
    if (!hasInteracted) setHasInteracted(true);
  };

  const getInputClasses = () => {
    let baseClasses =
      'w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200';

    if (isError && showValidation) baseClasses += ' border-red-300 bg-red-50';
    else if (isSuccess && showValidation) baseClasses += ' border-green-300 bg-green-50';
    else if (isFocused) baseClasses += ' border-blue-300';
    else baseClasses += ' border-gray-300';

    if (disabled) baseClasses += ' bg-gray-100 cursor-not-allowed';
    return baseClasses;
  };

  const getLabelClasses = () => {
    let baseClasses = 'block text-sm font-medium mb-2';
    if (isError && showValidation) baseClasses += ' text-red-700';
    else if (isSuccess && showValidation) baseClasses += ' text-green-700';
    else baseClasses += ' text-gray-700';
    return baseClasses;
  };

  return (
    <div className={className}>
      <label className={getLabelClasses()}>
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Phone className="h-4 w-4" />
        </div>

        <input
          type="tel"
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          className={getInputClasses()}
          maxLength={10}
          inputMode="numeric"
          pattern="[0-9]{10}"
          title="10-digit mobile number"
          autoComplete="tel"
        />

        {showValidation && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isError && <AlertCircle className="h-4 w-4 text-red-500" />}
            {isSuccess && <CheckCircle className="h-4 w-4 text-green-500" />}
          </div>
        )}
      </div>

      {isError && showValidation && (
        <p className="mt-1 text-sm text-red-600 flex items-center">
          <AlertCircle className="h-4 w-4 mr-1" />
          {validationResult.message}
        </p>
      )}

      {isSuccess && showValidation && (
        <p className="mt-1 text-sm text-green-600 flex items-center">
          <CheckCircle className="h-4 w-4 mr-1" />
          Valid phone number
        </p>
      )}

      <p className="mt-1 text-xs text-gray-500">{PHONE_HINT}</p>
    </div>
  );
};
