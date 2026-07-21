import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_SIMULATION_SETTINGS } from '@aviator/shared';

const prisma = new PrismaClient();

const SIM_NAMES = [
  'SkyPilot',
  'CloudRider',
  'NovaWing',
  'AeroAce',
  'JetSpark',
  'BlueHorizon',
  'ThunderBolt',
  'PixelPilot',
  'GlideForce',
  'StarDrift',
  'VaporTrail',
  'MachDemo',
  'OrbitKid',
  'TurboSim',
  'LumenAir',
  'FalconByte',
  'NimbusX',
  'CometLoop',
  'AetherBot',
  'ZenithSim',
];

async function main() {
  const adminHash = await bcrypt.hash('Admin123!', 10);
  const playerHash = await bcrypt.hash('Player123!', 10);

  // Player-facing currency is UGX (1:1 with virtualCredits ledger)
  await prisma.currency.upsert({
    where: { code: 'UGX' },
    update: {
      name: 'Ugandan Shilling (sim)',
      symbol: 'UGX',
      rateToVc: 1,
      decimals: 0,
      enabled: true,
      sortOrder: 0,
    },
    create: {
      code: 'UGX',
      name: 'Ugandan Shilling (sim)',
      symbol: 'UGX',
      rateToVc: 1,
      decimals: 0,
      enabled: true,
      sortOrder: 0,
    },
  });
  await prisma.currency.upsert({
    where: { code: 'VC' },
    update: { enabled: false, sortOrder: 99 },
    create: {
      code: 'VC',
      name: 'Virtual Credits (legacy)',
      symbol: 'VC',
      rateToVc: 1,
      decimals: 0,
      enabled: false,
      sortOrder: 99,
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@aviator.local' },
    update: {
      passwordHash: adminHash,
      displayName: 'Admin',
      role: Role.ADMIN,
      preferredCurrency: 'UGX',
    },
    create: {
      email: 'admin@aviator.local',
      passwordHash: adminHash,
      displayName: 'Admin',
      role: Role.ADMIN,
      virtualCredits: 100000,
      preferredCurrency: 'UGX',
      clientSeed: 'aviator-default-client',
    },
  });

  await prisma.user.upsert({
    where: { email: 'player@aviator.local' },
    update: {
      passwordHash: playerHash,
      displayName: 'Demo Player',
      role: Role.USER,
      preferredCurrency: 'UGX',
    },
    create: {
      email: 'player@aviator.local',
      passwordHash: playerHash,
      displayName: 'Demo Player',
      role: Role.USER,
      virtualCredits: 10000,
      preferredCurrency: 'UGX',
      clientSeed: 'aviator-default-client',
    },
  });

  // Existing users: switch display currency to UGX
  await prisma.user.updateMany({
    data: { preferredCurrency: 'UGX' },
  });

  await prisma.simulationConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      settings: JSON.parse(JSON.stringify(DEFAULT_SIMULATION_SETTINGS)),
    },
  });

  const existing = await prisma.simulatedPlayer.count();
  if (existing === 0) {
    await prisma.simulatedPlayer.createMany({
      data: SIM_NAMES.map((name, i) => ({
        name,
        avatarHue: (i * 37) % 360,
        active: true,
      })),
    });
  }

  console.log('Seed complete: admin@aviator.local / Admin123!, player@aviator.local / Player123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
