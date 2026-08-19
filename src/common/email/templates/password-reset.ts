import {
  emailTemplate,
  emailHeading,
  emailParagraph,
  emailButton,
  emailOtpBox,
  emailCard,
  emailDivider,
  emailMuted,
  escapeHtml,
  BRAND,
  type Lang,
} from './email-template';

interface PasswordResetEmailOptions {
  lang?: Lang;
  userName: string;
  resetLink: string;
  otp: string;
  websiteUrl: string;
}

const COPY = {
  ar: {
    subject: 'إعادة تعيين كلمة المرور — فذلكة',
    previewText: 'تم طلب إعادة تعيين كلمة المرور لحسابك. استخدم الكود أو الزر أدناه.',
    heading: 'إعادة تعيين كلمة المرور',
    intro: 'تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك في فذلكة. استخدم الكود التالي أو الزر السريع لإنشاء كلمة مرور جديدة.',
    codeLabel: 'رمز التحقق',
    expires: '⏰ هذا الرابط والكود صالحان لمدة <strong>30 دقيقة</strong> فقط.',
    securityTitle: 'تنبيه أمني',
    securityNote: 'إذا لم تطلب إعادة تعيين كلمة المرور، لا تقم باتخاذ أي إجراء. سيتم تجاهل هذه الرسالة تلقائياً وسيبقى حسابك آمناً.',
    dangerNote: '⚠️ تأكد من أنك لا تشارك هذا الرمز مع أي شخص آخر.',
    footer: 'نتمنى لك أماناً دائماً.',
  },
  en: {
    subject: 'Reset your password — Fazlaka',
    previewText: 'A password reset was requested for your account. Use the code or button below.',
    heading: 'Reset Your Password',
    intro: 'We received a request to reset the password for your Fazlaka account. Use the code below or the quick link to create a new password.',
    codeLabel: 'Verification Code',
    expires: '⏰ This link and code are valid for <strong>30 minutes</strong> only.',
    securityTitle: 'Security Notice',
    securityNote: "If you did not request a password reset, take no action. This message will be ignored automatically and your account will remain secure.",
    dangerNote: '⚠️ Make sure you do not share this code with anyone else.',
    footer: 'Wishing you safety always.',
  },
  fr: {
    subject: 'Réinitialisez votre mot de passe — Fazlaka',
    previewText: 'Une réinitialisation de mot de passe a été demandée. Utilisez le code ou le bouton ci-dessous.',
    heading: 'Réinitialisez votre mot de passe',
    intro: "Nous avons reçu une demande de réinitialisation du mot de passe de votre compte Fazlaka. Utilisez le code ci-dessous ou le lien rapide pour créer un nouveau mot de passe.",
    codeLabel: 'Code de vérification',
    expires: '⏰ Ce lien et ce code sont valides pendant <strong>30 minutes</strong> uniquement.',
    securityTitle: 'Avis de sécurité',
    securityNote: "Si vous n'avez pas demandé de réinitialisation, ne faites rien. Ce message sera ignoré automatiquement et votre compte restera sécurisé.",
    dangerNote: '⚠️ Assurez-vous de ne pas partager ce code avec qui que ce soit.',
    footer: 'Nous vous souhaitons une sécurité permanente.',
  },
};

export function passwordResetEmail(opts: PasswordResetEmailOptions) {
  const lang = opts.lang ?? 'ar';
  const t = COPY[lang] ?? COPY.en;

  const bodyHtml = `
    ${emailHeading(t.heading, lang, { icon: '🔐' })}

    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155">
      ${escapeHtml(t.intro)}
    </p>

    ${emailOtpBox(opts.otp, t.codeLabel)}

    ${emailButton(opts.resetLink, lang === 'ar' ? 'إعادة تعيين كلمة المرور' : lang === 'fr' ? 'Réinitialiser le mot de passe' : 'Reset Password', { fullWidth: true })}

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0">
      <tr>
        <td align="center" style="font-size:13px;color:#64748B;line-height:1.6">
          ${t.expires}
        </td>
      </tr>
    </table>

    ${emailDivider()}

    ${emailCard({
      bg: '#FEF3C7',
      border: '#FDE68A',
      title: t.securityTitle,
      titleColor: '#D97706',
      children: `
        <p style="margin:0 0 8px;font-size:13px;line-height:1.7;color:#92400E">${escapeHtml(t.securityNote)}</p>
        <p style="margin:0;font-size:13px;line-height:1.7;color:#92400E">${escapeHtml(t.dangerNote)}</p>
      `,
    })}
  `;

  return emailTemplate({
    lang,
    subject: t.subject,
    previewText: t.previewText,
    bodyHtml,
  });
}
