import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../lib/apiClient';
import { resolveMediaUrl } from '../../lib/api';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
};

/** Parses bucket and object path from a Supabase public object URL. */
function parseStoragePublicUrl(url: string): { bucket: string; path: string } | null {
  const marker = '/storage/v1/object/public/';
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const rest = url.slice(i + marker.length);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  const bucket = rest.slice(0, slash);
  const path = decodeURIComponent(rest.slice(slash + 1).split('?')[0] || '');
  if (!bucket || !path) return null;
  return { bucket, path };
}

/**
 * Renders an exhibitor/event image; if the public URL fails (private bucket), requests a short-lived signed URL.
 */
export const ExhibitorStorageImage: React.FC<Props> = ({ src, alt = '', onError, ...rest }) => {
  const [resolved, setResolved] = useState(() => resolveMediaUrl(src) || src);
  const triedSign = useRef(false);

  useEffect(() => {
    setResolved(resolveMediaUrl(src) || src);
    triedSign.current = false;
  }, [src]);

  const handleError = useCallback(
    async (e: React.SyntheticEvent<HTMLImageElement>) => {
      if (triedSign.current) {
        onError?.(e);
        return;
      }
      const parsed = parseStoragePublicUrl(resolved);
      if (!parsed) {
        onError?.(e);
        return;
      }
      triedSign.current = true;
      const { data, error } = await apiClient.storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.path, 3600);
      if (!error && data?.signedUrl) {
        setResolved(data.signedUrl);
        return;
      }
      triedSign.current = false;
      onError?.(e);
    },
    [resolved, onError]
  );

  return <img {...rest} src={resolved} alt={alt} onError={handleError} />;
};

/** Stable blob URL for a File in forms (revoked on change/unmount). */
export const LocalFileImagePreview: React.FC<{
  file: File;
  className?: string;
  alt?: string;
}> = ({ file, className, alt = '' }) => {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (!url) {
    return <div className={className} />;
  }
  return <img src={url} alt={alt} className={className} />;
};
