import {
  emailTemplate,
  emailHeading,
  emailParagraph,
  emailButton,
  emailCard,
  emailDivider,
  emailMuted,
  escapeHtml,
  BRAND,
  type Lang,
} from './email-template';

export type AlertType = 'new_user' | 'content_report' | 'system';

interface AdminNotificationOptions {
  lang?: Lang;
  alertType: AlertType;
  title: string;
  message: string;
  details?: Record<string, string>;
  actionUrl?: string;
  actionLabel?: string;
  websiteUrl: string;
}

const COPY: Record<Lang, Record<AlertType, { subject: string; previewText: string; heading: string; badge: string; badgeColor: string; badgeBg: string }>> = {
  ar: {
    new_user: {
      subject: '🆕 مستخدم جديد — ف ذلكة',
      previewText: 'مستخدم جديد قد أنشأ حساباً على المنصة',
      heading: 'مستخدم جديد',
      badge: 'تسجيل جديد',
      badgeColor: '#166534',
      badgeBg: '#DCFCE7',
    },
    content_report: {
      subject: '⚠️ بلاغ محتوى — فذلكة',
      previewText: 'تم استلام بلاغ جديد حول محتوى',
      heading: 'بلاغ محتوى',
      badge: 'بلاغ جديد',
      badgeColor: '#9A3412',
      badgeBg: '#FFF7ED',
    },
    system: {
      subject: '🔧 تنبيه النظام — فذلكة',
      previewText: 'تنبيه هام يتعلق بالنظام',
      heading: 'تنبيه النظام',
      badge: 'نظام',
      badgeColor: '#1E40AF',
      badgeBg: '#EFF6FF',
    },
  },
  en: {
    new_user: {
      subject: '🆕 New User — Fazlaka',
      previewText: 'A new user has just registered on the platform',
      heading: 'New User',
      badge: 'NEW REGISTRATION',
      badgeColor: '#166534',
      badgeBg: '#DCFCE7',
    },
    content_report: {
      subject: '⚠️ Content Report — Fazlaka',
      previewText: 'A new content report has been received',
      heading: 'Content Report',
      badge: 'NEW REPORT',
      badgeColor: '#9A3412',
      badgeBg: '#FFF7ED',
    },
    system: {
      subject: '🔧 System Alert — Fazlaka',
      previewText: 'An important system alert',
      heading: 'System Alert',
      badge: 'SYSTEM',
      badgeColor: '#1E40AF',
      badgeBg: '#EFF6FF',
    },
  },
  fr: {
    new_user: {
      subject: '🆕 Nouvel utilisateur — Fazlaka',
      previewText: 'Un nouvel utilisateur vient de s\'inscrire sur la plateforme',
      heading: 'Nouvel utilisateur',
      badge: 'NOUVELLE INSCRIPTION',
      badgeColor: '#166534',
      badgeBg: '#DCFCE7',
    },
    content_report: {
      subject: '⚠️ Signalement de contenu — Fazlaka',
      previewText: 'Un nouveau signalement de contenu a été reçu',
      heading: 'Signalement de contenu',
      badge: 'NOUVEAU SIGNALEMENT',
      badgeColor: '#9A3412',
      badgeBg: '#FFF7ED',
    },
    system: {
      subject: '🔧 Alerte système — Fazlaka',
      previewText: 'Une alerte système importante',
      heading: 'Alerte système',
      badge: 'SYSTÈME',
      badgeColor: '#1E40AF',
      badgeBg: '#EFF6FF',
    },
  },
};

export function adminNotificationEmail(opts: AdminNotificationOptions) {
  const lang = opts.lang ?? 'en';
  const t = COPY[lang]?.[opts.alertType] ?? COPY.en[opts.alertType];

  let detailsHtml = '';
  if (opts.details && Object.keys(opts.details).length > 0) {
    const rows = Object.entries(opts.details)
      .map(
        ([key, val]) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-size:13px;color:#64748B;white-space:nowrap;vertical-align:top;width:140px">${escapeHtml(key)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-size:13px;color:#0F172A;font-weight:600;vertical-align:top">${escapeHtml(val)}</td>
        </tr>`,
      )
      .join('');

    detailsHtml = `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:16px 0;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden">
        ${rows}
      </table>
    `;
  }

  const bodyHtml = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px">
      <tr>
        <td>
          <span style="display:inline-block;background:${t.badgeBg};color:${t.badgeColor};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;padding:6px 12px;border-radius:6px">${escapeHtml(t.badge)}</span>
        </td>
      </tr>
    </table>

    ${emailHeading(t.heading, lang, { size: '20px' })}

    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;font-weight:600">
      ${escapeHtml(opts.title)}
    </p>

    <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#334155">
      ${escapeHtml(opts.message)}
    </p>

    ${detailsHtml}

    ${opts.actionUrl ? emailButton(opts.actionUrl, opts.actionLabel ?? (lang === 'ar' ? 'عرض التفاصيل' : lang === 'fr' ? 'Voir les détails' : 'View Details')) : ''}
  `;

  return emailTemplate({
    lang,
    subject: t.subject,
    previewText: t.previewText,
    bodyHtml,
  });
}
