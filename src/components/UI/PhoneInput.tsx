import React, { useState, useEffect } from 'react';
import { sanitizePhoneInput, PHONE_PLACEHOLDER, PHONE_HINT } from '../../utils/phone';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  className?: string;
  label?: string;
  name?: string;
  disabled?: boolean;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChange,
  placeholder = PHONE_PLACEHOLDER,
  required = false,
  error,
  className = '',
  label,
  name,
  disabled = false,
}) => {
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const applyValue = (raw: string) => {
    const limitedDigits = sanitizePhoneInput(raw);
    setInputValue(limitedDigits);
    onChange(limitedDigits);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyValue(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowedKeys = [
      'Backspace',
      'Delete',
      'Tab',
      'Escape',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
    ];

    if (allowedKeys.includes(e.key)) return;
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      return;
    }
    if (inputValue.length >= 10) {
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    applyValue(e.clipboardData.getData('text'));
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <span className="absolute left-1 top-1/3 h-3 w-3 -translate-y-1/2 text-gray-400">+91-&nbsp;</span>
        <input
          type="tel"
          name={name}
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled}
          className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            error ? 'border-red-300' : 'border-gray-300'
          } ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''} ${className}`}
          placeholder={placeholder}
          maxLength={10}
          inputMode="numeric"
          autoComplete="tel"
        />
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {!error && value.length > 0 && value.length < 10 && (
        <p className="mt-1 text-sm text-amber-600">Phone number must be exactly 10 digits</p>
      )}
      {!error && value.length === 10 && (
        <p className="mt-1 text-sm text-green-600">✓ Valid phone number</p>
      )}
      {!error && value.length === 0 && (
        <p className="mt-1 text-xs text-gray-500">{PHONE_HINT}</p>
      )}
    </div>
  );
};
