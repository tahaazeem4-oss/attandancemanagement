export function buildImportExportScope({
  mode,
  campusId,
  requireCampusForScopedRoles = true,
}) {
  const isScopedRole = mode === 'orgadmin' || mode === 'superadmin';
  const hasCampus = !!campusId;

  return {
    isScopedRole,
    hasCampus,
    params: hasCampus ? { campus_id: campusId } : {},
    showBar: !isScopedRole || !requireCampusForScopedRoles || hasCampus,
  };
}

export function getImportExportBase(mode) {
  return mode === 'orgadmin' ? '/org-admin/import-export' : '/import-export';
}