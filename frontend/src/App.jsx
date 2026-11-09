import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import Chooser from './pages/Chooser';
import { Login, Signup, ForgotPassword, ResetPassword, AcceptInvite } from './pages/Auth';
import AmIAffected from './pages/AmIAffected';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Returns = lazy(() => import('./pages/Returns'));
const ReturnDetail = lazy(() => import('./pages/ReturnDetail'));
const EInvoices = lazy(() => import('./pages/EInvoices'));
const EInvoiceEditor = lazy(() => import('./pages/EInvoiceEditor'));
const EInvoiceDetail = lazy(() => import('./pages/EInvoiceDetail'));
const Parties = lazy(() => import('./pages/Parties'));
const Wht = lazy(() => import('./pages/Wht'));
const Cit = lazy(() => import('./pages/Cit'));
const Excise = lazy(() => import('./pages/Excise'));
const Pit = lazy(() => import('./pages/Pit'));
const Documents = lazy(() => import('./pages/Documents'));
const Letters = lazy(() => import('./pages/Letters'));
const Assistant = lazy(() => import('./pages/Assistant'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Team = lazy(() => import('./pages/Team'));
const Settings = lazy(() => import('./pages/Settings'));
const Clients = lazy(() => import('./pages/Clients'));
const Admin = lazy(() => import('./pages/Admin'));

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return children;
}

/** Org-scoped pages need an organisation; new users are sent to onboarding first. */
function RequireOrg({ children }) {
  const { org, user } = useAuth();
  if (!org && !user?.memberships?.length) return <Navigate to="/app/onboarding" replace />;
  if (!org) return <Loading />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  const O = (el) => <RequireOrg>{el}</RequireOrg>;
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Chooser />} />
        <Route path="/login" element={user ? <Navigate to="/app" replace /> : <Login />} />
        <Route path="/signup" element={user ? <Navigate to="/app" replace /> : <Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/am-i-affected" element={<AmIAffected />} />
        <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={O(<Dashboard />)} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="calendar" element={O(<Calendar />)} />
          <Route path="transactions" element={O(<Transactions />)} />
          <Route path="returns" element={O(<Returns />)} />
          <Route path="returns/:id" element={O(<ReturnDetail />)} />
          <Route path="einvoices" element={O(<EInvoices />)} />
          <Route path="einvoices/new" element={O(<EInvoiceEditor />)} />
          <Route path="einvoices/:id/edit" element={O(<EInvoiceEditor />)} />
          <Route path="einvoices/:id" element={O(<EInvoiceDetail />)} />
          <Route path="parties" element={O(<Parties />)} />
          <Route path="wht" element={O(<Wht />)} />
          <Route path="cit" element={O(<Cit />)} />
          <Route path="excise" element={O(<Excise />)} />
          <Route path="pit" element={<Pit />} />
          <Route path="documents" element={O(<Documents />)} />
          <Route path="letters" element={O(<Letters />)} />
          <Route path="assistant" element={<Assistant />} />
          <Route path="audit" element={O(<AuditLog />)} />
          <Route path="team" element={O(<Team />)} />
          <Route path="settings" element={<Settings />} />
          <Route path="clients" element={<Clients />} />
          <Route path="admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
