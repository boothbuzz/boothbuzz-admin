import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Users, 
  Filter,
  Search,
  Eye,
  Edit,
  Trash2,
  Download,
  X,
  Save
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '../components/UI/Card';
import { Badge } from '../components/UI/Badge';
import { Button } from '../components/UI/Button';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday } from 'date-fns';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { csvFilename, downloadCsv } from '../lib/exportCsv';
import { toDateInputValue } from '../hooks/useSupabaseData';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  status: string;
  attendees: number;
  color: string;
  description?: string;
  event_type?: string;
}

const EMPTY_EVENT_FORM = {
  title: '',
  date: '',
  time: '',
  venue: '',
  status: 'draft',
  attendees: 0,
  description: '',
  event_type: 'exhibition',
};

/** Normalize API time values to HH:mm for <input type="time">. */
function toTimeInputValue(value: unknown): string {
  if (value == null || value === '') return '';
  const s = String(value).trim();
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) {
    return `${m24[1].padStart(2, '0')}:${m24[2]}`;
  }
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = m12[2];
    const ap = m12[3].toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  return '';
}

function normalizeCalendarStatus(status: unknown): string {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === 'upcoming') return 'published';
  const allowed = ['draft', 'published', 'ongoing', 'completed', 'cancelled'];
  return allowed.includes(s) ? s : 'draft';
}

function mapDbRowToCalendarEvent(row: any, fallback?: Partial<CalendarEvent>): CalendarEvent {
  const status = normalizeCalendarStatus(row?.status ?? fallback?.status);
  return {
    id: String(row?.id ?? fallback?.id ?? ''),
    title: row?.title ?? fallback?.title ?? 'Untitled Event',
    date: toDateInputValue(row?.event_date ?? row?.date ?? fallback?.date),
    time: toTimeInputValue(row?.event_time ?? row?.time ?? fallback?.time),
    venue: row?.venue_name ?? row?.venue ?? fallback?.venue ?? 'TBD',
    status,
    attendees: Number(row?.attendees ?? fallback?.attendees ?? 0) || 0,
    color: getEventColorByStatus(status),
    description: row?.description ?? fallback?.description ?? '',
    event_type: fallback?.event_type || 'exhibition',
  };
}

function getEventColorByStatus(status: string): string {
  switch (status) {
    case 'published':
    case 'upcoming':
      return 'bg-green-500';
    case 'ongoing':
      return 'bg-blue-500';
    case 'completed':
      return 'bg-gray-500';
    case 'cancelled':
      return 'bg-red-500';
    default:
      return 'bg-yellow-500';
  }
}

// Add this new component for hover tooltip
const EventTooltip: React.FC<{
  event: CalendarEvent;
  isVisible: boolean;
  position: { x: number; y: number };
}> = ({ event, isVisible, position }) => {
  if (!isVisible) return null;

  return (
    <div 
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-xs"
      style={{
        left: position.x + 10,
        top: position.y - 10,
        transform: 'translateY(-100%)'
      }}
    >
      <div className="space-y-2">
        <h4 className="font-semibold text-gray-900 text-sm">{event.title}</h4>
        <div className="space-y-1 text-xs text-gray-600">
          <div className="flex items-center">
            <CalendarIcon className="h-3 w-3 mr-2" />
            <span>{format(new Date(event.date), 'MMM d, yyyy')}</span>
          </div>
          {event.time && (
            <div className="flex items-center">
              <Clock className="h-3 w-3 mr-2" />
              <span>{event.time}</span>
            </div>
          )}
          <div className="flex items-center">
            <MapPin className="h-3 w-3 mr-2" />
            <span className="truncate">{event.venue}</span>
          </div>
          {event.description && (
            <div className="pt-1 border-t border-gray-100">
              <p className="text-xs text-gray-500 line-clamp-2">{event.description}</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <Badge variant={event.status === 'published' || event.status === 'upcoming' ? 'success' : 'info'} className="text-xs">
            {event.status}
          </Badge>
          <span className="text-xs text-gray-500">{event.attendees} attendees</span>
        </div>
      </div>
    </div>
  );
};

// Event Modal Component
const EventModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  event?: CalendarEvent | null;
  onSave: (event: Omit<CalendarEvent, 'id' | 'color'>) => void;
  mode: 'create' | 'edit';
}> = ({ isOpen, onClose, event, onSave, mode }) => {
  const [formData, setFormData] = useState({ ...EMPTY_EVENT_FORM });
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  // EventModal stays mounted; re-hydrate whenever it opens or the event changes.
  useEffect(() => {
    if (!isOpen) return;

    if (mode === 'edit' && event) {
      setFormData({
        title: event.title || '',
        date: toDateInputValue(event.date),
        time: toTimeInputValue(event.time),
        venue: event.venue || '',
        status: normalizeCalendarStatus(event.status),
        attendees: event.attendees || 0,
        description: event.description || '',
        event_type: event.event_type || 'exhibition',
      });
    } else {
      setFormData({ ...EMPTY_EVENT_FORM });
    }
    setErrors({});
  }, [isOpen, mode, event]);

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    
    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.date) newErrors.date = 'Date is required';
    if (!formData.venue.trim()) newErrors.venue = 'Venue is required';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSave(formData);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {mode === 'create' ? 'Create New Event' : 'Edit Event'}
              </h2>
              <p className="text-gray-600">Event details</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Event Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.title ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Enter event title"
              />
              {errors.title && <div className="text-red-500 text-xs mt-1">{errors.title}</div>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Event Type
              </label>
              <select
                value={formData.event_type}
                onChange={(e) => setFormData({...formData, event_type: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="exhibition">Exhibition</option>
                <option value="meeting">Meeting</option>
                <option value="workshop">Workshop</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date *
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.date ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.date && <div className="text-red-500 text-xs mt-1">{errors.date}</div>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time
              </label>
              <input
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({...formData, time: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Venue *
              </label>
              <input
                type="text"
                value={formData.venue}
                onChange={(e) => setFormData({...formData, venue: e.target.value})}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.venue ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Enter venue"
              />
              {errors.venue && <div className="text-red-500 text-xs mt-1">{errors.venue}</div>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expected Attendees
              </label>
              <input
                type="number"
                value={formData.attendees}
                onChange={(e) => setFormData({...formData, attendees: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter event description"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex items-center justify-center space-x-2">
              <Save className="h-4 w-4" />
              <span>{mode === 'create' ? 'Create Event' : 'Update Event'}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const Calendar: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventModal, setEventModal] = useState<{
    isOpen: boolean;
    event: CalendarEvent | null;
    mode: 'create' | 'edit';
  }>({ isOpen: false, event: null, mode: 'create' });
  const { user, isSuperAdmin } = useAuth();
  const [hoveredEvent, setHoveredEvent] = useState<CalendarEvent | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Enhanced fetchEvents function to better handle events data
  const fetchEvents = async () => {
    try {
      setLoading(true);
      console.log('Fetching events from Supabase...');
      
      // Now fetch with the correct column names based on the actual table structure
      // Super Admin sees all events; other users see only their organization's events
      let query = apiClient
        .from('events')
        .select(`
          id,
          title,
          event_date,
          event_time,
          venue_name,
          status,
          attendees,
          description,
          created_at,
          updated_at
        `)
        .order('event_date', { ascending: true });

      if (!isSuperAdmin && user?.organizationId) {
        query = query.eq('organization_id', user.organizationId);
      }

      const { data, error } = await query;

      console.log('Supabase response:', { data, error });

      if (error) {
        console.error('Error fetching events:', error);
        return;
      }

      console.log('Raw events data:', data);

      const calendarEvents: CalendarEvent[] = (data || []).map((event) => {
        const mapped = mapDbRowToCalendarEvent(event);
        // If date is still empty, try created_at as fallback
        if (!mapped.date && event.created_at) {
          mapped.date = toDateInputValue(event.created_at);
        }
        if (!mapped.date) {
          console.warn('No valid date found for event:', event);
          mapped.date = toDateInputValue(new Date().toISOString());
        }

        console.log('Processing event:', {
          originalEvent: event,
          eventDate: mapped.date,
          eventTitle: mapped.title,
          parsedDate: new Date(mapped.date),
        });

        return mapped;
      });

      console.log('Processed calendar events:', calendarEvents);
      setEvents(calendarEvents);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  // Create new event
  const handleCreateEvent = async (eventData: Omit<CalendarEvent, 'id' | 'color'>) => {
    try {
      const payload = {
        title: eventData.title,
        event_date: eventData.date,
        event_time: eventData.time || null,
        venue_name: eventData.venue,
        status: normalizeCalendarStatus(eventData.status),
        attendees: eventData.attendees || 0,
        description: eventData.description || '',
        created_by: user?.id || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await apiClient
        .from('events')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error('Error creating event:', error);
        return;
      }

      // Add to local state
      const newEvent = mapDbRowToCalendarEvent(data, eventData);
      setEvents(prev => [...prev, newEvent]);
      setEventModal({ isOpen: false, event: null, mode: 'create' });
    } catch (error) {
      console.error('Error creating event:', error);
    }
  };

  // Update event
  const handleUpdateEvent = async (eventData: Omit<CalendarEvent, 'id' | 'color'>) => {
    if (!eventModal.event) return;

    try {
      const payload = {
        title: eventData.title,
        event_date: eventData.date,
        event_time: eventData.time || null,
        venue_name: eventData.venue,
        status: normalizeCalendarStatus(eventData.status),
        attendees: eventData.attendees || 0,
        description: eventData.description || '',
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await apiClient
        .from('events')
        .update(payload)
        .eq('id', eventModal.event.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating event:', error);
        return;
      }

      // Update local state
      const updatedEvent = mapDbRowToCalendarEvent(data, {
        ...eventData,
        id: eventModal.event.id,
      });
      setEvents(prev => prev.map(event => event.id === updatedEvent.id ? updatedEvent : event));
      setSelectedEvent(updatedEvent);
      setEventModal({ isOpen: false, event: null, mode: 'create' });
    } catch (error) {
      console.error('Error updating event:', error);
    }
  };

  // Delete event
  const handleDeleteEvent = async (eventId: string) => {
    try {
      const { error } = await apiClient
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) {
        console.error('Error deleting event:', error);
        return;
      }

      setEvents(prev => prev.filter(event => event.id !== eventId));
      setShowEventModal(false);
      setSelectedEvent(null);
    } catch (error) {
      console.error('Error deleting event:', error);
    }
  };

  // Handle event hover
  const handleEventHover = (event: CalendarEvent, e: React.MouseEvent) => {
    setHoveredEvent(event);
    setTooltipPosition({ x: e.clientX, y: e.clientY });
  };

  const handleEventLeave = () => {
    setHoveredEvent(null);
  };

  useEffect(() => {
    fetchEvents();
  }, [user?.organizationId, isSuperAdmin]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  
  // Calculate the start of the calendar grid (including previous month's days)
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(calendarStart.getDate() - monthStart.getDay()); // Start from Sunday of the week containing month start
  
  // Calculate the end of the calendar grid (including next month's days)
  const calendarEnd = new Date(monthEnd);
  const daysToAdd = 6 - monthEnd.getDay(); // Fill to Saturday
  calendarEnd.setDate(calendarEnd.getDate() + daysToAdd);
  
    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  // Debug: Log calendar dates
  console.log('Calendar Debug:', {
    currentDate: currentDate.toISOString(),
    monthStart: monthStart.toISOString(),
    monthEnd: monthEnd.toISOString(),
    calendarStart: calendarStart.toISOString(),
    calendarEnd: calendarEnd.toISOString(),
    calendarDaysCount: calendarDays.length,
    firstDayOfMonth: monthStart.getDay(), // 0 = Sunday, 1 = Monday, etc.
    lastDayOfMonth: monthEnd.getDay()
  });

  const getEventsForDate = (date: Date) => {
    const eventsForDate = events.filter(event => {
      // Handle different date formats and ensure proper comparison
      let eventDate: Date;
      
      try {
        // Try to parse the event date
        if (typeof event.date === 'string') {
          eventDate = new Date(event.date);
        } else {
          console.log('Invalid date format for event:', event);
          return false;
        }
        
        // Check if the date is valid
        if (isNaN(eventDate.getTime())) {
          console.log('Invalid date for event:', event);
          return false;
        }
        
        const isSame = isSameDay(eventDate, date);
        console.log(`Checking event: ${event.title}, event date: ${eventDate.toISOString()}, calendar date: ${date.toISOString()}, isSame: ${isSame}`);
        return isSame;
      } catch (error) {
        console.error('Error processing event date:', event, error);
        return false;
      }
    });
    
    console.log(`Events for ${date.toDateString()}:`, eventsForDate);
    return eventsForDate;
  };

  const handlePrevMonth = () => {
    setCurrentDate(subMonths(currentDate, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    const events = getEventsForDate(date);
    if (events.length === 1) {
      setSelectedEvent(events[0]);
      setShowEventModal(true);
    }
  };

  const upcomingEvents = events
    .filter(event => new Date(event.date) >= new Date())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  const handleExport = () => {
    downloadCsv(
      csvFilename('event-calendar-export'),
      ['Title', 'Date', 'Time', 'Venue', 'Status', 'Attendees', 'Description'],
      events.map((event) => [
        event.title,
        event.date,
        event.time,
        event.venue,
        event.status,
        event.attendees,
        event.description || '',
      ]),
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-8 bg-gray-200 rounded w-48 animate-pulse"></div>
          <div className="h-10 bg-gray-200 rounded w-32 animate-pulse"></div>
        </div>
        <div className="grid grid-cols-7 gap-4">
          {Array.from({ length: 42 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Event Calendar</h1>
          <p className="text-gray-600">Manage and view all scheduled events</p>
        </div>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
          <Button
            variant="outline"
            className="flex items-center space-x-2 w-full sm:w-auto justify-center"
            onClick={handleExport}
            disabled={events.length === 0}
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </Button>
        </div>
      </div>

      {/* Calendar Controls */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 min-w-[150px] sm:min-w-[200px] text-center">
              {format(currentDate, 'MMMM yyyy')}
            </h2>
            <div className="text-sm text-gray-600 text-center">
              Today: {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </div>
            <Button variant="outline" size="sm" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {['month', 'week', 'day'].map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode as any)}
                className={`px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium rounded-md capitalize transition-colors duration-200 ${
                  viewMode === mode
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-4 sm:p-6">
              {/* Calendar Header */}
              <div className="grid grid-cols-7 gap-1 mb-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="p-2 text-center text-xs sm:text-sm font-medium text-gray-500">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Body */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((date) => {
                  const events = getEventsForDate(date);
                  const isSelected = selectedDate && isSameDay(date, selectedDate);
                  const isCurrentMonth = isSameMonth(date, currentDate);
                  
                  return (
                    <div
                      key={date.toISOString()}
                      onClick={() => handleDateClick(date)}
                      className={`min-h-[80px] sm:min-h-[100px] p-1 sm:p-2 border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors duration-200 ${
                        !isCurrentMonth ? 'bg-gray-50 text-gray-400' : ''
                      } ${isSelected ? 'bg-blue-50 border-blue-300' : ''} ${
                        isToday(date) ? 'bg-blue-100 border-blue-400' : ''
                      }`}
                    >
                      <div className={`text-xs sm:text-sm font-medium mb-1 ${
                        isToday(date) ? 'text-blue-600' : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                      }`}>
                        <div className="text-xs text-gray-500 mb-1">
                          {format(date, 'EEE')}
                        </div>
                        {format(date, 'd')}
                      </div>
                      <div className="space-y-1">
                        {events.slice(0, 3).map((event) => (
                          <div
                            key={event.id}
                            className={`text-xs p-1 rounded text-white truncate ${event.color} cursor-pointer hover:opacity-80 transition-opacity`}
                            title={event.title}
                            onMouseEnter={(e) => handleEventHover(event, e)}
                            onMouseLeave={handleEventLeave}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(event);
                              setShowEventModal(true);
                            }}
                          >
                            <span className="hidden sm:inline">{event.title}</span>
                            <span className="sm:hidden">•</span>
                          </div>
                        ))}
                        {events.length > 3 && (
                          <div className="text-xs text-gray-500">
                            +{events.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Upcoming Events */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900">Upcoming Events</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              {upcomingEvents.map((event) => (
                <div 
                  key={event.id} 
                  className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200 cursor-pointer"
                  onMouseEnter={(e) => handleEventHover(event, e)}
                  onMouseLeave={handleEventLeave}
                  onClick={() => {
                    setSelectedEvent(event);
                    setShowEventModal(true);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 text-sm truncate">{event.title}</h4>
                      <div className="flex items-center text-xs text-gray-600 mt-1">
                        <CalendarIcon className="h-3 w-3 mr-1 flex-shrink-0" />
                        <span>{format(new Date(event.date), 'MMM d')}</span>
                      </div>
                      {event.time && (
                        <div className="flex items-center text-xs text-gray-600 mt-1">
                          <Clock className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span>{event.time}</span>
                        </div>
                      )}
                      <div className="flex items-center text-xs text-gray-600 mt-1">
                        <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                        <span className="truncate">{event.venue}</span>
                      </div>
                    </div>
                    <div className={`w-3 h-3 rounded-full ${event.color} flex-shrink-0`}></div>
                  </div>
                </div>
              ))}
              {upcomingEvents.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-500">No upcoming events</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Event Legend */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900">Event Status</h3>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { status: 'upcoming', color: 'bg-green-500', label: 'Upcoming' },
                { status: 'ongoing', color: 'bg-blue-500', label: 'Ongoing' },
                { status: 'draft', color: 'bg-yellow-500', label: 'Draft' },
                { status: 'completed', color: 'bg-gray-500', label: 'Completed' },
                { status: 'cancelled', color: 'bg-red-500', label: 'Cancelled' }
              ].map((item) => (
                <div key={item.status} className="flex items-center space-x-3">
                  <div className={`w-4 h-4 rounded ${item.color}`}></div>
                  <span className="text-sm text-gray-700">{item.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900">This Month</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Events</span>
                <span className="font-semibold text-gray-900">{events.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Upcoming</span>
                <span className="font-semibold text-green-600">
                  {events.filter(e => e.status === 'upcoming').length}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Ongoing</span>
                <span className="font-semibold text-blue-600">
                  {events.filter(e => e.status === 'ongoing').length}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Attendees</span>
                <span className="font-semibold text-gray-900">
                  {events.reduce((sum, e) => sum + e.attendees, 0)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Event Tooltip */}
      <EventTooltip
        event={hoveredEvent!}
        isVisible={!!hoveredEvent}
        position={tooltipPosition}
      />

      {/* Event Detail Modal */}
      {showEventModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">{selectedEvent.title}</h2>
                <button
                  onClick={() => setShowEventModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Date</label>
                  <p className="text-gray-900">{format(new Date(selectedEvent.date), 'MMMM d, yyyy')}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Time</label>
                  <p className="text-gray-900">{selectedEvent.time}</p>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">Venue</label>
                <p className="text-gray-900">{selectedEvent.venue}</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Status</label>
                  <div className="mt-1">
                    <Badge variant={selectedEvent.status === 'published' || selectedEvent.status === 'upcoming' ? 'success' : 'info'}>
                      {selectedEvent.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Attendees</label>
                  <p className="text-gray-900">{selectedEvent.attendees}</p>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-6 border-t border-gray-200">
                <Button 
                  variant="outline" 
                  className="w-full sm:w-auto flex items-center space-x-2"
                  onClick={() => {
                    setEventModal({ isOpen: true, event: selectedEvent, mode: 'edit' });
                    setShowEventModal(false);
                  }}
                >
                  <Edit className="h-4 w-4" />
                  <span>Edit Event</span>
                </Button>
                <Button 
                  className="w-full sm:w-auto flex items-center space-x-2"
                  onClick={() => handleDeleteEvent(selectedEvent.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete Event</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Create/Edit Modal */}
      <EventModal
        isOpen={eventModal.isOpen}
        onClose={() => setEventModal({ isOpen: false, event: null, mode: 'create' })}
        event={eventModal.event}
        onSave={eventModal.mode === 'create' ? handleCreateEvent : handleUpdateEvent}
        mode={eventModal.mode}
      />
    </div>
  );
};