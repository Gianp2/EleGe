import React, { useState, useEffect } from 'react';

interface NumericInputProps {
  value: number | null | undefined;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  allowEmptyZero?: boolean;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

/**
 * Campo numérico amigable: permite borrar el "0" completamente mientras se escribe
 * sin forzar un "0" pegajoso, manteniendo valor numérico limpio para la lógica.
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  min = 0,
  max,
  allowEmptyZero = true,
  placeholder = '0',
  className = '',
  required,
  disabled,
  id,
  'aria-label': ariaLabel,
}) => {
  const formatInitial = (val: number | null | undefined) => {
    if (val === null || val === undefined || Number.isNaN(val)) return '';
    return String(val);
  };

  const [text, setText] = useState<string>(() => formatInitial(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setText(formatInitial(value));
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    // Permitir vaciar el campo libremente
    if (raw === '') {
      setText('');
      if (allowEmptyZero) {
        onChange(0);
      }
      return;
    }

    // Permitir solo dígitos (y un punto/coma opcional si se usa, normalizando)
    const sanitized = raw.replace(/[^\d]/g, '');
    if (sanitized === '') {
      setText('');
      if (allowEmptyZero) onChange(0);
      return;
    }

    // Quitar ceros a la izquierda salvo que sea literalmente "0"
    const normalized = sanitized.length > 1 ? sanitized.replace(/^0+/, '') || '0' : sanitized;
    let parsed = parseInt(normalized, 10);
    if (Number.isNaN(parsed)) parsed = 0;

    if (max !== undefined && parsed > max) {
      parsed = max;
      setText(String(parsed));
    } else {
      setText(normalized);
    }

    onChange(parsed);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    // Si está en 0, seleccionar todo para reemplazar directo al tipear
    if (text === '0') {
      e.target.select();
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (text === '') {
      const fallback = min > 0 ? min : 0;
      onChange(fallback);
      setText(String(fallback));
      return;
    }
    let parsed = parseInt(text, 10);
    if (Number.isNaN(parsed)) parsed = min > 0 ? min : 0;
    if (min !== undefined && parsed < min) parsed = min;
    if (max !== undefined && parsed > max) parsed = max;
    onChange(parsed);
    setText(String(parsed));
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={text}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
    />
  );
};
