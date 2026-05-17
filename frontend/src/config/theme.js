// ─────────────────────────────────────────────────────────────
//  App Design System — edit here to retheme the whole app
//  Design: clean, minimal, premium (Notion / Stripe inspired)
//  Primary: header-aligned brand blue  Background: #F8FAFC  Cards: #FFFFFF
// ─────────────────────────────────────────────────────────────

export const C = {
  // Backgrounds
  bg:           '#F8FAFC',   // slate-50 — main page background
  card:         '#FFFFFF',
  cardAlt:      '#F1F5F9',   // slate-100

  // Brand — button/action blue aligned with the shared header family
  primary:      '#1D4ED8',   // brand-mid
  primaryDark:  '#0F172A',   // brand-deep
  primaryLight: '#EAF2FF',   // softened header-tint surface
  accent:       '#0EA5E9',   // sky-500

  // Header gradient endpoints
  headerBg:     '#1E40AF',   // blue-800
  headerText:   '#EFF6FF',   // blue-50
  headerSub:    '#93C5FD',   // blue-300
  brandDeep:    '#0F172A',
  brandMid:     '#1D4ED8',
  brandBright:  '#2563EB',
  brandSoft:    '#60A5FA',
  footerBg:     '#0F172A',
  footerActive: 'rgba(96,165,250,0.24)',
  footerIdle:   'rgba(219,234,254,0.58)',

  // Text scale (slate family)
  text:         '#1E293B',   // slate-800
  textDark:     '#0F172A',   // slate-900
  textMed:      '#475569',   // slate-600
  textLight:    '#94A3B8',   // slate-400

  // Borders
  border:       '#E2E8F0',   // slate-200
  borderFocus:  '#1D4ED8',

  // Status
  present:      '#10B981',   // emerald-500
  presentBg:    '#ECFDF5',
  absent:       '#EF4444',   // red-500
  absentBg:     '#FEF2F2',
  leave:        '#F59E0B',   // amber-500
  leaveBg:      '#FFFBEB',

  // Utility
  error:        '#EF4444',
  errorBg:      '#FEF2F2',
  success:      '#10B981',
  white:        '#FFFFFF',
  shadow:       '#64748B',   // neutral slate shadow (not colored)
};

C.brandGradient = [C.brandDeep, C.brandMid, C.brandBright];
C.brandGradientSoft = [C.headerBg, C.brandBright, C.brandSoft];

export const S = {
  // Shared style fragments — use these across all screens for consistency
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#64748B',
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#F8FAFC',
    fontSize: 15,
    color: '#0F172A',
    marginBottom: 4,
  },
  inputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
    marginLeft: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  btn: {
    backgroundColor: '#1D4ED8',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginBottom: 10,
    marginLeft: 4,
  },
};
