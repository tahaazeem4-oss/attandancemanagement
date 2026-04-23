// ─────────────────────────────────────────────────────────────
//  BRANDING CONFIG — edit this file to customise the app
// ─────────────────────────────────────────────────────────────
//
//  HOW TO REPLACE LOGO / BANNER:
//  1. Drop your image files into  frontend/assets/
//  2. Uncomment the require() lines below and comment out `null`
//
//  Example:
//    logo:   require('../../assets/logo.png'),
//    banner: require('../../assets/banner.png'),
// ─────────────────────────────────────────────────────────────

const branding = {
  // ── School identity ────────────────────────────────────────
  schoolName:    'Sunrise School',
  schoolTagline: 'Attendance Management System',
  schoolInitials:'SS',           // shown inside the logo placeholder

  // ── Colours ────────────────────────────────────────────────
  primaryColor:  '#2563EB',      // header / buttons
  accentColor:   '#1D4ED8',      // darker shade
  bannerBg:      ['#1E40AF', '#3B82F6'],  // gradient start → end

  // ── Images (set to null to show the built-in placeholder) ──
  logo:   null,                  // replace: require('../../assets/logo.png')
  banner: null,                  // replace: require('../../assets/banner.png')
};

export default branding;
