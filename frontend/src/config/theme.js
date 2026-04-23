// ─────────────────────────────────────────────────────────────
//  App Design System — edit here to retheme the whole app
// ─────────────────────────────────────────────────────────────

export const C = {
  // Backgrounds
  bg:           '#F0F4FF',   // page background (light indigo tint)
  card:         '#FFFFFF',
  cardAlt:      '#F8FAFF',

  // Brand
  primary:      '#4F46E5',   // indigo-600
  primaryDark:  '#3730A3',   // indigo-800
  primaryLight: '#EEF2FF',   // indigo-50
  accent:       '#06B6D4',   // cyan-500

  // Header / Banner
  headerBg:     '#1E1B4B',   // indigo-950
  headerText:   '#E0E7FF',
  headerSub:    '#818CF8',

  // Text
  textDark:     '#0F172A',   // slate-900
  textMed:      '#475569',   // slate-600
  textLight:    '#94A3B8',   // slate-400

  // Borders
  border:       '#E2E8F0',   // slate-200
  borderFocus:  '#4F46E5',

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
  shadow:       '#4F46E5',
};

export const S = {
  // Shared style fragments
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#F8FAFF',
    fontSize: 15,
    color: '#0F172A',
    marginBottom: 4,
  },
  inputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    marginLeft: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  btn: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.35,
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
