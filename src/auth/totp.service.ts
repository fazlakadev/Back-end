import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as qrcode from 'qrcode';

@Injectable()
export class TotpService {
  generateSecret(): string {
    return generateSecret();
  }

  buildAuthUrl(secret: string, account: string, issuer: string): string {
    return generateURI({ issuer, label: account, secret });
  }

  async qrDataUrl(otpauthUrl: string): Promise<string> {
    return qrcode.toDataURL(otpauthUrl, {
      margin: 1,
      width: 260,
      errorCorrectionLevel: 'M',
    });
  }

  verify(secret: string, code: string): boolean {
    const value = String(code ?? '').trim();
    if (!/^\d{6}$/.test(value)) return false;
    try {
      const res = verifySync({ token: value, secret, epochTolerance: 30 });
      return res.valid === true;
    } catch {
      return false;
    }
  }
}
