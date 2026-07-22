import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Calendar,
  Building2,
  Truck,
  UserCheck,
  BarChart3,
  Settings,
  CreditCard,
  Megaphone,
  LogOut,
  X,
  Building,
  MessageSquareQuote
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';
import logo from '../../assets/newlogo.png';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  roles: UserRole[];
}

interface SidebarProps {
  onClose?: () => void;
}

// All roles that can log in to the admin portal (sidebar "all" visibility)
const ALL_ROLES: UserRole[] = ['super_admin', 'admin', 'support_tech', 'sales_marketing', 'accounts', 'sales', 'marketing', 'city_head', 'logistics', 'accounting'];

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ALL_ROLES },
  { name: 'Organizations', href: '/organizations', icon: Building, roles: ['super_admin'] },
  { name: 'Users', href: '/users', icon: Users, roles: ['super_admin', 'admin'] },
  // Master data before Events (Venue → Vendor → Exhibitor → Event)
  { name: 'Venues', href: '/venues', icon: Building2, roles: ALL_ROLES },
  { name: 'Vendors', href: '/vendors', icon: Truck, roles: ALL_ROLES },
  { name: 'Exhibitors', href: '/exhibitors', icon: UserCheck, roles: ALL_ROLES },
  { name: 'Events', href: '/events', icon: Calendar, roles: ALL_ROLES },
  { name: 'Calendar', href: '/calendar', icon: Calendar, roles: ALL_ROLES },
  { name: 'Plans & Billing', href: '/billing', icon: CreditCard, roles: ['super_admin'] },
  { name: 'Ads & Sponsors', href: '/ads-sponsors', icon: Megaphone, roles: ALL_ROLES },
  { name: 'Reports', href: '/reports', icon: BarChart3, roles: ['super_admin', 'admin'] },
  { name: 'Testimonial', href: '/testimonials', icon: MessageSquareQuote, roles: ['super_admin'] },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['super_admin'] },
];

export const Sidebar: React.FC<SidebarProps> = ({ onClose }) => {
  const location = useLocation();
  const { user, logout, hasRole } = useAuth();

  const filteredNavigation = navigation.filter(item => hasRole(item.roles));

  const handleLinkClick = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900">
      <div className="flex h-16 items-center justify-between bg-gray-800 px-4">
      <img src={logo} alt="BoothBuzz" className="h-40 w-40 object-contain" />
        {/*<h1 className="text-lg sm:text-xl font-bold text-white">Booth Buzz</h1> */}
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="lg:hidden p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      
      <div className="flex flex-1 flex-col overflow-y-auto">
        <nav className="flex-1 space-y-1 px-2 py-4">
          {filteredNavigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={handleLinkClick}
                className={`${
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                } group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200`}
              >
                <item.icon
                  className={`${
                    isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'
                  } mr-3 h-5 w-5 transition-colors duration-200 flex-shrink-0`}
                />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </nav>
        
        <div className="border-t border-gray-700 p-4">
          <div className="flex items-center mb-4">
            <div className="flex-shrink-0">
              <div className="h-8 w-8 rounded-full bg-gray-600 flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {user?.name.charAt(0)}
                </span>
              </div>
            </div>
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 capitalize truncate">{user?.role.replace('_', ' ')}</p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              if (onClose) onClose();
            }}
            className="group flex w-full items-center px-2 py-2 text-sm font-medium text-gray-300 rounded-md hover:bg-gray-700 hover:text-white transition-colors duration-200"
          >
            <LogOut className="mr-3 h-5 w-5 text-gray-400 group-hover:text-white flex-shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
};