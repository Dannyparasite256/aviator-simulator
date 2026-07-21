import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { Decimal } from '@prisma/client/runtime/library';
import { WalletRequestStatus, WalletRequestType } from '@prisma/client';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async listCurrencies() {
    return this.prisma.currency.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getWallet(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    const currencies = await this.listCurrencies();
    const preferred =
      currencies.find((c) => c.code === user.preferredCurrency) ??
      currencies.find((c) => c.code === 'UGX') ??
      currencies.find((c) => c.code === 'USD') ??
      currencies[0];
    const vc = Number(user.virtualCredits);
    const rate = preferred ? Number(preferred.rateToVc) : 1;
    const displayBalance = rate > 0 ? Math.round((vc / rate) * 1e8) / 1e8 : vc;

    const pending = await this.prisma.walletRequest.count({
      where: { userId, status: 'PENDING' },
    });

    return {
      disclaimer:
        'Simulation wallet only. Virtual credits — no real money, deposits, or bank transfers.',
      virtualCredits: vc,
      preferredCurrency: preferred?.code ?? 'VC',
      display: preferred
        ? {
            code: preferred.code,
            symbol: preferred.symbol,
            amount: displayBalance,
            rateToVc: rate,
          }
        : null,
      currencies: currencies.map((c) => ({
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        rateToVc: Number(c.rateToVc),
        decimals: c.decimals,
        balanceInCurrency:
          Number(c.rateToVc) > 0
            ? Math.round((vc / Number(c.rateToVc)) * 1e8) / 1e8
            : vc,
      })),
      pendingRequests: pending,
      user: this.auth.toPublic(user),
    };
  }

  async setPreferredCurrency(userId: string, code: string) {
    const cur = await this.prisma.currency.findFirst({
      where: { code, enabled: true },
    });
    if (!cur) throw new BadRequestException('Currency not available');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { preferredCurrency: code },
    });
    return this.auth.toPublic(user);
  }

  async createRequest(
    userId: string,
    dto: {
      type: 'DEPOSIT' | 'WITHDRAW';
      currencyCode: string;
      amountCurrency: number;
      note?: string;
    },
  ) {
    if (dto.amountCurrency <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
    const cur = await this.prisma.currency.findFirst({
      where: { code: dto.currencyCode, enabled: true },
    });
    if (!cur) throw new BadRequestException('Invalid currency');

    const rate = Number(cur.rateToVc);
    let amountVc = Math.round(dto.amountCurrency * rate * 100) / 100;
    if (amountVc < 1) throw new BadRequestException('Amount too small');

    // Cap virtual credits per request (simulation safety)
    const MAX_VC_PER_REQUEST = 1_000_000;
    if (amountVc > MAX_VC_PER_REQUEST) {
      throw new BadRequestException(
        `Max ${MAX_VC_PER_REQUEST.toLocaleString()} VC per request (got ${amountVc.toLocaleString()} VC). Use a smaller amount.`,
      );
    }

    if (dto.type === 'WITHDRAW') {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || Number(user.virtualCredits) < amountVc) {
        throw new BadRequestException('Insufficient virtual credits');
      }
      // Hold funds while pending
      await this.prisma.user.update({
        where: { id: userId },
        data: { virtualCredits: { decrement: amountVc } },
      });
    }

    const req = await this.prisma.walletRequest.create({
      data: {
        userId,
        type: dto.type as WalletRequestType,
        currencyCode: dto.currencyCode,
        amountCurrency: new Decimal(dto.amountCurrency),
        amountVc: new Decimal(amountVc),
        note: dto.note?.slice(0, 500),
        status: 'PENDING',
      },
    });

    await this.notify(
      userId,
      `${dto.type === 'DEPOSIT' ? 'Deposit' : 'Withdraw'} request submitted`,
      `${dto.amountCurrency} ${dto.currencyCode} (~${amountVc} VC) is pending admin review. Virtual simulation only.`,
    );

    return this.mapRequest(req);
  }

  async myRequests(userId: string) {
    const rows = await this.prisma.walletRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.mapRequest(r));
  }

  async cancelRequest(userId: string, id: string) {
    const req = await this.prisma.walletRequest.findUnique({ where: { id } });
    if (!req || req.userId !== userId) throw new NotFoundException();
    if (req.status !== 'PENDING') {
      throw new BadRequestException('Only pending requests can be cancelled');
    }
    if (req.type === 'WITHDRAW') {
      // Release hold
      await this.prisma.user.update({
        where: { id: userId },
        data: { virtualCredits: { increment: Number(req.amountVc) } },
      });
    }
    const updated = await this.prisma.walletRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    return this.mapRequest(updated);
  }

  async adminList(status?: WalletRequestStatus) {
    const rows = await this.prisma.walletRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, email: true, displayName: true, virtualCredits: true } },
      },
    });
    return rows.map((r) => ({
      ...this.mapRequest(r),
      user: {
        id: r.user.id,
        email: r.user.email,
        displayName: r.user.displayName,
        virtualCredits: Number(r.user.virtualCredits),
      },
    }));
  }

  /** Admin grants virtual credits directly (no request required). */
  async adminGrantCredits(
    adminId: string,
    userId: string,
    amountVc: number,
    note?: string,
  ) {
    if (amountVc <= 0 || amountVc > 1_000_000) {
      throw new BadRequestException('Grant amount must be 1–1,000,000 VC');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { virtualCredits: { increment: amountVc } },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'wallet.grant',
        resource: 'user',
        details: { userId, amountVc, note: note ?? null },
      },
    });

    await this.notify(
      userId,
      'Virtual funds granted',
      `Admin credited +${amountVc} VC. ${note ?? ''} (Simulation only)`,
    );

    return {
      userId,
      granted: amountVc,
      virtualCredits: Number(updated.virtualCredits),
      note: note ?? null,
    };
  }

  async adminListUsers(q?: string) {
    return this.prisma.user.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: {
        id: true,
        email: true,
        displayName: true,
        virtualCredits: true,
        role: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async adminReview(
    adminId: string,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    adminNote?: string,
  ) {
    const req = await this.prisma.walletRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException();
    if (req.status !== 'PENDING') {
      throw new BadRequestException('Request already reviewed');
    }

    if (decision === 'APPROVED') {
      if (req.type === 'DEPOSIT') {
        await this.prisma.user.update({
          where: { id: req.userId },
          data: { virtualCredits: { increment: Number(req.amountVc) } },
        });
      }
      // WITHDRAW already held — keep deducted
    } else {
      // REJECTED
      if (req.type === 'WITHDRAW') {
        await this.prisma.user.update({
          where: { id: req.userId },
          data: { virtualCredits: { increment: Number(req.amountVc) } },
        });
      }
    }

    const updated = await this.prisma.walletRequest.update({
      where: { id },
      data: {
        status: decision,
        adminNote: adminNote?.slice(0, 500),
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: `wallet.${decision.toLowerCase()}`,
        resource: 'wallet_request',
        details: {
          requestId: id,
          type: req.type,
          amountVc: Number(req.amountVc),
          userId: req.userId,
        },
      },
    });

    await this.notify(
      req.userId,
      `Wallet ${req.type.toLowerCase()} ${decision.toLowerCase()}`,
      decision === 'APPROVED'
        ? `Your ${req.type.toLowerCase()} of ${Number(req.amountVc)} VC was approved. (Virtual simulation)`
        : `Your ${req.type.toLowerCase()} was rejected. ${adminNote ?? ''} Funds returned if held.`,
    );

    return this.mapRequest(updated);
  }

  async redeemPromo(userId: string, code: string) {
    const promo = await this.prisma.promoCode.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!promo || !promo.active) throw new BadRequestException('Invalid promo code');
    if (promo.expiresAt && promo.expiresAt < new Date()) {
      throw new BadRequestException('Promo expired');
    }
    if (promo.usedCount >= promo.maxUses) {
      throw new BadRequestException('Promo fully redeemed');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.promoRedemption.create({
          data: {
            promoId: promo.id,
            userId,
            bonusVc: promo.bonusVc,
          },
        });
        await tx.promoCode.update({
          where: { id: promo.id },
          data: { usedCount: { increment: 1 } },
        });
        await tx.user.update({
          where: { id: userId },
          data: { virtualCredits: { increment: Number(promo.bonusVc) } },
        });
      });
    } catch {
      throw new BadRequestException('Promo already used on this account');
    }

    await this.notify(
      userId,
      'Promo redeemed',
      `+${Number(promo.bonusVc)} virtual credits from ${promo.code}`,
    );

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return {
      bonusVc: Number(promo.bonusVc),
      virtualCredits: Number(user?.virtualCredits ?? 0),
      code: promo.code,
    };
  }

  async createPromo(adminId: string, data: { code: string; bonusVc: number; maxUses?: number }) {
    const promo = await this.prisma.promoCode.create({
      data: {
        code: data.code.trim().toUpperCase(),
        bonusVc: new Decimal(data.bonusVc),
        maxUses: data.maxUses ?? 100,
        active: true,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'promo.create',
        resource: 'promo_code',
        details: { code: promo.code, bonusVc: data.bonusVc },
      },
    });
    return promo;
  }

  async listPromos() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async notifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
  }

  async markRead(userId: string, id?: string) {
    if (id) {
      await this.prisma.notification.updateMany({
        where: { id, userId },
        data: { read: true },
      });
    } else {
      await this.prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
      });
    }
    return { ok: true };
  }

  async unreadCount(userId: string) {
    const n = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    return { count: n };
  }

  private async notify(userId: string, title: string, body: string) {
    await this.prisma.notification.create({
      data: { userId, title, body },
    });
  }

  private mapRequest(r: {
    id: string;
    type: WalletRequestType;
    status: WalletRequestStatus;
    currencyCode: string;
    amountCurrency: { toString(): string } | number;
    amountVc: { toString(): string } | number;
    note: string | null;
    adminNote: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      currencyCode: r.currencyCode,
      amountCurrency: Number(r.amountCurrency),
      amountVc: Number(r.amountVc),
      note: r.note,
      adminNote: r.adminNote,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      disclaimer: 'Virtual simulation request — not real money',
    };
  }
}
