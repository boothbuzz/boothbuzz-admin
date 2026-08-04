import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

/** Vite `base` (e.g. `/admin/`) → React Router basename `/admin`; local `/` → no basename. */
const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined;
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout/Layout';
import { AutoLogoutWarning } from './components/AutoLogoutWarning';

import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { Dashboard } from './pages/Dashboard';
import { Organizations } from './pages/Organizations';
import { Users } from './pages/Users';
import { AddUser } from './pages/AddUser';
import { Events } from './pages/Events';
import { CreateEvent } from './pages/CreateEvent';
import { Venues } from './pages/Venues';
import { AddVenue } from './pages/AddVenue';
import { Vendors } from './pages/Vendors';
import { AddVendor } from './pages/AddVendor';
import { Exhibitors } from './pages/Exhibitors';
import { AddExhibitor } from './pages/AddExhibitor';
import { ProductsShowcase } from './pages/ProductsShowcase';
import { Calendar } from './pages/Calendar';
import { Billing } from './pages/Billing';
import { CreatePlan } from './pages/CreatePlan';
import { AdsSponsors } from './pages/AdsSponsors';
import { CreateCampaign } from './pages/CreateCampaign';
import { EditCampaign } from './pages/EditCampaign';
import { EditAdvertisement } from './pages/EditAdvertisement';
import { AddSponsor } from './pages/AddSponsor';
import { EditSponsor } from './pages/EditSponsor';
import { Settings } from './pages/Settings';
import { Reports } from './pages/Reports';
import { Testimonials } from './pages/Testimonials';
import { BRDDownload } from './pages/BRDDownload';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, mustChangePassword } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  return <Layout>{children}</Layout>;
};

const SuperAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isSuperAdmin } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Layout>{children}</Layout>;
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/change-password" element={<ChangePassword />} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="/organizations" element={
        <ProtectedRoute>
          <Organizations />
        </ProtectedRoute>
      } />
      <Route path="/users" element={
        <ProtectedRoute>
          <Users />
        </ProtectedRoute>
      } />
      <Route path="/users/add" element={
        <ProtectedRoute>
          <AddUser />
        </ProtectedRoute>
      } />
      <Route path="/events" element={
        <ProtectedRoute>
          <Events />
        </ProtectedRoute>
      } />
      <Route path="/events/create" element={
        <ProtectedRoute>
          <CreateEvent />
        </ProtectedRoute>
      } />
      <Route path="/venues" element={
        <ProtectedRoute>
          <Venues />
        </ProtectedRoute>
      } />
      <Route path="/venues/add" element={
        <ProtectedRoute>
          <AddVenue />
        </ProtectedRoute>
      } />
      <Route path="/vendors" element={
        <ProtectedRoute>
          <Vendors />
        </ProtectedRoute>
      } />
      <Route path="/vendors/add" element={
        <ProtectedRoute>
          <AddVendor />
        </ProtectedRoute>
      } />
      <Route path="/exhibitors" element={
        <ProtectedRoute>
          <Exhibitors />
        </ProtectedRoute>
      } />
      <Route path="/exhibitors/add" element={
        <ProtectedRoute>
          <AddExhibitor />
        </ProtectedRoute>
      } />
      <Route path="/exhibitors/products" element={
        <ProtectedRoute>
          <ProductsShowcase />
        </ProtectedRoute>
      } />
      <Route path="/calendar" element={
        <ProtectedRoute>
          <Calendar />
        </ProtectedRoute>
      } />
      <Route path="/billing" element={
        <SuperAdminRoute>
          <Billing />
        </SuperAdminRoute>
      } />
      <Route path="/billing/plans/create" element={
        <SuperAdminRoute>
          <CreatePlan />
        </SuperAdminRoute>
      } />
      <Route path="/ads-sponsors" element={
        <ProtectedRoute>
          <AdsSponsors />
        </ProtectedRoute>
      } />
      <Route path="/ads-sponsors/campaigns/create" element={
        <ProtectedRoute>
          <CreateCampaign />
        </ProtectedRoute>
      } />
      <Route path="/ads-sponsors/campaigns/:id/edit" element={
        <ProtectedRoute>
          <EditCampaign />
        </ProtectedRoute>
      } />
      <Route path="/ads-sponsors/ads/:id/edit" element={
        <ProtectedRoute>
          <EditAdvertisement />
        </ProtectedRoute>
      } />
      <Route path="/ads-sponsors/sponsors/create" element={
        <ProtectedRoute>
          <AddSponsor />
        </ProtectedRoute>
      } />
      <Route path="/ads-sponsors/sponsors/:id/edit" element={
        <ProtectedRoute>
          <EditSponsor />
        </ProtectedRoute>
      } />
      <Route path="/reports" element={
        <ProtectedRoute>
          <Reports />
        </ProtectedRoute>
      } />
      <Route path="/testimonials" element={
        <ProtectedRoute>
          <Testimonials />
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      } />
      <Route path="/brd-download" element={
        <ProtectedRoute>
          <BRDDownload />
        </ProtectedRoute>
      } />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

function App() {
  const { isLoading } = useAuth();

  return (
    <Router basename={routerBasename}>
      <AutoLogoutWarning />
      {isLoading ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <AppRoutes />
      )}
    </Router>
  );
}
export default App;