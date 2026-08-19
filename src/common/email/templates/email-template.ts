type Lang = 'ar' | 'en' | 'fr';

interface EmailTemplateOptions {
  lang?: Lang;
  subject: string;
  previewText: string;
  bodyHtml: string;
  preheaderOverride?: string;
}

const BRAND = {
  green: '#1B7A3D',
  greenLight: '#E8F5EC',
  greenDark: '#145F30',
  greenGradient: 'linear-gradient(135deg, #1B7A3D 0%, #22964C 100%)',
  dark: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  surface: '#F8FAFC',
  white: '#FFFFFF',
  danger: '#DC2626',
  warning: '#F59E0B',
};

const BRAND_NAME = {
  ar: 'فذلكة',
  en: 'Fazlaka',
  fr: 'Fazlaka',
};

const TAGLINE = {
  ar: 'أفلامك المفضلة، بطريقتك',
  en: 'Your favorite movies, your way',
  fr: 'Vos films préférés, à votre façon',
};

const FOOTER_TEXT = {
  ar: {
    ignore: 'إذا لم تطلب هذا الإجراء، يمكنك تجاهل هذه الرسالة بأمان.',
    rights: 'جميع الحقوق محفوظة',
    support: 'الدعم',
    privacy: 'سياسة الخصوصية',
  },
  en: {
    ignore: 'If you did not request this, you can safely ignore this email.',
    rights: 'All rights reserved',
    support: 'Support',
    privacy: 'Privacy Policy',
  },
  fr: {
    ignore: "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.",
    rights: 'Tous droits réservés',
    support: 'Support',
    privacy: 'Politique de confidentialité',
  },
};

export function emailTemplate(opts: EmailTemplateOptions): {
  html: string;
  text: string;
  subject: string;
} {
  const lang = opts.lang ?? 'ar';
  const isRtl = lang === 'ar';
  const dir = isRtl ? 'rtl' : 'ltr';
  const footer = FOOTER_TEXT[lang];
  const brandName = BRAND_NAME[lang];
  const tagline = TAGLINE[lang];
  const year = new Date().getFullYear();

  const preheader =
    opts.preheaderOverride ?? opts.previewText;

  const bodyHtml = opts.bodyHtml;

  const html = `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no" />
  <title>${escapeHtml(opts.subject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: ${BRAND.surface}; }

    /* Responsive */
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .fluid { max-width: 100% !important; height: auto !important; margin-left: auto !important; margin-right: auto !important; }
      .stack-column, .stack-column-center { display: block !important; width: 100% !important; max-width: 100% !important; }
      .stack-column-center { text-align: center !important; }
      .mobile-padding { padding-left: 16px !important; padding-right: 16px !important; }
      .mobile-hide { display: none !important; }
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      body { background-color: #1a1a2e !important; }
      .email-bg { background-color: #1a1a2e !important; }
      .email-card { background-color: #16213e !important; border-color: #1e3a5f !important; }
      .email-card * { color: #e2e8f0 !important; }
      .dark-text { color: #e2e8f0 !important; }
      .dark-muted { color: #94a3b8 !important; }
      .dark-border { border-color: #334155 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.surface};font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" class="email-bg">
  <!-- Preheader text (hidden) -->
  <div style="display:none;font-size:1px;color:${BRAND.surface};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">
    ${escapeHtml(preheader)}
  </div>
  <div style="display:none;font-size:1px;color:${BRAND.surface};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">
    &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${BRAND.surface}" class="email-bg">
    <tr>
      <td align="center" valign="top" style="padding:24px 8px">

        <!-- Email Container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;margin:auto" class="email-container">

          <!-- Brand Header -->
          <tr>
            <td align="center" style="padding:20px 0 24px">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding-right:${isRtl ? '0' : '8px'};padding-left:${isRtl ? '8px' : '0'}">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.greenGradient};border-radius:10px;width:36px;height:36px">
                      <tr>
                        <td align="center" valign="middle" style="font-size:18px;color:#fff;font-weight:800">
                          &#x1F3AC;
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td>
                    <span style="font-size:24px;font-weight:800;color:${BRAND.green};letter-spacing:-0.5px">${brandName}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${BRAND.white};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden" class="email-card">
                <!-- Green accent bar -->
                <tr>
                  <td style="background:${BRAND.greenGradient};height:4px;font-size:1px;line-height:1px">&nbsp;</td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding:36px 32px 32px" class="mobile-padding">
                    ${bodyHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 20px 12px;text-align:center">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding-bottom:16px">
                    <!-- Separator -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="60" style="margin:auto">
                      <tr>
                        <td style="border-top:1px solid ${BRAND.border};font-size:1px;line-height:1px">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${BRAND.muted}">
                ${footer.ignore}
              </p>
              <p style="margin:0 0 12px;font-size:13px;color:${BRAND.muted};letter-spacing:0.5px">
                ${tagline}
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:auto">
                <tr>
                  <td style="padding:0 8px">
                    <a href="mailto:support@fazlaka.app" style="font-size:12px;color:${BRAND.muted};text-decoration:underline">${footer.support}</a>
                  </td>
                  <td style="padding:0 8px;color:${BRAND.border}">|</td>
                  <td style="padding:0 8px">
                    <a href="https://fazlaka.app/privacy" style="font-size:12px;color:${BRAND.muted};text-decoration:underline">${footer.privacy}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0;font-size:11px;color:#CBD5E1">
                &copy; ${year} ${brandName}. ${footer.rights}.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Email Container -->

      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = stripHtml(bodyHtml);

  return { html, text, subject: opts.subject };
}

// ── Shared helpers ──────────────────────────────────────────────────

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Reusable component helpers ──────────────────────────────────────

export function emailHeading(
  text: string,
  lang: Lang,
  opts?: { icon?: string; size?: string; color?: string },
): string {
  const isRtl = lang === 'ar';
  const icon = opts?.icon ? `<span style="margin-${isRtl ? 'left' : 'right'}:10px">${opts.icon}</span>` : '';
  return `<h1 style="margin:0 0 16px;font-size:${opts?.size ?? '22px'};font-weight:800;color:${opts?.color ?? BRAND.dark};line-height:1.3;letter-spacing:-0.3px">${icon}${escapeHtml(text)}</h1>`;
}

export function emailParagraph(text: string, opts?: { muted?: boolean; center?: boolean }): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${opts?.muted ? BRAND.muted : '#334155'};${opts?.center ? 'text-align:center' : ''}">${text}</p>`;
}

export function emailButton(
  href: string,
  label: string,
  opts?: { fullWidth?: boolean; danger?: boolean },
): string {
  const bg = opts?.danger
    ? `background-color:${BRAND.danger}`
    : `background:${BRAND.greenGradient}`;
  const display = opts?.fullWidth ? 'display:block' : 'display:inline-block';
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0"${opts?.fullWidth ? ' width="100%"' : ''} style="margin:20px 0">
    <tr>
      <td align="center">
        <a href="${href}" style="${display};background:${BRAND.greenGradient};color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;${opts?.fullWidth ? 'width:100%;box-sizing:border-box;text-align:center;' : ''}box-shadow:0 4px 14px rgba(27,122,61,0.25)">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

export function emailOtpBox(otp: string, label: string): string {
  return `<div style="background:${BRAND.greenLight};border:1px solid #B7E4C7;border-radius:14px;padding:24px 16px;text-align:center;margin:20px 0">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:${BRAND.green};margin:0 0 12px;font-weight:700">${escapeHtml(label)}</div>
    <div style="font-size:34px;font-weight:800;letter-spacing:12px;color:${BRAND.greenDark};font-family:Consolas,Menlo,'Courier New',monospace">${otp}</div>
  </div>`;
}

export function emailCard(opts: {
  bg?: string;
  border?: string;
  children: string;
  title?: string;
  titleColor?: string;
}): string {
  return `<div style="background:${opts.bg ?? '#F8FAFC'};border:1px solid ${opts.border ?? BRAND.border};border-radius:14px;padding:20px;margin:20px 0">
    ${opts.title ? `<div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:${opts.titleColor ?? BRAND.green};margin:0 0 12px;font-weight:700">${escapeHtml(opts.title)}</div>` : ''}
    ${opts.children}
  </div>`;
}

export function emailDivider(): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0">
    <tr>
      <td style="border-top:1px solid ${BRAND.border};font-size:1px;line-height:1px">&nbsp;</td>
    </tr>
  </table>`;
}

export function emailMuted(text: string): string {
  return `<p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted}">${text}</p>`;
}

export { BRAND, BRAND_NAME, TAGLINE, FOOTER_TEXT };
export type { Lang };
