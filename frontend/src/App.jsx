import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AcceptInvite from './pages/AcceptInvite';
import Home from './pages/Home';
import Analytics from './pages/Analytics';
import S1Dashboard from './pages/S1Dashboard';
import E1Dashboard from './pages/E1Dashboard';
import S1Upload from './pages/S1Upload';
import E1Upload from './pages/E1Upload';
import IsoBridge from './pages/IsoBridge';
import PrepareGuide from './pages/PrepareGuide';
import G1BoardDashboard from './pages/G1BoardDashboard';
import G1EthicsDashboard from './pages/G1EthicsDashboard';
import G1Upload from './pages/G1Upload';
import Reports from './pages/Reports';
import HistoryPage from './pages/HistoryPage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import Connections from './pages/Connections';
import SBTiTargets from './pages/SBTiTargets';
import LineagePage from './pages/LineagePage';
import ActivityLogPage from './pages/ActivityLogPage';
import ROIDashboard from './pages/ROIDashboard';
import ProductList from './pages/pcf/ProductList';
import ProductDetail from './pages/pcf/ProductDetail';
import SuppliersPage from './pages/SuppliersPage';
import ComingSoon from './pages/ComingSoon';
import IsoGriBridge from './pages/IsoGriBridge';
import ReadinessAssessment from './pages/ReadinessAssessment';
import E3Dashboard from './pages/E3Dashboard';
import E4Dashboard from './pages/E4Dashboard';
import BuildingEnergy from './pages/BuildingEnergy';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      {/* Public self-signup is disabled — licenses are issued via sales.
          Direct /signup hits land on the login page, which links to the
          contact form. */}
      <Route path="/signup" element={<Navigate to="/login" replace />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/readiness" element={<ReadinessAssessment />} />
      <Route path="/readiness/:token" element={<ReadinessAssessment />} />

      {/* Protected routes */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Home />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/dashboard/S/social-1" element={<S1Dashboard />} />
        <Route path="/dashboard/E/environmental-1" element={<E1Dashboard />} />
        <Route path="/platform/S/social-1" element={<S1Upload />} />
        <Route path="/platform/E/environmental-1" element={<E1Upload />} />
        <Route path="/iso-bridge" element={<IsoBridge />} />
        <Route path="/prepare" element={<PrepareGuide />} />
        <Route path="/dashboard/G/governance-1" element={<G1BoardDashboard />} />
        <Route path="/dashboard/G/governance-2" element={<G1EthicsDashboard />} />
        <Route path="/platform/G/governance-1" element={<G1Upload />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/sbti-targets" element={<SBTiTargets />} />
        <Route path="/lineage" element={<LineagePage />} />
        <Route path="/activity-log" element={<ActivityLogPage />} />
        <Route path="/roi" element={<ROIDashboard />} />
        <Route path="/pcf" element={<ProductList />} />
        <Route path="/pcf/:id" element={<ProductDetail />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/iso-gri" element={<IsoGriBridge />} />
        <Route path="/dashboard/E/environmental-3" element={<E3Dashboard />} />
        <Route path="/dashboard/E/environmental-4" element={<E4Dashboard />} />
        <Route path="/buildings" element={<BuildingEnergy />} />
        <Route path="/buildings/:id" element={<BuildingEnergy />} />
        <Route path="/coming-soon" element={<ComingSoon />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
