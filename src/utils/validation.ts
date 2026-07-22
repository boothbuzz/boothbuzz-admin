// Validation utility functions for real-time form validation

import { normalizeIndianMobile } from './phone';

export interface ValidationResult {
  isValid: boolean;
  message: string;
}

// Email validation
export const validateEmail = (email: string): ValidationResult => {
  if (!email.trim()) {
    return { isValid: false, message: 'Email is required' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, message: 'Please enter a valid email address' };
  }
  
  if (email.length > 254) {
    return { isValid: false, message: 'Email must be less than 254 characters' };
  }
  
  return { isValid: true, message: '' };
};

// Phone validation — India 10-digit mobile (aligned with API normalizePhone)
export const validatePhone = (phone: string): ValidationResult => {
  if (!phone.trim()) {
    return { isValid: false, message: 'Phone number is required' };
  }

  const cleanPhone = normalizeIndianMobile(phone);

  if (cleanPhone.length !== 10) {
    return { isValid: false, message: 'Phone number must be exactly 10 digits' };
  }

  if (!/^\d{10}$/.test(cleanPhone)) {
    return { isValid: false, message: 'Please enter a valid 10-digit phone number' };
  }

  return { isValid: true, message: '' };
};

// Pin code validation (Indian format)
export const validatePinCode = (pincode: string): ValidationResult => {
  if (!pincode.trim()) {
    return { isValid: false, message: 'Pin code is required' };
  }
  
  if (!/^[0-9]{6}$/.test(pincode.trim())) {
    return { isValid: false, message: 'Pin code must be exactly 6 digits' };
  }
  
  return { isValid: true, message: '' };
};

// Bank account number validation (empty = optional)
export const validateBankAccountNumber = (accountNumber: string): ValidationResult => {
  if (!accountNumber.trim()) {
    return { isValid: true, message: '' };
  }

  if (!/^[0-9]{9,18}$/.test(accountNumber.trim())) {
    return { isValid: false, message: 'Account number must be 9-18 digits' };
  }
  
  return { isValid: true, message: '' };
};

// Bank IFSC validation (empty = optional)
export const validateBankIFSC = (ifsc: string): ValidationResult => {
  if (!ifsc.trim()) {
    return { isValid: true, message: '' };
  }

  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
  if (!ifscRegex.test(ifsc.trim())) {
    return { isValid: false, message: 'Invalid IFSC format (e.g., HDFC0001234)' };
  }
  
  return { isValid: true, message: '' };
};

// Bank MICR validation (empty = optional)
export const validateBankMICR = (micr: string): ValidationResult => {
  if (!micr.trim()) {
    return { isValid: true, message: '' };
  }

  if (!/^[0-9]{9}$/.test(micr.trim())) {
    return { isValid: false, message: 'MICR must be exactly 9 digits' };
  }
  
  return { isValid: true, message: '' };
};

// Bank holder name validation (empty = optional)
export const validateBankHolderName = (holderName: string): ValidationResult => {
  if (!holderName.trim()) {
    return { isValid: true, message: '' };
  }

  if (holderName.trim().length < 2) {
    return { isValid: false, message: 'Account holder name must be at least 2 characters' };
  }
  
  if (holderName.trim().length > 100) {
    return { isValid: false, message: 'Account holder name must be less than 100 characters' };
  }
  
  return { isValid: true, message: '' };
};

// Bank name validation (empty = optional)
export const validateBankName = (bankName: string): ValidationResult => {
  if (!bankName.trim()) {
    return { isValid: true, message: '' };
  }

  if (bankName.trim().length < 2) {
    return { isValid: false, message: 'Bank name must be at least 2 characters' };
  }
  
  if (bankName.trim().length > 100) {
    return { isValid: false, message: 'Bank name must be less than 100 characters' };
  }
  
  return { isValid: true, message: '' };
};

// Generic text validation
export const validateRequiredText = (value: string, fieldName: string, minLength: number = 2, maxLength: number = 100): ValidationResult => {
  if (!value.trim()) {
    return { isValid: false, message: `${fieldName} is required` };
  }
  
  if (value.trim().length < minLength) {
    return { isValid: false, message: `${fieldName} must be at least ${minLength} characters` };
  }
  
  if (value.trim().length > maxLength) {
    return { isValid: false, message: `${fieldName} must be less than ${maxLength} characters` };
  }
  
  return { isValid: true, message: '' };
};

// Number validation
export const validateNumber = (value: number, fieldName: string, minValue: number = 0, maxValue?: number): ValidationResult => {
  if (value < minValue) {
    return { isValid: false, message: `${fieldName} must be at least ${minValue}` };
  }
  
  if (maxValue !== undefined && value > maxValue) {
    return { isValid: false, message: `${fieldName} must be less than ${maxValue}` };
  }
  
  return { isValid: true, message: '' };
};
