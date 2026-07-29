import React, { useEffect, useMemo, useState } from 'react';
import { X, Download, Sparkles, Loader2, ImagePlus } from 'lucide-react';
import { Button } from '../UI/Button';
import { Event } from '../../types';
import { apiClient } from '../../lib/apiClient';
import { generateEventFlyerImage } from '../../utils/generateEventFlyerImage';

type Props = {
  isOpen: boolean;
  event: Event | null;
  onClose: () => void;
  onSaved?: (imageUrls: string[]) => void | Promise<void>;
};

type FlyerFormState = {
  title: string;
  subtitle: string;
  dateText: string;
  timeText: string;
  venueText: string;
  organizerText: string;
  stallsText: string;
  sponsorText: string;
  ctaText: string;
};

const formatSponsorRole = (role?: string | null) => {
  if (!role) return 'Sponsor';
  if (role === 'title') return 'Title Sponsor';
  if (role === 'co_sponsor') return 'Co Sponsor';
  if (role === 'in_kind') return 'In-kind Sponsor';
  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getStallSummary = (event: Event): string => {
  const stalls = (event.inSiteStalls || []) as Array<{ price?: number; stallPrice?: number }>;
  const planned = Number(event.noOfStalls || 0);
  const configured = stalls.length;
  const prices = stalls
    .map((s) => Number(s.price ?? s.stallPrice ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  const count = planned > 0 ? planned : configured;
  if (count <= 0) return 'Stalls: To be announced';
  if (prices.length === 0) return `Stalls: ${count}`;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const priceText = min === max ? `Rs ${min}` : `Rs ${min} - Rs ${max}`;
  return `Stalls: ${count} | ${priceText}`;
};

const parseEventImages = (eventImageUrl: unknown): string[] => {
  if (eventImageUrl == null) return [];
  if (Array.isArray(eventImageUrl)) {
    return eventImageUrl
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
  }
  if (typeof eventImageUrl !== 'string') return [];
  const normalized = eventImageUrl.trim();
  if (!normalized) return [];

  if (normalized.startsWith('[') || normalized.startsWith('{')) {
    try {
      const parsed = JSON.parse(normalized);
      return parseEventImages(parsed);
    } catch {
      // fall through and treat raw string as url
    }
  }

  return [normalized];
};

export const EventFlyerGeneratorModal: React.FC<Props> = ({ isOpen, event, onClose, onSaved }) => {
  const [form, setForm] = useState<FlyerFormState>({
    title: '',
    subtitle: '',
    dateText: '',
    timeText: '',
    venueText: '',
    organizerText: '',
    stallsText: '',
    sponsorText: '',
    ctaText: 'Book your stall now',
  });
  const [loadingSponsors, setLoadingSponsors] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [generatedSrc, setGeneratedSrc] = useState('');

  const eventId = event?.id || null;

  useEffect(() => {
    if (!isOpen || !event) return;
    setGeneratedSrc('');
    setErrorMsg('');
    setSaveMsg('');
    setForm({
      title: event.title || '',
      subtitle: event.description?.trim() || 'Join us for a colorful event experience',
      dateText: event.date || '',
      timeText: event.time || '',
      venueText: [event.venue, event.city].filter(Boolean).join(', '),
      organizerText: '',
      stallsText: getStallSummary(event),
      sponsorText: '',
      ctaText: 'Book your stall now',
    });
  }, [isOpen, event]);

  useEffect(() => {
    if (!isOpen || !event?.organizationId) return;
    let cancelled = false;
    apiClient
      .from('organizations')
      .select('name')
      .eq('id', event.organizationId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const name = data?.name?.trim();
        setForm((prev) => ({
          ...prev,
          organizerText: name ? `Organized by: ${name}` : 'Organized by: TBA',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, event?.organizationId]);

  useEffect(() => {
    if (!isOpen || !eventId) return;
    let cancelled = false;
    setLoadingSponsors(true);
    apiClient
      .from('event_sponsors')
      .select('role, sponsor_id')
      .eq('event_id', eventId)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingSponsors(false);
        if (error) return;
        const sponsorLines = (data || [])
          .map((row: any) => {
            const companyName =
              row?.sponsor?.company_name ||
              row?.sponsors?.company_name ||
              row?.sponsor?.companyName ||
              null;
            if (!companyName) return null;
            const roleLabel = formatSponsorRole(row?.role);
            return `${roleLabel}: ${companyName}`;
          })
          .filter((v: string | null) => Boolean(v));
        const sponsorText =
          sponsorLines.length > 0
            ? `Sponsors: ${sponsorLines.join(' | ')}`
            : (data || []).length > 0
              ? `Sponsors: ${(data || []).length} assigned`
              : 'Sponsors: TBA';
        setForm((prev) => ({ ...prev, sponsorText }));
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, eventId]);

  const canGenerate = useMemo(() => {
    return Boolean(form.title.trim() && form.dateText.trim() && form.venueText.trim());
  }, [form]);

  const handleGenerate = async () => {
    if (!event) return;
    setIsGenerating(true);
    setErrorMsg('');
    setGeneratedSrc('');
    try {
      await new Promise((r) => setTimeout(r, 50));
      const dataUrl = generateEventFlyerImage({
        title: form.title.trim(),
        subtitle: form.subtitle.trim(),
        date: form.dateText.trim(),
        time: form.timeText.trim(),
        venue: form.venueText.trim(),
        organizer: form.organizerText.trim(),
        stalls: form.stallsText.trim(),
        sponsors: form.sponsorText.trim(),
        cta: form.ctaText.trim(),
      });
      setGeneratedSrc(dataUrl);
    } catch (err: any) {
      console.error('generate-event-flyer error:', err);
      setErrorMsg(err?.message || 'Could not generate flyer.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedSrc || !event) return;
    const a = document.createElement('a');
    a.href = generatedSrc;
    a.download = `${event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-flyer.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSaveToEvent = async () => {
    if (!event || !generatedSrc) return;

    setIsSaving(true);
    setErrorMsg('');
    setSaveMsg('');

    try {
      const response = await fetch(generatedSrc);
      if (!response.ok) {
        throw new Error('Could not fetch generated flyer for upload.');
      }
      const blob = await response.blob();
      const extension =
        blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
      const safeTitle = (event.title || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const filePath = `flyers/${event.id}/ai-flyer-${safeTitle}-${Date.now()}.${extension}`;
      const { data: uploadData, error: uploadError } = await apiClient.storage.from('event-images').upload(filePath, blob, {
        contentType: blob.type || 'image/png',
        upsert: false,
      });

      if (uploadError) {
        throw new Error(uploadError.message || 'Failed to upload flyer image.');
      }

      const publicUrl =
        uploadData?.path ??
        apiClient.storage.from('event-images').getPublicUrl(filePath).data.publicUrl;
      if (!publicUrl) {
        throw new Error('Could not generate public URL for uploaded flyer.');
      }

      const existing = parseEventImages(event.eventImageUrl);
      const updatedImages = [publicUrl, ...existing.filter((url) => url !== publicUrl)];
      const { error: updateError } = await apiClient
        .from('events')
        .update({ event_image_url: JSON.stringify(updatedImages) })
        .eq('id', event.id);

      if (updateError) {
        throw new Error(updateError.message || 'Failed to update event image URL.');
      }

      setSaveMsg('Flyer saved to event images.');
      if (onSaved) {
        await onSaved(updatedImages);
      }
    } catch (error: any) {
      setErrorMsg(error?.message || 'Could not save flyer to event.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !event) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[92vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Generate Flyer</h3>
            <p className="text-xs text-gray-500">Instagram Post (1024x1024)</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-600">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Subtitle</label>
              <textarea
                value={form.subtitle}
                onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg min-h-20"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">Date</label>
                <input
                  value={form.dateText}
                  onChange={(e) => setForm((p) => ({ ...p, dateText: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Time</label>
                <input
                  value={form.timeText}
                  onChange={(e) => setForm((p) => ({ ...p, timeText: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600">Venue / Place</label>
              <input
                value={form.venueText}
                onChange={(e) => setForm((p) => ({ ...p, venueText: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Organizer</label>
              <input
                value={form.organizerText}
                onChange={(e) => setForm((p) => ({ ...p, organizerText: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Stalls & Price Summary</label>
              <input
                value={form.stallsText}
                onChange={(e) => setForm((p) => ({ ...p, stallsText: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Sponsors</label>
              <input
                value={form.sponsorText}
                onChange={(e) => setForm((p) => ({ ...p, sponsorText: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg"
              />
              {loadingSponsors && <p className="text-xs text-gray-500 mt-1">Loading sponsors...</p>}
            </div>
            <div>
              <label className="text-xs text-gray-600">CTA</label>
              <input
                value={form.ctaText}
                onChange={(e) => setForm((p) => ({ ...p, ctaText: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
            {saveMsg && <p className="text-sm text-green-600">{saveMsg}</p>}
            <div className="flex items-center gap-2">
              <Button type="button" onClick={handleGenerate} disabled={!canGenerate || isGenerating}>
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Flyer
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveToEvent}
                disabled={!generatedSrc || isSaving || isGenerating}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-4 w-4 mr-2" />
                    Use as Event Image
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>

          <div className="border rounded-lg p-3 bg-gray-50 min-h-[420px] flex flex-col">
            <div className="text-sm font-medium text-gray-800 mb-2">Preview</div>
            <div className="flex-1 border rounded bg-white flex items-center justify-center overflow-hidden">
              {generatedSrc ? (
                <img src={generatedSrc} alt="Generated flyer" className="w-full h-full object-contain" />
              ) : (
                <div className="text-sm text-gray-500 text-center px-4">
                  Generate to preview your flyer here.
                </div>
              )}
            </div>
            <div className="pt-3 flex justify-end">
              <Button type="button" variant="outline" disabled={!generatedSrc} onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download PNG
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
