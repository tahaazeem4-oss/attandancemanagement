/**
 * EduTrack Logo System
 *
 * LogoMark — the icon mark (checklist metaphor: two full white bars + one short bar + green dot)
 *   variant="blue"  → blue bg, white lines  (use on white/light backgrounds)
 *   variant="white" → white bg, blue lines  (use on dark/blue backgrounds)
 *   variant="glass" → glass bg, white lines (use on dark backgrounds, subtle)
 *
 * LogoHero — stacked layout (mark above wordmark) for auth screens
 */

import React from 'react';
import { View, Text } from 'react-native';

export function LogoMark({ size = 52, variant = 'blue' }) {
  const bg        = variant === 'white' ? '#fff'
                  : variant === 'glass' ? 'rgba(255,255,255,0.16)'
                  : '#2563EB';
  const lineColor = variant === 'blue'  ? '#fff' : '#2563EB';
  const dotColor  = '#22C55E';

  const r     = Math.round(size * 0.24);
  const lineH = Math.max(2, Math.round(size * 0.072));
  const lineW = Math.round(size * 0.46);
  const dotD  = Math.round(size * 0.162);
  const gap   = Math.round(size * 0.096);

  const shadow = variant === 'blue'
    ? { shadowColor: '#1E40AF', shadowOpacity: 0.40, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 10 }
    : variant === 'white'
    ? { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 }
    : {};

  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: bg,
                   justifyContent: 'center', alignItems: 'center', ...shadow }}>
      <View style={{ gap }}>
        {[0, 1, 2].map(i => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* Row line — row 2 is shorter (unfinished register) */}
            <View style={{
              width:           i === 2 ? Math.round(lineW * 0.50) : lineW,
              height:          lineH,
              backgroundColor: lineColor,
              opacity:         i === 2 ? 0.35 : 0.90,
              borderRadius:    lineH / 2,
            }} />
            {/* Green presence dot on last row = "checked / present" */}
            {i === 2 && (
              <View style={{
                width: dotD, height: dotD, borderRadius: dotD / 2,
                backgroundColor: dotColor,
                marginLeft: Math.round(size * 0.09),
              }} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Stacked hero block: large mark + app name + tagline
 * Used at the top of LoginScreen and SignUpScreen.
 */
export function LogoHero({ markSize = 72, nameColor = '#fff', tagColor = 'rgba(255,255,255,0.60)' }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <LogoMark size={markSize} variant="white" />
      <Text style={{
        fontSize: 28, fontWeight: '800', color: nameColor,
        marginTop: 14, letterSpacing: 0.3,
      }}>
        EduTrack
      </Text>
      <Text style={{
        fontSize: 13, color: tagColor,
        marginTop: 3, letterSpacing: 0.4, fontWeight: '500',
      }}>
        Smart Attendance System
      </Text>
    </View>
  );
}
