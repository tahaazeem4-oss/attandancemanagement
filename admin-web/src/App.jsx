import React, { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { apiRequest, loginRequest } from './lib/api';
import eduTrackLogo from './assets/edutrak-icon.png';

const SESSION_KEY = 'attendance-admin-web.session';
const allowedRoles = new Set(['super_admin', 'org_admin', 'admin']);

const SessionContext = createContext(null);

const lazyPortalExport = (name) => lazy(() => import('./portalPages').then((module) => ({ default: module[name] })));

const PortalAiAnalyticsPage = lazyPortalExport('PortalAiAnalyticsPage');
const PortalAiMaterialsPage = lazyPortalExport('PortalAiMaterialsPage');
const PortalAiPolicyPage = lazyPortalExport('PortalAiPolicyPage');
const PortalAssignmentsPage = lazyPortalExport('PortalAssignmentsPage');
const PortalCampusesPage = lazyPortalExport('PortalCampusesPage');
const PortalClassesPage = lazyPortalExport('PortalClassesPage');
const PortalDashboardPage = lazyPortalExport('PortalDashboardPage');
const PortalEmptyPage = lazyPortalExport('PortalEmptyPage');
const PortalLeavesPage = lazyPortalExport('PortalLeavesPage');
const PortalNotificationsPage = lazyPortalExport('PortalNotificationsPage');
const PortalOrganizationsPage = lazyPortalExport('PortalOrganizationsPage');
const PortalOrgAdminsPage = lazyPortalExport('PortalOrgAdminsPage');
const PortalParentsPage = lazyPortalExport('PortalParentsPage');
const PortalStudentsPage = lazyPortalExport('PortalStudentsPage');
const PortalSubjectsPage = lazyPortalExport('PortalSubjectsPage');
const PortalTeacherAttendancePage = lazyPortalExport('PortalTeacherAttendancePage');
const PortalTeachersPage = lazyPortalExport('PortalTeachersPage');

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  org_admin: 'Organization Admin',
  admin: 'School Admin',
};

const NAVIGATION = {
  super_admin: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'ai-policy', label: 'AI Policy' },
    { key: 'ai-analytics', label: 'AI Analytics' },
    { key: 'organizations', label: 'Organizations' },
    { key: 'campuses', label: 'Campuses' },
    { key: 'teachers', label: 'Teachers' },
    { key: 'students', label: 'Students' },
    { key: 'classes', label: 'Classes' },
    { key: 'subjects', label: 'Subjects' },
    { key: 'parents', label: 'Parents' },
  ],
  org_admin: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'ai-policy', label: 'AI Policy' },
    { key: 'ai-analytics', label: 'AI Analytics' },
    { key: 'campuses', label: 'Campuses' },
    { key: 'admins', label: 'Campus Admins' },
    { key: 'teachers', label: 'Teachers' },
    { key: 'students', label: 'Students' },
    { key: 'classes', label: 'Classes' },
    { key: 'subjects', label: 'Subjects' },
    { key: 'parents', label: 'Parents' },
    { key: 'leaves', label: 'Leaves' },
    { key: 'notifications', label: 'Notifications' },
  ],
  admin: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'ai-materials', label: 'AI Materials' },
    { key: 'ai-policy', label: 'AI Policy' },
    { key: 'ai-analytics', label: 'AI Analytics' },
    { key: 'teachers', label: 'Teachers' },
    { key: 'classes', label: 'Classes' },
    { key: 'students', label: 'Students' },
    { key: 'subjects', label: 'Subjects' },
    { key: 'parents', label: 'Parents' },
    { key: 'leaves', label: 'Leaves' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'assignments', label: 'Assignments' },
    { key: 'attendance', label: 'Teacher Attendance' },
  ],
};

function BrandImage({ src, alt, className }) {
  return <img src={src} alt={alt} className={className} loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
}

function EdTrackHero() {
  return (
    <div className="logo-hero">
      <BrandImage src={eduTrackLogo} alt="EduTrack application logo" className="brand-image brand-image-hero" />
      <div className="logo-hero-copy">
        <div className="eyebrow">EduTrack</div>
        <h1>Admin Portal</h1>
      </div>
    </div>
  );
}

function loadSession() {
  const sessionStorageRef = (() => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  })();
  const localStorageRef = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();

  const normalizeSession = (value) => (
    value?.token && value?.user?.role && allowedRoles.has(value.user.role) ? value : null
  );

  try {
    const stored = normalizeSession(JSON.parse(sessionStorageRef?.getItem(SESSION_KEY) || 'null'));
    if (stored) return stored;

    const legacy = normalizeSession(JSON.parse(localStorageRef?.getItem(SESSION_KEY) || 'null'));
    if (legacy) {
      sessionStorageRef?.setItem(SESSION_KEY, JSON.stringify(legacy));
      localStorageRef?.removeItem(SESSION_KEY);
      return legacy;
    }

    localStorageRef?.removeItem(SESSION_KEY);
    sessionStorageRef?.removeItem(SESSION_KEY);
    return null;
  } catch {
    localStorageRef?.removeItem(SESSION_KEY);
    sessionStorageRef?.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession(session) {
  const sessionStorageRef = (() => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  })();
  const localStorageRef = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();

  if (!session) {
    sessionStorageRef?.removeItem(SESSION_KEY);
    localStorageRef?.removeItem(SESSION_KEY);
    return;
  }
  sessionStorageRef?.setItem(SESSION_KEY, JSON.stringify(session));
  localStorageRef?.removeItem(SESSION_KEY);
}

function normalizeIdentifier(value) {
  const trimmed = value.trim().replace(/[\s-]/g, '');
  if (/^(\+92|0092|92|0)[0-9]{9,10}$/.test(trimmed)) {
    if (trimmed.startsWith('+92')) return trimmed;
    if (trimmed.startsWith('0092')) return '+92' + trimmed.slice(4);
    if (trimmed.startsWith('92') && trimmed.length === 12) return '+' + trimmed;
    if (trimmed.startsWith('0')) return '+92' + trimmed.slice(1);
  }
  return trimmed.toLowerCase();
}

function useSession() {
  return useContext(SessionContext);
}

function useApi() {
  const { session, logout } = useSession();

  return useCallback(async (method, path, options = {}) => {
    try {
      return await apiRequest(method, path, { ...options, token: session?.token });
    } catch (error) {
      if (error.status === 401) {
        logout();
      }
      throw error;
    }
  }, [session?.token, logout]);
}

function useAsyncResource(loader, deps) {
  const [state, setState] = useState({ loading: true, error: '', data: null });

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const data = await loader();
      setState({ loading: false, error: '', data });
      return data;
    } catch (error) {
      setState({ loading: false, error: error.message || 'Failed to load data.', data: null });
      return null;
    }
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

function App() {
  const [session, setSession] = useState(loadSession);

  const login = useCallback(async (email, password) => {
    const data = await loginRequest(normalizeIdentifier(email), password);
    if (!allowedRoles.has(data?.user?.role)) {
      throw new Error('This web portal is only available to super admins, organization admins, and school admins.');
    }
    const nextSession = { token: data.token, user: data.user, school: data.school || null };
    setSession(nextSession);
    saveSession(nextSession);
    return nextSession;
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    saveSession(null);
  }, []);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);

  return (
    <SessionContext.Provider value={value}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app/:section?" element={<ProtectedApp />} />
        <Route path="*" element={<Navigate to={session ? '/app' : '/login'} replace />} />
      </Routes>
    </SessionContext.Provider>
  );
}

function LoginPage() {
  const { session, login } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (session) navigate('/app', { replace: true });
  }, [session, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-grid" />
      <div className="login-ornament login-ornament-a" />
      <div className="login-ornament login-ornament-b" />
      <section className="login-card">
        <EdTrackHero />
        <p className="login-copy">Sign in with your admin email or phone.</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>Email or Phone</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@school.com or 03XXXXXXXXX" autoComplete="username" />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" autoComplete="current-password" />
          </label>
          {error ? <div className="banner banner-danger">{error}</div> : null}
          <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>
      </section>
    </div>
  );
}

function ProtectedApp() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  const { section } = useParams();

  if (!session?.token || !session?.user?.role || !allowedRoles.has(session.user.role)) {
    return <Navigate to="/login" replace />;
  }

  const navItems = NAVIGATION[session.user.role] || [];
  const activeSection = section || navItems[0]?.key || 'dashboard';
  const sectionExists = navItems.some((item) => item.key === activeSection);

  useEffect(() => {
    if (!sectionExists && navItems[0]) {
      navigate(`/app/${navItems[0].key}`, { replace: true });
    }
  }, [sectionExists, navItems, navigate]);

  if (!sectionExists) return null;

  const useCampusLogo = session.user.role === 'admin' && !!session.school?.logo_url;
  const brandImageSrc = useCampusLogo ? session.school.logo_url : eduTrackLogo;
  const brandImageAlt = useCampusLogo ? `${session.school?.name || 'Campus'} logo` : 'EduTrack application logo';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <BrandImage
            src={brandImageSrc}
            alt={brandImageAlt}
            className={useCampusLogo ? 'brand-image brand-image-campus' : 'brand-image brand-image-sidebar'}
          />
          <div className="brand-copy">
            <div className="eyebrow">EduTrack Admin</div>
            <h2>{ROLE_LABELS[session.user.role]}</h2>
            <p>{session.school?.name || session.user.email}</p>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink key={item.key} to={`/app/${item.key}`} className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="profile-pill">
            <strong>{session.user.first_name} {session.user.last_name}</strong>
            <span>{session.user.email}</span>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">Live Backend</div>
            <h1>{navItems.find((item) => item.key === activeSection)?.label}</h1>
          </div>
          <button className="ghost-button" onClick={logout}>Sign Out</button>
        </header>
        <section className="page-body">
          <Suspense fallback={<div className="loading-card">Loading section...</div>}>
            <RoleSection role={session.user.role} section={activeSection} />
          </Suspense>
        </section>
      </main>
    </div>
  );
}

function RoleSection({ role, section }) {
  const { session } = useSession();
  const request = useApi();

  if (section === 'dashboard') return <PortalDashboardPage session={session} request={request} />;
  if (section === 'ai-materials' && role === 'admin') return <PortalAiMaterialsPage session={session} request={request} />;
  if (section === 'ai-policy' && (role === 'super_admin' || role === 'org_admin' || role === 'admin')) return <PortalAiPolicyPage session={session} request={request} />;
  if (section === 'ai-analytics' && (role === 'super_admin' || role === 'org_admin' || role === 'admin')) return <PortalAiAnalyticsPage session={session} request={request} />;
  if (section === 'organizations' && role === 'super_admin') return <PortalOrganizationsPage session={session} request={request} />;
  if (section === 'campuses' && (role === 'super_admin' || role === 'org_admin')) return <PortalCampusesPage session={session} request={request} />;
  if (section === 'admins' && role === 'org_admin') return <PortalOrgAdminsPage session={session} request={request} />;
  if (section === 'subjects') return <PortalSubjectsPage session={session} request={request} />;
  if (section === 'teachers') return <PortalTeachersPage session={session} request={request} />;
  if (section === 'classes') return <PortalClassesPage session={session} request={request} />;
  if (section === 'students') return <PortalStudentsPage session={session} request={request} />;
  if (section === 'parents') return <PortalParentsPage session={session} request={request} />;
  if (section === 'leaves' && (role === 'org_admin' || role === 'admin')) return <PortalLeavesPage session={session} request={request} />;
  if (section === 'notifications' && (role === 'org_admin' || role === 'admin')) return <PortalNotificationsPage session={session} request={request} />;
  if (section === 'assignments' && role === 'admin') return <PortalAssignmentsPage session={session} request={request} />;
  if (section === 'attendance' && role === 'admin') return <PortalTeacherAttendancePage session={session} request={request} />;
  return <PortalEmptyPage message="This section is not available for the current role." />;
}

function DashboardPage() {
  const { session } = useSession();
  const request = useApi();
  const statsPath = session.user.role === 'super_admin'
    ? '/super-admin/stats'
    : session.user.role === 'org_admin'
      ? '/org-admin/stats'
      : '/admin/stats';

  const { loading, error, data, reload } = useAsyncResource(() => request('GET', statsPath), [request, statsPath]);

  const cards = session.user.role === 'super_admin'
    ? [
        { label: 'Organizations', value: data?.organizations ?? data?.schools ?? 0 },
        { label: 'Schools', value: data?.schools ?? 0 },
        { label: 'Teachers', value: data?.teachers ?? 0 },
        { label: 'Students', value: data?.students ?? 0 },
      ]
    : session.user.role === 'org_admin'
      ? [
          { label: 'Campuses', value: data?.campuses ?? 0 },
          { label: 'Teachers', value: data?.teachers ?? 0 },
          { label: 'Students', value: data?.students ?? 0 },
          { label: 'Pending Leaves', value: data?.pending_leaves ?? 0 },
        ]
      : [
          { label: 'Teachers', value: data?.teachers ?? 0 },
          { label: 'Students', value: data?.students ?? 0 },
          { label: 'Classes', value: data?.classes ?? 0 },
          { label: 'Pending Leaves', value: data?.pending_leaves ?? 0 },
        ];

  return (
    <>
      <SectionIntro
        title="Overview"
        description=""
        action={<button className="secondary-button" onClick={reload}>Refresh Stats</button>}
      />
      {error ? <div className="banner banner-danger">{error}</div> : null}
      {loading ? <LoadingCard /> : (
        <div className="stat-grid">
          {cards.map((card) => (
            <article key={card.label} className="stat-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function OrganizationsPage() {
  const request = useApi();
  const [form, setForm] = useState({ id: null, name: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const { loading, error, data, reload } = useAsyncResource(async () => {
    const [orgs, schools] = await Promise.all([
      request('GET', '/super-admin/organizations'),
      request('GET', '/super-admin/schools'),
    ]);
    const campusCountByOrg = new Map();
    (schools || []).forEach((school) => {
      if (!school?.org_id) return;
      campusCountByOrg.set(school.org_id, (campusCountByOrg.get(school.org_id) || 0) + 1);
    });
    return (orgs || []).map((org) => ({ ...org, campus_count: campusCountByOrg.get(org.id) || 0 }));
  }, [request]);

  const items = data || [];

  const startEdit = (item) => setForm({ id: item.id, name: item.name || '' });
  const reset = () => setForm({ id: null, name: '' });

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      if (form.id) {
        await request('PUT', `/super-admin/organizations/${form.id}`, { data: { name: form.name.trim() } });
      } else {
        await request('POST', '/super-admin/organizations', { data: { name: form.name.trim() } });
      }
      reset();
      await reload();
      setMessage(form.id ? 'Organization updated.' : 'Organization created.');
    } catch (err) {
      setMessage(err.message || 'Could not save organization.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete organization "${item.name}"? Campuses must be removed first.`)) return;
    try {
      await request('DELETE', `/super-admin/organizations/${item.id}`);
      await reload();
      if (form.id === item.id) reset();
    } catch (err) {
      setMessage(err.message || 'Could not delete organization.');
    }
  };

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro title="Organizations" description="Create and manage top-level organizations that own one or more campuses." />
        {error ? <div className="banner banner-danger">{error}</div> : null}
        {message ? <div className="banner">{message}</div> : null}
        {loading ? <LoadingCard /> : (
          <DataTable
            columns={[
              { key: 'name', label: 'Organization' },
              { key: 'campus_count', label: 'Campuses' },
            ]}
            rows={items}
            actions={(item) => (
              <div className="table-actions">
                <button className="link-button" onClick={() => startEdit(item)}>Edit</button>
                <button className="link-button link-danger" onClick={() => handleDelete(item)}>Delete</button>
              </div>
            )}
            emptyMessage="No organizations created yet."
          />
        )}
      </section>
      <section className="panel accent-panel">
        <SectionIntro title={form.id ? 'Edit organization' : 'New organization'} description="This portal keeps organization CRUD separate from mobile UI while reusing the same backend routes." />
        <form className="stack-form" onSubmit={handleSave}>
          <label>
            <span>Name</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. North Region Schools" required />
          </label>
          <div className="button-row">
            <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : form.id ? 'Update Organization' : 'Create Organization'}</button>
            {form.id ? <button type="button" className="ghost-button" onClick={reset}>Cancel</button> : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function CampusesPage() {
  const { session } = useSession();
  const request = useApi();
  const isSuper = session.user.role === 'super_admin';
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ id: null, name: '', tagline: '', initials: '', org_id: '' });
  const [saving, setSaving] = useState(false);

  const { loading, error, data, reload } = useAsyncResource(async () => {
    if (isSuper) {
      const [schools, organizations] = await Promise.all([
        request('GET', '/super-admin/schools'),
        request('GET', '/super-admin/organizations'),
      ]);
      return { campuses: schools || [], organizations: organizations || [] };
    }
    const campuses = await request('GET', '/org-admin/campuses');
    return { campuses: campuses || [], organizations: [] };
  }, [request, isSuper]);

  const campuses = (data?.campuses || [])
    .filter((item) => !orgFilter || String(item.org_id) === String(orgFilter))
    .filter((item) => {
      const hay = `${item.name || ''} ${item.tagline || ''} ${item.initials || ''}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  const organizations = data?.organizations || [];

  const reset = () => setForm({ id: null, name: '', tagline: '', initials: '', org_id: '' });
  const edit = (item) => setForm({ id: item.id, name: item.name || '', tagline: item.tagline || '', initials: item.initials || '', org_id: item.org_id ? String(item.org_id) : '' });

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        name: form.name.trim(),
        tagline: form.tagline.trim(),
        initials: form.initials.trim().toUpperCase(),
        ...(isSuper ? { org_id: Number(form.org_id) } : {}),
      };
      if (form.id) {
        await request('PUT', `${isSuper ? '/super-admin/schools' : '/org-admin/campuses'}/${form.id}`, { data: payload });
      } else {
        await request('POST', isSuper ? '/super-admin/schools' : '/org-admin/campuses', { data: payload });
      }
      await reload();
      reset();
      setMessage(form.id ? 'Campus updated.' : 'Campus created.');
    } catch (err) {
      setMessage(err.message || 'Could not save campus.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Archive campus "${item.name}"?`)) return;
    try {
      await request('DELETE', `${isSuper ? '/super-admin/schools' : '/org-admin/campuses'}/${item.id}`);
      await reload();
    } catch (err) {
      setMessage(err.message || 'Could not archive campus.');
    }
  };

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro title="Campuses" description="Manage campus identity and scope with the same create, update, and archive routes already used by mobile admins." />
        <div className="toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search campuses..." />
          {isSuper ? (
            <select value={orgFilter} onChange={(event) => setOrgFilter(event.target.value)}>
              <option value="">All organizations</option>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          ) : null}
        </div>
        {error ? <div className="banner banner-danger">{error}</div> : null}
        {message ? <div className="banner">{message}</div> : null}
        {loading ? <LoadingCard /> : (
          <DataTable
            columns={[
              { key: 'name', label: 'Campus' },
              { key: 'initials', label: 'Initials' },
              { key: 'tagline', label: 'Tagline' },
            ]}
            rows={campuses}
            actions={(item) => (
              <div className="table-actions">
                <button className="link-button" onClick={() => edit(item)}>Edit</button>
                <button className="link-button link-danger" onClick={() => handleDelete(item)}>Archive</button>
              </div>
            )}
            emptyMessage="No campuses found."
          />
        )}
      </section>
      <section className="panel accent-panel">
        <SectionIntro title={form.id ? 'Edit campus' : 'New campus'} description="This first web pass supports core metadata; logo upload and deeper admin flows can be layered in next without changing the API contracts." />
        <form className="stack-form" onSubmit={handleSave}>
          <label>
            <span>Name</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Main Campus" required />
          </label>
          {isSuper ? (
            <label>
              <span>Organization</span>
              <select value={form.org_id} onChange={(event) => setForm((current) => ({ ...current, org_id: event.target.value }))} required>
                <option value="">Select organization</option>
                {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </label>
          ) : null}
          <label>
            <span>Tagline</span>
            <input value={form.tagline} onChange={(event) => setForm((current) => ({ ...current, tagline: event.target.value }))} placeholder="Attendance Management System" />
          </label>
          <label>
            <span>Initials</span>
            <input value={form.initials} onChange={(event) => setForm((current) => ({ ...current, initials: event.target.value }))} placeholder="MC" maxLength={4} />
          </label>
          <div className="button-row">
            <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : form.id ? 'Update Campus' : 'Create Campus'}</button>
            {form.id ? <button type="button" className="ghost-button" onClick={reset}>Cancel</button> : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function SubjectsPage() {
  const { session } = useSession();
  const request = useApi();
  const role = session.user.role;
  const isSuper = role === 'super_admin';
  const isOrg = role === 'org_admin';
  const [orgId, setOrgId] = useState('');
  const [campusId, setCampusId] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ id: null, name: '' });
  const [saving, setSaving] = useState(false);

  const { loading, error, data, reload } = useAsyncResource(async () => {
    if (isSuper) {
      const [organizations, campuses] = await Promise.all([
        request('GET', '/super-admin/organizations'),
        request('GET', '/super-admin/schools'),
      ]);
      return { organizations: organizations || [], campuses: campuses || [], subjects: [] };
    }
    if (isOrg) {
      const campuses = await request('GET', '/org-admin/campuses');
      return { organizations: [], campuses: campuses || [], subjects: [] };
    }
    const subjects = await request('GET', '/subjects');
    return { organizations: [], campuses: [], subjects: subjects || [] };
  }, [request, isSuper, isOrg]);

  const organizations = data?.organizations || [];
  const allCampuses = (data?.campuses || []).filter((item) => !orgId || String(item.org_id) === String(orgId));

  const [subjectsState, setSubjectsState] = useState({ loading: role !== 'admin', error: '', items: role === 'admin' ? (data?.subjects || []) : [] });

  useEffect(() => {
    if (role === 'admin') {
      setSubjectsState({ loading: false, error: '', items: data?.subjects || [] });
    }
  }, [data?.subjects, role]);

  const loadScopedSubjects = useCallback(async () => {
    if (role === 'admin') return;
    if (!campusId) {
      setSubjectsState({ loading: false, error: '', items: [] });
      return;
    }
    setSubjectsState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const items = isSuper
        ? await request('GET', `/super-admin/schools/${campusId}/subjects`)
        : await request('GET', '/org-admin/subjects', { params: { campus_id: campusId } });
      setSubjectsState({ loading: false, error: '', items: items || [] });
    } catch (err) {
      setSubjectsState({ loading: false, error: err.message || 'Could not load subjects.', items: [] });
    }
  }, [role, campusId, isSuper, request]);

  useEffect(() => {
    loadScopedSubjects();
  }, [loadScopedSubjects]);

  const items = (subjectsState.items || []).filter((item) => String(item.name || '').toLowerCase().includes(search.toLowerCase()));

  const reset = () => setForm({ id: null, name: '' });

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      if (isSuper) {
        if (form.id) await request('PUT', `/super-admin/schools/${campusId}/subjects/${form.id}`, { data: { name: form.name.trim() } });
        else await request('POST', `/super-admin/schools/${campusId}/subjects`, { data: { name: form.name.trim() } });
      } else if (isOrg) {
        if (form.id) await request('PUT', `/org-admin/subjects/${form.id}`, { data: { name: form.name.trim(), campus_id: Number(campusId) } });
        else await request('POST', '/org-admin/subjects', { data: { name: form.name.trim(), campus_id: Number(campusId) } });
      } else if (form.id) {
        await request('PUT', `/subjects/${form.id}`, { data: { name: form.name.trim() } });
      } else {
        await request('POST', '/subjects', { data: { name: form.name.trim() } });
      }
      reset();
      if (role === 'admin') await reload(); else await loadScopedSubjects();
      setMessage(form.id ? 'Subject updated.' : 'Subject created.');
    } catch (err) {
      setMessage(err.message || 'Could not save subject.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Archive subject "${item.name}"?`)) return;
    try {
      if (isSuper) await request('DELETE', `/super-admin/schools/${campusId}/subjects/${item.id}`);
      else if (isOrg) await request('DELETE', `/org-admin/subjects/${item.id}`);
      else await request('DELETE', `/subjects/${item.id}`);
      if (role === 'admin') await reload(); else await loadScopedSubjects();
    } catch (err) {
      setMessage(err.message || 'Could not archive subject.');
    }
  };

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro title="Subjects" description="A desktop master list for campus subjects using the same normalized backend routes the mobile managers already call." />
        <div className="toolbar toolbar-wrap">
          {isSuper ? (
            <select value={orgId} onChange={(event) => { setOrgId(event.target.value); setCampusId(''); }}>
              <option value="">All organizations</option>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          ) : null}
          {(isSuper || isOrg) ? (
            <select value={campusId} onChange={(event) => setCampusId(event.target.value)}>
              <option value="">Select campus</option>
              {allCampuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
          ) : null}
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search subjects..." />
        </div>
        {error ? <div className="banner banner-danger">{error}</div> : null}
        {subjectsState.error ? <div className="banner banner-danger">{subjectsState.error}</div> : null}
        {message ? <div className="banner">{message}</div> : null}
        {(loading || subjectsState.loading) ? <LoadingCard /> : (
          <DataTable
            columns={[{ key: 'name', label: 'Subject' }]}
            rows={items}
            actions={(item) => (
              <div className="table-actions">
                <button className="link-button" onClick={() => setForm({ id: item.id, name: item.name || '' })}>Edit</button>
                <button className="link-button link-danger" onClick={() => handleDelete(item)}>Archive</button>
              </div>
            )}
            emptyMessage={(isSuper || isOrg) && !campusId ? 'Choose a campus to manage subjects.' : 'No subjects found.'}
          />
        )}
      </section>
      <section className="panel accent-panel">
        <SectionIntro title={form.id ? 'Edit subject' : 'New subject'} description="Subject CRUD is already one of the cleanest shared admin flows, so it is wired here first with full create, update, and archive support." />
        <form className="stack-form" onSubmit={handleSave}>
          <label>
            <span>Subject name</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Mathematics" required />
          </label>
          <div className="button-row">
            <button className="primary-button" disabled={saving || ((isSuper || isOrg) && !campusId)}>{saving ? 'Saving...' : form.id ? 'Update Subject' : 'Create Subject'}</button>
            {form.id ? <button type="button" className="ghost-button" onClick={reset}>Cancel</button> : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function TeachersPage() {
  const { session } = useSession();
  const request = useApi();
  const role = session.user.role;
  const isSuper = role === 'super_admin';
  const isOrg = role === 'org_admin';
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [campusFilter, setCampusFilter] = useState('');

  const { loading, error, data } = useAsyncResource(async () => {
    if (isSuper) {
      const [organizations, schools] = await Promise.all([
        request('GET', '/super-admin/organizations'),
        request('GET', '/super-admin/schools'),
      ]);
      const scopedCampuses = (schools || []).filter((campus) => !orgFilter || String(campus.org_id) === String(orgFilter));
      const campusesToLoad = campusFilter ? scopedCampuses.filter((campus) => String(campus.id) === String(campusFilter)) : scopedCampuses;
      const teachers = campusesToLoad.length
        ? (await Promise.all(campusesToLoad.map((campus) => request('GET', `/super-admin/schools/${campus.id}/teachers`).catch(() => [])))).flat()
        : [];
      return { organizations: organizations || [], campuses: schools || [], teachers };
    }
    if (isOrg) {
      const [teachers, campuses] = await Promise.all([
        request('GET', '/org-admin/teachers', { params: campusFilter ? { campus_id: campusFilter } : {} }),
        request('GET', '/org-admin/campuses'),
      ]);
      return { organizations: [], campuses: campuses || [], teachers: teachers || [] };
    }
    const teachers = await request('GET', '/admin/teachers');
    return { organizations: [], campuses: [], teachers: teachers || [] };
  }, [request, role, isSuper, isOrg, orgFilter, campusFilter]);

  const campuses = (data?.campuses || []).filter((campus) => !orgFilter || String(campus.org_id) === String(orgFilter));
  const organizations = data?.organizations || [];
  const rows = (data?.teachers || []).filter((teacher) => {
    const hay = `${teacher.first_name || ''} ${teacher.last_name || ''} ${teacher.email || ''} ${teacher.phone || ''} ${teacher.school_name || ''} ${teacher.campus_name || ''}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  }).map((teacher) => ({
    ...teacher,
    name: `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim(),
    campus: teacher.campus_name || teacher.school_name || '-',
    type: teacher.teacher_role || '-',
  }));

  return (
    <section className="panel">
      <SectionIntro title="Teachers" description="Read-only desktop listing first, reusing the same teacher data routes the mobile admin screens aggregate today." />
      <div className="toolbar toolbar-wrap">
        {isSuper ? (
          <select value={orgFilter} onChange={(event) => { setOrgFilter(event.target.value); setCampusFilter(''); }}>
            <option value="">All organizations</option>
            {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
        ) : null}
        {(isSuper || isOrg) ? (
          <select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
            <option value="">All campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        ) : null}
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search teachers..." />
      </div>
      {error ? <div className="banner banner-danger">{error}</div> : null}
      {loading ? <LoadingCard /> : (
        <DataTable
          columns={[
            { key: 'name', label: 'Teacher' },
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone' },
            { key: 'campus', label: 'Campus' },
            { key: 'type', label: 'Role' },
          ]}
          rows={rows}
          emptyMessage="No teachers found for the current scope."
        />
      )}
    </section>
  );
}

function ClassesPage() {
  const { session } = useSession();
  const request = useApi();
  const role = session.user.role;
  const isSuper = role === 'super_admin';
  const isOrg = role === 'org_admin';
  const [orgFilter, setOrgFilter] = useState('');
  const [campusFilter, setCampusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { loading, error, data } = useAsyncResource(async () => {
    if (isSuper) {
      const [organizations, schools] = await Promise.all([
        request('GET', '/super-admin/organizations'),
        request('GET', '/super-admin/schools'),
      ]);
      const scopedCampuses = (schools || []).filter((campus) => !orgFilter || String(campus.org_id) === String(orgFilter));
      const campusesToLoad = campusFilter ? scopedCampuses.filter((campus) => String(campus.id) === String(campusFilter)) : scopedCampuses;
      const classes = campusesToLoad.length
        ? (await Promise.all(campusesToLoad.map((campus) => request('GET', `/super-admin/schools/${campus.id}/classes`).catch(() => [])))).flat()
        : [];
      return { organizations: organizations || [], campuses: schools || [], classes };
    }
    if (isOrg) {
      const [classes, campuses] = await Promise.all([
        request('GET', '/org-admin/classes', { params: campusFilter ? { campus_id: campusFilter } : {} }),
        request('GET', '/org-admin/campuses'),
      ]);
      return { organizations: [], campuses: campuses || [], classes: classes || [] };
    }
    const classes = await request('GET', '/admin/classes');
    return { organizations: [], campuses: [], classes: classes || [] };
  }, [request, role, isSuper, isOrg, orgFilter, campusFilter]);

  const campuses = (data?.campuses || []).filter((campus) => !orgFilter || String(campus.org_id) === String(orgFilter));
  const organizations = data?.organizations || [];
  const rows = (data?.classes || []).filter((item) => {
    const hay = `${item.class_name || ''} ${item.school_name || ''} ${item.campus_name || ''}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  }).map((item) => ({
    ...item,
    campus: item.campus_name || item.school_name || '-',
    sections: item.section_count ?? item.sections?.length ?? '-',
  }));

  return (
    <section className="panel">
      <SectionIntro title="Classes" description="Desktop visibility for class records across campuses, with filtering based on the same role-scoped endpoints already in production." />
      <div className="toolbar toolbar-wrap">
        {isSuper ? (
          <select value={orgFilter} onChange={(event) => { setOrgFilter(event.target.value); setCampusFilter(''); }}>
            <option value="">All organizations</option>
            {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
        ) : null}
        {(isSuper || isOrg) ? (
          <select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
            <option value="">All campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        ) : null}
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search classes..." />
      </div>
      {error ? <div className="banner banner-danger">{error}</div> : null}
      {loading ? <LoadingCard /> : (
        <DataTable
          columns={[
            { key: 'class_name', label: 'Class' },
            { key: 'campus', label: 'Campus' },
            { key: 'sections', label: 'Sections' },
          ]}
          rows={rows}
          emptyMessage="No classes found for the current scope."
        />
      )}
    </section>
  );
}

function StudentsPage() {
  const { session } = useSession();
  const request = useApi();
  const isOrg = session.user.role === 'org_admin';
  const [campusFilter, setCampusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { loading, error, data } = useAsyncResource(async () => {
    if (isOrg) {
      const [students, campuses] = await Promise.all([
        request('GET', '/org-admin/students', { params: campusFilter ? { campus_id: campusFilter } : {} }),
        request('GET', '/org-admin/campuses'),
      ]);
      return { campuses: campuses || [], students: students || [] };
    }
    const students = await request('GET', '/admin/students');
    return { campuses: [], students: students || [] };
  }, [request, isOrg, campusFilter]);

  const campuses = data?.campuses || [];
  const rows = (data?.students || []).filter((item) => {
    const hay = `${item.first_name || ''} ${item.last_name || ''} ${item.roll_no || ''} ${item.class_name || ''} ${item.section_name || ''}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  }).map((item) => ({
    ...item,
    name: `${item.first_name || ''} ${item.last_name || ''}`.trim(),
    class_section: [item.class_name, item.section_name].filter(Boolean).join(' / ') || '-',
  }));

  return (
    <section className="panel">
      <SectionIntro title="Students" description="Desktop student visibility is scoped exactly like the mobile app: org admins can filter by campus, school admins stay inside their own campus context." />
      <div className="toolbar toolbar-wrap">
        {isOrg ? (
          <select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
            <option value="">All campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        ) : null}
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students..." />
      </div>
      {error ? <div className="banner banner-danger">{error}</div> : null}
      {loading ? <LoadingCard /> : (
        <DataTable
          columns={[
            { key: 'name', label: 'Student' },
            { key: 'roll_no', label: 'Roll No' },
            { key: 'class_section', label: 'Class / Section' },
          ]}
          rows={rows}
          emptyMessage="No students found for the current scope."
        />
      )}
    </section>
  );
}

function SectionIntro({ title, description, action }) {
  return (
    <div className="section-intro">
      <div>
        <div className="eyebrow">Web Admin</div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action || null}
    </div>
  );
}

function DataTable({ columns, rows, actions, emptyMessage }) {
  if (!rows.length) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => <th key={column.key}>{column.label}</th>)}
            {actions ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.id}-${row.email || row.name || row.class_name || row.roll_no || Math.random()}`}>
              {columns.map((column) => <td key={column.key}>{row[column.key] ?? '-'}</td>)}
              {actions ? <td>{actions(row)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingCard() {
  return <div className="loading-card">Loading...</div>;
}

function EmptyPage({ message }) {
  return <div className="empty-state">{message}</div>;
}

export default App;
