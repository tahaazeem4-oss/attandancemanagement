import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiBlobRequest, apiFormRequest } from './lib/api';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function useRemoteResource(loader, deps) {
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

function formatPhoneForForm(phone) {
  if (!phone) return '';
  const match = String(phone).match(/^\+92(\d{10})$/);
  return match ? `0${match[1]}` : String(phone);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isValidLocalPhone(phone) {
  return /^03\d{9}$/.test(String(phone || '').trim());
}

function isValidPkPhone(phone) {
  const value = String(phone || '').trim();
  return isValidLocalPhone(value) || /^\+92\d{10}$/.test(value);
}

function hasMinPasswordLength(password) {
  return String(password || '').length >= 6;
}

function formatAiQuotaViolationMessage(violations) {
  return safeArray(violations).map((violation) => {
    const fieldLabel = AI_POLICY_FIELDS.find((field) => field.key === violation.field)?.label || violation.field;
    const parentPool = violation.parent_pool === null || violation.parent_pool === undefined ? 'no parent limit set' : Number(violation.parent_pool).toLocaleString();
    const siblingSum = violation.sibling_sum === null || violation.sibling_sum === undefined ? '0' : Number(violation.sibling_sum).toLocaleString();
    const maxAllowed = violation.max_allowed === null || violation.max_allowed === undefined ? null : Number(violation.max_allowed).toLocaleString();

    if (violation.parent_pool === null) {
      return `- ${fieldLabel}: no limit is set higher in the tree. Set it on a parent first, then distribute it here.`;
    }

    if (maxAllowed === null) {
      return `- ${fieldLabel}: cannot exceed the parent cap (${parentPool}).`;
    }

    return `- ${fieldLabel}: only ${maxAllowed} available (parent has ${parentPool}, siblings already use ${siblingSum}).`;
  }).join('\n');
}

function initials(firstName, lastName) {
  return `${String(firstName || '').trim()[0] || ''}${String(lastName || '').trim()[0] || ''}`.toUpperCase() || 'NA';
}

function fullName(item) {
  return `${item?.first_name || ''} ${item?.last_name || ''}`.trim() || '-';
}

function csvDownload(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => {
    const text = String(cell ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadFile({ token, path, filename, params }) {
  const { blob, filename: responseFilename } = await apiBlobRequest('GET', path, { token, params });
  triggerDownload(blob, responseFilename || filename);
}

async function uploadImportFile({ token, path, file, params }) {
  const formData = new FormData();
  formData.append('file', file);
  return apiFormRequest('POST', path, { token, params, formData });
}

async function runBulkDelete({ items, deleter, label, clearSelection, onDone, onMessage }) {
  if (!items.length) return;
  if (!window.confirm(`Delete ${items.length} selected ${label}?`)) return;

  const results = await Promise.allSettled(items.map((item) => deleter(item)));
  const successCount = results.filter((result) => result.status === 'fulfilled').length;
  const failedCount = results.length - successCount;

  await onDone?.();
  clearSelection?.();

  if (failedCount) {
    onMessage?.(`${successCount} ${label} processed, ${failedCount} failed.`, 'danger');
    return;
  }

  onMessage?.(`${successCount} ${label} processed.`);
}

const DELETE_IMPACT_COUNT_LABELS = {
  teacher_assignments: 'Class/section assignments',
  teacher_attendance: 'Teacher attendance records',
  student_attendance_marked: 'Student attendance entries marked',
  lectures_uploaded: 'Lectures uploaded',
  lectures: 'Lectures',
  lectures_by_name: 'Lectures referencing this subject',
  chat_conversations: 'Chat conversations',
  sections: 'Sections',
  students: 'Enrolled students',
  notifications: 'Notifications',
  leave_applications: 'Leave applications',
  ai_documents: 'AI tutor documents',
  ai_chat_sessions: 'AI tutor chat sessions',
  ai_usage_logs: 'AI usage logs',
  admins: 'Campus admins',
  teachers: 'Teachers',
  classes: 'Classes',
  subjects: 'Subjects',
  parent_access: 'Parent access grants',
};

function formatDeleteImpactMessage(impact, entityLabel) {
  const lines = [];
  const itemName = impact?.name ? `"${impact.name}"` : `this ${entityLabel}`;

  if (safeArray(impact?.blocking_reasons).length) {
    lines.push('Cannot archive yet:');
    safeArray(impact.blocking_reasons).forEach((reason) => lines.push(`- ${reason}`));
    lines.push('');
  }

  const counts = Object.entries(impact?.counts || {}).filter(([, value]) => Number(value) > 0);
  if (counts.length) {
    lines.push(`Archiving ${itemName} will keep the following linked data intact:`);
    counts.forEach(([key, value]) => {
      lines.push(`- ${DELETE_IMPACT_COUNT_LABELS[key] || key.replace(/_/g, ' ')}: ${value}`);
    });
    lines.push('');
    lines.push(`The ${entityLabel} will be hidden from active lists but history is preserved.`);
  } else if (!lines.length) {
    lines.push(`Archive ${itemName}? It will be hidden from active lists but history is preserved.`);
  }

  return lines.join('\n');
}

async function archiveWithImpact({ request, impactPath, deletePath, entityLabel, fallbackMessage, onBlocked, deleteConfig }) {
  let impact = null;
  try {
    impact = await request('GET', impactPath);
  } catch {
    impact = null;
  }

  if (safeArray(impact?.blocking_reasons).length && impact?.mode_allowed !== 'archive') {
    onBlocked?.(formatDeleteImpactMessage(impact, entityLabel));
    return false;
  }

  const message = impact
    ? formatDeleteImpactMessage(impact, entityLabel)
    : (fallbackMessage || `Archive this ${entityLabel}? Linked records will be preserved.`);

  if (!window.confirm(message)) return false;
  await request('DELETE', deletePath, deleteConfig);
  return true;
}

function buildScopedImportPath({ role, entity, orgId, campusId }) {
  if (role === 'org_admin') {
    return {
      basePath: `/org-admin/import-export/${entity}`,
      params: {
        ...(campusId ? { campus_id: campusId } : {}),
      },
    };
  }

  if (role === 'super_admin') {
    if (entity === 'campuses' || entity === 'admins') {
      return {
        basePath: `/org-admin/import-export/${entity}`,
        params: {
          ...(orgId ? { org_id: orgId } : {}),
          ...(campusId ? { campus_id: campusId } : {}),
        },
      };
    }

    if (entity === 'parents') {
      return {
        basePath: '/org-admin/import-export/parents',
        params: {
          ...(campusId ? { campus_id: campusId } : {}),
        },
      };
    }

    return {
      basePath: `/import-export/${entity}`,
      params: {
        ...(campusId ? { campus_id: campusId } : {}),
      },
    };
  }

  return { basePath: `/import-export/${entity}`, params: {} };
}

function formatImportResultMessage(result) {
  const message = result?.message || 'Import completed.';
  const errors = safeArray(result?.errors);
  if (!errors.length) return message;
  const preview = errors.slice(0, 5).join('\n');
  const extra = errors.length > 5 ? `\n...and ${errors.length - 5} more` : '';
  return `${message}\n\nSkipped rows:\n${preview}${extra}`;
}

function ImportExportToolbar({
  session,
  entity,
  filenamePrefix,
  params,
  disabled,
  disabledMessage,
  showCsvExport = true,
  onDone,
  onMessage,
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState('');
  const token = session?.token;
  const role = session?.user?.role;
  const scoped = useMemo(
    () => buildScopedImportPath({ role, entity, orgId: params?.org_id, campusId: params?.campus_id }),
    [role, entity, params?.org_id, params?.campus_id],
  );

  const runTemplate = async () => {
    if (disabled) return;
    setBusy('template');
    try {
      await downloadFile({ token, path: `${scoped.basePath}/template`, filename: `${filenamePrefix}_template.xlsx`, params: scoped.params });
    } catch (error) {
      onMessage(error.message || 'Could not download template.', 'danger');
    } finally {
      setBusy('');
    }
  };

  const runExport = async () => {
    if (disabled) return;
    setBusy('export');
    try {
      await downloadFile({ token, path: `${scoped.basePath}/export`, filename: `${filenamePrefix}_export.xlsx`, params: scoped.params });
    } catch (error) {
      onMessage(error.message || 'Could not export data.', 'danger');
    } finally {
      setBusy('');
    }
  };

  const runExportCsv = async () => {
    if (disabled) return;
    setBusy('exportCsv');
    try {
      await downloadFile({ token, path: `${scoped.basePath}/export`, filename: `${filenamePrefix}_export.csv`, params: { ...scoped.params, format: 'csv' } });
    } catch (error) {
      onMessage(error.message || 'Could not export CSV.', 'danger');
    } finally {
      setBusy('');
    }
  };

  const runImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy('import');
    try {
      const result = await uploadImportFile({ token, path: `${scoped.basePath}/import`, file, params: scoped.params });
      onMessage(formatImportResultMessage(result), safeArray(result?.errors).length ? 'danger' : 'neutral');
      await onDone?.();
    } catch (error) {
      onMessage(error.message || 'Could not import file.', 'danger');
    } finally {
      setBusy('');
      event.target.value = '';
    }
  };

  return (
    <div className="import-export-bar">
      <button type="button" className="secondary-button" onClick={runTemplate} disabled={disabled || !!busy}>{busy === 'template' ? 'Preparing...' : 'Template'}</button>
      <button type="button" className="secondary-button" onClick={() => !disabled && inputRef.current?.click()} disabled={disabled || !!busy}>{busy === 'import' ? 'Importing...' : 'Import'}</button>
      <button type="button" className="secondary-button" onClick={runExport} disabled={disabled || !!busy}>{busy === 'export' ? 'Exporting...' : 'Excel'}</button>
      {showCsvExport ? <button type="button" className="secondary-button" onClick={runExportCsv} disabled={disabled || !!busy}>{busy === 'exportCsv' ? 'Exporting...' : 'CSV'}</button> : null}
      <input ref={inputRef} className="hidden-file-input" type="file" accept=".xlsx,.xls,.csv" onChange={runImport} />
      {disabled && disabledMessage ? <span className="toolbar-note">{disabledMessage}</span> : null}
    </div>
  );
}

function SectionIntro({ title, description, action }) {
  return (
    <div className="section-intro">
      <div>
        <div className="eyebrow">Web Admin</div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action || null}
    </div>
  );
}

function LoadingCard() {
  return <div className="loading-card">Loading...</div>;
}

function EmptyState({ message }) {
  return <div className="empty-state">{message}</div>;
}

function Banner({ message, tone = 'neutral' }) {
  if (!message) return null;
  return <div className={tone === 'danger' ? 'banner banner-danger' : 'banner'}>{message}</div>;
}

function TableActionMenu({ label = 'Row actions', items }) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef(null);
  const panelRef = useRef(null);
  const visibleItems = safeArray(items).filter(Boolean);

  useEffect(() => {
    if (!open) {
      setOpenUpward(false);
      return undefined;
    }

    const updateDirection = () => {
      if (!menuRef.current || !panelRef.current) return;
      const triggerRect = menuRef.current.getBoundingClientRect();
      const panelHeight = panelRef.current.offsetHeight;
      const panelWidth = panelRef.current.offsetWidth;
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      const needsUpward = spaceBelow < panelHeight + 12 && spaceAbove > spaceBelow;
      const top = needsUpward
        ? Math.max(8, triggerRect.top - panelHeight - 8)
        : Math.min(window.innerHeight - panelHeight - 8, triggerRect.bottom + 8);
      const left = Math.max(8, Math.min(triggerRect.right - panelWidth, window.innerWidth - panelWidth - 8));
      setOpenUpward(needsUpward);
      setPanelPosition({ top, left });
    };

    updateDirection();
    window.addEventListener('resize', updateDirection);
    window.addEventListener('scroll', updateDirection, true);

    return () => {
      window.removeEventListener('resize', updateDirection);
      window.removeEventListener('scroll', updateDirection, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      const clickedTrigger = menuRef.current?.contains(event.target);
      const clickedPanel = panelRef.current?.contains(event.target);
      if (!clickedTrigger && !clickedPanel) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (!visibleItems.length) return null;

  return (
    <div className="table-action-menu" ref={menuRef}>
      <button
        type="button"
        className={open ? 'table-action-trigger table-action-trigger-open' : 'table-action-trigger'}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
      >
        <span className="table-action-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      {open && typeof document !== 'undefined' ? createPortal(
        <div
          className={openUpward ? 'table-action-panel table-action-panel-floating table-action-panel-up' : 'table-action-panel table-action-panel-floating'}
          role="menu"
          aria-label={label}
          ref={panelRef}
          style={{ top: `${panelPosition.top}px`, left: `${panelPosition.left}px` }}
        >
          {visibleItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.tone === 'danger' ? 'table-action-item table-action-item-danger' : 'table-action-item'}
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function DataTable({ columns, rows, actions, emptyMessage, selectable = false, bulkActions, selectionKey = 'id' }) {
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    const validIds = new Set(rows.map((row) => String(row?.[selectionKey])));
    setSelectedIds((current) => current.filter((id) => validIds.has(id)));
  }, [rows, selectionKey]);

  if (!rows.length) return <EmptyState message={emptyMessage} />;

  const getRowId = (row) => String(row?.[selectionKey]);
  const allSelected = selectable && rows.length > 0 && selectedIds.length === rows.length;
  const selectedRows = selectable ? rows.filter((row) => selectedIds.includes(getRowId(row))) : [];

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : rows.map((row) => getRowId(row)));
  };

  const toggleRow = (row) => {
    const rowId = getRowId(row);
    setSelectedIds((current) => current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]);
  };

  return (
    <div className="table-stack">
      {selectable && selectedRows.length && bulkActions ? (
        <div className="bulk-bar">
          <span>{selectedRows.length} selected</span>
          <div className="button-row">
            {bulkActions({ selectedRows, clearSelection: () => setSelectedIds([]), selectedCount: selectedRows.length })}
          </div>
        </div>
      ) : null}
      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {selectable ? <th className="checkbox-col"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all rows" /></th> : null}
            {columns.map((column) => <th key={column.key}>{column.label}</th>)}
            {actions ? <th className="table-actions-head">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.id}-${row.email || row.name || row.title || row.class_name || row.roll_no || row.group_id || row.created_at || 'row'}`}>
              {selectable ? <td className="checkbox-col"><input type="checkbox" checked={selectedIds.includes(getRowId(row))} onChange={() => toggleRow(row)} aria-label="Select row" /></td> : null}
              {columns.map((column) => <td key={column.key}>{row[column.key] ?? '-'}</td>)}
              {actions ? <td className="table-actions-cell">{actions(row)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}

function ChipSelect({ items, values, onToggle }) {
  return (
    <div className="chip-group">
      {items.map((item) => {
        const active = values.includes(item.value);
        return (
          <button
            type="button"
            key={item.value}
            className={active ? 'chip chip-active' : 'chip'}
            onClick={() => onToggle(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function normalizeAssignments(items) {
  return safeArray(items).map((item) => ({
    class_id: item?.class_id ? String(item.class_id) : '',
    section_id: item?.section_id ? String(item.section_id) : '',
  }));
}

function defaultTeacherForm() {
  return {
    id: null,
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: '',
    school_id: '',
    teacher_role: 'subject_teacher',
    assignments: [{ class_id: '', section_id: '' }],
    subject_ids: [],
  };
}

function defaultStudentForm() {
  return {
    id: null,
    first_name: '',
    last_name: '',
    age: '',
    roll_no: '',
    school_id: '',
    class_id: '',
    section_id: '',
  };
}

function defaultParentForm() {
  return {
    id: null,
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone: '',
    school_id: '',
  };
}

function defaultAdminForm() {
  return {
    id: null,
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    phone: '',
    school_id: '',
  };
}

function statusTone(status, withdrawalStatus) {
  if (withdrawalStatus === 'pending') return 'warning';
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warning';
}

export function PortalDashboardPage({ session, request }) {
  const statsPath = session.user.role === 'super_admin'
    ? '/super-admin/stats'
    : session.user.role === 'org_admin'
      ? '/org-admin/stats'
      : '/admin/stats';

  const { loading, error, data, reload } = useRemoteResource(() => request('GET', statsPath), [request, statsPath]);

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
      <Banner message={error} tone="danger" />
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

export function PortalOrganizationsPage({ request }) {
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [orgForm, setOrgForm] = useState({ id: null, name: '' });
  const [adminForm, setAdminForm] = useState(defaultAdminForm());
  const [message, setMessage] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);

  const { loading, error, data, reload } = useRemoteResource(async () => {
    const [orgs, schools] = await Promise.all([
      request('GET', '/super-admin/organizations'),
      request('GET', '/super-admin/schools'),
    ]);
    const campusCountByOrg = new Map();
    safeArray(schools).forEach((school) => {
      if (!school?.org_id) return;
      campusCountByOrg.set(school.org_id, (campusCountByOrg.get(school.org_id) || 0) + 1);
    });
    const organizations = safeArray(orgs).map((org) => ({ ...org, campus_count: campusCountByOrg.get(org.id) || 0 }));
    const orgAdmins = await Promise.all(organizations.map(async (org) => ({ orgId: org.id, items: safeArray(await request('GET', `/super-admin/organizations/${org.id}/org-admins`).catch(() => [])) })));
    const adminMap = Object.fromEntries(orgAdmins.map((entry) => [entry.orgId, entry.items]));
    return { organizations, adminMap };
  }, [request]);

  const organizations = data?.organizations || [];
  const selectedOrg = organizations.find((item) => Number(item.id) === Number(selectedOrgId)) || organizations[0] || null;
  const selectedAdmins = selectedOrg ? safeArray(data?.adminMap?.[selectedOrg.id]) : [];

  useEffect(() => {
    if (!selectedOrgId && organizations.length) {
      setSelectedOrgId(organizations[0].id);
    }
  }, [organizations, selectedOrgId]);

  const resetOrg = () => setOrgForm({ id: null, name: '' });
  const resetAdmin = () => setAdminForm(defaultAdminForm());

  const saveOrg = async (event) => {
    event.preventDefault();
    setSavingOrg(true);
    setMessage('');
    try {
      if (orgForm.id) {
        await request('PUT', `/super-admin/organizations/${orgForm.id}`, { data: { name: orgForm.name.trim() } });
      } else {
        await request('POST', '/super-admin/organizations', { data: { name: orgForm.name.trim() } });
      }
      resetOrg();
      await reload();
      setMessage(orgForm.id ? 'Organization updated.' : 'Organization created.');
    } catch (err) {
      setMessage(err.message || 'Could not save organization.');
    } finally {
      setSavingOrg(false);
    }
  };

  const deleteOrg = async (item) => {
    if (!window.confirm(`Delete organization "${item.name}"? Campuses must be removed first.`)) return;
    try {
      await request('DELETE', `/super-admin/organizations/${item.id}`);
      if (selectedOrgId === item.id) setSelectedOrgId(null);
      await reload();
      resetOrg();
    } catch (err) {
      setMessage(err.message || 'Could not delete organization.');
    }
  };

  const saveAdmin = async (event) => {
    event.preventDefault();
    if (!adminForm.first_name.trim() || !adminForm.last_name.trim() || !adminForm.email.trim() || !adminForm.phone.trim()) {
      setMessage('First name, last name, email and phone are required.');
      return;
    }
    if (!isValidEmail(adminForm.email)) {
      setMessage('Please enter a valid email address.');
      return;
    }
    if (!isValidLocalPhone(adminForm.phone)) {
      setMessage('Phone must be in format 03XXXXXXXXX (11 digits, starts with 03, no spaces or dashes).');
      return;
    }
    if (!adminForm.id && !hasMinPasswordLength(adminForm.password)) {
      setMessage('Password must be at least 6 characters for new organization admins.');
      return;
    }
    if (!selectedOrg) return;
    setSavingAdmin(true);
    setMessage('');
    try {
      const payload = {
        first_name: adminForm.first_name.trim(),
        last_name: adminForm.last_name.trim(),
        email: adminForm.email.trim(),
        phone: adminForm.phone.trim(),
      };
      if (adminForm.id) {
        await request('PUT', `/super-admin/organizations/${selectedOrg.id}/org-admins/${adminForm.id}`, { data: payload });
      } else {
        await request('POST', `/super-admin/organizations/${selectedOrg.id}/org-admins`, {
          data: { ...payload, password: adminForm.password, phone: adminForm.phone.trim() },
        });
      }
      resetAdmin();
      await reload();
      setMessage(adminForm.id ? 'Organization admin updated.' : 'Organization admin created.');
    } catch (err) {
      setMessage(err.message || 'Could not save organization admin.');
    } finally {
      setSavingAdmin(false);
    }
  };

  const deleteAdmin = async (item) => {
    if (!selectedOrg) return;
    if (!window.confirm(`Delete organization admin "${fullName(item)}"?`)) return;
    try {
      await request('DELETE', `/super-admin/organizations/${selectedOrg.id}/org-admins/${item.id}`);
      await reload();
      resetAdmin();
    } catch (err) {
      setMessage(err.message || 'Could not delete organization admin.');
    }
  };

  const resetAdminPassword = async (item) => {
    if (!selectedOrg) return;
    const password = window.prompt(`Enter a new password for ${fullName(item)}`);
    if (!password) return;
    if (!hasMinPasswordLength(password)) {
      setMessage('Password must be at least 6 characters.');
      return;
    }
    try {
      await request('POST', `/super-admin/organizations/${selectedOrg.id}/org-admins/${item.id}/reset-password`, { data: { new_password: password } });
      setMessage('Organization admin password reset.');
    } catch (err) {
      setMessage(err.message || 'Could not reset password.');
    }
  };

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro title="Organizations" description="Top-level organizations and their organization-admin accounts are managed here using the same live super-admin endpoints as mobile." />
        <Banner message={error} tone="danger" />
        <Banner message={message} />
        {loading ? <LoadingCard /> : (
          <DataTable
            columns={[
              { key: 'name', label: 'Organization' },
              { key: 'campus_count', label: 'Campuses' },
            ]}
            rows={organizations}
            actions={(item) => (
              <TableActionMenu
                label="Organization actions"
                items={[
                  { label: 'Edit', onClick: () => { setSelectedOrgId(item.id); setOrgForm({ id: item.id, name: item.name || '' }); } },
                  { label: 'Manage Admins', onClick: () => setSelectedOrgId(item.id) },
                  { label: 'Delete', onClick: () => deleteOrg(item), tone: 'danger' },
                ]}
              />
            )}
            emptyMessage="No organizations created yet."
          />
        )}
      </section>
      <section className="panel accent-panel">
        <SectionIntro title={orgForm.id ? 'Edit organization' : 'New organization'} description="Create organizations on the left; manage org admins for the selected organization below." />
        <form className="stack-form" onSubmit={saveOrg}>
          <label>
            <span>Name</span>
            <input value={orgForm.name} onChange={(event) => setOrgForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. North Region Schools" required />
          </label>
          <div className="button-row">
            <button className="primary-button" disabled={savingOrg}>{savingOrg ? 'Saving...' : orgForm.id ? 'Update Organization' : 'Create Organization'}</button>
            {orgForm.id ? <button type="button" className="ghost-button" onClick={resetOrg}>Cancel</button> : null}
          </div>
        </form>

        <div className="subsection-divider" />
        <SectionIntro title={selectedOrg ? `${selectedOrg.name} Org Admins` : 'Org Admins'} description="Assign one or more organization admins to the selected organization." />
        {selectedOrg ? (
          <>
            <DataTable
              columns={[
                { key: 'display_name', label: 'Name' },
                { key: 'email', label: 'Email' },
                { key: 'phone', label: 'Phone' },
              ]}
              rows={selectedAdmins.map((item) => ({ ...item, display_name: fullName(item) }))}
              actions={(item) => (
                <TableActionMenu
                  label="Organization admin actions"
                  items={[
                    { label: 'Edit', onClick: () => setAdminForm({ id: item.id, first_name: item.first_name || '', last_name: item.last_name || '', email: item.email || '', password: '', phone: formatPhoneForForm(item.phone), school_id: '' }) },
                    { label: 'Reset Password', onClick: () => resetAdminPassword(item) },
                    { label: 'Delete', onClick: () => deleteAdmin(item), tone: 'danger' },
                  ]}
                />
              )}
              emptyMessage="No organization admins assigned yet."
            />
            <form className="stack-form stack-form-compact" onSubmit={saveAdmin}>
              <div className="form-grid-2">
                <label>
                  <span>First name</span>
                  <input value={adminForm.first_name} onChange={(event) => setAdminForm((current) => ({ ...current, first_name: event.target.value }))} required />
                </label>
                <label>
                  <span>Last name</span>
                  <input value={adminForm.last_name} onChange={(event) => setAdminForm((current) => ({ ...current, last_name: event.target.value }))} required />
                </label>
              </div>
              <div className="form-grid-2">
                <label>
                  <span>Email</span>
                  <input value={adminForm.email} onChange={(event) => setAdminForm((current) => ({ ...current, email: event.target.value }))} required />
                </label>
                <label>
                  <span>Phone</span>
                  <input value={adminForm.phone} onChange={(event) => setAdminForm((current) => ({ ...current, phone: event.target.value }))} placeholder="03XXXXXXXXX" required />
                </label>
              </div>
              {!adminForm.id ? (
                <label>
                  <span>Password</span>
                  <input type="password" value={adminForm.password} onChange={(event) => setAdminForm((current) => ({ ...current, password: event.target.value }))} required />
                </label>
              ) : null}
              <div className="button-row">
                <button className="primary-button" disabled={savingAdmin}>{savingAdmin ? 'Saving...' : adminForm.id ? 'Update Org Admin' : 'Create Org Admin'}</button>
                {adminForm.id ? <button type="button" className="ghost-button" onClick={resetAdmin}>Cancel</button> : null}
              </div>
            </form>
          </>
        ) : <EmptyState message="Select an organization to manage org admins." />}
      </section>
    </div>
  );
}

export function PortalCampusesPage({ session, request }) {
  const isSuper = session.user.role === 'super_admin';
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [selectedCampusId, setSelectedCampusId] = useState(null);
  const [form, setForm] = useState({ id: null, name: '', tagline: '', initials: '', org_id: '', primary_color: '#2563EB', accent_color: '#1D4ED8' });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [adminForm, setAdminForm] = useState(defaultAdminForm());
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);

  const { loading, error, data, reload } = useRemoteResource(async () => {
    if (isSuper) {
      const [schools, organizations] = await Promise.all([
        request('GET', '/super-admin/schools'),
        request('GET', '/super-admin/organizations'),
      ]);
      const campusAdmins = await Promise.all(safeArray(schools).map(async (campus) => ({
        campusId: campus.id,
        items: safeArray(await request('GET', `/super-admin/schools/${campus.id}/admins`).catch(() => [])),
      })));
      return {
        campuses: safeArray(schools),
        organizations: safeArray(organizations),
        campusAdminMap: Object.fromEntries(campusAdmins.map((item) => [item.campusId, item.items])),
      };
    }
    const campuses = await request('GET', '/org-admin/campuses');
    return { campuses: safeArray(campuses), organizations: [], campusAdminMap: {} };
  }, [request, isSuper]);

  const organizations = data?.organizations || [];
  const campuses = safeArray(data?.campuses)
    .filter((item) => !orgFilter || String(item.org_id) === String(orgFilter))
    .filter((item) => `${item.name || ''} ${item.tagline || ''} ${item.initials || ''}`.toLowerCase().includes(search.toLowerCase()));
  const campusImportParams = {
    ...(isSuper && orgFilter ? { org_id: orgFilter } : {}),
  };
  const selectedCampus = campuses.find((item) => Number(item.id) === Number(selectedCampusId)) || campuses[0] || null;
  const selectedAdmins = selectedCampus ? safeArray(data?.campusAdminMap?.[selectedCampus.id]) : [];

  useEffect(() => {
    if (!selectedCampusId && campuses.length) setSelectedCampusId(campuses[0].id);
  }, [campuses, selectedCampusId]);

  const reset = () => {
    setForm({ id: null, name: '', tagline: '', initials: '', org_id: '', primary_color: '#2563EB', accent_color: '#1D4ED8' });
    setLogoFile(null);
    setLogoPreview('');
  };
  const resetAdmin = () => setAdminForm(defaultAdminForm());

  const handleCampusLogoChange = (event) => {
    const file = event.target.files?.[0] || null;
    setLogoFile(file);
    setLogoPreview(file ? URL.createObjectURL(file) : '');
    event.target.value = '';
  };

  const saveCampus = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setMessage('Campus name is required.');
      return;
    }
    if (isSuper && !form.org_id) {
      setMessage('Please select an organization.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        name: form.name.trim(),
        tagline: form.tagline.trim(),
        initials: form.initials.trim().toUpperCase(),
        primary_color: form.primary_color.trim() || '#2563EB',
        accent_color: form.accent_color.trim() || '#1D4ED8',
        ...(isSuper ? { org_id: Number(form.org_id) } : {}),
      };
      let campusId = form.id;
      if (form.id) {
        await request('PUT', `${isSuper ? '/super-admin/schools' : '/org-admin/campuses'}/${form.id}`, { data: payload });
      } else {
        const created = await request('POST', isSuper ? '/super-admin/schools' : '/org-admin/campuses', { data: payload });
        campusId = created?.id || created?.data?.id || null;
      }
      if (logoFile && campusId) {
        const formData = new FormData();
        formData.append('logo', logoFile);
        await apiFormRequest('POST', isSuper ? `/super-admin/schools/${campusId}/logo` : `/org-admin/campuses/${campusId}/logo`, {
          token: session?.token,
          formData,
        });
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

  const deleteCampus = async (item) => {
    try {
      const basePath = `${isSuper ? '/super-admin/schools' : '/org-admin/campuses'}/${item.id}`;
      const didArchive = await archiveWithImpact({
        request,
        impactPath: `${basePath}/delete-impact`,
        deletePath: basePath,
        entityLabel: 'campus',
        fallbackMessage: `Archive campus "${item.name}"?`,
        onBlocked: (text) => setMessage(text),
      });
      if (!didArchive) return;
      if (selectedCampusId === item.id) setSelectedCampusId(null);
      await reload();
    } catch (err) {
      setMessage(err.message || 'Could not archive campus.');
    }
  };

  const saveAdmin = async (event) => {
    event.preventDefault();
    if (!selectedCampus) return;
    if (!adminForm.first_name.trim() || !adminForm.last_name.trim() || !adminForm.email.trim() || !adminForm.phone.trim()) {
      setMessage('First name, last name, email and phone are required.');
      return;
    }
    if (!isValidEmail(adminForm.email)) {
      setMessage('Please enter a valid email address.');
      return;
    }
    if (!isValidLocalPhone(adminForm.phone)) {
      setMessage('Phone must be in format 03XXXXXXXXX (11 digits, starts with 03).');
      return;
    }
    if (!adminForm.id && !hasMinPasswordLength(adminForm.password)) {
      setMessage('Password must be at least 6 characters for new campus admins.');
      return;
    }
    setSavingAdmin(true);
    setMessage('');
    try {
      const payload = {
        first_name: adminForm.first_name.trim(),
        last_name: adminForm.last_name.trim(),
        email: adminForm.email.trim(),
        phone: adminForm.phone.trim(),
      };
      if (adminForm.id) {
        await request('PUT', `/super-admin/schools/${selectedCampus.id}/admins/${adminForm.id}`, { data: payload });
      } else {
        await request('POST', `/super-admin/schools/${selectedCampus.id}/admins`, { data: { ...payload, password: adminForm.password } });
      }
      await reload();
      resetAdmin();
      setMessage(adminForm.id ? 'Campus admin updated.' : 'Campus admin created.');
    } catch (err) {
      setMessage(err.message || 'Could not save campus admin.');
    } finally {
      setSavingAdmin(false);
    }
  };

  const deleteAdmin = async (item) => {
    if (!selectedCampus) return;
    if (!window.confirm(`Delete campus admin "${fullName(item)}"?`)) return;
    try {
      await request('DELETE', `/super-admin/schools/${selectedCampus.id}/admins/${item.id}`);
      await reload();
      resetAdmin();
    } catch (err) {
      setMessage(err.message || 'Could not delete campus admin.');
    }
  };

  const resetAdminPassword = async (item) => {
    if (!selectedCampus) return;
    const password = window.prompt(`Enter a new password for ${fullName(item)}`);
    if (!password) return;
    if (!hasMinPasswordLength(password)) {
      setMessage('Password must be at least 6 characters.');
      return;
    }
    try {
      await request('POST', `/super-admin/schools/${selectedCampus.id}/admins/${item.id}/reset-password`, { data: { new_password: password } });
      setMessage('Campus admin password reset.');
    } catch (err) {
      setMessage(err.message || 'Could not reset password.');
    }
  };

  const bulkDeleteCampuses = async (selectedRows, clearSelection) => {
    await runBulkDelete({
      items: selectedRows,
      label: 'campuses',
      clearSelection,
      onDone: reload,
      onMessage: setMessage,
      deleter: (item) => request('DELETE', `${isSuper ? '/super-admin/schools' : '/org-admin/campuses'}/${item.id}`),
    });
  };

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro title="Campuses" description="Campus CRUD and, for super admin, campus-admin management. All actions reuse the same school and admin endpoints the mobile portal uses." />
        <div className="toolbar toolbar-wrap">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search campuses..." />
          {isSuper ? (
            <select value={orgFilter} onChange={(event) => { setOrgFilter(event.target.value); setSelectedCampusId(null); }}>
              <option value="">All organizations</option>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          ) : null}
        </div>
        <ImportExportToolbar
          session={session}
          entity="campuses"
          filenamePrefix="campuses"
          params={campusImportParams}
          onDone={reload}
          onMessage={setMessage}
        />
        <Banner message={error} tone="danger" />
        <Banner message={message} />
        {loading ? <LoadingCard /> : (
          <DataTable
            selectable
            bulkActions={({ selectedRows, clearSelection }) => (
              <button type="button" className="secondary-button" onClick={() => bulkDeleteCampuses(selectedRows, clearSelection)}>Archive Selected</button>
            )}
            columns={[
              { key: 'name', label: 'Campus' },
              { key: 'initials', label: 'Initials' },
              { key: 'tagline', label: 'Tagline' },
            ]}
            rows={campuses}
            actions={(item) => (
              <TableActionMenu
                label="Campus actions"
                items={[
                  { label: 'Edit', onClick: () => { setSelectedCampusId(item.id); setForm({ id: item.id, name: item.name || '', tagline: item.tagline || '', initials: item.initials || '', org_id: item.org_id ? String(item.org_id) : '', primary_color: item.primary_color || '#2563EB', accent_color: item.accent_color || '#1D4ED8' }); setLogoFile(null); setLogoPreview(item.logo_url || ''); } },
                  isSuper ? { label: 'Manage Admins', onClick: () => setSelectedCampusId(item.id) } : null,
                  { label: 'Archive', onClick: () => deleteCampus(item), tone: 'danger' },
                ]}
              />
            )}
            emptyMessage="No campuses found."
          />
        )}
      </section>
      <section className="panel accent-panel">
        <SectionIntro title={form.id ? 'Edit campus' : 'New campus'} description="The desktop form preserves the same create and update payloads as mobile, including campus logo upload." />
        <form className="stack-form" onSubmit={saveCampus}>
          <label>
            <span>Name</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
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
            <input value={form.tagline} onChange={(event) => setForm((current) => ({ ...current, tagline: event.target.value }))} />
          </label>
          <label>
            <span>Initials</span>
            <input value={form.initials} onChange={(event) => setForm((current) => ({ ...current, initials: event.target.value }))} maxLength={4} />
          </label>
          <div className="form-grid-2">
            <label>
              <span>Primary color</span>
              <input value={form.primary_color} onChange={(event) => setForm((current) => ({ ...current, primary_color: event.target.value }))} placeholder="#2563EB" />
            </label>
            <label>
              <span>Accent color</span>
              <input value={form.accent_color} onChange={(event) => setForm((current) => ({ ...current, accent_color: event.target.value }))} placeholder="#1D4ED8" />
            </label>
          </div>
          <div className="logo-upload-panel">
            <span className="field-caption">Campus logo</span>
            <div className="logo-upload-row">
              {logoPreview ? (
                <img src={logoPreview} alt="Campus logo preview" className="logo-upload-preview" />
              ) : (
                <div className="logo-upload-placeholder">No logo</div>
              )}
              <label className="logo-upload-control">
                <span>Choose logo</span>
                <input type="file" accept="image/*" onChange={handleCampusLogoChange} />
              </label>
            </div>
          </div>
          <div className="button-row">
            <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : form.id ? 'Update Campus' : 'Create Campus'}</button>
            {form.id ? <button type="button" className="ghost-button" onClick={reset}>Cancel</button> : null}
          </div>
        </form>

        {isSuper ? (
          <>
            <div className="subsection-divider" />
            <SectionIntro title={selectedCampus ? `${selectedCampus.name} Campus Admins` : 'Campus Admins'} description="Assign or reset school-admin accounts for the selected campus." />
            {selectedCampus ? (
              <>
                <DataTable
                  columns={[
                    { key: 'display_name', label: 'Name' },
                    { key: 'email', label: 'Email' },
                    { key: 'phone', label: 'Phone' },
                  ]}
                  rows={selectedAdmins.map((item) => ({ ...item, display_name: fullName(item) }))}
                  actions={(item) => (
                    <TableActionMenu
                      label="Campus admin actions"
                      items={[
                        { label: 'Edit', onClick: () => setAdminForm({ id: item.id, first_name: item.first_name || '', last_name: item.last_name || '', email: item.email || '', password: '', phone: formatPhoneForForm(item.phone), school_id: '' }) },
                        { label: 'Reset Password', onClick: () => resetAdminPassword(item) },
                        { label: 'Delete', onClick: () => deleteAdmin(item), tone: 'danger' },
                      ]}
                    />
                  )}
                  emptyMessage="No campus admins assigned yet."
                />
                <form className="stack-form stack-form-compact" onSubmit={saveAdmin}>
                  <div className="form-grid-2">
                    <label>
                      <span>First name</span>
                      <input value={adminForm.first_name} onChange={(event) => setAdminForm((current) => ({ ...current, first_name: event.target.value }))} required />
                    </label>
                    <label>
                      <span>Last name</span>
                      <input value={adminForm.last_name} onChange={(event) => setAdminForm((current) => ({ ...current, last_name: event.target.value }))} required />
                    </label>
                  </div>
                  <div className="form-grid-2">
                    <label>
                      <span>Email</span>
                      <input value={adminForm.email} onChange={(event) => setAdminForm((current) => ({ ...current, email: event.target.value }))} required />
                    </label>
                    <label>
                      <span>Phone</span>
                      <input value={adminForm.phone} onChange={(event) => setAdminForm((current) => ({ ...current, phone: event.target.value }))} placeholder="03XXXXXXXXX" required />
                    </label>
                  </div>
                  {!adminForm.id ? (
                    <label>
                      <span>Password</span>
                      <input type="password" value={adminForm.password} onChange={(event) => setAdminForm((current) => ({ ...current, password: event.target.value }))} required />
                    </label>
                  ) : null}
                  <div className="button-row">
                    <button className="primary-button" disabled={savingAdmin}>{savingAdmin ? 'Saving...' : adminForm.id ? 'Update Campus Admin' : 'Create Campus Admin'}</button>
                    {adminForm.id ? <button type="button" className="ghost-button" onClick={resetAdmin}>Cancel</button> : null}
                  </div>
                </form>
              </>
            ) : <EmptyState message="Select a campus to manage campus admins." />}
          </>
        ) : null}
      </section>
    </div>
  );
}

function useTeacherScopeData(request, role, orgFilter, campusFilter) {
  const isSuper = role === 'super_admin';
  const isOrg = role === 'org_admin';
  return useRemoteResource(async () => {
    if (isSuper) {
      const [organizations, schools] = await Promise.all([
        request('GET', '/super-admin/organizations'),
        request('GET', '/super-admin/schools'),
      ]);
      const filteredCampuses = safeArray(schools).filter((campus) => !orgFilter || String(campus.org_id) === String(orgFilter));
      const campusesToLoad = campusFilter ? filteredCampuses.filter((campus) => String(campus.id) === String(campusFilter)) : filteredCampuses;
      const teachers = campusesToLoad.length
        ? (await Promise.all(campusesToLoad.map((campus) => request('GET', `/super-admin/schools/${campus.id}/teachers`).catch(() => [])))).flat()
        : [];
      return { organizations: safeArray(organizations), campuses: filteredCampuses, teachers, classes: [] };
    }
    if (isOrg) {
      const [campuses, teachers] = await Promise.all([
        request('GET', '/org-admin/campuses'),
        request('GET', '/org-admin/teachers', { params: campusFilter ? { campus_id: campusFilter } : {} }),
      ]);
      return { organizations: [], campuses: safeArray(campuses), teachers: safeArray(teachers), classes: [] };
    }
    const [teachers, classes] = await Promise.all([
      request('GET', '/admin/teachers'),
      request('GET', '/admin/classes'),
    ]);
    return { organizations: [], campuses: [], teachers: safeArray(teachers), classes: safeArray(classes) };
  }, [request, role, orgFilter, campusFilter]);
}

export function PortalTeachersPage({ session, request }) {
  const role = session.user.role;
  const isSuper = role === 'super_admin';
  const isOrg = role === 'org_admin';
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [campusFilter, setCampusFilter] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(defaultTeacherForm());
  const [saving, setSaving] = useState(false);
  const [classOptions, setClassOptions] = useState([]);
  const [subjectOptions, setSubjectOptions] = useState([]);

  const { loading, error, data, reload } = useTeacherScopeData(request, role, orgFilter, campusFilter);
  const organizations = data?.organizations || [];
  const campuses = data?.campuses || [];
  const teacherImportParams = {
    ...((isSuper || isOrg) && campusFilter ? { campus_id: campusFilter } : {}),
  };
  const showScopedTeacherImport = !(isSuper || isOrg) || !!campusFilter;
  const teachers = safeArray(data?.teachers)
    .filter((teacher) => {
      const hay = `${teacher.first_name || ''} ${teacher.last_name || ''} ${teacher.email || ''} ${teacher.phone || ''} ${teacher.campus_name || ''} ${teacher.school_name || ''}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    })
    .map((teacher) => ({
      ...teacher,
      display_name: fullName(teacher),
      campus: teacher.campus_name || teacher.school_name || '-',
      role_label: (teacher.teacher_role || '-').replace(/_/g, ' '),
    }));

  const loadFormClasses = useCallback(async (schoolId) => {
    if (!schoolId && (isOrg || isSuper)) {
      setClassOptions([]);
      return;
    }
    try {
      const result = isSuper
        ? await request('GET', `/super-admin/schools/${schoolId}/classes`)
        : isOrg
          ? await request('GET', '/org-admin/classes', { params: { campus_id: schoolId } })
          : safeArray(data?.classes || []);
      setClassOptions(safeArray(result));
    } catch {
      setClassOptions([]);
    }
  }, [request, isOrg, isSuper, data?.classes]);

  useEffect(() => {
    if (isSuper || isOrg) {
      loadFormClasses(form.school_id);
    } else {
      setClassOptions(safeArray(data?.classes || []));
    }
  }, [form.school_id, isSuper, isOrg, loadFormClasses, data?.classes]);

  useEffect(() => {
    const loadSubjects = async () => {
      if ((isSuper || isOrg) && !form.school_id) {
        setSubjectOptions([]);
        return;
      }
      try {
        const result = isSuper
          ? await request('GET', `/super-admin/schools/${form.school_id}/subjects`)
          : isOrg
            ? await request('GET', '/org-admin/subjects', { params: { campus_id: form.school_id } })
            : await request('GET', '/subjects');
        setSubjectOptions(safeArray(result));
      } catch {
        setSubjectOptions([]);
      }
    };
    loadSubjects();
  }, [request, isSuper, isOrg, form.school_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => setForm(defaultTeacherForm());

  const updateAssignment = (index, key, value) => {
    setForm((current) => ({
      ...current,
      assignments: current.assignments.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value, ...(key === 'class_id' ? { section_id: '' } : {}) } : item),
    }));
  };

  const addAssignment = () => setForm((current) => ({ ...current, assignments: [...current.assignments, { class_id: '', section_id: '' }] }));
  const removeAssignment = (index) => setForm((current) => ({ ...current, assignments: current.assignments.filter((_, itemIndex) => itemIndex !== index) }));

  const startEdit = (item) => {
    setForm({
      id: item.id,
      first_name: item.first_name || '',
      last_name: item.last_name || '',
      email: item.email || '',
      phone: formatPhoneForForm(item.phone),
      password: '',
      school_id: item.school_id ? String(item.school_id) : '',
      teacher_role: item.teacher_role || 'subject_teacher',
      assignments: normalizeAssignments(item.assignments).length ? normalizeAssignments(item.assignments) : [{ class_id: '', section_id: '' }],
      subject_ids: [],
    });
    request('GET', `/timetable/teacher-subjects/${item.id}`)
      .then((subjectData) => setForm((prev) => ({ ...prev, subject_ids: safeArray(subjectData?.subject_ids).map(Number) })))
      .catch(() => {});
  };

  const saveTeacher = async (event) => {
    event.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim() || !form.phone.trim()) {
      setMessage('First name, last name, email and phone are required.');
      return;
    }
    if (!isValidEmail(form.email)) {
      setMessage('Please enter a valid email address (e.g. teacher@school.com).');
      return;
    }
    if (!isValidPkPhone(form.phone)) {
      setMessage('Phone must be 03XXXXXXXXX or +92XXXXXXXXXX format.');
      return;
    }
    if (!form.id && !form.password) {
      setMessage('Password is required for new teachers.');
      return;
    }
    if (!form.id && form.password && !hasMinPasswordLength(form.password)) {
      setMessage('Password must be at least 6 characters for new teachers.');
      return;
    }
    if ((isSuper || isOrg) && !form.school_id) {
      setMessage('Please select a campus.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        assignments: form.assignments.filter((item) => item.class_id).map((item) => ({
          class_id: Number(item.class_id),
          section_id: item.section_id ? Number(item.section_id) : null,
        })),
        teacher_role: form.teacher_role,
      };

      let savedTeacherId = form.id;
      let savedSchoolId = form.school_id;

      if (isSuper) {
        const schoolId = form.id ? (form.school_id || '') : form.school_id;
        if (form.id) {
          await request('PUT', `/super-admin/schools/${schoolId}/teachers/${form.id}`, { data: payload });
        } else {
          const result = await request('POST', `/super-admin/schools/${schoolId}/teachers`, { data: { ...payload, password: form.password, school_id: Number(form.school_id) } });
          savedTeacherId = result?.id || result?.teacher?.id || null;
          savedSchoolId = schoolId;
        }
      } else if (isOrg) {
        if (form.id) {
          await request('PUT', `/org-admin/teachers/${form.id}`, { data: payload });
        } else {
          const result = await request('POST', '/org-admin/teachers', { data: { ...payload, password: form.password, school_id: Number(form.school_id) } });
          savedTeacherId = result?.id || result?.teacher?.id || null;
          savedSchoolId = Number(form.school_id);
        }
      } else if (form.id) {
        await request('PUT', `/admin/teachers/${form.id}`, { data: payload });
      } else {
        const result = await request('POST', '/admin/teachers', { data: { ...payload, password: form.password } });
        savedTeacherId = result?.id || result?.teacher?.id || null;
      }

      if (savedTeacherId) {
        try {
          await request('PUT', '/timetable/teacher-subjects', {
            data: {
              teacher_id: Number(savedTeacherId),
              subject_ids: safeArray(form.subject_ids).map(Number),
              ...(savedSchoolId ? { school_id: Number(savedSchoolId) } : {}),
            },
          });
        } catch {
          // non-fatal — teacher saved successfully
        }
      }

      await reload();
      reset();
      setMessage(form.id ? 'Teacher updated.' : 'Teacher created.');
    } catch (err) {
      setMessage(err.message || 'Could not save teacher.');
    } finally {
      setSaving(false);
    }
  };

  const deleteTeacher = async (item) => {
    const base = isSuper
      ? `/super-admin/schools/${item.school_id}/teachers/${item.id}`
      : isOrg
        ? `/org-admin/teachers/${item.id}`
        : `/admin/teachers/${item.id}`;
    try {
      const didArchive = await archiveWithImpact({
        request,
        impactPath: `${base}/delete-impact`,
        deletePath: base,
        entityLabel: 'teacher',
        fallbackMessage: `Archive teacher "${fullName(item)}"?`,
        onBlocked: (text) => setMessage(text),
      });
      if (!didArchive) return;
      await reload();
    } catch (err) {
      setMessage(err.message || 'Could not archive teacher.');
    }
  };

  const resetPassword = async (item) => {
    const password = window.prompt(`Enter a new password for ${fullName(item)}`);
    if (!password) return;
    if (!hasMinPasswordLength(password)) {
      setMessage('Password must be at least 6 characters.');
      return;
    }
    const path = isSuper
      ? `/super-admin/schools/${item.school_id}/teachers/${item.id}/reset-password`
      : isOrg
        ? `/org-admin/teachers/${item.id}/reset-password`
        : `/admin/teachers/${item.id}/reset-password`;
    try {
      await request('POST', path, { data: { new_password: password } });
      setMessage('Teacher password reset.');
    } catch (err) {
      setMessage(err.message || 'Could not reset password.');
    }
  };

  const bulkDeleteTeachers = async (selectedRows, clearSelection) => {
    await runBulkDelete({
      items: selectedRows,
      label: 'teacher records',
      clearSelection,
      onDone: reload,
      onMessage: setMessage,
      deleter: (item) => request('DELETE', isSuper ? `/super-admin/schools/${item.school_id}/teachers/${item.id}` : isOrg ? `/org-admin/teachers/${item.id}` : `/admin/teachers/${item.id}`),
    });
  };

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro title="Teachers" description="Create, update, reset, and archive teachers with the same role-scoped endpoints used by the mobile admin screens." />
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
        {showScopedTeacherImport ? (
          <ImportExportToolbar
            session={session}
            entity="teachers"
            filenamePrefix="teachers"
            params={teacherImportParams}
            onDone={reload}
            onMessage={setMessage}
          />
        ) : (
          <Banner message="Select a campus first to import or export teachers." />
        )}
        <Banner message={error} tone="danger" />
        <Banner message={message} />
        {loading ? <LoadingCard /> : (
          <DataTable
            selectable
            bulkActions={({ selectedRows, clearSelection }) => (
              <button type="button" className="secondary-button" onClick={() => bulkDeleteTeachers(selectedRows, clearSelection)}>Archive Selected</button>
            )}
            columns={[
              { key: 'display_name', label: 'Teacher' },
              { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' },
              { key: 'campus', label: 'Campus' },
              { key: 'role_label', label: 'Role' },
            ]}
            rows={teachers}
            actions={(item) => (
              <TableActionMenu
                label="Teacher actions"
                items={[
                  { label: 'Edit', onClick: () => startEdit(item) },
                  { label: 'Reset Password', onClick: () => resetPassword(item) },
                  { label: 'Archive', onClick: () => deleteTeacher(item), tone: 'danger' },
                ]}
              />
            )}
            emptyMessage="No teachers found for the current scope."
          />
        )}
      </section>
      <section className="panel accent-panel">
        <SectionIntro title={form.id ? 'Edit teacher' : 'New teacher'} description="Assignments are preserved as class/section pairs, matching the mobile teacher manager payloads." />
        <form className="stack-form" onSubmit={saveTeacher}>
          <div className="form-grid-2">
            <label>
              <span>First name</span>
              <input value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} required />
            </label>
            <label>
              <span>Last name</span>
              <input value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} required />
            </label>
          </div>
          <div className="form-grid-2">
            <label>
              <span>Email</span>
              <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
            </label>
            <label>
              <span>Phone</span>
              <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="03XXXXXXXXX" required />
            </label>
          </div>
          {(isSuper || isOrg) ? (
            <label>
              <span>Campus</span>
              <select value={form.school_id} onChange={(event) => setForm((current) => ({ ...current, school_id: event.target.value, assignments: [{ class_id: '', section_id: '' }] }))} required={!form.id}>
                <option value="">Select campus</option>
                {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
              </select>
            </label>
          ) : null}
          <label>
            <span>Teacher role</span>
            <select value={form.teacher_role} onChange={(event) => setForm((current) => ({ ...current, teacher_role: event.target.value }))}>
              <option value="subject_teacher">Subject Teacher</option>
              <option value="class_teacher">Class Teacher</option>
              <option value="floor_incharge">Floor Incharge</option>
            </select>
          </label>
          {!form.id ? (
            <label>
              <span>Password</span>
              <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required />
            </label>
          ) : null}

          <div className="assignment-block">
            <div className="toolbar toolbar-wrap toolbar-inline">
              <strong>Assignments</strong>
              <button type="button" className="secondary-button" onClick={addAssignment}>Add Assignment</button>
            </div>
            {form.assignments.map((assignment, index) => {
              const classItem = classOptions.find((item) => String(item.id) === String(assignment.class_id));
              const sections = safeArray(classItem?.sections || []);
              return (
                <div key={`assignment-${index}`} className="form-grid-assignment">
                  <select value={assignment.class_id} onChange={(event) => updateAssignment(index, 'class_id', event.target.value)}>
                    <option value="">Select class</option>
                    {classOptions.map((item) => <option key={item.id} value={item.id}>{item.class_name}</option>)}
                  </select>
                  <select value={assignment.section_id} onChange={(event) => updateAssignment(index, 'section_id', event.target.value)} disabled={!assignment.class_id}>
                    <option value="">Whole class / no section</option>
                    {sections.map((item) => <option key={item.id} value={item.id}>{item.section_name}</option>)}
                  </select>
                  <button type="button" className="ghost-button" onClick={() => removeAssignment(index)} disabled={form.assignments.length === 1}>Remove</button>
                </div>
              );
            })}
          </div>
          {subjectOptions.length > 0 ? (
            <div className="assignment-block">
              <div className="toolbar toolbar-inline">
                <strong>Subjects</strong>
                <span className="field-caption">Pick the subjects this teacher can teach — used to filter teachers in the timetable</span>
              </div>
              <div className="chip-group">
                {subjectOptions.map((subject) => {
                  const active = (form.subject_ids || []).includes(Number(subject.id));
                  return (
                    <button
                      key={subject.id}
                      type="button"
                      className={active ? 'chip chip-active' : 'chip'}
                      onClick={() => setForm((current) => ({
                        ...current,
                        subject_ids: active
                          ? (current.subject_ids || []).filter((id) => id !== Number(subject.id))
                          : [...(current.subject_ids || []), Number(subject.id)],
                      }))}
                    >
                      {subject.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (isSuper || isOrg) && !form.school_id ? (
            <p className="field-caption">Select a campus to see available subjects.</p>
          ) : null}
          <div className="button-row">
            <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : form.id ? 'Update Teacher' : 'Create Teacher'}</button>
            {form.id ? <button type="button" className="ghost-button" onClick={reset}>Cancel</button> : null}
          </div>
        </form>
      </section>
    </div>
  );
}

export function PortalStudentsPage({ session, request }) {
  const role = session.user.role;
  const isSuper = role === 'super_admin';
  const isOrg = role === 'org_admin';
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [campusFilter, setCampusFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(defaultStudentForm());
  const [saving, setSaving] = useState(false);
  const [classOptions, setClassOptions] = useState([]);
  const [sectionOptions, setSectionOptions] = useState([]);

  const { loading, error, data, reload } = useRemoteResource(async () => {
    if (isSuper) {
      const [organizations, schools] = await Promise.all([
        request('GET', '/super-admin/organizations'),
        request('GET', '/super-admin/schools'),
      ]);
      const filteredCampuses = safeArray(schools).filter((campus) => !orgFilter || String(campus.org_id) === String(orgFilter));
      if (campusFilter) {
        const params = {};
        if (classFilter) params.class_id = classFilter;
        if (sectionFilter) params.section_id = sectionFilter;
        const students = await request('GET', `/super-admin/schools/${campusFilter}/students`, { params }).catch(() => []);
        return { organizations: safeArray(organizations), campuses: filteredCampuses, students: safeArray(students), classes: [] };
      }
      const responses = await Promise.all(filteredCampuses.map((campus) => request('GET', `/super-admin/schools/${campus.id}/students`).catch(() => [])));
      let students = responses.flat();
      if (classFilter) students = students.filter((student) => String(student.class_id) === String(classFilter));
      if (sectionFilter) students = students.filter((student) => String(student.section_id) === String(sectionFilter));
      return { organizations: safeArray(organizations), campuses: filteredCampuses, students, classes: [] };
    }
    if (isOrg) {
      const [campuses, students] = await Promise.all([
        request('GET', '/org-admin/campuses'),
        request('GET', '/org-admin/students', { params: { ...(campusFilter ? { campus_id: campusFilter } : {}), ...(classFilter ? { class_id: classFilter } : {}), ...(sectionFilter ? { section_id: sectionFilter } : {}) } }),
      ]);
      return { organizations: [], campuses: safeArray(campuses), students: safeArray(students), classes: [] };
    }
    const students = await request('GET', '/admin/students');
    return { organizations: [], campuses: [], students: safeArray(students), classes: safeArray(await request('GET', '/admin/classes').catch(() => [])) };
  }, [request, role, orgFilter, campusFilter, classFilter, sectionFilter]);

  const organizations = data?.organizations || [];
  const campuses = data?.campuses || [];
  const studentImportParams = {
    ...((isSuper || isOrg) && campusFilter ? { campus_id: campusFilter } : {}),
  };
  const showScopedStudentImport = !(isSuper || isOrg) || !!campusFilter;
  const students = safeArray(data?.students)
    .filter((item) => `${item.first_name || ''} ${item.last_name || ''} ${item.roll_no || ''} ${item.class_name || ''} ${item.section_name || ''} ${item.school_name || ''}`.toLowerCase().includes(search.toLowerCase()))
    .map((item) => ({ ...item, display_name: fullName(item), class_section: [item.class_name, item.section_name].filter(Boolean).join(' / ') || '-' }));

  const loadScopeClasses = useCallback(async (schoolId) => {
    try {
      const result = isSuper
        ? (schoolId ? await request('GET', `/super-admin/schools/${schoolId}/classes`) : [])
        : isOrg
          ? (schoolId ? await request('GET', '/org-admin/classes', { params: { campus_id: schoolId } }) : [])
          : safeArray(data?.classes || []);
      setClassOptions(safeArray(result));
    } catch {
      setClassOptions([]);
    }
  }, [request, isSuper, isOrg, data?.classes]);

  useEffect(() => {
    if (isSuper || isOrg) {
      loadScopeClasses(campusFilter);
    } else {
      setClassOptions(safeArray(data?.classes || []));
    }
  }, [campusFilter, isSuper, isOrg, data?.classes, loadScopeClasses]);

  useEffect(() => {
    if (isSuper || isOrg) {
      loadScopeClasses(form.school_id);
    } else {
      setClassOptions(safeArray(data?.classes || []));
    }
  }, [form.school_id, isSuper, isOrg, loadScopeClasses, data?.classes]);

  useEffect(() => {
    const classItem = classOptions.find((item) => String(item.id) === String(form.class_id || classFilter));
    setSectionOptions(safeArray(classItem?.sections || []));
  }, [classOptions, form.class_id, classFilter]);

  const reset = () => setForm(defaultStudentForm());

  const startEdit = (item) => setForm({
    id: item.id,
    first_name: item.first_name || '',
    last_name: item.last_name || '',
    age: item.age ? String(item.age) : '',
    roll_no: item.roll_no || '',
    school_id: item.school_id ? String(item.school_id) : '',
    class_id: item.class_id ? String(item.class_id) : '',
    section_id: item.section_id ? String(item.section_id) : '',
  });

  const saveStudent = async (event) => {
    event.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim() || !form.class_id || !form.section_id || (!isOrg && !form.age) || ((isSuper || isOrg) && !form.school_id)) {
      setMessage('Please fill all required fields.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        age: form.age ? Number(form.age) : null,
        roll_no: form.roll_no.trim() || null,
        class_id: Number(form.class_id),
        section_id: Number(form.section_id),
        ...(isSuper || isOrg ? { school_id: Number(form.school_id) } : {}),
      };
      if (isSuper) {
        if (form.id) await request('PUT', `/super-admin/schools/${form.school_id}/students/${form.id}`, { data: payload });
        else await request('POST', `/super-admin/schools/${form.school_id}/students`, { data: payload });
      } else if (isOrg) {
        if (form.id) await request('PUT', `/org-admin/students/${form.id}`, { data: payload });
        else await request('POST', '/org-admin/students', { data: payload });
      } else if (form.id) {
        await request('PUT', `/admin/students/${form.id}`, { data: payload });
      } else {
        await request('POST', '/admin/students', { data: payload });
      }
      await reload();
      reset();
      setMessage(form.id ? 'Student updated.' : 'Student created.');
    } catch (err) {
      setMessage(err.message || 'Could not save student.');
    } finally {
      setSaving(false);
    }
  };

  const deleteStudent = async (item) => {
    const path = isSuper
      ? `/super-admin/schools/${item.school_id}/students/${item.id}`
      : isOrg
        ? `/org-admin/students/${item.id}`
        : `/admin/students/${item.id}`;
    if (!window.confirm(`Delete student "${fullName(item)}"?`)) return;
    try {
      await request('DELETE', path);
      await reload();
    } catch (err) {
      setMessage(err.message || 'Could not delete student.');
    }
  };

  const bulkDeleteStudents = async (selectedRows, clearSelection) => {
    await runBulkDelete({
      items: selectedRows,
      label: 'student records',
      clearSelection,
      onDone: reload,
      onMessage: setMessage,
      deleter: (item) => request('DELETE', isSuper ? `/super-admin/schools/${item.school_id}/students/${item.id}` : isOrg ? `/org-admin/students/${item.id}` : `/admin/students/${item.id}`),
    });
  };

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro title="Students" description="Create, update, filter, and delete students in a desktop layout while preserving the same campus/class/section backend rules." />
        <div className="toolbar toolbar-wrap">
          {isSuper ? (
            <select value={orgFilter} onChange={(event) => { setOrgFilter(event.target.value); setCampusFilter(''); setClassFilter(''); setSectionFilter(''); }}>
              <option value="">All organizations</option>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          ) : null}
          {(isSuper || isOrg) ? (
            <select value={campusFilter} onChange={(event) => { setCampusFilter(event.target.value); setClassFilter(''); setSectionFilter(''); }}>
              <option value="">All campuses</option>
              {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
          ) : null}
          <select value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setSectionFilter(''); }}>
            <option value="">All classes</option>
            {classOptions.map((item) => <option key={item.id} value={item.id}>{item.class_name}</option>)}
          </select>
          <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)} disabled={!classFilter}>
            <option value="">All sections</option>
            {sectionOptions.map((item) => <option key={item.id} value={item.id}>{item.section_name}</option>)}
          </select>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students..." />
        </div>
        {showScopedStudentImport ? (
          <ImportExportToolbar
            session={session}
            entity="students"
            filenamePrefix="students"
            params={studentImportParams}
            onDone={reload}
            onMessage={setMessage}
          />
        ) : (
          <Banner message="Select a campus first to import or export students." />
        )}
        <Banner message={error} tone="danger" />
        <Banner message={message} />
        {loading ? <LoadingCard /> : (
          <DataTable
            selectable
            bulkActions={({ selectedRows, clearSelection }) => (
              <button type="button" className="secondary-button" onClick={() => bulkDeleteStudents(selectedRows, clearSelection)}>Delete Selected</button>
            )}
            columns={[
              { key: 'display_name', label: 'Student' },
              { key: 'roll_no', label: 'Roll No' },
              { key: 'class_section', label: 'Class / Section' },
              { key: 'school_name', label: 'Campus' },
            ]}
            rows={students}
            actions={(item) => (
              <TableActionMenu
                label="Student actions"
                items={[
                  { label: 'Edit', onClick: () => startEdit(item) },
                  { label: 'Delete', onClick: () => deleteStudent(item), tone: 'danger' },
                ]}
              />
            )}
            emptyMessage="No students found for the current scope."
          />
        )}
      </section>
      <section className="panel accent-panel">
        <SectionIntro title={form.id ? 'Edit student' : 'New student'} description="Student create and update payloads are kept aligned with the mobile manager: campus, class, section, roll number, and age." />
        <form className="stack-form" onSubmit={saveStudent}>
          <div className="form-grid-2">
            <label>
              <span>First name</span>
              <input value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} required />
            </label>
            <label>
              <span>Last name</span>
              <input value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} required />
            </label>
          </div>
          <div className="form-grid-2">
            <label>
              <span>Age</span>
              <input value={form.age} onChange={(event) => setForm((current) => ({ ...current, age: event.target.value }))} type="number" min="1" required={!isOrg} />
            </label>
            <label>
              <span>Roll number</span>
              <input value={form.roll_no} onChange={(event) => setForm((current) => ({ ...current, roll_no: event.target.value }))} />
            </label>
          </div>
          {(isSuper || isOrg) ? (
            <label>
              <span>Campus</span>
              <select value={form.school_id} onChange={(event) => setForm((current) => ({ ...current, school_id: event.target.value, class_id: '', section_id: '' }))} required>
                <option value="">Select campus</option>
                {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
              </select>
            </label>
          ) : null}
          <div className="form-grid-2">
            <label>
              <span>Class</span>
              <select value={form.class_id} onChange={(event) => setForm((current) => ({ ...current, class_id: event.target.value, section_id: '' }))} required>
                <option value="">Select class</option>
                {classOptions.map((item) => <option key={item.id} value={item.id}>{item.class_name}</option>)}
              </select>
            </label>
            <label>
              <span>Section</span>
              <select value={form.section_id} onChange={(event) => setForm((current) => ({ ...current, section_id: event.target.value }))} required>
                <option value="">Select section</option>
                {sectionOptions.map((item) => <option key={item.id} value={item.id}>{item.section_name}</option>)}
              </select>
            </label>
          </div>
          <div className="button-row">
            <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : form.id ? 'Update Student' : 'Create Student'}</button>
            {form.id ? <button type="button" className="ghost-button" onClick={reset}>Cancel</button> : null}
          </div>
        </form>
      </section>
    </div>
  );
}

export function PortalClassesPage({ session, request }) {
  const role = session.user.role;
  const isSuper = role === 'super_admin';
  const isOrg = role === 'org_admin';
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [campusFilter, setCampusFilter] = useState('');
  const [message, setMessage] = useState('');
  const [classForm, setClassForm] = useState({ id: null, class_name: '', school_id: '' });
  const [selectedClass, setSelectedClass] = useState(null);
  const [sectionForm, setSectionForm] = useState({ id: null, section_name: '' });
  const [saving, setSaving] = useState(false);

  const { loading, error, data, reload } = useRemoteResource(async () => {
    if (isSuper) {
      const [organizations, schools] = await Promise.all([
        request('GET', '/super-admin/organizations'),
        request('GET', '/super-admin/schools'),
      ]);
      const filteredCampuses = safeArray(schools).filter((campus) => !orgFilter || String(campus.org_id) === String(orgFilter));
      const campusesToLoad = campusFilter ? filteredCampuses.filter((campus) => String(campus.id) === String(campusFilter)) : filteredCampuses;
      const classes = campusesToLoad.length
        ? (await Promise.all(campusesToLoad.map((campus) => request('GET', `/super-admin/schools/${campus.id}/classes`).catch(() => [])))).flat()
        : [];
      return { organizations: safeArray(organizations), campuses: filteredCampuses, classes };
    }
    if (isOrg) {
      const [campuses, classes] = await Promise.all([
        request('GET', '/org-admin/campuses'),
        request('GET', '/org-admin/classes', { params: campusFilter ? { campus_id: campusFilter } : {} }),
      ]);
      return { organizations: [], campuses: safeArray(campuses), classes: safeArray(classes) };
    }
    const classes = await request('GET', '/admin/classes');
    return { organizations: [], campuses: [], classes: safeArray(classes) };
  }, [request, role, orgFilter, campusFilter]);

  const organizations = data?.organizations || [];
  const campuses = data?.campuses || [];
  const classImportParams = {
    ...((isSuper || isOrg) && campusFilter ? { campus_id: campusFilter } : {}),
  };
  const showScopedClassImport = !(isSuper || isOrg) || !!campusFilter;
  const classes = safeArray(data?.classes)
    .filter((item) => `${item.class_name || ''} ${item.school_name || ''} ${item.campus_name || ''}`.toLowerCase().includes(search.toLowerCase()))
    .map((item) => ({ ...item, campus: item.campus_name || item.school_name || '-', section_count: safeArray(item.sections).length }));

  const loadClassDetails = useCallback(async (item) => {
    if (!item) {
      setSelectedClass(null);
      return;
    }
    const endpoint = isSuper
      ? `/super-admin/schools/${item.school_id || campusFilter}/classes/${item.id}`
      : isOrg
        ? `/org-admin/classes/${item.id}`
        : `/admin/classes/${item.id}`;
    try {
      const data = await request('GET', endpoint);
      setSelectedClass(data);
    } catch {
      setSelectedClass(item);
    }
  }, [request, isSuper, isOrg, campusFilter]);

  const resetClass = () => setClassForm({ id: null, class_name: '', school_id: '' });
  const resetSection = () => setSectionForm({ id: null, section_name: '' });

  const saveClass = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const payload = { class_name: classForm.class_name.trim(), ...(isOrg || isSuper ? { school_id: Number(classForm.school_id) } : {}) };
      if (isSuper) {
        if (classForm.id) await request('PUT', `/super-admin/schools/${classForm.school_id}/classes/${classForm.id}`, { data: payload });
        else await request('POST', `/super-admin/schools/${classForm.school_id}/classes`, { data: payload });
      } else if (isOrg) {
        if (classForm.id) await request('PUT', `/org-admin/classes/${classForm.id}`, { data: { class_name: classForm.class_name.trim() } });
        else await request('POST', '/org-admin/classes', { data: payload });
      } else if (classForm.id) {
        await request('PUT', `/admin/classes/${classForm.id}`, { data: { class_name: classForm.class_name.trim() } });
      } else {
        await request('POST', '/admin/classes', { data: { class_name: classForm.class_name.trim() } });
      }
      await reload();
      resetClass();
      setMessage(classForm.id ? 'Class updated.' : 'Class created.');
    } catch (err) {
      setMessage(err.message || 'Could not save class.');
    } finally {
      setSaving(false);
    }
  };

  const deleteClass = async (item) => {
    const path = isSuper
      ? `/super-admin/schools/${item.school_id || campusFilter}/classes/${item.id}`
      : isOrg
        ? `/org-admin/classes/${item.id}`
        : `/admin/classes/${item.id}`;
    try {
      const didArchive = isSuper
        ? (window.confirm(`Archive class "${item.class_name}"? Linked history will be preserved.`) ? (await request('DELETE', path), true) : false)
        : await archiveWithImpact({
            request,
            impactPath: `${path}/delete-impact`,
            deletePath: path,
            entityLabel: 'class',
            fallbackMessage: `Archive class "${item.class_name}"?`,
            onBlocked: (text) => setMessage(text),
          });
      if (!didArchive) return;
      if (selectedClass?.id === item.id) setSelectedClass(null);
      await reload();
    } catch (err) {
      setMessage(err.message || 'Could not archive class.');
    }
  };

  const saveSection = async (event) => {
    event.preventDefault();
    if (!selectedClass) return;
    setSaving(true);
    setMessage('');
    try {
      if (sectionForm.id) {
        const path = isSuper
          ? `/super-admin/schools/${selectedClass.school_id || campusFilter}/sections/${sectionForm.id}`
          : isOrg
            ? `/org-admin/sections/${sectionForm.id}`
            : `/admin/sections/${sectionForm.id}`;
        await request('PUT', path, { data: { section_name: sectionForm.section_name.trim() } });
      } else {
        const path = isSuper
          ? `/super-admin/schools/${selectedClass.school_id || campusFilter}/classes/${selectedClass.id}/sections`
          : isOrg
            ? '/org-admin/sections'
            : `/admin/classes/${selectedClass.id}/sections`;
        await request('POST', path, { data: isOrg ? { class_id: selectedClass.id, section_name: sectionForm.section_name.trim() } : { section_name: sectionForm.section_name.trim() } });
      }
      await loadClassDetails(selectedClass);
      await reload();
      resetSection();
      setMessage(sectionForm.id ? 'Section updated.' : 'Section created.');
    } catch (err) {
      setMessage(err.message || 'Could not save section.');
    } finally {
      setSaving(false);
    }
  };

  const deleteSection = async (item) => {
    if (!selectedClass) return;
    const path = isSuper
      ? `/super-admin/schools/${selectedClass.school_id || campusFilter}/sections/${item.id}`
      : isOrg
        ? `/org-admin/sections/${item.id}`
        : `/admin/sections/${item.id}`;
    if (!window.confirm(`Delete section "${item.section_name}"?`)) return;
    try {
      await request('DELETE', path);
      await loadClassDetails(selectedClass);
      await reload();
    } catch (err) {
      setMessage(err.message || 'Could not delete section.');
    }
  };

  const bulkDeleteClasses = async (selectedRows, clearSelection) => {
    await runBulkDelete({
      items: selectedRows,
      label: 'classes',
      clearSelection,
      onDone: reload,
      onMessage: setMessage,
      deleter: (item) => request('DELETE', isSuper ? `/super-admin/schools/${item.school_id || campusFilter}/classes/${item.id}` : isOrg ? `/org-admin/classes/${item.id}` : `/admin/classes/${item.id}`),
    });
    if (selectedClass && selectedRows.some((item) => Number(item.id) === Number(selectedClass.id))) {
      setSelectedClass(null);
    }
  };

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro title="Classes and Sections" description="Desktop class management includes class CRUD plus nested section maintenance for all three admin roles." />
        <div className="toolbar toolbar-wrap">
          {isSuper ? (
            <select value={orgFilter} onChange={(event) => { setOrgFilter(event.target.value); setCampusFilter(''); setSelectedClass(null); }}>
              <option value="">All organizations</option>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          ) : null}
          {(isSuper || isOrg) ? (
            <select value={campusFilter} onChange={(event) => { setCampusFilter(event.target.value); setSelectedClass(null); }}>
              <option value="">All campuses</option>
              {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
          ) : null}
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search classes..." />
        </div>
        {showScopedClassImport ? (
          <ImportExportToolbar
            session={session}
            entity="classes"
            filenamePrefix="classes"
            params={classImportParams}
            onDone={reload}
            onMessage={setMessage}
          />
        ) : (
          <Banner message="Select a campus first to import or export classes." />
        )}
        <Banner message={error} tone="danger" />
        <Banner message={message} />
        {loading ? <LoadingCard /> : (
          <DataTable
            selectable
            bulkActions={({ selectedRows, clearSelection }) => (
              <button type="button" className="secondary-button" onClick={() => bulkDeleteClasses(selectedRows, clearSelection)}>Archive Selected</button>
            )}
            columns={[
              { key: 'class_name', label: 'Class' },
              { key: 'campus', label: 'Campus' },
              { key: 'section_count', label: 'Sections' },
            ]}
            rows={classes}
            actions={(item) => (
              <TableActionMenu
                label="Class actions"
                items={[
                  { label: 'Edit', onClick: () => { setClassForm({ id: item.id, class_name: item.class_name || '', school_id: item.school_id ? String(item.school_id) : '' }); loadClassDetails(item); } },
                  { label: 'Sections', onClick: () => loadClassDetails(item) },
                  { label: 'Archive', onClick: () => deleteClass(item), tone: 'danger' },
                ]}
              />
            )}
            emptyMessage="No classes found for the current scope."
          />
        )}
      </section>
      <section className="panel accent-panel">
        <SectionIntro title={classForm.id ? 'Edit class' : 'New class'} description="The class form mirrors the mobile manager, and the section editor below uses the same dedicated section endpoints." />
        <form className="stack-form" onSubmit={saveClass}>
          {(isSuper || isOrg) ? (
            <label>
              <span>Campus</span>
              <select value={classForm.school_id} onChange={(event) => setClassForm((current) => ({ ...current, school_id: event.target.value }))} required={!classForm.id}>
                <option value="">Select campus</option>
                {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
              </select>
            </label>
          ) : null}
          <label>
            <span>Class name</span>
            <input value={classForm.class_name} onChange={(event) => setClassForm((current) => ({ ...current, class_name: event.target.value }))} required />
          </label>
          <div className="button-row">
            <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : classForm.id ? 'Update Class' : 'Create Class'}</button>
            {classForm.id ? <button type="button" className="ghost-button" onClick={resetClass}>Cancel</button> : null}
          </div>
        </form>

        <div className="subsection-divider" />
        <SectionIntro title={selectedClass ? `${selectedClass.class_name} Sections` : 'Sections'} description="Choose a class on the left to create, edit, or delete its sections." />
        {selectedClass ? (
          <>
            <DataTable
              columns={[{ key: 'section_name', label: 'Section' }]}
              rows={safeArray(selectedClass.sections || [])}
              actions={(item) => (
                <TableActionMenu
                  label="Section actions"
                  items={[
                    { label: 'Edit', onClick: () => setSectionForm({ id: item.id, section_name: item.section_name || '' }) },
                    { label: 'Delete', onClick: () => deleteSection(item), tone: 'danger' },
                  ]}
                />
              )}
              emptyMessage="No sections created yet."
            />
            <form className="stack-form stack-form-compact" onSubmit={saveSection}>
              <label>
                <span>Section name</span>
                <input value={sectionForm.section_name} onChange={(event) => setSectionForm((current) => ({ ...current, section_name: event.target.value }))} required />
              </label>
              <div className="button-row">
                <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : sectionForm.id ? 'Update Section' : 'Create Section'}</button>
                {sectionForm.id ? <button type="button" className="ghost-button" onClick={resetSection}>Cancel</button> : null}
              </div>
            </form>
          </>
        ) : <EmptyState message="Select a class to manage sections." />}
      </section>
    </div>
  );
}

export function PortalSubjectsPage({ session, request }) {
  const role = session.user.role;
  const isSuper = role === 'super_admin';
  const isOrg = role === 'org_admin';
  const [orgId, setOrgId] = useState('');
  const [campusId, setCampusId] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ id: null, name: '' });
  const [saving, setSaving] = useState(false);

  const { loading, error, data, reload } = useRemoteResource(async () => {
    if (isSuper) {
      const [organizations, campuses] = await Promise.all([
        request('GET', '/super-admin/organizations'),
        request('GET', '/super-admin/schools'),
      ]);
      return { organizations: safeArray(organizations), campuses: safeArray(campuses), subjects: [] };
    }
    if (isOrg) {
      const campuses = await request('GET', '/org-admin/campuses');
      return { organizations: [], campuses: safeArray(campuses), subjects: [] };
    }
    const subjects = await request('GET', '/subjects');
    return { organizations: [], campuses: [], subjects: safeArray(subjects) };
  }, [request, isSuper, isOrg]);

  const organizations = data?.organizations || [];
  const scopedCampuses = safeArray(data?.campuses).filter((item) => !orgId || String(item.org_id) === String(orgId));
  const subjectImportParams = {
    ...(campusId ? { campus_id: campusId } : {}),
  };
  const [subjectsState, setSubjectsState] = useState({ loading: role !== 'admin', error: '', items: role === 'admin' ? safeArray(data?.subjects) : [] });

  useEffect(() => {
    if (role === 'admin') {
      setSubjectsState({ loading: false, error: '', items: safeArray(data?.subjects) });
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
      setSubjectsState({ loading: false, error: '', items: safeArray(items) });
    } catch (err) {
      setSubjectsState({ loading: false, error: err.message || 'Could not load subjects.', items: [] });
    }
  }, [role, campusId, isSuper, request]);

  useEffect(() => {
    loadScopedSubjects();
  }, [loadScopedSubjects]);

  const items = safeArray(subjectsState.items).filter((item) => String(item.name || '').toLowerCase().includes(search.toLowerCase()));

  const saveSubject = async (event) => {
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
      setForm({ id: null, name: '' });
      if (role === 'admin') await reload(); else await loadScopedSubjects();
      setMessage(form.id ? 'Subject updated.' : 'Subject created.');
    } catch (err) {
      setMessage(err.message || 'Could not save subject.');
    } finally {
      setSaving(false);
    }
  };

  const deleteSubject = async (item) => {
    try {
      if (isSuper) {
        const basePath = `/super-admin/schools/${campusId}/subjects/${item.id}`;
        const didArchive = await archiveWithImpact({
          request,
          impactPath: `${basePath}/delete-impact`,
          deletePath: basePath,
          entityLabel: 'subject',
          fallbackMessage: `Archive subject "${item.name}"?`,
          onBlocked: (text) => setMessage(text),
        });
        if (!didArchive) return;
      } else if (isOrg) {
        const basePath = `/org-admin/subjects/${item.id}`;
        const didArchive = await archiveWithImpact({
          request,
          impactPath: `${basePath}/delete-impact`,
          deletePath: basePath,
          entityLabel: 'subject',
          fallbackMessage: `Archive subject "${item.name}"?`,
          onBlocked: (text) => setMessage(text),
        });
        if (!didArchive) return;
      } else {
        const basePath = `/subjects/${item.id}`;
        const didArchive = await archiveWithImpact({
          request,
          impactPath: `${basePath}/delete-impact`,
          deletePath: basePath,
          entityLabel: 'subject',
          fallbackMessage: `Archive subject "${item.name}"?`,
          onBlocked: (text) => setMessage(text),
        });
        if (!didArchive) return;
      }
      if (role === 'admin') await reload(); else await loadScopedSubjects();
    } catch (err) {
      setMessage(err.message || 'Could not archive subject.');
    }
  };

  const bulkDeleteSubjects = async (selectedRows, clearSelection) => {
    await runBulkDelete({
      items: selectedRows,
      label: 'subjects',
      clearSelection,
      onDone: role === 'admin' ? reload : loadScopedSubjects,
      onMessage: setMessage,
      deleter: (item) => request('DELETE', isSuper ? `/super-admin/schools/${campusId}/subjects/${item.id}` : isOrg ? `/org-admin/subjects/${item.id}` : `/subjects/${item.id}`),
    });
  };

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro title="Subjects" description="Desktop subject CRUD stays aligned with the mobile subject manager, including super-admin and org-admin campus scoping." />
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
              {scopedCampuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
          ) : null}
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search subjects..." />
        </div>
        <ImportExportToolbar
          session={session}
          entity="subjects"
          filenamePrefix="subjects"
          params={subjectImportParams}
          disabled={(isSuper || isOrg) && !campusId}
          disabledMessage="Select a campus to use subject template, import, and export."
          onDone={role === 'admin' ? reload : loadScopedSubjects}
          onMessage={setMessage}
        />
        <Banner message={error} tone="danger" />
        <Banner message={subjectsState.error} tone="danger" />
        <Banner message={message} />
        {(loading || subjectsState.loading) ? <LoadingCard /> : (
          <DataTable
            selectable
            bulkActions={({ selectedRows, clearSelection }) => (
              <button type="button" className="secondary-button" onClick={() => bulkDeleteSubjects(selectedRows, clearSelection)}>Archive Selected</button>
            )}
            columns={[{ key: 'name', label: 'Subject' }]}
            rows={items}
            actions={(item) => (
              <TableActionMenu
                label="Subject actions"
                items={[
                  { label: 'Edit', onClick: () => setForm({ id: item.id, name: item.name || '' }) },
                  { label: 'Archive', onClick: () => deleteSubject(item), tone: 'danger' },
                ]}
              />
            )}
            emptyMessage={(isSuper || isOrg) && !campusId ? 'Choose a campus to manage subjects.' : 'No subjects found.'}
          />
        )}
      </section>
      <section className="panel accent-panel">
        <SectionIntro title={form.id ? 'Edit subject' : 'New subject'} description="The subject page preserves the same role-specific subject endpoints already in production." />
        <form className="stack-form" onSubmit={saveSubject}>
          <label>
            <span>Subject name</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
          </label>
          <div className="button-row">
            <button className="primary-button" disabled={saving || ((isSuper || isOrg) && !campusId)}>{saving ? 'Saving...' : form.id ? 'Update Subject' : 'Create Subject'}</button>
            {form.id ? <button type="button" className="ghost-button" onClick={() => setForm({ id: null, name: '' })}>Cancel</button> : null}
          </div>
        </form>
      </section>
    </div>
  );
}

export function PortalParentsPage({ session, request }) {
  const role = session.user.role;
  const isSuper = role === 'super_admin';
  const isOrg = role === 'org_admin';
  const childManagerRef = useRef(null);
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [campusFilter, setCampusFilter] = useState('');
  const [message, setMessage] = useState('');
  const [panelMode, setPanelMode] = useState('form');
  const [form, setForm] = useState(defaultParentForm());
  const [selectedCampuses, setSelectedCampuses] = useState([]);
  const [saving, setSaving] = useState(false);
  const [selectedParent, setSelectedParent] = useState(null);
  const [children, setChildren] = useState([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [childCampusId, setChildCampusId] = useState('');
  const [availableClasses, setAvailableClasses] = useState([]);
  const [availableSections, setAvailableSections] = useState([]);
  const [availableStudents, setAvailableStudents] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');

  const { loading, error, data, reload } = useRemoteResource(async () => {
    if (isSuper) {
      const [schools, organizations] = await Promise.all([
        request('GET', '/super-admin/schools'),
        request('GET', '/super-admin/organizations'),
      ]);
      const filteredCampuses = safeArray(schools).filter((campus) => !orgFilter || String(campus.org_id) === String(orgFilter));
      if (campusFilter) {
        const data = await request('GET', `/super-admin/schools/${campusFilter}/parents`).catch(() => []);
        return { organizations: safeArray(organizations), campuses: filteredCampuses, parents: safeArray(data?.parents || data) };
      }
      if (orgFilter) {
        const parents = await request('GET', `/super-admin/organizations/${orgFilter}/parents`).catch(() => []);
        return { organizations: safeArray(organizations), campuses: filteredCampuses, parents: safeArray(parents) };
      }
      const responses = await Promise.all(filteredCampuses.map((campus) => request('GET', `/super-admin/schools/${campus.id}/parents`).catch(() => [])));
      const merged = responses.flatMap((entry) => safeArray(entry?.parents || entry));
      return { organizations: safeArray(organizations), campuses: filteredCampuses, parents: merged };
    }
    if (isOrg) {
      const [campuses, parents] = await Promise.all([
        request('GET', '/org-admin/campuses'),
        request('GET', '/org-admin/parents', { params: campusFilter ? { campus_id: campusFilter } : {} }),
      ]);
      return { organizations: [], campuses: safeArray(campuses), parents: safeArray(parents) };
    }
    const parents = await request('GET', '/admin/parents');
    return { organizations: [], campuses: [], parents: safeArray(parents?.parents || parents) };
  }, [request, role, orgFilter, campusFilter]);

  const organizations = data?.organizations || [];
  const campuses = data?.campuses || [];
  const parentImportParams = {
    ...((isSuper || isOrg) && campusFilter ? { campus_id: campusFilter } : {}),
  };
  const showParentImport = !isSuper || !!campusFilter;
  const parents = safeArray(data?.parents)
    .filter((item) => `${item.email || ''} ${item.first_name || ''} ${item.last_name || ''} ${item.phone || ''}`.toLowerCase().includes(search.toLowerCase()))
    .map((item) => ({
      ...item,
      display_name: fullName(item),
      display_phone: formatPhoneForForm(item.phone),
      campus_summary: safeArray(item.campus_names).join(', ') || item.school_name || '-',
    }));

  const reset = () => {
    setForm(defaultParentForm());
    setSelectedCampuses([]);
    setPanelMode('form');
    setSelectedParent(null);
    setChildren([]);
    setChildCampusId('');
    setAvailableClasses([]);
    setAvailableSections([]);
    setAvailableStudents([]);
    setSelectedClassId('');
    setSelectedSectionId('');
  };

  const toggleCampus = (campusId) => {
    setSelectedCampuses((current) => current.includes(campusId) ? current.filter((item) => item !== campusId) : [...current, campusId]);
  };

  const startEdit = (item) => {
    setPanelMode('form');
    setForm({
      id: item.id,
      email: item.email || '',
      password: '',
      first_name: item.first_name || '',
      last_name: item.last_name || '',
      phone: formatPhoneForForm(item.phone),
      school_id: item.school_id ? String(item.school_id) : '',
    });
    const campusIds = safeArray(item.campus_ids).map((id) => Number(id)).filter(Boolean);
    setSelectedCampuses(campusIds.length ? campusIds : item.school_id ? [Number(item.school_id)] : []);
  };

  const loadChildClasses = useCallback(async (schoolId) => {
    if (isOrg) return;
    if (isSuper) {
      if (!schoolId) {
        setAvailableClasses([]);
        return;
      }
      const classes = await request('GET', `/super-admin/schools/${schoolId}/classes`).catch(() => []);
      setAvailableClasses(safeArray(classes));
      return;
    }
    const classes = await request('GET', '/classes').catch(() => []);
    setAvailableClasses(safeArray(classes));
  }, [request, isSuper, isOrg]);

  const saveParent = async (event) => {
    event.preventDefault();
    if (!form.email.trim()) {
      setMessage('Email is required.');
      return;
    }
    if (!isValidEmail(form.email)) {
      setMessage('Please enter a valid email address (e.g. parent@example.com).');
      return;
    }
    if (!form.phone.trim()) {
      setMessage('Phone is required.');
      return;
    }
    if (!isValidPkPhone(form.phone)) {
      setMessage('Phone must be 03XXXXXXXXX or +92XXXXXXXXXX format.');
      return;
    }
    if (!form.id && !form.password) {
      setMessage('Password is required for new parents.');
      return;
    }
    if (!form.id && form.password && !hasMinPasswordLength(form.password)) {
      setMessage('Password must be at least 6 characters for new parents.');
      return;
    }
    if ((isSuper || isOrg) && !selectedCampuses.length) {
      setMessage('Please select at least one campus.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      if (isSuper) {
        const schoolId = selectedCampuses[0] || Number(form.school_id || campusFilter);
        const payload = {
          email: form.email.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone: form.phone.trim(),
          campus_ids: selectedCampuses,
        };
        if (form.id) await request('PUT', `/super-admin/schools/${schoolId}/parents/${form.id}`, { data: payload });
        else await request('POST', `/super-admin/schools/${schoolId}/parents`, { data: { ...payload, password: form.password } });
      } else if (isOrg) {
        const payload = {
          email: form.email.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone: form.phone.trim(),
          campus_ids: selectedCampuses,
        };
        if (form.id) await request('PUT', `/org-admin/parents/${form.id}`, { data: payload });
        else await request('POST', '/org-admin/parents', { data: { ...payload, password: form.password } });
      } else if (form.id) {
        const payload = {
          email: form.email.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone: form.phone.trim(),
          ...(form.password ? { password: form.password } : {}),
        };
        await request('PUT', `/admin/parents/${form.id}`, { data: payload });
      } else {
        await request('POST', '/admin/parents', { data: { email: form.email.trim(), password: form.password, first_name: form.first_name.trim(), last_name: form.last_name.trim(), phone: form.phone.trim() } });
      }
      await reload();
      reset();
      setMessage(form.id ? 'Parent updated.' : 'Parent created.');
    } catch (err) {
      setMessage(err.message || 'Could not save parent.');
    } finally {
      setSaving(false);
    }
  };

  const deleteParent = async (item) => {
    const path = isSuper
      ? `/super-admin/schools/${item.school_id || campusFilter}/parents/${item.id}`
      : isOrg
        ? `/org-admin/parents/${item.id}`
        : `/admin/parents/${item.id}`;
    if (!window.confirm(`Delete parent "${item.email}"?`)) return;
    try {
      await request('DELETE', path);
      await reload();
    } catch (err) {
      setMessage(err.message || 'Could not delete parent.');
    }
  };

  const bulkDeleteParents = async (selectedRows, clearSelection) => {
    await runBulkDelete({
      items: selectedRows,
      label: 'parents',
      clearSelection,
      onDone: reload,
      onMessage: setMessage,
      deleter: (item) => request('DELETE', isSuper ? `/super-admin/schools/${item.school_id || campusFilter}/parents/${item.id}` : isOrg ? `/org-admin/parents/${item.id}` : `/admin/parents/${item.id}`),
    });
  };

  const linkExistingParent = async () => {
    const email = window.prompt('Enter the parent email to link into this school');
    if (!email) return;
    try {
      await request('POST', '/admin/parents/link-existing', { data: { email: email.trim().toLowerCase() } });
      await reload();
      setMessage('Existing parent linked to this school.');
    } catch (err) {
      setMessage(err.message || 'Could not link parent.');
    }
  };

  const loadChildren = useCallback(async (parent) => {
    if (!parent || isOrg) return;
    setChildrenLoading(true);
    setSelectedParent(parent);
    setPanelMode('children');
    setForm(defaultParentForm());
    try {
      const childPath = isSuper ? `/super-admin/parents/${parent.id}/children` : `/admin/parents/${parent.id}/children`;
      const data = await request('GET', childPath);
      setChildren(safeArray(data?.children || data));
      const defaultCampus = parent.school_id || campusFilter || '';
      setChildCampusId(defaultCampus ? String(defaultCampus) : '');
      await loadChildClasses(defaultCampus);
      setAvailableSections([]);
      setAvailableStudents([]);
      setSelectedClassId('');
      setSelectedSectionId('');
    } catch (err) {
      setMessage(err.message || 'Could not load linked children.');
    } finally {
      setChildrenLoading(false);
    }
  }, [request, isSuper, isOrg, campusFilter, loadChildClasses]);

  useEffect(() => {
    if (!selectedParent || panelMode !== 'children') return;
    const node = childManagerRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedParent, panelMode]);

  useEffect(() => {
    if (!selectedParent || panelMode !== 'children' || isOrg) return;
    loadChildClasses(childCampusId);
    setSelectedClassId('');
    setSelectedSectionId('');
    setAvailableSections([]);
    setAvailableStudents([]);
  }, [childCampusId, selectedParent, panelMode, isOrg, loadChildClasses]);

  useEffect(() => {
    const classItem = availableClasses.find((item) => String(item.id) === String(selectedClassId));
    setAvailableSections(safeArray(classItem?.sections || []));
    setSelectedSectionId('');
    setAvailableStudents([]);
  }, [availableClasses, selectedClassId]);

  useEffect(() => {
    const run = async () => {
      if (!selectedClassId || !selectedSectionId || !selectedParent || isOrg) return;
      try {
        const data = isSuper
          ? await request('GET', `/super-admin/schools/${childCampusId}/students`, { params: { class_id: selectedClassId, section_id: selectedSectionId } })
          : await request('GET', '/admin/students', { params: { class_id: selectedClassId, section_id: selectedSectionId } });
        setAvailableStudents(safeArray(data));
      } catch {
        setAvailableStudents([]);
      }
    };
    run();
  }, [selectedClassId, selectedSectionId, selectedParent, request, isSuper, isOrg, childCampusId]);

  const linkChild = async (studentId) => {
    if (!selectedParent) return;
    try {
      const path = isSuper ? `/super-admin/parents/${selectedParent.id}/link-child` : `/admin/parents/${selectedParent.id}/link-child`;
      await request('POST', path, { data: { student_id: studentId, relationship: 'parent' } });
      await loadChildren(selectedParent);
      setMessage('Child linked to parent.');
    } catch (err) {
      setMessage(err.message || 'Could not link child.');
    }
  };

  const unlinkChild = async (studentId) => {
    if (!selectedParent) return;
    const path = isSuper ? `/super-admin/parents/${selectedParent.id}/children/${studentId}` : `/admin/parents/${selectedParent.id}/children/${studentId}`;
    if (!window.confirm('Unlink this child from the parent?')) return;
    try {
      await request('DELETE', path);
      await loadChildren(selectedParent);
      setMessage('Child unlinked from parent.');
    } catch (err) {
      setMessage(err.message || 'Could not unlink child.');
    }
  };

  const closeChildManager = () => {
    setPanelMode('form');
    setSelectedParent(null);
    setChildren([]);
    setAvailableClasses([]);
    setAvailableSections([]);
    setAvailableStudents([]);
    setSelectedClassId('');
    setSelectedSectionId('');
  };

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro title="Parents" description="Desktop parent management includes create, update, delete, multi-campus assignment, and child linking where the backend supports it." />
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
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search parents..." />
          {!isSuper && !isOrg ? <button className="secondary-button" onClick={linkExistingParent}>Link Existing Parent</button> : null}
        </div>
        {showParentImport ? (
          <ImportExportToolbar
            session={session}
            entity="parents"
            filenamePrefix="parents"
            params={parentImportParams}
            onDone={reload}
            onMessage={setMessage}
          />
        ) : (
          <Banner message="Select a campus first to import or export parents." />
        )}
        <Banner message={error} tone="danger" />
        <Banner message={message} />
        {loading ? <LoadingCard /> : (
          <DataTable
            selectable
            bulkActions={({ selectedRows, clearSelection }) => (
              <button type="button" className="secondary-button" onClick={() => bulkDeleteParents(selectedRows, clearSelection)}>Delete Selected</button>
            )}
            columns={[
              { key: 'display_name', label: 'Parent' },
              { key: 'email', label: 'Email' },
              { key: 'display_phone', label: 'Phone' },
              { key: 'campus_summary', label: 'Campuses' },
            ]}
            rows={parents}
            actions={(item) => (
              <TableActionMenu
                label="Parent actions"
                items={[
                  { label: 'Edit', onClick: () => startEdit(item) },
                  !isOrg ? { label: 'Manage Children', onClick: () => loadChildren(item) } : null,
                  { label: 'Delete', onClick: () => deleteParent(item), tone: 'danger' },
                ]}
              />
            )}
            emptyMessage="No parents found for the current scope."
          />
        )}
      </section>
      <section className="panel accent-panel" ref={childManagerRef}>
        {panelMode === 'children' && !isOrg ? (
          <>
            <SectionIntro title={selectedParent ? `Manage Children: ${selectedParent.email}` : 'Linked children'} description="Pick a class and section, then link or unlink students for the selected parent." action={<button type="button" className="ghost-button" onClick={closeChildManager}>Back to Parent Form</button>} />
            {selectedParent ? (
              childrenLoading ? <LoadingCard /> : (
                <div className="stack-form">
                  <div className="selection-banner">
                    <strong>{selectedParent.display_name || selectedParent.email}</strong>
                    <span>{selectedParent.campus_summary || selectedParent.school_name || 'Parent access scope will determine available students.'}</span>
                  </div>
                  <DataTable
                    columns={[
                      { key: 'student_name', label: 'Student' },
                      { key: 'class_name', label: 'Class' },
                      { key: 'section_name', label: 'Section' },
                    ]}
                    rows={children.map((item) => ({ ...item, student_name: item.student_name || fullName({ first_name: item.first_name, last_name: item.last_name }) }))}
                    actions={(item) => (
                      <TableActionMenu
                        label="Linked child actions"
                        items={[
                          { label: 'Unlink', onClick: () => unlinkChild(item.student_id || item.id), tone: 'danger' },
                        ]}
                      />
                    )}
                    emptyMessage="No children linked yet."
                  />
                  {isSuper ? (
                    <label>
                      <span>Campus</span>
                      <select value={childCampusId} onChange={(event) => setChildCampusId(event.target.value)}>
                        <option value="">Select campus</option>
                        {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                      </select>
                    </label>
                  ) : null}
                  <div className="form-grid-2">
                    <label>
                      <span>Class</span>
                      <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>
                        <option value="">Select class</option>
                        {availableClasses.map((item) => <option key={item.id} value={item.id}>{item.class_name}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Section</span>
                      <select value={selectedSectionId} onChange={(event) => setSelectedSectionId(event.target.value)} disabled={!selectedClassId}>
                        <option value="">Select section</option>
                        {availableSections.map((item) => <option key={item.id} value={item.id}>{item.section_name}</option>)}
                      </select>
                    </label>
                  </div>
                  <DataTable
                    columns={[
                      { key: 'display_name', label: 'Student' },
                      { key: 'roll_no', label: 'Roll No' },
                    ]}
                    rows={availableStudents.map((item) => ({ ...item, display_name: fullName(item) }))}
                    actions={(item) => (
                      <TableActionMenu
                        label="Available student actions"
                        items={[
                          { label: 'Link', onClick: () => linkChild(item.id) },
                        ]}
                      />
                    )}
                    emptyMessage={isSuper && !childCampusId ? 'Select a campus to load classes for linking.' : 'Choose class and section to load students for linking.'}
                  />
                </div>
              )
            ) : <EmptyState message="Select a parent from the table to manage linked children." />}
          </>
        ) : (
          <>
            <SectionIntro title={form.id ? 'Edit parent' : 'New parent'} description="Super admins and org admins can assign parents to multiple campuses. School admins can additionally link existing parents and manage children." />
            <form className="stack-form" onSubmit={saveParent}>
          <div className="form-grid-2">
            <label>
              <span>First name</span>
              <input value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} />
            </label>
            <label>
              <span>Last name</span>
              <input value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} />
            </label>
          </div>
          <label>
            <span>Email</span>
            <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
          </label>
          <label>
            <span>Phone</span>
            <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="03XXXXXXXXX" required />
          </label>
          {!form.id ? (
            <label>
              <span>Password</span>
              <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required />
            </label>
          ) : null}
          {(isSuper || isOrg) ? (
            <div>
              <span className="field-caption">Assigned campuses</span>
              <ChipSelect items={campuses.map((campus) => ({ value: Number(campus.id), label: campus.name }))} values={selectedCampuses} onToggle={toggleCampus} />
            </div>
          ) : null}
          <div className="button-row">
            <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : form.id ? 'Update Parent' : 'Create Parent'}</button>
            {form.id ? <button type="button" className="ghost-button" onClick={reset}>Cancel</button> : null}
          </div>
            </form>
            {!isOrg ? <EmptyState message="Choose Manage Children on a parent row to open the child-management workspace here." /> : null}
          </>
        )}
      </section>
    </div>
  );
}

export function PortalOrgAdminsPage({ session, request }) {
  const [search, setSearch] = useState('');
  const [campusFilter, setCampusFilter] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(defaultAdminForm());
  const [saving, setSaving] = useState(false);

  const { loading, error, data, reload } = useRemoteResource(async () => {
    const [campuses, admins] = await Promise.all([
      request('GET', '/org-admin/campuses'),
      request('GET', '/org-admin/admins', { params: campusFilter ? { campus_id: campusFilter } : {} }),
    ]);
    return { campuses: safeArray(campuses), admins: safeArray(admins) };
  }, [request, campusFilter]);

  const campuses = data?.campuses || [];
  const admins = safeArray(data?.admins)
    .filter((item) => `${item.first_name || ''} ${item.last_name || ''} ${item.email || ''} ${item.campus_name || ''}`.toLowerCase().includes(search.toLowerCase()))
    .map((item) => ({ ...item, display_name: fullName(item) }));

  const reset = () => setForm(defaultAdminForm());

  const saveAdmin = async (event) => {
    event.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim() || !form.phone.trim()) {
      setMessage('First name, last name, email and phone are required.');
      return;
    }
    if (!isValidEmail(form.email)) {
      setMessage('Please enter a valid email address.');
      return;
    }
    if (!isValidLocalPhone(form.phone)) {
      setMessage('Phone must be in format 03XXXXXXXXX (11 digits, starts with 03, no spaces or dashes).');
      return;
    }
    if (!form.id && !form.password) {
      setMessage('Password is required for new admins.');
      return;
    }
    if (!form.id && !hasMinPasswordLength(form.password)) {
      setMessage('Password must be at least 6 characters for new admins.');
      return;
    }
    if (!form.id && !form.school_id) {
      setMessage('Please select a campus.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      };
      if (form.id) {
        await request('PUT', `/org-admin/admins/${form.id}`, { data: payload });
      } else {
        await request('POST', '/org-admin/admins', { data: { ...payload, password: form.password, school_id: Number(form.school_id) } });
      }
      await reload();
      reset();
      setMessage(form.id ? 'Campus admin updated.' : 'Campus admin created.');
    } catch (err) {
      setMessage(err.message || 'Could not save campus admin.');
    } finally {
      setSaving(false);
    }
  };

  const deleteAdmin = async (item) => {
    if (!window.confirm(`Delete campus admin "${fullName(item)}"?`)) return;
    try {
      await request('DELETE', `/org-admin/admins/${item.id}`);
      await reload();
    } catch (err) {
      setMessage(err.message || 'Could not delete campus admin.');
    }
  };

  const resetPassword = async (item) => {
    const password = window.prompt(`Enter a new password for ${fullName(item)}`);
    if (!password) return;
    if (!hasMinPasswordLength(password)) {
      setMessage('Password must be at least 6 characters.');
      return;
    }
    try {
      await request('POST', `/org-admin/admins/${item.id}/reset-password`, { data: { new_password: password } });
      setMessage('Campus admin password reset.');
    } catch (err) {
      setMessage(err.message || 'Could not reset password.');
    }
  };

  const bulkDeleteAdmins = async (selectedRows, clearSelection) => {
    await runBulkDelete({
      items: selectedRows,
      label: 'campus admins',
      clearSelection,
      onDone: reload,
      onMessage: setMessage,
      deleter: (item) => request('DELETE', `/org-admin/admins/${item.id}`),
    });
  };

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro title="Campus Admins" description="Organization admins can manage school-admin accounts across their campuses from the same endpoints already used on mobile." />
        <div className="toolbar toolbar-wrap">
          <select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
            <option value="">All campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search campus admins..." />
        </div>
        <ImportExportToolbar
          session={session}
          entity="admins"
          filenamePrefix="campus_admins"
          params={campusFilter ? { campus_id: campusFilter } : {}}
          onDone={reload}
          onMessage={setMessage}
        />
        <Banner message={error} tone="danger" />
        <Banner message={message} />
        {loading ? <LoadingCard /> : (
          <DataTable
            selectable
            bulkActions={({ selectedRows, clearSelection }) => (
              <button type="button" className="secondary-button" onClick={() => bulkDeleteAdmins(selectedRows, clearSelection)}>Delete Selected</button>
            )}
            columns={[
              { key: 'display_name', label: 'Name' },
              { key: 'email', label: 'Email' },
              { key: 'campus_name', label: 'Campus' },
            ]}
            rows={admins}
            actions={(item) => (
              <TableActionMenu
                label="Campus admin actions"
                items={[
                  { label: 'Edit', onClick: () => setForm({ id: item.id, first_name: item.first_name || '', last_name: item.last_name || '', email: item.email || '', password: '', phone: formatPhoneForForm(item.phone), school_id: item.school_id ? String(item.school_id) : '' }) },
                  { label: 'Reset Password', onClick: () => resetPassword(item) },
                  { label: 'Delete', onClick: () => deleteAdmin(item), tone: 'danger' },
                ]}
              />
            )}
            emptyMessage="No campus admins found."
          />
        )}
      </section>
      <section className="panel accent-panel">
        <SectionIntro title={form.id ? 'Edit campus admin' : 'New campus admin'} description="New campus admins require a campus assignment and password. Existing ones can be updated and reset here." />
        <form className="stack-form" onSubmit={saveAdmin}>
          <div className="form-grid-2">
            <label>
              <span>First name</span>
              <input value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} required />
            </label>
            <label>
              <span>Last name</span>
              <input value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} required />
            </label>
          </div>
          <div className="form-grid-2">
            <label>
              <span>Email</span>
              <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
            </label>
            <label>
              <span>Phone</span>
              <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="03XXXXXXXXX" required />
            </label>
          </div>
          {!form.id ? (
            <>
              <label>
                <span>Password</span>
                <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required />
              </label>
              <label>
                <span>Campus</span>
                <select value={form.school_id} onChange={(event) => setForm((current) => ({ ...current, school_id: event.target.value }))} required>
                  <option value="">Select campus</option>
                  {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                </select>
              </label>
            </>
          ) : null}
          <div className="button-row">
            <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : form.id ? 'Update Campus Admin' : 'Create Campus Admin'}</button>
            {form.id ? <button type="button" className="ghost-button" onClick={reset}>Cancel</button> : null}
          </div>
        </form>
      </section>
    </div>
  );
}

export function PortalNotificationsPage({ session, request }) {
  const isOrg = session.user.role === 'org_admin';
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [targetType, setTargetType] = useState(isOrg ? 'org' : 'school');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [category, setCategory] = useState('general');
  const [title, setTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [selectedCampus, setSelectedCampus] = useState('');
  const [selectedCampuses, setSelectedCampuses] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(!isOrg);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isOrg) {
      request('GET', '/org-admin/campuses').then((data) => setCampuses(safeArray(data))).catch(() => setCampuses([]));
      return;
    }
    request('GET', '/lectures/classes').then((data) => setClasses(safeArray(data))).catch(() => setClasses([]));
    request('GET', '/notifications/sent').then((data) => setHistory(safeArray(data))).catch(() => setHistory([])).finally(() => setHistoryLoading(false));
  }, [request, isOrg]);

  useEffect(() => {
    const classItem = classes.find((item) => String(item.id) === String(classId));
    setSections(safeArray(classItem?.sections || []));
    setSectionId('');
    setStudentId('');
    setStudents([]);
  }, [classes, classId]);

  useEffect(() => {
    const run = async () => {
      if (isOrg || targetType !== 'student' || !classId) return;
      try {
        const data = await request('GET', '/notifications/students', { params: { class_id: classId, ...(sectionId ? { section_id: sectionId } : {}) } });
        setStudents(safeArray(data));
      } catch {
        setStudents([]);
      }
    };
    run();
  }, [request, isOrg, targetType, classId, sectionId]);

  const send = async (event) => {
    event.preventDefault();
    if (!title.trim() || !messageBody.trim()) {
      setMessage('Title and message are required.');
      return;
    }
    if (isOrg && targetType === 'campus' && !selectedCampus) {
      setMessage('Please select a campus.');
      return;
    }
    if (!isOrg && (targetType === 'class' || targetType === 'section' || targetType === 'student') && !classId) {
      setMessage('Select a class.');
      return;
    }
    if (!isOrg && targetType === 'section' && !sectionId) {
      setMessage('Select a section.');
      return;
    }
    if (!isOrg && targetType === 'student' && !studentId) {
      setMessage('Select a student.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      if (isOrg) {
        const payload = {
          title: title.trim(),
          body: messageBody.trim(),
          target_type: targetType,
          ...(targetType === 'campus' ? { campus_id: Number(selectedCampus) } : {}),
          ...(targetType === 'staff' ? { campus_ids: selectedCampuses.length ? selectedCampuses : null } : {}),
        };
        const result = await request('POST', '/org-admin/notifications', { data: payload });
        setMessage(`Notification sent to ${result?.count ?? 0} recipient(s).`);
      } else {
        const payload = {
          target_type: targetType,
          class_id: classId || undefined,
          section_id: sectionId || undefined,
          student_id: studentId || undefined,
          category,
          title: title.trim(),
          message: messageBody.trim(),
        };
        await request('POST', '/notifications', { data: payload });
        const sent = await request('GET', '/notifications/sent').catch(() => []);
        setHistory(safeArray(sent));
        setMessage('Notification sent successfully.');
      }
      setTitle('');
      setMessageBody('');
      setClassId('');
      setSectionId('');
      setStudentId('');
      setSelectedCampus('');
      setSelectedCampuses([]);
    } catch (err) {
      setMessage(err.message || 'Could not send notification.');
    } finally {
      setSaving(false);
    }
  };

  const deleteNotification = async (item) => {
    if (!window.confirm('Delete this notification?')) return;
    try {
      await request('DELETE', `/notifications/${item.id}`);
      setHistory((current) => current.filter((entry) => entry.id !== item.id));
    } catch (err) {
      setMessage(err.message || 'Could not delete notification.');
    }
  };

  const editNotification = async (item) => {
    const nextTitle = window.prompt('Edit notification title', item.title || '');
    if (nextTitle === null) return;
    const nextMessage = window.prompt('Edit notification message', item.message || '');
    if (nextMessage === null) return;
    if (!nextTitle.trim()) {
      setMessage('Title is required.');
      return;
    }
    if (!nextMessage.trim()) {
      setMessage('Message is required.');
      return;
    }
    try {
      const updated = await request('PUT', `/notifications/${item.id}`, { data: { category: item.category || 'general', title: nextTitle.trim(), message: nextMessage.trim() } });
      setHistory((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...updated } : entry));
    } catch (err) {
      setMessage(err.message || 'Could not update notification.');
    }
  };

  const toggleOrgCampus = (value) => {
    setSelectedCampuses((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  return (
    <div className={isOrg ? 'page-grid page-grid-2' : 'page-grid'}>
      <section className="panel">
        <SectionIntro title={isOrg ? 'Organization Notifications' : 'School Notifications'} description={isOrg ? 'Send organization-wide, campus-wide, or staff notifications with the same org-admin endpoint used by the mobile panel.' : 'Compose, review, edit, and delete school notifications using the same school-admin notification endpoints.'} />
        <Banner message={message} />
        <form className="stack-form" onSubmit={send}>
          {isOrg ? (
            <div className="toolbar toolbar-wrap">
              <select value={targetType} onChange={(event) => setTargetType(event.target.value)}>
                <option value="org">Entire Organization</option>
                <option value="campus">Specific Campus</option>
                <option value="staff">Staff (Admins + Teachers)</option>
              </select>
              {targetType === 'campus' ? (
                <select value={selectedCampus} onChange={(event) => setSelectedCampus(event.target.value)}>
                  <option value="">Select campus</option>
                  {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                </select>
              ) : null}
            </div>
          ) : (
            <div className="toolbar toolbar-wrap">
              <select value={targetType} onChange={(event) => setTargetType(event.target.value)}>
                <option value="school">Whole school</option>
                <option value="class">Entire class</option>
                <option value="section">One section</option>
                <option value="student">One student</option>
              </select>
              {(targetType === 'class' || targetType === 'section' || targetType === 'student') ? (
                <select value={classId} onChange={(event) => setClassId(event.target.value)}>
                  <option value="">Select class</option>
                  {classes.map((item) => <option key={item.id} value={item.id}>{item.class_name || item.name}</option>)}
                </select>
              ) : null}
              {(targetType === 'section' || targetType === 'student') ? (
                <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} disabled={!classId}>
                  <option value="">Select section</option>
                  {sections.map((item) => <option key={item.id} value={item.id}>{item.section_name}</option>)}
                </select>
              ) : null}
              {targetType === 'student' ? (
                <select value={studentId} onChange={(event) => setStudentId(event.target.value)} disabled={!students.length}>
                  <option value="">Select student</option>
                  {students.map((item) => <option key={item.id} value={item.id}>{fullName(item)}</option>)}
                </select>
              ) : null}
            </div>
          )}
          {isOrg && targetType === 'staff' ? (
            <div>
              <span className="field-caption">Campuses (leave empty for all)</span>
              <ChipSelect items={campuses.map((campus) => ({ value: campus.id, label: campus.name }))} values={selectedCampuses} onToggle={toggleOrgCampus} />
            </div>
          ) : null}
          {!isOrg ? (
            <label>
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="general">General</option>
                <option value="holiday">Holiday</option>
                <option value="announcement">Announcement</option>
                <option value="homework">Homework</option>
                <option value="exam">Exam</option>
                <option value="complaint">Complaint</option>
              </select>
            </label>
          ) : null}
          <label>
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            <span>Message</span>
            <textarea value={messageBody} onChange={(event) => setMessageBody(event.target.value)} rows={5} required />
          </label>
          <div className="button-row">
            <button className="primary-button" disabled={saving}>{saving ? 'Sending...' : 'Send Notification'}</button>
          </div>
        </form>
      </section>
      {!isOrg ? (
        <section className="panel accent-panel">
          <SectionIntro title="Notification History" description="School admins can review, edit, and delete sent notifications from the same backend history used on mobile." />
          {historyLoading ? <LoadingCard /> : (
            <DataTable
              columns={[
                { key: 'title', label: 'Title' },
                { key: 'target_type', label: 'Target' },
                { key: 'category', label: 'Category' },
                { key: 'created_at', label: 'Created' },
              ]}
              rows={history.map((item) => ({ ...item, created_at: item.created_at ? new Date(item.created_at).toLocaleString() : '-' }))}
              actions={(item) => (
                <TableActionMenu
                  label="Notification actions"
                  items={[
                    { label: 'Edit', onClick: () => editNotification(item) },
                    { label: 'Delete', onClick: () => deleteNotification(item), tone: 'danger' },
                  ]}
                />
              )}
              emptyMessage="No notifications have been sent yet."
            />
          )}
        </section>
      ) : null}
    </div>
  );
}

export function PortalLeavesPage({ session, request }) {
  const isOrg = session.user.role === 'org_admin';
  const [filter, setFilter] = useState('all');
  const [campusFilter, setCampusFilter] = useState('');
  const [message, setMessage] = useState('');
  const [exportBusy, setExportBusy] = useState('');

  const leavesPath = isOrg ? '/org-admin/leaves' : '/admin/leaves';
  const statusPath = isOrg ? '/org-admin/leaves/group' : '/admin/leaves/group';
  const withdrawalPath = '/admin/leaves/group';

  const { loading, error, data, reload } = useRemoteResource(async () => {
    const leaves = await request('GET', leavesPath);
    const campuses = isOrg ? await request('GET', '/org-admin/campuses').catch(() => []) : [];
    return { leaves: safeArray(leaves), campuses: safeArray(campuses) };
  }, [request, leavesPath, isOrg]);

  const campuses = data?.campuses || [];
  const leaves = safeArray(data?.leaves);
  const pendingWithdrawals = isOrg ? [] : leaves.filter((item) => item.withdrawal_status === 'pending');
  const filteredLeaves = leaves.filter((item) => {
    if (isOrg && campusFilter && String(item.campus_id) !== String(campusFilter)) return false;
    if (filter === 'all') return true;
    if (filter === 'withdrawals') return item.withdrawal_status === 'pending';
    if (filter === 'pending') return isOrg ? item.status === 'pending' : item.status === 'pending' || item.withdrawal_status === 'pending';
    return item.status === filter;
  }).map((item) => ({
    ...item,
    student: item.student_name || `${item.first_name || ''} ${item.last_name || ''}`.trim(),
    dates_display: safeArray(item.dates).length ? safeArray(item.dates).join(', ') : '-',
  }));

  const doLeaveAction = async (groupId, status) => {
    try {
      await request('PUT', `${statusPath}/${groupId}/status`, { data: { status } });
      await reload();
      setMessage(status === 'approved' ? 'Leave approved.' : 'Leave rejected.');
    } catch (err) {
      setMessage(err.message || 'Could not update leave.');
    }
  };

  const doWithdrawalAction = async (groupId, action) => {
    try {
      await request('PUT', `${withdrawalPath}/${groupId}/withdrawal`, { data: { action } });
      await reload();
      setMessage(action === 'approve' ? 'Withdrawal approved.' : 'Withdrawal rejected.');
    } catch (err) {
      setMessage(err.message || 'Could not process withdrawal.');
    }
  };

  const tabs = isOrg
    ? ['all', 'pending', 'approved', 'rejected']
    : ['all', 'pending', 'approved', 'rejected', 'withdrawals'];

  const exportLeaves = async (format) => {
    if (isOrg && !campusFilter) return;
    setExportBusy(format);
    try {
      await downloadFile({
        token: session?.token,
        path: '/import-export/leaves/export',
        filename: format === 'csv' ? 'leaves_export.csv' : 'leaves_export.xlsx',
        params: {
          ...(isOrg ? { campus_id: campusFilter } : {}),
          ...(format === 'csv' ? { format: 'csv' } : {}),
        },
      });
    } catch (err) {
      setMessage(err.message || 'Could not export leaves.');
    } finally {
      setExportBusy('');
    }
  };

  return (
    <section className="panel">
      <SectionIntro title="Leave Requests" description="Approve, reject, and review leave flows on desktop using the same grouped leave endpoints the mobile admin panels call." />
      <div className="toolbar toolbar-wrap">
        {isOrg ? (
          <select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
            <option value="">All campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        ) : null}
        <button type="button" className="secondary-button" onClick={() => exportLeaves('xlsx')} disabled={!!exportBusy || (isOrg && !campusFilter)}>{exportBusy === 'xlsx' ? 'Exporting...' : 'Excel'}</button>
        <button type="button" className="secondary-button" onClick={() => exportLeaves('csv')} disabled={!!exportBusy || (isOrg && !campusFilter)}>{exportBusy === 'csv' ? 'Exporting...' : 'CSV'}</button>
        <div className="chip-group">
          {tabs.map((tab) => (
            <button key={tab} type="button" className={filter === tab ? 'chip chip-active' : 'chip'} onClick={() => setFilter(tab)}>{tab}</button>
          ))}
        </div>
      </div>
      {isOrg && !campusFilter ? <Banner message="Select a campus to export leave data." /> : null}
      {!isOrg && pendingWithdrawals.length ? <Banner message={`${pendingWithdrawals.length} withdrawal request(s) pending review.`} /> : null}
      <Banner message={error} tone="danger" />
      <Banner message={message} />
      {loading ? <LoadingCard /> : (
        <DataTable
          columns={[
            { key: 'student', label: 'Student' },
            { key: 'class_name', label: 'Class' },
            { key: 'section_name', label: 'Section' },
            { key: 'dates_display', label: 'Dates' },
            { key: 'status', label: 'Status' },
          ]}
          rows={filteredLeaves}
          actions={(item) => (
            item.withdrawal_status === 'pending' ? (
              <TableActionMenu
                label="Withdrawal actions"
                items={[
                  { label: 'Keep Leave', onClick: () => doWithdrawalAction(item.group_id, 'reject') },
                  { label: 'Approve Withdrawal', onClick: () => doWithdrawalAction(item.group_id, 'approve'), tone: 'danger' },
                ]}
              />
            ) : item.status === 'pending' ? (
              <TableActionMenu
                label="Leave actions"
                items={[
                  { label: 'Approve', onClick: () => doLeaveAction(item.group_id, 'approved') },
                  { label: 'Reject', onClick: () => doLeaveAction(item.group_id, 'rejected'), tone: 'danger' },
                ]}
              />
            ) : null
          )}
          emptyMessage="No leave requests for the current filter."
        />
      )}
    </section>
  );
}

export function PortalAssignmentsPage({ request }) {
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ teacher_id: '', class_id: '', section_id: '' });
  const [sections, setSections] = useState([]);
  const [saving, setSaving] = useState(false);

  const { loading, error, data, reload } = useRemoteResource(async () => {
    const [assignments, teachers, classes] = await Promise.all([
      request('GET', '/admin/assignments'),
      request('GET', '/admin/teachers'),
      request('GET', '/classes'),
    ]);
    return { assignments: safeArray(assignments), teachers: safeArray(teachers), classes: safeArray(classes) };
  }, [request]);

  useEffect(() => {
    const run = async () => {
      if (!form.class_id) {
        setSections([]);
        return;
      }
      try {
        const data = await request('GET', `/classes/${form.class_id}/sections`);
        setSections(safeArray(data));
      } catch {
        setSections([]);
      }
    };
    run();
  }, [request, form.class_id]);

  const saveAssignment = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await request('POST', '/admin/assignments', { data: { teacher_id: Number(form.teacher_id), class_id: Number(form.class_id), section_id: Number(form.section_id) } });
      await reload();
      setForm({ teacher_id: '', class_id: '', section_id: '' });
      setMessage('Teacher assignment created.');
    } catch (err) {
      setMessage(err.message || 'Could not save assignment.');
    } finally {
      setSaving(false);
    }
  };

  const deleteAssignment = async (item) => {
    if (!window.confirm(`Remove ${item.teacher_name} from ${item.class_name} - ${item.section_name}?`)) return;
    try {
      await request('DELETE', `/admin/assignments/${item.id}`);
      await reload();
    } catch (err) {
      setMessage(err.message || 'Could not remove assignment.');
    }
  };

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro title="Teacher Assignments" description="Assign teachers to classes and sections with the same school-admin endpoints already used on mobile." />
        <Banner message={error} tone="danger" />
        <Banner message={message} />
        {loading ? <LoadingCard /> : (
          <DataTable
            columns={[
              { key: 'teacher_name', label: 'Teacher' },
              { key: 'class_name', label: 'Class' },
              { key: 'section_name', label: 'Section' },
            ]}
            rows={safeArray(data?.assignments)}
            actions={(item) => (
              <TableActionMenu
                label="Assignment actions"
                items={[
                  { label: 'Remove', onClick: () => deleteAssignment(item), tone: 'danger' },
                ]}
              />
            )}
            emptyMessage="No assignments created yet."
          />
        )}
      </section>
      <section className="panel accent-panel">
        <SectionIntro title="New assignment" description="This uses `/admin/assignments` exactly like the mobile teacher assignment screen." />
        <form className="stack-form" onSubmit={saveAssignment}>
          <label>
            <span>Teacher</span>
            <select value={form.teacher_id} onChange={(event) => setForm((current) => ({ ...current, teacher_id: event.target.value }))} required>
              <option value="">Select teacher</option>
              {safeArray(data?.teachers).map((item) => <option key={item.id} value={item.id}>{fullName(item)}</option>)}
            </select>
          </label>
          <label>
            <span>Class</span>
            <select value={form.class_id} onChange={(event) => setForm((current) => ({ ...current, class_id: event.target.value, section_id: '' }))} required>
              <option value="">Select class</option>
              {safeArray(data?.classes).map((item) => <option key={item.id} value={item.id}>{item.class_name}</option>)}
            </select>
          </label>
          <label>
            <span>Section</span>
            <select value={form.section_id} onChange={(event) => setForm((current) => ({ ...current, section_id: event.target.value }))} required disabled={!form.class_id}>
              <option value="">Select section</option>
              {sections.map((item) => <option key={item.id} value={item.id}>{item.section_name}</option>)}
            </select>
          </label>
          <div className="button-row">
            <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : 'Assign Teacher'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function PortalTeacherAttendancePage({ request }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [teacherId, setTeacherId] = useState('');
  const [teachers, setTeachers] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    request('GET', '/admin/teachers').then((data) => setTeachers(safeArray(data))).catch(() => setTeachers([]));
  }, [request]);

  const { loading, error, data, reload } = useRemoteResource(() => request('GET', '/admin/teacher-attendance', { params: { year, month, ...(teacherId ? { teacher_id: teacherId } : {}) } }), [request, year, month, teacherId]);

  const exportCsv = () => {
    if (!safeArray(data).length) {
      setMessage('No attendance records to export.');
      return;
    }
    const rows = [
      ['Teacher', 'Present', 'Absent', 'Leave', 'Month', 'Year'],
      ...safeArray(data).map((item) => [
        item.teacher_name || fullName(item),
        item.present_count ?? 0,
        item.absent_count ?? 0,
        item.leave_count ?? 0,
        month,
        year,
      ]),
    ];
    csvDownload(`teacher_attendance_${year}_${month}.csv`, rows);
  };

  return (
    <section className="panel">
      <SectionIntro title="Teacher Attendance" description="Review and export monthly teacher attendance with the same reporting endpoint as the mobile admin report screen." action={<button className="secondary-button" onClick={reload}>Refresh</button>} />
      <div className="toolbar toolbar-wrap">
        <input type="number" min="2020" value={year} onChange={(event) => setYear(Number(event.target.value))} placeholder="Year" />
        <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
          {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
        </select>
        <select value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
          <option value="">All teachers</option>
          {teachers.map((item) => <option key={item.id} value={item.id}>{fullName(item)}</option>)}
        </select>
        <button className="secondary-button" onClick={exportCsv}>Export CSV</button>
      </div>
      <Banner message={error} tone="danger" />
      <Banner message={message} />
      {loading ? <LoadingCard /> : (
        <DataTable
          columns={[
            { key: 'teacher_name', label: 'Teacher' },
            { key: 'present_count', label: 'Present' },
            { key: 'absent_count', label: 'Absent' },
            { key: 'leave_count', label: 'Leave' },
          ]}
          rows={safeArray(data)}
          emptyMessage="No attendance records found for the selected period."
        />
      )}
    </section>
  );
}

const AI_SCOPE_LABELS = {
  global: 'Global',
  organization: 'Organization',
  campus: 'Campus',
  class: 'Class',
  section: 'Section',
  student: 'Student',
  root: 'Top',
};

function asNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function PortalAiMaterialsPage({ session, request }) {
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjectId, setSubjectId] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);

  const { loading, error, data, reload } = useRemoteResource(async () => {
    const params = {
      ...(subjectId ? { subject_id: subjectId } : {}),
      ...(classId ? { class_id: classId } : {}),
      ...(session.school?.id ? { campus_id: session.school.id } : {}),
    };
    const [materials, subjectsData, classesData] = await Promise.all([
      request('GET', '/ai-tutor/materials', { params }),
      request('GET', '/subjects').catch(() => []),
      request('GET', '/admin/classes').catch(() => []),
    ]);
    return {
      materials: safeArray(materials?.documents || materials),
      subjects: safeArray(subjectsData).filter((item) => item?.id != null),
      classes: safeArray(classesData),
    };
  }, [request, subjectId, classId, session.school?.id]);

  useEffect(() => {
    setSubjects(safeArray(data?.subjects));
    setClasses(safeArray(data?.classes));
  }, [data?.subjects, data?.classes]);

  const sections = safeArray(classes.find((item) => String(item.id) === String(classId))?.sections || []);

  const upload = async (event) => {
    event.preventDefault();
    if (!file) {
      setMessage('Choose a file first.');
      return;
    }
    if (!title.trim()) {
      setMessage('Material title is required.');
      return;
    }
    if (!subjectId) {
      setMessage('Pick a subject first.');
      return;
    }

    setUploading(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      if (topic.trim()) formData.append('topic', topic.trim());
      formData.append('subject_id', String(subjectId));
      if (classId) formData.append('class_id', String(classId));
      if (sectionId) formData.append('section_id', String(sectionId));
      if (session.school?.id) formData.append('campus_id', String(session.school.id));
      await apiFormRequest('POST', '/ai-tutor/materials/upload', { token: session?.token, formData });
      setTitle('');
      setTopic('');
      setFile(null);
      setMessage('Material uploaded and queued for ingestion.');
      await reload();
    } catch (err) {
      setMessage(err.message || 'Could not upload material.');
    } finally {
      setUploading(false);
    }
  };

  const deleteMaterial = async (item) => {
    if (!window.confirm(`Delete AI material "${item.title}"?`)) return;
    try {
      await request('DELETE', `/ai-tutor/materials/${item.id}`);
      await reload();
    } catch (err) {
      setMessage(err.message || 'Could not delete material.');
    }
  };

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro title="AI Materials" description="Upload and manage the study material that powers RAG answers for students in this campus." />
        <div className="toolbar toolbar-wrap">
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            <option value="">All subjects</option>
            {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select value={classId} onChange={(event) => { setClassId(event.target.value); setSectionId(''); }}>
            <option value="">All classes</option>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.class_name}</option>)}
          </select>
          <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} disabled={!classId}>
            <option value="">All sections</option>
            {sections.map((item) => <option key={item.id} value={item.id}>{item.section_name}</option>)}
          </select>
        </div>
        <Banner message={error} tone="danger" />
        <Banner message={message} />
        {loading ? <LoadingCard /> : (
          <DataTable
            columns={[
              { key: 'title', label: 'Title' },
              { key: 'topic', label: 'Topic' },
              { key: 'status', label: 'Status' },
              { key: 'file_ext', label: 'Type' },
            ]}
            rows={safeArray(data?.materials).map((item) => ({ ...item, file_ext: (item.file_ext || '').toUpperCase() || '-' }))}
            actions={(item) => (
              <TableActionMenu
                label="AI material actions"
                items={[
                  { label: 'Delete', onClick: () => deleteMaterial(item), tone: 'danger' },
                ]}
              />
            )}
            emptyMessage="No AI materials uploaded yet."
          />
        )}
      </section>
      <section className="panel accent-panel">
        <SectionIntro title="Upload material" description="Upload PDF, DOCX, PPTX, or TXT files so AI Tutor can ingest them for retrieval." />
        <form className="stack-form" onSubmit={upload}>
          <label>
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            <span>Topic</span>
            <input value={topic} onChange={(event) => setTopic(event.target.value)} />
          </label>
          <label>
            <span>Subject</span>
            <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required>
              <option value="">Select subject</option>
              {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <div className="form-grid-2">
            <label>
              <span>Class</span>
              <select value={classId} onChange={(event) => { setClassId(event.target.value); setSectionId(''); }}>
                <option value="">All classes</option>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.class_name}</option>)}
              </select>
            </label>
            <label>
              <span>Section</span>
              <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} disabled={!classId}>
                <option value="">All sections</option>
                {sections.map((item) => <option key={item.id} value={item.id}>{item.section_name}</option>)}
              </select>
            </label>
          </div>
          <label>
            <span>File</span>
            <input type="file" accept=".pdf,.docx,.pptx,.txt" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
          </label>
          <div className="button-row">
            <button className="primary-button" disabled={uploading}>{uploading ? 'Uploading...' : 'Upload AI Material'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

const AI_POLICY_FIELDS = [
  { key: 'daily_requests', label: 'Requests / day' },
  { key: 'weekly_requests', label: 'Requests / week' },
  { key: 'monthly_requests', label: 'Requests / month' },
  { key: 'daily_tokens', label: 'Tokens / day' },
  { key: 'weekly_tokens', label: 'Tokens / week' },
  { key: 'monthly_tokens', label: 'Tokens / month' },
  { key: 'max_input_tokens', label: 'Max input / request' },
  { key: 'max_output_tokens', label: 'Max output / request' },
];

const AI_DISTRIBUTABLE_KEYS = new Set([
  'daily_requests',
  'weekly_requests',
  'monthly_requests',
  'daily_tokens',
  'weekly_tokens',
  'monthly_tokens',
]);

function numericOnly(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function percentInput(value) {
  return String(value || '').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
}

function percentFromBps(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
  const percent = Number(value) / 100;
  return Number.isInteger(percent)
    ? String(percent)
    : String(percent.toFixed(2)).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function createPolicyDraft(source = {}) {
  const draft = {};
  AI_POLICY_FIELDS.forEach(({ key }) => {
    draft[key] = source?.[key] === null || source?.[key] === undefined ? '' : String(source[key]);
    if (AI_DISTRIBUTABLE_KEYS.has(key)) {
      draft[`${key}_mode`] = source?.[`${key}_mode`] || (source?.[`${key}_percent_bps`] ? 'percent' : source?.[key] !== null && source?.[key] !== undefined ? 'fixed' : 'inherit');
      draft[`${key}_percent`] = percentFromBps(source?.[`${key}_percent_bps`]);
    }
  });
  return draft;
}

function buildEditablePolicySource(target = {}) {
  const source = target?.own_policy || {};
  const cleaned = {};
  AI_POLICY_FIELDS.forEach(({ key }) => {
    cleaned[key] = source?.[key] ?? null;
    if (AI_DISTRIBUTABLE_KEYS.has(key)) {
      cleaned[`${key}_mode`] = source?.[`${key}_mode`] ?? 'inherit';
      cleaned[`${key}_percent_bps`] = source?.[`${key}_percent_bps`] ?? null;
    }
  });
  return cleaned;
}

function pickAllocationSummary(allocation = {}) {
  const preferred = [
    ['monthly_tokens', 'tok/mo'],
    ['daily_tokens', 'tok/day'],
    ['daily_requests', 'req/day'],
  ];
  for (const [key, label] of preferred) {
    const entry = allocation?.[key];
    if (entry?.value !== null && entry?.value !== undefined) {
      return { key, label, entry };
    }
  }
  return null;
}

function formatPolicyValue(entry) {
  if (!entry) return 'No limit';
  if (entry.value === null || entry.value === undefined) return 'No limit';
  return Number(entry.value).toLocaleString();
}

function AiPolicyTriButton({ label, active, busy, color, onClick }) {
  return (
    <button
      type="button"
      className={`ai-policy-mini ${active ? 'ai-policy-mini-active' : ''}`}
      style={active && color ? { borderColor: color, background: color } : undefined}
      onClick={onClick}
      disabled={busy}
    >
      {busy && active ? '...' : label}
    </button>
  );
}

function PortalAiPolicyChildRow({ child, parentEnabled, busy, onStateChange, onQuotaEdit, onDrillIn }) {
  const isOwn = child.own_flag !== null;
  const enabled = isOwn ? Boolean(child.own_flag?.is_enabled) : Boolean(parentEnabled);
  const allocation = pickAllocationSummary(child.allocation);
  const studentText = child.has_children
    ? child.student_count !== child.student_count_total
      ? `${child.student_count ?? 0} / ${child.student_count_total ?? 0} students AI-enabled`
      : `${child.student_count ?? 0} students`
    : null;
  const allocationText = allocation
    ? allocation.entry.source === 'manual'
      ? `Manual ${Number(allocation.entry.value || 0).toLocaleString()} ${allocation.label}`
      : allocation.entry.source === 'auto' && allocation.entry.share_basis
        ? `Auto ${Number(allocation.entry.value || 0).toLocaleString()} ${allocation.label} from ${allocation.entry.share_basis.parent_pool?.toLocaleString?.() ?? '0'} pool`
        : `${Number(allocation.entry.value || 0).toLocaleString()} ${allocation.label}`
    : null;

  return (
    <div className="ai-policy-child">
      <button type="button" className="ai-policy-child-main" onClick={child.has_children ? onDrillIn : undefined} disabled={!child.has_children}>
        <div className="ai-policy-child-title-row">
          <strong>{child.name}</strong>
          <span className={`ai-policy-status-pill ${enabled ? 'ai-policy-status-on' : 'ai-policy-status-off'}`}>
            {enabled ? 'ON' : 'OFF'}{isOwn ? '' : ' (inh)'}
          </span>
        </div>
        {studentText ? <span className="ai-policy-note">{studentText}</span> : null}
        {allocationText ? <span className="ai-policy-note">{allocationText}</span> : null}
      </button>
      <div className="ai-policy-child-actions">
        <button type="button" className="secondary-button" onClick={onQuotaEdit}>Quota</button>
        <AiPolicyTriButton label="Inh" active={!isOwn} busy={busy} onClick={() => onStateChange(null)} />
        <AiPolicyTriButton label="ON" active={child.own_flag?.is_enabled === true} busy={busy} color="#15803d" onClick={() => onStateChange(true)} />
        <AiPolicyTriButton label="OFF" active={child.own_flag?.is_enabled === false} busy={busy} color="#b91c1c" onClick={() => onStateChange(false)} />
        {child.has_children ? <button type="button" className="secondary-button" onClick={onDrillIn}>Open</button> : null}
      </div>
    </div>
  );
}

export function PortalAiPolicyPage({ session, request }) {
  const role = session.user.role;
  const isSuper = role === 'super_admin';
  const [stack, setStack] = useState([{ type: 'root', id: null, name: 'Top level' }]);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [filter, setFilter] = useState('');
  const [showQuotaEditor, setShowQuotaEditor] = useState(false);
  const [quotaTarget, setQuotaTarget] = useState(null);
  const [quotaDraft, setQuotaDraft] = useState(createPolicyDraft());
  const [savingQuota, setSavingQuota] = useState(false);
  const [syncingProvider, setSyncingProvider] = useState(false);
  const [resettingCounters, setResettingCounters] = useState(false);

  const current = stack[stack.length - 1];
  const { loading, error, data, reload } = useRemoteResource(async () => {
    const [health, summary, hierarchy, provider] = await Promise.all([
      request('GET', '/ai-tutor/admin/health').catch(() => null),
      request('GET', '/ai-tutor/admin/policy-summary').catch(() => ({ rows: [] })),
      request('GET', '/ai-tutor/admin/hierarchy', { params: { node_type: current.type, ...(current.id ? { node_id: current.id } : {}) } }),
      isSuper ? request('GET', '/ai-tutor/admin/provider-status').catch(() => null) : Promise.resolve(null),
    ]);
    return { health, summary: safeArray(summary?.rows), hierarchy, provider };
  }, [request, current.type, current.id, isSuper]);

  const hierarchy = data?.hierarchy || {};
  const node = hierarchy?.node || null;
  const children = safeArray(hierarchy?.children);
  const filteredChildren = useMemo(() => {
    if (!filter.trim()) return children;
    const query = filter.trim().toLowerCase();
    return children.filter((item) => String(item.name || '').toLowerCase().includes(query));
  }, [children, filter]);
  const globalRow = safeArray(data?.summary).find((item) => item.scope_type === 'global') || null;
  const globalEnabled = globalRow?.is_enabled !== false;
  const effectiveFlag = hierarchy?.context_effective_flag || node?.effective_flag || null;
  const distribution = hierarchy?.distribution || {};

  const openQuotaEditor = (target, effectivePolicy) => {
    setQuotaTarget({
      ...target,
      effective_policy: effectivePolicy || target?.effective_policy || target?.allocation || {},
    });
    setQuotaDraft(createPolicyDraft(buildEditablePolicySource(target)));
    setShowQuotaEditor(true);
  };

  const closeQuotaEditor = () => {
    setShowQuotaEditor(false);
    setQuotaTarget(null);
    setQuotaDraft(createPolicyDraft());
  };

  const updateScopeFlag = async (target, value) => {
    if (!target?.type || (target.type !== 'global' && !target.id)) return;
    const key = `${target.type}#${target.id ?? 'global'}`;
    setBusyId(key);
    setMessage('');
    try {
      if (value === null) {
        if (target.type === 'global') {
          throw new Error('Global defaults cannot inherit from a parent.');
        }
        if (target.has_children) {
          await request('POST', '/ai-tutor/admin/cascade-flag', {
            data: { scope_type: target.type, scope_id: target.id, is_enabled: null, mode: 'inherit', clear_subtree: true },
          });
        } else {
          await request('DELETE', '/ai-tutor/admin/scope', { params: { scope_type: target.type, scope_id: target.id, target: 'flag' } });
        }
      } else if (target.has_children) {
        await request('POST', '/ai-tutor/admin/cascade-flag', {
          data: { scope_type: target.type, scope_id: target.id, is_enabled: value, clear_subtree: true },
        });
      } else {
        await request('POST', '/ai-tutor/admin/feature-flag', {
          data: { scope_type: target.type, scope_id: target.id, is_enabled: value },
        });
      }
      await reload();
      setMessage('AI policy updated.');
    } catch (err) {
      setMessage(err.message || 'Could not update AI policy.');
    } finally {
      setBusyId('');
    }
  };

  const bulkSetChildren = async (value) => {
    if (!filteredChildren.length) return;
    const firstType = filteredChildren[0]?.type;
    if (!firstType) return;
    setBusyId('bulk');
    setMessage('');
    try {
      await request('POST', '/ai-tutor/admin/feature-flag/bulk', {
        data: {
          scope_type: firstType,
          scope_ids: filteredChildren.map((item) => item.id),
          is_enabled: value,
        },
      });
      await reload();
      setMessage(`Updated ${filteredChildren.length} child scopes.`);
    } catch (err) {
      setMessage(err.message || 'Could not update child scopes.');
    } finally {
      setBusyId('');
    }
  };

  const saveQuotaPolicy = async () => {
    const target = quotaTarget;
    if (!target?.type) return;
    setSavingQuota(true);
    setMessage('');
    try {
      const payload = { scope_type: target.type, scope_id: target.id ?? null };
      let hasAnyValue = false;
      AI_POLICY_FIELDS.forEach(({ key }) => {
        if (AI_DISTRIBUTABLE_KEYS.has(key) && target.type !== 'global') {
          const mode = quotaDraft[`${key}_mode`] || 'inherit';
          payload[`${key}_mode`] = mode;
          if (mode === 'fixed') {
            const parsed = asNumberOrNull(quotaDraft[key]);
            if (parsed !== null) {
              payload[key] = parsed;
              hasAnyValue = true;
            }
          }
          if (mode === 'percent') {
            const percent = Number(quotaDraft[`${key}_percent`]);
            if (!Number.isNaN(percent)) {
              payload[`${key}_percent_bps`] = Math.round(percent * 100);
              hasAnyValue = true;
            }
          }
          return;
        }

        const parsed = asNumberOrNull(quotaDraft[key]);
        if (parsed !== null) {
          payload[key] = parsed;
          hasAnyValue = true;
        }
      });

      if (target.type !== 'global' && !hasAnyValue) {
        await request('DELETE', '/ai-tutor/admin/scope', { params: { scope_type: target.type, scope_id: target.id, target: 'policy' } });
      } else {
        await request('POST', '/ai-tutor/admin/quota-policy', { data: payload });
      }

      closeQuotaEditor();
      await reload();
      setMessage('AI quota policy updated.');
    } catch (err) {
      const violations = safeArray(err?.data?.violations || err?.response?.data?.violations);
      if (violations.length) {
        setMessage(`Not enough quota available.\n${formatAiQuotaViolationMessage(violations)}`);
      } else {
        setMessage(err.message || 'Could not update AI quota policy.');
      }
    } finally {
      setSavingQuota(false);
    }
  };

  const syncProviderQuota = async () => {
    setSyncingProvider(true);
    setMessage('');
    try {
      await request('POST', '/ai-tutor/admin/sync-provider-quota', { data: { reset_counters: false } });
      await reload();
      setMessage('Provider quota synced.');
    } catch (err) {
      setMessage(err.message || 'Could not sync provider quota.');
    } finally {
      setSyncingProvider(false);
    }
  };

  const resetQuotaCounters = async () => {
    if (!window.confirm('Reset AI Tutor quota counters now?')) return;
    setResettingCounters(true);
    setMessage('');
    try {
      await request('POST', '/ai-tutor/admin/reset-counters', { data: {} });
      await reload();
      setMessage('AI quota counters reset.');
    } catch (err) {
      setMessage(err.message || 'Could not reset AI quota counters.');
    } finally {
      setResettingCounters(false);
    }
  };

  const currentTarget = node
    ? { ...node, has_children: children.length > 0 }
    : null;

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro
          title="AI Policy"
          description="Manage inheritance, cascade overrides, and pooled AI quotas from the same hierarchy endpoints the mobile AI policy pages use."
          action={<button className="secondary-button" onClick={reload}>Refresh</button>}
        />
        <Banner message={error} tone="danger" />
        <Banner message={message} />
        {loading ? <LoadingCard /> : (
          <div className="stack-form">
            <div className="stat-grid">
              <article className="stat-card"><span>Ready documents</span><strong>{data?.health?.ready_documents ?? 0}</strong></article>
              <article className="stat-card"><span>Pending jobs</span><strong>{data?.health?.pending_jobs ?? 0}</strong></article>
              <article className="stat-card"><span>Failed jobs 24h</span><strong>{data?.health?.failed_jobs_last_24h ?? 0}</strong></article>
              <article className="stat-card"><span>OpenAI key</span><strong>{data?.health?.openai_key_set ? 'Set' : 'Missing'}</strong></article>
            </div>

            {isSuper ? (
              <div className="ai-policy-card">
                <div className="section-intro toolbar-inline">
                  <div>
                    <h2>System defaults</h2>
                    <p>Global defaults are the root policy that inherited organizations and campuses resolve from.</p>
                  </div>
                  <div className="button-row">
                    <button className="secondary-button" onClick={syncProviderQuota} disabled={syncingProvider}>{syncingProvider ? 'Syncing...' : 'Sync Provider Quota'}</button>
                    <button className="secondary-button" onClick={resetQuotaCounters} disabled={resettingCounters}>{resettingCounters ? 'Resetting...' : 'Reset Counters'}</button>
                  </div>
                </div>
                {data?.provider ? (
                  <div className="selection-banner">
                    <strong>{data.provider.provider || 'No provider configured'}</strong>
                    <span>Model: {data.provider.chat_model || '-'} | Retrieval: {data.provider.retrieval_mode || '-'}</span>
                  </div>
                ) : null}
                <div className="ai-policy-card-row">
                  <div>
                    <strong className="ai-policy-card-title">Global AI status</strong>
                    <div className="button-row ai-policy-button-strip">
                      <AiPolicyTriButton label="ON" active={globalEnabled} busy={busyId === 'global#flag'} color="#15803d" onClick={async () => {
                        setBusyId('global#flag');
                        await updateScopeFlag({ type: 'global', id: null, has_children: true }, true);
                      }} />
                      <AiPolicyTriButton label="OFF" active={!globalEnabled} busy={busyId === 'global#flag'} color="#b91c1c" onClick={async () => {
                        setBusyId('global#flag');
                        await updateScopeFlag({ type: 'global', id: null, has_children: true }, false);
                      }} />
                    </div>
                  </div>
                  <div className="button-row">
                    <button className="primary-button" onClick={() => openQuotaEditor({ type: 'global', id: null, name: 'Everyone (global default)', own_policy: globalRow }, globalRow)}>Edit global limits</button>
                  </div>
                </div>
                <div className="ai-policy-grid">
                  {AI_POLICY_FIELDS.map(({ key, label }) => {
                    const value = globalRow?.[key];
                    const mode = globalRow?.[`${key}_mode`];
                    const percentBps = globalRow?.[`${key}_percent_bps`];
                    const isPercent = mode === 'percent' && percentBps !== null && percentBps !== undefined;
                    return (
                      <article key={key} className="ai-policy-limit">
                        <span>{label}</span>
                        <strong>
                          {value === null || value === undefined
                            ? isPercent
                              ? `${percentFromBps(percentBps)}%`
                              : 'No limit'
                            : Number(value).toLocaleString()}
                        </strong>
                        <small>
                          {AI_DISTRIBUTABLE_KEYS.has(key)
                            ? mode === 'percent'
                              ? 'Global percent allocation'
                              : mode === 'fixed'
                                ? 'Global fixed allocation'
                                : 'Inherited / no default set'
                            : value === null || value === undefined
                              ? 'No system-wide cap'
                              : 'Global fixed limit'}
                        </small>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {!hierarchy?.is_root && currentTarget ? (
              <div className="ai-policy-card">
                <div className="section-intro toolbar-inline">
                  <div>
                    <h2>{currentTarget.name}</h2>
                    <p>
                      {currentTarget.student_count ?? 0} of {currentTarget.student_count_total ?? 0} students are AI-enabled in this scope.
                    </p>
                  </div>
                  <span className={`ai-policy-status-pill ${effectiveFlag?.is_enabled ? 'ai-policy-status-on' : 'ai-policy-status-off'}`}>
                    AI is {effectiveFlag?.is_enabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                <div className="chip-group">
                  {stack.map((item, index) => (
                    <button key={`${item.type}-${item.id ?? 'root'}`} type="button" className={index === stack.length - 1 ? 'chip chip-active' : 'chip'} onClick={() => setStack((currentStack) => currentStack.slice(0, index + 1))}>{item.name}</button>
                  ))}
                </div>
                <p className="toolbar-note">
                  {currentTarget.own_flag === null
                    ? `Inherited from ${effectiveFlag?.from_name || 'global default'}`
                    : 'This scope has its own explicit AI flag.'}
                </p>
                <div className="button-row ai-policy-button-strip">
                  <AiPolicyTriButton label="Inherit" active={currentTarget.own_flag === null} busy={busyId === `${currentTarget.type}#${currentTarget.id}`} onClick={() => updateScopeFlag(currentTarget, null)} />
                  <AiPolicyTriButton label="ON (cascade)" active={currentTarget.own_flag?.is_enabled === true} busy={busyId === `${currentTarget.type}#${currentTarget.id}`} color="#15803d" onClick={() => updateScopeFlag(currentTarget, true)} />
                  <AiPolicyTriButton label="OFF (cascade)" active={currentTarget.own_flag?.is_enabled === false} busy={busyId === `${currentTarget.type}#${currentTarget.id}`} color="#b91c1c" onClick={() => updateScopeFlag(currentTarget, false)} />
                </div>
                <div className="ai-policy-grid">
                  {AI_POLICY_FIELDS.map(({ key, label }) => {
                    const entry = currentTarget.effective_policy?.[key];
                    return (
                      <article key={key} className="ai-policy-limit">
                        <span>{label}</span>
                        <strong>{formatPolicyValue(entry)}</strong>
                        <small>{entry?.source === 'manual' ? 'Set here' : entry?.source === 'auto' ? `Auto from ${entry?.from_name || 'parent'}` : `From ${entry?.from_name || 'inheritance'}`}</small>
                      </article>
                    );
                  })}
                </div>
                <div className="button-row">
                  <button className="primary-button" onClick={() => openQuotaEditor(currentTarget, currentTarget.effective_policy)}>Edit allocation</button>
                  {currentTarget.own_policy ? (
                    <button className="secondary-button" onClick={async () => {
                      if (!window.confirm(`Clear ${currentTarget.name}'s allocation and return it to inherit from the parent?`)) return;
                      setBusyId(`${currentTarget.type}#policy`);
                      try {
                        await request('DELETE', '/ai-tutor/admin/scope', { params: { scope_type: currentTarget.type, scope_id: currentTarget.id, target: 'policy' } });
                        await reload();
                        setMessage('Allocation cleared.');
                      } catch (err) {
                        setMessage(err.message || 'Could not clear allocation.');
                      } finally {
                        setBusyId('');
                      }
                    }}>Clear allocation</button>
                  ) : null}
                </div>
                {Object.values(distribution).some((item) => item?.parent_pool !== null) ? (
                  <div className="selection-banner">
                    {['daily_requests', 'daily_tokens', 'monthly_tokens'].map((key) => {
                      const item = distribution[key];
                      if (!item || item.parent_pool === null) return null;
                      const label = AI_POLICY_FIELDS.find((field) => field.key === key)?.label || key;
                      return <span key={key}>{label}: pool {item.parent_pool?.toLocaleString?.() ?? 0}, manual {item.manual_sum?.toLocaleString?.() ?? 0}, free {item.remaining?.toLocaleString?.() ?? 0}</span>;
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="selection-banner">
                <strong>{role === 'super_admin' ? 'Organization hierarchy' : role === 'org_admin' ? 'Your organization' : 'Your campus'}</strong>
                <span>Open a child scope below to manage inherit, cascade, and pooled quota allocations.</span>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="panel accent-panel">
        <SectionIntro title={hierarchy?.is_root ? 'Hierarchy' : `${current.name} children`} description="Drill into the policy tree, bulk toggle visible children, and edit per-scope quota allocations." />
        {loading ? <LoadingCard /> : (
          <div className="stack-form">
            <div className="toolbar toolbar-wrap">
              <input placeholder="Filter children by name" value={filter} onChange={(event) => setFilter(event.target.value)} />
              {filteredChildren.length ? (
                <>
                  <button className="secondary-button" onClick={() => bulkSetChildren(true)} disabled={busyId === 'bulk'}>{busyId === 'bulk' ? 'Working...' : 'All ON'}</button>
                  <button className="secondary-button" onClick={() => bulkSetChildren(false)} disabled={busyId === 'bulk'}>{busyId === 'bulk' ? 'Working...' : 'All OFF'}</button>
                </>
              ) : null}
            </div>
            <div className="ai-policy-children">
              {filteredChildren.length ? filteredChildren.map((child) => (
                <PortalAiPolicyChildRow
                  key={`${child.type}#${child.id}`}
                  child={child}
                  parentEnabled={effectiveFlag?.is_enabled}
                  busy={busyId === `${child.type}#${child.id}`}
                  onStateChange={(value) => updateScopeFlag(child, value)}
                  onQuotaEdit={() => openQuotaEditor(child, child.allocation)}
                  onDrillIn={() => setStack((currentStack) => [...currentStack, { type: child.type, id: child.id, name: child.name }])}
                />
              )) : <EmptyState message="No child scopes available for this policy level." />}
            </div>
          </div>
        )}
      </section>

      {showQuotaEditor ? (
        <div className="ai-policy-modal-backdrop" onClick={closeQuotaEditor}>
          <div className="ai-policy-modal" onClick={(event) => event.stopPropagation()}>
            <SectionIntro title={`Allocation for ${quotaTarget?.name || 'scope'}`} description="Use inherit, fixed, or percent modes for request and token pools. Per-request caps stay fixed." />
            <div className="ai-policy-modal-scroll">
              {AI_POLICY_FIELDS.map(({ key, label }) => {
                const effective = quotaTarget?.effective_policy?.[key];
                const mode = quotaDraft[`${key}_mode`] || 'inherit';
                const isDistributable = AI_DISTRIBUTABLE_KEYS.has(key) && quotaTarget?.type !== 'global';
                return (
                  <div key={key} className="assignment-block">
                    <div className="section-intro toolbar-inline">
                      <div>
                        <h2>{label}</h2>
                        <p>Current effective limit: {formatPolicyValue(effective)}</p>
                      </div>
                    </div>
                    {isDistributable ? (
                      <div className="chip-group">
                        {['inherit', 'fixed', 'percent'].map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={mode === option ? 'chip chip-active' : 'chip'}
                            onClick={() => setQuotaDraft((currentDraft) => ({ ...currentDraft, [`${key}_mode`]: option }))}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {!isDistributable || mode === 'fixed' ? (
                      <input
                        value={quotaDraft[key] || ''}
                        placeholder={effective?.value !== null && effective?.value !== undefined ? String(effective.value) : 'No limit'}
                        onChange={(event) => setQuotaDraft((currentDraft) => ({ ...currentDraft, [key]: numericOnly(event.target.value) }))}
                      />
                    ) : null}
                    {isDistributable && mode === 'percent' ? (
                      <input
                        value={quotaDraft[`${key}_percent`] || ''}
                        placeholder="Percent of parent pool"
                        onChange={(event) => setQuotaDraft((currentDraft) => ({ ...currentDraft, [`${key}_percent`]: percentInput(event.target.value) }))}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="button-row ai-policy-modal-actions">
              <button className="secondary-button" onClick={closeQuotaEditor} disabled={savingQuota}>Cancel</button>
              <button className="primary-button" onClick={saveQuotaPolicy} disabled={savingQuota}>{savingQuota ? 'Saving...' : 'Save Allocation'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PortalAiAnalyticsPage({ request }) {
  const [days, setDays] = useState(30);
  const [stack, setStack] = useState([{ type: 'root', id: null, name: 'Top' }]);
  const current = stack[stack.length - 1];

  const { loading, error, data, reload } = useRemoteResource(async () => {
    return request('GET', '/ai-tutor/analytics/scope', {
      params: { node_type: current.type, ...(current.id ? { node_id: current.id } : {}), days },
    });
  }, [request, days, current.type, current.id]);

  const totals = data?.totals || {};
  const children = safeArray(data?.children);
  const exhausted = safeArray(data?.exhausted);
  const series = safeArray(data?.series);

  const formatCount = (value) => Number(value || 0).toLocaleString();
  const formatCost = (value) => `$${Number(value || 0).toFixed(2)}`;

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro title="AI Analytics" description="Review RAG usage, blocks, latency, and drill down the hierarchy just like the mobile analytics flow." action={<button className="secondary-button" onClick={reload}>Refresh</button>} />
        <div className="toolbar toolbar-wrap">
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <div className="chip-group">
            {stack.map((item, index) => (
              <button key={`${item.type}-${item.id || 'root'}`} type="button" className={index === stack.length - 1 ? 'chip chip-active' : 'chip'} onClick={() => setStack((currentStack) => currentStack.slice(0, index + 1))}>{item.name}</button>
            ))}
          </div>
        </div>
        <Banner message={error} tone="danger" />
        {loading ? <LoadingCard /> : (
          <>
            <div className="stat-grid">
              <article className="stat-card"><span>Queries</span><strong>{formatCount(totals.queries)}</strong></article>
              <article className="stat-card"><span>Total tokens</span><strong>{formatCount(totals.total_tokens)}</strong></article>
              <article className="stat-card"><span>Blocked quota</span><strong>{formatCount(totals.blocked_quota)}</strong></article>
              <article className="stat-card"><span>Blocked scope</span><strong>{formatCount(totals.blocked_scope)}</strong></article>
              <article className="stat-card"><span>Blocked rate</span><strong>{formatCount(totals.blocked_rate)}</strong></article>
              <article className="stat-card"><span>No context</span><strong>{formatCount(totals.no_context)}</strong></article>
              <article className="stat-card"><span>Avg latency</span><strong>{formatCount(totals.avg_latency_ms)}ms</strong></article>
              <article className="stat-card"><span>Cost (USD)</span><strong>{formatCost(totals.total_cost_usd)}</strong></article>
            </div>

            {exhausted.length ? (
              <div className="ai-analytics-card-list">
                <div className="selection-banner">
                  <strong>Students hitting their quota</strong>
                  <span>{exhausted.length} student{exhausted.length === 1 ? '' : 's'} were blocked at least once in this time window.</span>
                </div>
                <div className="ai-analytics-list">
                  {exhausted.map((item) => (
                    <button
                      key={`exhausted-${item.student_id}`}
                      type="button"
                      className="ai-analytics-row"
                      onClick={() => setStack((currentStack) => [...currentStack, { type: 'student', id: item.student_id, name: item.student_name }])}
                    >
                      <div>
                        <strong>{item.student_name}</strong>
                        <span>{formatCount(item.queries)} queries · {formatCount(item.blocked_count)} blocked</span>
                      </div>
                      <span className="ai-analytics-badge">{formatCount(item.blocked_count)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="ai-analytics-card-list">
              <div className="selection-banner">
                <strong>Daily queries</strong>
                <span>Last {data?.days || days} days</span>
              </div>
              {series.length ? (
                <div className="ai-analytics-series">
                  {series.map((point) => (
                    <div key={point.day} className="ai-analytics-series-row">
                      <span className="ai-analytics-series-day">{point.day}</span>
                      <div className="ai-analytics-series-bar-track">
                        <div className="ai-analytics-series-bar" style={{ width: `${Math.max(6, Math.min(100, ((point.count || 0) / Math.max(...series.map((entry) => entry.count || 0), 1)) * 100))}%` }} />
                      </div>
                      <strong>{formatCount(point.count)}</strong>
                    </div>
                  ))}
                </div>
              ) : <EmptyState message="No daily AI activity for the selected period." />}
            </div>
          </>
        )}
      </section>
      <section className="panel accent-panel">
        <SectionIntro title={data?.node?.name || current.name} description="Click a child scope to drill deeper into the AI Tutor activity tree." />
        {loading ? <LoadingCard /> : (
          <div className="stack-form">
            {data?.child_type ? (
              <div className="selection-banner">
                <strong>By {AI_SCOPE_LABELS[data.child_type] || data.child_type}</strong>
                <span>{children.length} item{children.length === 1 ? '' : 's'} in this level.</span>
              </div>
            ) : null}
            {children.length ? (
              <div className="ai-analytics-list">
                {children.map((item) => (
                  <button
                    key={`${item.type}#${item.id}`}
                    type="button"
                    className="ai-analytics-row"
                    onClick={() => setStack((currentStack) => [...currentStack, { type: item.type, id: item.id, name: item.name }])}
                  >
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {formatCount(item.queries)} queries · {formatCount(item.total_tokens)} tokens
                        {Number(item.total_cost_usd || 0) > 0 ? ` · ${formatCost(item.total_cost_usd)}` : ''}
                      </span>
                    </div>
                    <div className="ai-analytics-row-end">
                      {item.blocked_quota > 0 ? <span className="ai-analytics-badge">{formatCount(item.blocked_quota)} blocked</span> : null}
                      <span className="ai-analytics-chevron">›</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : <EmptyState message="No child AI activity in this scope." />}
          </div>
        )}
      </section>
    </div>
  );
}

const TIMETABLE_DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIMETABLE_DAY_LABEL = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

function buildSectionSelection(classes, selectedClass, selectedSection) {
  const classList = safeArray(classes);
  const activeClass = classList.find((item) => String(item.id) === String(selectedClass)) || classList[0] || null;
  const sections = safeArray(activeClass?.sections);
  const nextSection = sections.find((item) => String(item.id) === String(selectedSection)) || sections[0] || null;
  return {
    classId: activeClass ? String(activeClass.id) : '',
    sectionId: nextSection ? String(nextSection.id) : '',
    sections,
  };
}

function timetableToEditablePeriod(period) {
  return {
    key: `${period.id || Math.random().toString(36).slice(2)}`,
    subject_id: period.subject_id ? String(period.subject_id) : '',
    teacher_id: period.teacher_id ? String(period.teacher_id) : '',
    start_time: String(period.start_time || '').slice(0, 5),
    end_time: String(period.end_time || '').slice(0, 5),
  };
}

function emptyTimetablePeriod() {
  return { key: Math.random().toString(36).slice(2), subject_id: '', teacher_id: '', start_time: '', end_time: '' };
}

function isValidTimetableTime(v) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
}

// New timetable module: one row per class period (subject/teacher/start/end),
// saved immediately per day — no shared bell-schedule structure and no
// draft/publish versioning. Friday can optionally get its own override
// schedule; when absent, Friday just uses the normal weekly periods.
export function PortalTimetablePage({ session, request }) {
  const role = session.user.role;
  const isOrg = role === 'org_admin';

  const [campusId, setCampusId] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [dayKey, setDayKey] = useState('monday');
  const [fridayOverrideOn, setFridayOverrideOn] = useState(false);
  const [periods, setPeriods] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState({});
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('neutral');
  const [copyTargetClass, setCopyTargetClass] = useState('');
  const [copyTargetSection, setCopyTargetSection] = useState('');
  const [copyIncludeFriday, setCopyIncludeFriday] = useState(true);
  const [copying, setCopying] = useState(false);

  const { data: campusesData } = useRemoteResource(async () => (isOrg ? request('GET', '/org-admin/campuses') : []), [request, isOrg]);
  const campuses = safeArray(campusesData);

  useEffect(() => {
    if (isOrg && !campusId && campuses.length) setCampusId(String(campuses[0].id));
  }, [isOrg, campuses, campusId]);

  const campusParam = isOrg && campusId ? { school_id: campusId } : {};

  const { loading: metaLoading, error: metaError, data: metaData } = useRemoteResource(async () => {
    if (isOrg && !campusId) return { classes: [], subjects: [], teachers: [] };
    const [classesRes, subjectsRes, teachersRes] = await Promise.all([
      isOrg ? request('GET', '/org-admin/classes', { params: { campus_id: campusId } }) : request('GET', '/admin/classes'),
      isOrg ? request('GET', '/org-admin/subjects', { params: { campus_id: campusId } }) : request('GET', '/subjects'),
      isOrg ? request('GET', '/org-admin/teachers', { params: { campus_id: campusId } }) : request('GET', '/admin/teachers'),
    ]);
    return { classes: safeArray(classesRes), subjects: safeArray(subjectsRes), teachers: safeArray(teachersRes) };
  }, [request, isOrg, campusId]);

  const classes = metaData?.classes || [];
  const subjects = metaData?.subjects || [];
  const teachers = metaData?.teachers || [];

  useEffect(() => {
    const selection = buildSectionSelection(classes, classId, sectionId);
    if (selection.classId !== classId) setClassId(selection.classId);
    if (selection.sectionId !== sectionId) setSectionId(selection.sectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes]);

  const sections = useMemo(() => buildSectionSelection(classes, classId, sectionId).sections, [classes, classId, sectionId]);

  const { data: weekData, loading: weekLoading, reload: reloadWeek } = useRemoteResource(async () => {
    if (!classId || !sectionId) return null;
    return request('GET', '/timetable/class', { params: { class_id: classId, section_id: sectionId, ...campusParam } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, classId, sectionId, campusId]);

  useEffect(() => {
    if (!weekData) { setPeriods([]); return; }
    if (dayKey === 'friday' && fridayOverrideOn) setPeriods(safeArray(weekData.fridayOverride).map(timetableToEditablePeriod));
    else setPeriods(safeArray(weekData.days?.[dayKey]).map(timetableToEditablePeriod));
    setDirty(false);
  }, [weekData, dayKey, fridayOverrideOn]);

  useEffect(() => {
    setFridayOverrideOn(dayKey === 'friday' ? !!weekData?.hasFridayOverride : false);
  }, [dayKey, weekData?.hasFridayOverride]);

  useEffect(() => {
    if (!classId || !sectionId) { setBusy({}); return; }
    request('GET', '/timetable/teacher-busy', { params: { day_key: dayKey, exclude_class_id: classId, exclude_section_id: sectionId, ...campusParam } })
      .then((data) => setBusy(data?.busy || {}))
      .catch(() => setBusy({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, sectionId, dayKey, campusId]);

  const updatePeriod = (key, patch) => {
    setPeriods((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
    setDirty(true);
  };
  const removePeriod = (key) => { setPeriods((prev) => prev.filter((p) => p.key !== key)); setDirty(true); };
  const addPeriod = () => { setPeriods((prev) => [...prev, emptyTimetablePeriod()]); setDirty(true); };
  const movePeriod = (index, dir) => {
    setPeriods((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const switchDay = (nextDay) => {
    if (dirty && !window.confirm('Discard unsaved changes to this day?')) return;
    setDayKey(nextDay);
  };

  const saveDay = async () => {
    for (const [idx, p] of periods.entries()) {
      if (!isValidTimetableTime(p.start_time) || !isValidTimetableTime(p.end_time) || p.start_time >= p.end_time) {
        setMessage(`Period ${idx + 1} needs a valid start/end time (HH:MM), ending after it starts.`);
        setMessageTone('danger');
        return;
      }
    }
    setSaving(true);
    setMessage('');
    try {
      const scheduleType = dayKey === 'friday' && fridayOverrideOn ? 'friday' : 'default';
      await request('PUT', '/timetable/class/day', {
        data: {
          ...campusParam,
          class_id: classId,
          section_id: sectionId,
          day_key: dayKey,
          schedule_type: scheduleType,
          periods: periods.map((p) => ({ subject_id: p.subject_id || null, teacher_id: p.teacher_id || null, start_time: p.start_time, end_time: p.end_time })),
        },
      });
      setMessage(`${TIMETABLE_DAY_LABEL[dayKey]}'s schedule has been updated.`);
      setMessageTone('neutral');
      setDirty(false);
      await reloadWeek();
    } catch (error) {
      setMessage(error.message || 'Could not save — check for teacher conflicts and try again.');
      setMessageTone('danger');
    } finally {
      setSaving(false);
    }
  };

  const removeFridayOverride = async () => {
    if (!window.confirm('Remove the Friday override? Friday will go back to the normal weekly schedule.')) return;
    try {
      await request('DELETE', '/timetable/class/day', { params: { ...campusParam, class_id: classId, section_id: sectionId, day_key: 'friday', schedule_type: 'friday' } });
      await reloadWeek();
      setFridayOverrideOn(false);
    } catch (error) {
      setMessage(error.message || 'Could not remove the Friday override.');
      setMessageTone('danger');
    }
  };

  const deleteTimetable = async () => {
    if (!window.confirm('Delete this class’s entire timetable, including any Friday override? This cannot be undone.')) return;
    try {
      await request('DELETE', '/timetable/class', { params: { ...campusParam, class_id: classId, section_id: sectionId } });
      await reloadWeek();
      setMessage('Timetable deleted.');
      setMessageTone('neutral');
    } catch (error) {
      setMessage(error.message || 'Could not delete the timetable.');
      setMessageTone('danger');
    }
  };

  const copyTargetSectionOptions = useMemo(
    () => buildSectionSelection(classes, copyTargetClass, copyTargetSection).sections,
    [classes, copyTargetClass, copyTargetSection],
  );

  const runCopyTimetable = async () => {
    if (!copyTargetClass || !copyTargetSection) {
      setMessage('Choose a target class and section to copy into.');
      setMessageTone('danger');
      return;
    }
    setCopying(true);
    setMessage('');
    try {
      const data = await request('POST', '/timetable/copy', {
        data: {
          ...campusParam,
          from_class_id: classId,
          from_section_id: sectionId,
          to_class_id: copyTargetClass,
          to_section_id: copyTargetSection,
          include_friday: copyIncludeFriday,
        },
      });
      setCopyTargetClass(''); setCopyTargetSection('');
      if (safeArray(data.conflicts).length) {
        setMessage(`Copied — ${data.conflicts.length} period(s) had a teacher conflict and were copied without a teacher assigned.`);
        setMessageTone('danger');
      } else {
        setMessage('Timetable copied.');
        setMessageTone('neutral');
      }
      if (String(copyTargetClass) === String(classId) && String(copyTargetSection) === String(sectionId)) await reloadWeek();
    } catch (error) {
      setMessage(error.message || 'Could not copy the timetable.');
      setMessageTone('danger');
    } finally {
      setCopying(false);
    }
  };

  const canEdit = !!(classId && sectionId);

  return (
    <div className="page-grid page-grid-2">
      <section className="panel">
        <SectionIntro
          title="Timetable"
          description="Pick a class and section, then edit one day at a time. Changes save immediately — there's no draft or publish step."
          action={<button className="secondary-button" onClick={reloadWeek}>Refresh</button>}
        />
        <Banner message={metaError || message} tone={messageTone === 'danger' || metaError ? 'danger' : 'neutral'} />

        <div className="stack-form stack-form-compact">
          {isOrg ? (
            <label>
              <span>Campus</span>
              <select value={campusId} onChange={(event) => { setCampusId(event.target.value); setClassId(''); setSectionId(''); }}>
                {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
              </select>
            </label>
          ) : null}

          <div className="form-grid-2">
            <label>
              <span>Class</span>
              <select value={classId} onChange={(event) => { setClassId(event.target.value); setSectionId(''); }}>
                <option value="">Select class</option>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.class_name}</option>)}
              </select>
            </label>
            <label>
              <span>Section</span>
              <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} disabled={!classId}>
                <option value="">Select section</option>
                {sections.map((item) => <option key={item.id} value={item.id}>{item.section_name}</option>)}
              </select>
            </label>
          </div>

          {metaLoading ? <LoadingCard /> : null}

          {canEdit ? (
            <>
              <div className="button-row">
                <button type="button" className="secondary-button" onClick={deleteTimetable}>Delete Timetable</button>
              </div>

              <div className="chip-group">
                {TIMETABLE_DAY_ORDER.map((key) => {
                  const active = key === dayKey;
                  const hasOverride = key === 'friday' && weekData?.hasFridayOverride;
                  return (
                    <button key={key} type="button" className={active ? 'chip chip-active' : 'chip'} onClick={() => switchDay(key)}>
                      {TIMETABLE_DAY_LABEL[key]}{hasOverride ? ' •' : ''}
                    </button>
                  );
                })}
              </div>

              {dayKey === 'friday' ? (
                <div className="selection-banner">
                  <strong>Custom Friday schedule</strong>
                  <span>{fridayOverrideOn ? 'Editing a Friday-only schedule.' : 'Off uses the normal weekly Friday schedule.'}</span>
                  <label style={{ marginTop: 6 }}>
                    <input
                      type="checkbox"
                      checked={fridayOverrideOn}
                      onChange={(event) => {
                        if (!event.target.checked && weekData?.hasFridayOverride) { removeFridayOverride(); return; }
                        setFridayOverrideOn(event.target.checked);
                      }}
                    />{' '}Use a different schedule for Friday
                  </label>
                </div>
              ) : null}

              {weekLoading ? <LoadingCard /> : (
                <>
                  {periods.map((p, idx) => (
                    <div key={p.key} className="assignment-block">
                      <div className="toolbar toolbar-inline">
                        <strong>Period {idx + 1}</strong>
                        <div className="button-row" style={{ margin: 0 }}>
                          <button type="button" className="ghost-button" disabled={idx === 0} onClick={() => movePeriod(idx, -1)}>Up</button>
                          <button type="button" className="ghost-button" disabled={idx === periods.length - 1} onClick={() => movePeriod(idx, 1)}>Down</button>
                          <button type="button" className="ghost-button" onClick={() => removePeriod(p.key)}>Remove</button>
                        </div>
                      </div>
                      <div className="form-grid-2">
                        <label>
                          <span>Start Time</span>
                          <input value={p.start_time} onChange={(event) => updatePeriod(p.key, { start_time: event.target.value })} placeholder="08:00" />
                        </label>
                        <label>
                          <span>End Time</span>
                          <input value={p.end_time} onChange={(event) => updatePeriod(p.key, { end_time: event.target.value })} placeholder="08:45" />
                        </label>
                        <label>
                          <span>Subject</span>
                          <select value={p.subject_id} onChange={(event) => updatePeriod(p.key, { subject_id: event.target.value })}>
                            <option value="">Select subject</option>
                            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                          </select>
                        </label>
                        <label>
                          <span>Teacher</span>
                          <select value={p.teacher_id} onChange={(event) => updatePeriod(p.key, { teacher_id: event.target.value })}>
                            <option value="">Not assigned</option>
                            {teachers.map((teacher) => {
                              const busyRanges = busy[String(teacher.id)] || [];
                              const name = teacher.full_name || `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim();
                              return (
                                <option key={teacher.id} value={teacher.id}>
                                  {busyRanges.length ? '⚠ ' : ''}{name}{busyRanges.length ? ` (busy ${busyRanges[0].start_time}-${busyRanges[0].end_time})` : ''}
                                </option>
                              );
                            })}
                          </select>
                        </label>
                      </div>
                    </div>
                  ))}

                  <div className="button-row">
                    <button type="button" className="secondary-button" onClick={addPeriod}>Add Period</button>
                    <button type="button" className="primary-button" onClick={saveDay} disabled={saving}>{saving ? 'Saving...' : `Save ${TIMETABLE_DAY_LABEL[dayKey]}`}</button>
                  </div>
                </>
              )}

              <div className="selection-banner" style={{ marginTop: 16 }}>
                <strong>Copy to another class</strong>
                <span>Copies this class's timetable (subject, teacher, times) into another class/section, replacing what's there.</span>
              </div>
              <div className="form-grid-2">
                <label>
                  <span>Target class</span>
                  <select value={copyTargetClass} onChange={(event) => { setCopyTargetClass(event.target.value); setCopyTargetSection(''); }}>
                    <option value="">Select class</option>
                    {classes.map((item) => <option key={item.id} value={item.id}>{item.class_name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Target section</span>
                  <select value={copyTargetSection} onChange={(event) => setCopyTargetSection(event.target.value)} disabled={!copyTargetClass}>
                    <option value="">Select section</option>
                    {copyTargetSectionOptions.map((item) => <option key={item.id} value={item.id}>{item.section_name}</option>)}
                  </select>
                </label>
              </div>
              <label>
                <input type="checkbox" checked={copyIncludeFriday} onChange={(event) => setCopyIncludeFriday(event.target.checked)} />{' '}Include Friday override
              </label>
              <button type="button" className="secondary-button" onClick={runCopyTimetable} disabled={copying}>{copying ? 'Copying...' : 'Copy Timetable'}</button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function PortalEmptyPage({ message }) {
  return <EmptyState message={message} />;
}
